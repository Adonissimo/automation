import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseDsn, gmailMessage, encrypt, decrypt, validAddress } from '../engine.js';
const config={protected:['friend@example.com'],blocked:['friend@example.com','junk@example.com']};
const message={sender:'Friend <friend@example.com>',subject:'Invoice',labels:['SPAM']};
test('protected senders override spam and blocking',()=>{
  assert.deepEqual(classify(message,config),{category:'Important',action:'label',reason:'Protected sender'});
});
test('newsletters are labeled, never trashed just for being newsletters',()=>{
  assert.equal(classify({...message,sender:'editor@example.com',labels:[],listUnsubscribe:true},config).action,'label');
});
test('only spam signals and explicit blocked senders trigger trash',()=>{
  assert.equal(classify({...message,sender:'junk@example.com',labels:[]},config).action,'trash');
  assert.equal(classify({...message,sender:'unknown@example.com'},config).action,'trash');
  assert.equal(classify({...message,sender:'unknown@example.com',subject:'Free money',labels:[]},config).action,'none');
});
test('bounce parser distinguishes permanent, temporary, full and authentication failures',()=>{
  for(const [status,advice] of [['5.1.1',/Invalid/],['4.4.1',/Temporary/],['5.2.2',/Mailbox full/],['5.7.26',/Authentication/]]) {
    const reports=parseDsn(`Final-Recipient: rfc822; PERSON@example.net\r\nAction: failed\r\nStatus: ${status}\r\nDiagnostic-Code: smtp; reason\r\n continued`);
    assert.equal(reports[0].recipient,'person@example.net');assert.match(reports[0].advice,advice);assert.match(reports[0].diagnostic,/continued/);
  }
});
test('bounce parser ignores prose and supports multiple recipients',()=>{
  assert.deepEqual(parseDsn('Subject: delivery failed\nContact user@example.com'),[]);
  const block='Final-Recipient: rfc822; user@example.com\nAction: failed\nStatus: 5.1.1';
  assert.equal(parseDsn(block+'\n\n'+block.replace('user@','other@')).length,2);
});
test('Gmail decoder requires delivery-status MIME and never renders email HTML',()=>{
  const raw={id:'1',payload:{headers:[{name:'Subject',value:'Delivery failed'}],mimeType:'text/html',body:{data:Buffer.from('<script>bad()</script>').toString('base64url')}}};
  assert.equal(gmailMessage(raw).dsn,'');assert.equal(gmailMessage(raw).body,'');
  raw.payload.parts=[{mimeType:'message/delivery-status',body:{data:Buffer.from('Final-Recipient: rfc822; x@example.com').toString('base64url')}}];
  assert.match(gmailMessage(raw).dsn,/Final-Recipient/);
});
test('tokens are authenticated and encrypted with unique nonces',()=>{
  const key='ab'.repeat(32);const encrypted=encrypt('secret refresh token',key);
  assert.equal(decrypt(encrypted,key),'secret refresh token');assert.notEqual(encrypted,encrypt('secret refresh token',key));
  assert.throws(()=>decrypt(encrypted,'cd'.repeat(32)));
});
test('recipient validation rejects header injection and address lists',()=>{
  assert.ok(validAddress('person@example.com'));
  for(const value of ['a@example.com\r\nBcc: b@example.com','a@example.com,b@example.com','Bad <a@example.com>'])assert.equal(validAddress(value),false);
});
