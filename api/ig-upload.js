const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'invalid_body' }); return; }
  const { filename, contentType, dataBase64 } = parsed || {};
  if (!dataBase64) { res.status(400).json({ error: 'missing_data' }); return; }
  try {
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > 4 * 1024 * 1024) { res.status(400).json({ error: 'file_too_large_use_url_instead' }); return; }
    const safeName = 'media/' + Date.now() + '-' + (filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    await put(safeName, buffer, { access: 'private', contentType: contentType || 'application/octet-stream', addRandomSuffix: false });
    res.status(200).json({ url: 'blob:' + safeName });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
