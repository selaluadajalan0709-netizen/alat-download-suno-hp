// Shared helpers for Suno API access (server-side, no CORS issues)
export const SUNO_API = 'https://studio-api-prod.suno.com';
export const KEYS_API = 'https://madhouse-suno-downloader.vercel.app/api/keys';

export function sunoHeaders(token) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Origin': 'https://suno.com',
    'Referer': 'https://suno.com/',
    'Accept': 'application/json, text/plain, */*',
    // Suno's current web API expects these two headers on library/feed calls;
    // without them those endpoints can answer 200 with an empty result.
    'browser-token': Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64'),
    'device-id': globalThis.crypto.randomUUID(),
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export function parseSongId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const uuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid ? uuid[0] : null;
}

export async function fetchClip(id, token) {
  const r = await fetch(`${SUNO_API}/api/clip/${id}`, { headers: sunoHeaders(token) });
  if (!r.ok) throw new Error(`Suno clip API error ${r.status}`);
  return r.json();
}

export function normalizeClip(c) {
  if (!c || !c.id) return null;
  return {
    id: c.id,
    title: c.title || 'Tanpa Judul',
    image_url: c.image_url || `https://cdn1.suno.ai/image_${c.id}.jpeg`,
    duration: (c.metadata && c.metadata.duration) || c.duration || null,
    status: c.status || 'complete',
    model_name: c.major_model_version || c.model_name || '',
    created_at: c.created_at || null,
  };
}

function unwrapClip(item) {
  if (!item || typeof item !== 'object') return null;
  // Playlist / project responses often nest the song: { clip: {...} } / { song: {...} }
  const inner = item.clip || item.song || item.track || null;
  if (inner && inner.id) return inner;
  return item.id ? item : null;
}

export function extractClips(data) {
  if (!data) return [];
  let arr = null;
  if (Array.isArray(data)) arr = data;
  else {
    for (const k of ['clips', 'project_clips', 'playlist_clips', 'items', 'results', 'songs', 'tracks', 'data']) {
      if (Array.isArray(data[k])) { arr = data[k]; break; }
    }
    if (!arr && data.project) arr = extractClips(data.project);
    if (!arr && data.playlist) arr = extractClips(data.playlist);
    if (!arr && data.data && typeof data.data === 'object') arr = extractClips(data.data);
  }
  if (!arr) return [];
  const seen = new Set(); const out = [];
  for (const it of arr) {
    const c = unwrapClip(it);
    if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}

export function extractTotalCount(data) {
  if (!data || typeof data !== 'object') return null;
  for (const k of ['num_total_clips', 'num_total_results', 'clip_count', 'total_clips', 'total', 'count']) {
    if (typeof data[k] === 'number' && Number.isFinite(data[k])) return data[k];
  }
  if (data.project) return extractTotalCount(data.project);
  if (data.playlist) return extractTotalCount(data.playlist);
  return null;
}

export function extractCursor(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    data.next_cursor ||
    data.cursor ||
    data.nextCursor ||
    (data.meta && data.meta.next_cursor) ||
    (data.pagination && data.pagination.next_cursor) ||
    null
  );
}

export function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of ['projects', 'playlists', 'items', 'results', 'data']) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
