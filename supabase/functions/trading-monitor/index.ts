// Supabase Edge Function: trading-monitor
// Bejárja a watchlist-et, elemzi a tickereket, és Telegram üzenetet küld, ha BUY/SELL döntés születik.
// A user stratégiáját is figyelembe veszi (max nyitott pozíciók, position size).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
const REQUESTY_API_KEY = Deno.env.get('REQUESTY_API_KEY');

// Debug logok
console.log('SUPABASE_URL: ' + (SUPABASE_URL ? 'set' : 'NOT SET'));
console.log('SUPABASE_SERVICE_ROLE_KEY: ' + (SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET'));
console.log('TELEGRAM_BOT_TOKEN: ' + (TELEGRAM_BOT_TOKEN ? 'set' : 'NOT SET'));
console.log('TELEGRAM_CHAT_ID: ' + (TELEGRAM_CHAT_ID ? 'set' : 'NOT SET'));

interface WatchlistItem {
  id: string;
  ticker: string;
  timeframe: string;
  last_alert_at: string | null;
}

interface ActiveStrategy {
  initial_capital: number;
  risk_level: string;
  max_open_positions: number;
  position_size_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  max_daily_trades: number;
}

interface OpenPosition {
  ticker: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  quantity: number;
}

interface AnalysisResult {
  ticker: string;
  current_price: number;
  weighted_score: number;
  jev_decision: 'BUY' | 'SELL' | 'HOLD';
  jev_confidence: number;
  jev_reasoning: string;
  pattern_stats?: { bullish: number; total: number; avgReturn5: number; avgReturn10: number; };
  trade_setup?: { entry: number; stop_loss: number; take_profit_1: number; take_profit_2: number; hold_time: string; risk_reward_ratio: number; position_size_pct: number; rationale: string; narrative: string; };
}

async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const url = SUPABASE_URL + '/rest/v1/watchlist?is_active=eq.true&select=id,ticker,timeframe,last_alert_at';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch watchlist: ' + resp.status);
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error('Error fetching watchlist: ' + e.message);
    return [];
  }
}

async function getActiveStrategy(): Promise<ActiveStrategy | null> {
  try {
    const url = SUPABASE_URL + '/rest/v1/strategies?is_active=eq.true&select=*&limit=1';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch strategy: ' + resp.status);
      return null;
    }
    const data = await resp.json();
    return data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('Error fetching strategy: ' + e.message);
    return null;
  }
}

async function getOpenPositions(): Promise<OpenPosition[]> {
  try {
    const url = SUPABASE_URL + '/rest/v1/positions?status=eq.open&select=ticker,direction,entry_price,quantity';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch positions: ' + resp.status);
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error('Error fetching positions: ' + e.message);
    return [];
  }
}

async function getDailyTradeCount(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = SUPABASE_URL + '/rest/v1/positions?created_at=gte.' + today + '&select=id';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) return 0;
    const data = await resp.json();
    return data.length;
  } catch (e) {
    return 0;
  }
}

async function analyze(ticker: string, timeframe: string): Promise<AnalysisResult | null> {
  try {
    const url = SUPABASE_URL + '/functions/v1/analyze-stock';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ticker: ticker, timeframe: timeframe })
    });
    if (!resp.ok) {
      console.error('Failed to analyze ' + ticker + ': ' + resp.status);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error('Error analyzing ' + ticker + ': ' + e.message);
    return null;
  }
}

async function sendTelegram(chatId: string, message: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set, cannot send message');
    return;
  }
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    const resp = await fetch(url, {
      timeout: 10000,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
    if (!resp.ok) {
      console.error('Failed to send Telegram message: ' + resp.status);
    }
  } catch (e) {
    console.error('Error sending Telegram message: ' + e.message);
  }
}

async function openPosition(ticker: string, direction: 'BUY' | 'SELL', entryPrice: number, quantity: number, strategy: ActiveStrategy): Promise<boolean> {
  try {
    const url = SUPABASE_URL + '/rest/v1/positions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ticker: ticker,
        direction: direction,
        entry_price: entryPrice,
        quantity: quantity,
        stop_loss: direction === 'BUY' ? entryPrice * (1 - strategy.stop_loss_pct / 100) : entryPrice * (1 + strategy.stop_loss_pct / 100),
        take_profit: direction === 'BUY' ? entryPrice * (1 + strategy.take_profit_pct / 100) : entryPrice * (1 - strategy.take_profit_pct / 100),
        status: 'open'
      })
    });
    if (!resp.ok) {
      console.error('Failed to open position: ' + resp.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error opening position: ' + e.message);
    return false;
  }
}

async function updateLastAlert(id: string) {
  try {
    const url = SUPABASE_URL + '/rest/v1/watchlist?id=eq.' + encodeURIComponent(id);
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ last_alert_at: new Date().toISOString() })
    });
    if (!resp.ok) {
      console.error('Failed to update last_alert_at: ' + resp.status);
    }
  } catch (e) {
    console.error('Error updating last_alert_at: ' + e.message);
  }
}

