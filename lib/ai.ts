import 'server-only';
import type { ModelCall } from '../src/ai/pipeline.ts';
import { env } from './env.ts';
export class ModelError extends Error{code:string;transient:boolean;constructor(code:string,transient:boolean){super(code);this.code=code;this.transient=transient;}}
type ResponseBody={status?:string;output?:{type:string;content?:{type:string;text?:string}[]}[]};
/** OpenAI Responses API with strict JSON-schema output. store:false avoids response retention by the API. */
export const openAICall:ModelCall=async task=>{
 if(!env.openaiKey)throw new ModelError('AI_NOT_CONFIGURED',false);
 const content:unknown[]=[{type:'input_text',text:task.input}];
 for(const f of task.files??[])content.push(f.mime==='application/pdf'?{type:'input_file',filename:f.filename,file_data:`data:${f.mime};base64,${f.base64}`}:{type:'input_image',image_url:`data:${f.mime};base64,${f.base64}`});
 let res:Response;
 try{res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.openaiKey}`,'content-type':'application/json'},
  body:JSON.stringify({model:task.model,store:false,instructions:task.instructions,input:[{role:'user',content}],text:{format:{type:'json_schema',name:task.name,strict:true,schema:task.schema}}}),
  signal:AbortSignal.timeout(90_000)});}catch{throw new ModelError('MODEL_UNREACHABLE',true);}
 if(!res.ok)throw new ModelError(`MODEL_HTTP_${res.status}`,res.status===429||res.status>=500);
 const json=await res.json() as ResponseBody;
 if(json.status&&json.status!=='completed')throw new ModelError('MODEL_INCOMPLETE',true);
 const parts=(json.output??[]).flatMap(o=>o.type==='message'?o.content??[]:[]);
 if(parts.some(p=>p.type==='refusal'))throw new ModelError('MODEL_REFUSED',false);
 const text=parts.find(p=>p.type==='output_text')?.text;if(!text)throw new ModelError('MODEL_EMPTY',true);
 try{return JSON.parse(text);}catch{throw new ModelError('MODEL_INVALID_JSON',true);}
};
