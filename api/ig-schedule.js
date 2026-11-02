const { getScheduled, saveScheduled } = require('./_lib');

function uid() { return 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const list = await getScheduled();
    res.status(200).json({ items: list });
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'invalid_body' }); return; }
    const { mediaUrl, isVideo, target, caption, publishAt } = parsed || {};
    if (!mediaUrl || !target || !publishAt) { res.status(400).json({ error: 'missing_fields' }); return; }
    const list = await getScheduled();
    const item = { id: uid(), mediaUrl, isVideo: !!isVideo, target, caption: caption || '', publishAt, status: 'pending', createdAt: Date.now() };
    list.push(item);
    await saveScheduled(list);
    res.status(200).json({ ok: true, item });
    return;
  }
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) { res.status(400).json({ error: 'missing_id' }); return; }
    let list = await getScheduled();
    list = list.filter(x => x.id !== id);
    await saveScheduled(list);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'method_not_allowed' });
};
