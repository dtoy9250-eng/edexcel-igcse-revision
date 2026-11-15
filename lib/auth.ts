import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { sameOrigin } from '../src/domain/security.ts';
import { userClient,serviceClient } from './supabase.ts';
import { env,supabaseConfigured } from './env.ts';
export type Programme='double_award'|'separate_sciences';
export type Profile={user_id:string;display_name:string;time_zone:string;daily_goal_minutes:number;extra_time_percent:0|25|50|100;programme_key:Programme|null;practice_difficulty:'standard'|'stretch'|'challenge'};
/** Validates the session with Supabase Auth (auth.getUser), never by trusting a client-supplied id. */
export async function currentUser(){
 if(!supabaseConfigured())return null;
 const {data}=await (await userClient()).auth.getUser();return data.user??null;
}
export async function requireUser(next='/dashboard'){
 if(!supabaseConfigured())redirect('/setup');
 const user=await currentUser();if(!user)redirect(`/sign-in?next=${encodeURIComponent(next)}`);return user;
}
export async function requireProfile(next='/dashboard'){
 const user=await requireUser(next);const sb=await userClient();
 let {data}=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle();
 if(!data){await serviceClient().from('profiles').upsert({user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true});({data}=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle());}
 return {user,profile:data as Profile};
}
export const isAdmin=(email?:string|null)=>!!email&&env.admins.includes(email.toLowerCase());
export async function requestOrigin(){
 const h=await headers();const host=h.get('x-forwarded-host')??h.get('host');const proto=h.get('x-forwarded-proto')??(host?.startsWith('localhost')?'http':'https');
 return env.appUrl||(host?`${proto}://${host}`:'');
}
/** Explicit CSRF/origin check for every state-changing server action (in addition to Next.js checks). */
export async function assertSameOrigin(){
 const h=await headers();const host=h.get('x-forwarded-host')??h.get('host');const proto=h.get('x-forwarded-proto')??(host?.startsWith('localhost')?'http':'https');
 const allowed=[env.appUrl,host?`${proto}://${host}`:''].filter(Boolean);
 if(!allowed.some(a=>sameOrigin(h.get('origin'),a)))throw new Error('ORIGIN_REJECTED');
}
