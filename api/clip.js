import { fetchClip, parseSongId, normalizeClip } from './_suno.js';

// GET /api/clip?id=<uuid|url>&token=<optional>
export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const id = parseSongId(q.id || q.url);
    if (!id) { res.status(400).json({ error: 'Isi song ID atau URL dulu.' }); return; }
    const clip = await fetchClip(id, q.token || undefined);
    res.status(200).json({ clip: normalizeClip(clip), raw_audio_kind: (clip.media_urls && clip.media_urls[0]) ? 'm4a-encrypted' : (clip.audio_url || null) });
  } catch (e) {
    res.status(502).json({ error: `Gagal: ${e.message}` });
  }
}
