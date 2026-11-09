begin;
create function public.claim_revision_job(p_worker uuid,p_lease_seconds integer default 120)
returns setof public.jobs language plpgsql security definer set search_path='' as $$
begin
 if p_worker is null or p_lease_seconds not between 30 and 600 then raise exception 'INVALID_LEASE'; end if;
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
create function public.heartbeat_revision_job(p_id uuid,p_worker uuid,p_attempt integer,p_lease_seconds integer default 120)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_lease_seconds not between 30 and 600 then raise exception 'INVALID_LEASE'; end if;
 update public.jobs set lease_expires_at=now()+p_lease_seconds*interval '1 second',updated_at=now()
 where id=p_id and status='running' and lease_token=p_worker and attempt_count=p_attempt and lease_expires_at>now();
 return found;
end $$;
create function public.finish_revision_job(p_id uuid,p_worker uuid,p_attempt integer,p_output jsonb,p_status text default 'succeeded')
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('succeeded','review','failed') or p_status is null or p_output is null or jsonb_typeof(p_output)<>'object' then raise exception 'INVALID_JOB_RESULT'; end if;
 update public.jobs set status=p_status,output=p_output,lease_token=null,lease_expires_at=null,updated_at=now()
 where id=p_id and status='running' and lease_token=p_worker and attempt_count=p_attempt and lease_expires_at>now();
 return found;
