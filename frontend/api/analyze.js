// Vercel API route: /api/analyze
// Same-origin proxy a Supabase Edge Function-höz

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ 
      error: 'Supabase env vars not set' 
    });
  }

  try {
    const supabaseResp = await fetch(`${supabaseUrl}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(req.body || {}),
    });

    const data = await supabaseResp.json();
    return res.status(supabaseResp.status).json(data);
  } catch (e) {
    return res.status(500).json({ 
      error: 'Supabase hívás sikertelen: ' + e.message 
    });
  }
}
