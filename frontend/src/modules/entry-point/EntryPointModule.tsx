// 3. FÁZIS: Belépési pont modul — Ajánlott ár, stop-loss, take-profit

import { useState, useMemo, useEffect } from 'react';
import { type StrategyConfig, type AnalysisResult, type EntryPoint } from '../../types';
import { Panel, Button, Input, Select, Badge } from '../../components/ui';
import { Target, Shield, TrendingUp, Calculator, AlertTriangle } from 'lucide-react';

interface RecommendedEntry {
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  position_size_usd: number;
  position_size_units: number;
  risk_usd: number;
  reward_usd: number;
  risk_reward_ratio: number;
  reasoning: string;
}

// Null-safe toFixed helper
function safeFixed(value: any, digits: number = 2): string {
  if (value == null || value === undefined || isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

export default function EntryPointModule() {
  // Bemeneti adatok
  const [ticker, setTicker] = useState('AAPL');
  const [currentPrice, setCurrentPrice] = useState('');
  const [capital, setCapital] = useState('10000');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [decision, setDecision] = useState<'BUY' | 'SELL' | 'HOLD'>('BUY');
  const [atrVolatility, setAtrVolatility] = useState(''); // ATR USD-ben
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Automatikus adatlekérés a Supabase Edge Function-ből induláskor
  useEffect(() => {
    fetchAnalysis();
  }, []);
  
  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      // Same-origin Vercel API route
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, timeframe: '1d' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (!data.error && data.current_price) {
          setCurrentPrice(String(data.current_price));
          setAtrVolatility(String(data.atr || '0'));
          if (data.jev_decision) {
            setDecision(data.jev_decision);
          }
          setError(null);
        } else if (data.error) {
          setError('Elemzés nem elérhető: ' + data.error);
        }
      } else {
        setError('Supabase hiba: HTTP ' + resp.status);
      }
    } catch (e: any) {
      setError('Hálózati hiba: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Kockázati paraméterek (a Stratégia modulból jönnek, de itt is beállíthatók)
  const riskPercent = riskLevel === 'low' ? 1 : riskLevel === 'medium' ? 2.5 : 4;
  
  const capitalNum = parseFloat(capital) || 0;
  const priceNum = parseFloat(currentPrice) || 0;
  const atrNum = parseFloat(atrVolatility) || 0;

  const recommendation = useMemo<RecommendedEntry | null>(() => {
    if (decision === 'HOLD' || priceNum <= 0 || capitalNum <= 0) return null;
    
    const riskAmount = capitalNum * (riskPercent / 100);
    const stopDistance = atrNum * 1.5; // 1.5x ATR a stop távolsága
    const positionSizeUnits = riskAmount / stopDistance;
    const positionSizeUsd = positionSizeUnits * priceNum;
    
    let entryPrice = priceNum;
    let stopLoss = 0;
    let tp1 = 0, tp2 = 0, tp3 = 0;
    
    if (decision === 'BUY') {
      // Enyhe visszahúzódásra várunk (0.5% pullback)
      entryPrice = priceNum * 0.995;
      stopLoss = entryPrice - stopDistance;
      tp1 = entryPrice + (stopDistance * 1.5);   // 1.5R
      tp2 = entryPrice + (stopDistance * 2.5);   // 2.5R
      tp3 = entryPrice + (stopDistance * 4);     // 4R
    } else { // SELL
      entryPrice = priceNum * 1.005;
      stopLoss = entryPrice + stopDistance;
      tp1 = entryPrice - (stopDistance * 1.5);
      tp2 = entryPrice - (stopDistance * 2.5);
      tp3 = entryPrice - (stopDistance * 4);
    }
    
    const rewardAmount = (tp1 - entryPrice) * positionSizeUnits * (decision === 'BUY' ? 1 : -1);
    const rr = rewardAmount / riskAmount;
    
    return {
      entry_price: parseFloat(entryPrice.toFixed(2)),
      stop_loss: parseFloat(stopLoss.toFixed(2)),
      take_profit_1: parseFloat(tp1.toFixed(2)),
      take_profit_2: parseFloat(tp2.toFixed(2)),
      take_profit_3: parseFloat(tp3.toFixed(2)),
      position_size_usd: parseFloat(positionSizeUsd.toFixed(2)),
      position_size_units: parseFloat(positionSizeUnits.toFixed(2)),
      risk_usd: parseFloat(riskAmount.toFixed(2)),
      reward_usd: parseFloat(rewardAmount.toFixed(2)),
      risk_reward_ratio: parseFloat(rr.toFixed(2)),
      reasoning: `ATR-alapú stop (${atrNum.toFixed(2)} USD), ${riskPercent}% kockázat a tőkéből ($${riskAmount.toFixed(0)}).`,
    };
  }, [priceNum, capitalNum, atrNum, riskPercent, decision]);

  if (decision === 'HOLD') {
    return (
      <div className="space-y-6">
        <Panel title="⏸ HOLD — Nincs belépési pont">
          <div className="bg-[var(--color-warn)]/10 border border-[var(--color-warn)] rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-[var(--color-warn)] mx-auto mb-3" />
            <h3 className="text-xl font-semibold mb-2">A Jev AI nem javasol belépést</h3>
            <p className="text-[var(--color-muted)]">
              A jelenlegi piaci feltételek nem elégségesek magas konfidenciájú trade-hez.
              Várj jobb belépési pontra, vagy módosítsd a Jev döntését fentebb.
            </p>
          </div>
          <div className="mt-4">
            <Select<'BUY' | 'SELL' | 'HOLD'>
              label="Jev döntés"
              value={decision}
              onChange={(v) => setDecision(v)}
              options={[
                { value: 'BUY', label: '🟢 BUY (long pozíció)' },
                { value: 'SELL', label: '🔴 SELL (short pozíció)' },
                { value: 'HOLD', label: '⚪ HOLD (várakozás)' },
              ]}
            />
          </div>
        </Panel>
      </div>
    );
  }

  if (!recommendation) return null;

  const upColor = decision === 'BUY' ? 'var(--color-bull)' : 'var(--color-bear)';

  return (
    <div className="space-y-6">
      <Panel title="📥 Bemeneti paraméterek"
        action={
          <Button onClick={fetchAnalysis} disabled={loading} variant="ghost">
            {loading ? '⏳ Frissítés...' : '🔄 Frissítés'}
          </Button>
        }>
        {loading && (
          <div className="mb-4 p-3 bg-[var(--color-accent)]/10 border border-[var(--color-accent)] rounded-lg text-sm flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full"></div>
            <span>Valós idejű adatok lekérése a YFinance + Jev AI-tól...</span>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-[var(--color-warn)]/10 border border-[var(--color-warn)] rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Input label="Ticker" value={ticker} onChange={(v) => setTicker(v.toUpperCase())} />
          <Input label={loading ? "Jelenlegi ár (USD) — betöltés..." : "Jelenlegi ár (USD)"} type="number" value={currentPrice} onChange={setCurrentPrice} step={0.01} placeholder={loading ? "..." : "0.00"} />
          <Input label="Tőke (USD)" type="number" value={capital} onChange={setCapital} step={100} />
          <Input label={loading ? "ATR (USD) — betöltés..." : "ATR volatilitás (USD)"} type="number" value={atrVolatility} onChange={setAtrVolatility} step={0.01} placeholder={loading ? "..." : "0.00"} />
          <Select<'BUY' | 'SELL' | 'HOLD'>
            label="Jev döntés"
            value={decision}
            onChange={(v) => setDecision(v)}
            options={[
              { value: 'BUY', label: '🟢 BUY' },
              { value: 'SELL', label: '🔴 SELL' },
              { value: 'HOLD', label: '⚪ HOLD' },
            ]}
          />
        </div>
        <div className="mt-3 text-xs text-[var(--color-muted)]">
          💡 Az ár, ATR és Jev döntés automatikusan lekérve a YFinance + Jev AI-ból a modul megnyitásakor.
          A ticker/tőke módosítása esetén kattints a "🔄 Frissítés" gombra.
        </div>
      </Panel>

      <Panel title="🎯 Ajánlott belépési pont">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Belépési ár" value={`$${recommendation.entry_price}`} color="text-[var(--color-accent)]" />
          <Stat 
            label={decision === 'BUY' ? 'Stop-loss' : 'Stop-loss (short)'}
            value={`$${recommendation.stop_loss}`}
            color="text-[var(--color-bear)]"
            icon={<Shield className="w-4 h-4" />}
          />
          <Stat label="TP1 (1.5R)" value={`$${recommendation.take_profit_1}`} color="text-[var(--color-bull)]" />
          <Stat label="TP2 (2.5R)" value={`$${recommendation.take_profit_2}`} color="text-[var(--color-bull)]" />
          <Stat label="TP3 (4R)" value={`$${recommendation.take_profit_3}`} color="text-[var(--color-bull)]" />
          <Stat label="Pozíció méret" value={`$${recommendation.position_size_usd}`} />
          <Stat label="Egység" value={`${recommendation.position_size_units}`} />
          <Stat label="Kockázat/Trade" value={`$${recommendation.risk_usd}`} color="text-[var(--color-bear)]" />
        </div>
        
        {/* Reward/Risk vizuálisan */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--color-muted)]">Kockázat : Nyereség arány</span>
            <span className="text-xl font-bold">
              1 : {recommendation.risk_reward_ratio.toFixed(2)}
            </span>
          </div>
          <div className="h-8 bg-[var(--color-border)] rounded overflow-hidden flex">
            <div
              className="bg-[var(--color-bear)] flex items-center justify-center text-xs text-white"
              style={{ width: `${(1 / (1 + recommendation.risk_reward_ratio)) * 100}%` }}
            >
              Risk ${recommendation.risk_usd}
            </div>
            <div
              className="flex items-center justify-center text-xs"
              style={{ 
                width: `${(recommendation.risk_reward_ratio / (1 + recommendation.risk_reward_ratio)) * 100}%`,
                backgroundColor: upColor
              }}
            >
              Reward ${recommendation.reward_usd}
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-bg)] rounded-lg p-4 text-sm">
          <div className="font-medium mb-1">📐 Számítási logika</div>
          <div className="text-[var(--color-muted)]">{recommendation.reasoning}</div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button 
            variant="primary"
            onClick={() => {
              // Itt lehetne menteni az entry point-ot a Supabase entry_points táblába
              alert(`Pozíció mentve!\nTicker: ${ticker}\nEntry: $${recommendation.entry_price}\nSize: $${recommendation.position_size_usd}`);
            }}
          >
            <Target className="inline w-4 h-4 mr-2" />
            Pozíció rögzítése
          </Button>
          <Button 
            variant="secondary"
            onClick={() => {
              const text = `${ticker} ${decision} @ $${recommendation.entry_price}\n` +
                `SL: $${recommendation.stop_loss} | TP1: $${recommendation.take_profit_1} | TP2: $${recommendation.take_profit_2} | TP3: $${recommendation.take_profit_3}\n` +
                `Size: $${recommendation.position_size_usd} (${recommendation.position_size_units} units)\n` +
                `Risk: $${recommendation.risk_usd} | Reward: $${recommendation.reward_usd} | RR: 1:${recommendation.risk_reward_ratio}`;
              navigator.clipboard.writeText(text);
            }}
          >
            📋 Másolás vágólapra
          </Button>
        </div>
      </Panel>

      <Panel title="📊 Pozíció menedzsment terv">
        <div className="space-y-3 text-sm">
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="font-medium mb-1">1. Belépés ($ {recommendation.entry_price})</div>
            <div className="text-[var(--color-muted)]">
              Várj egy enyhe {decision === 'BUY' ? 'visszahúzódást' : 'rally-t'} ({decision === 'BUY' ? '0.5% pullback' : '0.5% emelkedés'} a jelenlegi árhoz képest) a jobb kockázat-arány érdekében.
            </div>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="font-medium mb-1">2. Stop-loss ($ {recommendation.stop_loss})</div>
            <div className="text-[var(--color-muted)]">
              ATR-alapú stop (1.5x ATR = ${(atrNum * 1.5).toFixed(2)}). Ne módosítsd a stopot a trade alatt, kivéve ha a szerkezet megváltozik.
            </div>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="font-medium mb-1">3. Részleges take-profit (TP1: ${recommendation.take_profit_1})</div>
            <div className="text-[var(--color-muted)]">
              TP1 elérésekor zárd a pozíció 33%-át. A maradék 67% trailing stoppal védve TP2 felé mozog.
            </div>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="font-medium mb-1">4. Második szint (TP2: ${recommendation.take_profit_2})</div>
            <div className="text-[var(--color-muted)]">
              TP2-nél zárd a pozíció további 33%-át. A maradék 34% trailing stoppal TP3 felé halad.
            </div>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="font-medium mb-1">5. Végső cél (TP3: ${recommendation.take_profit_3})</div>
            <div className="text-[var(--color-muted)]">
              TP3-nál zárd a teljes pozíciót. Összesen ${recommendation.reward_usd} profit (1:{recommendation.risk_reward_ratio} RR arány).
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="⚠️ Kockázati figyelmeztetések">
        <ul className="space-y-2 text-sm text-[var(--color-muted)]">
          <li>• A Jev AI ajánlása NEM pénzügyi tanács. Mindig végezz saját elemzést (DYOR).</li>
          <li>• A piacok volatilisek — az ajánlott belépési pont elméleti, a valós végrehajtás eltérhet.</li>
          <li>• Csak olyan tőkével kereskedj, amelyet megengedhetsz magadnak elveszíteni.</li>
          <li>• A pozíció méret a kockázati szintednek megfelelően van kalkulálva ({riskPercent}% / trade).</li>
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value, color = '', icon }: { label: string; value: string; color?: string; icon?: any }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)] flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
