import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://rlacdlmvipjxwesnrwnh.supabase.co'
const supabaseKey =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_wSz48RtuLt5HLL7JO2Foow_yYJNAWll'

export const supabase = createClient(supabaseUrl, supabaseKey)
