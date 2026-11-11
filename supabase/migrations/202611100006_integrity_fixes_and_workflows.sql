begin;
-- Fixes found by regression probes on 10 November 2026, plus the server-only workflow
-- functions used by the web application. Every new function is service-role only.

-- 1. Account erasure. NO ACTION keys between learner-owned rows were checked mid-cascade, so deleting
--    an Auth user who owned a mock failed. Check them at commit; cross-owner inserts still fail.
do $$ declare r record; begin
 for r in select c.conname,c.conrelid::regclass tbl from pg_constraint c
  where c.contype='f' and c.confdeltype='a' and not c.condeferrable
  and c.conrelid in ('public.attempts'::regclass,'public.mock_exam_questions'::regclass,'public.criterion_awards'::regclass)
 loop execute format('alter table %s alter constraint %I deferrable initially deferred',r.tbl,r.conname); end loop;
end $$;

-- 2. Learners may read validated marking only. Draft/review runs are unverified model output.
drop policy marking_owner on public.marking_runs;
create policy marking_owner on public.marking_runs for select to authenticated using(user_id=(select auth.uid()) and status='validated'
 and exists(select 1 from public.attempts a left join public.mock_exams m on m.id=a.mock_id where a.id=attempt_id and (a.mock_id is null or m.status in ('submitted','marking','marked','review'))));

-- 3. Mock lifecycle: structure frozen once published, timing once started, submission time once set,
--    and only forward/explicit status transitions.
create or replace function public.freeze_revision_mock() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status not in ('building','failed') and (new.user_id<>old.user_id or new.subject_code<>old.subject_code
  or new.blueprint_id<>old.blueprint_id or new.qualification_code is distinct from old.qualification_code) then raise exception 'MOCK_STRUCTURE_LOCKED'; end if;
 if old.status not in ('building','ready','failed') and (new.started_at is distinct from old.started_at
  or new.deadline is distinct from old.deadline or new.allotted_seconds is distinct from old.allotted_seconds) then raise exception 'MOCK_STRUCTURE_LOCKED'; end if;
 if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then raise exception 'MOCK_STRUCTURE_LOCKED'; end if;
 if new.status<>old.status and (old.status,new.status) not in (
  ('building','ready'),('building','failed'),('ready','building'),('ready','active'),('ready','failed'),
  ('active','submitted'),('active','failed'),('submitted','marking'),('submitted','marked'),('submitted','review'),('submitted','failed'),
  ('marking','marked'),('marking','review'),('marking','failed'),('review','marking'),('review','marked'),('review','failed'),
  ('marked','review'),('failed','building')) then raise exception 'INVALID_MOCK_TRANSITION'; end if;
 return new;
end $$;
alter table public.mock_exams add constraint mock_review_has_times check(status<>'review' or (started_at is not null and submitted_at is not null));

-- 4. Validate a mock when it is published. Later status changes of a frozen mock are not re-validated,
--    so re-reviewing catalog metadata can no longer trap an in-progress timed mock.
create or replace function public.check_mock_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid; m public.mock_exams; b public.paper_blueprints; total integer; n integer; last_position integer;
begin
 if TG_TABLE_NAME='mock_exams' then
  if TG_OP='UPDATE' and old.status not in ('building','failed') then return null; end if;
  mid:=coalesce(new.id,old.id);
 else mid:=coalesce(new.mock_id,old.mock_id); end if;
 select * into m from public.mock_exams where id=mid;
 if not found or m.status in ('building','failed') then return null; end if;
 select * into b from public.paper_blueprints where id=m.blueprint_id;
 if b.verified_at is null then raise exception 'BLUEPRINT_NOT_VERIFIED'; end if;
 select coalesce(sum(q.marks),0),count(*),max(mq.position) into total,n,last_position from public.mock_exam_questions mq join public.generated_questions q on q.id=mq.question_id where mq.mock_id=mid;
 if total<>b.total_marks then raise exception 'MOCK_TOTAL_MISMATCH'; end if;
 if n=0 or last_position<>n then raise exception 'MOCK_POSITION_GAP'; end if;
 if exists(select 1 from public.mock_exam_questions mq join public.generated_questions q on q.id=mq.question_id join public.topics t on t.id=q.topic_id where mq.mock_id=mid and (q.validation_status<>'validated' or not t.verified or t.kind<>'objective' or (b.core_only and t.scope<>'core') or t.specification_id<>b.specification_id)) then raise exception 'MOCK_QUESTION_NOT_ELIGIBLE'; end if;
 return null;
end $$;

