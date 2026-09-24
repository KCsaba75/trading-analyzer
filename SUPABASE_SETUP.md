# Supabase Setup - Trading Analyzer

## 🚀 Gyors setup (Supabase Cloud - ajánlott)

### 1. Új projekt létrehozása
1. Menj a https://supabase.com/dashboard -ra
2. Kattints **"New Project"**
3. Add meg:
   - **Name:** trading-analyzer
   - **Database Password:** (erős jelszó, mentsd el!)
   - **Region:** Europe (Central EU - Frankfurt) — legközelebbi
4. Kattints **"Create new project"** — 1-2 perc a setup

### 2. Connection adatok megszerzése
A projekt Settings → Database oldalon:
- **Connection string (URI mode)** — ezt használjuk a migration-ökhöz

A projekt Settings → API oldalon:
- **Project URL** (`VITE_SUPABASE_URL`)
- **anon public key** (`VITE_SUPABASE_ANON_KEY`)

### 3. Schema telepítése
A migration fájlt a `supabase/migrations/001_initial_schema.sql` tartalmazza.

**Futtatás egyik módja:**
1. Supabase Dashboard → SQL Editor → New query
2. Másold be a migration tartalmát
3. Futtasd le (Run)

### 4. Edge Function deploy
A `supabase/functions/analyze-stock/` mappa tartalmazza a Jev AI integrációt.

**Telepítés:**
```bash
# Supabase CLI telepítése (ha még nincs)
npm install -g supabase

# Bejelentkezés
supabase login

# Kapcsolódás a projekthez
supabase link --project-ref <YOUR_PROJECT_REF>

# Edge Function deploy
supabase functions deploy analyze-stock \
  --env-file .env
```

A `.env` fájl tartalma a projekt gyökerében:
```
REQUESTY_API_KEY=rqsty-sk-your-key-here
```

### 5. Frontend környezeti változók
Hozz létre `frontend/.env.local` fájlt:
```
VITE_SUPABASE_URL=https://<YOUR_PROJECT>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 6. Újraindítás
```bash
cd frontend
npm run dev
```

---

## 🐳 Helyi fejlesztés (Supabase CLI + Docker)

```bash
# Telepítés
brew install supabase/tap/supabase   # macOS
# vagy: scoop install supabase       # Windows

# Indítás
supabase start

# Migration futtatás
supabase db reset

# Edge Function indítás
supabase functions serve analyze-stock --env-file ./supabase/.env.local
```

A helyi URL általában: `http://localhost:54321`
