'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { splitDoubleAward,crossCheck,type ExtractedStatement } from '../../src/catalog/spec-parser.ts';
import { serviceClient } from '../supabase.ts';
import { assertSameOrigin,requireUser,isAdmin } from '../auth.ts';
import { specificationStatements } from '../catalog.ts';
import { withParams } from '../messages.ts';
const SUBJECT_ORDER=['4BI1','4CH1','4PH1'];
async function admin(){const user=await requireUser('/admin/catalog');if(!isAdmin(user.email))redirect(withParams('/dashboard',{error:'NOT_ADMIN'}));return user;}
/**
 * Imports objective-level statements from the checksum-verified official PDF into the private database
 * (never into the repository) as UNVERIFIED rows, after the Double Award scope cross-check passes.
 */
export async function importObjectives(fd:FormData){
 await assertSameOrigin();const user=await admin();const specId=z.uuid().parse(fd.get('specification_id'));const sb=serviceClient();
 const [{data:spec},{data:da},{data:groups}]=await Promise.all([
  sb.from('specification_versions').select('id,subject_code,source_url,source_sha256').eq('id',specId).single(),
  sb.from('science_qualifications').select('source_url,source_sha256').eq('code','4SD0').single(),
  sb.from('topics').select('id,reference,title').eq('specification_id',specId).eq('kind','group')]);
 if(!spec||!da)redirect(withParams('/admin/catalog',{error:'UNEXPECTED'}));
 let statements:ExtractedStatement[]=[],double:ExtractedStatement[]=[],failure='';
 try{[statements,double]=await Promise.all([specificationStatements(spec.source_url,spec.source_sha256),specificationStatements(da.source_url,da.source_sha256)]);}
 catch(e){failure=e instanceof Error&&/^[A-Z0-9_]{3,80}$/.test(e.message)?e.message:'UNEXPECTED';}
 if(failure)redirect(withParams('/admin/catalog',{error:failure}));
 const check=crossCheck(statements,splitDoubleAward(double)[SUBJECT_ORDER.indexOf(spec.subject_code)]??[]);
 const groupByRef=new Map((groups??[]).map(g=>[g.reference as string,g]));const orphans=statements.filter(s=>!groupByRef.has(s.group)).map(s=>s.reference);
 const ok=check.ok&&orphans.length===0;
 const {missingFromDoubleAward,unexpectedInDoubleAward,duplicates,...counts}=check;
 await sb.from('audit_events').insert({user_id:user.id,action:'catalog_import',resource_id:spec.id,metadata:{...counts,ok,source_sha256_verified:true,
  missing_from_double_award:missingFromDoubleAward.slice(0,50),unexpected_in_double_award:unexpectedInDoubleAward.slice(0,50),duplicates:duplicates.slice(0,50),orphans:orphans.slice(0,50)}});
 if(!ok)redirect(withParams('/admin/catalog',{error:'CROSS_CHECK_FAILED'}));
 const rows=statements.map(s=>{const g=groupByRef.get(s.group)!;return {specification_id:spec.id,subject_code:spec.subject_code,parent_id:g.id,kind:'objective',reference:s.reference,
  title:s.text,summary:s.subtopic||String(g.title),scope:s.scope,verified:false};});
 for(let i=0;i<rows.length;i+=200){const {error}=await sb.from('topics').upsert(rows.slice(i,i+200),{onConflict:'specification_id,reference',ignoreDuplicates:true});if(error)redirect(withParams('/admin/catalog',{error:'UNEXPECTED'}));}
 redirect(withParams('/admin/catalog',{notice:'imported'}));
}
/** Human review gate: only after a passing import may the administrator mark the objectives verified. */
export async function verifyObjectives(fd:FormData){
 await assertSameOrigin();const user=await admin();const specId=z.uuid().parse(fd.get('specification_id'));const sb=serviceClient();
 const {data:last}=await sb.from('audit_events').select('metadata').eq('action','catalog_import').eq('resource_id',specId).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(!(last?.metadata as {ok?:boolean}|undefined)?.ok)redirect(withParams('/admin/catalog',{error:'IMPORT_NOT_VERIFIED'}));
 const {data}=await sb.from('topics').update({verified:true}).eq('specification_id',specId).eq('kind','objective').eq('verified',false).select('id');
 await sb.from('audit_events').insert({user_id:user.id,action:'catalog_verify',resource_id:specId,metadata:{verified:data?.length??0}});
 redirect(withParams('/admin/catalog',{notice:'verified'}));
}
