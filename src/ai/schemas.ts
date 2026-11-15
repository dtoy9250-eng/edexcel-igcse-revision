// JSON Schemas for strict structured model output. Server-side Zod validation remains authoritative.
const str={type:'string'},int={type:'integer'},num={type:'number'},bool={type:'boolean'};
const nullable=(t:'string'|'integer')=>({type:[t,'null']});
const status={type:'string',enum:['pass','fail','uncertain']};
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const arr=(items:unknown)=>({type:'array',items});
export const QUESTION_CONTENT_SCHEMA=obj({
 prompt:str,
 structured_content:arr({anyOf:[obj({kind:{type:'string',enum:['text']},text:str}),obj({kind:{type:'string',enum:['latex']},latex:str,alt:str}),
  obj({kind:{type:'string',enum:['table']},caption:str,headers:arr(str),rows:arr(arr(str))})]}),
 choices:arr(obj({id:str,text:str})),correct_choice_id:nullable('string'),
 model_answer:str,examiner_explanation:str,common_mistakes:arr(str),
 criteria:arr(obj({key:str,description:str,marks:int,allow_ecf:bool,ecf_rule:nullable('string'),acceptable_alternatives:arr(str)})),
 numerical_checks:arr(obj({operation:{type:'string',enum:['multiply','divide','add','subtract','mean','percentage','power']},inputs:arr(num),expected:num,absolute_tolerance:num,unit:str}))
});
export const VERIFICATION_SCHEMA=obj({scientific_status:status,mark_scheme_status:status,originality_status:status,reasoning:str});
export const MARKING_SCHEMA=obj({awards:arr(obj({criterion_key:str,marks:int,evidence:str,ecf:bool,explanation:str})),feedback:str,misconceptions:arr(str),confidence:num});
export const DOCUMENT_SCHEMA=obj({pages:arr(obj({page_number:int,text:str,confidence:num})),
 questions:arr(obj({question_label:str,parent_label:nullable('string'),page_number:int,prompt:str,marks:nullable('integer'),command_word:nullable('string'),question_type:nullable('string')}))});
