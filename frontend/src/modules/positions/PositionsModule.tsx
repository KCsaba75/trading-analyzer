// 4. FÁZIS: Pozíciók modul — Stratégia választó + ajánlás aktiválása

import { useState, useEffect } from 'react';
import { supabase, positionsApi } from '../../lib/supabase/client';
import { Panel, Button, Select, Badge } from '../../components/ui';
import { Briefcase, CheckCircle2, XCircle, Clock, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, ExternalLink, Trash2 } from 'lucide-react';

interface Strategy {
  id: string;
  name: string;
  initial_capital: number;
  risk_level: string;
  strategy_type: string;
  max_open_positions: number;
  position_size_pct: number;
  is_active: boolean;
}

interface Position {
  id: string;
  ticker: string;
  strategy_id: string;
  strategy?: { name: string };
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  position_size: number;
  risk_reward_ratio: number;
  decision: string;
  status: 'pending' | 'open' | 'closed' | 'cancelled';
  opened_at: string | null;
  closed_at: string | null;
  close_price: number | null;
  pnl: number | null;
  confidence: number;
  reasoning: string;
  timeframe: string;
  created_at: string;
}

function safeFixed(value: any, digits: number = 2): string {
  if (value == null || value === undefined || isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

// Pending pozíció kora (percben)
function pendingAge(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge color="yellow"><Clock size={12} className="inline mr-1" />Várakozó</Badge>;
    case 'open':
      return <Badge color="green"><CheckCircle2 size={12} className="inline mr-1" />Aktív</Badge>;
    case 'closed':
      return <Badge color="blue"><CheckCircle2 size={12} className="inline mr-1" />Lezárt</Badge>;
    case 'cancelled':
      return <Badge color="gray"><XCircle size={12} className="inline mr-1" />Törölt</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}

function decisionBadge(decision: string) {
  if (decision === 'BUY') return <Badge color="green"><TrendingUp size={12} className="inline mr-1" />BUY</Badge>;
  if (decision === 'SELL') return <Badge color="red"><TrendingDown size={12} className="inline mr-1" />SELL</Badge>;
  return <Badge color="yellow">HOLD</Badge>;
}

export default function PositionsModule() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Stratégiák és pozíciók betöltése
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Stratégiák betöltése
      const { data: strategiesData, error: strategiesError } = await supabase
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: false });
      if (strategiesError) throw strategiesError;
      setStrategies(strategiesData ?? []);

      // Auto-select KI - alapértelmezetten MINDEN pozíciót mutatunk
      // (a user később választhat konkrét stratégiát, ha akar)

      // Pozíciók betöltése
      const positionsData = await positionsApi.list();
      setPositions(positionsData as Position[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Szűrt pozíciók a kiválasztott stratégia alapján
  // Ha NINCS kiválasztott stratégia (üres string), MINDEN pozíciót mutatunk
  // Ha VAN kiválasztott stratégia, csak az adott stratégia pozícióit mutatjuk
  const filteredPositions = positions.filter(p => !selectedStrategyId || p.strategy_id === selectedStrategyId);

  // Várakozó (pending) pozíciók — ezek az aktiválandó ajánlások
  const pendingPositions = filteredPositions.filter(p => p.status === 'pending');

  // Aktív (open) pozíciók
  const openPositions = filteredPositions.filter(p => p.status === 'open');

  // Lezárt (closed) pozíciók
  const closedPositions = filteredPositions.filter(p => p.status === 'closed');

  // Kiválasztott stratégia
  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId);

  // Napi limitek ellenőrzése
  const today = new Date().toISOString().split('T')[0];
  const todayOpens = filteredPositions.filter(p =>
    p.status === 'open' && p.opened_at && p.opened_at.startsWith(today)
  ).length;

  const maxOpenToday = selectedStrategy
    ? Math.min(selectedStrategy.max_open_positions || 999, selectedStrategy.position_size_pct ? Math.floor(100 / selectedStrategy.position_size_pct) : 999)
    : 999;

  const canOpenNew = selectedStrategy && selectedStrategy.is_active && todayOpens < maxOpenToday;

  // Pozíció aktiválása (pending → open)
  const handleActivate = async (positionId: string) => {
    if (!confirm('Aktiválod a pozíciót? (Státusz: open — manuálisan nyitod a bróker felületén!)')) return;
    setActionLoading(positionId);
    try {
      await positionsApi.activate(positionId);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Pozíció lezárása
  const handleClose = async (positionId: string, entryPrice: number, ticker: string) => {
    const closePriceStr = prompt(`Záróár ${ticker} (entry: ${safeFixed(entryPrice, 2)}):`);
    if (!closePriceStr) return;
    const closePrice = parseFloat(closePriceStr);
    if (isNaN(closePrice)) {
      alert('Érvénytelen ár!');
      return;
    }
    const pos = positions.find(p => p.id === positionId);
    // P&L számítás: BUY esetén close-entry, SELL esetén entry-close
    const direction = pos?.decision || 'BUY';
    const directionMultiplier = direction === 'BUY' ? 1 : -1;
    const pnl = pos
      ? (closePrice - pos.entry_price) * (pos.position_size || 1) * directionMultiplier
      : 0;
    const pnlStr = pnl >= 0 ? `+$${safeFixed(pnl, 2)} (nyereség)` : `-$${Math.abs(pnl).toFixed(2)} (veszteség)`;

    if (!confirm(`Lezárás ${ticker} @ ${safeFixed(closePrice, 2)}\n\nP&L: ${pnlStr}\n\nEz a P&L hozzáadódik a stratégia tőkéjéhez!\n\nBiztosan lezárod?`)) return;

    setActionLoading(positionId);
    try {
      await positionsApi.close(positionId, closePrice, pnl);
      await loadData();
      // Sikeres lezárás visszajelzés
      alert(`✅ Pozíció lezárva!\n\nP&L: ${pnlStr}\nA stratégia tőkéje frissítve.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Pozíció törlése
  const handleDelete = async (positionId: string) => {
    if (!confirm('Törlöd a pozíciót? (Csak pending státusznál ajánlott!)')) return;
    setActionLoading(positionId);
    try {
      await positionsApi.delete(positionId);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Pending pozíció frissítése — újraelemzi a tickert a legfrissebb árakkal
  const handleRefresh = async (positionId: string, ticker: string) => {
    setActionLoading(positionId);
    setError(null);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://azjsjcgvbexxfqlrajrt.supabase.co';
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker, timeframe: '15m' }),
      });

      if (!resp.ok) throw new Error(`Elemzés sikertelen: ${resp.status}`);

      const data = await resp.json();
      const newPrice = data.current_price;
      const decision = data.jev_decision;
      const confidence = data.jev_confidence;
      const tradeSetup = data.trade_setup || {};

      // Ellenőrizzük, hogy a döntés még mindig BUY/SELL
      if (decision !== 'BUY' && decision !== 'SELL') {
        await positionsApi.delete(positionId);
        alert(`${ticker}: Már nem BUY/SELL (${decision}) — a pozíció törölve.`);
        await loadData();
        return;
      }

      // Ellenőrizzük, hogy a piac nem mozdult-e el túl sokat (>0.5%)
      const oldPos = positions.find(p => p.id === positionId);
      const oldPrice = oldPos?.entry_price || 0;
      const priceChange = Math.abs(newPrice - oldPrice) / oldPrice;

      if (priceChange > 0.005) {
        // 0.5%-nál nagyobb változás → töröljük
        await positionsApi.delete(positionId);
        const dir = priceChange * 100;
        alert(`${ticker}: A piac ${dir.toFixed(2)}%-ot mozdult — a pozíció törölve (nem érdemes megnyitni).`);
        await loadData();
        return;
      }

      // Frissítjük az entry/SL/TP árakat + created_at (új 14.5 perc!)
      const sl = tradeSetup.stop_loss || oldPos?.stop_loss;
      const tp1 = tradeSetup.take_profit_1 || oldPos?.take_profit_1;
      const tp2 = tradeSetup.take_profit_2 || oldPos?.take_profit_2;
      const tp3 = tradeSetup.take_profit_3 || oldPos?.take_profit_3;
      const newEntry = tradeSetup.entry || newPrice;

      const { supabase } = await import('../../lib/supabase/client');
      const { error: updateError } = await supabase
        .from('positions')
        .update({
          entry_price: newEntry,
          stop_loss: sl,
          take_profit_1: tp1,
          take_profit_2: tp2,
          take_profit_3: tp3,
          confidence: confidence,
          decision: decision,
          reasoning: `Frissítve: ${decision} @ ${newPrice.toFixed(2)} (${(priceChange * 100).toFixed(2)}% változás)`,
          created_at: new Date().toISOString(),
        })
        .eq('id', positionId);

      if (updateError) throw updateError;

      await loadData();
      alert(`✅ ${ticker} pozíció frissítve! Új entry: $${newEntry.toFixed(2)}`);
    } catch (e: any) {
      setError(`Frissítési hiba: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Összes P&L
  const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const wins = closedPositions.filter(p => (p.pnl || 0) > 0).length;
  const losses = closedPositions.filter(p => (p.pnl || 0) <= 0).length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 'N/A';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Fejléc + Frissítés gomb */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">Pozíciók kezelése</h2>
          <p className="text-xs md:text-sm text-[var(--color-muted)]">
            Stratégia kiválasztása → ajánlás aktiválása → manuális megnyitás a brókerben
          </p>
        </div>
        <Button onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
          Frissítés
        </Button>
      </div>

      {/* Hiba */}
      {error && (
        <Panel title="Hiba">
          <div className="text-red-400 text-sm">{error}</div>
        </Panel>
      )}

      {/* Stratégia választó + státusz */}
      <Panel title="Stratégia kiválasztása">
        <div className="space-y-4">
          <Select
            value={selectedStrategyId}
            onChange={setSelectedStrategyId}
            options={[
              { value: '', label: '— Válassz stratégiát —' },
              ...strategies.map(s => ({
                value: s.id,
                label: `${s.name}${s.is_active ? ' ✅' : ''} — ${safeFixed(s.initial_capital, 0)} USD (${s.risk_level})`,
              })),
            ]}
          />

          {selectedStrategy && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <div className="text-xs text-[var(--color-muted)]">Státusz</div>
                <div className="text-sm font-medium mt-1">
                  {selectedStrategy.is_active
                    ? <span className="text-green-400">Aktív</span>
                    : <span className="text-yellow-400">Inaktív</span>}
                </div>
              </div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <div className="text-xs text-[var(--color-muted)]">Max pozíció</div>
                <div className="text-sm font-medium mt-1">{selectedStrategy.max_open_positions || 'N/A'}</div>
              </div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <div className="text-xs text-[var(--color-muted)]">Pozíció méret</div>
                <div className="text-sm font-medium mt-1">{selectedStrategy.position_size_pct || 'N/A'}%</div>
              </div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <div className="text-xs text-[var(--color-muted)]">Mai nyitások</div>
                <div className="text-sm font-medium mt-1">
                  {todayOpens} / {maxOpenToday}
                  {!canOpenNew && <span className="ml-1 text-red-400">(limit elérve)</span>}
                </div>
              </div>
            </div>
          )}

          {!canOpenNew && selectedStrategy && (
            <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
              <AlertTriangle size={14} className="inline mr-1" />
              <strong>Nem ajánlunk új pozíciót</strong> — a stratégia elérte a napi limitet vagy inaktív.
              {!selectedStrategy.is_active && ' Aktiváld a stratégiát a Stratégia modulban!'}
              {selectedStrategy.is_active && todayOpens >= maxOpenToday && ` Már ${todayOpens} pozíciót nyitottál ma (max: ${maxOpenToday}).`}
            </div>
          )}
        </div>
      </Panel>

      {/* Várakozó ajánlások (pending) */}
      {pendingPositions.length > 0 && (
        <Panel title={`Várakozó ajánlások (${pendingPositions.length})`}>
          <div className="space-y-3">
            {pendingPositions.map(p => (
              <div key={p.id} className={`bg-[var(--color-bg)] border rounded-lg p-4 ${
                pendingAge(p.created_at) >= 10
                  ? 'border-orange-500/50'
                  : pendingAge(p.created_at) >= 5
                  ? 'border-yellow-500/50'
                  : 'border-[var(--color-border)]'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">{p.ticker}</span>
                    {decisionBadge(p.decision)}
                    {statusBadge(p.status)}
                    <span className="text-xs text-[var(--color-muted)]">
                      {p.timeframe} • konfidencia: {(p.confidence * 100).toFixed(0)}%
                    </span>
                    {pendingAge(p.created_at) >= 5 && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        pendingAge(p.created_at) >= 10
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        ⏱️ {pendingAge(p.created_at).toFixed(0)} perc • {pendingAge(p.created_at) >= 10 ? 'Auto-frissítés!' : 'Frissítsd!'}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-muted)]">
                    {new Date(p.created_at).toLocaleString('hu-HU')}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Entry</div>
                    <div className="font-medium">${safeFixed(p.entry_price, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Stop Loss</div>
                    <div className="font-medium text-red-400">${safeFixed(p.stop_loss, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Take Profit 1</div>
                    <div className="font-medium text-green-400">${safeFixed(p.take_profit_1, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">R:R arány</div>
                    <div className="font-medium">{safeFixed(p.risk_reward_ratio, 2)}</div>
                  </div>
                </div>

                {p.reasoning && (
                  <div className="text-xs text-[var(--color-muted)] mb-3 italic">
                    {p.reasoning}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => handleActivate(p.id)}
                    disabled={!canOpenNew || actionLoading === p.id}
                    variant="primary"
                  >
                    <CheckCircle2 size={14} className="mr-1" />
                    Pozíció megnyitása (manuálisan a brókerben!)
                  </Button>
                  {pendingAge(p.created_at) >= 5 && (
                    <Button
                      onClick={() => handleRefresh(p.id, p.ticker)}
                      disabled={actionLoading === p.id}
                      variant="ghost"
                    >
                      <RefreshCw size={14} className="mr-1" />
                      Elemzés frissítése
                    </Button>
                  )}
                  <Button
                    onClick={() => handleDelete(p.id)}
                    disabled={actionLoading === p.id}
                    variant="ghost"
                  >
                    <Trash2 size={14} className="mr-1" />
                    Elvetés
                  </Button>
                </div>
                {!canOpenNew && (
                  <div className="text-xs text-yellow-400 mt-2">
                    ⚠️ A limit miatt inaktív — válassz másik stratégiát vagy várj holnapig.
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Aktív pozíciók (open) */}
      <Panel title={`Aktív pozíciók (${openPositions.length})`}>
        {openPositions.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)] text-center py-6">
            Nincs aktív pozíció. Aktiválj egy várakozó ajánlást fent!
          </div>
        ) : (
          <div className="space-y-3">
            {openPositions.map(p => (
              <div key={p.id} className="bg-[var(--color-bg)] border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Briefcase size={16} className="text-green-400" />
                    <span className="font-bold text-lg">{p.ticker}</span>
                    {decisionBadge(p.decision)}
                    {statusBadge(p.status)}
                  </div>
                  <span className="text-xs text-[var(--color-muted)]">
                    Nyitva: {p.opened_at ? new Date(p.opened_at).toLocaleString('hu-HU') : 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Entry</div>
                    <div className="font-medium">${safeFixed(p.entry_price, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Stop Loss</div>
                    <div className="font-medium text-red-400">${safeFixed(p.stop_loss, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">TP1</div>
                    <div className="font-medium text-green-400">${safeFixed(p.take_profit_1, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">TP2</div>
                    <div className="font-medium text-green-400">${safeFixed(p.take_profit_2, 2)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted)]">Méret</div>
                    <div className="font-medium">${safeFixed(p.position_size, 2)}</div>
                  </div>
                </div>

                <Button
                  onClick={() => handleClose(p.id, p.entry_price, p.ticker)}
                  disabled={actionLoading === p.id}
                  variant="ghost"
                >
                  <XCircle size={14} className="mr-1" />
                  Pozíció lezárása
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Statisztika + Lezárt pozíciók */}
      {closedPositions.length > 0 && (
        <Panel title="Statisztika és lezárt pozíciók">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-muted)]">Összes P&L</div>
              <div className={`text-lg font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${safeFixed(totalPnl, 2)}
              </div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-muted)]">Win rate</div>
              <div className="text-lg font-bold">{winRate}%</div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-muted)]">Nyertes</div>
              <div className="text-lg font-bold text-green-400">{wins}</div>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="text-xs text-[var(--color-muted)]">Vesztes</div>
              <div className="text-lg font-bold text-red-400">{losses}</div>
            </div>
          </div>

          <div className="space-y-2">
            {closedPositions.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{p.ticker}</span>
                  {decisionBadge(p.decision)}
                  <span className="text-xs text-[var(--color-muted)]">
                    ${safeFixed(p.entry_price, 2)} → ${safeFixed(p.close_price, 2)}
                  </span>
                </div>
                <div className={`font-bold ${(p.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${safeFixed(p.pnl, 2)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Információs panel */}
      <Panel title="Hogyan működik?">
        <div className="text-sm text-[var(--color-muted)] space-y-2">
          <p>
            <Briefcase size={14} className="inline mr-1" />
            A <strong>trading-monitor</strong> 15 percenként automatikusan elemzi a watchlist tickereit a Supabase <strong>pg_cron</strong> segítségével.
            Ha van BUY/SELL jel és a stratégia engedi, akkor létrehoz egy <strong>pending</strong> pozíciót az adatbázisban.
          </p>
          <p>
            <strong>1.</strong> Válaszd ki a fenti legördülőből a stratégiát, amelyik alapján kereskedni szeretnél.
          </p>
          <p>
            <strong>2.</strong> A <strong>"Várakozó ajánlások"</strong> panelben megjelennek a friss BUY/SELL jelek.
          </p>
          <p>
            <strong>3.</strong> Kattints a <strong>"Pozíció megnyitása"</strong> gombra — ez a státuszt <strong>"open"-re</strong> állítja.
            <br />
            <em className="text-xs">⚠️ Fontos: a tényleges pozíciót a bróker felületén kell manuálisan megnyitnod, itt CSAK nyilvántartjuk!</em>
          </p>
          <p>
            <strong>4.</strong> Amikor zárod a pozíciót a brókerben, kattints a <strong>"Pozíció lezárása"</strong> gombra és írd be a záróárat — a rendszer kiszámolja a P&L-t.
          </p>
          <p>
            <AlertTriangle size={14} className="inline mr-1" />
            Ha a napi limit elérve, vagy a stratégia inaktív, a rendszer <strong>nem ajánl új pozíciót</strong>.
          </p>
        </div>
      </Panel>
    </div>
  );
}
