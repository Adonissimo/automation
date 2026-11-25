import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openStore, defaults } from '../store.js';
import { encrypt } from '../engine.js';

test('mocked Gmail: spam inclusion, forged DSN isolation, restore lock and uncertain send protection',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'inboxpilot-gmail-'));
  const key='ab'.repeat(32);const store=openStore(directory);
  store.set('tokens',encrypt(JSON.stringify({access_token:'test-only',expires:Date.now()+3600000}),key));
  store.set('settings:gmail',{...defaults,shadow:false,junkCleanup:true});store.db.close();
  const base='http://127.0.0.1:'+(43000+Math.floor(Math.random()*5000));
  const child=spawn(process.execPath,['--import','./support/mock-google.js','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:new URL(base).port,BASE_URL:base,DATA_DIR:directory,NODE_ENV:'test',APP_PASSWORD:'test-password',TOKEN_KEY:key},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);timer.unref();})]);
    let csrf='';const auth='Basic '+Buffer.from('admin:test-password').toString('base64');
    const request=async(path,data)=>{const response=await fetch(base+'/api/'+path,{method:data?'POST':'GET',headers:{Authorization:auth,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},...(data?{body:JSON.stringify(data)}:{})});return{status:response.status,data:await response.json()};};
    csrf=(await request('state')).data.csrf;
    assert.equal((await request('run',{})).status,200);
    let state=(await request('state')).data;
    assert.equal(state.messages.find(m=>m.id==='spam-live').state,'trash');
    assert.equal(state.messages.find(m=>m.id==='bounce-live').reports[0].status,'5.1.1');
    assert.deepEqual(state.suppressed,[],'Untrusted inbound bounce must not automatically suppress a recipient');
    assert.equal((await request('suppress',{id:'bounce-live',recipient:'valid@example.com',confirmed:false})).status,400);
    assert.equal((await request('suppress',{id:'bounce-live',recipient:'valid@example.com',confirmed:true})).status,200);
    const send={id:'uncertain-send-123',to:'valid@example.com',subject:'Test',body:'Test',confirmed:true};
    assert.equal((await request('send',send)).status,409);
    assert.equal((await request('unsuppress',{recipient:send.to})).status,200);
    const restoration=request('restore',{id:'spam-live'});
    let locked=false;for(let i=0;i<20;i++){if((await request('state')).data.running){locked=true;break;}}
    assert.ok(locked,'Restore must hold the shared email-operation lock');
    assert.equal((await request('run',{})).status,409);
    assert.equal((await request('disconnect',{})).status,409);
    assert.equal((await restoration).status,200);
    await request('run',{});state=(await request('state')).data;
    assert.equal(state.messages.find(m=>m.id==='spam-live').category,'Important');
    assert.equal(state.messages.find(m=>m.id==='spam-live').state,'inbox');
    assert.equal((await request('send',send)).status,502);
    assert.equal((await request('send',send)).status,409,'An uncertain send must never be retried automatically');
  } finally {child.kill();await once(child,'exit').catch(()=>{});rmSync(directory,{recursive:true,force:true});}
});
