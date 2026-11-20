import { sunoHeaders, extractList, readBody, SUNO_API } from './_suno.js';

// POST { token } -> { workspaces: [{id,type,name,count}], valid: bool }
export default async function handler(req, res) {
  try {
    const body = await readBody(req);
    const token = body.token;
    if (!token) { res.status(400).json({ error: 'Set token dulu di bagian Kantong Token.' }); return; }

    const out = [{ id: 'all', type: 'all', name: 'Semua Lagu — seluruh akun', count: null }];
    const seen = new Set(['all']);
    let anyOk = false; let firstError = null;
    const headers = sunoHeaders(token);

    // Fetch all pages of projects (workspaces) and playlists (up to 5 pages each)
    const sources = [
      { type: 'project', buildUrl: p => `${SUNO_API}/api/project/me?page=${p}&sort=created_at&show_trashed=false`, fallbackUrl: `${SUNO_API}/api/project/me` },
      { type: 'playlist', buildUrl: p => `${SUNO_API}/api/playlist/me?page=${p}&show_trashed=false&show_sharelist=false`, fallbackUrl: null },
    ];

    for (const src of sources) {
      let gotAnyForSource = false;
      for (let p = 1; p <= 5; p++) {
        try {
          const r = await fetch(src.buildUrl(p), { headers });
          if (!r.ok) {
            if (!firstError) firstError = `Suno menolak token ini (${r.status}). Ambil token baru dari suno.com.`;
            break;
          }
          anyOk = true;
          const data = await r.json();
          const items = extractList(data);
          let added = 0;
          for (const w of items) {
            const key = `${src.type}:${w.id}`;
            if (!w.id || seen.has(key)) continue;
            seen.add(key);
            gotAnyForSource = true;
            added++;
            out.push({
              id: w.id,
              type: src.type,
              name: w.name || w.title || 'Tanpa nama',
              count: w.num_total_clips ?? w.clip_count ?? (Array.isArray(w.clips) ? w.clips.length : null),
            });
          }
          if (!added || items.length < 20) break;
        } catch (e) {
          if (!firstError) firstError = e.message;
          break;
        }
      }
      if (!gotAnyForSource && src.fallbackUrl) {
        try {
          const r = await fetch(src.fallbackUrl, { headers });
          if (r.ok) {
            anyOk = true;
            const data = await r.json();
            for (const w of extractList(data)) {
              const key = `${src.type}:${w.id}`;
              if (!w.id || seen.has(key)) continue;
              seen.add(key);
              out.push({
                id: w.id,
                type: src.type,
                name: w.name || w.title || 'Tanpa nama',
                count: w.num_total_clips ?? w.clip_count ?? (Array.isArray(w.clips) ? w.clips.length : null),
              });
            }
          }
        } catch (_) {}
      }
    }

    if (!anyOk) { res.status(401).json({ error: firstError || 'Token tidak valid.' }); return; }
    res.status(200).json({ valid: true, workspaces: out });
  } catch (e) {
    res.status(502).json({ error: `Gagal: ${e.message}` });
  }
}
