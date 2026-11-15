import 'server-only';
import { createHash } from 'node:crypto';
import { fileMagic } from '../src/domain/security.ts';
import { extractDocument,type ExtractedDocument } from '../src/ai/pipeline.ts';
import { serviceClient } from './supabase.ts';
import { env,ocrReady } from './env.ts';
import { openAICall } from './ai.ts';
import { pdfPages } from './catalog.ts';
export const BUCKET='revision-private';
type Outcome={status:'succeeded'|'review'|'failed';output:Record<string,unknown>};
function imageSize(bytes:Uint8Array,mime:string){
 if(mime==='image/png'&&bytes.length>24){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {width:v.getUint32(16),height:v.getUint32(20)};}
 if(mime==='image/jpeg'){let i=2;while(i+9<bytes.length){if(bytes[i]!==0xff){i++;continue;}const m=bytes[i+1],len=(bytes[i+2]<<8)|bytes[i+3];
  if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return {height:(bytes[i+5]<<8)|bytes[i+6],width:(bytes[i+7]<<8)|bytes[i+8]};i+=2+len;}}
 return {width:1,height:1};
}
/** Quarantined processing: size and file-magic checks, embedded text, optional OCR; results always need owner review. */
export async function processDocument(userId:string,documentId:string):Promise<Outcome>{
 const sb=serviceClient();
 const {data:d}=await sb.from('documents').select('id,user_id,subject_code,object_path,mime_type,byte_size,status,file_name').eq('id',documentId).eq('user_id',userId).maybeSingle();
 if(!d||!['queued','processing'].includes(d.status))return {status:'succeeded',output:{skipped:true}};
 const fail=async(code:string):Promise<Outcome>=>{await sb.from('documents').update({status:'failed',error_code:code}).eq('id',d.id);return {status:'failed',output:{error:code}};};
 await sb.from('documents').update({status:'processing',error_code:null}).eq('id',d.id);
 const {data:blob,error}=await sb.storage.from(BUCKET).download(d.object_path);
 if(error||!blob)return fail('OBJECT_MISSING');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(bytes.byteLength!==d.byte_size||bytes.byteLength>26214400){await sb.storage.from(BUCKET).remove([d.object_path]);return fail('SIZE_MISMATCH');}
 if(!fileMagic(bytes,d.mime_type)){await sb.storage.from(BUCKET).remove([d.object_path]);return fail('FILE_SIGNATURE_MISMATCH');}
 const sha256=createHash('sha256').update(bytes).digest('hex');
 let pages:{page_number:number;width:number;height:number;text_content:string;ocr_confidence:number|null}[];
 if(d.mime_type==='application/pdf'){
  let parsed;try{parsed=await pdfPages(bytes.slice(),100);}catch(e){return fail(e instanceof Error&&e.message==='TOO_MANY_PAGES'?'TOO_MANY_PAGES':'PDF_PARSE_FAILED');}
  pages=parsed.pages.map((p,i)=>({page_number:i+1,width:p.width||1,height:p.height||1,text_content:p.lines.join('\n').slice(0,250000),ocr_confidence:null}));
 }else{const s=imageSize(bytes,d.mime_type);pages=[{page_number:1,width:s.width||1,height:s.height||1,text_content:'',ocr_confidence:null}];}
 if(!pages.length)return fail('EMPTY_DOCUMENT');
 let questions:ExtractedDocument['questions']=[];const notes:string[]=[];
 if(!ocrReady())notes.push('OCR_NOT_CONFIGURED');
 else if(bytes.byteLength>10*1024*1024||pages.length>30)notes.push('OCR_SKIPPED_SIZE');
 else try{
  const out=await extractDocument(openAICall,env.models.ocr,{filename:d.file_name,mime:d.mime_type,base64:Buffer.from(bytes).toString('base64')},pages.length);
  for(const p of out.pages){const page=pages[p.page_number-1];if(page){if(p.text.trim())page.text_content=p.text.slice(0,250000);page.ocr_confidence=p.confidence;}}
  questions=out.questions;
 }catch{notes.push('OCR_FAILED');}
 const {error:pe}=await sb.from('document_pages').upsert(pages.map(p=>({...p,document_id:d.id,user_id:userId,blocks:[],needs_review:true})),{onConflict:'document_id,page_number'});
 if(pe)throw new Error('PAGE_STORE_FAILED');
 if(questions.length){
  const {error:qe}=await sb.from('extracted_questions').upsert(questions.map(q=>({document_id:d.id,user_id:userId,subject_code:d.subject_code,question_label:q.question_label,parent_label:q.parent_label,
   page_number:q.page_number,prompt:q.prompt,marks:q.marks,command_word:q.command_word,question_type:q.question_type,source_regions:[],needs_review:true})),{onConflict:'document_id,question_label',ignoreDuplicates:true});
  if(qe)throw new Error('QUESTION_STORE_FAILED');
 }
 await sb.from('documents').update({status:'review',sha256,page_count:pages.length,error_code:null}).eq('id',d.id);
 return {status:'succeeded',output:{pages:pages.length,questions:questions.length,notes}};
}
/** Every Storage path the database knows for a document (original plus rendered pages). */
export async function documentPaths(userId:string,documentIds?:string[]){
 const sb=serviceClient();let q=sb.from('documents').select('id,object_path').eq('user_id',userId);if(documentIds)q=q.in('id',documentIds);
 const {data:docs}=await q;const paths=new Set<string>((docs??[]).map(d=>d.object_path as string));
 if(docs?.length){const {data:pages}=await sb.from('document_pages').select('image_path').eq('user_id',userId).in('document_id',docs.map(d=>d.id)).not('image_path','is',null);for(const p of pages??[])paths.add(p.image_path as string);}
 return [...paths];
}