serve(async (req) => {
  console.log('Trading monitor started');
  
  // Stratégia és nyitott pozíciók lekérése
  const strategy = await getActiveStrategy();
  if (!strategy) {
    console.log('No active strategy found, skipping analysis');
    return new Response(JSON.stringify({ error: 'No active strategy' }), { headers: { 'Content-Type': 'application/json' } });
  }
  
  const openPositions = await getOpenPositions();
  const dailyTradeCount = await getDailyTradeCount();
  const openTickers = new Set(openPositions.map(p => p.ticker));
  
  const watchlist = await getWatchlist();
  const alertsSent = [];
  
  if (!TELEGRAM_CHAT_ID) {
    console.error('TELEGRAM_CHAT_ID not set, cannot send alerts');
    return new Response(JSON.stringify({ error: 'TELEGRAM_CHAT_ID not set' }), { headers: { 'Content-Type': 'application/json' } });
  }

  for (const item of watchlist) {
    // Anti-spam: max 1 alert / 30 perc / ticker
    if (item.last_alert_at) {
      const lastAlert = new Date(item.last_alert_at);
      if (Date.now() - lastAlert.getTime() < 30 * 60 * 1000) {
        console.log('Skipping ' + item.ticker + ' - alert sent recently');
        continue;
      }
    }

    // Ha már van nyitott pozíció ezen a ticker-en, nem nyitunk újat
    if (openTickers.has(item.ticker)) {
      console.log('Skipping ' + item.ticker + ' - already has open position');
      continue;
    }

    // Ha elértük a max napi tranzakciót, nem nyitunk újat
    if (dailyTradeCount >= strategy.max_daily_trades) {
      console.log('Skipping ' + item.ticker + ' - daily trade limit reached');
      continue;
    }

    // Ha elértük a max nyitott pozíciót, nem nyitunk újat
    if (openPositions.length >= strategy.max_open_positions) {
      console.log('Skipping ' + item.ticker + ' - max open positions reached');
      continue;
    }

    const result = await analyze(item.ticker, item.timeframe);
    if (!result) continue;

    // Csak BUY/SELL esetén küldünk
    if (result.jev_decision !== 'BUY' && result.jev_decision !== 'SELL') {
      console.log('No strong signal for ' + item.ticker + ' (' + result.jev_decision + '), skipping');
      continue;
    }
    
    // Erős jel filter: csak ha a score elég magas
    if (Math.abs(result.weighted_score) < 0.3) {
      console.log('Signal for ' + item.ticker + ' is too weak, skipping');
      continue;
    }

    // Pozíció méret számítása a stratégia alapján
    const positionValue = strategy.initial_capital * (strategy.position_size_pct / 100);
    const quantity = positionValue / result.current_price;
    
    // Pozíció megnyitása az adatbázisban
    const opened = await openPosition(item.ticker, result.jev_decision, result.current_price, quantity, strategy);
    if (!opened) {
      console.log('Failed to open position for ' + item.ticker);
      continue;
    }
    
    // Telegram üzenet küldése
    const emoji = result.jev_decision === 'BUY' ? '🟢' : '🔴';
    const ts = result.trade_setup;
    const ps = result.pattern_stats;
    
    let message = emoji + ' <b>' + result.jev_decision + ' ALERT</b> — ' + item.ticker + ' (' + result.timeframe + ')\n\n';
    message += '💰 Ár: <b>$' + result.current_price.toFixed(2) + '</b>\n';
    message += '📊 Score: ' + result.weighted_score.toFixed(3) + ' (Jev: <b>' + (result.jev_confidence * 100).toFixed(0) + '%</b>)\n';
    message += '💼 Pozíció: $' + positionValue.toFixed(2) + ' (' + quantity.toFixed(4) + ' ' + item.ticker + ')\n';

    if (ts) {
      message += '\n📍 Entry: $' + ts.entry.toFixed(2) + '\n';
      message += '🛑 SL: $' + ts.stop_loss.toFixed(2) + '\n';
      message += '🎯 TP1: $' + ts.take_profit_1.toFixed(2) + '\n';
      message += '🎯 TP2: $' + ts.take_profit_2.toFixed(2) + '\n';
      message += '⏰ Hold: ' + ts.hold_time + '\n';
    }

    if (ps && ps.total > 0) {
      message += '\n🧬 Pattern (60 nap 15m): ' + ps.bullish + '/' + ps.total + ' bullish, +5h átlag: ' + ps.avgReturn5 + '%\n';
    }

    message += '\n<i>' + (result.jev_reasoning || '') + '</i>\n\n';
    message += '⏰ ' + new Date().toLocaleString('hu-HU');
    
    await sendTelegram(TELEGRAM_CHAT_ID, message);
    await updateLastAlert(item.id);
    alertsSent.push({ ticker: item.ticker, decision: result.jev_decision, entry: result.current_price, quantity: quantity });
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('Trading monitor finished. Alerts sent: ' + alertsSent.length);
  return new Response(JSON.stringify({ 
    checked_tickers: watchlist.length,
    open_positions: openPositions.length,
    daily_trades: dailyTradeCount,
    alerts_sent: alertsSent.length,
    alerts: alertsSent
  }), { headers: { 'Content-Type': 'application/json' } });
});
