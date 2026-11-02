const BASE = 'https://connectors.windsor.ai/instagram';

async function fetchWindsor(apiKey, fields, datePreset) {
  const url = `${BASE}?api_key=${encodeURIComponent(apiKey)}&fields=${encodeURIComponent(fields)}&date_preset=${datePreset}&_renderer=json`;
  const r = await fetch(url);
  const d = await r.json();
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.data)) return d.data;
  if (d.error) throw new Error(typeof d.error === 'string' ? d.error : JSON.stringify(d.error));
  return [];
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'server_missing_windsor_key' }); return; }

  try {
    const [account, daily, media] = await Promise.all([
      fetchWindsor(apiKey, 'username,followers_count,follows_count,media_count', 'last_7d'),
      fetchWindsor(apiKey, 'date,reach,views,follower_count_1d,accounts_engaged,total_interactions,likes,comments,saves,shares', 'last_30d'),
      fetchWindsor(apiKey, 'timestamp,media_type,media_caption,media_reach,media_views,media_total_like_count,media_total_comments_count,media_saved,media_shares,media_permalink', 'last_30d'),
    ]);

    const acc = account[account.length - 1] || {};
    const toNum = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

    const followersGained = daily.reduce((s, d) => s + toNum(d.follower_count_1d), 0);
    const totalReach = daily.reduce((s, d) => s + toNum(d.reach), 0);
    const totalViews = daily.reduce((s, d) => s + toNum(d.views), 0);
    const totalInteractions = daily.reduce((s, d) => s + toNum(d.total_interactions), 0);

    const mediaList = media.map(m => ({
      caption: m.media_caption || '',
      permalink: m.media_permalink || '',
      timestamp: m.timestamp || '',
      type: m.media_type || '',
      reach: toNum(m.media_reach),
      views: toNum(m.media_views),
      likes: toNum(m.media_total_like_count),
      comments: toNum(m.media_total_comments_count),
      saved: toNum(m.media_saved),
      shares: toNum(m.media_shares),
      interactions: toNum(m.media_total_like_count) + toNum(m.media_total_comments_count) + toNum(m.media_saved) + toNum(m.media_shares),
    }));

    res.status(200).json({
      username: acc.username || '',
      followers: toNum(acc.followers_count),
      mediaCount: toNum(acc.media_count),
      last30: { followersGained, totalReach, totalViews, totalInteractions },
      media: mediaList,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
