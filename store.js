import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'inboxpilot.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, source TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time TEXT NOT NULL, source TEXT NOT NULL, subject TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outgoing (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS suppressed (recipient TEXT PRIMARY KEY, reason TEXT NOT NULL);`);
  return {
    db,
    get(key, fallback = null) { const row = db.prepare('SELECT value FROM kv WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; },
    set(key, value) { db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, JSON.stringify(value)); },
    messages(source) { return db.prepare('SELECT value FROM messages WHERE source=?').all(source).map(row => JSON.parse(row.value)).sort((a,b) => b.date-a.date); },
    save(message, source) { db.prepare('INSERT OR REPLACE INTO messages VALUES (?,?,?)').run(message.id, source, JSON.stringify(message)); },
    event(source, subject, action, detail) { db.prepare('INSERT INTO events(time,source,subject,action,detail) VALUES (?,?,?,?,?)').run(new Date().toISOString(), source, subject, action, detail); },
    events(source) { return db.prepare('SELECT * FROM events WHERE source=? ORDER BY id DESC LIMIT 100').all(source); }
  };
}
export const defaults = { paused: false, shadow: true, junkCleanup: false, protected: [], blocked: [] };
export function seedDemo(store) {
  if (store.messages('demo').length) return;
  const samples = [
    ['Maya Chen <maya@example.com>', 'Website launch — final review', 'The latest design is ready. Could you review the homepage before Friday?', [], false],
    ['billing@example.com', 'Your invoice for November', 'Your monthly invoice is ready. Total: $48.00.', [], false],
    ['The Weekly Edit <editor@example.com>', 'A few good reads for your weekend', 'This week: designing quieter software and building things that last.', [], true],
    ['Prize Desk <prize@example.net>', 'Claim your exclusive reward today', 'You have been selected. Send your payment details to claim.', ['SPAM'], false],
    ['Delivery System <mailer-daemon@example.com>', 'Delivery failed: proposal', 'The destination mailbox does not exist.', [], false, 'Final-Recipient: rfc822; missing@example.net\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown'],
    ['Alex Morgan <alex@example.com>', 'Coffee next week?', 'Tuesday or Thursday afternoon works for me. What suits you?', [], false],
    ['Studio Notes <notes@example.com>', 'New tools, thoughtful workflows', 'A monthly collection of useful ideas for your work.', [], true],
    ['Delivery System <mailer-daemon@example.com>', 'Delivery delayed: project update', 'The receiving server is temporarily unavailable.', [], false, 'Final-Recipient: rfc822; team@example.net\nAction: delayed\nStatus: 4.4.1\nDiagnostic-Code: smtp; 451 Connection timed out']
  ];
  samples.forEach((m,i) => store.save({ id: `demo-${i}`, sender:m[0], subject:m[1], body:m[2], labels:m[3], listUnsubscribe:m[4], dsn:m[5] || '', date:Date.now()-i*3600000, category:'Unprocessed', state:'inbox' }, 'demo'));
}
