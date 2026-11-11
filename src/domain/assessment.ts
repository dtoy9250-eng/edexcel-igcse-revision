import { z } from 'zod';

export const SubjectCode = z.enum(['4BI1','4CH1','4PH1']);
export type Subject = z.infer<typeof SubjectCode>;
export const Difficulty = z.enum(['standard','stretch','challenge']);
export const QuestionFormat = z.enum(['short_answer','multiple_choice','calculation','extended_response']);
export const CommandWord = z.enum(['State','Describe','Explain','Calculate','Compare','Evaluate','Suggest','Determine','Discuss','Comment']);
const text = (min=1,max=20000) => z.string().trim().min(min).max(max);
export class AssessmentError extends Error {
 readonly code:string; readonly issues:string[];
 constructor(code:string,issues:string[]=[]){super(code);this.name='AssessmentError';this.code=code;this.issues=issues;}
}
export const CriterionSchema=z.object({
 key:text(1,32).regex(/^[A-Za-z0-9_-]+$/),description:text(3,2000),marks:z.number().int().min(1).max(6),
 allow_ecf:z.boolean(),ecf_rule:z.string().max(2000).nullable(),acceptable_alternatives:z.array(text(1,500)).max(12)
}).strict();
export type Criterion=z.infer<typeof CriterionSchema>;
export const NumericalCheckSchema=z.object({
 operation:z.enum(['multiply','divide','add','subtract','mean','percentage','power']),
 inputs:z.array(z.number().finite()).min(1).max(10),expected:z.number().finite(),
 absolute_tolerance:z.number().finite().min(0),unit:text(1,40)
}).strict();
export type NumericalCheck=z.infer<typeof NumericalCheckSchema>;
export const ContentBlock=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('text'),text:text()}).strict(),
 z.object({kind:z.literal('latex'),latex:text(1,4000),alt:text(1,1000)}).strict(),
 z.object({kind:z.literal('table'),caption:text(1,500),headers:z.array(text(1,200)).min(1).max(10),rows:z.array(z.array(text(1,500)).min(1).max(10)).min(1).max(40)}).strict()
]);
export const QuestionSchema=z.object({
 subject_code:SubjectCode,topic_id:z.uuid(),specification_reference:text(1,50),prompt:text(12,12000),
 marks:z.number().int().min(1).max(12),difficulty:Difficulty,format:QuestionFormat,command_word:CommandWord,
 examination_style:z.literal('International GCSE linear'),structured_content:z.array(ContentBlock).max(12),
 choices:z.array(z.object({id:text(1,2),text:text(1,1000)}).strict()).max(6),correct_choice_id:z.string().max(2).nullable(),
 model_answer:text(1,12000),examiner_explanation:text(5,6000),common_mistakes:z.array(text(3,1000)).min(1).max(10),
 criteria:z.array(CriterionSchema).min(1).max(12),numerical_checks:z.array(NumericalCheckSchema).max(10)
}).strict();
export type Question=z.infer<typeof QuestionSchema>;
export const VerificationSchema=z.object({
 scientific_status:z.enum(['pass','fail','uncertain']),mark_scheme_status:z.enum(['pass','fail','uncertain']),
 originality_status:z.enum(['pass','fail','uncertain']),reasoning:text(10,6000),model:text(1,120),
 generator_model:text(1,120),checked_at:z.iso.datetime()
}).strict();
export type Verification=z.infer<typeof VerificationSchema>;
export type TopicContext={id:string;subject_code:Subject;reference:string;verified:boolean;kind:'group'|'objective';scope:'core'|'extended'|'mixed'};

