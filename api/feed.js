import {
  sunoHeaders,
  extractClips,
  extractTotalCount,
  extractCursor,
  normalizeClip,
  readBody,
  SUNO_API,
} from './_suno.js';

// POST { token, workspaceId, type, page, cursor?, strategy?, prevIds?, expected? }
//   -> { clips, page, pageSize, hasMore, totalCount, nextCursor, strategy, via, debug }
//
// Per-page pagination (20 songs per request) matching the reference app:
// - Fast (<1s per NEXT click), never hits Vercel's 10s serverless timeout.
// - Works on workspaces with 50, 100, 279, or 1000+ songs.
// - Auto-detects duplicate pages (via `prevIds`) so if an endpoint ignores `page`,
//   it automatically falls through to the next Suno pagination strategy.
const PAGE_SIZE = 20;

export default async function handler(req, res) {
  try {
    const body = await readBody(req);
    const { token, workspaceId, type } = body;
    const page = Math.max(0, Number(body.page || 0)); // 0-indexed: 0 = HAL 1, 1 = HAL 2, ...
    const cursor = body.cursor || null;
    const preferredStrategy = body.strategy || null;
    const expected = Number(body.expected || 0) || null;
    const prevIdSet = new Set(Array.isArray(body.prevIds) ? body.prevIds : []);

    if (!token) {
      res.status(400).json({ error: 'Set token dulu di bagian Kantong Token.' });
      return;
    }

    const headers = sunoHeaders(token);
    const debug = [];

    async function fetchJson(url, opts = {}) {
      const r = await fetch(url, { headers, ...opts });
      const data = await r.json().catch(() => null);
      return { status: r.status, ok: r.ok, data };
    }

    async function tryEndpoint(name, url, opts = {}) {
      try {
        const { status, ok, data } = await fetchJson(url, opts);
        const rawClips = extractClips(data).map(normalizeClip).filter(Boolean);
        const totalCount = extractTotalCount(data);
        const nextCursor = extractCursor(data);
        const explicitHasMore =
          data && typeof data.has_more === 'boolean' ? data.has_more : null;

        // Duplicate-page guard: on page >= 1, if every returned clip is already in prevIdSet,
        // the endpoint ignored our page/cursor parameter!
        let newCount = rawClips.length;
        if (page > 0 && prevIdSet.size > 0 && rawClips.length > 0) {
          newCount = rawClips.filter(c => !prevIdSet.has(c.id)).length;
        }

        debug.push(
          `${name} -> HTTP ${status}, ${rawClips.length} lagu` +
            (page > 0 && prevIdSet.size > 0 ? ` (${newCount} baru)` : '') +
            (totalCount != null ? `, total=${totalCount}` : '') +
            (nextCursor ? ', cursor=ada' : '')
        );

        if (!ok && status === 401) {
          return { authError: true, status };
        }
        if (!rawClips.length) {
          return { empty: true, status, totalCount, nextCursor, explicitHasMore };
        }
        if (page > 0 && prevIdSet.size > 0 && newCount === 0) {
          // Endpoint returned the exact same page again -> reject and try next strategy
          return { duplicate: true, status, clips: rawClips, totalCount };
        }

        // If some overlap occurred (rare with live feeds), keep only genuinely new clips on page > 0
        const clips =
          page > 0 && prevIdSet.size > 0 && newCount < rawClips.length
            ? rawClips.filter(c => !prevIdSet.has(c.id))
            : rawClips;

        return {
          success: true,
          strategy: name,
          clips,
          totalCount,
          nextCursor,
          explicitHasMore,
        };
      } catch (e) {
        debug.push(`${name} -> error: ${e.message}`);
        return { error: e.message };
      }
    }

    const postOpts = payload => ({
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const page1 = page + 1; // 1-indexed page number (HAL 1 -> 1, HAL 2 -> 2, ...)
    let candidates = [];

    if (!workspaceId || workspaceId === 'all' || type === 'all') {
      const baseFilters = { disliked: 'False', trashed: 'False' };
      candidates = [
        cursor
          ? ['feed-v3-cursor', `${SUNO_API}/api/feed/v3`, postOpts({ cursor, limit: PAGE_SIZE, filters: baseFilters })]
          : ['feed-v3-cursor', `${SUNO_API}/api/feed/v3`, postOpts({ limit: PAGE_SIZE, filters: baseFilters })],
        ['feed-v3-page', `${SUNO_API}/api/feed/v3`, postOpts({ page, limit: PAGE_SIZE, filters: baseFilters })],
        ['feed-v2', `${SUNO_API}/api/feed/v2?page=${page}`],
        ['library', `${SUNO_API}/api/library?page=${page1}&page_size=${PAGE_SIZE}`],
      ];
    } else if (type === 'playlist') {
      const plFilters = {
        disliked: 'False',
        trashed: 'False',
        fromStudioProject: { presence: 'False' },
        playlist: { presence: 'True', playlistId: workspaceId },
      };
      candidates = [
        ['playlist-v1-p1', `${SUNO_API}/api/playlist/${workspaceId}?page=${page1}`],
        ['playlist-v1-p0', `${SUNO_API}/api/playlist/${workspaceId}?page=${page}`],
        cursor
          ? ['feed-v3-pl-cursor', `${SUNO_API}/api/feed/v3`, postOpts({ cursor, limit: PAGE_SIZE, filters: plFilters })]
          : ['feed-v3-pl-page', `${SUNO_API}/api/feed/v3`, postOpts({ page, limit: PAGE_SIZE, filters: plFilters })],
        ['playlist-clips', `${SUNO_API}/api/playlist/${workspaceId}/clips?page=${page1}`],
        ['playlist-v2-tracks', `${SUNO_API}/api/playlist/v2/${workspaceId}/tracks?page=${page1}`],
      ];
    } else {
      // type === 'project' (Workspace di Suno)
      // Primary: GET /api/project/{id}?page=1, 2, 3, ... (1-indexed, 20 clips per page)
      // Fallbacks: 0-indexed page, feed/v3 with top-level project_id (cursor & page),
      //            feed/v2 with project_id query param, and project/{id}/clips.
      candidates = [
        ['project-p1', `${SUNO_API}/api/project/${workspaceId}?page=${page1}`],
        ['project-p0', `${SUNO_API}/api/project/${workspaceId}?page=${page}`],
        cursor
          ? ['feed-v3-proj-cursor', `${SUNO_API}/api/feed/v3`, postOpts({ cursor, limit: PAGE_SIZE, project_id: workspaceId })]
          : ['feed-v3-proj-page', `${SUNO_API}/api/feed/v3`, postOpts({ page, limit: PAGE_SIZE, project_id: workspaceId })],
        ['feed-v2-proj-p0', `${SUNO_API}/api/feed/v2?page=${page}&project_id=${workspaceId}`],
        ['feed-v2-proj-p1', `${SUNO_API}/api/feed/v2?page=${page1}&project_id=${workspaceId}`],
        ['project-clips', `${SUNO_API}/api/project/${workspaceId}/clips?page=${page1}`],
      ];
    }

    // Put preferredStrategy first if the previous page already found a working strategy
    if (preferredStrategy) {
      const idx = candidates.findIndex(c => c[0] === preferredStrategy);
      if (idx > 0) {
        const [picked] = candidates.splice(idx, 1);
        candidates.unshift(picked);
      }
    }

    let winner = null;
    let sawAuthError = false;
    let lastTotalCount = expected;

    for (const [name, url, opts] of candidates) {
      const r = await tryEndpoint(name, url, opts);
      if (r.totalCount != null) lastTotalCount = r.totalCount;
      if (r.authError) {
        sawAuthError = true;
        continue;
      }
      if (r.success) {
        winner = r;
        break;
      }
    }

    if (!winner) {
      if (sawAuthError) {
        res.status(401).json({
          error: 'Token Suno sudah kedaluwarsa (401). Ambil token baru dari suno.com.',
          debug,
        });
        return;
      }
      // If page > 0 returned empty on all strategies, we cleanly reached the end of the workspace
      if (page > 0) {
        res.status(200).json({
          clips: [],
          page,
          pageSize: PAGE_SIZE,
          hasMore: false,
          endReached: true,
          totalCount: lastTotalCount,
          nextCursor: null,
          strategy: preferredStrategy,
          via: preferredStrategy,
          debug,
        });
        return;
      }
      res.status(200).json({
        clips: [],
        page: 0,
        pageSize: PAGE_SIZE,
        hasMore: false,
        totalCount: 0,
        nextCursor: null,
        strategy: null,
        via: null,
        debug,
        message: 'Workspace/playlist ini kosong atau belum ada lagu.',
      });
      return;
    }

    const totalCount = winner.totalCount ?? expected ?? null;
    let hasMore;
    if (winner.explicitHasMore !== null) {
      hasMore = winner.explicitHasMore;
    } else if (winner.nextCursor) {
      hasMore = true;
    } else if (totalCount != null && totalCount > 0) {
      hasMore = (page + 1) * PAGE_SIZE < totalCount;
    } else {
      // Standard Suno page size is 20; if we got a full page, assume there may be a next page
      hasMore = winner.clips.length >= PAGE_SIZE;
    }

    res.status(200).json({
      clips: winner.clips,
      page,
      pageSize: PAGE_SIZE,
      hasMore,
      totalCount,
      nextCursor: winner.nextCursor || null,
      strategy: winner.strategy,
      via: winner.strategy,
      debug,
    });
  } catch (e) {
    res.status(502).json({ error: `Gagal: ${e.message}` });
  }
}
