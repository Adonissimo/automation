import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, defaults, seedDemo } from './store.js';
import { address, validAddress, classify, parseDsn, gmailMessage, encrypt, decrypt } from './engine.js';

const root = dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE_URL || 'http://localhost:3000';
const key = process.env.TOKEN_KEY || '';
const password = process.env.APP_PASSWORD || '';
const production = process.env.NODE_ENV === 'production';
if (production && (password.length < 20 || !/^https:\/\//.test(base))) throw Error('Production requires HTTPS BASE_URL and APP_PASSWORD of at least 20 characters.');
if (key && !/^[a-f0-9]{64}$/i.test(key)) throw Error('TOKEN_KEY must be 64 hexadecimal characters.');
const store = openStore(process.env.DATA_DIR || join(root, 'data'));
seedDemo(store);
const source = () => store.get('tokens') ? 'gmail' : 'demo';
const settings = () => store.get('settings:'+source(), defaults);
const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && key && password);
const csrf = randomBytes(32).toString('hex');
let running = false;
let sending = false;
let lastError = '';
const sha = value => createHash('sha256').update(value).digest();
function secureEqual(a,b) { return timingSafeEqual(sha(a), sha(b)); }
function json(res, status, value) { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(value)); }
function fail(status, message) { throw Object.assign(Error(message), { status }); }
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 40000) fail(413, 'Request too large.'); }
  try { return JSON.parse(text || '{}'); } catch { fail(400, 'Invalid JSON.'); }
}
async function googleFetch(url, options) {
  const response = await fetch(url, { ...options, signal:AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`Google request failed (${response.status}). Reconnect Gmail if access expired; otherwise try again later.`);
  return data;
}
async function token() {
  const encrypted = store.get('tokens');
  if (!encrypted) fail(409, 'Connect Gmail first.');
  const saved = JSON.parse(decrypt(encrypted, key));
  if (saved.expires > Date.now()+60000) return saved.access_token;
  const updated = await googleFetch('https://oauth2.googleapis.com/token', {
    method:'POST', body:new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET,
      refresh_token:saved.refresh_token, grant_type:'refresh_token' })
  });
  store.set('tokens', encrypt(JSON.stringify({ ...saved, ...updated, expires:Date.now()+updated.expires_in*1000 }), key));
  return updated.access_token;
}
async function gmail(path, data, method) {
  return googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path, {
    method:method || (data ? 'POST' : 'GET'), headers:{ Authorization:`Bearer ${await token()}`, 'Content-Type':'application/json' },
    ...(data ? { body:JSON.stringify(data) } : {})
  });
}
async function labelId(category) {
  const name = 'InboxPilot/'+category;
  const list = await gmail('labels');
  const existing = list.labels?.find(l => l.name === name);
  if (existing) return existing.id;
  return (await gmail('labels', { name, labelListVisibility:'labelShow', messageListVisibility:'show' })).id;
}
async function synchronize() {
  // A bounded page per run. Durable page tokens ensure large inboxes eventually progress.
  const cursor = store.get('cursor', '');
  const page = await gmail('messages?includeSpamTrash=true&maxResults=50&q='+encodeURIComponent('in:anywhere -in:trash -in:sent -in:drafts')+(cursor ? '&pageToken='+encodeURIComponent(cursor) : ''));
  for (const ref of page.messages || []) {
    const old = store.messages('gmail').find(m => m.id === ref.id);
    if (old?.processed && old?.state !== 'inbox') continue;
    const message = gmailMessage(await gmail('messages/'+encodeURIComponent(ref.id)+'?format=full'));
    store.save({ ...old, ...message, state:message.labels.includes('TRASH') ? 'trash' : 'inbox', category:old?.category || 'Unprocessed' }, 'gmail');
  }
  store.set('cursor', page.nextPageToken || '');
  store.set('lastSync', new Date().toISOString());
}
async function runAutomation() {
  if (running || sending) fail(409, 'An email operation is already in progress.');
  if (settings().paused) fail(409, 'Automation is paused. Resume it first.');
  running = true;
  lastError = '';
  const src = source();
  const config = settings();
  try {
    if (src === 'gmail') await synchronize();
    for (const message of store.messages(src)) {
      if (message.state === 'trash') continue;
      const decision = classify(message, config);
      const fingerprint = JSON.stringify({decision, shadow:config.shadow, cleanup:config.junkCleanup, dsn:message.dsn});
      if (message.processed === fingerprint) continue;
      const reports = message.dsn ? parseDsn(message.dsn) : [];
      let action = decision.action;
      if (action === 'trash' && !config.junkCleanup) action = 'review';
      if (config.shadow) action = 'preview: '+action;
      if (!config.shadow) {
        if (src === 'gmail' && action === 'label') {
          await gmail('messages/'+encodeURIComponent(message.id)+'/modify', { addLabelIds:[await labelId(decision.category)] });
        }
        if (action === 'trash') {
          if (src === 'gmail') await gmail('messages/'+encodeURIComponent(message.id)+'/trash', {});
          message.state = 'trash';
        }
        // Inbound DSNs are untrusted. Suppression requires separate owner approval.
      }
      store.save({ ...message, category:decision.category, reason:decision.reason, reports, processed:fingerprint }, src);
      store.event(src, message.subject, action, decision.reason+(reports.length ? ' · '+reports.map(r => r.advice).join(' ') : ''));
    }
  } catch (error) { lastError = error.message; store.event(src, 'Automation run', 'error', lastError); throw error; }
  finally { running = false; }
}
async function route(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const url = new URL(req.url, base);
  if (url.pathname === '/healthz') return json(res,200,{ok:true});
  if (password) {
    const expected = 'Basic '+Buffer.from('admin:'+password).toString('base64');
    if (!secureEqual(req.headers.authorization || '',expected)) {
      res.writeHead(401, { 'WWW-Authenticate':'Basic realm="InboxPilot", charset="UTF-8"' }); return res.end('Authentication required.');
    }
  }
  if (!['GET','HEAD'].includes(req.method)) {
    if (req.headers.origin !== new URL(base).origin || !secureEqual(req.headers['x-csrf-token'] || '',csrf)) fail(403,'Reload the app before trying again.');
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return json(res,200,{ source:source(), configured:configured(), email:store.get('email','Demo inbox'), settings:settings(),
      messages:store.messages(source()), events:store.events(source()), running, lastError, csrf,
      lastSync:store.get('lastSync'), suppressed:source()==='gmail' ? store.db.prepare('SELECT * FROM suppressed').all() : [] });
  }
  if (req.method === 'GET' && url.pathname === '/auth/google') {
    if (!configured()) fail(409,'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY and APP_PASSWORD, then restart.');
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    store.set('oauth', { hash:sha(state).toString('hex'), verifier, expires:Date.now()+600000 });
    res.setHeader('Set-Cookie',`oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${base.startsWith('https:') ? '; Secure' : ''}`);
    const params = new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, redirect_uri:base+'/auth/callback', response_type:'code',
      scope:'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send', access_type:'offline', prompt:'consent', state,
      code_challenge:sha(verifier).toString('base64url'), code_challenge_method:'S256' });
    res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+params}); return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/auth/callback') {
    if (running || sending) fail(409,'Wait for the current email operation, then reconnect.');
    const saved = store.get('oauth');
    const state = url.searchParams.get('state') || '';
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1] || '';
    if (!saved || saved.expires < Date.now() || !secureEqual(cookie,state) || !secureEqual(saved.hash,sha(state).toString('hex'))) fail(400,'OAuth session expired. Start the connection again.');
    store.set('oauth',null);
    if (!url.searchParams.get('code')) fail(400,'Google connection was cancelled.');
    const tokens = await googleFetch('https://oauth2.googleapis.com/token', { method:'POST', body:new URLSearchParams({
      client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, redirect_uri:base+'/auth/callback',
      grant_type:'authorization_code', code:url.searchParams.get('code'), code_verifier:saved.verifier }) });
    if (!tokens.refresh_token) fail(400,'No refresh token returned. Reconnect and grant offline access.');
    // Never mix two accounts' stored mail, suppression rules, or cursors.
    store.db.exec("DELETE FROM messages WHERE source='gmail'; DELETE FROM events WHERE source='gmail'; DELETE FROM suppressed; DELETE FROM outgoing;");
    store.set('cursor',''); store.set('lastSync',null); store.set('settings:gmail',defaults);
    store.set('tokens',encrypt(JSON.stringify({...tokens,expires:Date.now()+tokens.expires_in*1000}),key));
    const profile = await gmail('profile'); store.set('email',profile.emailAddress);
    res.writeHead(302,{Location:'/'}); return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/api/run') { await runAutomation(); return json(res,200,{ok:true}); }
  if (req.method === 'POST' && url.pathname === '/api/settings') {
    const input = await body(req);
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    const next = {...settings()};
    for (const name of ['paused','shadow','junkCleanup']) if (name in input) {
      if (typeof input[name] !== 'boolean') fail(400,'Invalid setting.'); next[name] = input[name];
    }
    for (const name of ['protected','blocked']) if (name in input) {
      if (!Array.isArray(input[name]) || input[name].length>100 || !input[name].every(validAddress)) fail(400,'Enter valid email addresses, separated by commas. Maximum 100.');
      next[name] = [...new Set(input[name].map(s=>s.toLowerCase()))];
    }
    store.set('settings:'+source(),next); store.event(source(),'Automation settings','updated','Settings saved.'); return json(res,200,{ok:true});
  }
  if (req.method === 'POST' && url.pathname === '/api/restore') {
    const input = await body(req);
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    const m = store.messages(source()).find(m=>m.id===input.id);
    if (!m || m.state !== 'trash') fail(404,'Trashed message not found.');
    running = true;
    try {
      if (source()==='gmail') await gmail('messages/'+encodeURIComponent(m.id)+'/untrash',{});
      store.save({...m,state:'inbox',processed:null},source());
      const next = settings(); next.protected = [...new Set([...next.protected,address(m.sender)])];
      store.set('settings:'+source(),next); store.event(source(),m.subject,'restored','Sender protected from future cleanup.'); return json(res,200,{ok:true});
    } finally { running = false; }
  }
  if (req.method === 'POST' && url.pathname === '/api/suppress') {
    const input = await body(req);
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    const message = store.messages(source()).find(m=>m.id===input.id);
    const report = message && parseDsn(message.dsn).find(r=>r.recipient===input.recipient && r.status==='5.1.1' && r.action==='failed');
    if (!report || input.confirmed !== true) fail(400,'Review a permanent invalid-address report and approve suppression first.');
    if (source()==='gmail') store.db.prepare('INSERT OR REPLACE INTO suppressed VALUES (?,?)').run(report.recipient,'Owner-approved suppression: '+report.advice);
    store.event(source(),message.subject,source()==='demo'?'simulated suppression':'recipient suppressed','Owner approved: '+report.recipient);
    return json(res,200,{ok:true});
  }
  if (req.method === 'POST' && url.pathname === '/api/unsuppress') {
    const input = await body(req);
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    if (!validAddress(input.recipient)) fail(400,'A valid recipient is required.');
    store.db.prepare('DELETE FROM suppressed WHERE recipient=?').run(input.recipient.toLowerCase());
    store.event(source(),input.recipient,'suppression removed','Owner removed recipient suppression.');
    return json(res,200,{ok:true});
  }
  if (req.method === 'POST' && url.pathname === '/api/send') {
    const input = await body(req);
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    if (settings().paused) fail(409,'Resume automation before sending.');
    if (input.confirmed !== true || !validAddress(input.to) || typeof input.subject !== 'string' || !input.subject.trim() || /[\r\n]/.test(input.subject) || input.subject.length>200 || typeof input.body !== 'string' || !input.body.trim() || input.body.length>15000) fail(400,'A valid recipient, subject, message and approval are required.');
    if (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(input.id)) fail(400,'Invalid send identifier.');
    if (source()==='gmail' && store.db.prepare('SELECT 1 FROM suppressed WHERE recipient=?').get(input.to.toLowerCase())) fail(409,'This recipient bounced permanently. Verify the address before using another recipient.');
    if (store.db.prepare('SELECT 1 FROM outgoing WHERE id=?').get(input.id)) fail(409,'Already attempted. Check Sent before trying another send.');
    store.db.prepare('INSERT INTO outgoing VALUES (?,?)').run(input.id,'pending');
    sending = true;
    try {
      if (source()==='gmail') {
        const subject = '=?UTF-8?B?'+Buffer.from(input.subject).toString('base64')+'?=';
        const mime = `To: ${input.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(input.body).toString('base64').match(/.{1,76}/g).join('\r\n')}`;
        await gmail('messages/send',{raw:Buffer.from(mime).toString('base64url')});
      }
      store.db.prepare('UPDATE outgoing SET status=? WHERE id=?').run('sent',input.id);
      store.event(source(),input.subject,source()==='demo'?'simulated send':'sent','Approved message to '+input.to);
      return json(res,200,{ok:true});
    } catch(error) {
      store.db.prepare('UPDATE outgoing SET status=? WHERE id=?').run('unknown',input.id);
      store.event(source(),input.subject,'send uncertain','Check Gmail Sent before any retry.');
      fail(502,'Send result uncertain. Check Gmail Sent before another attempt.');
    } finally { sending = false; }
  }
  if (req.method === 'POST' && url.pathname === '/api/disconnect') {
    if (running || sending) fail(409,'Wait for the current email operation to finish.');
    store.set('tokens',null); store.set('email',null); store.set('cursor',''); store.set('lastSync',null);
    store.db.exec("DELETE FROM messages WHERE source='gmail'; DELETE FROM events WHERE source='gmail'; DELETE FROM suppressed; DELETE FROM outgoing;");
    return json(res,200,{ok:true});
  }
  const files = { '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'] };
  if (req.method==='GET' && files[url.pathname]) {
    const [file,type] = files[url.pathname]; res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); return res.end(readFileSync(join(root,'public',file)));
  }
  fail(404,'Not found.');
}
const server = http.createServer((req,res)=>route(req,res).catch(error=>{
  if (!res.headersSent) json(res,error.status || 502,{error:error.status ? error.message : 'Operation failed. Check the activity log or server configuration, then retry.'});
  else res.end();
}));
server.requestTimeout=30000;
server.listen(Number(process.env.PORT || 3000),process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),()=>console.log('InboxPilot listening on '+base));
const timer = setInterval(()=>{ if (source()==='gmail' && !settings().paused && !running) runAutomation().catch(()=>{}); },60000);
timer.unref();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{ clearInterval(timer); server.close(()=>{store.db.close();process.exit(0);}); });
