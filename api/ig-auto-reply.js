const { GRAPH, getAutoReplyRules, saveAutoReplyRules, ensureFreshToken, ensurePageId } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const rules = await getAutoReplyRules();
    res.status(200).json({ rules });
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'invalid_body' }); return; }

    if (parsed && parsed.action === 'subscribe') {
      const conn = await ensureFreshToken();
      if (!conn) { res.status(400).json({ error: 'not_connected' }); return; }
      const pageId = await ensurePageId(conn);
      if (!pageId) { res.status(400).json({ error: 'page_not_found' }); return; }
      try {
        const params = new URLSearchParams();
        params.set('subscribed_fields', 'comments');
        params.set('access_token', conn.token);
        const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, { method: 'POST', body: params });
        const d = await r.json();
        if (d.error) { res.status(400).json({ error: d.error.message }); return; }
        res.status(200).json({ ok: true, result: d });
      } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
      }
      return;
    }

    const { mediaId, message, enabled } = parsed || {};
    if (!mediaId) { res.status(400).json({ error: 'missing_mediaId' }); return; }
    const rules = await getAutoReplyRules();
    if (enabled === false) {
      delete rules[mediaId];
    } else {
      if (!message) { res.status(400).json({ error: 'missing_message' }); return; }
      rules[mediaId] = { message, enabled: true };
    }
    await saveAutoReplyRules(rules);
    res.status(200).json({ ok: true, rules });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
};