-- 5. Multiple-choice questions need four distinct options and a stored answer that is one of them.
create or replace function public.check_question_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare qid uuid; q public.generated_questions; n integer; total integer;
begin
 if TG_TABLE_NAME='generated_questions' then qid:=coalesce(new.id,old.id); else qid:=coalesce(new.question_id,old.question_id); end if;
 select * into q from public.generated_questions where id=qid;
 if not found or q.validation_status<>'validated' then return null; end if;
 if not exists(select 1 from public.topics t join public.specification_versions s on s.id=t.specification_id where t.id=q.topic_id and t.subject_code=q.subject_code and t.kind='objective' and t.verified and s.checked_at is not null) then raise exception 'TOPIC_NOT_VERIFIED_OBJECTIVE'; end if;
 select count(*),coalesce(sum(marks),0) into n,total from public.mark_criteria where question_id=qid;
 if n=0 or total<>q.marks then raise exception 'CRITERION_TOTAL_MISMATCH'; end if;
 if not exists(select 1 from public.question_solutions where question_id=qid
  and verification @> '{"scientific_status":"pass","mark_scheme_status":"pass","originality_status":"pass"}'::jsonb
  and verification->>'model' is not null and verification->>'generator_model' is not null
  and verification->>'model'<>verification->>'generator_model') then raise exception 'QUESTION_VERIFICATION_MISSING'; end if;
 if q.format='multiple_choice' then
  if (select count(distinct c->>'id') from jsonb_array_elements(q.choices) c)<>4 or not exists(select 1 from public.question_solutions s
   where s.question_id=qid and exists(select 1 from jsonb_array_elements(q.choices) c where c->>'id'=s.correct_choice_id)) then raise exception 'MULTIPLE_CHOICE_ANSWER_INVALID'; end if;
 elsif exists(select 1 from public.question_solutions where question_id=qid and correct_choice_id is not null) then raise exception 'MULTIPLE_CHOICE_ANSWER_INVALID'; end if;
 return null;
end $$;

-- 6. The browser can update its own time zone directly, so the database validates it too.
create function public.guard_profile_time_zone() returns trigger language plpgsql set search_path='' as $$
begin
 if new.time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then raise exception 'INVALID_TIME_ZONE'; end if;
 return new;
end $$;
create trigger profile_time_zone_guard before insert or update of time_zone on public.profiles for each row execute function public.guard_profile_time_zone();

-- 7. Null lease durations raise the documented error instead of a constraint violation.
create or replace function public.claim_revision_job(p_worker uuid,p_lease_seconds integer default 120)
returns setof public.jobs language plpgsql security definer set search_path='' as $$
begin
 if p_worker is null or p_lease_seconds is null or p_lease_seconds not between 30 and 600 then raise exception 'INVALID_LEASE'; end if;
 update public.jobs set status='failed',error_code='RETRY_EXHAUSTED',lease_token=null,lease_expires_at=null,updated_at=now()
 where status='running' and lease_expires_at<=now() and attempt_count>=3;
 return query with candidate as (
  select id from public.jobs where attempt_count<3 and run_after<=now()
  and (status='queued' or (status='running' and lease_expires_at<=now()))
  order by run_after,created_at,id for update skip locked limit 1
 ) update public.jobs j set status='running',attempt_count=j.attempt_count+1,
  lease_token=p_worker,lease_expires_at=now()+p_lease_seconds*interval '1 second',updated_at=now()
 from candidate c where j.id=c.id returning j.*;
end $$;
create or replace function public.heartbeat_revision_job(p_id uuid,p_worker uuid,p_attempt integer,p_lease_seconds integer default 120)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_lease_seconds is null or p_lease_seconds not between 30 and 600 then raise exception 'INVALID_LEASE'; end if;
 update public.jobs set lease_expires_at=now()+p_lease_seconds*interval '1 second',updated_at=now()
 where id=p_id and status='running' and lease_token=p_worker and attempt_count=p_attempt and lease_expires_at>now();
 return found;
end $$;

-- 8. Attempts may only be opened on validated questions.
create function public.guard_attempt_question() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.generated_questions where id=new.question_id and validation_status='validated') then raise exception 'QUESTION_NOT_VALIDATED'; end if;
 return new;
end $$;
create trigger attempt_question_guard before insert on public.attempts for each row execute function public.guard_attempt_question();

-- 9. Practice attempts: one draft per learner/question, server-timed submission, idempotent marking job.
create unique index one_practice_draft on public.attempts(user_id,question_id) where mock_id is null and status='draft';
create function public.start_revision_practice(p_user uuid,p_question uuid)
returns public.attempts language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 if p_user is null or p_question is null then raise exception 'INVALID_PRACTICE_REQUEST'; end if;
 insert into public.attempts(user_id,question_id) values(p_user,p_question)
 on conflict(user_id,question_id) where mock_id is null and status='draft' do nothing;
 select * into a from public.attempts where user_id=p_user and question_id=p_question and mock_id is null and status='draft';
 return a;
