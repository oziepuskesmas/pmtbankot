// Cloudflare Pages Module with Cloudflare D1 Database Integration
// Repository: oziepuskesmas/pmtbankot

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. API: POST /api/login (Autentikasi Pegawai D1)
    if (url.pathname === '/api/login' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        const u = (username || '').trim();
        const p = (password || '').trim();

        if (env.DB) {
          const user = await env.DB.prepare(
            'SELECT id, username, role, puskesmas FROM users WHERE LOWER(username) = LOWER(?) AND password = ?'
          ).bind(u, p).first();

          if (user) {
            return new Response(JSON.stringify({
              success: true,
              user: {
                id: user.id,
                username: user.username,
                role: user.role || 'Petugas',
                puskesmas: user.puskesmas || 'Puskesmas Banjaran Kota'
              }
            }), { headers: corsHeaders });
          }
        }

        // Fallback default admin jika D1 binding belum aktif
        if (u.toLowerCase() === 'mochamad fauzie, s.gz' && p === '213117') {
          return new Response(JSON.stringify({
            success: true,
            user: {
              id: 1,
              username: 'Mochamad Fauzie, S.Gz',
              role: 'Admin',
              puskesmas: 'Puskesmas Banjaran Kota'
            }
          }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: false,
          message: 'Nama pegawai atau password tidak sesuai.'
        }), { status: 401, headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. API: GET /api/users
    if (url.pathname === '/api/users' && request.method === 'GET') {
      try {
        if (env.DB) {
          const { results } = await env.DB.prepare('SELECT id, username, role, puskesmas, created_at FROM users').all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        }
        return new Response(JSON.stringify([
          { id: 1, username: 'Mochamad Fauzie, S.Gz', role: 'Admin', puskesmas: 'Puskesmas Banjaran Kota' }
        ]), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. API: GET /api/documents (Ambil dokumen dari Cloudflare D1)
    if (url.pathname === '/api/documents' && request.method === 'GET') {
      try {
        if (env.DB) {
          const { results } = await env.DB.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
          if (results && Array.isArray(results)) {
            const formatted = results.map(r => ({
              id: r.id,
              desa: r.desa,
              termin: r.termin,
              puskesmas: r.puskesmas || 'Puskesmas Banjaran Kota',
              tanggalCustom: r.tanggal_custom,
              judul: r.judul,
              subJudul: r.sub_judul,
              fotos: r.fotos_json ? JSON.parse(r.fotos_json) : [],
              createdAt: r.created_at,
              updatedAt: r.updated_at
            }));
            return new Response(JSON.stringify(formatted), { headers: corsHeaders });
          }
        }
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 4. API: POST /api/documents (Simpan dokumen ke Cloudflare D1)
    if (url.pathname === '/api/documents' && request.method === 'POST') {
      try {
        const docs = await request.json();
        if (Array.isArray(docs) && env.DB) {
          for (const doc of docs) {
            await env.DB.prepare(`
              INSERT INTO documents (id, desa, termin, puskesmas, tanggal_custom, judul, sub_judul, fotos_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                desa = excluded.desa,
                termin = excluded.termin,
                puskesmas = excluded.puskesmas,
                tanggal_custom = excluded.tanggal_custom,
                judul = excluded.judul,
                sub_judul = excluded.sub_judul,
                fotos_json = excluded.fotos_json,
                updated_at = excluded.updated_at
            `).bind(
              doc.id,
              doc.desa || '',
              doc.termin || 'TERMIN 1',
              doc.puskesmas || 'Puskesmas Banjaran Kota',
              doc.tanggalCustom || '',
              doc.judul || 'DOKUMENTASI KEGIATAN',
              doc.subJudul || 'PMT LOKAL IBU HAMIL KEK DAN BALITA BERMASALAH GIZI',
              JSON.stringify(doc.fotos || []),
              doc.createdAt || new Date().toISOString(),
              doc.updatedAt || new Date().toISOString()
            ).run();
          }
          return new Response(JSON.stringify({ success: true, count: docs.length }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 5. API: GET /api/gallery (Fallback untuk Cloudflare Pages)
    if (url.pathname === '/api/gallery' && request.method === 'GET') {
      return new Response(JSON.stringify({ success: true, photos: [] }), { headers: corsHeaders });
    }

    // 6. Fallback: Sajikan file statis (HTML, CSS, JS) via Cloudflare Pages
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
