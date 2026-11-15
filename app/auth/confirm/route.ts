import { NextResponse,type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeRedirect } from '../../../src/domain/security.ts';
import { userClient } from '../../../lib/supabase.ts';
import { supabaseConfigured } from '../../../lib/env.ts';
/** Email confirmation, magic-link and password-recovery callback (PKCE code or token hash). */
export async function GET(request:NextRequest){
 const url=new URL(request.url);const next=safeRedirect(url.searchParams.get('next'));
 if(!supabaseConfigured())return NextResponse.redirect(new URL('/setup',url.origin));
 const sb=await userClient();const code=url.searchParams.get('code'),token_hash=url.searchParams.get('token_hash'),type=url.searchParams.get('type') as EmailOtpType|null;
 let ok=false;
 if(code)ok=!(await sb.auth.exchangeCodeForSession(code)).error;
 else if(token_hash&&type)ok=!(await sb.auth.verifyOtp({token_hash,type})).error;
 return NextResponse.redirect(new URL(ok?next:'/sign-in?error=link',url.origin));
}
