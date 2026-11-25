import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encrypt(text, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
export function decrypt(text, key) {
  const data = Buffer.from(text, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
}
export function address(value = '') {
  return (value.match(/<([^<>]+)>/)?.[1] || value).trim().toLowerCase();
}
export function validAddress(value) {
  return typeof value === 'string' && /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(value);
}
export function classify(message, settings) {
  const sender = address(message.sender);
  if (settings.protected.includes(sender)) return { category: 'Important', action: 'label', reason: 'Protected sender' };
  // Structured delivery-status reports only. A subject mentioning a bounce is not sufficient.
  if (message.dsn) return { category: 'Delivery failure', action: 'bounce', reason: 'Structured delivery report' };
  if (settings.blocked.includes(sender)) return { category: 'Junk', action: 'trash', reason: 'Blocked sender rule' };
  if (message.labels.includes('SPAM')) return { category: 'Junk', action: 'trash', reason: 'Gmail spam classification' };
  if (message.listUnsubscribe) return { category: 'Newsletter', action: 'label', reason: 'List-Unsubscribe header' };
  if (/\b(invoice|receipt|payment confirmation)\b/i.test(message.subject)) return { category: 'Finance', action: 'label', reason: 'Finance subject rule; review classification' };
  return { category: 'Inbox', action: 'none', reason: 'No automation rule matched' };
}
export function parseDsn(text) {
  // Unfold headers, then parse per-recipient blocks, rather than guessing from prose.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split(/\n\s*\n/).flatMap(block => {
    const recipient = block.match(/^Final-Recipient:\s*[^;]+;\s*(.+)$/im)?.[1]?.trim();
    const status = block.match(/^Status:\s*([245]\.\d{1,3}\.\d{1,3})\s*$/im)?.[1];
    const action = block.match(/^Action:\s*(\S+)/im)?.[1]?.toLowerCase();
    if (!recipient || !validAddress(recipient) || !status || !['failed', 'delayed'].includes(action)) return [];
    const advice = status === '5.1.1' ? 'Invalid recipient. Stop sending; verify the address.'
      : /^.[.]7[.]/.test(status) ? 'Authentication or policy rejection. Check SPF, DKIM, DMARC and provider policy.'
      : status.endsWith('.2.2') ? 'Mailbox full. Wait; the provider may retry.'
      : status.startsWith('4.') ? 'Temporary failure. Provider may already be retrying; do not resend automatically.'
      : 'Permanent failure. Review the diagnostic before another send.';
    return [{ recipient: recipient.toLowerCase(), status, action, advice,
      diagnostic: block.match(/^Diagnostic-Code:\s*(.+)$/im)?.[1] || '' }];
  });
}
export function gmailMessage(raw) {
  const headers = raw.payload?.headers || [];
  const header = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  const bodies = [];
  let deliveryReport = false;
  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'message/delivery-status') deliveryReport = true;
    if (part.body?.data && ['text/plain', 'message/delivery-status'].includes(part.mimeType)) {
      bodies.push({ type: part.mimeType, text: Buffer.from(part.body.data, 'base64url').toString('utf8') });
    }
    for (const child of part.parts || []) walk(child);
  }
  walk(raw.payload);
  return { id: raw.id, sender: header('From'), subject: header('Subject') || '(No subject)',
    body: bodies.filter(b => b.type === 'text/plain').map(b => b.text).join('\n').slice(0, 30000) || raw.snippet || '',
    labels: raw.labelIds || [], listUnsubscribe: Boolean(header('List-Unsubscribe')),
    dsn: deliveryReport ? bodies.filter(b => b.type === 'message/delivery-status').map(b => b.text).join('\n') : '',
    date: Number(raw.internalDate) || Date.now() };
}
