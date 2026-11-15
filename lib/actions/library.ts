'use server';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UploadSchema,objectKey,ownsKey } from '../../src/domain/security.ts';
import { serviceClient } from '../supabase.ts';
import { assertSameOrigin,requireUser } from '../auth.ts';
import { env,documentsStatus } from '../env.ts';
import { runWorker } from '../jobs.ts';
import { BUCKET,documentPaths } from '../documents.ts';
import { withParams } from '../messages.ts';
type Registered={ok:true;documentId:string;path:string;token:string}|{ok:false;code:string};
/** Registers a private upload and returns a short-lived signed upload token for that exact server-derived path. */
export async function registerUpload(input:unknown):Promise<Registered>{
 await assertSameOrigin();const user=await requireUser('/library');
 if(!documentsStatus().ready)return {ok:false,code:'UPLOADS_DISABLED'};
 const p=UploadSchema.safeParse(input);if(!p.success)return {ok:false,code:'UPLOAD_INVALID'};
 const sb=serviceClient();
 const {data:ok}=await sb.rpc('consume_revision_usage',{p_user:user.id,p_feature:'documents',p_limit:env.limits.documents,p_amount:1});
 if(!ok)return {ok:false,code:'DAILY_LIMIT_REACHED'};
 const id=randomUUID(),path=objectKey(user.id,id,p.data.mime_type);
 const {error}=await sb.from('documents').insert({id,user_id:user.id,subject_code:p.data.subject_code,kind:p.data.kind,file_name:p.data.file_name,object_path:path,
  mime_type:p.data.mime_type,byte_size:p.data.byte_size,rights_attested_at:new Date().toISOString()});
 if(error)return {ok:false,code:'UPLOAD_INVALID'};
 const {data:signed,error:se}=await sb.storage.from(BUCKET).createSignedUploadUrl(path);
 if(se||!signed)return {ok:false,code:'UNEXPECTED'};
 return {ok:true,documentId:id,path,token:signed.token};
}
export async function confirmUpload(documentId:string):Promise<{ok:boolean;code?:string}>{
 await assertSameOrigin();const user=await requireUser('/library');if(!z.uuid().safeParse(documentId).success)return {ok:false,code:'invalid'};
 const sb=serviceClient();
 const {data:d}=await sb.from('documents').select('id,object_path,status').eq('id',documentId).eq('user_id',user.id).maybeSingle();
 if(!d||d.status!=='awaiting_upload'||!ownsKey(user.id,d.object_path))return {ok:false,code:'invalid'};
 const folder=d.object_path.split('/').slice(0,2).join('/'),name=d.object_path.split('/')[2];
 const {data:files}=await sb.storage.from(BUCKET).list(folder,{search:name});
 if(!files?.some(f=>f.name===name))return {ok:false,code:'UPLOAD_MISSING'};
 await sb.from('documents').update({status:'queued'}).eq('id',d.id).eq('status','awaiting_upload');
 await sb.from('jobs').insert({user_id:user.id,kind:'process_document',payload:{document_id:d.id},idempotency_key:`doc:${d.id}`});
 after(async()=>{await runWorker();});return {ok:true};
}
export async function reviewDocument(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/library');const id=z.uuid().parse(fd.get('document_id'));const sb=serviceClient();
 const {data}=await sb.from('documents').update({status:'ready'}).eq('id',id).eq('user_id',user.id).eq('status','review').select('id');
 if(data?.length){await sb.from('document_pages').update({needs_review:false}).eq('document_id',id).eq('user_id',user.id);await sb.from('extracted_questions').update({needs_review:false}).eq('document_id',id).eq('user_id',user.id);}
 redirect(withParams('/library',{notice:'reviewed'}));
}
export async function deleteDocument(fd:FormData){
 await assertSameOrigin();const user=await requireUser('/library');const id=z.uuid().parse(fd.get('document_id'));
 if(fd.get('confirm')!=='on')redirect(withParams('/library',{error:'invalid'}));
 const sb=serviceClient();const paths=await documentPaths(user.id,[id]);
 if(paths.length){const {error}=await sb.storage.from(BUCKET).remove(paths);if(error)redirect(withParams('/library',{error:'UNEXPECTED'}));}
 await sb.from('documents').delete().eq('id',id).eq('user_id',user.id);
 redirect(withParams('/library',{notice:'removed'}));
}