end $$;
create function public.submit_revision_attempt(p_id uuid,p_user uuid)
returns public.attempts language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if a.mock_id is not null then raise exception 'MOCK_ATTEMPT_REQUIRES_MOCK_SUBMISSION'; end if;
 if a.status<>'draft' then return a; end if;
 update public.attempts set status='submitted',submitted_at=now(),last_activity_at=now(),
 seconds_spent=least(86400,seconds_spent+greatest(0,least(300,extract(epoch from now()-last_activity_at)::integer)))
 where id=p_id returning * into a;
 insert into public.jobs(user_id,kind,payload,idempotency_key) values(p_user,'mark_attempt',jsonb_build_object('attempt_id',p_id),'mark:'||p_id::text)
 on conflict(user_id,idempotency_key) do nothing;
 return a;
end $$;

-- 10. Mock status follows its attempts once submitted.
create function public.refresh_revision_mock(p_mock uuid)
returns public.mock_exams language plpgsql security definer set search_path='' as $$
declare m public.mock_exams; pending integer; held integer; target text;
begin
 select * into m from public.mock_exams where id=p_mock for update;
 if not found or m.status not in ('submitted','marking','review','marked') then return m; end if;
 select count(*) filter(where status in ('draft','submitted','marking')),count(*) filter(where status='review') into pending,held from public.attempts where mock_id=p_mock;
 target:=case when pending>0 then 'marking' when held>0 then 'review' else 'marked' end;
 if target<>m.status then update public.mock_exams set status=target where id=p_mock returning * into m; end if;
 return m;
