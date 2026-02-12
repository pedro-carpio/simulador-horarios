import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rlacdlmvipjxwesnrwnh.supabase.co'
const supabaseKey = 'sb_publishable_wSz48RtuLt5HLL7JO2Foow_yYJNAWll'

export const supabase = createClient(supabaseUrl, supabaseKey)