end $$;
create function public.retry_revision_job(p_id uuid,p_worker uuid,p_attempt integer,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{3,80}$' then raise exception 'INVALID_ERROR_CODE'; end if;
 update public.jobs set status=case when attempt_count>=3 then 'failed' else 'queued' end,
 error_code=p_error_code,lease_token=null,lease_expires_at=null,
 run_after=now()+least(300,power(2,attempt_count)::integer*5)*interval '1 second',updated_at=now()
 where id=p_id and status='running' and lease_token=p_worker and attempt_count=p_attempt and lease_expires_at>now();
 return found;
end $$;
create function public.consume_revision_usage(p_user uuid,p_feature text,p_limit integer,p_amount integer default 1)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_limit is null or p_amount is null or p_limit not between 1 and 10000 or p_amount not between 1 and p_limit or p_feature is null or p_feature !~ '^[a-z_]{3,40}$' then raise exception 'INVALID_QUOTA_ARGUMENTS'; end if;
 insert into public.usage_counters(user_id,period,feature,used)
 values(p_user,(now() at time zone 'UTC')::date,p_feature,p_amount)
 on conflict(user_id,period,feature) do update set used=public.usage_counters.used+excluded.used
 where public.usage_counters.used+excluded.used<=p_limit returning used into n;
 return found;
end $$;
create function public.start_revision_mock(p_id uuid,p_user uuid)
returns public.mock_exams language plpgsql security definer set search_path='' as $$
declare m public.mock_exams; b public.paper_blueprints; extra integer;
begin
 select * into m from public.mock_exams where id=p_id and user_id=p_user for update;
 if not found then raise exception 'MOCK_NOT_FOUND'; end if;
 if m.status='active' then return m; end if;
 if m.status<>'ready' then raise exception 'MOCK_NOT_READY'; end if;
 select * into b from public.paper_blueprints where id=m.blueprint_id;
 if b.verified_at is null then raise exception 'BLUEPRINT_NOT_VERIFIED'; end if;
 select extra_time_percent into extra from public.profiles where user_id=p_user;
 update public.mock_exams set status='active',started_at=now(),
 allotted_seconds=b.duration_minutes*60*(100+coalesce(extra,0))/100,
 deadline=now()+b.duration_minutes*60*(100+coalesce(extra,0))/100*interval '1 second'
 where id=p_id returning * into m;
 insert into public.attempts(user_id,question_id,mock_id)
 select p_user,question_id,p_id from public.mock_exam_questions where mock_id=p_id
 on conflict(mock_id,question_id) where mock_id is not null do nothing;
 return m;
end $$;
create function public.save_revision_answer(p_id uuid,p_user uuid,p_answer text)
returns public.attempts language plpgsql security definer set search_path='' as $$
declare a public.attempts; m public.mock_exams;
begin
 if p_answer is null or length(p_answer)>20000 then raise exception 'INVALID_ANSWER'; end if;
 select * into a from public.attempts where id=p_id and user_id=p_user;
 if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
 -- Consistent lock order with submission: mock, then attempt.
 if a.mock_id is not null then
  select * into m from public.mock_exams where id=a.mock_id for update;
  if m.status<>'active' or now()>=m.deadline then raise exception 'EXAM_CLOSED'; end if;
 end if;
 select * into a from public.attempts where id=p_id and user_id=p_user for update;
 if a.status<>'draft' then raise exception 'ANSWER_LOCKED'; end if;
 update public.attempts set answer=p_answer,
 seconds_spent=least(86400,seconds_spent+greatest(0,least(300,extract(epoch from now()-last_activity_at)::integer))),last_activity_at=now()
 where id=p_id returning * into a;
 return a;
end $$;
create function public.submit_revision_mock(p_id uuid,p_user uuid)
returns public.mock_exams language plpgsql security definer set search_path='' as $$
declare m public.mock_exams;
begin
 select * into m from public.mock_exams where id=p_id and user_id=p_user for update;
 if not found then raise exception 'MOCK_NOT_FOUND'; end if;
 if m.status in ('submitted','marking','marked','review') then return m; end if;
 if m.status<>'active' then raise exception 'MOCK_NOT_ACTIVE'; end if;
 update public.attempts set status='submitted',submitted_at=now() where mock_id=p_id and status='draft';
 insert into public.jobs(user_id,kind,payload,idempotency_key)
 select p_user,'mark_attempt',jsonb_build_object('attempt_id',id),'mark:'||id::text from public.attempts where mock_id=p_id
 on conflict(user_id,idempotency_key) do nothing;
 update public.mock_exams set status='submitted',submitted_at=now() where id=p_id returning * into m;
 return m;
end $$;
create function public.freeze_revision_mock() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status not in ('building','ready','failed') and (
 new.user_id<>old.user_id or new.subject_code<>old.subject_code or new.blueprint_id<>old.blueprint_id
 or new.started_at is distinct from old.started_at or new.deadline is distinct from old.deadline
 or new.allotted_seconds is distinct from old.allotted_seconds or new.status in ('building','ready')) then raise exception 'MOCK_STRUCTURE_LOCKED'; end if;
 return new;
end $$;
create trigger mock_structure_locked before update on public.mock_exams for each row execute function public.freeze_revision_mock();
create function public.freeze_revision_mock_item() returns trigger language plpgsql security definer set search_path='' as $$
declare old_id uuid; new_id uuid;
begin
 if TG_OP<>'INSERT' then old_id:=old.mock_id; end if;
 if TG_OP<>'DELETE' then new_id:=new.mock_id; end if;
 if exists(select 1 from public.mock_exams where id in (old_id,new_id) and status not in ('building','failed')) then raise exception 'MOCK_ITEMS_LOCKED'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger mock_items_locked before insert or update or delete on public.mock_exam_questions for each row execute function public.freeze_revision_mock_item();
create function public.guard_revision_mock_answer() returns trigger language plpgsql security definer set search_path='' as $$
declare changed boolean; m public.mock_exams;
begin
 if new.mock_id is null then return new; end if;
 if TG_OP='INSERT' then changed:=true; else changed:=new.answer is distinct from old.answer or new.answer_document_id is distinct from old.answer_document_id; end if;
 select * into m from public.mock_exams where id=new.mock_id;
 if changed and (m.status<>'active' or now()>=m.deadline) then raise exception 'EXAM_CLOSED'; end if;
 return new;
end $$;
create trigger mock_answer_guard before insert or update on public.attempts for each row execute function public.guard_revision_mock_answer();
-- Service role only: p_user must come from a verified server session, never the browser.
do $$ declare f record; begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('claim_revision_job','heartbeat_revision_job','finish_revision_job','retry_revision_job','consume_revision_usage','start_revision_mock','save_revision_answer','submit_revision_mock','freeze_revision_mock','freeze_revision_mock_item','guard_revision_mock_answer') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  if f.proname not in ('freeze_revision_mock','freeze_revision_mock_item','guard_revision_mock_answer') then execute format('grant execute on function %s to service_role',f.sig); end if;
 end loop;
end $$;
commit;
