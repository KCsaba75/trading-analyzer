// 1. FÁZIS: Kereskedési Stratégia Modul
// Funkció: Összeg bevitel, kockázati szint beállítás, stratégia típus választás

import { useState, useEffect } from 'react';
import { type StrategyConfig, type RiskLevel, type StrategyType } from '../../types';
import { Panel, Button, Input, Select, Badge } from '../../components/ui';
import { Save, Trash2, Edit3 } from 'lucide-react';

const RISK_PRESETS: Record<RiskLevel, { maxPos: number; stopLoss: number; takeProfit: number; maxTrades: number; maxPos2: number }> = {
  low:      { maxPos: 5,  stopLoss: 1.5, takeProfit: 3,   maxTrades: 3, maxPos2: 3 },
  medium:   { maxPos: 10, stopLoss: 2.5, takeProfit: 5,   maxTrades: 5, maxPos2: 5 },
  high:     { maxPos: 20, stopLoss: 4,   takeProfit: 8,   maxTrades: 10, maxPos2: 8 },
};

const STRATEGY_TYPE_LABELS: Record<StrategyType, string> = {
  'day-trading': 'Day Trading (perces/órás)',
  'swing': 'Swing Trading (napos/hetes)',
  'long-term': 'Hosszú távú (hetes/hónapos)',
};

