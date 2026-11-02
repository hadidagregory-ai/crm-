const APP_ID = '1836590414159061';
const SITE = 'https://crm-woad-iota-63.vercel.app/';
const REDIRECT_URI = SITE + 'api/ig-auth-callback';
const GRAPH = 'https://graph.facebook.com/v21.0';

module.exports = async function handler(req, res) {
  const APP_SECRET = process.env.IG_APP_SECRET;
  const { code, error, error_description } = req.query;

  function fail(msg) {
    res.writeHead(302, { Location: SITE + '?ig_error=' + encodeURIComponent(msg) });
    res.end();
  }

  if (error) return fail(error_description || error);
  if (!code) return fail('missing_code');
  if (!APP_SECRET) return fail('server_missing_app_secret');

  try {
    const tokenUrl = `${GRAPH}/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return fail('token_exchange_failed');

    const longUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    if (!longData.access_token) return fail('long_token_failed');
    const userToken = longData.access_token;
    const expiresIn = longData.expires_in || 5184000;

    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
    const pagesData = await pagesRes.json();
    const pages = pagesData.data || [];
    if (!pages.length) return fail('no_facebook_page_found');

    let igAccountId = null, pageName = null;
    const pageErrors = [];
    for (const p of pages) {
      const igRes = await fetch(`${GRAPH}/${p.id}?fields=instagram_business_account&access_token=${userToken}`);
      const igData = await igRes.json();
      if (igData.error) { pageErrors.push(igData.error.message); continue; }
      if (igData.instagram_business_account && igData.instagram_business_account.id) {
        igAccountId = igData.instagram_business_account.id;
        pageName = p.name;
        break;
      }
    }
    if (!igAccountId) {
      if (pageErrors.length) return fail('permission_error: ' + pageErrors.join(' | '));
      return fail('no_instagram_business_account_linked');
    }

    const expiresAt = Date.now() + expiresIn * 1000;
    const payload = { token: userToken, igAccountId, pageName, expiresAt };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    res.writeHead(302, { Location: SITE + '#ig_connect=' + encoded });
    res.end();
  } catch (e) {
    fail('exception_' + (e && e.message ? e.message.replace(/[^a-zA-Z0-9_ ]/g, '') : 'unknown'));
  }
};
