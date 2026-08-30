// A syntactically valid placeholder so a missing VITE_SUPABASE_URL
// degrades to "auth calls fail" (loudly logged) rather than crashing
// @supabase/supabase-js's client construction and blanking the entire
// app - every route, including public marketing pages that need no
// session at all, would otherwise render nothing.
const PLACEHOLDER_SUPABASE_URL = 'https://misconfigured.invalid';

function requireEnv(name: string, value: string | undefined, placeholder: string): string {
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing environment variable ${name} - see apps/web/.env.example. Auth will not work until this is set.`);
    return placeholder;
  }
  return value;
}

export const env = {
  SUPABASE_URL: requireEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL, PLACEHOLDER_SUPABASE_URL),
  SUPABASE_ANON_KEY: requireEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY, 'placeholder-anon-key'),
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api',
  APP_NAME: import.meta.env.VITE_APP_NAME ?? 'Njala Past Papers & Exam Practice Platform',
};
