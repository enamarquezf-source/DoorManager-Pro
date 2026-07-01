import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (import.meta.env.DEV && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    'Faltan variables de entorno de Supabase: VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
