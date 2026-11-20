import crypto from 'node:crypto';
import { fetchClip, parseSongId, readBody, KEYS_API } from './_suno.js';

// POST { id | url, token? } -> decrypted .m4a (or plain .mp3 for legacy songs)
// The file is returned as an attachment AND as a normal body so the web UI can
// fetch it into memory and save it with a real user-gesture save flow.
export default async function handler(req, res) {
  try {
    const body = req.method === 'POST' ? await readBody(req) : (req.query || {});
    const id = parseSongId(body.id || body.url || body.song_id || (req.query && (req.query.id || req.query.url)));
    if (!id) { res.status(400).json({ error: 'song_id tidak valid' }); return; }
    const token = body.token || undefined;

    const clip = await fetchClip(id, token);
    const title = (clip.title || id).replace(/[\\/:*?"<>|]/g, '').trim() || id;
    const media = (clip.media_urls || [])[0];

    let out, ext, type;
    if (media && media.url) {
      const kr = await fetch(`${KEYS_API}?song_id=${id}`);
      if (!kr.ok) throw new Error(`Rights API error ${kr.status}`);
      const keys = await kr.json();
      if (!keys.key || !keys.iv) throw new Error('Kunci decrypt tidak tersedia untuk lagu ini');
      const enc = Buffer.from(await (await fetch(media.url)).arrayBuffer());
      const decipher = crypto.createDecipheriv('aes-128-ctr', Buffer.from(keys.key, 'base64'), Buffer.from(keys.iv, 'base64'));
      out = Buffer.concat([decipher.update(enc), decipher.final()]);
      // If decryption did not produce an MP4 header, fall back to raw bytes
      if (!out.slice(4, 8).toString('latin1').includes('ftyp')) out = enc;
      ext = 'm4a'; type = 'audio/mp4';
    } else if (clip.audio_url && clip.audio_url.includes('.mp3')) {
      out = Buffer.from(await (await fetch(clip.audio_url)).arrayBuffer());
      ext = 'mp3'; type = 'audio/mpeg';
    } else {
      throw new Error('Audio lagu ini belum tersedia / tidak bisa diunduh');
    }

    const filename = `${title}.${ext}`;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', out.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Song-Title', encodeURIComponent(title));
    res.status(200).send(out);
  } catch (e) {
    res.status(502).json({ error: `Gagal: ${e.message}` });
  }
}
