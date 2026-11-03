const { GRAPH, renewUserToken, saveConnect } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let shortToken;
  try { shortToken = JSON.parse(body).token; } catch (e) {}
  if (!shortToken) { res.status(400).json({ error: 'missing_token' }); return; }

  try {
    const longData = await renewUserToken(shortToken);
    if (!longData.access_token) { res.status(400).json({ error: 'long_token_failed', detail: longData }); return; }
    const userToken = longData.access_token;
    const expiresIn = longData.expires_in || 5184000;

    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];
    if (!pages.length) { res.status(400).json({ error: 'no_facebook_page_found', detail: pagesData }); return; }

    let igAccountId = null, pageName = null;
    const pageErrors = [];
    for (const p of pages) {
      const igRes = await fetch(`${GRAPH}/${p.id}?fields=instagram_business_account&access_token=${userToken}`);
      const igData = await igRes.json();
      if (igData.error) { pageErrors.push(p.name + ': ' + igData.error.message); continue; }
      if (igData.instagram_business_account && igData.instagram_business_account.id) {
        igAccountId = igData.instagram_business_account.id;
        pageName = p.name;
        break;
      }
    }
    if (!igAccountId) {
      if (pageErrors.length) { res.status(400).json({ error: 'permission_error: ' + pageErrors.join(' | ') }); return; }
      res.status(400).json({ error: 'no_instagram_business_account_linked (pages: ' + pages.map(p => p.name).join(', ') + ')' });
      return;
    }

    let username = '';
    try {
      const uRes = await fetch(`${GRAPH}/${igAccountId}?fields=username&access_token=${userToken}`);
      const uData = await uRes.json();
      username = uData.username || '';
    } catch (e) {}

    await saveConnect({ token: userToken, igAccountId, pageName, username, expiresAt: Date.now() + expiresIn * 1000 });
    res.status(200).json({ ok: true, username, pageName });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
