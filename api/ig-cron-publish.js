const { GRAPH, ensureFreshToken, getScheduled, saveScheduled, resolveMediaUrl, recordStatsSnapshot } = require('./_lib');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createContainer(igAccountId, token, item, mediaUrl) {
  const params = new URLSearchParams();
  params.set('access_token', token);
  if (item.caption) params.set('caption', item.caption);
  if (item.target === 'story') {
    params.set('media_type', 'STORIES');
    if (item.isVideo) params.set('video_url', mediaUrl); else params.set('image_url', mediaUrl);
  } else if (item.target === 'reels' || item.isVideo) {
    params.set('media_type', 'REELS');
    params.set('video_url', mediaUrl);
  } else {
    params.set('image_url', mediaUrl);
  }
  const r = await fetch(`${GRAPH}/${igAccountId}/media`, { method: 'POST', body: params });
  return r.json();
}

async function waitUntilFinished(creationId, token) {
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === 'FINISHED') return true;
    if (d.status_code === 'ERROR') return false;
    await sleep(4000);
  }
  return false;
}

async function publishContainer(igAccountId, token, creationId) {
  const params = new URLSearchParams();
  params.set('creation_id', creationId);
  params.set('access_token', token);
  const r = await fetch(`${GRAPH}/${igAccountId}/media_publish`, { method: 'POST', body: params });
  return r.json();
}

module.exports = async function handler(req, res) {
  const conn = await ensureFreshToken();

  if (conn) {
    try {
      const accRes = await fetch(`${GRAPH}/${conn.igAccountId}?fields=followers_count,media_count&access_token=${conn.token}`);
      const accData = await accRes.json();
      if (accData.followers_count != null) await recordStatsSnapshot(accData.followers_count, accData.media_count);
    } catch (e) {}
  }

  const list = await getScheduled();
  const now = Date.now();
  const due = list.filter(x => x.status === 'pending' && new Date(x.publishAt).getTime() <= now);

  if (!due.length) { res.status(200).json({ processed: 0 }); return; }

  if (!conn) {
    due.forEach(x => { x.status = 'error'; x.error = 'not_connected'; });
    await saveScheduled(list);
    res.status(200).json({ processed: due.length, error: 'not_connected' });
    return;
  }

  for (const item of due) {
    try {
      item.status = 'publishing';
      const mediaUrl = await resolveMediaUrl(item.mediaUrl);
      const created = await createContainer(conn.igAccountId, conn.token, item, mediaUrl);
      if (!created.id) { item.status = 'error'; item.error = JSON.stringify(created.error || created); continue; }
      if (item.isVideo || item.target === 'reels') {
        const ok = await waitUntilFinished(created.id, conn.token);
        if (!ok) { item.status = 'error'; item.error = 'video_processing_failed_or_timeout'; continue; }
      }
      const published = await publishContainer(conn.igAccountId, conn.token, created.id);
      if (published.id) { item.status = 'published'; item.publishedMediaId = published.id; }
      else { item.status = 'error'; item.error = JSON.stringify(published.error || published); }
    } catch (e) {
      item.status = 'error';
      item.error = String(e && e.message || e);
    }
  }

  await saveScheduled(list);
  res.status(200).json({ processed: due.length });
};
