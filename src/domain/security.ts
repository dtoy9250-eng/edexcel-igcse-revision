import { z } from 'zod';
export const UploadSchema=z.object({subject_code:z.enum(['4BI1','4CH1','4PH1']),kind:z.enum(['paper','mark_scheme','examiner_report','answer_sheet']),
 file_name:z.string().trim().min(1).max(255).refine(n=>!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(n),'UNSAFE_FILE_NAME'),mime_type:z.enum(['application/pdf','image/png','image/jpeg']),byte_size:z.number().int().min(1).max(26214400),rights_attested:z.literal(true)}).strict();
export function objectKey(userId:string,documentId:string,mime:string):string{
 z.uuid().parse(userId);z.uuid().parse(documentId);
 const ext=({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'} as Record<string,string>)[mime];
 if(!ext)throw new Error('UNSUPPORTED_MIME_TYPE');return `${userId}/${documentId}/original.${ext}`;
}
export function ownsKey(userId:string,key:string):boolean{
 if(!z.uuid().safeParse(userId).success)return false;
 return key.startsWith(`${userId}/`)&&!key.includes('..')&&!key.includes('\\')&&!key.includes('%')&&!key.includes('//')&&!/[\x00-\x1f\x7f]/.test(key);
}
export function sameOrigin(origin:string|null,appUrl:string):boolean{
 if(!origin)return false;try{const a=new URL(origin),b=new URL(appUrl);return ['https:','http:'].includes(a.protocol)&&a.origin===b.origin;}catch{return false;}
}
export function safeRedirect(path:unknown,fallback='/dashboard'):string{
 if(typeof path!=='string'||path.length>2000)return fallback;
 // Fail closed if still encoded after three decodes, and check the raw value as well as the decoded one.
 let decoded=path;try{for(let i=0;;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;if(i>=3)return fallback;decoded=next;}}catch{return fallback;}
 for(const value of [path,decoded])if(!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x1f\x7f]/.test(value))return fallback;
 try{if(new URL(path,'https://app.invalid').origin!=='https://app.invalid')return fallback;}catch{return fallback;}
 return path;
}
export function isTimeZone(value:string):boolean{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}
export function fileMagic(bytes:Uint8Array,mime:string):boolean{
 const start=Array.from(bytes.slice(0,8));
 if(mime==='application/pdf')return new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 if(mime==='image/png')return start.join(',')==='137,80,78,71,13,10,26,10';
 if(mime==='image/jpeg')return start[0]===255&&start[1]===216&&start[2]===255;
 return false;
}
