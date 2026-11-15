import { NextResponse,type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runWorker } from '../../../lib/jobs.ts';
import { env,supabaseConfigured } from '../../../lib/env.ts';
export const maxDuration=60;
export const dynamic='force-dynamic';
const same=(a:string,b:string)=>!!a&&!!b&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
/** Vercel Cron (Authorization: Bearer CRON_SECRET) or an external scheduler (x-worker-secret: WORKER_SECRET). */
async function handle(req:NextRequest){
 if(!supabaseConfigured())return NextResponse.json({error:'NOT_CONFIGURED'},{status:503});
 const auth=req.headers.get('authorization')??'',bearer=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(!same(bearer,env.cronSecret)&&!same(req.headers.get('x-worker-secret')??'',env.workerSecret))return NextResponse.json({error:'UNAUTHORISED'},{status:401});
 return NextResponse.json({processed:await runWorker({budgetMs:50_000,maxJobs:12})});
}
export const GET=handle;
export const POST=handle;
