import 'server-only';
import { generateQuestion,markAnswer } from '../src/ai/pipeline.ts';
import { AssessmentError,type Criterion,type TopicContext } from '../src/domain/assessment.ts';
import { objectiveEligible,validateCourseMock,type Qualification } from '../src/domain/qualifications.ts';
import { selectExactMarks,availableMarks } from '../src/domain/mock-builder.ts';
import type { MockQuestion } from '../src/domain/mocks.ts';
import { serviceClient } from './supabase.ts';
import { env,generationStatus,markingStatus } from './env.ts';
import { openAICall } from './ai.ts';
import type { Programme } from './auth.ts';
export type Job={id:string;user_id:string;kind:string;payload:Record<string,unknown>;attempt_count:number};
export type Outcome={status:'succeeded'|'review'|'failed';output:Record<string,unknown>};
const failed=(error:string,extra:Record<string,unknown>={}):Outcome=>({status:'failed',output:{error,...extra}});
/** Natural specification order: 1.2 < 1.10 < 1.10P < 2.1. */
export function refKey(ref:string){const m=/^(\d+)(?:\.(\d+))?([A-Z]?)/.exec(ref);return m?Number(m[1])*1e6+Number(m[2]??0)*10+(m[3]?1:0):Number.MAX_SAFE_INTEGER;}
type TopicRow={id:string;subject_code:'4BI1'|'4CH1'|'4PH1';reference:string;title:string;summary:string;scope:'core'|'extended'|'mixed';verified:boolean;kind:'group'|'objective';parent_id:string|null;specification_id:string};
const ctx=(t:TopicRow):TopicContext=>({id:t.id,subject_code:t.subject_code,reference:t.reference,verified:t.verified,kind:t.kind,scope:t.scope});

export async function handleGenerate(job:Job):Promise<Outcome>{
 if(!generationStatus().ready)return failed('AI_NOT_CONFIGURED');
 const p=job.payload as {programme:Programme;topic_id:string;difficulty:'standard'|'stretch'|'challenge';marks:number;format:'short_answer'|'multiple_choice'|'calculation'|'extended_response';command_word:'State'};
 const sb=serviceClient();
 const {data:t}=await sb.from('topics').select('id,subject_code,reference,title,summary,scope,verified,kind,parent_id,specification_id').eq('id',p.topic_id).maybeSingle<TopicRow>();
 if(!t)return failed('TOPIC_NOT_FOUND');
 const [{data:group},{data:extracted},{data:previous}]=await Promise.all([
  t.parent_id?sb.from('topics').select('title').eq('id',t.parent_id).maybeSingle():Promise.resolve({data:null}),
  sb.from('extracted_questions').select('prompt').eq('user_id',job.user_id).limit(500),
  sb.from('generated_questions').select('prompt').eq('user_id',job.user_id).eq('topic_id',t.id).limit(200)]);
 const corpus=[...(extracted??[]),...(previous??[])].map(r=>String(r.prompt));
 const outcome=await generateQuestion(openAICall,{generator:env.models.generator,validator:env.models.validator},
  {programme:p.programme,topic:{...ctx(t),title:t.title,subtopic:t.summary,group_title:String(group?.title??'')},difficulty:p.difficulty,marks:p.marks,format:p.format,command_word:p.command_word},corpus);
 if(outcome.status==='review')return {status:'review',output:{issues:outcome.issues}};
 const {data:id,error}=await sb.rpc('store_revision_question',{p_user:job.user_id,p_question:outcome.payload,p_status:'validated'});
 if(error){if(/^[A-Z_]{3,80}$/.test(error.message))return {status:'review',output:{issues:[error.message]}};throw new Error('QUESTION_STORE_FAILED');}
 return {status:'succeeded',output:{question_id:id}};
}

export async function handleMark(job:Job):Promise<Outcome>{
 const sb=serviceClient();const attemptId=String(job.payload.attempt_id??'');
 const {data:a}=await sb.from('attempts').select('id,user_id,question_id,answer,status,mock_id').eq('id',attemptId).eq('user_id',job.user_id).maybeSingle();
 if(!a)return failed('ATTEMPT_NOT_FOUND');
 if(!['submitted','marking','review'].includes(a.status))return {status:'succeeded',output:{skipped:a.status}};
 const [{data:q},{data:sol},{data:rows}]=await Promise.all([
  sb.from('generated_questions').select('prompt,structured_content,choices,format,marks').eq('id',a.question_id).single(),
  sb.from('question_solutions').select('model_answer,correct_choice_id,examiner_explanation,common_mistakes').eq('question_id',a.question_id).single(),
  sb.from('mark_criteria').select('criterion_key,description,marks,allow_ecf,ecf_rule,acceptable_alternatives').eq('question_id',a.question_id).order('criterion_key')]);
 if(!q||!sol||!rows?.length)return failed('QUESTION_DATA_MISSING');
 const criteria:Criterion[]=rows.map(c=>({key:c.criterion_key,description:c.description,marks:c.marks,allow_ecf:c.allow_ecf,ecf_rule:c.ecf_rule,acceptable_alternatives:c.acceptable_alternatives??[]}));
 const deterministic=!String(a.answer).trim()||q.format==='multiple_choice';
 if(!deterministic){
  if(!markingStatus().ready)return failed('AI_NOT_CONFIGURED');
  const {data:ok}=await sb.rpc('consume_revision_usage',{p_user:job.user_id,p_feature:'marking',p_limit:env.limits.marking,p_amount:1});
  if(!ok)return failed('DAILY_LIMIT_REACHED');
 }
 const outcome=await markAnswer(openAICall,{marker:env.models.marker,reviewer:env.models.validator},{question:q,solution:sol,criteria,answer:String(a.answer)});
 const {error}=await sb.rpc('record_revision_marking',{p_user:job.user_id,p_attempt:a.id,p_run:outcome.run,p_accept:outcome.accept});
 if(error){if(/^[A-Z_]{3,80}$/.test(error.message))return failed(error.message);throw new Error('MARKING_STORE_FAILED');}
 return {status:outcome.accept?'succeeded':'review',output:{attempt_id:a.id,accepted:outcome.accept}};
}

