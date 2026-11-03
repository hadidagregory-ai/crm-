const { getAutoReplyRules, saveAutoReplyRules } = require('./_lib');

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
