const { put, get, issueSignedToken, presignUrl } = require('@vercel/blob');

const APP_ID = '1836590414159061';
const GRAPH = 'https://graph.facebook.com/v23.0';

async function readJson(pathname, fallback) {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return fallback;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}
async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function presignBlobGetUrl(pathname, ttlMs) {
  ttlMs = ttlMs || 15 * 60 * 1000;
  const signed = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + ttlMs });
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private', validUntil: Date.now() + ttlMs });
  return presignedUrl;
}

async function resolveMediaUrl(mediaUrl) {
  if (mediaUrl && mediaUrl.startsWith('blob:')) return presignBlobGetUrl(mediaUrl.slice(5));
  return mediaUrl;
}

function getConnect() { return readJson('data/ig-connect.json', null); }
function saveConnect(data) { return writeJson('data/ig-connect.json', data); }

function getScheduled() { return readJson('data/ig-scheduled.json', []); }
function saveScheduled(data) { return writeJson('data/ig-scheduled.json', data); }

function getReplyLog() { return readJson('data/ig-reply-log.json', {}); }
function saveReplyLog(data) { return writeJson('data/ig-reply-log.json', data); }

function appSecret() { return process.env.IG_APP_SECRET; }

async function exchangeForLongLivedToken(shortLivedToken) {
  const form = new URLSearchParams();
  form.set('grant_type', 'fb_exchange_token');
  form.set('client_id', APP_ID);
  form.set('client_secret', appSecret());
  form.set('fb_exchange_token', shortLivedToken);
  const r = await fetch(GRAPH + '/oauth/access_token', { method: 'POST', body: form });
  return r.json();
}

async function ensureFreshToken() {
  const conn = await getConnect();
  if (!conn || !conn.token) return null;
  const daysLeft = (conn.expiresAt - Date.now()) / 86400000;
  if (daysLeft > 5) return conn;
  try {
    const d = await exchangeForLongLivedToken(conn.token);
    if (d.access_token) {
      conn.token = d.access_token;
      conn.expiresAt = Date.now() + (d.expires_in || 5184000) * 1000;
      await saveConnect(conn);
    }
  } catch (e) {}
  return conn;
}

function appConfig() { return { id: APP_ID, cred: appSecret() }; }
const renewUserToken = exchangeForLongLivedToken;

module.exports = {
  APP_ID, GRAPH, appSecret, appConfig,
  getConnect, saveConnect,
  getScheduled, saveScheduled,
  getReplyLog, saveReplyLog,
  ensureFreshToken,
  exchangeForLongLivedToken, renewUserToken,
  readJson, writeJson,
  presignBlobGetUrl, resolveMediaUrl,
};
