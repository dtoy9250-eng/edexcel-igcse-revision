import { AssessmentError, type Subject } from './assessment.ts';
export type Blueprint={id:string;subject_code:Subject;specification_id:string;total_marks:number;duration_minutes:number;core_only:boolean;verified_at:string|null};
export type MockQuestion={id:string;user_id:string;subject_code:Subject;marks:number;validation_status:string;topic:{specification_id:string;kind:'group'|'objective';scope:'core'|'extended'|'mixed';verified:boolean}};
export function assertMockReady(blueprint:Blueprint,questions:MockQuestion[],userId:string):void{
 const issues:string[]=[];
 if(!blueprint.verified_at||!Number.isFinite(Date.parse(blueprint.verified_at)))issues.push('BLUEPRINT_NOT_VERIFIED');
 if(!Number.isInteger(blueprint.total_marks)||blueprint.total_marks<1||blueprint.total_marks>300)issues.push('INVALID_BLUEPRINT');
 if(questions.reduce((s,q)=>s+q.marks,0)!==blueprint.total_marks)issues.push('MOCK_TOTAL_MISMATCH');
 if(!questions.length||new Set(questions.map(q=>q.id)).size!==questions.length)issues.push('EMPTY_OR_DUPLICATE_QUESTION');
 if(questions.some(q=>!Number.isInteger(q.marks)||q.marks<1||q.marks>12||q.user_id!==userId||q.subject_code!==blueprint.subject_code||q.topic.specification_id!==blueprint.specification_id||!q.topic.verified||q.topic.kind!=='objective'||q.validation_status!=='validated'||(blueprint.core_only&&q.topic.scope!=='core')))issues.push('QUESTION_NOT_ELIGIBLE');
 if(issues.length)throw new AssessmentError('MOCK_NOT_READY',issues);
}
export function examDeadline(start:string,durationMinutes:number,extraTimePercent:0|25|50|100=0):string{
 const at=Date.parse(start);
 if(!Number.isFinite(at)||!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>360||![0,25,50,100].includes(extraTimePercent))throw new AssessmentError('INVALID_EXAM_DURATION');
 return new Date(at+durationMinutes*60000*(100+extraTimePercent)/100).toISOString();
}
export function examExpired(deadline:string,serverNow:Date):boolean{
 const at=Date.parse(deadline);return !Number.isFinite(at)||!Number.isFinite(serverNow.getTime())||serverNow.getTime()>=at;
}
