// Servidor de mentira que imita o que o app usa do Supabase (login e as duas tabelas), só para os testes.
// Guarda tudo na memória e aplica a mesma regra do schema.sql: cada usuário só vê as próprias linhas.
const http = require('node:http');
const crypto = require('node:crypto');

function createMock(opt = {}) {
  const db = { users: new Map(), access: new Map(), refresh: new Map(), careers: new Map(), weeks: new Map(), drafts: new Map() };
  const flags = { offline: false, noTables: false, noDrafts: false, confirmEmail: !!opt.confirmEmail, requests: 0 };
  const rid = () => crypto.randomBytes(12).toString('hex');
  const session = user => {
    const access_token = 'at_' + rid(), refresh_token = 'rt_' + rid();
    db.access.set(access_token, user.id); db.refresh.set(refresh_token, user.id);
    return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user.id, email: user.email } };
  };
  const server = http.createServer((req, res) => {
    if (flags.offline) return req.socket.destroy();
    flags.requests++;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    const send = (status, body) => { res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(body === undefined ? '' : JSON.stringify(body)); };
    if (req.method === 'OPTIONS') return send(204);
    let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
      const url = new URL(req.url, 'http://x'), q = url.searchParams, path = url.pathname;
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
      if (!req.headers.apikey) return send(401, { message: 'No API key found in request' });
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      const uid = db.access.get(bearer);
      const user = uid && [...db.users.values()].find(u => u.id === uid);

      if (path === '/auth/v1/signup' && req.method === 'POST') {
        if (db.users.has(body.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        if ((body.password || '').length < 6) return send(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters' });
        const u = { id: crypto.randomUUID(), email: body.email, password: body.password, confirmed: !flags.confirmEmail };
        db.users.set(u.email, u);
        return send(200, flags.confirmEmail ? { id: u.id, email: u.email } : session(u));
      }
      if (path === '/auth/v1/token' && req.method === 'POST') {
        if (q.get('grant_type') === 'password') {
          const u = db.users.get(body.email);
          if (!u || u.password !== body.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          if (!u.confirmed) return send(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
          return send(200, session(u));
        }
        const id = db.refresh.get(body.refresh_token);
        if (!id) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
        db.refresh.delete(body.refresh_token);
        return send(200, session([...db.users.values()].find(u => u.id === id)));
      }
      if (path === '/auth/v1/recover') return send(200, {});
      if (path.startsWith('/auth/v1/')) {
        if (!user) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
        if (path === '/auth/v1/user' && req.method === 'GET') return send(200, { id: user.id, email: user.email });
        if (path === '/auth/v1/user' && req.method === 'PUT') { if (body.password) user.password = body.password; return send(200, { id: user.id, email: user.email }); }
        if (path === '/auth/v1/logout') { db.access.delete(bearer); return send(204); }
      }
      // Tabelas: mesma lógica do PostgREST para o que o app usa (filtros eq, ordem, upsert, update, delete) com RLS por usuário
      const table = { '/rest/v1/careers': 'careers', '/rest/v1/career_weeks': 'weeks', '/rest/v1/trip_drafts': 'drafts' }[path];
      if (table) {
        if (flags.noTables || (table === 'drafts' && flags.noDrafts)) return send(404, { code: 'PGRST205', message: "Could not find the table in the schema cache" });
        if (!user) return send(401, { code: 'PGRST303', message: 'JWT expired' });
        const keyOf = r => table === 'careers' ? r.user_id : table === 'weeks' ? r.user_id + '/' + r.week_id : r.id;
        const meta = new Set(['select', 'order', 'on_conflict']);
        const match = [...db[table].values()].filter(r => r.user_id === uid && [...q.entries()].every(([k, v]) => meta.has(k) || String(r[k]) === v.replace(/^eq\./, '')));
        if (req.method === 'GET') {
          const cols = (q.get('select') || '*').split(','), ord = (q.get('order') || '').split('.');
          const rows = match.slice().sort((a, b) => ord[0] ? (a[ord[0]] > b[ord[0]] ? 1 : a[ord[0]] < b[ord[0]] ? -1 : 0) * (ord[1] === 'desc' ? -1 : 1) : 0);
          return send(200, rows.map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]]))));
        }
        if (req.method === 'POST') {
          const list = Array.isArray(body) ? body : [body], prefer = req.headers.prefer || '';
          for (const row of list) {
            if ((row.user_id || uid) !== uid) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
            const r = Object.assign({ user_id: uid }, row);
            if (table === 'drafts') {
              Object.assign(r, { id: r.id || crypto.randomUUID(), status: r.status || 'new', source: r.source || 'telemetria', game: r.game || 'ats', created_at: r.created_at || new Date().toISOString() });
              const dup = [...db.drafts.values()].find(x => x.user_id === uid && x.event_id === r.event_id);
              if (dup) { if (/ignore-duplicates/.test(prefer)) continue; return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' }); }
            }
            db[table].set(keyOf(r), r);
          }
          return send(201);
        }
        if (req.method === 'PATCH') { match.forEach(r => Object.assign(r, body, { user_id: uid })); return send(204); }
        if (req.method === 'DELETE') { match.forEach(r => db[table].delete(keyOf(r))); return send(204); }
      }
      send(404, { message: 'not found' });
    });
  });
  return {
    db, flags,
    listen: (port = 0) => new Promise(r => server.listen(port, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }),
    expireAccessTokens: () => db.access.clear(),
    revokeSessions: () => { db.access.clear(); db.refresh.clear(); },
    confirm: email => { db.users.get(email).confirmed = true; },
    // cria um rascunho como o leitor de telemetria faria
    addDraft: (email, data, extra = {}) => { const u = db.users.get(email), r = Object.assign({ id: crypto.randomUUID(), user_id: u.id, event_id: 'ev-' + crypto.randomUUID(), source: 'telemetria', game: 'ats', status: 'new', created_at: new Date().toISOString(), data }, extra); db.drafts.set(r.id, r); return r; }
  };
}
module.exports = { createMock };
if (require.main === module) createMock().listen(+process.argv[2] || 54321).then(u => console.log('Supabase de teste em ' + u));
