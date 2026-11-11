import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity,originalityScreen } from '../src/domain/originality.ts';
import { safeRedirect,UploadSchema } from '../src/domain/security.ts';
import { validateQuestion,publicQuestion,AssessmentError } from '../src/domain/assessment.ts';
import { question,topic,verification } from './fixtures.ts';

// Regressions found in the 10 November 2026 review. Synthetic data only.
const issues=(fn:()=>unknown)=>{try{fn();return [];}catch(e){if(e instanceof AssessmentError)return e.issues;throw e;}};
test('near-copies of short prompts are no longer scored as fully original',()=>{
 assert.ok(similarity('Name the process shown.','Name the process shown here.')>=0.55);
 assert.equal(originalityScreen('Name the process shown.',['Name the process shown here.']).passed,false);
});
test('unrelated short prompts still pass the originality screen',()=>assert.equal(similarity('State the unit of force.','Describe how ice melts.'),0));
test('long prompts keep five-word shingles and exact copies still score 1',()=>{const p=question().prompt;assert.equal(similarity(p,p),1);assert.ok(similarity(p,p+' Show your working clearly.')<1);});
test('a command word must appear as a whole word',()=>{const q=question();q.command_word='State';q.prompt='Calculate the force and write a statement of the method you used.';assert.ok(issues(()=>validateQuestion(q,topic(),verification())).includes('COMMAND_WORD_MISSING'));});
test('command words may appear mid-sentence in any case',()=>{const q=question();q.prompt='Use the data to calculate the force on an object of mass 2 kg accelerating at 3 m/s².';assert.equal(validateQuestion(q,topic(),verification()).marks,2);});
test('redirects must be absolute paths before decoding too',()=>assert.equal(safeRedirect('%2Fdashboard'),'/dashboard'));
test('over-encoded redirect payloads fail closed',()=>assert.equal(safeRedirect('/%25252525252f%25252525252fevil.example'),'/dashboard'));
test('ordinary encoded query strings remain usable',()=>assert.equal(safeRedirect('/practice?topic=a%20b'),'/practice?topic=a%20b'));
test('upload file names reject control and bidirectional override characters',()=>{
 for(const file_name of ['a\u0000.pdf','invoice\u202Efdp.pdf','line\nbreak.pdf','   '])assert.equal(UploadSchema.safeParse({subject_code:'4PH1',kind:'paper',file_name,mime_type:'application/pdf',byte_size:100,rights_attested:true}).success,false,JSON.stringify(file_name));
 assert.equal(UploadSchema.parse({subject_code:'4PH1',kind:'paper',file_name:'  Paper 1.pdf ',mime_type:'application/pdf',byte_size:100,rights_attested:true}).file_name,'Paper 1.pdf');
});
test('the public question DTO can be built from a stored row without solution fields',()=>{const {model_answer,criteria,correct_choice_id,examiner_explanation,common_mistakes,numerical_checks,...row}=question();
 const dto=publicQuestion(row,'q1');assert.equal(dto.id,'q1');assert.equal('model_answer' in dto,false);void [model_answer,criteria,correct_choice_id,examiner_explanation,common_mistakes,numerical_checks];});
