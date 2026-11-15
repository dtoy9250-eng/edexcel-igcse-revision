import 'server-only';
import { randomUUID } from 'node:crypto';
import { serviceClient } from './supabase.ts';
import { supabaseConfigured } from './env.ts';
import { handleGenerate,handleMark,handleBuildMock,type Job,type Outcome } from './handlers.ts';
import { processDocument } from './documents.ts';
import { ModelError } from './ai.ts';
const CODE=/^[A-Z0-9_]{3,80}$/;
async function dispatch(job:Job):Promise<Outcome>{
 switch(job.kind){
  case 'generate_question':return handleGenerate(job);
  case 'mark_attempt':return handleMark(job);
  case 'build_mock':return handleBuildMock(job);
  case 'process_document':return processDocument(job.user_id,String(job.payload.document_id??''));
  default:return {status:'failed',output:{error:'UNSUPPORTED_JOB'}};
 }
}
/** Bounded worker step: claims leased jobs (SKIP LOCKED, fenced by attempt), retries transient failures. */
export async function runWorker({budgetMs=45_000,maxJobs=8}:{budgetMs?:number;maxJobs?:number}={}){
 if(!supabaseConfigured())return 0;
 const sb=serviceClient(),worker=randomUUID(),started=Date.now();let processed=0;
 await sb.rpc('submit_expired_revision_mocks',{p_limit:20});
 while(processed<maxJobs&&Date.now()-started<budgetMs){
  const {data,error}=await sb.rpc('claim_revision_job',{p_worker:worker,p_lease_seconds:180});
  if(error)break;const job=(data as Job[]|null)?.[0];if(!job)break;processed++;
  const fence={p_id:job.id,p_worker:worker,p_attempt:job.attempt_count};
  try{const r=await dispatch(job);await sb.rpc('finish_revision_job',{...fence,p_output:r.output,p_status:r.status});}
  catch(e){
   const code=e instanceof ModelError?e.code:e instanceof Error&&CODE.test(e.message)?e.message:'WORKER_ERROR';
   const transient=!(e instanceof ModelError)||e.transient;
   if(transient)await sb.rpc('retry_revision_job',{...fence,p_error_code:code});
   else await sb.rpc('finish_revision_job',{...fence,p_output:{error:code},p_status:'failed'});
  }
 }
 return processed;
}
