import {z} from 'zod';
import {SubjectCode,Difficulty,QuestionFormat,CommandWord,AssessmentError,validateQuestion,type TopicContext,type Question} from './assessment.ts';
import {assertMockReady,type Blueprint,type MockQuestion} from './mocks.ts';

export const ProgrammeKey=z.enum(['double_award','separate_sciences']);
export type Programme=z.infer<typeof ProgrammeKey>;
export const QualificationCode=z.enum(['4SD0','4BI1','4CH1','4PH1']);
export type Qualification=z.infer<typeof QualificationCode>;
export const DEFAULT_PRACTICE_DIFFICULTY='stretch' as const;
export const difficultyChoices=[
 {value:'standard',label:'Standard exam demand'},
 {value:'stretch',label:'Higher demand'},
 {value:'challenge',label:'Challenge'}
] as const;
export const programmes={
 double_award:{label:'Science Double Award',qualificationCodes:['4SD0'],awardCount:2,examTier:'untiered'},
 separate_sciences:{label:'Separate sciences (triple)',qualificationCodes:['4BI1','4CH1','4PH1'],awardCount:3,examTier:'untiered'}
} as const;
export type CoursePaper={qualificationCode:Qualification;subjectCode:z.infer<typeof SubjectCode>;reference:string;blueprintCode:string;marks:number;minutes:number;coreOnly:boolean};
export const coursePapers:readonly CoursePaper[]=[
 {qualificationCode:'4SD0',subjectCode:'4BI1',reference:'4SD0/1B',blueprintCode:'4BI1/1B',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4SD0',subjectCode:'4CH1',reference:'4SD0/1C',blueprintCode:'4CH1/1C',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4SD0',subjectCode:'4PH1',reference:'4SD0/1P',blueprintCode:'4PH1/1P',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4BI1',subjectCode:'4BI1',reference:'4BI1/1B',blueprintCode:'4BI1/1B',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4BI1',subjectCode:'4BI1',reference:'4BI1/2B',blueprintCode:'4BI1/2B',marks:70,minutes:75,coreOnly:false},
 {qualificationCode:'4CH1',subjectCode:'4CH1',reference:'4CH1/1C',blueprintCode:'4CH1/1C',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4CH1',subjectCode:'4CH1',reference:'4CH1/2C',blueprintCode:'4CH1/2C',marks:70,minutes:75,coreOnly:false},
 {qualificationCode:'4PH1',subjectCode:'4PH1',reference:'4PH1/1P',blueprintCode:'4PH1/1P',marks:110,minutes:120,coreOnly:true},
 {qualificationCode:'4PH1',subjectCode:'4PH1',reference:'4PH1/2P',blueprintCode:'4PH1/2P',marks:70,minutes:75,coreOnly:false}
];
export function papersForQualification(code:Qualification){return coursePapers.filter(p=>p.qualificationCode===QualificationCode.parse(code));}
export function papersForProgramme(programme:Programme){
 const selected=ProgrammeKey.parse(programme);
 const codes:readonly Qualification[]=programmes[selected].qualificationCodes;
 return coursePapers.filter(p=>codes.includes(p.qualificationCode));
}
export function qualificationForSubject(programme:Programme,subject:z.infer<typeof SubjectCode>):Qualification{
 ProgrammeKey.parse(programme);SubjectCode.parse(subject);return programme==='double_award'?'4SD0':subject;
}
export function objectiveEligible(programme:Programme,topic:TopicContext):boolean{
 ProgrammeKey.parse(programme);
 return topic.verified&&topic.kind==='objective'&&topic.scope!=='mixed'&&(programme!=='double_award'||topic.scope==='core');
}
export function validateCourseQuestion(input:unknown,topic:TopicContext,verification:unknown,programme:Programme,requestedMarks?:number):Question{
 if(!objectiveEligible(programme,topic))throw new AssessmentError('OBJECTIVE_OUTSIDE_SELECTED_COURSE');
 return validateQuestion(input,topic,verification,requestedMarks);
}
export function validateCourseMock(qualification:Qualification,blueprint:Blueprint&{code:string},questions:MockQuestion[],userId:string):void{
 const paper=papersForQualification(qualification).find(p=>p.blueprintCode===blueprint.code);
 if(!paper||paper.subjectCode!==blueprint.subject_code||paper.marks!==blueprint.total_marks||paper.minutes!==blueprint.duration_minutes||paper.coreOnly!==blueprint.core_only)throw new AssessmentError('PAPER_OUTSIDE_SELECTED_QUALIFICATION');
 assertMockReady(blueprint,questions,userId);
}
// An explicit programme is required for new generation requests. No invented exam-tier field.
export const GenerationSelectionSchema=z.object({
 programme:ProgrammeKey,subject_code:SubjectCode,topic_id:z.uuid(),
 difficulty:Difficulty.default(DEFAULT_PRACTICE_DIFFICULTY),marks:z.number().int().min(1).max(12),
 format:QuestionFormat,command_word:CommandWord,question_count:z.number().int().min(1).max(20),
 examination_style:z.literal('International GCSE linear')
}).strict().superRefine((x,ctx)=>{if(x.format==='multiple_choice'&&x.marks!==1)ctx.addIssue({code:'custom',message:'Multiple-choice items must have one mark'});});
