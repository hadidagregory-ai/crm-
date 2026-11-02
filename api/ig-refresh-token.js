const APP_ID = '1836590414159061';
const GRAPH = 'https://graph.facebook.com/v23.0';

module.exports = async function handler(req, res) {
  const APP_SECRET = process.env.IG_APP_SECRET;
  const token = req.query.token;
  if (!token) { res.status(400).json({ error: 'missing_token' }); return; }
  if (!APP_SECRET) { res.status(500).json({ error: 'server_missing_app_secret' }); return; }
  try {
    const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${token}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.access_token) { res.status(400).json({ error: 'refresh_failed', detail: d }); return; }
    res.status(200).json({ token: d.access_token, expiresIn: d.expires_in || 5184000 });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
