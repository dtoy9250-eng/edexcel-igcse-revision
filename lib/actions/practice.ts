'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GenerationSelectionSchema,objectiveEligible } from '../../src/domain/qualifications.ts';
import type { TopicContext } from '../../src/domain/assessment.ts';
import { serviceClient } from '../supabase.ts';
import { assertSameOrigin,requireUser,requireProfile } from '../auth.ts';
import { env,generationStatus } from '../env.ts';
import { runWorker } from '../jobs.ts';
import { codeOf,withParams } from '../messages.ts';
const kick=()=>after(async()=>{await runWorker();});
/** Queues one generation job per question. Course membership comes from the stored profile, not the form. */
export async function requestQuestions(fd:FormData){
 await assertSameOrigin();const {user,profile}=await requireProfile('/practice');
 if(!profile.programme_key)redirect(withParams('/practice',{error:'PROGRAMME_REQUIRED'}));
 if(!generationStatus().ready)redirect(withParams('/practice',{error:'AI_NOT_CONFIGURED'}));
 const sel=GenerationSelectionSchema.safeParse({programme:profile.programme_key,subject_code:fd.get('subject_code'),topic_id:fd.get('topic_id'),difficulty:fd.get('difficulty')||undefined,
  marks:Number(fd.get('marks')),format:fd.get('format'),command_word:fd.get('command_word'),question_count:Number(fd.get('question_count')??1),examination_style:'International GCSE linear'});
 if(!sel.success||sel.data.question_count>10)redirect(withParams('/practice',{error:'invalid'}));
 const sb=serviceClient();
 const {data:t}=await sb.from('topics').select('id,subject_code,reference,scope,verified,kind').eq('id',sel.data.topic_id).maybeSingle();
 if(!t||t.subject_code!==sel.data.subject_code||!objectiveEligible(sel.data.programme,t as TopicContext))redirect(withParams('/practice',{error:'PAPER_OUTSIDE_SELECTED_QUALIFICATION'}));
 const {data:ok}=await sb.rpc('consume_revision_usage',{p_user:user.id,p_feature:'generation',p_limit:env.limits.generation,p_amount:sel.data.question_count});
 if(!ok)redirect(withParams('/practice',{error:'DAILY_LIMIT_REACHED'}));
 const {question_count,examination_style:_e,subject_code:_s,...payload}=sel.data;const request=randomUUID();
 const {error}=await sb.from('jobs').insert(Array.from({length:question_count},(_,i)=>({user_id:user.id,kind:'generate_question',payload,idempotency_key:`gen:${request}:${i}`})));
 if(error)redirect(withParams('/practice',{error:'UNEXPECTED'}));
 kick();revalidatePath('/practice');redirect(withParams('/practice',{notice:'queued'}));
}
const Answer=z.object({attempt_id:z.uuid(),question_id:z.uuid(),answer:z.string().max(20000)});
function parseAnswer(fd:FormData){const p=Answer.safeParse({attempt_id:fd.get('attempt_id'),question_id:fd.get('question_id'),answer:String(fd.get('answer')??'')});if(!p.success)redirect(withParams('/practice',{error:'invalid'}));return p.data;}
export async function saveAnswer(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/practice');const a=parseAnswer(fd);
 const {error}=await serviceClient().rpc('save_revision_answer',{p_id:a.attempt_id,p_user:user.id,p_answer:a.answer});
 redirect(withParams(`/practice/${a.question_id}`,error?{error:codeOf(error)}:{notice:'saved'}));
}
export async function submitAnswer(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/practice');const a=parseAnswer(fd);const sb=serviceClient();
 const saved=await sb.rpc('save_revision_answer',{p_id:a.attempt_id,p_user:user.id,p_answer:a.answer});
 if(saved.error&&codeOf(saved.error)!=='ANSWER_LOCKED')redirect(withParams(`/practice/${a.question_id}`,{error:codeOf(saved.error)}));
 const {error}=await sb.rpc('submit_revision_attempt',{p_id:a.attempt_id,p_user:user.id});
 if(error)redirect(withParams(`/practice/${a.question_id}`,{error:codeOf(error)}));
 kick();redirect(`/results/${a.attempt_id}`);
}
export async function retryMarking(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/results');const id=z.uuid().parse(fd.get('attempt_id'));
 await serviceClient().rpc('requeue_revision_marking',{p_attempt:id,p_user:user.id});kick();redirect(withParams(`/results/${id}`,{notice:'remark'}));
}
/** Runs a bounded worker step after the response for this learner's queued work. */
export async function processNow(fd:FormData){
 await assertSameOrigin();await requireUser();kick();const back=String(fd.get('back')??'/dashboard');redirect(back.startsWith('/')&&!back.startsWith('//')?back:'/dashboard');
}
