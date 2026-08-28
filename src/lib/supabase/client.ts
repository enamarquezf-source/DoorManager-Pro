import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (import.meta.env.VITEST ? 'https://test.supabase.co' : '');
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta.env.VITEST ? 'test-publishable-key' : '');

if ((import.meta.env.DEV || import.meta.env.VITE_SUPABASE_DIAGNOSTICS === 'true') && supabaseUrl) {
  console.info('[DMP Supabase]', { host: new URL(supabaseUrl).host });
}

if (import.meta.env.DEV && !import.meta.env.VITEST && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    'Faltan variables de entorno de Supabase: VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
