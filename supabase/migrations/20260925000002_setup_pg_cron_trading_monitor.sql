-- 1. pg_cron kiterjesztés engedélyezése
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. A trading-monitor függvény meghívása 15 percenként
-- A supabase_functions URL a Supabase Edge Function-t hívja
-- A SERVICE_ROLE_KEY szükséges a távoli híváshoz

SELECT cron.schedule(
  'trading-monitor-15min',     -- job neve
  '*/15 * * * *',              -- schedule: minden 15 perc
  $$
  SELECT
    net.http_post(
      url := 'https://azjsjcgvbexxfqlrajrt.supabase.co/functions/v1/trading-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6anNqY2d2YmV4eGZxbHJhanJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDIzNTk5NiwiZXhwIjoyMTA1ODExOTk2fQ.LrI_CvlxAIkUz-E3d4kYft8Wrsu0ZecisNrtWh2X1i8'
      ),
      body := jsonb_build_object('trigger', 'pg_cron')
    ) AS request_id;
  $$
);

-- 3. Ellenőrzés: listázza az összes ütemezett jobot
SELECT * FROM cron.job;
