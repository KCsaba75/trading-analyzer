# Trading Analyzer

YFinance + Supabase + Jev AI alapú kereskedési döntéstámogató platform.

## 🎯 Fázisok

### ✅ 1. fázis — Stratégia modul (kész)
- Kezdő tőke bevitel
- 3 kockázati szint preset
- Stratégia típus (day/swing/long-term)
- Stop-loss, take-profit, max pozíció méret
- LocalStorage + Supabase CRUD

### 🚧 2. fázis — Elemzési modul (tervezett)
- YFinance 15m adatok lekérés
- 10 technikai indikátor kiszámítása
- Súlyozott szavazás
- Jev AI végső döntés (BUY/SELL/HOLD)

### 🚧 3. fázis — Belépési pont (tervezett)
- Ajánlott belépési ár
- Stop-loss és take-profit szintek
- Pozíció méretezés a kockázati alapján
- Érvényességi idő

## 🛠️ Tech stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Adatok:** YFinance (15m timeframes)
- **AI:** Jev AI (10 indikátor aggregáció)

## 🚀 Fejlesztés

```bash
# 1. Frontend
cd frontend
npm install
npm run dev

# 2. Supabase (külön terminál)
supabase start
supabase db reset  # séma init
```

## 📁 Struktúra

```
trading-analyzer/
├── frontend/             # React app
│   ├── src/
│   │   ├── modules/
│   │   │   ├── strategy/    # 1. fázis
│   │   │   ├── analysis/    # 2. fázis (tervezett)
│   │   │   └── entry-point/ # 3. fázis (tervezett)
│   │   ├── components/
│   │   ├── lib/supabase/
│   │   └── types/
│   └── package.json
├── supabase/
│   ├── functions/        # Edge Functions
│   └── migrations/       # SQL sémák
└── README.md
```

                                                    *(freeLLMAPI- gemini-3.6-flash)*
