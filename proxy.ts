import { NextResponse,type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
/** Refreshes Supabase Auth cookies. Authorisation itself happens server-side with auth.getUser(). */
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return response;
 const sb=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(list,headers)=>{
  for(const {name,value} of list)request.cookies.set(name,value);
  response=NextResponse.next({request});
  for(const {name,value,options} of list)response.cookies.set(name,value,options);
  for(const [k,v] of Object.entries(headers??{}))response.headers.set(k,v);
 }}});
 await sb.auth.getUser();
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|api/worker).*)']};
