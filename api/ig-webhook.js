const crypto = require('crypto');
const { GRAPH, ensureFreshToken, getReplyLog, saveReplyLog, getAutoReplyRules, appSecret } = require('./_lib');

async function privateReply(commentId, token, message) {
  const params = new URLSearchParams();
  params.set('message', message);
  params.set('access_token', token);
  const r = await fetch(`${GRAPH}/${commentId}/private_replies`, { method: 'POST', body: params });
  return r.json();
}

async function publicCommentReply(commentId, token, message) {
  const params = new URLSearchParams();
  params.set('message', message);
  params.set('access_token', token);
  const r = await fetch(`${GRAPH}/${commentId}/replies`, { method: 'POST', body: params });
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.IG_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('forbidden');
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).end(); return; }

  let raw = '';
  await new Promise(resolve => { req.on('data', c => raw += c); req.on('end', resolve); });

  const signature = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret()).update(raw).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) { res.status(403).end(); return; }

  try {
    const payload = JSON.parse(raw);
    const rules = await getAutoReplyRules();
    const conn = await ensureFreshToken();
    if (conn) {
      const replyLog = await getReplyLog();
      let changed = false;
      for (const entry of (payload.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field !== 'comments') continue;
          const value = change.value || {};
          const mediaId = value.media && value.media.id;
          const commentId = value.id;
          const fromId = value.from && value.from.id;
          if (!mediaId || !commentId) continue;
          if (fromId && fromId === conn.igAccountId) continue;
          const rule = rules[mediaId];
          if (!rule || !rule.enabled) continue;
          const already = new Set(replyLog[mediaId] || []);
          if (already.has(commentId)) continue;
          let ok = false;
          if (rule.message) {
            const result = await privateReply(commentId, conn.token, rule.message);
            if (!result.error) ok = true;
          }
          if (rule.publicReply) {
            const result = await publicCommentReply(commentId, conn.token, rule.publicReply);
            if (!result.error) ok = true;
          }
          if (ok) {
            already.add(commentId);
            replyLog[mediaId] = Array.from(already);
            changed = true;
          }
        }
      }
      if (changed) await saveReplyLog(replyLog);
    }
  } catch (e) {}

  res.status(200).end();
};
