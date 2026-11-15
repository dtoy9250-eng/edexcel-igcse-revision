'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isTimeZone } from '../../src/domain/security.ts';
import { userClient,serviceClient } from '../supabase.ts';
import { assertSameOrigin,requireUser } from '../auth.ts';
import { documentPaths,BUCKET } from '../documents.ts';
import { codeOf,withParams } from '../messages.ts';
const ProgrammeKey=z.enum(['double_award','separate_sciences']);
const Settings=z.object({display_name:z.string().trim().max(80),time_zone:z.string().refine(isTimeZone),daily_goal_minutes:z.coerce.number().int().min(5).max(180),
 extra_time_percent:z.coerce.number().int().refine(v=>[0,25,50,100].includes(v)),programme_key:ProgrammeKey.nullable(),practice_difficulty:z.enum(['standard','stretch','challenge'])});
/** Profile preferences are written with the learner's own RLS-scoped client and column grants. */
export async function saveSettings(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/settings');
 const p=Settings.safeParse({display_name:fd.get('display_name')??'',time_zone:fd.get('time_zone'),daily_goal_minutes:fd.get('daily_goal_minutes'),extra_time_percent:fd.get('extra_time_percent'),
  programme_key:fd.get('programme_key')||null,practice_difficulty:fd.get('practice_difficulty')});
 if(!p.success)redirect(withParams('/settings',{error:'invalid'}));
 const {error}=await (await userClient()).from('profiles').update(p.data).eq('user_id',user.id);
 revalidatePath('/','layout');redirect(withParams('/settings',error?{error:codeOf(error)}:{notice:'settings_saved'}));
}
export async function chooseProgramme(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/onboarding');const p=ProgrammeKey.safeParse(fd.get('programme_key'));
 if(!p.success)redirect(withParams('/onboarding',{error:'invalid'}));
 await (await userClient()).from('profiles').update({programme_key:p.data}).eq('user_id',user.id);
 revalidatePath('/','layout');redirect('/dashboard');
}
/** Erasure: stop jobs, purge private Storage objects, then delete the Auth user (database rows cascade). */
export async function deleteAccount(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/settings');
 if(fd.get('confirm')!=='DELETE')redirect(withParams('/settings',{error:'confirm_delete'}));
 const sb=serviceClient();
 await sb.rpc('begin_revision_erasure',{p_user:user.id});
 const paths=new Set(await documentPaths(user.id));
 const {data:folders}=await sb.storage.from(BUCKET).list(user.id,{limit:1000});
 for(const f of folders??[]){const {data:files}=await sb.storage.from(BUCKET).list(`${user.id}/${f.name}`,{limit:1000});for(const x of files??[])if(x.id)paths.add(`${user.id}/${f.name}/${x.name}`);
  const {data:pages}=await sb.storage.from(BUCKET).list(`${user.id}/${f.name}/pages`,{limit:1000});for(const x of pages??[])paths.add(`${user.id}/${f.name}/pages/${x.name}`);}
 const list=[...paths];for(let i=0;i<list.length;i+=500){const {error}=await sb.storage.from(BUCKET).remove(list.slice(i,i+500));if(error)redirect(withParams('/settings',{error:'UNEXPECTED'}));}
 const {error}=await sb.auth.admin.deleteUser(user.id);
 if(error)redirect(withParams('/settings',{error:'UNEXPECTED'}));
 try{await (await userClient()).auth.signOut();}catch{/* session already invalid */}
 redirect(withParams('/',{notice:'deleted'}));
}
