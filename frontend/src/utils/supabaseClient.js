import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://tbkaqgvnuurnsjbpmags.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_EPEgQd8IB2NfUL3x0ZotBg_4N_6avzw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
