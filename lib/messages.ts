const MESSAGES:Record<string,string>={
 invalid:'Please check the form and try again.',signin:'Sign-in failed. Check your email and password, or confirm your email address first.',
 link:'That link is invalid or has expired. Request a new one.',signup:'Check your email to confirm your account, then sign in.',
 reset_sent:'If an account exists for that address, a reset link has been sent.',password_mismatch:'The passwords do not match.',
 saved:'Saved.',settings_saved:'Settings saved.',queued:'Queued. Each question is generated, independently checked and shown only if it passes validation.',
 deleted:'Your account and private data have been deleted.',confirm_delete:'Type DELETE to confirm account deletion.',
 imported:'Objectives imported for review. Check the evidence, then verify them.',verified:'Objectives verified and available for practice.',
 reviewed:'Document marked as reviewed.',removed:'Document deleted.',remark:'Marking queued again.',
 ORIGIN_REJECTED:'This request did not come from this site and was blocked.',PROGRAMME_REQUIRED:'Choose your course (Double Award or separate sciences) first.',
 AI_NOT_CONFIGURED:'AI features are not configured on this deployment.',DAILY_LIMIT_REACHED:'Daily limit reached. Try again tomorrow.',
 ANSWER_LOCKED:'This answer has already been submitted and is locked.',EXAM_CLOSED:'Exam time has ended. Your last saved answer was kept.',
 MOCK_NOT_READY:'This mock is not ready to start.',MOCK_NOT_ACTIVE:'This mock is not in progress.',QUESTION_NOT_VALIDATED:'That question has not passed validation.',
 QUALIFICATION_OUTSIDE_LEARNER_PROGRAMME:'That paper is not part of your selected course.',PAPER_OUTSIDE_SELECTED_QUALIFICATION:'That paper is not part of your selected course.',
 NOT_ENOUGH_VALIDATED_QUESTIONS:'Not enough validated questions yet. Generate more practice questions for this paper, then try again.',
 INVALID_TIME_ZONE:'Choose a valid time zone.',UPLOADS_DISABLED:'Private uploads are disabled on this deployment.',UPLOAD_INVALID:'That file cannot be uploaded. PDF, PNG or JPEG up to 25 MiB, with rights confirmed.',
 UPLOAD_MISSING:'The upload did not complete. Please try again.',SOURCE_CHECKSUM_MISMATCH:'The downloaded specification does not match the recorded checksum, so it was not used.',
 CROSS_CHECK_FAILED:'The Double Award cross-check failed, so nothing was imported.',NOT_ADMIN:'Administrator access is required.',IMPORT_NOT_VERIFIED:'Import and pass the cross-check before verifying.',
 FILE_SIGNATURE_MISMATCH:'The file contents did not match its declared type and were removed.',SIZE_MISMATCH:'The uploaded file size did not match and it was removed.',TOO_MANY_PAGES:'Documents are limited to 100 pages.'
};
export const message=(code?:string|null)=>code?(MESSAGES[code]??'Something went wrong. Please try again.'):null;
export function codeOf(err:{message?:string}|null|undefined){const m=err?.message??'';return /^[A-Z0-9_]{3,80}$/.test(m)?m:'UNEXPECTED';}
export const withParams=(path:string,params:Record<string,string>)=>`${path}${path.includes('?')?'&':'?'}${new URLSearchParams(params)}`;
