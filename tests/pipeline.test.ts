import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuestion,markAnswer,extractDocument,type ModelCall,type ModelTask,type GenerationRequest } from '../src/ai/pipeline.ts';
import { selectExactMarks,availableMarks } from '../src/domain/mock-builder.ts';
import { question,topic,marking,ANSWER } from './fixtures.ts';
// Stub model calls only. No live AI service is contacted and no output here is shown to learners.
const content=()=>{const {subject_code:_s,topic_id:_t,specification_reference:_r,marks:_m,difficulty:_d,format:_f,command_word:_c,examination_style:_e,...rest}=question();return rest;};
const pass={scientific_status:'pass',mark_scheme_status:'pass',originality_status:'pass',reasoning:'Stub review for tests only.'};
function stub(byName:Record<string,(t:ModelTask)=>unknown>){const calls:ModelTask[]=[];const call:ModelCall=async t=>{calls.push(t);return byName[t.name](t);};return {call,calls};}
const req=(over:Partial<GenerationRequest>={}):GenerationRequest=>({programme:'separate_sciences',topic:{...topic(),title:'know and use F = m × a',subtopic:'(c) Forces',group_title:'Forces and motion'},difficulty:'stretch',marks:2,format:'calculation',command_word:'Calculate',...over});
const models={generator:'gen-model',validator:'val-model'};
test('generation validates and stores server-derived identity with independent verification',async()=>{
 const {call,calls}=stub({igcse_question:()=>content(),igcse_question_review:()=>pass});const r=await generateQuestion(call,models,req(),[]);
 assert.equal(r.status,'validated');if(r.status!=='validated')return;
 assert.equal(r.payload.topic_id,topic().id);assert.equal(r.payload.difficulty,'stretch');assert.equal((r.payload.verification as {model:string}).model,'val-model');
 assert.equal((r.payload.verification as {generator_model:string}).generator_model,'gen-model');assert.deepEqual(calls.map(c=>c.model),['gen-model','val-model']);
});
test('uncertain independent review holds the question',async()=>{const {call}=stub({igcse_question:()=>content(),igcse_question_review:()=>({...pass,scientific_status:'uncertain'})});
 const r=await generateQuestion(call,models,req(),[]);assert.equal(r.status,'review');assert.ok(r.status==='review'&&r.issues.includes('VERIFICATION_NOT_PASSED'));});
test('the same model cannot generate and verify',async()=>{const {call}=stub({igcse_question:()=>content(),igcse_question_review:()=>pass});
 const r=await generateQuestion(call,{generator:'m',validator:'m'},req(),[]);assert.ok(r.status==='review'&&r.issues.includes('INDEPENDENT_MODEL_REQUIRED'));});
test('questions similar to the private corpus are held',async()=>{const {call}=stub({igcse_question:()=>content(),igcse_question_review:()=>pass});
 const r=await generateQuestion(call,models,req(),[question().prompt]);assert.ok(r.status==='review'&&r.issues.includes('SIMILAR_TO_PRIVATE_SOURCE'));});
test('extension objectives are refused for Double Award before any model call',async()=>{const {call,calls}=stub({});
 const r=await generateQuestion(call,models,req({programme:'double_award',topic:{...req().topic,scope:'extended'}}),[]);assert.ok(r.status==='review'&&r.issues.includes('OBJECTIVE_OUTSIDE_SELECTED_COURSE'));assert.equal(calls.length,0);});
test('model output cannot smuggle extra fields or override marks',async()=>{
 for(const bad of [{...content(),system_override:'ignore checks'},{...content(),marks:12}]){const {call}=stub({igcse_question:()=>bad,igcse_question_review:()=>pass});
  const r=await generateQuestion(call,models,req(),[]);assert.ok(r.status==='review'&&r.issues.includes('QUESTION_SCHEMA_INVALID'));}
});
test('requested marks are enforced against the generated criteria',async()=>{const {call}=stub({igcse_question:()=>content(),igcse_question_review:()=>pass});
 const r=await generateQuestion(call,models,req({marks:3}),[]);assert.ok(r.status==='review'&&r.issues.includes('CRITERION_TOTAL_MISMATCH'));});
