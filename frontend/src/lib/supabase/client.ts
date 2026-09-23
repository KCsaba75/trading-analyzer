// Supabase kliens - környezeti változók olvasása
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY nincs beállítva! Hozz létre .env.local fájlt.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// CRUD helper a strategy táblához
export const strategyApi = {
  async list(userId: string) {
    const { data, error } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(strategy: any) {
    const { data, error } = await supabase
      .from('strategies')
      .insert(strategy)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: any) {
    const { data, error } = await supabase
      .from('strategies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('strategies')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
