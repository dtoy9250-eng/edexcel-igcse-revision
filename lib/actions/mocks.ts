'use server';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { papersForProgramme } from '../../src/domain/qualifications.ts';
import { serviceClient } from '../supabase.ts';
import { assertSameOrigin,requireUser,requireProfile } from '../auth.ts';
import { runWorker } from '../jobs.ts';
import { codeOf,withParams } from '../messages.ts';
const kick=()=>after(async()=>{await runWorker();});
export async function createMock(fd:FormData){
 await assertSameOrigin();const {user,profile}=await requireProfile('/mocks');
 if(!profile.programme_key)redirect(withParams('/mocks',{error:'PROGRAMME_REQUIRED'}));
 const paper=papersForProgramme(profile.programme_key).find(p=>p.reference===fd.get('paper'));
 if(!paper)redirect(withParams('/mocks',{error:'PAPER_OUTSIDE_SELECTED_QUALIFICATION'}));
 const sb=serviceClient();const {data:b}=await sb.from('paper_blueprints').select('id').eq('code',paper.blueprintCode).single();
 if(!b)redirect(withParams('/mocks',{error:'UNEXPECTED'}));
 const {data:m,error}=await sb.from('mock_exams').insert({user_id:user.id,subject_code:paper.subjectCode,blueprint_id:b.id,qualification_code:paper.qualificationCode}).select('id').single();
 if(error||!m)redirect(withParams('/mocks',{error:codeOf(error)}));
 await sb.from('jobs').insert({user_id:user.id,kind:'build_mock',payload:{mock_id:m.id},idempotency_key:`build:${m.id}`});
 kick();redirect(`/mocks/${m.id}`);
}
async function ownMock(fd:FormData){const user=await requireUser('/mocks');const id=z.uuid().safeParse(fd.get('mock_id'));if(!id.success)redirect('/mocks');return {user,id:id.data};}
export async function retryBuild(fd:FormData){
 await assertSameOrigin();const {user,id}=await ownMock(fd);const sb=serviceClient();
 const {data}=await sb.from('mock_exams').update({status:'building'}).eq('id',id).eq('user_id',user.id).eq('status','failed').select('id');
 if(data?.length){await sb.from('jobs').insert({user_id:user.id,kind:'build_mock',payload:{mock_id:id},idempotency_key:`build:${id}:${Date.now()}`});kick();}
 redirect(`/mocks/${id}`);
}
export async function startMock(fd:FormData){
 await assertSameOrigin();const {user,id}=await ownMock(fd);
 const {error}=await serviceClient().rpc('start_revision_mock',{p_id:id,p_user:user.id});
 redirect(error?withParams(`/mocks/${id}`,{error:codeOf(error)}):`/mocks/${id}`);
}
export async function submitMock(fd:FormData){
 await assertSameOrigin();const {user,id}=await ownMock(fd);
 const {error}=await serviceClient().rpc('submit_revision_mock',{p_id:id,p_user:user.id});
 if(!error)kick();redirect(error?withParams(`/mocks/${id}`,{error:codeOf(error)}):`/mocks/${id}`);
}
/** Autosave from the timed runner. The server deadline is authoritative (EXAM_CLOSED after it). */
export async function saveMockAnswer(attemptId:string,answer:string):Promise<{ok:boolean;code?:string}>{
 await assertSameOrigin();const user=await requireUser('/mocks');
 if(!z.uuid().safeParse(attemptId).success||typeof answer!=='string'||answer.length>20000)return {ok:false,code:'invalid'};
 const {error}=await serviceClient().rpc('save_revision_answer',{p_id:attemptId,p_user:user.id,p_answer:answer});
 return error?{ok:false,code:codeOf(error)}:{ok:true};
}
