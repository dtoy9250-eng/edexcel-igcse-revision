import 'server-only';
const flag=(v:string|undefined)=>v==='true';
function int(v:string|undefined,fallback:number){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=10000?n:fallback;}
export const env={
 supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL??'',supabaseKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'',
 serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY??'',appUrl:(process.env.NEXT_PUBLIC_APP_URL??'').replace(/\/$/,''),
 openaiKey:process.env.OPENAI_API_KEY??'',
 models:{generator:process.env.AI_GENERATION_MODEL??'',validator:process.env.AI_VALIDATION_MODEL??'',marker:process.env.AI_MARKING_MODEL??'',ocr:process.env.AI_OCR_MODEL??''},
 aiEnabled:flag(process.env.AI_ENABLED),documentsEnabled:flag(process.env.DOCUMENT_PROCESSING_ENABLED),
 workerSecret:process.env.WORKER_SECRET??'',cronSecret:process.env.CRON_SECRET??'',
 admins:(process.env.ADMIN_EMAILS??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),
 limits:{generation:int(process.env.DAILY_GENERATION_LIMIT,40),marking:int(process.env.DAILY_MARKING_LIMIT,120),documents:int(process.env.DAILY_DOCUMENT_LIMIT,10)}
};
export const supabaseConfigured=()=>!!(env.supabaseUrl&&env.supabaseKey&&env.serviceKey);
type Status={ready:boolean;missing:string[]};
function check(pairs:[boolean,string][]):Status{const missing=pairs.filter(([ok])=>!ok).map(([,n])=>n);return {ready:missing.length===0,missing};}
/** Honest feature availability. Missing configuration disables a feature; nothing is simulated. */
export const generationStatus=()=>check([[env.aiEnabled,'AI_ENABLED=true'],[!!env.openaiKey,'OPENAI_API_KEY'],[!!env.models.generator,'AI_GENERATION_MODEL'],
 [!!env.models.validator,'AI_VALIDATION_MODEL'],[!env.models.generator||env.models.generator!==env.models.validator,'AI_VALIDATION_MODEL must differ from AI_GENERATION_MODEL']]);
export const markingStatus=()=>check([[env.aiEnabled,'AI_ENABLED=true'],[!!env.openaiKey,'OPENAI_API_KEY'],[!!env.models.marker,'AI_MARKING_MODEL'],
 [!!env.models.validator,'AI_VALIDATION_MODEL'],[!env.models.marker||env.models.marker!==env.models.validator,'AI_VALIDATION_MODEL must differ from AI_MARKING_MODEL']]);
export const documentsStatus=()=>check([[env.documentsEnabled,'DOCUMENT_PROCESSING_ENABLED=true']]);
export const ocrReady=()=>env.aiEnabled&&!!env.openaiKey&&!!env.models.ocr;
