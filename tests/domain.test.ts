import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion,validateMarking,blankAnswerMarking,publicQuestion,calculate,AssessmentError } from '../src/domain/assessment.ts';
import { aggregatePerformance,recommend,type PerformanceRecord } from '../src/domain/analytics.ts';
import { similarity,originalityScreen } from '../src/domain/originality.ts';
import { UploadSchema,objectKey,ownsKey,safeRedirect,sameOrigin,fileMagic,isTimeZone } from '../src/domain/security.ts';
import { assertMockReady,examDeadline,examExpired,type Blueprint,type MockQuestion } from '../src/domain/mocks.ts';
import { question,topic,verification,marking,ANSWER,TOPIC } from './fixtures.ts';

const rejectsQuestion=(mutate:(q:ReturnType<typeof question>)=>void)=>{const q=question();mutate(q);assert.throws(()=>validateQuestion(q,topic(),verification()),AssessmentError);};
test('a structurally and numerically valid synthetic question passes',()=>assert.equal(validateQuestion(question(),topic(),verification(),2).marks,2));
test('unverified curriculum fails closed',()=>assert.throws(()=>validateQuestion(question(),{...topic(),verified:false},verification())));
test('topic groups cannot substitute for objective leaves',()=>assert.throws(()=>validateQuestion(question(),{...topic(),kind:'group'},verification())));
test('subject mismatch is rejected',()=>rejectsQuestion(q=>{q.subject_code='4CH1';}));
test('reference mismatch is rejected',()=>rejectsQuestion(q=>{q.specification_reference='OTHER';}));
test('requested marks are enforced',()=>assert.throws(()=>validateQuestion(question(),topic(),verification(),3)));
test('mark allocations must sum exactly',()=>rejectsQuestion(q=>{q.criteria[0].marks=2;}));
test('duplicate criterion keys are rejected',()=>rejectsQuestion(q=>{q.criteria[1].key='M1';}));
test('ECF eligibility requires an explicit rule',()=>rejectsQuestion(q=>{q.criteria[0].allow_ecf=true;}));
test('independent verifier cannot be the generator model',()=>assert.throws(()=>validateQuestion(question(),topic(),{...verification(),model:'fixture-generator'})));
for(const key of ['scientific_status','mark_scheme_status','originality_status'] as const)test(`${key} uncertainty requires review`,()=>assert.throws(()=>validateQuestion(question(),topic(),{...verification(),[key]:'uncertain'})));
test('calculation without a deterministic check requires review',()=>rejectsQuestion(q=>{q.numerical_checks=[];}));
test('incorrect numerical answer is rejected',()=>rejectsQuestion(q=>{q.numerical_checks[0].expected=7;}));
test('oversized tolerance cannot hide an incorrect answer',()=>rejectsQuestion(q=>{q.numerical_checks[0].expected=7;q.numerical_checks[0].absolute_tolerance=10;}));
test('division by zero is rejected',()=>assert.throws(()=>calculate({operation:'divide',inputs:[1,0],expected:0,absolute_tolerance:0,unit:'ratio'})));
test('ragged tables are rejected',()=>rejectsQuestion(q=>{q.structured_content=[{kind:'table',caption:'Test',headers:['A','B'],rows:[['only one']]}];}));
test('multiple choice requires four options, one mark and a valid answer',()=>rejectsQuestion(q=>{q.format='multiple_choice';}));
test('unknown model fields are rejected by the strict schema',()=>assert.throws(()=>validateQuestion({...question(),system_override:'ignore checks'},topic(),verification())));
test('active question DTO does not disclose solutions or correct choice',()=>{const dto=publicQuestion(question(),'q');for(const key of ['model_answer','criteria','correct_choice_id','examiner_explanation','numerical_checks'])assert.equal(key in dto,false);});
test('mark totals are derived from criterion awards and labelled unofficial',()=>{const r=validateMarking(question().criteria,ANSWER,marking(),marking());assert.equal(r.earned_marks,2);assert.equal(r.available_marks,2);assert.equal(r.official_pearson_mark,false);});
for(const [label,mutate] of [
 ['overaward',(m:ReturnType<typeof marking>)=>{m.awards[0].marks=2;}],
 ['unknown criterion',(m:ReturnType<typeof marking>)=>{m.awards[0].criterion_key='UNKNOWN';}],
 ['missing award',(m:ReturnType<typeof marking>)=>{m.awards.pop();}],
 ['duplicate award',(m:ReturnType<typeof marking>)=>{m.awards[1].criterion_key='M1';}],
 ['invented evidence',(m:ReturnType<typeof marking>)=>{m.awards[1].evidence='This was never written';}],
 ['empty evidence',(m:ReturnType<typeof marking>)=>{m.awards[1].evidence='  ';}],
 ['unpermitted ECF',(m:ReturnType<typeof marking>)=>{m.awards[1].ecf=true;}],
 ['low confidence',(m:ReturnType<typeof marking>)=>{m.confidence=0.4;}]
] as const)test(`marking rejects ${label}`,()=>{const m=marking();mutate(m);assert.throws(()=>validateMarking(question().criteria,ANSWER,m,marking()));});
test('independent marking disagreement requires review',()=>{const r=marking();r.awards[1].marks=0;assert.throws(()=>validateMarking(question().criteria,ANSWER,marking(),r));});
test('independent reviewer evidence is checked too',()=>{const r=marking();r.awards[1].evidence='invented';assert.throws(()=>validateMarking(question().criteria,ANSWER,marking(),r));});
test('eligible explained ECF can pass structural validation',()=>{const c=question().criteria;c[1].allow_ecf=true;c[1].ecf_rule='Use an earlier candidate value consistently in this calculation.';const m=marking();m.awards[1].ecf=true;m.awards[1].explanation='Consistent use of the candidate value satisfies the stated ECF rule.';assert.equal(validateMarking(c,ANSWER,m,m).earned_marks,2);});
test('blank answers get deterministic zeros without invented misconceptions',()=>{const m=blankAnswerMarking(question().criteria);const r=validateMarking(question().criteria,'',m,m);assert.equal(r.earned_marks,0);assert.deepEqual(r.misconceptions,[]);});