export default function StrategyModule() {
  // Kezdőállapot - üres űrlap
  const blank = (): StrategyConfig => ({
    name: 'Új stratégia',
    initial_capital: 10000,
    risk_level: 'medium',
    strategy_type: 'swing',
    max_position_pct: 10,
    stop_loss_pct: 2.5,
    take_profit_pct: 5,
    max_daily_trades: 5,
    max_open_positions: 5,
  });

  const [strategies, setStrategies] = useState<StrategyConfig[]>([]);
  const [draft, setDraft] = useState<StrategyConfig>(blank());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // LocalStorage fallback (amíg nincs Supabase auth)
  useEffect(() => {
    const stored = localStorage.getItem('trading-strategies');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setStrategies(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  // Amikor a user változtat valamit
  const updateDraft = (patch: Partial<StrategyConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setIsDirty(true);
  };

  // Kockázati szint választásakor preset betöltése
  const applyRiskPreset = (level: RiskLevel) => {
    const preset = RISK_PRESETS[level];
    updateDraft({
      risk_level: level,
      max_position_pct: preset.maxPos,
      stop_loss_pct: preset.stopLoss,
      take_profit_pct: preset.takeProfit,
      max_daily_trades: preset.maxTrades,
      max_open_positions: preset.maxPos2,
    });
  };

  // Mentés
  const save = () => {
    if (editingId) {
      // Frissítés
      setStrategies((arr) =>
        arr.map((s) => (s.id === editingId ? { ...draft, id: editingId } : s))
      );
    } else {
      // Új hozzáadása
      const newStrategy: StrategyConfig = {
        ...draft,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setStrategies((arr) => [newStrategy, ...arr]);
    }
    persist();
    resetForm();
  };

  // Törlés
  const remove = (id: string) => {
    if (!confirm('Biztosan törlöd ezt a stratégiát?')) return;
    setStrategies((arr) => arr.filter((s) => s.id !== id));
    persist();
    if (editingId === id) resetForm();
  };

  // Szerkesztés
  const edit = (s: StrategyConfig) => {
    setDraft(s);
    setEditingId(s.id ?? null);
    setIsDirty(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setDraft(blank());
    setEditingId(null);
    setIsDirty(false);
  };

  // LocalStorage mentés (useEffect alább kezeli)
  const persist = () => {
    // state-ből mentünk useEffect-ben
  };

  // useEffect a mentéshez
  useEffect(() => {
    if (strategies.length > 0) {
      localStorage.setItem('trading-strategies', JSON.stringify(strategies));
    }
  }, [strategies]);

  return (
    <div className="space-y-4 md:space-y-6">
      <Panel
        title={editingId ? '✏️ Stratégia szerkesztése' : '➕ Új stratégia'}
        action={
          isDirty && (
            <Button variant="ghost" onClick={resetForm}>
              Mégse
            </Button>
          )
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Stratégia neve"
            value={draft.name}
            onChange={(v) => updateDraft({ name: v })}
            placeholder="pl. Konzervatív swing"
          />
          <Input
            label="Kezdő tőke (USD)"
            type="number"
            value={draft.initial_capital}
            min={100}
            step={100}
            onChange={(v) => updateDraft({ initial_capital: Number(v) || 0 })}
          />
          <Select<RiskLevel>
            label="Kockázati szint"
            value={draft.risk_level}
            onChange={(v) => applyRiskPreset(v)}
            options={[
              { value: 'low', label: '🟢 Alacsony (1-3% cél, 1.5% stop)' },
              { value: 'medium', label: '🟡 Közepes (5% cél, 2.5% stop)' },
              { value: 'high', label: '🔴 Magas (8%+ cél, 4% stop)' },
            ]}
          />
          <Select<StrategyType>
            label="Stratégia típusa"
            value={draft.strategy_type}
            onChange={(v) => updateDraft({ strategy_type: v })}
            options={(Object.keys(STRATEGY_TYPE_LABELS) as StrategyType[]).map((k) => ({
              value: k,
              label: STRATEGY_TYPE_LABELS[k],
            }))}
          />
          <Input
            label="Max pozíció méret (% tőke)"
            type="number"
            value={draft.max_position_pct}
            min={1}
            max={100}
            onChange={(v) => updateDraft({ max_position_pct: Number(v) || 0 })}
          />
          <Input
            label="Stop-loss (%)"
            type="number"
            value={draft.stop_loss_pct}
            min={0.1}
            step={0.1}
            onChange={(v) => updateDraft({ stop_loss_pct: Number(v) || 0 })}
          />
          <Input
            label="Take-profit (%)"
            type="number"
            value={draft.take_profit_pct}
            min={0.1}
            step={0.1}
            onChange={(v) => updateDraft({ take_profit_pct: Number(v) || 0 })}
          />
          <Input
            label="Max napi tranzakció"
            type="number"
            value={draft.max_daily_trades}
            min={1}
            onChange={(v) => updateDraft({ max_daily_trades: Number(v) || 0 })}
          />
          <Input
            label="Max nyitott pozíció"
            type="number"
            value={draft.max_open_positions}
            min={1}
            onChange={(v) => updateDraft({ max_open_positions: Number(v) || 0 })}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <Button onClick={save}>
            <Save className="inline w-4 h-4 mr-2" />
            {editingId ? 'Frissítés' : 'Mentés'}
          </Button>
          <Button variant="secondary" onClick={resetForm}>
            Új űrlap
          </Button>
        </div>
      </Panel>

      <Panel title={`📋 Mentett stratégiák (${strategies.length})`}>
        {strategies.length === 0 ? (
          <p className="text-[var(--color-muted)] text-center py-8">
            Még nincs mentett stratégia. Töltsd ki az űrlapot és mentsd el az elsőt!
          </p>
        ) : (
          <div className="grid gap-3">
            {strategies.map((s) => (
              <div
                key={s.id}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-lg">{s.name}</span>
                    <Badge color={
                      s.risk_level === 'low' ? 'bull' :
                      s.risk_level === 'medium' ? 'warn' : 'bear'
                    }>
                      {s.risk_level.toUpperCase()}
                    </Badge>
                    <Badge color="muted">{STRATEGY_TYPE_LABELS[s.strategy_type]}</Badge>
                  </div>
                  <div className="text-sm text-[var(--color-muted)]">
                    Tőke: ${s.initial_capital.toLocaleString()} · 
                    Max pozi: {s.max_position_pct}% · 
                    SL: {s.stop_loss_pct}% · 
                    TP: {s.take_profit_pct}%
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => edit(s)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button variant="danger" onClick={() => remove(s.id!)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="📊 Kockázati szint magyarázat">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-bull)]">
            <Badge color="bull">Alacsony</Badge>
            <p className="mt-2 text-[var(--color-muted)]">
              Konzervatív megközelítés. Kis pozíciók (5%), szűk stop-loss (1.5%), 
              alacsony napi aktivitás (3 trade). Ideális kezdőknek és tőkepiaci 
              bizonytalanság idején.
            </p>
          </div>
          <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-warn)]">
            <Badge color="warn">Közepes</Badge>
            <p className="mt-2 text-[var(--color-muted)]">
              Kiegyensúlyozott. 10%-os pozíciók, 2.5% stop, 5% cél. Napi 5 trade, 
              max 5 nyitott pozíció. A legtöbb trader számára ajánlott alapbeállítás.
            </p>
          </div>
          <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-bear)]">
            <Badge color="bear">Magas</Badge>
            <p className="mt-2 text-[var(--color-muted)]">
              Agresszív stratégia. Nagyobb pozíciók (20%), tágabb stop (4%), 
              magasabb cél (8%). Rövidebb időtáv, magasabb napi aktivitás. 
              Csak tapasztalt tradereknek.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
