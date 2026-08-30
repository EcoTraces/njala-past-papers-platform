function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    // eslint-disable-next-line no-console
    console.warn(`Missing environment variable ${name} - see apps/web .env.example`);
    return '';
  }
  return value;
}

export const env = {
  SUPABASE_URL: requireEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  SUPABASE_ANON_KEY: requireEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api',
  APP_NAME: import.meta.env.VITE_APP_NAME ?? 'Njala Past Papers & Exam Practice Platform',
};
