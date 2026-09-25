// 3. FÁZIS: Watchlist (Figyelőlista) szerkesztő modul
// Funkció: A trading-monitor által figyelt tickerek és timeframes kezelése

import { useState, useEffect } from 'react';
import { watchlistApi } from '../../lib/supabase/client';
import { Panel, Button, Input, Select, Badge } from '../../components/ui';
import { Eye, Trash2, Plus, Edit3, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

interface WatchlistItem {
  id: string;
  ticker: string;
  timeframe: string;
  is_active: boolean;
  last_alert_at: string | null;
  created_at: string;
}

const TIMEFRAME_OPTIONS = [
  { value: '1m', label: '1 perc (scalping)' },
  { value: '5m', label: '5 perc (rövid táv)' },
  { value: '15m', label: '15 perc (day trade)' },
  { value: '30m', label: '30 perc (day trade)' },
  { value: '1h', label: '1 óra (swing)' },
  { value: '1d', label: '1 nap (hosszú táv)' },
];

const POPULAR_TICKERS = [
  'AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META', 'NFLX',
  'AMD', 'INTC', 'CRM', 'ORCL', 'IBM', 'DIS', 'BA', 'JPM',
  'V', 'MA', 'WMT', 'KO', 'PEP', 'MCD', 'NKE', 'ADBE',
];

function safeFixed(value: any, digits: number = 2): string {
  if (value == null || value === undefined || isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

export default function WatchlistModule() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Új ticker form
  const [newTicker, setNewTicker] = useState('');
  const [newTimeframe, setNewTimeframe] = useState('15m');
  const [showAddForm, setShowAddForm] = useState(false);

  const loadWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await watchlistApi.list();
      setItems(data as WatchlistItem[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  const handleAdd = async () => {
    if (!newTicker.trim()) {
      alert('Add meg a ticker nevét!');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await watchlistApi.create({
        ticker: newTicker.toUpperCase().trim(),
        timeframe: newTimeframe,
        is_active: true,
      });
      setNewTicker('');
      setNewTimeframe('15m');
      setShowAddForm(false);
      await loadWatchlist();
    } catch (e: any) {
      setError(`Hiba: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: WatchlistItem) => {
    try {
      await watchlistApi.toggleActive(item.id, !item.is_active);
      await loadWatchlist();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleTimeframeChange = async (item: WatchlistItem, newTf: string) => {
    try {
      await watchlistApi.update(item.id, { timeframe: newTf });
      await loadWatchlist();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string, ticker: string) => {
    if (!confirm(`Törlöd a(z) ${ticker} tickert a figyelőlistából?`)) return;
    try {
      await watchlistApi.delete(id);
      await loadWatchlist();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const activeCount = items.filter(i => i.is_active).length;
  const inactiveCount = items.length - activeCount;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Fejléc + statisztika */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="text-xs text-[var(--color-muted)]">Összes ticker</div>
          <div className="text-2xl font-bold mt-1">{items.length}</div>
        </div>
        <div className="bg-[var(--color-panel)] border border-green-500/30 rounded-lg p-4">
          <div className="text-xs text-[var(--color-muted)]">Aktív (figyelt)</div>
          <div className="text-2xl font-bold mt-1 text-green-400">{activeCount}</div>
        </div>
        <div className="bg-[var(--color-panel)] border border-gray-500/30 rounded-lg p-4">
          <div className="text-xs text-[var(--color-muted)]">Inaktív</div>
          <div className="text-2xl font-bold mt-1 text-gray-400">{inactiveCount}</div>
        </div>
        <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="text-xs text-[var(--color-muted)]">Auto-frissítés</div>
          <div className="text-2xl font-bold mt-1">15p</div>
          <div className="text-xs text-[var(--color-muted)]">pg_cron</div>
        </div>
      </div>

      {/* Hiba */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={14} className="inline mr-1" />
          {error}
        </div>
      )}

      {/* Új ticker hozzáadása */}
      <Panel
        title="Új ticker hozzáadása"
        action={
          <Button variant="ghost" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Mégse' : <><Plus size={14} className="mr-1" /> Hozzáadás</>}
          </Button>
        }
      >
        {showAddForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Ticker szimbólum"
                value={newTicker}
                onChange={setNewTicker}
                placeholder="pl. AAPL, TSLA, NVDA"
              />
              <Select
                label="Timeframe"
                value={newTimeframe}
                onChange={setNewTimeframe}
                options={TIMEFRAME_OPTIONS}
              />
            </div>

            {/* Népszerű tickerek gyors választása */}
            <div>
              <div className="text-xs text-[var(--color-muted)] mb-2">Gyors választás:</div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_TICKERS.map(t => (
                  <button
                    key={t}
                    onClick={() => setNewTicker(t)}
                    className={`px-2 py-1 rounded text-xs font-mono border transition ${
                      newTicker === t
                        ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-border)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={saving || !newTicker.trim()}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
                Hozzáadás a figyelőlistához
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddForm(false); setNewTicker(''); }}>
                Mégse
              </Button>
            </div>
          </div>
        )}
        {!showAddForm && (
          <div className="text-sm text-[var(--color-muted)] text-center py-4">
            Kattints a "Hozzáadás" gombra új ticker felvételéhez.
          </div>
        )}
      </Panel>

      {/* Watchlist táblázat */}
      <Panel
        title={`Figyelőlista (${items.length})`}
        action={
          <Button variant="ghost" onClick={loadWatchlist} disabled={loading}>
            <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
            Frissítés
          </Button>
        }
      >
        {loading && items.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-muted)]">
            <Loader2 size={24} className="inline animate-spin mr-2" />
            Figyelőlista betöltése...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-muted)]">
            A figyelőlista üres. Adj hozzá tickereket fent!
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className={`bg-[var(--color-bg)] border rounded-lg p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 ${
                  item.is_active
                    ? 'border-[var(--color-border)]'
                    : 'border-gray-500/30 opacity-60'
                }`}
              >
                {/* Ticker és státusz */}
                <div className="flex items-center gap-3 flex-1">
                  <Eye size={16} className={item.is_active ? 'text-green-400' : 'text-gray-500'} />
                  <div>
                    <div className="font-bold text-lg font-mono">{item.ticker}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {item.is_active ? (
                        <Badge color="green">✅ Aktív</Badge>
                      ) : (
                        <Badge color="gray">⏸️ Inaktív</Badge>
                      )}
                      <Badge color="blue">{item.timeframe}</Badge>
                      {item.last_alert_at && (
                        <span className="text-xs text-[var(--color-muted)]">
                          Utolsó alert: {new Date(item.last_alert_at).toLocaleString('hu-HU')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeframe választó */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-muted)]">TF:</span>
                  <select
                    value={item.timeframe}
                    onChange={(e) => handleTimeframeChange(item, e.target.value)}
                    className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
                  >
                    {TIMEFRAME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.value}</option>
                    ))}
                  </select>
                </div>

                {/* Akció gombok */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleToggleActive(item)}
                    variant={item.is_active ? 'ghost' : 'primary'}
                    size="sm"
                  >
                    {item.is_active ? '⏸️ Szünet' : '▶️ Aktív'}
                  </Button>
                  <Button
                    onClick={() => handleDelete(item.id, item.ticker)}
                    variant="ghost"
                    size="sm"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Info panel */}
      <Panel title="Hogyan működik?">
        <div className="text-sm text-[var(--color-muted)] space-y-2">
          <p>
            <strong>1.</strong> A <strong>Figyelőlista</strong> tartalmazza azokat a tickereket, amelyeket a <code>trading-monitor</code> 15 percenként automatikusan elemez (Supabase <code>pg_cron</code>).
          </p>
          <p>
            <strong>2.</strong> Csak az <strong>Aktív</strong> státuszú tickereket elemzi a rendszer — az inaktívak "szünetelnek".
          </p>
          <p>
            <strong>3.</strong> A <strong>Timeframe</strong> módosításával szabályozhatod, hogy milyen időkereten fusson az elemzés (1m, 5m, 15m, 30m, 1h, 1d).
          </p>
          <p>
            <strong>4.</strong> Ha BUY/SELL jelet talál a rendszer és a stratégia engedi, <strong>pending pozíciót</strong> hoz létre a <code>positions</code> táblában + Telegram üzenetet küld.
          </p>
          <p>
            <strong>5.</strong> A pending pozíciók a Pozíciók lapon jelennek meg — ott aktiválhatod vagy frissítheted őket.
          </p>
        </div>
      </Panel>
    </div>
  );
}
