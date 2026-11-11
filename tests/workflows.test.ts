import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Regression tests for 202611100006 and the web workflow RPCs. Explicit test-only Auth/Storage shims.
const db=new PGlite();const A=randomUUID(),B=randomUUID();
const SPEC='f1000000-0000-4000-8000-000000000001';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const query=async<T extends Record<string,unknown>=Record<string,unknown>>(sql:string,params:unknown[]=[])=>(await db.query<T>(sql,params)).rows;
const one=async<T extends Record<string,unknown>=Record<string,unknown>>(sql:string,params:unknown[]=[])=>(await query<T>(sql,params))[0];
async function isolated(fn:()=>Promise<unknown>){await db.exec('begin');try{await fn();await db.exec('set constraints all immediate');}finally{await db.exec('rollback; reset role');}}
const flush=async()=>{await db.exec('set constraints all immediate');};
async function asUser(id:string){await query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await db.exec('set local role authenticated');}
const PASS={scientific_status:'pass',mark_scheme_status:'pass',originality_status:'pass',model:'fixture-validator',generator_model:'fixture-generator'};
let topic:string,bp:string;
function payload(over:Record<string,unknown>={}){return {subject_code:'4PH1',topic_id:topic,prompt:`Calculate the force on a ${randomUUID()} trolley of mass 2 kg accelerating at 3 m/s².`,
 structured_content:[],choices:[],marks:2,difficulty:'stretch',format:'calculation',command_word:'Calculate',model_answer:'F = ma = 6 N',correct_choice_id:null,
 examiner_explanation:'Multiply mass by acceleration.',common_mistakes:['Adding the values'],numerical_checks:[{operation:'multiply',inputs:[2,3],expected:6,absolute_tolerance:0.01,unit:'N'}],
 verification:PASS,criteria:[{key:'M1',description:'Uses F = ma',marks:1,allow_ecf:false,ecf_rule:null,acceptable_alternatives:[]},{key:'A1',description:'6 N',marks:1,allow_ecf:false,ecf_rule:null,acceptable_alternatives:[]}],...over};}
const store=async(user=A,over:Record<string,unknown>={})=>(await one<{id:string}>('select public.store_revision_question($1,$2) as id',[user,JSON.stringify(payload(over))])).id;
const run=(earned:number,awards:{criterion_key:string;marks:number;evidence:string}[],status='pass')=>JSON.stringify({earned_marks:earned,available_marks:2,confidence:0.95,feedback:'Synthetic test feedback',misconceptions:['units'],
 model_id:'fixture-marker',input_sha256:hash(randomUUID()),verification:{status},awards:awards.map(a=>({...a,ecf:false,explanation:'Synthetic award explanation'}))});
const fullMarks=run(2,[{criterion_key:'M1',marks:1,evidence:'F = ma'},{criterion_key:'A1',marks:1,evidence:'6 N'}]);
async function practice(user=A,answer='F = ma so the force is 6 N'){const q=await store(user);const a=await one<{id:string}>('select (public.start_revision_practice($1,$2)).id as id',[user,q]);
 await query('select public.save_revision_answer($1,$2,$3)',[a.id,user,answer]);await query('select public.submit_revision_attempt($1,$2)',[a.id,user]);return {question:q,attempt:a.id};}
async function mock(question:string){const id=randomUUID();await query("insert into public.mock_exams(id,user_id,subject_code,blueprint_id) values($1,$2,'4PH1',$3)",[id,A,bp]);
 await query("insert into public.mock_exam_questions(mock_id,user_id,subject_code,question_id,position,question_label) values($1,$2,'4PH1',$3,1,'1')",[id,A,question]);
 await query("update public.mock_exams set status='ready' where id=$1",[id]);return id;}
