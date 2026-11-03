const { GRAPH, ensureFreshToken, getReplyLog, saveReplyLog } = require('./_lib');

async function privateReply(commentId, token, message) {
  const params = new URLSearchParams();
  params.set('message', message);
  params.set('access_token', token);
  const r = await fetch(`${GRAPH}/${commentId}/private_replies`, { method: 'POST', body: params });
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'invalid_body' }); return; }
  const { mediaId, message } = parsed || {};
  if (!mediaId || !message) { res.status(400).json({ error: 'missing_fields' }); return; }

  const conn = await ensureFreshToken();
  if (!conn) { res.status(400).json({ error: 'not_connected' }); return; }

  try {
    let comments = [];
    let url = `${GRAPH}/${mediaId}/comments?fields=id,username&limit=50&access_token=${conn.token}`;
    for (let page = 0; page < 5 && url; page++) {
      const r = await fetch(url);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      comments = comments.concat(d.data || []);
      url = d.paging && d.paging.next ? d.paging.next : null;
    }

    const replyLog = await getReplyLog();
    const already = new Set(replyLog[mediaId] || []);
    let sent = 0, failed = 0, skipped = 0;
    const newlyMessaged = [];

    for (const c of comments) {
      if (already.has(c.id)) { skipped++; continue; }
      const result = await privateReply(c.id, conn.token, message);
      if (result.error) { failed++; }
      else { sent++; newlyMessaged.push(c.id); }
    }

    replyLog[mediaId] = Array.from(already).concat(newlyMessaged);
    await saveReplyLog(replyLog);

    res.status(200).json({ ok: true, totalComments: comments.length, sent, failed, skippedAlreadyMessaged: skipped });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