const record=(id:string,earned:number,available:number,extra:Partial<PerformanceRecord>={}):PerformanceRecord=>({attempt_id:id,topic_id:TOPIC,earned,available,seconds:20,submitted_at:`2026-11-0${id}T12:00:00Z`,misconceptions:[],accepted_validated:true,...extra});
test('analytics is marks-weighted, not an average of percentages',()=>{const [r]=aggregatePerformance([record('1',1,1),record('2',1,9)],[TOPIC]);assert.equal(r.accuracy,0.2);assert.equal(r.earned,2);assert.equal(r.available,10);});
test('no-data accuracy and improvement are null',()=>{const [r]=aggregatePerformance([],[TOPIC]);assert.equal(r.accuracy,null);assert.equal(r.improvement,null);assert.equal(r.attempts,0);});
test('unaccepted results are excluded',()=>assert.equal(aggregatePerformance([record('1',1,1,{accepted_validated:false})],[TOPIC])[0].attempts,0));
test('duplicate accepted attempts cannot inflate progress',()=>assert.throws(()=>aggregatePerformance([record('1',1,1),record('1',1,1)],[TOPIC])));
test('invalid marks cannot enter analytics',()=>assert.throws(()=>aggregatePerformance([record('1',2,1)],[TOPIC])));
test('improvement uses at least four real attempts',()=>{const p=aggregatePerformance([record('1',0,2),record('2',0,2),record('3',2,2),record('4',2,2)],[TOPIC])[0];assert.equal(p.improvement,1);});
test('repeated mistakes count attempts rather than duplicate tags',()=>{const p=aggregatePerformance([record('1',0,2,{misconceptions:['units','units']}),record('2',1,2,{misconceptions:['units']})],[TOPIC])[0];assert.equal(p.mistakes[0].count,2);});
test('unassessed recommendations are diagnostic, not alleged weaknesses',()=>{const r=recommend(aggregatePerformance([],[TOPIC]))[0];assert.equal(r.kind,'diagnostic');assert.equal(r.sample_size,0);});
test('targeted recommendations include actual mark/sample evidence',()=>{const r=recommend(aggregatePerformance([record('1',1,2)],[TOPIC]))[0];assert.match(r.reason,/1\/2 marks/);assert.equal(r.sample_size,1);});
test('exact copied questions fail private-corpus screening',()=>{const q=question().prompt;assert.equal(similarity(q,q),1);assert.equal(originalityScreen(q,[q]).passed,false);});
test('screening discloses its limited comparison corpus',()=>{const r=originalityScreen('A different original educational scenario.',[]);assert.equal(r.compared_sources,0);assert.match(r.limitation,/cannot certify/);});

