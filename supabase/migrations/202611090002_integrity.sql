begin;
create function public.check_question_integrity() returns trigger language plpgsql security definer set search_path='' as $$
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
 return null;
end $$;
create constraint trigger question_integrity after insert or update on public.generated_questions deferrable initially deferred for each row execute function public.check_question_integrity();
create constraint trigger criteria_integrity after insert or update or delete on public.mark_criteria deferrable initially deferred for each row execute function public.check_question_integrity();
create constraint trigger solution_integrity after insert or update or delete on public.question_solutions deferrable initially deferred for each row execute function public.check_question_integrity();

create function public.check_marking_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; r public.marking_runs; a public.attempts; q public.generated_questions; n integer; total integer;
begin
 if TG_TABLE_NAME='marking_runs' then rid:=coalesce(new.id,old.id); else rid:=coalesce(new.run_id,old.run_id); end if;
 select * into r from public.marking_runs where id=rid;
 if not found then return null; end if;
 select * into a from public.attempts where id=r.attempt_id;
 select * into q from public.generated_questions where id=r.question_id;
 if r.available_marks<>q.marks then raise exception 'MARKING_MAXIMUM_MISMATCH'; end if;
 if exists(select 1 from public.criterion_awards w join public.mark_criteria c on c.id=w.criterion_id where w.run_id=rid and (w.marks>c.marks or (w.ecf and (not c.allow_ecf or w.marks=0)))) then raise exception 'CRITERION_AWARD_INVALID'; end if;
 if r.status<>'validated' then return null; end if;
 if a.status not in ('submitted','marking','marked') then raise exception 'ANSWER_NOT_SUBMITTED'; end if;
 if a.mock_id is not null and exists(select 1 from public.mock_exams where id=a.mock_id and status in ('building','ready','active')) then raise exception 'MOCK_NOT_SUBMITTED'; end if;
 if q.validation_status<>'validated' then raise exception 'QUESTION_NOT_VALIDATED'; end if;
 if r.confidence<0.85 then raise exception 'MARKING_REQUIRES_REVIEW'; end if;
 if r.verification->>'status' is distinct from 'pass' then raise exception 'MARKING_VERIFICATION_MISSING'; end if;
 select count(*),coalesce(sum(marks),0) into n,total from public.criterion_awards where run_id=rid;
 if n<>(select count(*) from public.mark_criteria where question_id=q.id) or total<>r.earned_marks then raise exception 'AWARD_TOTAL_MISMATCH'; end if;
 if exists(select 1 from public.criterion_awards w where w.run_id=rid and w.marks>0 and (length(trim(w.evidence))=0 or strpos(lower(a.answer),lower(trim(w.evidence)))=0)) then raise exception 'AWARD_EVIDENCE_INVALID'; end if;
 return null;
end $$;
create constraint trigger marking_integrity after insert or update on public.marking_runs deferrable initially deferred for each row execute function public.check_marking_integrity();
create constraint trigger awards_integrity after insert or update or delete on public.criterion_awards deferrable initially deferred for each row execute function public.check_marking_integrity();
create function public.check_accepted_marking() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=new.id;
 if a.status='marked' and not exists(select 1 from public.marking_runs where id=a.accepted_marking_id and attempt_id=a.id and user_id=a.user_id and status='validated') then raise exception 'ACCEPTED_MARKING_NOT_VALIDATED'; end if;
 return null;
end $$;
create constraint trigger accepted_marking_integrity after insert or update on public.attempts deferrable initially deferred for each row execute function public.check_accepted_marking();

create function public.check_mock_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid; m public.mock_exams; b public.paper_blueprints; total integer; n integer; last_position integer;
begin
 if TG_TABLE_NAME='mock_exams' then mid:=coalesce(new.id,old.id); else mid:=coalesce(new.mock_id,old.mock_id); end if;
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
create constraint trigger mock_integrity after insert or update on public.mock_exams deferrable initially deferred for each row execute function public.check_mock_integrity();
create constraint trigger mock_items_integrity after insert or update or delete on public.mock_exam_questions deferrable initially deferred for each row execute function public.check_mock_integrity();

create function public.lock_submitted_answer() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status<>'draft' and (new.answer is distinct from old.answer or new.question_id is distinct from old.question_id or new.user_id is distinct from old.user_id or new.mock_id is distinct from old.mock_id or new.answer_document_id is distinct from old.answer_document_id or new.submitted_at is distinct from old.submitted_at or new.status='draft') then raise exception 'ANSWER_LOCKED'; end if;
 return new;
end $$;
create trigger submitted_answer_locked before update on public.attempts for each row execute function public.lock_submitted_answer();
create function public.freeze_validated_question() returns trigger language plpgsql set search_path='' as $$
begin if old.validation_status='validated' and new is distinct from old then raise exception 'VALIDATED_QUESTION_IMMUTABLE'; end if; return new; end $$;
create trigger validated_question_immutable before update on public.generated_questions for each row execute function public.freeze_validated_question();
create function public.freeze_validated_solution() returns trigger language plpgsql security definer set search_path='' as $$
declare old_q uuid; new_q uuid;
begin
 if TG_OP<>'INSERT' then old_q:=old.question_id; end if;
 if TG_OP<>'DELETE' then new_q:=new.question_id; end if;
 if exists(select 1 from public.generated_questions where id in (old_q,new_q) and validation_status='validated') then raise exception 'VALIDATED_SOLUTION_IMMUTABLE'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger solution_immutable before insert or update or delete on public.question_solutions for each row execute function public.freeze_validated_solution();
create trigger criteria_immutable before insert or update or delete on public.mark_criteria for each row execute function public.freeze_validated_solution();
-- Immutable accepted evaluations. New marking runs preserve earlier audit evidence.
create function public.freeze_validated_marking() returns trigger language plpgsql set search_path='' as $$
begin if old.status='validated' and new is distinct from old then raise exception 'VALIDATED_MARKING_IMMUTABLE'; end if; return new; end $$;
create trigger marking_immutable before update on public.marking_runs for each row execute function public.freeze_validated_marking();
create function public.freeze_validated_award() returns trigger language plpgsql security definer set search_path='' as $$
declare old_run uuid; new_run uuid;
begin
 if TG_OP<>'INSERT' then old_run:=old.run_id; end if;
 if TG_OP<>'DELETE' then new_run:=new.run_id; end if;
 if exists(select 1 from public.marking_runs where id in (old_run,new_run) and status='validated') then raise exception 'VALIDATED_AWARD_IMMUTABLE'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger awards_immutable before insert or update or delete on public.criterion_awards for each row execute function public.freeze_validated_award();
-- Build drafts, insert children, then transition to validated within the same transaction.
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('check_question_integrity','check_marking_integrity','check_accepted_marking','check_mock_integrity','lock_submitted_answer','freeze_validated_question','freeze_validated_solution','freeze_validated_marking','freeze_validated_award') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop;
end $$;
commit;
