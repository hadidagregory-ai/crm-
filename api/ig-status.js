const { getConnect } = require('./_lib');

module.exports = async function handler(req, res) {
  const conn = await getConnect();
  if (!conn) { res.status(200).json({ connected: false }); return; }
  res.status(200).json({ connected: true, username: conn.username, pageName: conn.pageName, expiresAt: conn.expiresAt });
};