export async function handleBuildMock(job:Job):Promise<Outcome>{
 const sb=serviceClient();const mockId=String(job.payload.mock_id??'');
 const {data:m}=await sb.from('mock_exams').select('id,user_id,subject_code,blueprint_id,qualification_code,status').eq('id',mockId).eq('user_id',job.user_id).maybeSingle();
 if(!m||m.status!=='building')return {status:'succeeded',output:{skipped:true}};
 const fail=async(error:string,extra:Record<string,unknown>={})=>{await sb.from('mock_exams').update({status:'failed'}).eq('id',m.id);return failed(error,extra);};
 const [{data:b},{data:profile}]=await Promise.all([
  sb.from('paper_blueprints').select('id,code,subject_code,specification_id,total_marks,duration_minutes,core_only,verified_at').eq('id',m.blueprint_id).single(),
  sb.from('profiles').select('programme_key').eq('user_id',job.user_id).single()]);
 const programme=profile?.programme_key as Programme|null;
 if(!b||!programme||!m.qualification_code)return fail('PROGRAMME_OR_PAPER_MISSING');
 const {data:qs}=await sb.from('generated_questions').select('id,marks,topic_id,validation_status,subject_code,created_at').eq('user_id',job.user_id).eq('subject_code',b.subject_code).eq('validation_status','validated').order('created_at').limit(2000);
 const topicIds=[...new Set((qs??[]).map(q=>q.topic_id as string))];
 const {data:topics}=topicIds.length?await sb.from('topics').select('id,subject_code,reference,title,summary,scope,verified,kind,parent_id,specification_id').in('id',topicIds):{data:[] as TopicRow[]};
 const byId=new Map((topics as TopicRow[]??[]).map(t=>[t.id,t]));
 const eligible=(qs??[]).filter(q=>{const t=byId.get(q.topic_id);return !!t&&t.specification_id===b.specification_id&&t.verified&&t.kind==='objective'&&(!b.core_only||t.scope==='core')&&objectiveEligible(programme,ctx(t));});
 const ids=eligible.map(q=>q.id as string);
 const [{data:tried},{data:used}]=ids.length?await Promise.all([sb.from('attempts').select('question_id').eq('user_id',job.user_id).in('question_id',ids),
  sb.from('mock_exam_questions').select('question_id').eq('user_id',job.user_id).in('question_id',ids)]):[{data:[]},{data:[]}];
 const seen=new Set((tried??[]).map(r=>r.question_id as string)),inMock=new Set((used??[]).map(r=>r.question_id as string));
 // Prefer unseen questions, then spread across topics round-robin so the paper covers breadth.
 const tiers=[0,1,2].map(tier=>eligible.filter(q=>(inMock.has(q.id)?2:seen.has(q.id)?1:0)===tier));
 const ordered=tiers.flatMap(tier=>{const groups=new Map<string,typeof tier>();for(const q of tier){const g=groups.get(q.topic_id)??[];g.push(q);groups.set(q.topic_id,g);}
  const lists=[...groups.values()],out:typeof tier=[];for(let i=0;lists.some(l=>i<l.length);i++)for(const l of lists)if(i<l.length)out.push(l[i]);return out;});
 const chosen=selectExactMarks(ordered.map(q=>({id:q.id as string,marks:q.marks as number,topic_id:q.topic_id as string})),b.total_marks);
 if(!chosen)return fail('NOT_ENOUGH_VALIDATED_QUESTIONS',{available_marks:availableMarks(eligible.map(q=>({id:q.id,marks:q.marks}))),needed_marks:b.total_marks});
 chosen.sort((x,y)=>refKey(byId.get(x.topic_id)!.reference)-refKey(byId.get(y.topic_id)!.reference));
 const mockQuestions:MockQuestion[]=chosen.map(c=>{const t=byId.get(c.topic_id)!;return {id:c.id,user_id:job.user_id,subject_code:b.subject_code,marks:c.marks,validation_status:'validated',topic:{specification_id:t.specification_id,kind:t.kind,scope:t.scope,verified:t.verified}};});
 try{validateCourseMock(m.qualification_code as Qualification,b,mockQuestions,job.user_id);}catch(e){if(e instanceof AssessmentError)return fail(e.code,{issues:e.issues});throw e;}
 const {error:ie}=await sb.from('mock_exam_questions').insert(chosen.map((c,i)=>({mock_id:m.id,user_id:job.user_id,subject_code:b.subject_code,question_id:c.id,position:i+1,question_label:String(i+1)})));
 if(ie)return fail('MOCK_ITEMS_REJECTED');
 const {error:ue}=await sb.from('mock_exams').update({status:'ready'}).eq('id',m.id).eq('status','building');
 if(ue)return fail(/^[A-Z_]{3,80}$/.test(ue.message)?ue.message:'MOCK_PUBLISH_REJECTED');
 return {status:'succeeded',output:{questions:chosen.length,marks:b.total_marks}};
}
