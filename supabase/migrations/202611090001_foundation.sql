begin;

create table public.subjects (
 code text primary key check(code in ('4BI1','4CH1','4PH1')),
 name text not null, accent text not null
);
create table public.specification_versions (
 id uuid primary key default gen_random_uuid(),
 subject_code text not null references public.subjects(code), issue text not null,
 source_url text not null check(source_url like 'https://qualifications.pearson.com/%'),
 source_sha256 text check(source_sha256 ~ '^[a-f0-9]{64}$'), checked_at timestamptz,
 unique(subject_code,issue), unique(id,subject_code),
 check(checked_at is null or source_sha256 is not null)
);
create table public.topics (
 id uuid primary key default gen_random_uuid(), specification_id uuid not null, subject_code text not null,
 parent_id uuid, kind text not null check(kind in ('group','objective')),
 reference text not null, title text not null, summary text not null,
 scope text not null check(scope in ('core','extended','mixed')), verified boolean not null default false,
 foreign key(specification_id,subject_code) references public.specification_versions(id,subject_code),
 unique(id,subject_code), unique(id,specification_id,subject_code), unique(specification_id,reference),
 foreign key(parent_id,specification_id,subject_code) references public.topics(id,specification_id,subject_code),
 check(parent_id is null or parent_id<>id), check(kind<>'objective' or scope<>'mixed')
);
create table public.paper_blueprints (
 id uuid primary key default gen_random_uuid(), specification_id uuid not null, subject_code text not null,
 code text not null unique, title text not null,
 total_marks integer not null check(total_marks between 1 and 300),
 duration_minutes integer not null check(duration_minutes between 1 and 360), core_only boolean not null,
 verified_at timestamptz, source_pages text not null,
 foreign key(specification_id,subject_code) references public.specification_versions(id,subject_code), unique(id,subject_code)
);
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80), time_zone text not null default 'UTC',
 daily_goal_minutes integer not null default 20 check(daily_goal_minutes between 5 and 180),
 extra_time_percent integer not null default 0 check(extra_time_percent in (0,25,50,100)),
 created_at timestamptz not null default now()
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 subject_code text not null references public.subjects(code),
 kind text not null check(kind in ('paper','mark_scheme','examiner_report','answer_sheet')),
 file_name text not null check(length(file_name) between 1 and 255), object_path text not null unique,
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 26214400),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), page_count integer check(page_count between 1 and 100),
 status text not null default 'awaiting_upload' check(status in ('awaiting_upload','queued','processing','ready','review','failed','deleting')),
 rights_attested_at timestamptz not null, error_code text, created_at timestamptz not null default now(),
 unique(id,user_id), unique(id,user_id,subject_code),
 check(object_path = user_id::text || '/' || id::text || '/original.' || case mime_type when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end)
);
create table public.document_pages (
 document_id uuid not null, user_id uuid not null, page_number integer not null check(page_number between 1 and 100),
 width numeric not null check(width>0), height numeric not null check(height>0),
 text_content text not null check(length(text_content)<=250000), blocks jsonb not null default '[]'::jsonb check(jsonb_typeof(blocks)='array'),
 image_path text, ocr_confidence numeric check(ocr_confidence between 0 and 1), needs_review boolean not null default true,
 foreign key(document_id,user_id) references public.documents(id,user_id) on delete cascade,
 primary key(document_id,page_number), unique(document_id,user_id,page_number),
 check(image_path is null or image_path ~ ('^'||user_id::text||'/'||document_id::text||'/pages/[1-9][0-9]{0,2}[.]png$'))
);
create table public.extracted_questions (
 id uuid primary key default gen_random_uuid(), document_id uuid not null, user_id uuid not null, subject_code text not null,
 question_label text not null, parent_label text, page_number integer not null, prompt text not null,
 marks integer check(marks between 1 and 100), command_word text, question_type text,
 topic_candidates jsonb not null default '[]'::jsonb check(jsonb_typeof(topic_candidates)='array'),
 required_knowledge jsonb not null default '[]'::jsonb check(jsonb_typeof(required_knowledge)='array'),
 source_regions jsonb not null check(jsonb_typeof(source_regions)='array'),
 structured_content jsonb not null default '[]'::jsonb check(jsonb_typeof(structured_content)='array'), needs_review boolean not null default true,
 foreign key(document_id,user_id,subject_code) references public.documents(id,user_id,subject_code) on delete cascade,
 foreign key(document_id,user_id,page_number) references public.document_pages(document_id,user_id,page_number) on delete cascade,
 unique(document_id,question_label)
);
create table public.generated_questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 subject_code text not null, topic_id uuid not null,
 prompt text not null check(length(prompt) between 12 and 12000),
 structured_content jsonb not null default '[]'::jsonb check(jsonb_typeof(structured_content)='array'),
 choices jsonb not null default '[]'::jsonb check(jsonb_typeof(choices)='array'),
 marks integer not null check(marks between 1 and 12), difficulty text not null check(difficulty in ('foundation','standard','challenge')),
 format text not null check(format in ('short_answer','multiple_choice','calculation','extended_response')),
 command_word text not null, examination_style text not null default 'International GCSE linear',
 validation_status text not null default 'pending' check(validation_status in ('pending','validated','review','rejected')),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
 foreign key(topic_id,subject_code) references public.topics(id,subject_code),
 unique(id,user_id), unique(id,user_id,subject_code), unique(user_id,content_hash),
 check(format<>'multiple_choice' or (marks=1 and jsonb_array_length(choices)=4)),
 check(format='multiple_choice' or jsonb_array_length(choices)=0)
);
-- No browser SELECT permission on either of the next two tables.
create table public.question_solutions (
 question_id uuid primary key references public.generated_questions(id) on delete cascade,
 model_answer text not null check(length(model_answer)>0), correct_choice_id text,
 examiner_explanation text not null check(length(examiner_explanation)>0), common_mistakes text[] not null,
 numerical_checks jsonb not null default '[]'::jsonb check(jsonb_typeof(numerical_checks)='array'),
 verification jsonb not null default '{}'::jsonb check(jsonb_typeof(verification)='object')
);
create table public.mark_criteria (
 id uuid primary key default gen_random_uuid(), question_id uuid not null references public.generated_questions(id) on delete cascade,
 criterion_key text not null check(criterion_key ~ '^[A-Za-z0-9_-]{1,32}$'), description text not null,
 marks integer not null check(marks between 1 and 6), allow_ecf boolean not null default false, ecf_rule text,
 acceptable_alternatives text[] not null default '{}', unique(question_id,criterion_key), unique(id,question_id),
 check(not allow_ecf or (ecf_rule is not null and length(trim(ecf_rule))>0))
);
create table public.mock_exams (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 subject_code text not null, blueprint_id uuid not null,
 status text not null default 'building' check(status in ('building','ready','active','submitted','marking','marked','review','failed')),
 started_at timestamptz, deadline timestamptz, submitted_at timestamptz, allotted_seconds integer check(allotted_seconds>0),
 created_at timestamptz not null default now(),
 foreign key(blueprint_id,subject_code) references public.paper_blueprints(id,subject_code),
 unique(id,user_id), unique(id,user_id,subject_code),
 check((started_at is null and deadline is null and allotted_seconds is null) or (started_at is not null and allotted_seconds is not null and deadline=started_at+allotted_seconds*interval '1 second')),
 check(status not in ('active','submitted','marking','marked') or started_at is not null),
 check(status not in ('submitted','marking','marked') or submitted_at is not null)
);
create table public.mock_exam_questions (
 mock_id uuid not null, user_id uuid not null, subject_code text not null, question_id uuid not null,
 position integer not null check(position between 1 and 200), question_label text not null,
 foreign key(mock_id,user_id,subject_code) references public.mock_exams(id,user_id,subject_code) on delete cascade,
 foreign key(question_id,user_id,subject_code) references public.generated_questions(id,user_id,subject_code),
 primary key(mock_id,position), unique(mock_id,question_id)
);
create table public.attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 question_id uuid not null, mock_id uuid, answer_document_id uuid,
 answer text not null default '' check(length(answer)<=20000),
 status text not null default 'draft' check(status in ('draft','submitted','marking','marked','review')),
 seconds_spent integer not null default 0 check(seconds_spent between 0 and 86400),
 created_at timestamptz not null default now(), last_activity_at timestamptz not null default now(), submitted_at timestamptz,
 accepted_marking_id uuid,
 foreign key(question_id,user_id) references public.generated_questions(id,user_id),
 foreign key(mock_id,user_id) references public.mock_exams(id,user_id),
 foreign key(mock_id,question_id) references public.mock_exam_questions(mock_id,question_id),
 foreign key(answer_document_id,user_id) references public.documents(id,user_id),
 unique(id,user_id), unique(id,user_id,question_id),
 check(status='draft' or submitted_at is not null), check(submitted_at is null or submitted_at>=created_at),
 check(status<>'marked' or accepted_marking_id is not null)
);
create unique index one_mock_answer on public.attempts(mock_id,question_id) where mock_id is not null;
create table public.marking_runs (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null, user_id uuid not null, question_id uuid not null,
 status text not null default 'draft' check(status in ('draft','validated','review','rejected')),
 earned_marks integer not null check(earned_marks>=0), available_marks integer not null check(available_marks between 1 and 12),
 confidence numeric not null check(confidence between 0 and 1), feedback text not null,
 misconceptions text[] not null default '{}', model_id text not null,
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'), verification jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(attempt_id,user_id,question_id) references public.attempts(id,user_id,question_id) on delete cascade,
 unique(id,question_id), unique(id,attempt_id,user_id), check(earned_marks<=available_marks)
);
alter table public.attempts add constraint accepted_marking_matches_attempt
 foreign key(accepted_marking_id,id,user_id) references public.marking_runs(id,attempt_id,user_id) deferrable initially deferred;
