const { saveConnect } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  await saveConnect(null);
  res.status(200).json({ ok: true });
};
