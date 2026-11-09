begin;
create table public.science_programmes(
 programme_key text primary key check(programme_key in('double_award','separate_sciences')),
 title text not null,award_count smallint not null check(award_count in(2,3)),
 check((programme_key='double_award' and award_count=2) or(programme_key='separate_sciences' and award_count=3))
);
create table public.science_qualifications(
 code text primary key check(code in('4SD0','4BI1','4CH1','4PH1')),
 title text not null,subject_code text references public.subjects(code),
 award_count smallint not null,paper_count smallint not null,total_marks integer not null,
 exam_tier text not null default 'untiered' check(exam_tier='untiered'),
 source_url text not null check(source_url like 'https://qualifications.pearson.com/%'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),verified_at timestamptz,
 check(case when code='4SD0' then subject_code is null and award_count=2 and paper_count=3 and total_marks=330
 else subject_code is not null and code=subject_code and award_count=1 and paper_count=2 and total_marks=180 end)
);
create table public.programme_qualifications(
 programme_key text not null references public.science_programmes(programme_key),
 qualification_code text not null references public.science_qualifications(code),
 primary key(programme_key,qualification_code)
);
create table public.qualification_papers(
 qualification_code text not null references public.science_qualifications(code),
 blueprint_id uuid not null,subject_code text not null,paper_reference text not null,
 foreign key(blueprint_id,subject_code) references public.paper_blueprints(id,subject_code),
 primary key(qualification_code,blueprint_id),unique(qualification_code,paper_reference)
);
create function public.check_qualification_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare qcode text;q public.science_qualifications;n integer;marks integer;subjects integer;
begin
 if TG_TABLE_NAME='science_qualifications' then qcode:=coalesce(new.code,old.code);else qcode:=coalesce(new.qualification_code,old.qualification_code);end if;
 select * into q from public.science_qualifications where code=qcode;
 if not found or q.verified_at is null then return null;end if;
 select count(*),coalesce(sum(b.total_marks),0),count(distinct p.subject_code) into n,marks,subjects
 from public.qualification_papers p join public.paper_blueprints b on b.id=p.blueprint_id where p.qualification_code=qcode;
 if n<>q.paper_count or marks<>q.total_marks or(q.code='4SD0' and subjects<>3) or(q.code<>'4SD0' and subjects<>1) then raise exception 'QUALIFICATION_PAPER_TOTAL_MISMATCH';end if;
 if exists(select 1 from public.qualification_papers p join public.paper_blueprints b on b.id=p.blueprint_id
 where p.qualification_code=qcode and(b.verified_at is null or(q.subject_code is not null and p.subject_code<>q.subject_code)
 or(q.code='4SD0' and(not b.core_only or b.code not in('4BI1/1B','4CH1/1C','4PH1/1P')))
 or p.paper_reference<>case when q.code='4SD0' then '4SD0/'||split_part(b.code,'/',2) else b.code end))
 then raise exception 'PAPER_NOT_ELIGIBLE_FOR_QUALIFICATION';end if;
 return null;
end $$;
create constraint trigger qualification_integrity after insert or update on public.science_qualifications deferrable initially deferred for each row execute function public.check_qualification_integrity();
create constraint trigger qualification_papers_integrity after insert or update or delete on public.qualification_papers deferrable initially deferred for each row execute function public.check_qualification_integrity();
create function public.check_programme_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare key text;n integer;awards integer;
begin
 key:=coalesce(new.programme_key,old.programme_key);
 if not exists(select 1 from public.science_programmes where programme_key=key) then return null;end if;
 select count(*),coalesce(sum(q.award_count),0) into n,awards from public.programme_qualifications p join public.science_qualifications q on q.code=p.qualification_code where p.programme_key=key;
 if(key='double_award' and(n<>1 or awards<>2 or not exists(select 1 from public.programme_qualifications where programme_key=key and qualification_code='4SD0')))
 or(key='separate_sciences' and(n<>3 or awards<>3 or exists(select 1 from public.programme_qualifications where programme_key=key and qualification_code='4SD0')))
 then raise exception 'PROGRAMME_QUALIFICATIONS_INVALID';end if;return null;