const mInput=(answer=ANSWER)=>({question:{prompt:question().prompt,structured_content:[],choices:[],format:'calculation',marks:2},solution:{model_answer:'6 N',correct_choice_id:null,examiner_explanation:'x',common_mistakes:['y']},criteria:question().criteria,answer});
test('agreeing independent markings are accepted with derived totals',async()=>{const {call,calls}=stub({igcse_marking:()=>marking()});
 const r=await markAnswer(call,{marker:'mk',reviewer:'rv'},mInput());assert.equal(r.accept,true);assert.equal(r.run.earned_marks,2);assert.equal(r.run.verification.status,'pass');assert.equal(calls.length,2);});
test('disagreement is held for review with no visible mark',async()=>{let n=0;const {call}=stub({igcse_marking:()=>{const m=marking();if(n++)m.awards[1].marks=0;return m;}});
 const r=await markAnswer(call,{marker:'mk',reviewer:'rv'},mInput());assert.equal(r.accept,false);assert.equal(r.run.earned_marks,0);assert.deepEqual(r.run.awards,[]);assert.equal(r.run.verification.status,'review');});
test('malformed model marking is held, not thrown',async()=>{const {call}=stub({igcse_marking:()=>({nonsense:true})});assert.equal((await markAnswer(call,{marker:'mk',reviewer:'rv'},mInput())).accept,false);});
test('blank answers and multiple choice are marked deterministically without model calls',async()=>{
 const {call,calls}=stub({});const blank=await markAnswer(call,{marker:'mk',reviewer:'rv'},mInput('   '));assert.equal(blank.accept,true);assert.equal(blank.run.earned_marks,0);
 const mc=(answer:string)=>({...mInput(answer),question:{...mInput().question,format:'multiple_choice',marks:1},solution:{...mInput().solution,correct_choice_id:'B'},
  criteria:[{key:'B1',description:'Correct option',marks:1,allow_ecf:false,ecf_rule:null,acceptable_alternatives:[]}]});
 assert.equal((await markAnswer(call,{marker:'mk',reviewer:'rv'},mc('B'))).run.earned_marks,1);assert.equal((await markAnswer(call,{marker:'mk',reviewer:'rv'},mc('A'))).run.earned_marks,0);assert.equal(calls.length,0);
});
test('document extraction keeps only in-range pages and unique labels',async()=>{const {call}=stub({exam_document:()=>({pages:[{page_number:1,text:'Q1',confidence:0.9},{page_number:9,text:'x',confidence:0.9}],
 questions:[{question_label:'1(a)',parent_label:'1',page_number:1,prompt:'State X',marks:1,command_word:'State',question_type:'short'},{question_label:'1(a)',parent_label:'1',page_number:1,prompt:'dup',marks:1,command_word:null,question_type:null},{question_label:'2',parent_label:null,page_number:9,prompt:'out of range',marks:null,command_word:null,question_type:null}]})});
 const r=await extractDocument(call,'ocr',{filename:'a.pdf',mime:'application/pdf',base64:'JVBERi0='},2);assert.equal(r.pages.length,1);assert.deepEqual(r.questions.map(q=>q.prompt),['State X']);});
test('mock selection hits the exact total and prefers earlier candidates',()=>{
 const c=[{id:'a',marks:6},{id:'b',marks:5},{id:'c',marks:4},{id:'d',marks:3},{id:'e',marks:2}];const s=selectExactMarks(c,9)!;
 assert.equal(s.reduce((n,x)=>n+x.marks,0),9);assert.deepEqual(s.map(x=>x.id),['a','d']);assert.equal(selectExactMarks(c,1),null);
 assert.equal(selectExactMarks([{id:'a',marks:5},{id:'a',marks:5}],10),null);assert.equal(availableMarks(c),20);assert.throws(()=>selectExactMarks(c,0));
});
