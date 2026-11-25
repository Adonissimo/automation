import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
test('demo workflow: preview, cleanup, restore, approval, idempotency and pause',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'inboxpilot-test-'));
  const port=32000+Math.floor(Math.random()*10000);const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),BASE_URL:base,DATA_DIR:directory,NODE_ENV:'test',APP_PASSWORD:'test-password',TOKEN_KEY:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);timer.unref();})]);
    const auth='Basic '+Buffer.from('admin:test-password').toString('base64');
    let csrf='';
    const request=async(path,data,headers={})=>{const response=await fetch(base+path,{method:data?'POST':'GET',headers:{Authorization:auth,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf,...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json()};};
    assert.equal((await fetch(base+'/api/state')).status,401);
    let result=await request('/api/state');assert.equal(result.data.source,'demo');assert.equal(result.data.messages.length,8);csrf=result.data.csrf;
    assert.equal((await request('/api/run',{}, {Origin:'https://attacker.example'})).status,403);
    assert.equal((await request('/api/run',{})).status,200);
    result=await request('/api/state');assert.ok(result.data.events.some(e=>e.action.startsWith('preview:')));assert.ok(result.data.messages.every(m=>m.state==='inbox'));
    const eventCount=result.data.events.length;await request('/api/run',{});assert.equal((await request('/api/state')).data.events.length,eventCount);
    await request('/api/settings',{shadow:false,junkCleanup:true});await request('/api/run',{});
    result=await request('/api/state');const junk=result.data.messages.find(m=>m.state==='trash');assert.ok(junk);assert.equal(junk.category,'Junk');
    await request('/api/restore',{id:junk.id});await request('/api/run',{});
    result=await request('/api/state');assert.equal(result.data.messages.find(m=>m.id===junk.id).category,'Important');
    const send={id:'test-send-12345',to:'person@example.com',subject:'Test',body:'Hello',confirmed:true};
    assert.equal((await request('/api/send',{...send,confirmed:false})).status,400);
    assert.equal((await request('/api/send',send)).status,200);assert.equal((await request('/api/send',send)).status,409);
    assert.equal((await request('/api/settings',{blocked:['invalid']})).status,400);
    await request('/api/settings',{paused:true});assert.equal((await request('/api/run',{})).status,409);
    assert.equal((await request('/api/send',{...send,id:'test-send-67890'})).status,409);
    const page=await fetch(base+'/',{headers:{Authorization:auth}});assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/InboxPilot/);
  } finally {child.kill();await once(child,'exit').catch(()=>{});rmSync(directory,{recursive:true,force:true});}
});
