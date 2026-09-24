# Trading Analyzer 🚀

YFinance + Supabase + Jev AI alapú kereskedési döntéstámogató platform.

**Élő demo:** https://github.com/KCsaba75/trading-analyzer  
**Supabase Dashboard:** https://supabase.com/dashboard/project/azjsjcgvbexxfqlrajrt  
**Status:** ✅ Mind a 3 fázis aktív

## ✅ Fázisok

### 1. Stratégia modul
- Kezdő tőke, kockázati szint (low/medium/high)
- Stratégia típus (day/swing/long-term)
- Stop-loss, take-profit, max pozíció méret
- LocalStorage fallback + Supabase backend

### 2. Elemzési modul
- **YFinance proxy** (Python) + Edge Function fallback
- 10 technikai indikátor: RSI, MACD, MA Cross, Bollinger, Volume, Stochastic, ADX, CCI, OBV, ATR
- Súlyozott szavazás rendszer
- **Jev AI** végső döntés (BUY/SELL/HOLD)

### 3. Belépési pont modul
- ATR-alapú stop-loss (1.5x ATR)
- 3 szintű take-profit (1.5R / 2.5R / 4R)
- Position sizing a kockázat alapján
- Reward/Risk vizualizáció

## 🛠️ Tech stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend:** Supabase (https://azjsjcgvbexxfqlrajrt.supabase.co)
- **YFinance Proxy:** Python (`localhost:8001`)
- **AI:** Jev AI (Requesty endpoint) + FreeLLMAPI fallback
- **Data:** Supabase Postgres + RLS

## 🚀 Fejlesztés

```bash
# 1. Backend (YFinance proxy)
cd backend
pip install -r requirements.txt
python yfinance_proxy.py   # localhost:8001

# 2. Frontend
cd frontend
npm install
npm run dev   # localhost:5173

# 3. Supabase Edge Function (opcionális)
supabase functions deploy analyze-stock
```

A .env.local automatikusan a Supabase projekthez van konfigurálva.

## 📁 Struktúra

```
trading-analyzer/
├── frontend/                  # React app
│   ├── src/
│   │   ├── modules/
│   │   │   ├── strategy/      # 1. fázis
│   │   │   ├── analysis/      # 2. fázis
│   │   │   └── entry-point/   # 3. fázis
│   │   ├── components/
│   │   ├── lib/supabase/
│   │   └── types/
│   └── .env.local             # ← Supabase konfig
├── backend/
│   ├── yfinance_proxy.py      # Python YFinance proxy
│   └── requirements.txt
└── supabase/
    ├── functions/analyze-stock/index.ts    # Edge Function (Jev + YFinance)
    ├── migrations/001_initial_schema.sql   # DB séma
    └── config.toml                          # Supabase CLI config
```

## 🎯 Supabase DB Séma

- `strategies` — felhasználó stratégiái (RLS: csak saját)
- `analyses` — részvény-elemzések (RLS: csak saját)  
- `entry_points` — trade belépési pontok (RLS: csak saját)

## 📊 Demo eredmények

A YFinance proxy tesztelve MSFT-re:
- Current price: $500.59
- Jev döntés: HOLD (50%)
- ATR: $10.87
- Score: -0.053

## 🔗 Linkek

- **GitHub:** https://github.com/KCsaba75/trading-analyzer
- **Supabase Dashboard:** https://supabase.com/dashboard/project/azjsjcgvbexxfqlrajrt
- **YFinance Proxy health:** http://localhost:8001/health
