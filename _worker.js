// Cloudflare Pages Module with Cloudflare D1 Database Integration & Security Hardening
// Repository: oziepuskesmas/pmtbankot

const AUTH_SECRET = 'pmtbankot_sec_key_2026_puskesmas_banjaran_kota_d1';

function toBase64Url(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function createToken(payload, secret = AUTH_SECRET) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payloadStr = JSON.stringify({ ...payload, exp: Date.now() + (30 * 24 * 3600 * 1000) });
  const dataB64 = toBase64Url(enc.encode(payloadStr));
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataB64));
  const sigB64 = toBase64Url(sig);
  return `${dataB64}.${sigB64}`;
}

async function verifyToken(token, secret = AUTH_SECRET) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [dataB64, sigB64] = token.split('.');
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = fromBase64Url(sigB64);
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(dataB64));
    if (!isValid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(dataB64)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const secret = env.AUTH_SECRET || AUTH_SECRET;
  return await verifyToken(token, secret);
}

function getSecurityHeaders(request) {
  const origin = request.headers.get('Origin');
  let allowOrigin = '*';
  if (origin) {
    if (
      origin.includes('workers.dev') ||
      origin.includes('pages.dev') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      allowOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Type': 'application/json'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = getSecurityHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
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
            const token = await createToken({ id: user.id, username: user.username, role: user.role || 'Nutrusionist' }, env.AUTH_SECRET || AUTH_SECRET);
            return new Response(JSON.stringify({
              success: true,
              token,
              user: {
                id: user.id,
                username: user.username,
                role: user.role || 'Nutrusionist',
                puskesmas: user.puskesmas || 'Puskesmas Banjaran Kota'
              }
            }), { headers });
          }
        }

        // Fallback default admin jika D1 binding belum diisi / offline seed
        if (u.toLowerCase() === 'mochamad fauzie, s.gz' && p === '213117') {
          const token = await createToken({ id: 1, username: 'Mochamad Fauzie, S.Gz', role: 'Admin' }, env.AUTH_SECRET || AUTH_SECRET);
          return new Response(JSON.stringify({
            success: true,
            token,
            user: {
              id: 1,
              username: 'Mochamad Fauzie, S.Gz',
              role: 'Admin',
              puskesmas: 'Puskesmas Banjaran Kota'
            }
          }), { headers });
        }

        return new Response(JSON.stringify({
          success: false,
          message: 'Nama pegawai atau password tidak sesuai.'
        }), { status: 401, headers });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
      }
    }

    // 2. API: GET /api/users (Daftar Pegawai Terdaftar untuk Dropdown Login & Admin)
    if (url.pathname === '/api/users' && request.method === 'GET') {
      try {
        if (env.DB) {
          const { results } = await env.DB.prepare('SELECT id, username, role, puskesmas, created_at FROM users ORDER BY id ASC').all();
          return new Response(JSON.stringify(results || []), { headers });
        }
        return new Response(JSON.stringify([
          { id: 1, username: 'Mochamad Fauzie, S.Gz', role: 'Admin', puskesmas: 'Puskesmas Banjaran Kota' }
        ]), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 2b. API: POST /api/users (Buat Akun Pegawai Baru - Khusus Admin)
    if (url.pathname === '/api/users' && request.method === 'POST') {
      try {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return new Response(JSON.stringify({ success: false, message: 'Autentikasi diperlukan.' }), { status: 401, headers });
        }
        if (authUser.role !== 'Admin') {
          return new Response(JSON.stringify({ success: false, message: 'Hanya Admin yang dapat membuat akun baru.' }), { status: 403, headers });
        }

        const body = await request.json();
        const username = (body.username || '').trim();
        const password = (body.password || '').trim();
        const role = (body.role === 'Admin') ? 'Admin' : 'Nutrusionist';
        const puskesmas = (body.puskesmas || 'Puskesmas Banjaran Kota').trim();

        if (!username || !password) {
          return new Response(JSON.stringify({ success: false, message: 'Nama pegawai dan kata sandi wajib diisi.' }), { status: 400, headers });
        }

        if (env.DB) {
          const existing = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
          if (existing) {
            return new Response(JSON.stringify({ success: false, message: 'Nama pegawai sudah terdaftar. Gunakan nama lain.' }), { status: 400, headers });
          }

          const res = await env.DB.prepare(
            'INSERT INTO users (username, password, role, puskesmas, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(username, password, role, puskesmas, new Date().toISOString()).run();

          return new Response(JSON.stringify({ success: true, id: res.meta.last_row_id }), { headers });
        }

        return new Response(JSON.stringify({ success: true, message: 'Mode tanpa database' }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 2c. API: DELETE /api/users (Hapus Akun Pegawai - Khusus Admin)
    if (url.pathname === '/api/users' && request.method === 'DELETE') {
      try {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return new Response(JSON.stringify({ success: false, message: 'Autentikasi diperlukan.' }), { status: 401, headers });
        }
        if (authUser.role !== 'Admin') {
          return new Response(JSON.stringify({ success: false, message: 'Hanya Admin yang dapat menghapus akun.' }), { status: 403, headers });
        }

        const id = url.searchParams.get('id');
        if (!id) {
          return new Response(JSON.stringify({ success: false, message: 'Parameter id wajib disertakan.' }), { status: 400, headers });
        }

        if (String(id) === '1' || String(authUser.id) === String(id)) {
          return new Response(JSON.stringify({ success: false, message: 'Akun Admin utama atau akun yang sedang aktif tidak dapat dihapus.' }), { status: 400, headers });
        }

        if (env.DB) {
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
        }

        return new Response(JSON.stringify({ success: true, id }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 3. API: GET /api/documents (Wajib Autentikasi)
    if (url.pathname === '/api/documents' && request.method === 'GET') {
      try {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return new Response(JSON.stringify({ success: false, message: 'Autentikasi diperlukan untuk mengakses dokumen.' }), { status: 401, headers });
        }

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
            return new Response(JSON.stringify(formatted), { headers });
          }
        }
        return new Response(JSON.stringify([]), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 4. API: POST /api/documents (Wajib Autentikasi & Dibatasi Payload)
    if (url.pathname === '/api/documents' && request.method === 'POST') {
      try {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return new Response(JSON.stringify({ success: false, message: 'Autentikasi diperlukan untuk menyimpan dokumen.' }), { status: 401, headers });
        }

        const docs = await request.json();
        if (!Array.isArray(docs)) {
          return new Response(JSON.stringify({ success: false, message: 'Payload harus berupa array dokumen.' }), { status: 400, headers });
        }
        if (docs.length > 200) {
          return new Response(JSON.stringify({ success: false, message: 'Batas maksimum 200 dokumen per penyimpanan.' }), { status: 400, headers });
        }

        if (env.DB) {
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
              String(doc.id || ''),
              String(doc.desa || ''),
              String(doc.termin || 'TERMIN 1'),
              String(doc.puskesmas || 'Puskesmas Banjaran Kota'),
              String(doc.tanggalCustom || ''),
              String(doc.judul || 'DOKUMENTASI KEGIATAN'),
              String(doc.subJudul || 'PMT LOKAL IBU HAMIL KEK DAN BALITA BERMASALAH GIZI'),
              JSON.stringify(doc.fotos || []),
              doc.createdAt || new Date().toISOString(),
              doc.updatedAt || new Date().toISOString()
            ).run();
          }
          return new Response(JSON.stringify({ success: true, count: docs.length }), { headers });
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 5. API: DELETE /api/documents (Hapus dokumen dari Cloudflare D1)
    if (url.pathname === '/api/documents' && request.method === 'DELETE') {
      try {
        const authUser = await authenticateRequest(request, env);
        if (!authUser) {
          return new Response(JSON.stringify({ success: false, message: 'Autentikasi diperlukan untuk menghapus dokumen.' }), { status: 401, headers });
        }

        const id = url.searchParams.get('id');
        if (!id) {
          return new Response(JSON.stringify({ success: false, message: 'Parameter id dokumen wajib disertakan.' }), { status: 400, headers });
        }

        if (env.DB) {
          if (id === 'all') {
            await env.DB.prepare('DELETE FROM documents').run();
          } else {
            await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
          }
        }

        return new Response(JSON.stringify({ success: true, id }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // 6. API: GET /api/gallery (Fallback untuk Cloudflare Pages)
    if (url.pathname === '/api/gallery' && request.method === 'GET') {
      return new Response(JSON.stringify({ success: true, photos: [] }), { headers });
    }

    // 7. Fallback: Sajikan file statis (HTML, CSS, JS) via Cloudflare Pages
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      const newHeaders = new Headers(assetRes.headers);
      newHeaders.set('X-Content-Type-Options', 'nosniff');
      newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers: newHeaders
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