end $$;
-- A held or unmarked submitted answer can be queued again (bounded); answers stay immutable.
create function public.requeue_revision_marking(p_attempt uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.attempts; n integer;
begin
 select * into a from public.attempts where id=p_attempt and user_id=p_user for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if a.status not in ('submitted','marking','review') then return false; end if;
 if exists(select 1 from public.jobs where user_id=p_user and kind='mark_attempt' and payload->>'attempt_id'=p_attempt::text and status in ('queued','running')) then return false; end if;
 select count(*) into n from public.jobs where user_id=p_user and kind='mark_attempt' and payload->>'attempt_id'=p_attempt::text;
 if n>=4 then return false; end if;
 insert into public.jobs(user_id,kind,payload,idempotency_key) values(p_user,'mark_attempt',jsonb_build_object('attempt_id',p_attempt),'mark:'||p_attempt::text||':'||(n+1)::text);
 update public.attempts set status='marking' where id=p_attempt;
 if a.mock_id is not null then perform public.refresh_revision_mock(a.mock_id); end if;
 return true;
end $$;

-- 11. Store a generated question, its hidden solution and criteria in one transaction, then set its state.
create function public.store_revision_question(p_user uuid,p_question jsonb,p_status text default 'validated')
returns uuid language plpgsql security definer set search_path='' as $$
declare qid uuid:=gen_random_uuid(); c jsonb; h text;
begin
 if p_user is null or p_question is null or jsonb_typeof(p_question)<>'object' or p_status is null or p_status not in ('validated','review','rejected') then raise exception 'INVALID_QUESTION_PAYLOAD'; end if;
 h:=encode(sha256(convert_to(concat_ws(chr(31),p_question->>'subject_code',p_question->>'topic_id',p_question->>'prompt',(p_question->'choices')::text),'UTF8')),'hex');
 if exists(select 1 from public.generated_questions where user_id=p_user and content_hash=h) then raise exception 'DUPLICATE_QUESTION'; end if;
 insert into public.generated_questions(id,user_id,subject_code,topic_id,prompt,structured_content,choices,marks,difficulty,format,command_word,content_hash)
 values(qid,p_user,p_question->>'subject_code',(p_question->>'topic_id')::uuid,p_question->>'prompt',coalesce(p_question->'structured_content','[]'::jsonb),
  coalesce(p_question->'choices','[]'::jsonb),(p_question->>'marks')::integer,p_question->>'difficulty',p_question->>'format',p_question->>'command_word',h);
 insert into public.question_solutions(question_id,model_answer,correct_choice_id,examiner_explanation,common_mistakes,numerical_checks,verification)
 values(qid,p_question->>'model_answer',p_question->>'correct_choice_id',p_question->>'examiner_explanation',
  array(select jsonb_array_elements_text(coalesce(p_question->'common_mistakes','[]'::jsonb))),coalesce(p_question->'numerical_checks','[]'::jsonb),coalesce(p_question->'verification','{}'::jsonb));
 for c in select value from jsonb_array_elements(coalesce(p_question->'criteria','[]'::jsonb)) loop
  insert into public.mark_criteria(question_id,criterion_key,description,marks,allow_ecf,ecf_rule,acceptable_alternatives)
  values(qid,c->>'key',c->>'description',(c->>'marks')::integer,coalesce((c->>'allow_ecf')::boolean,false),c->>'ecf_rule',
   array(select jsonb_array_elements_text(coalesce(c->'acceptable_alternatives','[]'::jsonb))));
 end loop;
 update public.generated_questions set validation_status=p_status where id=qid;
 return qid;
end $$;

-- 12. Record a marking run with its criterion awards atomically. Accepted runs are validated by the
--     deferred integrity triggers at commit; held runs keep the attempt in review.
create function public.record_revision_marking(p_user uuid,p_attempt uuid,p_run jsonb,p_accept boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts; rid uuid:=gen_random_uuid(); w jsonb; cid uuid;
begin
 if p_run is null or jsonb_typeof(p_run)<>'object' or p_accept is null then raise exception 'INVALID_MARKING_PAYLOAD'; end if;
 select * into a from public.attempts where id=p_attempt and user_id=p_user for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 if a.status not in ('submitted','marking','review') then raise exception 'ATTEMPT_NOT_AWAITING_MARKING'; end if;
 insert into public.marking_runs(id,attempt_id,user_id,question_id,earned_marks,available_marks,confidence,feedback,misconceptions,model_id,input_sha256,verification)
 values(rid,a.id,p_user,a.question_id,(p_run->>'earned_marks')::integer,(p_run->>'available_marks')::integer,(p_run->>'confidence')::numeric,p_run->>'feedback',
  array(select jsonb_array_elements_text(coalesce(p_run->'misconceptions','[]'::jsonb))),p_run->>'model_id',p_run->>'input_sha256',coalesce(p_run->'verification','{}'::jsonb));
 for w in select value from jsonb_array_elements(coalesce(p_run->'awards','[]'::jsonb)) loop
  select id into cid from public.mark_criteria where question_id=a.question_id and criterion_key=w->>'criterion_key';
  if not found then raise exception 'UNKNOWN_CRITERION'; end if;
  insert into public.criterion_awards(run_id,criterion_id,question_id,marks,evidence,ecf,explanation)
  values(rid,cid,a.question_id,(w->>'marks')::integer,coalesce(w->>'evidence',''),coalesce((w->>'ecf')::boolean,false),w->>'explanation');
 end loop;
 if p_accept then
  update public.marking_runs set status='validated' where id=rid;
  update public.attempts set status='marked',accepted_marking_id=rid where id=a.id;
 else
  update public.marking_runs set status='review' where id=rid;
  update public.attempts set status='review' where id=a.id;
 end if;
 if a.mock_id is not null then perform public.refresh_revision_mock(a.mock_id); end if;
 return rid;
end $$;

-- 13. Analytics source rows: the accepted validated run of each marked attempt only.
create function public.revision_performance(p_user uuid)
returns table(attempt_id uuid,topic_id uuid,subject_code text,earned integer,available integer,seconds integer,submitted_at timestamptz,misconceptions text[],accepted_validated boolean)
language sql stable security definer set search_path='' as $$
 select a.id,q.topic_id,q.subject_code,r.earned_marks,r.available_marks,a.seconds_spent,a.submitted_at,r.misconceptions,true
 from public.attempts a join public.generated_questions q on q.id=a.question_id join public.marking_runs r on r.id=a.accepted_marking_id
 where a.user_id=p_user and a.status='marked' and r.status='validated' and r.attempt_id=a.id
$$;

-- 14. Erasure preparation: stop work and mark documents before Storage purge and Auth deletion.
create function public.begin_revision_erasure(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null then raise exception 'INVALID_USER'; end if;
 update public.jobs set status='cancelled',lease_token=null,lease_expires_at=null,updated_at=now() where user_id=p_user and status in ('queued','running');
 update public.documents set status='deleting' where user_id=p_user;
end $$;

-- 15. Server-side submission of timed mocks whose deadline has passed.
create function public.submit_expired_revision_mocks(p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
 for r in select id,user_id from public.mock_exams where status='active' and deadline<=now() order by deadline
  limit greatest(1,least(coalesce(p_limit,20),100)) for update skip locked loop
  perform public.submit_revision_mock(r.id,r.user_id); n:=n+1;
 end loop;
 return n;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('guard_profile_time_zone','guard_attempt_question',
  'start_revision_practice','submit_revision_attempt','refresh_revision_mock','requeue_revision_marking','store_revision_question','record_revision_marking',
  'revision_performance','begin_revision_erasure','submit_expired_revision_mocks') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  if f.proname not in ('guard_profile_time_zone','guard_attempt_question') then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;
commit;
