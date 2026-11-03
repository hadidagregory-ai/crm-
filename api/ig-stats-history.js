const { getStatsHistory } = require('./_lib');

module.exports = async function handler(req, res) {
  const history = await getStatsHistory();
  res.status(200).json({ history });
};
