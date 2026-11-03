const { APP_ID, GRAPH, appConfig, renewUserToken, saveConnect } = require('./_lib');

const SITE = 'https://crm-woad-iota-63.vercel.app/';
const REDIRECT_URI = SITE + 'api/ig-auth-callback';

module.exports = async function handler(req, res) {
  const { code, error, error_description } = req.query;

  function fail(msg) {
    res.writeHead(302, { Location: SITE + '?ig_error=' + encodeURIComponent(msg) });
    res.end();
  }

  if (error) return fail(error_description || error);
  if (!code) return fail('missing_code');
  const cfg = appConfig();
  if (!cfg.cred) return fail('server_missing_app_secret');

  try {
    const tokenForm = new URLSearchParams();
    tokenForm.set('client_id', cfg.id);
    tokenForm.set('redirect_uri', REDIRECT_URI);
    tokenForm.set('client_secret', cfg.cred);
    tokenForm.set('code', code);
    const tokenRes = await fetch(GRAPH + '/oauth/access_token', { method: 'POST', body: tokenForm });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return fail('token_exchange_failed');

    const longData = await renewUserToken(tokenData.access_token);
    if (!longData.access_token) return fail('long_token_failed');
    const userToken = longData.access_token;
    const expiresIn = longData.expires_in || 5184000;

    const permsRes = await fetch(`${GRAPH}/me/permissions?access_token=${userToken}`);
    const permsData = await permsRes.json();
    const granted = (permsData.data || []).filter(p => p.status === 'granted').map(p => p.permission);
    const declined = (permsData.data || []).filter(p => p.status === 'declined').map(p => p.permission);

    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];
    console.log('ig-auth-callback diag', JSON.stringify({ pagesCount: pages.length, pagesError: pagesData.error || null, granted, declined }));
    if (!pages.length) return fail('no_facebook_page_found');

    let igAccountId = null, pageName = null, pageId = null;
    const pageErrors = [];
    for (const p of pages) {
      const igRes = await fetch(`${GRAPH}/${p.id}?fields=instagram_business_account&access_token=${userToken}`);
      const igData = await igRes.json();
      if (igData.error) { pageErrors.push(igData.error.message); continue; }
      if (igData.instagram_business_account && igData.instagram_business_account.id) {
        igAccountId = igData.instagram_business_account.id;
        pageName = p.name;
        pageId = p.id;
        break;
      }
    }
    if (!igAccountId) {
      if (pageErrors.length) return fail('permission_error: ' + pageErrors.join(' | '));
      return fail('no_instagram_business_account_linked');
    }

    let username = '';
    try {
      const uRes = await fetch(`${GRAPH}/${igAccountId}?fields=username&access_token=${userToken}`);
      const uData = await uRes.json();
      username = uData.username || '';
    } catch (e) {}

    await saveConnect({ token: userToken, igAccountId, pageId, pageName, username, expiresAt: Date.now() + expiresIn * 1000 });

    res.writeHead(302, { Location: SITE + '?ig_connected=1' });
    res.end();
  } catch (e) {
    fail('exception_' + (e && e.message ? e.message.replace(/[^a-zA-Z0-9_ ]/g, '') : 'unknown'));
  }
};
