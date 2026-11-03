const { GRAPH, ensureFreshToken, recordStatsSnapshot } = require('./_lib');

module.exports = async function handler(req, res) {
  const conn = await ensureFreshToken();
  if (!conn) { res.status(400).json({ error: 'not_connected' }); return; }
  const token = conn.token;
  const acc = conn.igAccountId;

  try {
    const accRes = await fetch(`${GRAPH}/${acc}?fields=followers_count,media_count&access_token=${token}`);
    const accData = await accRes.json();
    if (accData.error) throw new Error(accData.error.message);
    recordStatsSnapshot(accData.followers_count, accData.media_count).catch(() => {});

    const mediaRes = await fetch(`${GRAPH}/${acc}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=25&access_token=${token}`);
    const mediaData = await mediaRes.json();
    if (mediaData.error) throw new Error(mediaData.error.message);

    const enriched = [];
    for (const m of (mediaData.data || [])) {
      let insights = {};
      try {
        const isVideo = m.media_product_type === 'REELS' || m.media_type === 'VIDEO';
        const metrics = isVideo
          ? 'reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time'
          : 'reach,saved,likes,comments,shares,total_interactions';
        const insRes = await fetch(`${GRAPH}/${m.id}/insights?metric=${metrics}&access_token=${token}`);
        const insData = await insRes.json();
        if (Array.isArray(insData.data)) insData.data.forEach(row => { insights[row.name] = (row.values && row.values[0] && row.values[0].value) || 0; });
      } catch (e) {}
      enriched.push({
        id: m.id, caption: m.caption || '', permalink: m.permalink,
        thumb: m.thumbnail_url || m.media_url, timestamp: m.timestamp,
        likes: m.like_count || 0, comments: m.comments_count || 0,
        reach: insights.reach || 0, saved: insights.saved || 0,
        interactions: insights.total_interactions || ((m.like_count || 0) + (m.comments_count || 0)),
        avgWatch: insights.ig_reels_avg_watch_time != null ? insights.ig_reels_avg_watch_time : null,
      });
    }

    res.status(200).json({
      username: conn.username, followers: accData.followers_count, mediaCount: accData.media_count,
      media: enriched, fetchedAt: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur Instagram : ' + (e && e.message ? e.message : e) });
  }
};
