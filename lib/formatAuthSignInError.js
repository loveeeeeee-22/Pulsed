/**
 * User-facing copy for Supabase `signInWithPassword` failures (GoTrue).
 * Raw messages are often clearer than a single generic string.
 */
export function formatAuthSignInError(error) {
  if (!error) return 'Sign-in failed. Please try again.'

  const msg = String(error.message || '').trim()
  const code = String(error.code || '').toLowerCase()

  if (code === 'email_not_confirmed' || /email\s+not\s+confirmed|confirm your email|not been confirmed/i.test(msg)) {
    return 'This email is not verified yet. Check your inbox for the Supabase confirmation link, or in the Supabase dashboard go to Authentication → Users and confirm this user. Then try again.'
  }

  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    /invalid login credentials|invalid email or password|wrong password/i.test(msg)
  ) {
    return 'That email and password do not match this Supabase project. Confirm in the Supabase dashboard (Authentication → Users) that this exact email exists, is confirmed, and uses email/password (not only Google). Check for typos (e.g. extra digits in the address). If the account is new, open the email confirmation link first, then log in.'
  }

  if (code === 'user_banned' || /banned|disabled/i.test(msg)) {
    return 'This account cannot sign in. Contact support or check the user in the Supabase dashboard.'
  }

  if (code === 'too_many_requests' || /rate limit|too many requests/i.test(msg)) {
    return 'Too many attempts. Wait a minute and try again.'
  }

  return msg || 'Sign-in failed. You can also try logging in from /auth, then return here.'
}
