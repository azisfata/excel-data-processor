import { SupabaseClient } from '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface SupabaseClient {
    // allow storing global headers in the client instance in this codebase
    global?: {
      headers?: Record<string, string>;
    };
  }
}
