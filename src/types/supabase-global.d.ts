import { Database } from './importMeta';

interface GlobalSupabase {
  headers: Record<string, string>;
  db: Database;
}

interface ExtendedSupabaseClient {
  global?: GlobalSupabase;
}

declare global {
  var supabase: ExtendedSupabaseClient & {
    global?: GlobalSupabase;
  };
}