before(async()=>{
 await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated; grant all on storage.objects,storage.buckets to service_role;`);
 const folder=new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
 await query('insert into auth.users(id) values($1),($2)',[A,B]);
 topic=randomUUID();bp=randomUUID();
 await query("insert into public.topics(id,specification_id,subject_code,kind,reference,title,summary,scope,verified) values($1,$2,'4PH1','objective','TEST-W1','TEST ONLY objective','Synthetic fixture','core',true)",[topic,SPEC]);
 await query("insert into public.paper_blueprints(id,specification_id,subject_code,code,title,total_marks,duration_minutes,core_only,verified_at,source_pages) values($1,$2,'4PH1','TEST/W','TEST ONLY',2,1,true,now(),'Synthetic fixture')",[bp,SPEC]);
});
after(async()=>{await db.close();});

test('account erasure cascades every learner-owned row, including mocks and accepted marking',async()=>isolated(async()=>{
 const {attempt}=await practice();await query('select public.record_revision_marking($1,$2,$3,true)',[A,attempt,fullMarks]);
 const m=await mock(await store());await query('select public.start_revision_mock($1,$2)',[m,A]);
 const doc=randomUUID();await query("insert into public.documents(id,user_id,subject_code,kind,file_name,object_path,mime_type,byte_size,rights_attested_at) values($1,$2,'4PH1','paper','f.pdf',$3,'application/pdf',10,now())",[doc,A,`${A}/${doc}/original.pdf`]);
 await query("select public.consume_revision_usage($1,'generation',5)",[A]);await query("insert into public.audit_events(user_id,action) values($1,'test')",[A]);
 await query('select public.begin_revision_erasure($1)',[A]);await query('delete from auth.users where id=$1',[A]);await flush();
 for(const t of ['profiles','documents','generated_questions','mock_exams','mock_exam_questions','attempts','marking_runs','jobs','usage_counters'])assert.equal((await query(`select 1 from public.${t} where user_id=$1`,[A])).length,0,t);
 assert.equal((await one<{n:number}>('select count(*)::int n from public.audit_events where user_id is null')).n,1);
}));
test('a referenced question still cannot be deleted on its own',async()=>assert.rejects(isolated(async()=>{const q=await store();await mock(q);await flush();await query('delete from public.generated_questions where id=$1',[q]);}),/foreign key|IMMUTABLE/));
test('re-reviewing catalog metadata cannot trap an in-progress timed mock',async()=>isolated(async()=>{
 const t=randomUUID();await query("insert into public.topics(id,specification_id,subject_code,kind,reference,title,summary,scope,verified) values($1,$2,'4PH1','objective','TEST-W2','TEST ONLY','Synthetic','core',true)",[t,SPEC]);
 const m=await mock(await store(A,{topic_id:t}));await query('select public.start_revision_mock($1,$2)',[m,A]);await flush();await query('update public.topics set verified=false where id=$1',[t]);
 assert.equal((await one<{status:string}>('select (public.submit_revision_mock($1,$2)).status',[m,A])).status,'submitted');
}));
test('publishing a mock still re-checks eligibility',async()=>assert.rejects(isolated(async()=>{const q=await store();await flush();await query('update public.topics set verified=false where id=$1',[topic]);await mock(q);}),/MOCK_QUESTION_NOT_ELIGIBLE/));
test('a published mock cannot be re-pointed at another blueprint or qualification',async()=>{
 await assert.rejects(isolated(async()=>{const m=await mock(await store());const [p]=await query<{id:string}>("select id from public.paper_blueprints where code='4PH1/1P'");await query('update public.mock_exams set blueprint_id=$2 where id=$1',[m,p.id]);}),/MOCK_STRUCTURE_LOCKED/);
 await assert.rejects(isolated(async()=>{const m=await mock(await store());await query("update public.mock_exams set qualification_code='4PH1' where id=$1",[m]);}),/MOCK_STRUCTURE_LOCKED/);
});
test('a submitted mock cannot return to active and keeps its submission time',async()=>{
 await assert.rejects(isolated(async()=>{const m=await mock(await store());await query('select public.start_revision_mock($1,$2)',[m,A]);await query('select public.submit_revision_mock($1,$2)',[m,A]);await query("update public.mock_exams set status='active' where id=$1",[m]);}),/INVALID_MOCK_TRANSITION/);
 await assert.rejects(isolated(async()=>{const m=await mock(await store());await query('select public.start_revision_mock($1,$2)',[m,A]);await query('select public.submit_revision_mock($1,$2)',[m,A]);await query("update public.mock_exams set submitted_at=null,status='review' where id=$1",[m]);}),/MOCK_STRUCTURE_LOCKED|mock_review_has_times/);
});
test('learners cannot read held marking runs',async()=>isolated(async()=>{
 const {attempt}=await practice();const held=await one<{id:string}>('select public.record_revision_marking($1,$2,$3,false) as id',[A,attempt,run(0,[],'review')]);
 assert.equal((await one<{status:string}>('select status from public.attempts where id=$1',[attempt])).status,'review');
 await asUser(A);assert.equal((await query('select 1 from public.marking_runs where id=$1',[held.id])).length,0);
}));
test('validated marking stays visible to its owner only',async()=>isolated(async()=>{
 const {attempt}=await practice();const r=await one<{id:string}>('select public.record_revision_marking($1,$2,$3,true) as id',[A,attempt,fullMarks]);await flush();
 await asUser(A);assert.equal((await query('select 1 from public.marking_runs where id=$1',[r.id])).length,1);assert.equal((await query('select 1 from public.criterion_awards where run_id=$1',[r.id])).length,2);
 await db.exec('reset role');await asUser(B);assert.equal((await query('select 1 from public.marking_runs where id=$1',[r.id])).length,0);
}));
test('profile time zones must be real IANA names',async()=>{
 await assert.rejects(isolated(async()=>{await asUser(A);await query("update public.profiles set time_zone='Not/AZone' where user_id=$1",[A]);}),/INVALID_TIME_ZONE/);
 await isolated(async()=>{await asUser(A);await query("update public.profiles set time_zone='Asia/Kolkata' where user_id=$1",[A]);});
});
test('null lease durations raise INVALID_LEASE',async()=>assert.rejects(isolated(async()=>{await query('select * from public.claim_revision_job($1,null)',[randomUUID()]);}),/INVALID_LEASE/));
test('multiple-choice questions need a stored answer among four distinct options',async()=>{
 const four=[{id:'A',text:'Speed'},{id:'B',text:'Velocity'},{id:'C',text:'Mass'},{id:'D',text:'Time'}];
 const mc=(over:Record<string,unknown>)=>({format:'multiple_choice',marks:1,command_word:'State',prompt:`State which quantity is a vector (${randomUUID()}).`,numerical_checks:[],
  criteria:[{key:'B1',description:'Velocity',marks:1,allow_ecf:false,ecf_rule:null,acceptable_alternatives:[]}],choices:four,correct_choice_id:'B',...over});
 await isolated(async()=>{await store(A,mc({}));});
 await assert.rejects(isolated(async()=>{await store(A,mc({correct_choice_id:null}));}),/MULTIPLE_CHOICE_ANSWER_INVALID/);
 await assert.rejects(isolated(async()=>{await store(A,mc({correct_choice_id:'E'}));}),/MULTIPLE_CHOICE_ANSWER_INVALID/);
 await assert.rejects(isolated(async()=>{await store(A,mc({choices:[four[0],four[0],four[2],four[3]],correct_choice_id:'A'}));}),/MULTIPLE_CHOICE_ANSWER_INVALID/);
 await assert.rejects(isolated(async()=>{await store(A,{correct_choice_id:'A'});}),/MULTIPLE_CHOICE_ANSWER_INVALID/);
});
test('attempts cannot be opened on unvalidated questions',async()=>assert.rejects(isolated(async()=>{const q=(await one<{id:string}>('select public.store_revision_question($1,$2,$3) as id',[A,JSON.stringify(payload()),'review'])).id;await query('select public.start_revision_practice($1,$2)',[A,q]);}),/QUESTION_NOT_VALIDATED/));
test('stored questions are validated atomically and invalid ones are rejected',async()=>{
 await isolated(async()=>{const id=await store();await flush();assert.equal((await one<{validation_status:string}>('select validation_status from public.generated_questions where id=$1',[id])).validation_status,'validated');
  assert.equal((await query('select 1 from public.mark_criteria where question_id=$1',[id])).length,2);});
 await assert.rejects(isolated(async()=>{const p=JSON.stringify(payload());await query('select public.store_revision_question($1,$2)',[A,p]);await query('select public.store_revision_question($1,$2)',[A,p]);}),/DUPLICATE_QUESTION/);
 await assert.rejects(isolated(async()=>{await store(A,{marks:3});}),/CRITERION_TOTAL_MISMATCH/);
 await assert.rejects(isolated(async()=>{await store(A,{verification:{...PASS,model:'fixture-generator'}});}),/QUESTION_VERIFICATION_MISSING/);
 await assert.rejects(isolated(async()=>{await store(A,{difficulty:'foundation'});}),/FOUNDATION_PRACTICE_DISABLED/);
});
test('practice attempts reuse one draft, submit once and enqueue one marking job',async()=>isolated(async()=>{
 const q=await store();const a1=await one<{id:string}>('select (public.start_revision_practice($1,$2)).id as id',[A,q]);const a2=await one<{id:string}>('select (public.start_revision_practice($1,$2)).id as id',[A,q]);assert.equal(a1.id,a2.id);
 await query('select public.submit_revision_attempt($1,$2)',[a1.id,A]);await query('select public.submit_revision_attempt($1,$2)',[a1.id,A]);
 assert.equal((await query("select 1 from public.jobs where kind='mark_attempt' and payload->>'attempt_id'=$1",[a1.id])).length,1);
 assert.equal((await one<{status:string}>('select status from public.attempts where id=$1',[a1.id])).status,'submitted');
 await db.exec('savepoint locked');await assert.rejects(query('select public.save_revision_answer($1,$2,$3)',[a1.id,A,'changed']),/ANSWER_LOCKED/);await db.exec('rollback to savepoint locked');
}));
test('another learner cannot start practice on a question they do not own',async()=>assert.rejects(isolated(async()=>{const q=await store(A);await query('select public.start_revision_practice($1,$2)',[B,q]);}),/foreign key/));
test('accepted marking feeds analytics; invented evidence and unknown criteria are rolled back',async()=>{
 await isolated(async()=>{const {attempt}=await practice();await query('select public.record_revision_marking($1,$2,$3,true)',[A,attempt,fullMarks]);await flush();
  const rows=await query<{earned:number;available:number;accepted_validated:boolean}>('select * from public.revision_performance($1)',[A]);assert.equal(rows.length,1);assert.equal(rows[0].earned,2);assert.equal(rows[0].accepted_validated,true);
  assert.equal((await one<{status:string}>('select status from public.attempts where id=$1',[attempt])).status,'marked');});
 await assert.rejects(isolated(async()=>{const {attempt}=await practice();await query('select public.record_revision_marking($1,$2,$3,true)',[A,attempt,run(2,[{criterion_key:'M1',marks:1,evidence:'F = ma'},{criterion_key:'A1',marks:1,evidence:'never written'}])]);}),/AWARD_EVIDENCE_INVALID/);
 await assert.rejects(isolated(async()=>{const {attempt}=await practice();await query('select public.record_revision_marking($1,$2,$3,true)',[A,attempt,run(2,[{criterion_key:'M1',marks:1,evidence:'F = ma'},{criterion_key:'X9',marks:1,evidence:'6 N'}])]);}),/UNKNOWN_CRITERION/);
});
test('held marking can be re-queued a bounded number of times and then accepted',async()=>isolated(async()=>{
 const {attempt}=await practice();await query('select public.record_revision_marking($1,$2,$3,false)',[A,attempt,run(0,[],'review')]);
 await query("update public.jobs set status='review' where payload->>'attempt_id'=$1",[attempt]);
 assert.equal((await one<{ok:boolean}>('select public.requeue_revision_marking($1,$2) as ok',[attempt,A])).ok,true);
 assert.equal((await one<{ok:boolean}>('select public.requeue_revision_marking($1,$2) as ok',[attempt,A])).ok,false);
 assert.equal((await one<{status:string}>('select status from public.attempts where id=$1',[attempt])).status,'marking');
 await query('select public.record_revision_marking($1,$2,$3,true)',[A,attempt,fullMarks]);
 assert.equal((await one<{status:string}>('select status from public.attempts where id=$1',[attempt])).status,'marked');
}));
test('marking every mock answer moves the mock to marked',async()=>isolated(async()=>{
 const m=await mock(await store());await query('select public.start_revision_mock($1,$2)',[m,A]);const a=await one<{id:string}>('select id from public.attempts where mock_id=$1',[m]);
 await query('select public.save_revision_answer($1,$2,$3)',[a.id,A,'F = ma gives 6 N']);await query('select public.submit_revision_mock($1,$2)',[m,A]);
 await query('select public.record_revision_marking($1,$2,$3,true)',[A,a.id,fullMarks]);
 assert.equal((await one<{status:string}>('select status from public.mock_exams where id=$1',[m])).status,'marked');
}));
test('expired timed mocks are submitted by the server',async()=>isolated(async()=>{
 const q=await store();const id=randomUUID();
 await query("insert into public.mock_exams(id,user_id,subject_code,blueprint_id,started_at,allotted_seconds,deadline) values($1,$2,'4PH1',$3,now()-interval '2 hours',60,now()-interval '2 hours'+interval '60 seconds')",[id,A,bp]);
 await query("insert into public.mock_exam_questions(mock_id,user_id,subject_code,question_id,position,question_label) values($1,$2,'4PH1',$3,1,'1')",[id,A,q]);
 await query("update public.mock_exams set status='ready' where id=$1",[id]);await query("update public.mock_exams set status='active' where id=$1",[id]);
 assert.equal((await one<{n:number}>('select public.submit_expired_revision_mocks(5) as n')).n,1);
 assert.equal((await one<{status:string}>('select status from public.mock_exams where id=$1',[id])).status,'submitted');
}));
test('browser roles cannot execute any new workflow function',async()=>{
 for(const sig of ['start_revision_practice(uuid,uuid)','submit_revision_attempt(uuid,uuid)','refresh_revision_mock(uuid)','requeue_revision_marking(uuid,uuid)','store_revision_question(uuid,jsonb,text)','record_revision_marking(uuid,uuid,jsonb,boolean)','revision_performance(uuid)','begin_revision_erasure(uuid)','submit_expired_revision_mocks(integer)']){
  for(const role of ['anon','authenticated'])assert.equal((await one<{ok:boolean}>("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,'public.'+sig])).ok,false,`${role} ${sig}`);
  assert.equal((await one<{ok:boolean}>("select has_function_privilege('service_role',$1,'EXECUTE') as ok",['public.'+sig])).ok,true,sig);
 }
});
