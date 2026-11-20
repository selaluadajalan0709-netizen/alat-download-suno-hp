import { parseSongId, KEYS_API } from './_suno.js';

// GET /api/keys?song_id=<uuid> -> { key, iv } (proxied key service)
export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const id = parseSongId(q.song_id || q.id);
    if (!id) { res.status(400).json({ error: 'song_id tidak valid' }); return; }
    const r = await fetch(`${KEYS_API}?song_id=${id}`);
    const data = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(data);
  } catch (e) {
    res.status(502).json({ error: `Gagal: ${e.message}` });
  }
}
