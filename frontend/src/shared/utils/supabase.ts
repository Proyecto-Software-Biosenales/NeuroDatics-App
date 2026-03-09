import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in frontend/.env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