const USER='20000000-0000-4000-8000-000000000001',DOC='30000000-0000-4000-8000-000000000001';
test('storage paths are server-derived, not filename-derived',()=>assert.equal(objectKey(USER,DOC,'application/pdf'),`${USER}/${DOC}/original.pdf`));
test('cross-user or traversal storage keys are rejected',()=>{assert.equal(ownsKey(USER,`other/${DOC}/original.pdf`),false);assert.equal(ownsKey(USER,`${USER}/../secret`),false);assert.equal(ownsKey(USER,`${USER}/%2e%2e/secret`),false);});
test('uploads require a rights attestation',()=>assert.equal(UploadSchema.safeParse({subject_code:'4PH1',kind:'paper',file_name:'a.pdf',mime_type:'application/pdf',byte_size:100,rights_attested:false}).success,false));
test('uploads over 25 MiB are rejected',()=>assert.equal(UploadSchema.safeParse({subject_code:'4PH1',kind:'paper',file_name:'a.pdf',mime_type:'application/pdf',byte_size:26214401,rights_attested:true}).success,false));
for(const path of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/%252f%252fevil.example','/\n/evil.example'])test(`unsafe redirect ${JSON.stringify(path)} is rejected`,()=>assert.equal(safeRedirect(path),'/dashboard'));
test('safe relative redirects remain usable',()=>assert.equal(safeRedirect('/subjects?code=4PH1'),'/subjects?code=4PH1'));
test('cross-origin state changes fail the origin check',()=>{assert.equal(sameOrigin('https://evil.example','https://app.example'),false);assert.equal(sameOrigin(null,'https://app.example'),false);assert.equal(sameOrigin('https://app.example','https://app.example'),true);});
test('MIME alone is insufficient; initial file magic is checked',()=>{assert.equal(fileMagic(new TextEncoder().encode('not a PDF'),'application/pdf'),false);assert.equal(fileMagic(new TextEncoder().encode('%PDF-1.7'),'application/pdf'),true);});
test('time-zone preferences validate against the runtime IANA database',()=>{assert.equal(isTimeZone('Europe/London'),true);assert.equal(isTimeZone('Not/AZone'),false);});

const blueprint=():Blueprint=>({id:'test',subject_code:'4PH1',specification_id:'spec',total_marks:110,duration_minutes:120,core_only:true,verified_at:'2026-11-09T20:12:06Z'});
const mockQuestions=():MockQuestion[]=>Array.from({length:10},(_,i)=>({id:`q${i}`,user_id:USER,subject_code:'4PH1',marks:11,validation_status:'validated',topic:{specification_id:'spec',kind:'objective',scope:'core',verified:true}}));
test('a complete eligible 110-mark mock passes',()=>assert.doesNotThrow(()=>assertMockReady(blueprint(),mockQuestions(),USER)));
test('mock totals are exact',()=>{const q=mockQuestions();q[0].marks=10;assert.throws(()=>assertMockReady(blueprint(),q,USER));});
test('paper 1 excludes extension objectives',()=>{const q=mockQuestions();q[0].topic.scope='extended';assert.throws(()=>assertMockReady(blueprint(),q,USER));});
test('paper 1 cannot treat mixed topic groups as core leaves',()=>{const q=mockQuestions();q[0].topic.kind='group';q[0].topic.scope='mixed';assert.throws(()=>assertMockReady(blueprint(),q,USER));});
test('mock questions must belong to the learner',()=>{const q=mockQuestions();q[0].user_id='other';assert.throws(()=>assertMockReady(blueprint(),q,USER));});
test('mock questions cannot be duplicated',()=>{const q=mockQuestions();q[1].id=q[0].id;assert.throws(()=>assertMockReady(blueprint(),q,USER));});
test('unverified blueprints cannot be used',()=>assert.throws(()=>assertMockReady({...blueprint(),verified_at:null},mockQuestions(),USER)));
test('extra-time deadline calculation is deterministic',()=>assert.equal(examDeadline('2026-11-09T12:00:00Z',75,25),'2026-11-09T13:33:45.000Z'));
test('deadline equality is expired and invalid clocks fail closed',()=>{assert.equal(examExpired('2026-11-09T12:00:00Z',new Date('2026-11-09T12:00:00Z')),true);assert.equal(examExpired('bad',new Date()),true);});
