// Servidor de mentira que imita o que o app usa do Supabase (login e as duas tabelas), só para os testes.
// Guarda tudo na memória e aplica a mesma regra do schema.sql: cada usuário só vê as próprias linhas.
const http = require('node:http');
const crypto = require('node:crypto');

function createMock(opt = {}) {
  const db = { users: new Map(), access: new Map(), refresh: new Map(), careers: new Map(), weeks: new Map() };
  const flags = { offline: false, noTables: false, confirmEmail: !!opt.confirmEmail, requests: 0 };
  const rid = () => crypto.randomBytes(12).toString('hex');
  const session = user => {
    const access_token = 'at_' + rid(), refresh_token = 'rt_' + rid();
    db.access.set(access_token, user.id); db.refresh.set(refresh_token, user.id);
    return { access_token, refresh_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user.id, email: user.email } };
  };
  const server = http.createServer((req, res) => {
    if (flags.offline) return req.socket.destroy();
    flags.requests++;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
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
      const table = { '/rest/v1/careers': 'careers', '/rest/v1/career_weeks': 'weeks' }[path];
      if (table) {
        if (flags.noTables) return send(404, { code: 'PGRST205', message: "Could not find the table in the schema cache" });
        if (!user) return send(401, { code: 'PGRST303', message: 'JWT expired' });
        const eq = k => (q.get(k) || '').replace(/^eq\./, '');
        const mine = [...db[table].values()].filter(r => r.user_id === uid);   // RLS
        const match = mine.filter(r => (!q.get('user_id') || r.user_id === eq('user_id')) && (!q.get('week_id') || r.week_id === eq('week_id')));
        if (req.method === 'GET') {
          const cols = (q.get('select') || '*').split(',');
          const rows = match.slice().sort((a, b) => (a.start_day || 0) - (b.start_day || 0));
          return send(200, rows.map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]]))));
        }
        if (req.method === 'POST') {
          if (body.user_id !== uid) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
          db[table].set(table === 'careers' ? uid : uid + '/' + body.week_id, body);
          return send(201);
        }
        if (req.method === 'DELETE') { match.forEach(r => db[table].delete(table === 'careers' ? uid : uid + '/' + r.week_id)); return send(204); }
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
    confirm: email => { db.users.get(email).confirmed = true; }
  };
}
module.exports = { createMock };
if (require.main === module) createMock().listen(+process.argv[2] || 54321).then(u => console.log('Supabase de teste em ' + u));