// Whitelisted arithmetic only. Never eval model-generated expressions.
export function calculate(check:NumericalCheck):number{
 const n=check.inputs;let result:number;
 switch(check.operation){
 case 'multiply':result=n.reduce((a,b)=>a*b,1);break;
 case 'add':result=n.reduce((a,b)=>a+b,0);break;
 case 'mean':result=n.reduce((a,b)=>a+b,0)/n.length;break;
 case 'divide':if(n.length!==2||n[1]===0)throw new AssessmentError('INVALID_NUMERICAL_CHECK');result=n[0]/n[1];break;
 case 'subtract':if(n.length!==2)throw new AssessmentError('INVALID_NUMERICAL_CHECK');result=n[0]-n[1];break;
 case 'percentage':if(n.length!==2||n[1]===0)throw new AssessmentError('INVALID_NUMERICAL_CHECK');result=n[0]/n[1]*100;break;
 case 'power':if(n.length!==2||Math.abs(n[1])>12)throw new AssessmentError('INVALID_NUMERICAL_CHECK');result=n[0]**n[1];break;
 }
 if(!Number.isFinite(result))throw new AssessmentError('INVALID_NUMERICAL_CHECK');return result;
}
/** Structural/numerical checks complement, but cannot prove, scientific correctness. */
export function validateQuestion(input:unknown,topic:TopicContext,verificationInput:unknown,requestedMarks?:number):Question{
 const q=QuestionSchema.parse(input),v=VerificationSchema.parse(verificationInput);const issues:string[]=[];
 if(!topic.verified||topic.kind!=='objective'||topic.scope==='mixed')issues.push('UNVERIFIED_OBJECTIVE');
 if(q.subject_code!==topic.subject_code||q.topic_id!==topic.id||q.specification_reference!==topic.reference)issues.push('TOPIC_MISMATCH');
 if(requestedMarks!==undefined&&q.marks!==requestedMarks)issues.push('REQUESTED_MARKS_MISMATCH');
 if(q.criteria.reduce((n,c)=>n+c.marks,0)!==q.marks)issues.push('CRITERION_TOTAL_MISMATCH');
 if(new Set(q.criteria.map(c=>c.key)).size!==q.criteria.length)issues.push('DUPLICATE_CRITERION');
 if(q.criteria.some(c=>c.allow_ecf&&!c.ecf_rule?.trim()))issues.push('ECF_RULE_MISSING');
 // Whole-word match: a substring check let 'statement' satisfy State and 'comments' satisfy Comment.
 if(!new RegExp(`\\b${q.command_word}\\b`,'i').test(q.prompt))issues.push('COMMAND_WORD_MISSING');
 if(v.model===v.generator_model)issues.push('INDEPENDENT_MODEL_REQUIRED');
 if(v.scientific_status!=='pass'||v.mark_scheme_status!=='pass'||v.originality_status!=='pass')issues.push('VERIFICATION_NOT_PASSED');
 if(q.format==='multiple_choice'){
  if(q.marks!==1||q.choices.length!==4||new Set(q.choices.map(c=>c.id)).size!==4||!q.choices.some(c=>c.id===q.correct_choice_id))issues.push('INVALID_MULTIPLE_CHOICE');
 }else if(q.choices.length||q.correct_choice_id!==null)issues.push('UNEXPECTED_CHOICES');
 if(q.format==='calculation'&&q.numerical_checks.length===0)issues.push('NUMERICAL_REVIEW_REQUIRED');
 for(const c of q.numerical_checks){try{
  const value=calculate(c),fp=Math.max(1,Math.abs(value))*Number.EPSILON*8;
  const ceiling=Math.max(Math.abs(value)*0.01,1e-9);
  if(c.absolute_tolerance>ceiling||Math.abs(value-c.expected)>c.absolute_tolerance+fp)issues.push('NUMERICAL_ANSWER_MISMATCH');
 }catch{issues.push('INVALID_NUMERICAL_CHECK');}}
 for(const b of q.structured_content)if(b.kind==='table'&&b.rows.some(row=>row.length!==b.headers.length))issues.push('INVALID_TABLE');
 if(issues.length)throw new AssessmentError('QUESTION_REQUIRES_REVIEW',[...new Set(issues)]);return q;
}
export const AwardSchema=z.object({criterion_key:text(1,32),marks:z.number().int().min(0).max(6),evidence:z.string().max(4000),ecf:z.boolean(),explanation:text(3,2000)}).strict();
export const MarkingSchema=z.object({awards:z.array(AwardSchema).max(12),feedback:text(3,6000),misconceptions:z.array(text(3,500)).max(10),confidence:z.number().finite().min(0).max(1)}).strict();
export type Marking=z.infer<typeof MarkingSchema>;
export function validateMarking(criteriaInput:Criterion[],answer:string,input:unknown,independentInput:unknown):Marking&{earned_marks:number;available_marks:number;official_pearson_mark:false}{
 const criteria=z.array(CriterionSchema).min(1).max(12).parse(criteriaInput);
 const proposal=MarkingSchema.parse(input),review=MarkingSchema.parse(independentInput),issues:string[]=[];
 if(new Set(criteria.map(c=>c.key)).size!==criteria.length)issues.push('DUPLICATE_SCHEME_CRITERION');
 if(answer.length>20000)issues.push('ANSWER_TOO_LONG');
 if(proposal.confidence<0.85||review.confidence<0.85)issues.push('MARKING_UNCERTAIN');
 if(proposal.awards.length!==criteria.length||new Set(proposal.awards.map(a=>a.criterion_key)).size!==criteria.length)issues.push('INCOMPLETE_OR_DUPLICATE_AWARDS');
 if(review.awards.length!==criteria.length||new Set(review.awards.map(a=>a.criterion_key)).size!==criteria.length)issues.push('INDEPENDENT_AWARDS_INVALID');
 let earned=0;
 for(const award of proposal.awards){
  const c=criteria.find(c=>c.key===award.criterion_key);
  if(!c){issues.push('UNKNOWN_CRITERION');continue;}
  if(award.marks>c.marks)issues.push('CRITERION_OVERAWARD');
  if(award.marks>0&&(!award.evidence.trim()||!answer.toLowerCase().includes(award.evidence.trim().toLowerCase())))issues.push('EVIDENCE_NOT_IN_ANSWER');
  if(award.ecf&&(!c.allow_ecf||!c.ecf_rule?.trim()||award.marks===0))issues.push('ECF_NOT_ALLOWED');
  const other=review.awards.find(a=>a.criterion_key===c.key);
  if(!other||other.marks!==award.marks||other.ecf!==award.ecf)issues.push('INDEPENDENT_MARKING_DISAGREEMENT');
  if(other&&other.marks>0&&(!other.evidence.trim()||!answer.toLowerCase().includes(other.evidence.trim().toLowerCase())))issues.push('INDEPENDENT_EVIDENCE_INVALID');
  earned+=award.marks;
 }
 const available=criteria.reduce((n,c)=>n+c.marks,0);
 if(earned>available||available>12)issues.push('TOTAL_OVERAWARD');
 if(issues.length)throw new AssessmentError('MARKING_REQUIRES_REVIEW',[...new Set(issues)]);
 return {...proposal,earned_marks:earned,available_marks:available,official_pearson_mark:false};
}
export function blankAnswerMarking(criteria:Criterion[]):Marking{
 return {confidence:1,feedback:'No answer was submitted. No marks could be awarded.',misconceptions:[],awards:criteria.map(c=>({criterion_key:c.key,marks:0,evidence:'',ecf:false,explanation:'No answer was submitted for this criterion.'}))};
}
// Explicit allowlist. Correct choice, scheme and answers are not in active-exam DTOs.
export type PublicQuestionSource=Pick<Question,'subject_code'|'topic_id'|'prompt'|'marks'|'difficulty'|'format'|'command_word'|'structured_content'|'choices'>;
export function publicQuestion(q:PublicQuestionSource,id:string){
 return {id,subject_code:q.subject_code,topic_id:q.topic_id,prompt:q.prompt,marks:q.marks,difficulty:q.difficulty,
 format:q.format,command_word:q.command_word,structured_content:q.structured_content,choices:q.choices};
}
