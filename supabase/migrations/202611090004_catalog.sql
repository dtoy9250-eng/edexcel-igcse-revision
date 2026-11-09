begin;
insert into public.subjects(code,name,accent) values ('4BI1','Biology','emerald'),('4CH1','Chemistry','amber'),('4PH1','Physics','sky');
insert into public.specification_versions(id,subject_code,issue,source_url,source_sha256,checked_at) values
('b1000000-0000-4000-8000-000000000001','4BI1','Issue 3 — September 2024','https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Biology/2017/specification-and-sample-assessments/international-gcse-biology-2017-specification1.pdf','9f474a0ef0e93ef3c3107b568956d163454cdb476bb2017189e8dd12c0d58cef','2026-11-09T17:16:41Z'),
('c1000000-0000-4000-8000-000000000001','4CH1','Issue 3 — September 2024','https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Chemistry/2017/specification-and-sample-assessments/international-gcse-chemistry-2017-specification.pdf','36e2080d2e99f060bcc18f2a9d0bbd8b29498b45e007fa232e3befcd89b73362','2026-11-09T17:16:41Z'),
('f1000000-0000-4000-8000-000000000001','4PH1','Issue 4 — September 2024','https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Physics/2017/specification-and-sample-assessments/international-gcse-physics-2017-specification.pdf','bac4b8312d4fbfc84672f909100d66b2b3cda0b25e98c0d11bbc7366dae482b2','2026-11-09T17:16:41Z');
insert into public.paper_blueprints(specification_id,subject_code,code,title,total_marks,duration_minutes,core_only,verified_at,source_pages)
select s.id,s.subject_code,v.code,v.title,v.marks,v.minutes,v.core,'2026-11-09T17:16:41Z'::timestamptz,v.pages
from (values
('4BI1','4BI1/1B','Biology Paper 1',110,120,true,'PDF pp. 13–14, 33; printed pp. 7–8, 27'),
('4BI1','4BI1/2B','Biology Paper 2',70,75,false,'PDF pp. 13–14, 33; printed pp. 7–8, 27'),
('4CH1','4CH1/1C','Chemistry Paper 1',110,120,true,'PDF pp. 13–14, 33; printed pp. 7–8, 27'),
('4CH1','4CH1/2C','Chemistry Paper 2',70,75,false,'PDF pp. 13–14, 33; printed pp. 7–8, 27'),
('4PH1','4PH1/1P','Physics Paper 1',110,120,true,'PDF pp. 14–15, 35; printed pp. 8–9, 29'),
('4PH1','4PH1/2P','Physics Paper 2',70,75,false,'PDF pp. 14–15, 35; printed pp. 8–9, 29')
) as v(subject,code,title,marks,minutes,core,pages) join public.specification_versions s on s.subject_code=v.subject;
insert into public.topics(specification_id,subject_code,kind,reference,title,summary,scope,verified)
select s.id,s.subject_code,'group',v.ref,v.title,v.summary,'mixed',true from (values
('4BI1','1','The nature and variety of living organisms','Living characteristics and classification.'),
('4BI1','2','Structures and functions in living organisms','Cells, biological molecules, transport and organ systems.'),
('4BI1','3','Reproduction and inheritance','Reproduction, inheritance and variation.'),
('4BI1','4','Ecology and the environment','Ecosystems, populations and environmental change.'),
('4BI1','5','Use of biological resources','Food production, selective breeding and conceptual biotechnology.'),
('4CH1','1','Principles of chemistry','Particles, atomic structure, bonding and chemical calculations.'),
('4CH1','2','Inorganic chemistry','Chemical groups, reactivity, metals and qualitative analysis.'),
('4CH1','3','Physical chemistry','Energy changes, rates and equilibria.'),
('4CH1','4','Organic chemistry','Carbon compounds, reactions and polymers.'),
('4PH1','1','Forces and motion','Motion, forces and momentum.'),
('4PH1','2','Electricity','Electrical circuits, charge and electrical energy.'),
('4PH1','3','Waves','Wave behaviour, the electromagnetic spectrum and sound.'),
('4PH1','4','Energy resources and energy transfers','Energy stores, transfers, work and power.'),
('4PH1','5','Solids, liquids and gases','Density, pressure and thermal processes.'),
('4PH1','6','Magnetism and electromagnetism','Magnetic fields, induction and transformers.'),
('4PH1','7','Radioactivity and particles','Atomic particles, radioactive decay and radiation safety.'),
('4PH1','8','Astrophysics','Stellar evolution, gravity and the expanding universe.')
) as v(subject,ref,title,summary) join public.specification_versions s on s.subject_code=v.subject;
-- Groups intentionally have mixed scope. Verified objective leaves are a separate release gate.
commit;
