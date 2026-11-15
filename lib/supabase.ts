import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.ts';
/** Learner-scoped client: every query runs under the learner's JWT and the database RLS policies. */
export async function userClient(){
 const store=await cookies();
 return createServerClient(env.supabaseUrl,env.supabaseKey,{cookies:{getAll:()=>store.getAll(),
  setAll:list=>{try{for(const {name,value,options} of list)store.set(name,value,options);}catch{/* Server Components cannot set cookies; proxy.ts refreshes sessions. */}}}});
}
let admin:SupabaseClient|null=null;
/** Service-role client. Bypasses RLS: callers must scope every query to a verified user id. */
export function serviceClient(){
 admin??=createClient(env.supabaseUrl,env.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 return admin;
}
