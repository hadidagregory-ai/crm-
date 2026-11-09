const { GRAPH, getAutoReplyRules, saveAutoReplyRules, ensureFreshToken } = require('./_lib');

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
      try {
        // Les champs Instagram (comments, mentions...) s'abonnent sur le
        // compte Instagram lui-même, pas sur la Page Facebook (qui n'a que
        // feed/mention/messages/... — d'où l'erreur #100 "must be one of {feed,...}").
        const params = new URLSearchParams();
        params.set('subscribed_fields', 'comments');
        params.set('access_token', conn.token);
        const r = await fetch(`${GRAPH}/${conn.igAccountId}/subscribed_apps`, { method: 'POST', body: params });
        const d = await r.json();
        if (d.error) { res.status(400).json({ error: d.error.message }); return; }
        res.status(200).json({ ok: true, result: d });
      } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
      }
      return;
    }

    const { mediaId, message, publicReply, enabled } = parsed || {};
    if (!mediaId) { res.status(400).json({ error: 'missing_mediaId' }); return; }
    const rules = await getAutoReplyRules();
    if (enabled === false) {
      delete rules[mediaId];
    } else {
      if (!message && !publicReply) { res.status(400).json({ error: 'missing_message' }); return; }
      rules[mediaId] = { message: message || null, publicReply: publicReply || null, enabled: true };
    }
    await saveAutoReplyRules(rules);
    res.status(200).json({ ok: true, rules });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
};
