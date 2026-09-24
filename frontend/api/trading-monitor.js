// Vercel API route: /api/trading-monitor
// A Vercel Cron minden 15 percben meghívja
// Ez a route továbbítja a kérést a Supabase Edge Function-höz

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ 
      error: 'Supabase env vars not set',
      hint: 'VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing'
    });
  }

  try {
    const resp = await fetch(supabaseUrl + '/functions/v1/trading-monitor', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + supabaseServiceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trigger: 'vercel-cron' })
    });

    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (e) {
    return res.status(500).json({ 
      error: 'Supabase hívás sikertelen: ' + e.message 
    });
  }
}
