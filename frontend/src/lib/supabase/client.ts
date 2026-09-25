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

// CRUD helper a positions táblához
export const positionsApi = {
  async list(userId?: string) {
    let query = supabase
      .from('positions')
      .select('*, strategy:strategies(name)')
      .order('opened_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async listOpen(userId?: string) {
    let query = supabase
      .from('positions')
      .select('*, strategy:strategies(name)')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async create(position: any) {
    const { data, error } = await supabase
      .from('positions')
      .insert(position)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async activate(id: string) {
    const { data, error } = await supabase
      .from('positions')
      .update({
        status: 'open',
        opened_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async close(id: string, closePrice: number, pnl: number) {
    // 1. Lekérdezzük a pozíciót, hogy megkapjuk a strategy_id-t
    const { data: position, error: fetchError } = await supabase
      .from('positions')
      .select('strategy_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    // 2. Pozíció lezárása
    const { data, error } = await supabase
      .from('positions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_price: closePrice,
        pnl: pnl,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // 3. Stratégia tőkéjének frissítése a P&L-lel
    if (position?.strategy_id) {
      const { data: strategy, error: stratError } = await supabase
        .from('strategies')
        .select('initial_capital')
        .eq('id', position.strategy_id)
        .single();
      if (!stratError && strategy) {
        const newCapital = Number(strategy.initial_capital) + Number(pnl);
        await supabase
          .from('strategies')
          .update({
            initial_capital: newCapital,
            updated_at: new Date().toISOString(),
          })
          .eq('id', position.strategy_id);
      }
    }

    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// CRUD helper a watchlist táblához
export const watchlistApi = {
  async list() {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .order('ticker', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(item: { ticker: string; timeframe: string; is_active: boolean }) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ ...item, last_alert_at: null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<{ ticker: string; timeframe: string; is_active: boolean }>) {
    const { data, error } = await supabase
      .from('watchlist')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async toggleActive(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('watchlist')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