create table public.criterion_awards (
 run_id uuid not null, criterion_id uuid not null, question_id uuid not null,
 marks integer not null check(marks between 0 and 6), evidence text not null, ecf boolean not null default false,
 explanation text not null check(length(trim(explanation))>0),
 foreign key(run_id,question_id) references public.marking_runs(id,question_id) on delete cascade,
 foreign key(criterion_id,question_id) references public.mark_criteria(id,question_id), primary key(run_id,criterion_id),
 check(marks=0 or length(trim(evidence))>0)
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('generate_question','build_mock','mark_attempt','process_document','delete_account')),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','review','cancelled')),
 payload jsonb not null check(jsonb_typeof(payload)='object'), output jsonb,
 idempotency_key text not null check(length(idempotency_key) between 8 and 200),
 attempt_count integer not null default 0 check(attempt_count between 0 and 3), lease_token uuid, lease_expires_at timestamptz,
 run_after timestamptz not null default now(), error_code text check(error_code ~ '^[A-Z0-9_]{3,80}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,idempotency_key),
 check(status<>'running' or (lease_token is not null and lease_expires_at is not null))
);
create table public.usage_counters (
 user_id uuid not null references auth.users(id) on delete cascade, period date not null,
 feature text not null, used integer not null check(used>=0), primary key(user_id,period,feature)
);
create table public.audit_events (
 id bigint generated always as identity primary key, user_id uuid references auth.users(id) on delete set null,
 action text not null, resource_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index topics_parent_idx on public.topics(parent_id);
create index documents_owner_idx on public.documents(user_id,created_at desc);
create index pages_owner_idx on public.document_pages(user_id,document_id);
create index extracted_owner_idx on public.extracted_questions(user_id,document_id);
create index questions_owner_topic_idx on public.generated_questions(user_id,topic_id);
create index criteria_question_idx on public.mark_criteria(question_id);
create index mock_owner_idx on public.mock_exams(user_id,created_at desc);
create index mock_items_owner_idx on public.mock_exam_questions(user_id,mock_id);
create index mock_items_question_idx on public.mock_exam_questions(question_id);
create index attempts_owner_idx on public.attempts(user_id,submitted_at desc);
create index attempts_question_idx on public.attempts(question_id);
create index marking_owner_idx on public.marking_runs(user_id,attempt_id);
create index awards_criterion_idx on public.criterion_awards(criterion_id);
create index jobs_claim_idx on public.jobs(status,run_after,lease_expires_at) where status in ('queued','running');
create index jobs_owner_idx on public.jobs(user_id,created_at desc);
create index audit_owner_idx on public.audit_events(user_id,created_at desc);

-- Explicit grants plus RLS. Service-role use still requires application ownership checks.
do $$ declare t text; begin
 foreach t in array array['subjects','specification_versions','topics','paper_blueprints','profiles','documents','document_pages','extracted_questions','generated_questions','question_solutions','mark_criteria','mock_exams','mock_exam_questions','attempts','marking_runs','criterion_awards','jobs','usage_counters','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['subjects','specification_versions','topics','paper_blueprints'] loop
  execute format('grant select on public.%I to anon,authenticated',t);
  execute format('create policy catalog_read on public.%I for select to anon,authenticated using(true)',t);
 end loop;
 foreach t in array array['profiles','documents','document_pages','extracted_questions','generated_questions','mock_exams','mock_exam_questions','attempts','jobs','usage_counters'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
 end loop;
end $$;
grant update(display_name,time_zone,daily_goal_minutes,extra_time_percent) on public.profiles to authenticated;
create policy profile_update on public.profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select on public.marking_runs,public.criterion_awards to authenticated;
create policy marking_owner on public.marking_runs for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.attempts a left join public.mock_exams m on m.id=a.mock_id where a.id=attempt_id and (a.mock_id is null or m.status in ('submitted','marking','marked','review'))));
create policy awards_owner on public.criterion_awards for select to authenticated using(exists(select 1 from public.marking_runs r where r.id=run_id));
grant usage,select on sequence public.audit_events_id_seq to service_role;
create function public.initialize_revision_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(user_id) values(new.id) on conflict do nothing; return new; end $$;
revoke all on function public.initialize_revision_profile() from public,anon,authenticated;
create trigger initialize_revision_profile after insert on auth.users for each row execute function public.initialize_revision_profile();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('revision-private','revision-private',false,26214400,array['application/pdf','image/png','image/jpeg']);
create policy revision_private_read on storage.objects for select to authenticated
 using(bucket_id='revision-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy revision_registered_upload on storage.objects for insert to authenticated
 with check(bucket_id='revision-private' and exists(select 1 from public.documents d where d.object_path=name and d.user_id=(select auth.uid()) and d.status='awaiting_upload'));
-- No client overwrite/delete policy. Erasure is an explicitly confirmed server workflow.
commit;
