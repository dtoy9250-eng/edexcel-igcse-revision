'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { safeRedirect } from '../../src/domain/security.ts';
import { userClient } from '../supabase.ts';
import { assertSameOrigin,requestOrigin,requireUser } from '../auth.ts';
import { withParams } from '../messages.ts';
const Email=z.email().max(254),Password=z.string().min(10).max(128);
export async function signIn(fd:FormData){
 await assertSameOrigin();const next=safeRedirect(fd.get('next'));
 const p=z.object({email:Email,password:z.string().min(1).max(128)}).safeParse({email:fd.get('email'),password:fd.get('password')});
 const ok=p.success&&!(await (await userClient()).auth.signInWithPassword(p.data)).error;
 redirect(ok?next:withParams('/sign-in',{error:'signin',next}));
}
export async function signUp(fd:FormData){
 await assertSameOrigin();
 const p=z.object({email:Email,password:Password,display_name:z.string().trim().max(80),age:z.literal('on')}).safeParse({email:fd.get('email'),password:fd.get('password'),display_name:fd.get('display_name')??'',age:fd.get('age')});
 if(!p.success)redirect(withParams('/sign-up',{error:'invalid'}));
 const {error}=await (await userClient()).auth.signUp({email:p.data.email,password:p.data.password,options:{emailRedirectTo:`${await requestOrigin()}/auth/confirm?next=/onboarding`,data:{display_name:p.data.display_name}}});
 redirect(error?withParams('/sign-up',{error:'invalid'}):withParams('/sign-in',{notice:'signup'}));
}
export async function requestPasswordReset(fd:FormData){
 await assertSameOrigin();const p=Email.safeParse(fd.get('email'));
 if(p.success)await (await userClient()).auth.resetPasswordForEmail(p.data,{redirectTo:`${await requestOrigin()}/auth/confirm?next=/reset-password`});
 redirect(withParams('/forgot-password',{notice:'reset_sent'}));
}
export async function updatePassword(fd:FormData){
 await assertSameOrigin();await requireUser('/reset-password');
 const p=Password.safeParse(fd.get('password'));
 if(!p.success)redirect(withParams('/reset-password',{error:'invalid'}));
 if(p.data!==fd.get('confirm'))redirect(withParams('/reset-password',{error:'password_mismatch'}));
 const {error}=await (await userClient()).auth.updateUser({password:p.data});
 redirect(error?withParams('/reset-password',{error:'invalid'}):withParams('/dashboard',{notice:'saved'}));
}
export async function signOut(){await assertSameOrigin();await (await userClient()).auth.signOut();redirect('/');}
