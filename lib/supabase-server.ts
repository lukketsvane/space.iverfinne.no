import { createClient } from "@supabase/supabase-js"

// These variables are available in the Vercel environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  // This check is important for local development and debugging.
  // In production on Vercel, these variables should be set.
  console.warn(
    "Supabase URL or Service Role Key is not defined in environment variables. Database operations will likely fail.",
  )
}

// Note: this client is for server-side use only, as it uses the service_role key.
// It bypasses Row Level Security (RLS).
export const supabaseServer = createClient(supabaseUrl!, supabaseServiceKey!)
