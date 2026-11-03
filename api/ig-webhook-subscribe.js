const { GRAPH, ensureFreshToken, ensurePageId } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
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
};