end $$;
create constraint trigger programme_integrity after insert or update on public.science_programmes deferrable initially deferred for each row execute function public.check_programme_integrity();
create constraint trigger programme_membership_integrity after insert or update or delete on public.programme_qualifications deferrable initially deferred for each row execute function public.check_programme_integrity();

do $$declare t text;begin
 foreach t in array array['science_programmes','science_qualifications','programme_qualifications','qualification_papers'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy catalog_read on public.%I for select to anon,authenticated using(true)',t);
 end loop;
end $$;
insert into public.science_programmes values('double_award','Science Double Award',2),('separate_sciences','Separate sciences (triple)',3);
insert into public.science_qualifications(code,title,subject_code,award_count,paper_count,total_marks,source_url,source_sha256)
select s.subject_code,subjects.name,s.subject_code,1,2,180,s.source_url,s.source_sha256
from public.specification_versions s join public.subjects on subjects.code=s.subject_code;
insert into public.science_qualifications(code,title,award_count,paper_count,total_marks,source_url,source_sha256) values
('4SD0','Science Double Award',2,3,330,'https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Science%20(Double%20Award)/2017/specification-and-sample-assessments/international-gcse-science-double-award-2017-specification1.pdf','5780fb046368974e2aad45415448682634a8e9afcab77bfd29fdf61cec56ac17');
insert into public.programme_qualifications values('double_award','4SD0'),('separate_sciences','4BI1'),('separate_sciences','4CH1'),('separate_sciences','4PH1');
insert into public.qualification_papers(qualification_code,blueprint_id,subject_code,paper_reference)
select b.subject_code,b.id,b.subject_code,b.code from public.paper_blueprints b;
insert into public.qualification_papers(qualification_code,blueprint_id,subject_code,paper_reference)
select '4SD0',b.id,b.subject_code,'4SD0/'||split_part(b.code,'/',2) from public.paper_blueprints b where b.core_only;
update public.science_qualifications set verified_at='2026-11-09T20:50:33Z';

alter table public.profiles add column programme_key text references public.science_programmes(programme_key);
alter table public.profiles add column practice_difficulty text not null default 'stretch' check(practice_difficulty in('standard','stretch','challenge'));
grant update(programme_key,practice_difficulty) on public.profiles to authenticated;
-- Legacy unclassified mock rows remain readable; new application requests require a programme.
alter table public.mock_exams add column qualification_code text;
alter table public.mock_exams add constraint mock_qualification_paper foreign key(qualification_code,blueprint_id) references public.qualification_papers(qualification_code,blueprint_id);
create function public.guard_mock_programme() returns trigger language plpgsql security definer set search_path='' as $$
declare programme text;
begin
 if new.qualification_code is null then return new;end if;
 select programme_key into programme from public.profiles where user_id=new.user_id;
 if programme is not null and not exists(select 1 from public.programme_qualifications where programme_key=programme and qualification_code=new.qualification_code)
 then raise exception 'QUALIFICATION_OUTSIDE_LEARNER_PROGRAMME';end if;return new;
end $$;
create trigger mock_programme_guard before insert or update of qualification_code,blueprint_id on public.mock_exams for each row execute function public.guard_mock_programme();

-- Preserve immutable historical rows without offering or accepting new foundation practice.
alter table public.generated_questions drop constraint generated_questions_difficulty_check;
alter table public.generated_questions add constraint generated_questions_difficulty_check check(difficulty in('foundation','standard','stretch','challenge'));
create function public.guard_new_question_difficulty() returns trigger language plpgsql set search_path='' as $$
begin if new.difficulty='foundation' then raise exception 'FOUNDATION_PRACTICE_DISABLED';end if;return new;end $$;
create trigger new_question_difficulty before insert on public.generated_questions for each row execute function public.guard_new_question_difficulty();
revoke all on function public.check_qualification_integrity(),public.check_programme_integrity(),public.guard_mock_programme(),public.guard_new_question_difficulty() from public,anon,authenticated;
commit;
