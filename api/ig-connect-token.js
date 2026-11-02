const APP_ID = '1836590414159061';
const GRAPH = 'https://graph.facebook.com/v21.0';

module.exports = async function handler(req, res) {
  const APP_SECRET = process.env.IG_APP_SECRET;
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!APP_SECRET) { res.status(500).json({ error: 'server_missing_app_secret' }); return; }

  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let shortToken;
  try { shortToken = JSON.parse(body).token; } catch(e) {}
  if (!shortToken) { res.status(400).json({ error: 'missing_token' }); return; }

  try {
    const longUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    if (!longData.access_token) { res.status(400).json({ error: 'long_token_failed', detail: longData }); return; }
    const userToken = longData.access_token;
    const expiresIn = longData.expires_in || 5184000;

    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];
    if (!pages.length) { res.status(400).json({ error: 'no_facebook_page_found', detail: pagesData }); return; }

    let igAccountId = null, pageName = null;
    for (const p of pages) {
      const igRes = await fetch(`${GRAPH}/${p.id}?fields=instagram_business_account&access_token=${userToken}`);
      const igData = await igRes.json();
      if (igData.instagram_business_account && igData.instagram_business_account.id) {
        igAccountId = igData.instagram_business_account.id;
        pageName = p.name;
        break;
      }
    }
    if (!igAccountId) { res.status(400).json({ error: 'no_instagram_business_account_linked' }); return; }

    res.status(200).json({ token: userToken, igAccountId, pageName, expiresAt: Date.now() + expiresIn * 1000 });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
