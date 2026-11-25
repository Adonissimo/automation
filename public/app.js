let state, view='inbox', category='All mail', query='', sendingId='';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = { inbox:'Inbox',review:'Needs attention',trash:'Trash',activity:'Activity log',settings:'Automation rules' };
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500);}
async function api(path,data){const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','X-CSRF-Token':state?.csrf || ''},...(data?{body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
async function refresh(){state=await api('state');render();}
function tag(value){return `<span class="tag ${escape(value.split(' ')[0])}">${escape(value)}</span>`;}
function date(value){return new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function render(){
  const inbox=state.messages.filter(m=>m.state!=='trash');
  $('inbox-count').textContent=inbox.length;
  $('review-count').textContent=inbox.filter(m=>m.category==='Junk'||m.category==='Delivery failure').length;
  $('trash-count').textContent=state.messages.filter(m=>m.state==='trash').length;
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  $('breadcrumb').textContent=names[view];
  $('title').textContent=({inbox:'A little less inbox.',review:'Give these a second look.',trash:'Out of the way. Still recoverable.',activity:'Every action, accounted for.',settings:'Your inbox. Your rules.'})[view];
  $('subtitle').textContent=({inbox:'Keep the important. Let your rules handle the rest.',review:'Delivery failures and junk candidates that deserve your attention.',trash:'Restore a message to protect its sender from future cleanup.',activity:'A record of decisions, changes, and approved sends.',settings:'Start with a preview. Enable changes when your rules are ready.'})[view];
  $('run').disabled=state.running||state.settings.paused;
  $('run').textContent=state.running?'Running…':'Run automation ↗';
  $('mode-pill').textContent=state.settings.paused?'Paused':state.settings.shadow?'Shadow mode':'Automation active';
  $('banner-title').textContent=state.settings.paused?'Your automation is paused.':state.settings.shadow?'Look first. Automate when you’re ready.':'Your rules are handling the routine.';
  $('banner-text').textContent=state.lastError|| (state.settings.paused?'Resume from Automation rules. No new background actions will start.':state.settings.shadow?'Shadow mode previews every decision without changing your inbox.':'Gmail sync runs every minute. Replies still require your approval.');
  $('mode-label').textContent=state.source==='demo'?'Demo workspace':'Gmail connected';
  $('mode-detail').textContent=state.source==='demo'?'Sample emails. No real mail changes.':'Private workspace. Your rules stay in control.';
  $('account-name').textContent=state.source==='demo'?'Portfolio demo':'Connected account';
  $('account-email').textContent=state.source==='demo'?'Explore before connecting':state.email;
  $('connection').textContent=state.source==='demo'?'Connect Gmail ↗':'Disconnect Gmail';
  $('sync-status').textContent=state.source==='demo'?'Demo data · stored locally':state.lastSync?'Last synced '+new Date(state.lastSync).toLocaleString():'Connected · awaiting first sync';
  if(view==='settings')return renderSettings();
  if(view==='activity')return renderActivity();
  $('content').innerHTML=`<div class="toolbar"><div class="tabs">${['All mail','Important','Newsletter','Finance','Junk'].map(c=>`<button class="tab ${category===c?'selected':''}" data-category="${c}">${c}</button>`).join('')}</div><input id="search" class="search" type="search" aria-label="Search messages" placeholder="Search your inbox" value="${escape(query)}"></div><div id="message-list"></div>`;
  document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;render();});
  $('search').oninput=event=>{query=event.target.value;renderMessages();};
  renderMessages();
}
function renderMessages(){
  const messages=state.messages.filter(m=>(view==='trash'?m.state==='trash':m.state!=='trash')&&(view!=='review'||['Junk','Delivery failure'].includes(m.category))&&(category==='All mail'||m.category===category)&&`${m.sender} ${m.subject} ${m.body}`.toLowerCase().includes(query.toLowerCase()));
  if(!messages.length){$('message-list').innerHTML='<div class="empty"><strong>Nothing here right now.</strong>Run automation or try a different filter.</div>';return;}
  $('message-list').innerHTML=`<div class="table-wrap"><table><thead><tr><th scope="col">From</th><th scope="col">Message</th><th scope="col">Category</th><th scope="col">Received</th></tr></thead><tbody>${messages.map(m=>{const name=m.sender.split('<')[0].trim();return `<tr><td><div class="sender-cell"><span class="avatar">${escape(name.slice(0,2).toUpperCase())}</span><span class="sender-name">${escape(name)}</span></div></td><td><button class="subject-button" data-message="${escape(m.id)}">${escape(m.subject)}</button><span class="preview">${escape(m.body)}</span></td><td>${tag(m.category)}</td><td class="time">${escape(date(m.date))}</td></tr>`;}).join('')}</tbody></table></div><p class="table-note">${messages.length} messages · ${state.source==='demo'?'Illustrative demo emails':'Latest synced messages'} · Open a message to review actions</p>`;
  document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>openMessage(b.dataset.message));
}
function openMessage(id){
  const m=state.messages.find(m=>m.id===id);
  $('message-content').innerHTML=`${tag(m.category)}<h2>${escape(m.subject)}</h2><p class="muted">${escape(m.sender)}</p><div class="message-body">${escape(m.body)}</div>${m.reason?`<p class="muted">Rule: ${escape(m.reason)}</p>`:''}${(m.reports||[]).map(r=>`<div class="report"><strong>${escape(r.recipient)} · ${escape(r.status)}</strong><p>${escape(r.advice)}</p><p>${escape(r.diagnostic)}</p></div>`).join('')}<div class="message-actions">${m.state==='trash'?'<button id="restore" class="button primary">Restore & protect sender</button>':'<button id="draft" class="button primary">Draft a reply</button>'}</div>`;
  for (const report of m.reports || []) if (report.status==='5.1.1' && report.action==='failed') {
    const button=document.createElement('button');button.className='button';button.textContent='Suppress '+report.recipient;
    button.onclick=()=>{if(confirm('Block future sends from this app to '+report.recipient+'? Bounce reports can be forged. Approve only after checking the address.'))perform(async()=>{await api('suppress',{id,recipient:report.recipient,confirmed:true});$('message-dialog').close();toast(state.source==='demo'?'Demo suppression recorded.':'Recipient suppressed. Manage under Automation rules.');});};
    $('message-content').querySelector('.message-actions').append(button);
  }
  if(m.state==='trash')$('restore').onclick=()=>perform(async()=>{await api('restore',{id});$('message-dialog').close();toast('Message restored. Sender protected.');});
  else $('draft').onclick=()=>{ $('message-dialog').close();const form=$('compose-form');form.reset();form.elements.to.value=(m.sender.match(/<([^>]+)>/)?.[1]||m.sender).trim();form.elements.subject.value='Re: '+m.subject;form.elements.body.value='';sendingId=crypto.randomUUID();$('send-note').textContent=state.source==='demo'?'Demo: sending is simulated. No email will leave this app.':'This sends a real email through your connected Gmail account. Check all details.';$('send-button').disabled=false;$('compose-dialog').showModal();};
  $('message-dialog').showModal();
}
function renderActivity(){
  $('content').innerHTML=state.events.length?state.events.map(e=>`<article class="activity-item"><div>${tag(e.action)}</div><div><strong>${escape(e.subject)}</strong><p>${escape(e.detail)}</p></div><span class="time">${escape(new Date(e.time).toLocaleString())}</span></article>`).join(''):'<div class="empty"><strong>Your activity starts here.</strong>Run automation to see how your rules handle each email.</div>';
}
function renderSettings(){
  const s=state.settings;
  $('content').innerHTML=`<div class="rules">${[['paused','Pause automation','Stop new background runs. A run already in progress will finish.'],['shadow','Shadow mode','Preview labels, cleanup and bounce decisions without changing Gmail.'],['junkCleanup','Clean up junk','Move Gmail-classified spam and blocked senders to Trash. Gmail normally deletes Trash after 30 days.']].map(([key,title,description])=>`<div class="rule-row"><div><h2>${title}</h2><p>${description}</p></div><input class="switch" type="checkbox" role="switch" aria-label="${title}" data-setting="${key}" ${s[key]?'checked':''}></div>`).join('')}<form id="rules-form" class="settings-form"><label>Protected senders<input name="protected" placeholder="person@example.com, billing@example.com" value="${escape(s.protected.join(', '))}"></label><p class="muted">Protected senders always take priority over blocked rules and spam signals.</p><label>Blocked senders<input name="blocked" placeholder="unwanted@example.com" value="${escape(s.blocked.join(', '))}"></label><p class="muted">Exact addresses only. Blocking moves matching messages to Trash when cleanup is active; it does not change Gmail’s native block list.</p><button class="button primary">Save sender rules</button></form><div class="rule-row"><div><h2>Sending & delivery failures</h2><p>Replies require approval. Permanent invalid addresses are flagged; recipient suppression requires approval. Temporary failures are never resent automatically.</p></div></div>${state.suppressed.length?'<h2>Suppressed recipients</h2>'+state.suppressed.map(r=>`<p class="muted">${escape(r.recipient)} · ${escape(r.reason)}</p>`).join(''):''}</div>`;
  document.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>perform(async()=>{await api('settings',{[el.dataset.setting]:el.checked});toast('Automation rule saved.');}));
  if(state.suppressed.length) {
    const section=document.createElement('section');section.setAttribute('aria-label','Remove recipient suppression');
    for(const recipient of state.suppressed) {
      const button=document.createElement('button');button.className='button';button.textContent='Unsuppress '+recipient.recipient;
      button.onclick=()=>perform(async()=>{await api('unsuppress',{recipient:recipient.recipient});toast('Recipient suppression removed.');});
      section.append(button);
    }
    $('content').querySelector('.rules').append(section);
  }
  $('rules-form').onsubmit=event=>{event.preventDefault();perform(async()=>{const data={};for(const name of ['protected','blocked'])data[name]=event.target.elements[name].value.split(',').map(s=>s.trim()).filter(Boolean);await api('settings',data);toast('Sender rules saved.');});};
}
async function perform(fn){try{await fn();await refresh();}catch(error){toast(error.message,true);await refresh().catch(()=>{});}}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;category='All mail';query='';render();});
$('run').onclick=()=>perform(async()=>{ $('run').disabled=true;$('run').textContent='Running…';await api('run',{});toast(state.source==='demo'?'Demo run complete. Review the decisions below.':'Automation run complete.'); });
$('connection').onclick=()=>{
  if(state.source==='gmail'){if(confirm('Disconnect Gmail and erase its locally stored messages and tokens? Revoke access in your Google Account too.'))perform(async()=>{await api('disconnect',{});toast('Gmail disconnected.');});}
  else if(state.configured)location.href='/auth/google';
  else toast('Gmail setup needed. Follow README.md: add OAuth credentials, TOKEN_KEY and APP_PASSWORD, then restart.',true);
};
$('close-message').onclick=()=>$('message-dialog').close();
$('close-compose').onclick=()=>$('compose-dialog').close();
$('compose-form').onsubmit=event=>{event.preventDefault();const form=event.target;perform(async()=>{ $('send-button').disabled=true;try{await api('send',{id:sendingId,to:form.elements.to.value.trim(),subject:form.elements.subject.value,body:form.elements.body.value,confirmed:form.elements.confirmed.checked});$('compose-dialog').close();toast(state.source==='demo'?'Demo send recorded. No real email was sent.':'Email sent.');}finally{$('send-button').disabled=false;}});};
refresh().catch(error=>{$('content').textContent='Could not load the workspace. Reload the page to try again.';toast(error.message,true);});
