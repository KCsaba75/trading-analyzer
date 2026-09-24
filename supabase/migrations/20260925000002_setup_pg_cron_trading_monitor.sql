-- pg_net kiterjesztés engedélyezése a net.http_post() függvényhez
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron kiterjesztés engedélyezése
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- A trading-monitor Edge Function 15 percenkénti hívása
SELECT cron.schedule(
  'trading-monitor-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://azjsjcgvbexxfqlrajrt.supabase.co/functions/v1/trading-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6anNqY2d2YmV4eGZxbHJhanJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDIzNTk5NiwiZXhwIjoyMTA1ODExOTk2fQ.LrI_CvlxAIkUz-E3d4kYft8Wrsu0ZecisNrtWh2X1i8'
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'source', 'supabase_cron')
  );
  $cron$
);

-- Ellenőrzés: listázza az összes ütemezett jobot
SELECT jobid, jobname, schedule, active FROM cron.job;
