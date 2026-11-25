// Test-only Google transport. Real application startup never imports this module.
globalThis.fetch = async function mockGoogle(url, options={}) {
  const parsed = new URL(url);
  if(parsed.hostname!=='gmail.googleapis.com') throw Error('Unexpected external request in test');
  const path=parsed.pathname.replace('/gmail/v1/users/me/','');
  const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  if(path==='messages') return response({messages:[...(parsed.searchParams.get('includeSpamTrash')==='true'?[{id:'spam-live'}]:[]),{id:'bounce-live'}]});
  if(path==='messages/spam-live') return response({id:'spam-live',labelIds:['SPAM'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'junk@example.com'},{name:'Subject',value:'Live spam fixture'}],body:{data:Buffer.from('Spam fixture').toString('base64url')}}});
  if(path==='messages/bounce-live') return response({id:'bounce-live',labelIds:['INBOX'],payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.com'},{name:'Subject',value:'Untrusted bounce fixture'}],parts:[{mimeType:'message/delivery-status',body:{data:Buffer.from('Final-Recipient: rfc822; valid@example.com\nAction: failed\nStatus: 5.1.1').toString('base64url')}}]}});
  if(path==='messages/spam-live/untrash') {await new Promise(resolve=>setTimeout(resolve,400));return response({id:'spam-live'});}
  if(path==='messages/spam-live/trash'||path==='messages/spam-live/modify') return response({id:'spam-live'});
  if(path==='labels') return response({labels:[{id:'important-label',name:'InboxPilot/Important'}]});
  if(path==='messages/send') throw Error('Simulated connection loss after send');
  throw Error('Unhandled Google request: '+path);
};
