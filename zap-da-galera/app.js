/* Zap da Galera — app do navegador (Supabase). */
{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS=['#22c55e','#f59e0b','#3b82f6','#ec4899','#a78bfa','#14b8a6','#ef4444','#eab308','#06b6d4','#f97316'];
const AVS=['😎','🦊','👑','🐸','🐼','🔥','⚽','🎮','🐯','🤠','👽','🦁','🐺','🤖','🍕','🎧','🃏','👀','🦈','🐵'];
const GEMO=['👥','🔥','⚽','🎮','🍕','🎉','💀','😂','🏖️','📚','💈','🚗'];
const REACT=['👍','❤️','😂','😮','😢','🙏'];
const KB='😀 😂 🤣 😅 😊 😍 😘 😎 🤔 😴 😭 😡 🥶 🤯 🥳 😏 🙄 😬 🤡 💀 👍 👎 👏 🙌 🙏 💪 🤝 ✌️ 🤙 👀 ❤️ 💜 🔥 ✨ 💯 ⚽ 🎮 🍕 🍔 🍻 🎉 🚗 🏆 📸 💈 ✅ ❌'.split(' ');
const RAIN=['🎉','😂','💀','🔥','⚽','💸','🍕','❤️','🤡','🌈','⭐','🍺'];
const ACC=['roxo','azul','verde','laranja','rosa'],ACCC={roxo:'#7c5cff',azul:'#3b82f6',verde:'#22c55e',laranja:'#f97316',rosa:'#ec4899'};
const PAGE=200;
let sb=null,DOMAIN='users.aifriends.local',me=null,live=null,started=false;
const S={people:{},chats:[],cur:null,msgs:[],reads:{},my:{},peers:{},reply:null,edit:null,q:'',seen:new Set(),blocks:new Set(),more:false,urls:{}};
const rooms={};
let typingT=null,typingOn=false,readT=null,menuId=null,chatsT=null,rec=null;

try{const a=localStorage.getItem('zap-accent');if(a)document.documentElement.dataset.accent=a}catch(e){}

const toast=t=>{const el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),2800)};
const errMsg=(e,f)=>{const m=String(e?.message||'');return /JWT|token/i.test(m)?'Sua sessão expirou. Entre de novo.':(m&&!/fetch|network|schema|function/i.test(m)&&m.length<120?m:f)};
const ms=t=>t?Date.parse(t):0;
const okPhoto=s=>typeof s==='string'&&s.length<250000&&/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(s);
const face=(emoji,photo)=>okPhoto(photo)?`<img src="${photo}" alt="">`:esc(emoji);
const person=id=>S.people[id]||{emoji:'🙂',color:'#64748b'};
const nameOf=id=>id===me?'Você':(person(id).nick||person(id).username||'Alguém');
const chat=id=>S.chats.find(c=>c.id===id);
const others=c=>c.members.filter(x=>x!==me);
const canAdmin=c=>!!c&&(!c.group||c.admins.includes(me));
const hm=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const dayKey=t=>new Date(t).toDateString();
const dur=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function dayLabel(t){const d=new Date(t),n=new Date(),y=new Date(Date.now()-864e5);
 if(d.toDateString()===n.toDateString())return'Hoje';if(d.toDateString()===y.toDateString())return'Ontem';
 return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:d.getFullYear()===n.getFullYear()?undefined:'numeric'})}
function listTime(t){if(!t)return'';const d=new Date(t);if(d.toDateString()===new Date().toDateString())return hm(t);
 return dayLabel(t)==='Ontem'?'Ontem':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function chatLook(c){
 if(c.group)return{emoji:c.emoji||'👥',color:'rgb(var(--accent))',name:c.name||'Grupo'};
 const o=others(c)[0];if(!o)return{emoji:'👻',color:'#64748b',name:'Conversa vazia'};
 const p=person(o);return{emoji:p.emoji,photo:p.photo,color:p.color,name:nameOf(o),uid:o};
}
function online(){const s=new Set();for(const l of Object.values(S.peers))for(const p of l)if(p.uid&&p.uid!==me)s.add(p.uid);return s}
function typers(cid){const s=new Set();for(const p of S.peers[cid]||[])if(p.uid&&p.uid!==me&&p.typing&&Date.now()-(p.tt||0)<8000)s.add(p.uid);return[...s]}
function fmt(t){let h=esc(t);
 h=h.replace(/https?:\/\/[^\s<]+/g,u=>/^https:/.test(u)?`<a href="${u}" target="_blank" rel="noopener">${u}</a>`:u);
 return h.replace(/(^|\s)@([\wÀ-ÿ]+)/g,(m,a,b)=>`${a}<span class="mn">@${b}</span>`)}
const preview=m=>m.del?'🚫 Mensagem apagada':(m.text||(m.media?.type==='image'?'📷 Foto':m.media?.type==='audio'?'🎤 Áudio':''));

/* ---------- login ---------- */
let mode='in';
$('#authForm').querySelector('.tabs').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;mode=b.dataset.mode;
 document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
 $('#aGo').textContent=mode==='in'?'Entrar':'Criar conta';$('#aPass').autocomplete=mode==='in'?'current-password':'new-password';$('#aErr').textContent=''};
$('#authForm').onsubmit=async e=>{e.preventDefault();if(!sb)return $('#aErr').textContent='O site ainda está conectando…';
 const u=$('#aUser').value.trim().toLowerCase(),p=$('#aPass').value;$('#aErr').textContent='';
 if(!/^[a-z0-9_]{2,20}$/.test(u))return $('#aErr').textContent='Usuário: 2 a 20 letras minúsculas, números ou _';
 if(p.length<8)return $('#aErr').textContent='A senha precisa ter pelo menos 8 caracteres.';
 const go=$('#aGo');go.disabled=true;go.textContent=mode==='in'?'Entrando…':'Criando…';
 try{
  if(mode==='up'){const r=await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
   const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Não deu pra criar a conta.')}
  const{error}=await sb.auth.signInWithPassword({email:u+'@'+DOMAIN,password:p});
  if(error)throw new Error(mode==='in'?'Usuário ou senha incorretos.':'Conta criada, mas não consegui entrar. Tente em Entrar.');
 }catch(er){$('#aErr').textContent=er.message}
 go.disabled=false;go.textContent=mode==='in'?'Entrar':'Criar conta'};

/* ---------- dados ---------- */
async function loadPeople(ids,force){
 const need=[...new Set(ids)].filter(id=>id&&(force||!S.people[id]));if(!need.length)return false;
 const{data}=await sb.from('zap_profiles').select('id,username,nick,emoji,color,about,photo,code,seen').in('id',need);
 (data||[]).forEach(p=>S.people[p.id]=p);return!!(data&&data.length)}
async function loadChats(){
 const{data:mine,error}=await sb.from('zap_members').select('chat_id,last_read_at,muted').eq('user_id',me);
 if(error)throw error;
 const ids=mine.map(r=>r.chat_id);S.my={};const muted={};mine.forEach(r=>{S.my[r.chat_id]=ms(r.last_read_at);muted[r.chat_id]=r.muted});
 if(!ids.length){S.chats=[];syncRooms();renderList();return}
 const[{data:cs},{data:mem}]=await Promise.all([sb.from('zap_chats').select('*').in('id',ids),sb.from('zap_members').select('chat_id,user_id,role,last_read_at').in('chat_id',ids)]);
 S.chats=(cs||[]).map(c=>{const ms_=(mem||[]).filter(m=>m.chat_id===c.id);
  return{id:c.id,group:c.is_group,name:c.name,emoji:c.emoji,code:c.code,pinned:c.pinned_id,muted:!!muted[c.id],members:ms_.map(m=>m.user_id),admins:ms_.filter(m=>m.role==='admin').map(m=>m.user_id),
   readsAll:Object.fromEntries(ms_.map(m=>[m.user_id,ms(m.last_read_at)])),lastAt:ms(c.last_at),last:c.last_text!=null?{by:c.last_by,text:c.last_text}:null}});
 await loadPeople(S.chats.flatMap(c=>c.members));
 if(S.cur){const c=chat(S.cur);if(c){S.reads=c.readsAll;loadPinned()}else{closeChat();toast('Você não está mais nessa conversa.')}}
 syncRooms();renderList();renderHead();renderMsgs(false);
}
async function loadBlocks(){const{data}=await sb.from('zap_blocks').select('blocked_id');S.blocks=new Set((data||[]).map(r=>r.blocked_id))}
const refreshChats=()=>{clearTimeout(chatsT);chatsT=setTimeout(()=>loadChats().catch(()=>{}),250)};
const toMsg=r=>({id:r.id,by:r.user_id,text:r.text,at:ms(r.created_at),reply:r.reply,react:r.reactions||{},del:r.deleted,sys:r.sys,media:r.media,event:r.event,edited:r.edited});

/* ---------- fotos e áudios ---------- */
async function hydrateMedia(){
 const els=[...document.querySelectorAll('[data-path]:not([data-ok])')];if(!els.length)return;
 const now=Date.now(),need=[...new Set(els.map(e=>e.dataset.path))].filter(p=>!(S.urls[p]&&S.urls[p].exp>now));
 if(need.length){const{data}=await sb.storage.from('zap-media').createSignedUrls(need,3600);
  (data||[]).forEach(d=>{if(d.signedUrl)S.urls[d.path]={url:d.signedUrl,exp:now+3300e3}})}
 for(const e of els){const u=S.urls[e.dataset.path];if(!u)continue;e.dataset.ok='1';e.src=u.url}
}
function resize(file,max=1600){return new Promise((ok,no)=>{const u=URL.createObjectURL(file),im=new Image();
 im.onload=()=>{let w=im.naturalWidth,h=im.naturalHeight;const k=Math.min(1,max/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);URL.revokeObjectURL(u);
  c.toBlob(b=>b?ok({blob:b,w,h}):no(),'image/jpeg',.82)};im.onerror=()=>{URL.revokeObjectURL(u);no()};im.src=u})}
async function upload(cid,blob,ext,type){
 const path=cid+'/'+me+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)+'.'+ext;
 const{error}=await sb.storage.from('zap-media').upload(path,blob,{contentType:type,upsert:false});
 if(error)throw new Error(/size|large/i.test(error.message)?'Arquivo grande demais (máx. 10 MB).':'Não consegui enviar o arquivo.');
 return path;
}
async function sendPhoto(file){
 const c=chat(S.cur);if(!c||!file)return;if(!/^image\//.test(file.type))return toast('Escolha uma imagem.');
 toast('Enviando foto…');
 try{const{blob,w,h}=await resize(file);const path=await upload(c.id,blob,'jpg','image/jpeg');
  const cap=$('#tx').value.trim();$('#tx').value='';grow();
  await sendRaw(cap,{type:'image',path,w,h});
 }catch(e){toast(e.message||'Não consegui enviar a foto.')}
}
async function startRec(){
 if(rec)return;if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Seu navegador não grava áudio.');
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){return toast('Libere o microfone pra gravar áudio.')}
 const type=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/aac'].find(t=>MediaRecorder.isTypeSupported(t))||'';
 const mr=new MediaRecorder(stream,type?{mimeType:type}:{});const chunks=[];const t0=Date.now();
 rec={mr,stream,chunks,t0,cancel:false,timer:setInterval(()=>{const el=$('#recT');if(el)el.textContent=dur((Date.now()-t0)/1000);if(Date.now()-t0>180000)stopRec(true)},250)};
 mr.ondataavailable=e=>e.data.size&&chunks.push(e.data);
 mr.onstop=async()=>{const r=rec;rec=null;clearInterval(r.timer);r.stream.getTracks().forEach(t=>t.stop());renderComposer();
  if(r.cancel)return;const secs=(Date.now()-r.t0)/1000;if(secs<0.8)return toast('Áudio muito curto.');
  const base=(mr.mimeType||type||'audio/webm').split(';')[0];const ext=base.includes('mp4')?'m4a':base.includes('aac')?'aac':'webm';
  const blob=new Blob(r.chunks,{type:base});toast('Enviando áudio…');
  try{const path=await upload(S.cur,blob,ext,base);await sendRaw('',{type:'audio',path,dur:Math.round(secs)})}catch(e){toast(e.message||'Não consegui enviar o áudio.')}};
 mr.start();renderComposer();
}
function stopRec(send){if(!rec)return;rec.cancel=!send;rec.mr.stop()}

/* ---------- lista ---------- */
function renderList(){
 const el=$('#list'),on=online(),q=S.q.toLowerCase();
 let cs=[...S.chats].sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
 if(q)cs=cs.filter(c=>chatLook(c).name.toLowerCase().includes(q));
 let h=cs.map(c=>{const L=chatLook(c),ty=typers(c.id),unread=(c.lastAt||0)>(S.my[c.id]||0)&&c.last&&c.last.by!==me;
  const sub=ty.length?`<small class="ty">${esc(c.group?nameOf(ty[0])+' está digitando…':'digitando…')}</small>`
   :`<small>${c.last?esc((c.last.by===me?'Você: ':c.group?nameOf(c.last.by)+': ':'')+c.last.text):'<i>Nenhuma mensagem ainda</i>'}</small>`;
  return`<button class="row${c.id===S.cur?' on':''}" data-c="${esc(c.id)}"><span class="av" style="--c:${esc(L.color)}">${face(L.emoji,L.photo)}${L.uid&&on.has(L.uid)?'<i class="dot"></i>':''}</span>
  <span class="rt"><b>${esc(L.name)}</b>${sub}</span><span class="rm${unread?' new':''}">${esc(listTime(c.lastAt))}${c.muted?'<span title="Silenciado">🔕</span>':''}${unread?'<span class="badge">nova</span>':''}</span></button>`}).join('');
 if(!cs.length)h+=`<div class="hint">${q?'Nenhuma conversa com esse nome.':'👋 Nenhuma conversa ainda.<br><br>• Toque em <b>🔑</b> e cole o código de um grupo ou de um amigo.<br>• Ou toque em <b>✏️</b> pra criar um grupo e mandar o código pra galera.'}</div>`;
 el.innerHTML=h;
}

/* ---------- conversa ---------- */
function closeChat(){S.cur=null;S.msgs=[];S.reply=S.edit=null;stopRec(false);document.body.classList.remove('open');setTyping(false);
 $('#main').innerHTML='<div class="empty"><div><div class="big">💬</div><h2>Só a galera aqui</h2><p>Escolha uma conversa ou toque em ✏️ pra começar uma nova.<br>Sem IA nenhuma: só vocês.</p></div></div>'}
async function openChat(id){
 if(S.cur===id){document.body.classList.add('open');return}
 const c=chat(id);if(!c)return;setTyping(false);stopRec(false);
 S.cur=id;S.msgs=[];S.reads=c.readsAll||{};S.reply=S.edit=null;S.seen=new Set();S.more=false;S.pinnedMsg=null;
 $('#main').innerHTML=`<div class="top"><button class="ib back" id="back" aria-label="Voltar">←</button><span class="av sm" id="hAv"></span>
  <button class="who" id="who"><b id="hName"></b><small id="hSub"></small></button>
  <button class="ib" id="callA" aria-label="Chamada de voz" title="Chamada de voz">📞</button>
  <button class="ib" id="callV" aria-label="Chamada de vídeo" title="Chamada de vídeo">📹</button>
  <button class="ib" id="fxBtn" aria-label="Soltar evento" title="Soltar evento" hidden>✨</button>
  <button class="ib" id="findBtn" aria-label="Pesquisar na conversa" title="Pesquisar na conversa">🔍</button>
  <button class="ib" id="info" aria-label="Detalhes">⋮</button></div>
  <div id="pin"></div>
  <div class="msgs" id="msgs"><div class="sys">Carregando mensagens…</div></div>
  <div class="compose" id="compose"></div>`;
 document.body.classList.add('open');renderComposer();renderHead();renderList();loadPinned();
 const{data,error}=await sb.from('zap_messages').select('*').eq('chat_id',id).order('created_at',{ascending:false}).limit(PAGE);
 if(S.cur!==id)return;
 if(error){$('#msgs').innerHTML='<div class="sys">Não consegui carregar as mensagens.</div>';return}
 S.more=data.length===PAGE;S.msgs=data.map(toMsg).reverse();await loadPeople(S.msgs.map(m=>m.by));renderMsgs(true);markRead();
 setTimeout(()=>matchMedia('(min-width:761px)').matches&&$('#tx')?.focus(),50);
}
async function loadOlder(){
 const c=chat(S.cur);if(!c||!S.msgs.length)return;const first=S.msgs[0];
 const{data,error}=await sb.from('zap_messages').select('*').eq('chat_id',c.id).lt('created_at',new Date(first.at).toISOString()).order('created_at',{ascending:false}).limit(PAGE);
 if(error||S.cur!==c.id)return toast('Não consegui carregar.');
 const el=$('#msgs'),h0=el.scrollHeight;S.more=data.length===PAGE;
 data.forEach(r=>S.seen.add(r.id));S.msgs=[...data.map(toMsg).reverse(),...S.msgs];await loadPeople(S.msgs.map(m=>m.by));
 renderMsgs(false);el.scrollTop=el.scrollHeight-h0;
}
async function loadPinned(){
 const c=chat(S.cur),box=$('#pin');if(!box)return;if(!c||!c.pinned){box.innerHTML='';S.pinnedMsg=null;return}
 let m=S.msgs.find(x=>x.id===c.pinned);
 if(!m){const{data}=await sb.from('zap_messages').select('*').eq('id',c.pinned).maybeSingle();if(data)m=toMsg(data)}
 S.pinnedMsg=m||null;if(S.cur!==c.id)return;
 box.innerHTML=m&&!m.del?`<button class="pinbar" id="pinGo"><span>📌</span><span class="rt"><b>Mensagem fixada · ${esc(nameOf(m.by))}</b><small>${esc(preview(m))}</small></span></button>`:'';
}
function renderHead(){renderCall&&inCall()&&renderCall();
 const c=chat(S.cur);if(!c||!$('#hName'))return;const L=chatLook(c),ty=typers(c.id),on=online();
 const av=$('#hAv');av.innerHTML=face(L.emoji,L.photo);av.style.setProperty('--c',L.color);
 $('#hName').textContent=L.name+(c.muted?' 🔕':'');const sub=$('#hSub');sub.className='';
 $('#fxBtn').hidden=!canAdmin(c);
 const blk=!c.group&&others(c).some(o=>S.blocks.has(o))||!others(c).length;$('#callA').hidden=$('#callV').hidden=blk;
 if(L.uid&&S.blocks.has(L.uid)){sub.textContent='🚫 Você bloqueou essa pessoa'}
 else if(ty.length){sub.className='ty';sub.textContent=c.group?ty.map(nameOf).join(', ')+' digitando…':'digitando…'}
 else if(c.group)sub.textContent=[me,...others(c)].map(nameOf).join(', ');
 else if(L.uid&&on.has(L.uid))sub.textContent='online';
 else if(L.uid&&person(L.uid).seen){const t=ms(person(L.uid).seen);sub.textContent='visto por último '+dayLabel(t).toLowerCase()+' às '+hm(t)}
 else sub.textContent='';
}
const isNear=()=>{const m=$('#msgs');return!m||m.scrollHeight-m.scrollTop-m.clientHeight<120};
function tick(m,c){
 if(m._p)return'<span class="tick">🕓</span>';
 const os=others(c);if(!os.length)return'<span class="tick">✓</span>';
 const r=os.filter(o=>(S.reads[o]||0)>=m.at).length;
 return r===os.length?'<span class="tick read">✓✓</span>':r?'<span class="tick">✓✓</span>':'<span class="tick">✓</span>';
}
function mediaHTML(m){
 if(!m.media||m.del)return'';
 if(m.media.type==='image'){const w=m.media.w||4,h=m.media.h||3;
  return`<img class="pic" data-path="${esc(m.media.path)}" alt="Foto" style="aspect-ratio:${w}/${h}" loading="lazy">`}
 if(m.media.type==='audio')return`<div class="aud"><span>🎤</span><audio controls preload="none" data-path="${esc(m.media.path)}"></audio><small>${esc(dur(m.media.dur))}</small></div>`;
 return'';
}
function renderMsgs(stick){
 const el=$('#msgs'),c=chat(S.cur);if(!el||!c)return;
 const top=el.scrollTop;let h='',prev=null,lastDay='';
 if(S.more)h+=`<button class="older" id="older">⬆️ Carregar mensagens anteriores</button>`;
 if(!S.msgs.length)h+=`<div class="sys">Mande a primeira mensagem 👋</div>`;
 for(const m of S.msgs){
  if(dayKey(m.at)!==lastDay){lastDay=dayKey(m.at);h+=`<div class="day">${esc(dayLabel(m.at))}</div>`;prev=null}
  if(m.sys){h+=`<div class="sys${m.event?' ev':''}" id="m-${esc(m.id)}">${esc(nameOf(m.by))} ${esc(m.text)}${m.event?(m.event.call?(Date.now()-m.at<3*3600e3&&m.by!==me?` <button class="replay" data-join="${esc(m.id)}">Entrar</button>`:''):` <button class="replay" data-fx="${esc(m.id)}">▶️ Ver</button>`):''}</div>`;prev=null;continue}
  const mine=m.by===me,p=person(m.by),first=!prev||prev.by!==m.by||m.at-prev.at>3e5;
  let body='';
  if(c.group&&!mine&&first)body+=`<div class="nm" data-pv="${esc(m.by)}" title="Conversar no privado" style="--c:${esc(p.color)};cursor:pointer">${esc(nameOf(m.by))}</div>`;
  if(m.reply&&!m.del){const rp=person(m.reply.by);body+=`<div class="q" data-jump="${esc(m.reply.id)}" style="--c:${esc(rp.color)}"><b>${esc(nameOf(m.reply.by))}</b><span>${esc(m.reply.text)}</span></div>`}
  body+=mediaHTML(m);
  if(m.del)body+='<div class="tx del">🚫 Mensagem apagada</div>';else if(m.text)body+=`<div class="tx">${fmt(m.text)}</div>`;
  body+=`<div class="meta">${m.edited&&!m.del?'<i>editada</i>':''}${c.pinned===m.id?'📌':''}${esc(hm(m.at))}${mine&&!m.del?tick(m,c):''}</div>`;
  const rx={};for(const[u,e]of Object.entries(m.react||{}))if(e)(rx[e]=rx[e]||[]).push(u);
  const rxh=Object.entries(rx).map(([e,us])=>`<button data-rx="${esc(e)}" data-m="${esc(m.id)}" class="${us.includes(me)?'mine':''}" title="${esc(us.map(nameOf).join(', '))}">${esc(e)} ${us.length>1?us.length:''}</button>`).join('');
  const nw=S.seen.size&&!S.seen.has(m.id);
  h+=`<div class="m${nw?' nw':''}${mine?' me':''}${first?' first':''}${first&&prev?' gap':''}${m.media?.type==='image'&&!m.del?' hasPic':''}" id="m-${esc(m.id)}"><span class="av sm" ${c.group&&!mine?`data-pv="${esc(m.by)}" title="Conversar no privado" style="--c:${esc(p.color)};cursor:pointer"`:`style="--c:${esc(p.color)}"`}>${face(p.emoji,p.photo)}</span>
   <div><div class="b" data-m="${esc(m.id)}" tabindex="0">${body}</div>${rxh?`<div class="rx">${rxh}</div>`:''}</div></div>`;
  prev=m;
 }
 el.innerHTML=h;S.msgs.forEach(m=>S.seen.add(m.id));if(!S.seen.size)S.seen.add('_');
 if(stick)el.scrollTop=el.scrollHeight;else el.scrollTop=top;
 hydrateMedia().catch(()=>{});
 el.querySelectorAll('img.pic').forEach(i=>i.addEventListener('load',()=>{if(stick)el.scrollTop=el.scrollHeight},{once:true}));
}
function renderComposer(){
 const box=$('#compose');if(!box)return;const c=chat(S.cur);
 const blocked=c&&!c.group&&others(c).some(o=>S.blocks.has(o));
 if(blocked){box.innerHTML='<div class="blockedbar">🚫 Você bloqueou essa pessoa. Desbloqueie no ⋮ pra conversar.</div>';return}
 if(rec){box.innerHTML=`<div class="cb recbar"><button class="ib" id="recX" aria-label="Cancelar áudio">🗑️</button><span class="recdot"></span><b id="recT">0:00</b><span class="rt"><small>Gravando… toque em ➤ pra mandar</small></span><button class="send" id="recOk" aria-label="Mandar áudio">➤</button></div>`;return}
 const keep=$('#tx')?.value||'';
 let top='';
 if(S.edit){top=`<div class="rep"><div class="q" style="--c:rgb(var(--accent))"><b>✏️ Editando mensagem</b><span>${esc(S.edit.text)}</span></div><button class="ib" id="noRep" aria-label="Cancelar edição">✕</button></div>`}
 else if(S.reply){const p=person(S.reply.by);top=`<div class="rep"><div class="q" style="--c:${esc(p.color)}"><b>${esc(nameOf(S.reply.by))}</b><span>${esc(S.reply.text)}</span></div><button class="ib" id="noRep" aria-label="Cancelar resposta">✕</button></div>`}
 box.innerHTML=`${top}<div class="emo" id="emo">${KB.map(e=>`<button data-e="${e}">${e}</button>`).join('')}</div>
  <div class="cb"><button class="ib" id="emoBtn" aria-label="Emojis">😊</button><label class="ib" id="clip" aria-label="Mandar foto" title="Mandar foto">📎<input type="file" id="pick" accept="image/*" hidden></label>
  <textarea id="tx" rows="1" placeholder="Mensagem" aria-label="Mensagem"></textarea>
  <button class="send" id="sendBtn" aria-label="Enviar">🎤</button></div>`;
 const tx=$('#tx');tx.value=S.edit&&!keep?S.edit.text:keep;grow();
}
function markRead(){
 clearTimeout(readT);readT=setTimeout(async()=>{
  const c=chat(S.cur);if(!c||document.hidden)return;
  if((S.my[c.id]||0)>=(c.lastAt||0))return;
  S.my[c.id]=c.lastAt;renderList();try{await sb.rpc('zap_read',{cid:c.id})}catch(e){}
 },500);
}
async function sendRaw(text,media){
 const c=chat(S.cur);if(!c)return;const reply=S.reply;S.reply=null;renderComposer();
 const tmp={id:'tmp'+Date.now(),by:me,text,at:Date.now(),reply:reply&&{id:reply.id,by:reply.by,text:reply.text},react:{},del:false,_p:true,media:null};
 S.msgs.push(tmp);renderMsgs(true);
 const{data,error}=await sb.rpc('zap_send',{cid:c.id,p_text:text,p_reply:reply?.id||null,p_media:media||null});
 S.msgs=S.msgs.filter(m=>m!==tmp);
 if(error){renderMsgs(true);if(!media&&$('#tx')){$('#tx').value=text;grow()}return toast(errMsg(error,'Não consegui enviar. Tenta de novo.'))}
 const m=toMsg(data);if(!S.msgs.some(x=>x.id===m.id))S.msgs.push(m);
 c.last={by:me,text:preview(m).slice(0,140)};c.lastAt=m.at;S.my[c.id]=m.at;renderMsgs(true);renderList();
}
async function send(){
 const tx=$('#tx');if(!tx)return;const text=tx.value.trim();
 if(!text){return startRec()}
 tx.value='';grow();$('#emo')?.classList.remove('on');setTyping(false);
 if(S.edit){const id=S.edit.id;S.edit=null;renderComposer();
  const{error}=await sb.rpc('zap_edit_msg',{mid:id,p_text:text});
  if(error)return toast(errMsg(error,'Não consegui editar.'));
  const m=S.msgs.find(x=>x.id===id);if(m){m.text=text;m.edited=true;renderMsgs(false);const c=chat(S.cur);if(c&&c.lastAt===m.at){c.last={by:me,text:text.slice(0,140)};renderList()}}return}
 sendRaw(text,null);
}
function grow(){const t=$('#tx');if(!t)return;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,140)+'px';
 const b=$('#sendBtn');if(b){const has=!!t.value.trim();b.textContent=has||S.edit?'➤':'🎤';b.setAttribute('aria-label',has||S.edit?'Enviar':'Gravar áudio')}}

/* ---------- presença (online / digitando) só entre quem divide conversa ---------- */
function syncRooms(){
 if(!sb||!me)return;const want=new Set(S.chats.map(c=>c.id));
 for(const id of Object.keys(rooms))if(!want.has(id)){sb.removeChannel(rooms[id]);delete rooms[id];delete S.peers[id]}
 for(const id of want){if(rooms[id])continue;
  const ch=sb.channel('zap-room-'+id,{config:{presence:{key:me}}});rooms[id]=ch;
  ch.on('presence',{event:'sync'},()=>{S.peers[id]=Object.values(ch.presenceState()).flat();renderList();if(id===S.cur)renderHead()})
   .subscribe(async st=>{if(st==='SUBSCRIBED')await ch.track({uid:me,typing:false,tt:0})})}
}
function setTyping(on){const ch=rooms[S.cur];if(!ch){typingOn=false;return}
 if(on!==typingOn){typingOn=on;ch.track({uid:me,typing:on,tt:Date.now()}).catch(()=>{})}
 clearTimeout(typingT);if(on)typingT=setTimeout(()=>setTyping(false),3000)}

/* ---------- tempo real ---------- */
function playEvent(m){if(m.event?.call)return;const by=nameOf(m.by)+' soltou';window.ZapFX&&ZapFX.play(m.event.kind,m.event.text,by)}
function startLive(){
 live=sb.channel('zap-db')
  .on('postgres_changes',{event:'*',schema:'public',table:'zap_messages'},async pl=>{
   const r=pl.new&&pl.new.id?pl.new:null;if(!r)return;
   if(pl.eventType==='INSERT'&&r.event?.call&&r.user_id!==me&&Date.now()-ms(r.created_at)<40000)showRing(r);
   if(r.chat_id===S.cur){const m=toMsg(r),i=S.msgs.findIndex(x=>x.id===m.id);const near=isNear();
    if(i>=0)S.msgs[i]=m;else{S.msgs.push(m);S.msgs.sort((a,b)=>a.at-b.at)}
    if(await loadPeople([m.by]))renderList();renderMsgs(near||m.by===me);markRead();
    if(pl.eventType==='INSERT'&&m.event&&!m.event.call&&Date.now()-m.at<60000&&!document.hidden)playEvent(m);
    if(chat(S.cur)?.pinned===m.id)loadPinned()}
   else if(pl.eventType==='INSERT'&&r.event&&!r.event.call){const c=chat(r.chat_id);if(c)toast(`${nameOf(r.user_id)} soltou um evento em ${chatLook(c).name} ✨`)}
   if(pl.eventType==='INSERT'){const c=chat(r.chat_id);if(c){c.last={by:r.user_id,text:preview(toMsg(r)).slice(0,140)};c.lastAt=ms(r.created_at);renderList()}
    if(r.sys||!c)refreshChats()}})
  .on('postgres_changes',{event:'*',schema:'public',table:'zap_members'},pl=>{
   const r=pl.new&&pl.new.chat_id?pl.new:pl.old;
   if(pl.eventType==='UPDATE'&&r){const c=chat(r.chat_id);if(c){c.readsAll[r.user_id]=ms(r.last_read_at);if(r.user_id===me){S.my[r.chat_id]=ms(r.last_read_at);c.muted=!!r.muted}
     if(r.chat_id===S.cur){S.reads=c.readsAll;renderMsgs(false);renderHead()}renderList();return}}
   refreshChats()})
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'zap_chats'},refreshChats)
  .subscribe(st=>{if(st==='SUBSCRIBED')refreshChats()});
}

/* ---------- menu da mensagem ---------- */
$('#reBar').innerHTML=REACT.map(e=>`<button data-re="${e}" aria-label="Reagir ${e}">${e}</button>`).join('');
function openMenu(id,rect){
 const m=S.msgs.find(x=>x.id===id),c=chat(S.cur);if(!m||m.del||m.sys||m._p)return;menuId=id;const mn=$('#menu');
 const mine=m.by===me;
 mn.querySelector('[data-a=del]').style.display=mine?'':'none';
 mn.querySelector('[data-a=edit]').style.display=mine&&m.text&&Date.now()-m.at<15*60e3?'':'none';
 mn.querySelector('[data-a=copy]').style.display=m.text?'':'none';
 const pin=mn.querySelector('[data-a=pin]');pin.style.display=canAdmin(c)?'':'none';pin.textContent=c?.pinned===id?'📌 Desafixar':'📌 Fixar';
 mn.classList.add('on');const w=220,h=mn.offsetHeight;
 let x=mine?rect.right-w:rect.left,y=rect.bottom+6;if(y+h>innerHeight-10)y=Math.max(10,rect.top-h-6);
 mn.style.left=Math.max(8,Math.min(x,innerWidth-w-8))+'px';mn.style.top=y+'px';
}
const closeMenu=()=>{$('#menu').classList.remove('on');menuId=null};
async function react(id,e){
 const m=S.msgs.find(x=>x.id===id);if(!m||m._p)return;
 const r={...(m.react||{})};if(r[me]===e)delete r[me];else r[me]=e;m.react=r;renderMsgs(false);
 const{error}=await sb.rpc('zap_react',{mid:id,p_emoji:e});if(error)toast(errMsg(error,'Não deu pra reagir.'));
}
$('#menu').addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b||!menuId)return;const id=menuId,m=S.msgs.find(x=>x.id===id);closeMenu();if(!m)return;
 if(b.dataset.re)return react(id,b.dataset.re);
 const a=b.dataset.a;
 if(a==='reply'){S.edit=null;S.reply={id,by:m.by,text:preview(m).slice(0,160)};renderComposer();$('#tx')?.focus()}
 if(a==='edit'){S.reply=null;S.edit={id,text:m.text};$('#tx')&&($('#tx').value='');renderComposer();$('#tx')?.focus()}
 if(a==='copy'){try{await navigator.clipboard.writeText(m.text);toast('Copiado!')}catch(e){toast('Não deu pra copiar aqui.')}}
 if(a==='pin'){const c=chat(S.cur);const{error}=await sb.rpc('zap_pin',{cid:S.cur,mid:c?.pinned===id?null:id});if(error)toast(errMsg(error,'Não consegui fixar.'));else{c.pinned=c.pinned===id?null:id;loadPinned();renderMsgs(false)}}
 if(a==='del'){confirmBox('Apagar pra todos?','A mensagem some pra todo mundo da conversa.','Apagar',async()=>{
  const{error}=await sb.rpc('zap_delete_msg',{mid:id});if(error)toast(errMsg(error,'Não consegui apagar.'))})}
});
document.addEventListener('click',e=>{if(menuId&&!e.target.closest('#menu')&&!e.target.closest('.b'))closeMenu()});
addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();closeDlg();closeLight();window.ZapFX&&ZapFX.stop()}});

/* ---------- foto em tela cheia ---------- */
function openLight(src){const l=$('#light');l.querySelector('img').src=src;l.classList.add('on')}
function closeLight(){$('#light').classList.remove('on')}
$('#light').addEventListener('click',closeLight);

/* ---------- diálogos ---------- */
const closeDlg=()=>$('#veil').classList.remove('on');
$('#veil').addEventListener('click',e=>{if(e.target.id==='veil')closeDlg()});
function dlg(html){$('#dlg').innerHTML=html;$('#veil').classList.add('on')}
function confirmBox(t,txt,ok,fn,danger){dlg(`<h3>${esc(t)}</h3><div class="bd"><p style="margin:0;color:var(--mute)">${esc(txt)}</p></div><div class="ft"><button class="btn" data-x>Cancelar</button><button class="btn ${danger?'red':'pri'}" id="okB">${esc(ok)}</button></div>`);
 $('#okB').onclick=()=>{closeDlg();fn()}}
$('#dlg').addEventListener('click',e=>{
 if(e.target.closest('[data-x]'))return closeDlg();
 const v=e.target.closest('[data-pv]');if(v){closeDlg();return startChat([v.dataset.pv],false)}
 const b=e.target.closest('[data-copy]');if(b&&b.dataset.copy)copyTxt(b.dataset.copy)});
async function copyTxt(t){try{await navigator.clipboard.writeText(t);toast('Código copiado!')}catch(e){toast('Não deu pra copiar. O código é '+t)}}
const codeBox=(code,extra='')=>`<div style="display:flex;gap:8px;align-items:center"><span class="codebox">${esc(code||'········')}</span><button class="btn" data-copy="${esc(code||'')}">Copiar</button>${extra}</div>`;

function shrink(file){return new Promise((ok,no)=>{const u=URL.createObjectURL(file),im=new Image();
 im.onload=()=>{const Z=192,c=document.createElement('canvas');c.width=c.height=Z;const x=c.getContext('2d'),s=Math.min(im.naturalWidth,im.naturalHeight);
  x.fillStyle='#171b2b';x.fillRect(0,0,Z,Z);x.drawImage(im,(im.naturalWidth-s)/2,(im.naturalHeight-s)/2,s,s,0,0,Z,Z);URL.revokeObjectURL(u);
  const d=c.toDataURL('image/jpeg',.82);okPhoto(d)?ok(d):no()};im.onerror=()=>{URL.revokeObjectURL(u);no()};im.src=u})}
function profileDlg(first){
 const p={...person(me)};let acc=document.documentElement.dataset.accent||'roxo';
 const keep=()=>{p.nick=$('#pNick').value;p.about=$('#pAbout').value};
 const pushState=()=>!('Notification' in window)||!('serviceWorker' in navigator)?'off':Notification.permission;
 const draw=()=>{const ps=pushState();dlg(`<h3>${first?'Bem-vindo ao Zap! 👋':'Meu perfil'}<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  <div style="display:flex;gap:14px;align-items:center"><span class="av" style="--c:${esc(p.color)};width:64px;height:64px;font-size:32px">${face(p.emoji,p.photo)}</span>
  <div><b>${esc(p.nick||p.username)}</b><br><small style="color:var(--mute)">@${esc(p.username)} · ${esc(p.about||'')}</small></div></div>
  <div style="display:grid;gap:6px"><small style="color:var(--mute)">Meu código — quem tiver ele te chama no privado</small>${codeBox(p.code)}</div>
  <label class="f">Apelido (como a galera te vê)<input id="pNick" maxlength="30" value="${esc(p.nick||'')}" placeholder="${esc(p.username)}"></label>
  <label class="f">Recado<input id="pAbout" maxlength="80" value="${esc(p.about||'')}" placeholder="Disponível"></label>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn pri" style="display:inline-flex;align-items:center;cursor:pointer">📷 ${okPhoto(p.photo)?'Trocar foto':'Colocar foto'}<input type="file" id="pFile" accept="image/*" hidden></label>${okPhoto(p.photo)?'<button class="btn red" id="pNoPhoto">Tirar foto</button>':''}</div>
  <div class="lbl">${okPhoto(p.photo)?'Emoji (aparece se tirar a foto)':'Ou use um emoji'}<div class="chips" id="pEmo">${AVS.map(e=>`<button data-v="${e}" class="${e===p.emoji?'on':''}">${e}</button>`).join('')}</div></div>
  <div class="lbl">Cor do anel<div class="chips" id="pCol">${COLORS.map(c=>`<button class="sw${c===p.color?' on':''}" data-v="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div></div>
  <div class="lbl">Tema (só neste aparelho)<div class="chips" id="pAcc">${ACC.map(a=>`<button class="sw${a===acc?' on':''}" data-v="${a}" style="background:${ACCC[a]}" aria-label="Tema ${a}"></button>`).join('')}</div></div>
  <div class="sect"><b>🔔 Notificações no celular</b>
   ${ps==='granted'?'<small style="color:#86efac">Ligadas neste aparelho ✓</small>':ps==='denied'?'<small style="color:#fca5a5">Bloqueadas no navegador. Libere nas configurações do site.</small>':ps==='off'?'<small>Este navegador não suporta. No iPhone, primeiro "Adicionar à Tela de Início".</small>':'<button class="btn pri" id="pPush">Ativar notificações</button>'}</div>
  <div class="sect"><b>🔒 Trocar senha</b><small>Vale também pro AI FRIENDS (é a mesma conta).</small>
   <div style="display:flex;gap:8px"><input id="pPass" type="password" autocomplete="new-password" placeholder="nova senha (mín. 8)" class="inp" style="flex:1"><button class="btn" id="pPassOk">Trocar</button></div></div>
  ${S.blocks.size?`<div class="sect"><b>🚫 Bloqueados</b>${[...S.blocks].map(id=>`<div class="pick"><span class="rt"><b>${esc(nameOf(id))}</b></span><button class="btn" data-unblock="${esc(id)}">Desbloquear</button></div>`).join('')}</div>`:''}
 </div><div class="ft"><button class="btn red" id="pDel">Apagar conta do Zap</button><button class="btn" id="logout">Sair</button><button class="btn pri" id="pSave">${first?'Bora conversar':'Salvar'}</button></div>`)};
 const wire=()=>{
  $('#pEmo').onclick=e=>{const b=e.target.closest('[data-v]');if(b){keep();p.emoji=b.dataset.v;draw();wire()}};
  $('#pCol').onclick=e=>{const b=e.target.closest('[data-v]');if(b){keep();p.color=b.dataset.v;draw();wire()}};
  $('#pAcc').onclick=e=>{const b=e.target.closest('[data-v]');if(b){keep();acc=b.dataset.v;document.documentElement.dataset.accent=acc;try{localStorage.setItem('zap-accent',acc)}catch(er){}draw();wire()}};
  $('#pFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;keep();try{p.photo=await shrink(f);draw();wire()}catch(er){toast('Não consegui abrir essa imagem.')}};
  $('#pNoPhoto')&&($('#pNoPhoto').onclick=()=>{keep();p.photo='';draw();wire()});
  $('#pPush')&&($('#pPush').onclick=async()=>{keep();await enablePush(true);draw();wire()});
  $('#pPassOk').onclick=async()=>{const v=$('#pPass').value;if(v.length<8)return toast('A senha precisa ter pelo menos 8 caracteres.');
   const{error}=await sb.auth.updateUser({password:v});if(error)return toast(errMsg(error,'Não consegui trocar a senha.'));$('#pPass').value='';toast('Senha trocada ✓')};
  $('#dlg').querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{keep();await setBlock(b.dataset.unblock,false);draw();wire()});
  $('#logout').onclick=()=>confirmBox('Sair da conta?','Você vai precisar entrar de novo neste aparelho.','Sair',async()=>{await disablePush();sb.auth.signOut()});
  $('#pDel').onclick=()=>confirmBox('Apagar sua conta do Zap?','Você sai de todos os grupos e seu perfil some do Zap. Isso não tem volta. Sua conta do AI FRIENDS continua existindo.','Apagar tudo',async()=>{
   const{error}=await sb.rpc('zap_delete_me');if(error)return toast(errMsg(error,'Não consegui apagar.'));await disablePush();toast('Conta do Zap apagada.');sb.auth.signOut()},true);
  $('#pSave').onclick=async()=>{keep();closeDlg();
   const row={nick:p.nick.trim().slice(0,30),about:p.about.trim().slice(0,80),emoji:p.emoji,color:p.color,photo:okPhoto(p.photo)?p.photo:''};
   const{error}=await sb.from('zap_profiles').update(row).eq('id',me);
   if(error)return toast(errMsg(error,'Não consegui salvar o perfil.'));
   Object.assign(S.people[me],row);paintMe();renderList();renderHead();renderMsgs(false);toast('Perfil salvo')};
 };
 draw();wire();
}
async function setBlock(uid,on){const{error}=await sb.rpc('zap_block',{uid,p_block:on});if(error)return toast(errMsg(error,'Não consegui.'));
 if(on)S.blocks.add(uid);else S.blocks.delete(uid);toast(on?'Bloqueado 🚫':'Desbloqueado');renderHead();renderComposer()}
function joinDlg(){
 dlg(`<h3>Entrar com código<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  <p style="margin:0;color:var(--mute);font-size:14px">Cole o código de um <b>grupo</b> pra entrar nele, ou o código de uma <b>pessoa</b> pra chamar ela no privado.</p>
  <input id="jc" maxlength="12" autocomplete="off" placeholder="CÓDIGO" aria-label="Código" class="codein">
  <small style="color:var(--mute)">Seu código pra galera te chamar:</small>${codeBox(person(me).code)}
 </div><div class="ft"><button class="btn" data-x>Cancelar</button><button class="btn pri" id="jOk">Entrar</button></div>`);
 const i=$('#jc');i.focus();i.onkeydown=e=>{if(e.key==='Enter')$('#jOk').click()};
 $('#jOk').onclick=async()=>{const code=i.value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<6)return toast('Código inválido.');
  $('#jOk').disabled=true;const{data,error}=await sb.rpc('zap_join',{p_code:code});
  if(error){$('#jOk').disabled=false;return toast(errMsg(error,'Não consegui verificar o código.'))}
  closeDlg();await loadChats();openChat(data.id);if(data.kind==='chat')toast('Você entrou em '+(chat(data.id)?.name||'um grupo')+'!')};
}
function newDlg(group=false,preset=[],addTo=null){
 const known=new Set(S.chats.flatMap(c=>c.members));known.delete(me);preset.forEach(x=>known.delete(x));
 const ids=[...known].filter(id=>!S.blocks.has(id));let gEmo='👥';
 const ppl=ids.map(id=>{const p=person(id);return`<label class="pick">${group?`<input type="checkbox" data-id="${esc(id)}">`:''}<span class="av sm" style="--c:${esc(p.color)}">${face(p.emoji,p.photo)}</span>
  <span class="rt"><b>${esc(nameOf(id))}</b><small>${esc(p.about||'')}</small></span>${group?'':`<button class="btn" data-dm="${esc(id)}">Conversar</button>`}</label>`}).join('');
 dlg(`<h3>${addTo?'Adicionar ao grupo':group?'Novo grupo':'Nova conversa'}<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  ${group&&!addTo?`<label class="f">Nome do grupo<input id="gName" maxlength="40" placeholder="Os 3 Mosqueteiros"></label>
  <div class="lbl">Ícone<div class="chips" id="gEmo">${GEMO.map(e=>`<button data-v="${e}" class="${e===gEmo?'on':''}">${e}</button>`).join('')}</div></div>
  <small style="color:var(--mute)">O grupo ganha um código de convite. Quem não está na lista entra com ele.</small>`:''}
  ${!group?`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="toGroup">👥 Criar grupo</button><button class="btn" id="toJoin">🔑 Entrar com código</button></div>`:''}
  ${ppl?(group?'':'<small style="color:var(--mute)">Gente dos seus grupos:</small>')+ppl:`<div class="hint" style="margin:0">${group?'Ninguém pra adicionar daqui ainda — crie o grupo e mande o código pra galera.':'Ainda não tem ninguém nos seus grupos. Use 🔑 com o código de um amigo, ou crie um grupo e mande o código.'}</div>`}
 </div>${group?`<div class="ft"><button class="btn pri" id="gOk">${addTo?'Adicionar':'Criar grupo'}</button></div>`:''}`);
 $('#toGroup')&&($('#toGroup').onclick=()=>newDlg(true));
 $('#toJoin')&&($('#toJoin').onclick=joinDlg);
 $('#gEmo')&&($('#gEmo').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;gEmo=b.dataset.v;$('#gEmo').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))});
 $('#dlg').querySelectorAll('[data-dm]').forEach(b=>b.onclick=e=>{e.preventDefault();closeDlg();startChat([b.dataset.dm],false)});
 $('#gOk')&&($('#gOk').onclick=async()=>{const sel=[...$('#dlg').querySelectorAll('input[data-id]:checked')].map(i=>i.dataset.id);
  if(addTo){if(!sel.length)return toast('Escolha pelo menos uma pessoa.');closeDlg();
   const{error}=await sb.rpc('zap_add_members',{cid:addTo,p_members:sel});if(error)toast(errMsg(error,'Não consegui adicionar.'));else refreshChats();return}
  closeDlg();startChat(sel,true,($('#gName')?.value||'').trim()||'Grupo da galera',gEmo)});
}
async function startChat(ids,group,name='',emoji=''){
 const{data,error}=await sb.rpc('zap_create_chat',{p_group:group,p_name:name,p_emoji:emoji,p_members:ids});
 if(error)return toast(errMsg(error,'Não consegui criar a conversa.'));
 await loadChats();S.cur=null;openChat(data);
}
function infoDlg(){
 const c=chat(S.cur);if(!c)return;const L=chatLook(c),on=online(),admin=c.admins.includes(me);
 const mem=[me,...others(c)].map(id=>{const p=person(id),isA=c.admins.includes(id);
  const acts=id===me?'':`<button class="btn sm" data-pv="${esc(id)}" title="Conversar no privado">💬</button>${admin?`<button class="btn sm" data-adm="${esc(id)}" data-on="${isA?0:1}" title="${isA?'Tirar admin':'Tornar admin'}">${isA?'⬇️':'👑'}</button><button class="btn sm red" data-kick="${esc(id)}" title="Remover do grupo">✕</button>`:''}`;
  return`<div class="pick"><span class="av sm" style="--c:${esc(p.color)}">${face(p.emoji,p.photo)}${on.has(id)?'<i class="dot"></i>':''}</span>
  <span class="rt"><b>${esc(nameOf(id))}${isA?' · <small style="color:rgb(var(--accent-soft))">admin</small>':''}</b><small>${esc(p.about||'')}</small></span><span class="acts">${acts}</span></div>`}).join('');
 const blocked=L.uid&&S.blocks.has(L.uid);
 dlg(`<h3>${c.group?'Dados do grupo':'Contato'}<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  <div style="text-align:center"><span class="av" style="--c:${esc(L.color)};width:84px;height:84px;font-size:42px;margin:auto">${face(L.emoji,L.photo)}</span><h2 style="margin:10px 0 0;font-size:22px">${esc(L.name)}</h2>
  ${c.group?`<small style="color:var(--mute)">Grupo · ${c.members.length} participantes</small>`:`<small style="color:var(--mute)">${L.uid?'@'+esc(person(L.uid).username||'')+' · '+esc(person(L.uid).about||''):''}</small>`}</div>
  <div class="toggles"><button class="btn" id="findT">🔍 Pesquisar</button><button class="btn" id="muteT">${c.muted?'🔔 Tirar do silencioso':'🔕 Silenciar'}</button>${!c.group&&L.uid?`<button class="btn ${blocked?'':'red'}" id="blockT">${blocked?'Desbloquear':'🚫 Bloquear'}</button>`:''}</div>
  ${c.group?`<div style="display:grid;gap:6px"><small style="color:var(--mute)">Código de convite — mande pra galera entrar</small>${codeBox(c.code,admin?'<button class="btn" id="newCode">Novo</button>':'')}</div>`:''}
  ${c.group&&admin?`<label class="f">Renomear grupo<input id="rn" maxlength="40" value="${esc(c.name||'')}"></label>`:''}
  ${c.group?mem:''}
 </div><div class="ft">${c.group?`<button class="btn red" id="leave">Sair do grupo</button>${admin?'<button class="btn" id="addP">+ Pessoa</button><button class="btn pri" id="rnOk">Salvar</button>':''}`:'<button class="btn" data-x>Fechar</button>'}</div>`);
 $('#findT').onclick=findDlg;
 $('#muteT').onclick=async()=>{const{error}=await sb.rpc('zap_mute',{cid:c.id,p_muted:!c.muted});if(error)return toast(errMsg(error,'Não consegui.'));c.muted=!c.muted;toast(c.muted?'Silenciado 🔕 — sem notificação desse chat':'Notificações ligadas 🔔');renderList();renderHead();infoDlg()};
 $('#blockT')&&($('#blockT').onclick=()=>blocked?setBlock(L.uid,false).then(infoDlg):confirmBox('Bloquear '+L.name+'?','Vocês não vão conseguir mandar mensagem um pro outro no privado, e você não recebe notificação dessa pessoa.','Bloquear',()=>setBlock(L.uid,true),true));
 $('#addP')&&($('#addP').onclick=()=>newDlg(true,c.members,c.id));
 $('#dlg').querySelectorAll('[data-adm]').forEach(b=>b.onclick=async()=>{const{error}=await sb.rpc('zap_set_admin',{cid:c.id,uid:b.dataset.adm,p_admin:b.dataset.on==='1'});
  if(error)return toast(errMsg(error,'Não consegui.'));await loadChats();infoDlg()});
 $('#dlg').querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>confirmBox('Remover '+nameOf(b.dataset.kick)+'?','A pessoa sai do grupo. Ela só volta se entrar de novo com o código.','Remover',async()=>{
  const{error}=await sb.rpc('zap_kick',{cid:c.id,uid:b.dataset.kick});if(error)return toast(errMsg(error,'Não consegui remover.'));await loadChats();toast('Removido do grupo')},true));
 $('#newCode')&&($('#newCode').onclick=()=>confirmBox('Gerar um novo código?','O código antigo para de funcionar.','Gerar',async()=>{
  const{data,error}=await sb.rpc('zap_regen_code',{cid:c.id});if(error)return toast(errMsg(error,'Não consegui gerar.'));c.code=data;toast('Novo código: '+data);infoDlg()}));
 $('#rnOk')&&($('#rnOk').onclick=async()=>{const n=$('#rn').value.trim();closeDlg();if(!n||n===c.name)return;
  const{error}=await sb.rpc('zap_rename',{cid:c.id,p_name:n});if(error)toast(errMsg(error,'Não consegui renomear.'));else{c.name=n;renderHead();renderList()}});
 $('#leave')&&($('#leave').onclick=()=>confirmBox('Sair do grupo?','Você para de ver as mensagens desse grupo.','Sair',async()=>{
  const{error}=await sb.rpc('zap_leave',{cid:c.id});if(error)return toast(errMsg(error,'Não consegui sair.'));
  closeChat();S.chats=S.chats.filter(x=>x.id!==c.id);renderList();refreshChats()},true));
}
function fxDlg(){
 const c=chat(S.cur);if(!c||!canAdmin(c))return;let kind='danca',rainE='🎉';
 const draw=()=>{dlg(`<h3>✨ Soltar evento<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  <small style="color:var(--mute)">Aparece em tela cheia pra todo mundo que estiver com ${c.group?'o grupo':'a conversa'} aberto agora.</small>
  <div class="fxgrid">${ZapFX.EVENTS.map(e=>`<button class="fxcard${e.kind===kind?' on':''}" data-k="${e.kind}"><span>${e.emoji}</span><b>${esc(e.name)}</b><small>${esc(e.hint)}</small></button>`).join('')}</div>
  ${kind==='chuva'?`<div class="lbl">Emoji que vai chover<div class="chips" id="rainE">${RAIN.map(e=>`<button data-v="${e}" class="${e===rainE?'on':''}">${e}</button>`).join('')}</div></div>`
   :`<label class="f">${kind==='parabens'?'Nome do aniversariante':'Mensagem (opcional)'}<input id="fxT" maxlength="60" placeholder="${kind==='parabens'?'Bernardo':'Bora, galera!'}"></label>`}
 </div><div class="ft"><button class="btn" id="fxTry">👀 Ver só pra mim</button><button class="btn pri" id="fxGo">Soltar pra todos</button></div>`);
  $('#dlg').querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{kind=b.dataset.k;draw()});
  $('#rainE')&&($('#rainE').onclick=e=>{const b=e.target.closest('[data-v]');if(b){rainE=b.dataset.v;draw()}});
  const txt=()=>kind==='chuva'?rainE:($('#fxT')?.value||'').trim();
  $('#fxTry').onclick=()=>{const t=txt();closeDlg();ZapFX.play(kind,t,'Prévia — só você está vendo')};
  $('#fxGo').onclick=async()=>{const t=txt();closeDlg();const{error}=await sb.rpc('zap_event',{cid:c.id,p_kind:kind,p_text:t});
   if(error)return toast(errMsg(error,'Não consegui soltar o evento.'))}};
 draw();
}
function findDlg(){
 const c=chat(S.cur);if(!c)return;
 dlg(`<h3>🔍 Pesquisar na conversa<button class="ib" data-x aria-label="Fechar">✕</button></h3><div class="bd">
  <input id="fq" class="inp" placeholder="Digite uma palavra" aria-label="Pesquisar">
  <div id="fres"><small style="color:var(--mute)">Procura em todas as mensagens desta conversa.</small></div></div>`);
 const i=$('#fq');i.focus();let t=null;
 i.oninput=()=>{clearTimeout(t);t=setTimeout(async()=>{const q=i.value.trim();const box=$('#fres');if(!box)return;
  if(q.length<2){box.innerHTML='<small style="color:var(--mute)">Digite pelo menos 2 letras.</small>';return}
  const{data,error}=await sb.from('zap_messages').select('id,user_id,text,created_at').eq('chat_id',c.id).eq('deleted',false).eq('sys',false)
   .ilike('text','%'+q.replace(/[%_\\]/g,m=>'\\'+m)+'%').order('created_at',{ascending:false}).limit(40);
  if(error)return box.innerHTML='<small>Não consegui pesquisar.</small>';
  if(!data.length)return box.innerHTML='<small style="color:var(--mute)">Nada encontrado.</small>';
  await loadPeople(data.map(r=>r.user_id));
  box.innerHTML=data.map(r=>`<button class="pick res" data-go="${esc(r.id)}" data-at="${esc(r.created_at)}"><span class="rt"><b>${esc(nameOf(r.user_id))} · <small>${esc(dayLabel(ms(r.created_at)))} ${esc(hm(ms(r.created_at)))}</small></b><small>${esc(r.text.slice(0,120))}</small></span></button>`).join('');
  box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{closeDlg();jumpTo(b.dataset.go,b.dataset.at)});
 },300)};
}
async function jumpTo(id,at){
 if(!S.msgs.some(m=>m.id===id)&&at){
  const{data}=await sb.from('zap_messages').select('*').eq('chat_id',S.cur).gte('created_at',at).order('created_at',{ascending:true}).limit(500);
  if(data){S.msgs=data.map(toMsg);S.more=true;data.forEach(r=>S.seen.add(r.id));renderMsgs(false)}
 }
 const el=document.getElementById('m-'+id);if(!el)return toast('Mensagem não encontrada.');
 el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1600);
}

/* ---------- notificações ---------- */
function b64u(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function enablePush(ask){
 try{
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return ask&&toast('Seu navegador não tem notificação. No iPhone, primeiro "Adicionar à Tela de Início".');
  if(Notification.permission!=='granted'){if(!ask)return;const p=await Notification.requestPermission();if(p!=='granted')return toast('Notificações não foram liberadas.')}
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub){const r=await fetch('/api/vapid');const j=await r.json();if(!j.publicKey)throw 0;
   sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(j.publicKey)})}
  const k=sub.toJSON();const{error}=await sb.rpc('zap_save_push',{p_endpoint:k.endpoint,p_p256dh:k.keys.p256dh,p_auth:k.keys.auth});
  if(error)throw error;ask&&toast('Notificações ligadas 🔔');
 }catch(e){ask&&toast('Não consegui ligar as notificações.')}
}
async function disablePush(){try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager.getSubscription();
 if(sub){await sb.rpc('zap_del_push',{p_endpoint:sub.endpoint});await sub.unsubscribe()}}catch(e){}}
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});
 navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='open-chat'&&e.data.chat&&me)openChat(e.data.chat)})}


/* ---------- chamadas de voz e vídeo (direto entre os aparelhos, WebRTC) ---------- */
const ICE=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun.cloudflare.com:3478']}];
const CALL={cid:null};let ringing=null;
const inCall=()=>!!CALL.cid;
function callUI(){
 if($('#call'))return;
 const d=document.createElement('div');d.id='call';d.className='call';d.innerHTML=`
  <div class="ctop"><button class="ib" id="cMin" aria-label="Minimizar chamada">⌄</button><span class="rt"><b id="cName"></b><small id="cInfo"></small></span></div>
  <div class="cgrid" id="cGrid"></div>
  <video id="cSelf" class="cself" muted playsinline autoplay></video>
  <div class="cbar"><button class="cb1" id="cMic" aria-label="Microfone">🎤</button><button class="cb1" id="cCam" aria-label="Câmera">📷</button><button class="cb1" id="cFlip" aria-label="Virar câmera">🔄</button><button class="cb1" id="cSpk" aria-label="Viva-voz" hidden>🔈</button><button class="cb1 end" id="cEnd" aria-label="Desligar">📞</button></div>`;
 document.body.appendChild(d);
 const pill=document.createElement('button');pill.id='callPill';pill.className='callpill';pill.hidden=true;document.body.appendChild(pill);
 pill.onclick=()=>{$('#call').classList.add('on');pill.hidden=true};
 $('#cMin').onclick=()=>{$('#call').classList.remove('on');pill.hidden=false;paintPill()};
 $('#cEnd').onclick=()=>leaveCall();
 $('#cMic').onclick=()=>{CALL.mic=!CALL.mic;CALL.local.getAudioTracks().forEach(t=>t.enabled=CALL.mic);trackMe();renderCall()};
 $('#cCam').onclick=()=>{CALL.cam=!CALL.cam;CALL.local.getVideoTracks().forEach(t=>t.enabled=CALL.cam);trackMe();renderCall()};
 $('#cFlip').onclick=flipCam;
}
function paintPill(){const p=$('#callPill');if(!p||p.hidden||!CALL.cid)return;const c=chat(CALL.cid);
 p.textContent=`${CALL.video?'📹':'📞'} ${c?chatLook(c).name:'Chamada'} · ${dur((Date.now()-(CALL.liveAt||CALL.t0))/1000)} — voltar`}
function trackMe(){CALL.ch&&CALL.ch.track({uid:me,video:CALL.video,cam:CALL.cam,mic:CALL.mic}).catch(()=>{})}
function sig(to,data){CALL.ch&&CALL.ch.send({type:'broadcast',event:'sig',payload:{from:me,to,...data}})}
async function startCall(video){
 const c=chat(S.cur);if(!c)return;
 if(!c.group&&others(c).some(o=>S.blocks.has(o)))return toast('Desbloqueie a pessoa pra ligar.');
 if(inCall())return CALL.cid===c.id?showCall():toast('Você já está em outra chamada.');
 if(!await joinCall(c.id,video,true))return;
 const{error}=await sb.rpc('zap_call',{cid:c.id,p_video:video});
 if(error){toast(errMsg(error,'Não consegui ligar.'));leaveCall(true)}
}
async function joinCall(cid,video,caller){
 if(inCall()){if(CALL.cid===cid){showCall();return true}toast('Saia da chamada atual primeiro.');return false}
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){toast('Seu navegador não faz chamadas.');return false}
 let stream;
 try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
  video:video?{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24}}:false})}
 catch(e){toast(video?'Libere a câmera e o microfone pra chamada.':'Libere o microfone pra chamada.');return false}
 callUI();
 Object.assign(CALL,{cid,video,local:stream,peers:{},early:{},people:{},t0:Date.now(),mic:true,cam:video,facing:'user',caller,connectedOnce:false});
 const ch=sb.channel('zap-call-'+cid,{config:{presence:{key:me},broadcast:{self:false}}});CALL.ch=ch;
 ch.on('broadcast',{event:'sig'},({payload})=>onSig(payload).catch(()=>{}))
  .on('presence',{event:'sync'},syncCall)
  .subscribe(st=>{if(st==='SUBSCRIBED')trackMe()});
 const self=$('#cSelf');self.srcObject=stream;self.hidden=!video;
 $('#cCam').hidden=$('#cFlip').hidden=!video;
 $('#call').classList.add('on');$('#callPill').hidden=true;
 CALL.timer=setInterval(()=>{renderCallInfo();paintPill()},1000);
 CALL.alone=setTimeout(()=>{if(CALL.cid===cid&&!Object.keys(CALL.peers).length){toast(caller?'Ninguém atendeu.':'A chamada já tinha acabado.');leaveCall()}},caller?45000:20000);
 renderCall();return true;
}
function showCall(){$('#call')?.classList.add('on');$('#callPill')&&($('#callPill').hidden=true)}
function syncCall(){
 if(!CALL.ch)return;const st=CALL.ch.presenceState();CALL.people={};
 for(const[k,l]of Object.entries(st))if(k!==me&&l[0])CALL.people[k]=l[l.length-1];
 const ids=Object.keys(CALL.people);
 for(const id of ids)if(!CALL.peers[id]&&me<id)makePeer(id,true);
 for(const id of ids)if(CALL.peers[id])CALL.peers[id].seen=true;
 for(const id of Object.keys(CALL.peers))if(!ids.includes(id)&&CALL.peers[id].seen)dropPeer(id);
 if(ids.length){clearTimeout(CALL.alone);CALL.connectedOnce=true}
 else if(CALL.connectedOnce){clearTimeout(CALL.alone);CALL.alone=setTimeout(()=>{if(inCall()&&!Object.keys(CALL.people).length){toast('A chamada acabou.');leaveCall()}},4000)}
 loadPeople(ids).then(renderCall);renderCall();
}
function makePeer(id,initiator){
 dropPeer(id);
 const pc=new RTCPeerConnection({iceServers:ICE}),P={id,pc,stream:new MediaStream(),pend:CALL.early[id]||[]};delete CALL.early[id];CALL.peers[id]=P;
 CALL.local.getTracks().forEach(t=>pc.addTrack(t,CALL.local));
 pc.ontrack=e=>{if(e.streams[0])P.stream=e.streams[0];else P.stream.addTrack(e.track);P.fresh=true;renderCall()};
 pc.onicecandidate=e=>{if(e.candidate)sig(id,{c:e.candidate.toJSON()})};
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'&&initiator&&pc.restartIce){pc.restartIce();offer(P,true)}renderCall()};
 if(initiator)offer(P);
 return P;
}
async function offer(P,restart){try{const o=await P.pc.createOffer(restart?{iceRestart:true}:{});await P.pc.setLocalDescription(o);sig(P.id,{d:P.pc.localDescription.toJSON()})}catch(e){}}
function dropPeer(id){const P=CALL.peers?.[id];if(!P)return;try{P.pc.close()}catch(e){}delete CALL.peers[id];document.querySelector(`#cGrid [data-id="${id}"]`)?.remove()}
async function onSig(p){
 if(!inCall()||p.to!==me||!p.from)return;let P=CALL.peers[p.from];
 if(p.d){
  if(p.d.type==='offer'){if(!P||P.pc.signalingState!=='stable'||P.pc.remoteDescription)P=P&&P.pc.signalingState==='stable'&&P.pc.remoteDescription?P:makePeer(p.from,false);
   await P.pc.setRemoteDescription(p.d);await flush(P);const a=await P.pc.createAnswer();await P.pc.setLocalDescription(a);sig(p.from,{d:P.pc.localDescription.toJSON()})}
  else if(p.d.type==='answer'&&P&&P.pc.signalingState==='have-local-offer'){await P.pc.setRemoteDescription(p.d);await flush(P)}
 }
 if(p.c){if(P&&P.pc.remoteDescription)await P.pc.addIceCandidate(p.c).catch(()=>{});else if(P)P.pend.push(p.c);else(CALL.early[p.from]=CALL.early[p.from]||[]).push(p.c)}
}
async function flush(P){const l=P.pend;P.pend=[];for(const c of l)await P.pc.addIceCandidate(c).catch(()=>{})}
async function flipCam(){
 if(!CALL.video)return;const facing=CALL.facing==='user'?'environment':'user';
 try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:640},height:{ideal:480}}});const nt=s.getVideoTracks()[0];
  nt.enabled=CALL.cam;for(const P of Object.values(CALL.peers)){const sd=P.pc.getSenders().find(x=>x.track&&x.track.kind==='video');sd&&await sd.replaceTrack(nt)}
  CALL.local.getVideoTracks().forEach(t=>{CALL.local.removeTrack(t);t.stop()});CALL.local.addTrack(nt);CALL.facing=facing;$('#cSelf').srcObject=CALL.local;
  $('#cSelf').classList.toggle('back',facing==='environment');
 }catch(e){toast('Não consegui virar a câmera.')}
}
function renderCallInfo(){
 if(!inCall()||!$('#cInfo'))return;const n=Object.keys(CALL.people).length;
 const live=Object.values(CALL.peers).some(P=>P.pc.connectionState==='connected');
 if(live&&!CALL.liveAt)CALL.liveAt=Date.now();
 $('#cInfo').textContent=!n?(CALL.caller?'Chamando…':'Esperando a galera…'):live?dur((Date.now()-(CALL.liveAt||CALL.t0))/1000)+(n>1?` · ${n+1} pessoas`:''):'Conectando…';
}
function renderCall(){
 if(!inCall()||!$('#cGrid'))return;const c=chat(CALL.cid),grid=$('#cGrid');
 $('#cName').textContent=(CALL.video?'📹 ':'📞 ')+(c?chatLook(c).name:'Chamada');
 $('#cMic').textContent=CALL.mic?'🎤':'🔇';$('#cMic').classList.toggle('off',!CALL.mic);
 $('#cCam').classList.toggle('off',!CALL.cam);$('#cSelf').style.visibility=CALL.cam?'':'hidden';
 const ids=Object.keys(CALL.people);
 grid.dataset.n=Math.max(1,ids.length);
 if(!ids.length){grid.innerHTML=`<div class="cwait">${c?`<span class="av" style="--c:${esc(chatLook(c).color)}">${face(chatLook(c).emoji,chatLook(c).photo)}</span>`:''}<b>${CALL.caller?'Chamando…':'Esperando a galera entrar…'}</b></div>`;renderCallInfo();return}
 grid.querySelector('.cwait')?.remove();
 for(const id of ids){
  const pr=CALL.people[id],p=person(id),P=CALL.peers[id];
  let t=grid.querySelector(`[data-id="${id}"]`);
  if(!t){t=document.createElement('div');t.className='tile';t.dataset.id=id;
   t.innerHTML=`<video playsinline autoplay></video><span class="av"></span><span class="tl"></span>`;grid.appendChild(t)}
  const v=t.querySelector('video');if(P&&v.srcObject!==P.stream){v.srcObject=P.stream;v.play().catch(()=>{})}
  const camOn=CALL.video&&pr.cam!==false&&P&&P.stream.getVideoTracks().length;
  t.classList.toggle('cam',!!camOn);
  const av=t.querySelector('.av');av.style.setProperty('--c',p.color);av.innerHTML=face(p.emoji,p.photo);
  const st=P?P.pc.connectionState:'new';
  t.querySelector('.tl').textContent=nameOf(id)+(pr.mic===false?' 🔇':'')+(st==='connected'?'':st==='failed'?' · sem conexão':' · conectando…');
 }
 renderCallInfo();
}
function leaveCall(quiet){
 if(!inCall())return;clearInterval(CALL.timer);clearTimeout(CALL.alone);
 for(const id of Object.keys(CALL.peers||{}))dropPeer(id);
 CALL.local?.getTracks().forEach(t=>t.stop());
 if(CALL.ch){CALL.ch.untrack?.().catch(()=>{});sb.removeChannel(CALL.ch)}
 for(const k of Object.keys(CALL))delete CALL[k];CALL.cid=null;
 $('#call')?.classList.remove('on');$('#callPill')&&($('#callPill').hidden=true);$('#cGrid')&&($('#cGrid').innerHTML='');
 if(!quiet)toast('Chamada encerrada');
}
addEventListener('pagehide',()=>leaveCall(true));
/* toque de quem está recebendo a chamada */
let ringCtx=null;
function ringSound(on){
 if(!on){clearInterval(ringSound.t);ringSound.t=null;navigator.vibrate?.(0);return}
 try{ringCtx=ringCtx||new(window.AudioContext||window.webkitAudioContext)()}catch(e){return}
 const beep=()=>{if(!ringCtx)return;const t=ringCtx.currentTime;[0,.45].forEach(o=>{const g=ringCtx.createGain(),os=ringCtx.createOscillator();
  os.frequency.value=o?660:880;os.connect(g);g.connect(ringCtx.destination);g.gain.setValueAtTime(.0001,t+o);g.gain.exponentialRampToValueAtTime(.25,t+o+.03);
  g.gain.exponentialRampToValueAtTime(.0001,t+o+.38);os.start(t+o);os.stop(t+o+.4)});navigator.vibrate?.([400,200,400])};
 beep();ringSound.t=setInterval(beep,2200);
}
function showRing(r){
 const c=chat(r.chat_id);if(!c||inCall()||ringing)return;
 const L=chatLook(c),video=!!r.event.video,who=nameOf(r.user_id),p=person(r.user_id);
 let el=$('#ring');if(!el){el=document.createElement('div');el.id='ring';el.className='ring';document.body.appendChild(el)}
 el.innerHTML=`<div class="rbox"><span class="av big" style="--c:${esc(c.group?L.color:p.color)}">${c.group?face(L.emoji,L.photo):face(p.emoji,p.photo)}</span>
  <b>${esc(c.group?L.name:who)}</b><small>${video?'📹 Chamada de vídeo':'📞 Chamada de voz'}${c.group?' · '+esc(who)+' chamou':''}</small>
  <div class="rbtn"><button class="cb1 end" id="rNo" aria-label="Recusar">📞</button><button class="cb1 ok" id="rYes" aria-label="Atender">${video?'📹':'📞'}</button></div></div>`;
 el.classList.add('on');ringSound(true);
 const stop=()=>{clearTimeout(ringing);ringing=null;ringSound(false);el.classList.remove('on')};
 ringing=setTimeout(stop,40000);
 $('#rNo').onclick=stop;
 $('#rYes').onclick=async()=>{stop();await joinCall(c.id,video,false)};
}

/* ---------- eventos da página ---------- */
$('#list').addEventListener('click',e=>{const r=e.target.closest('[data-c]');if(r)openChat(r.dataset.c)});
$('#q').addEventListener('input',e=>{S.q=e.target.value;renderList()});
$('#joinBtn').onclick=()=>me?joinDlg():null;
$('#newBtn').onclick=()=>me?newDlg():null;
$('#meBtn').onclick=()=>me?profileDlg(false):null;
$('#main').addEventListener('click',e=>{
 const t=e.target;
 if(t.closest('#back')){closeChat();renderList();return}
 if(t.closest('#info')||t.closest('#who'))return infoDlg();
 if(t.closest('#fxBtn'))return fxDlg();
 if(t.closest('#callA'))return startCall(false);
 if(t.closest('#callV'))return startCall(true);
 const jn=t.closest('[data-join]');if(jn){const m=S.msgs.find(x=>x.id===jn.dataset.join);if(m?.event)joinCall(S.cur,!!m.event.video,false);return}
 if(t.closest('#findBtn'))return findDlg();
 if(t.closest('#older'))return loadOlder();
 if(t.closest('#pinGo'))return S.pinnedMsg&&jumpTo(S.pinnedMsg.id,new Date(S.pinnedMsg.at).toISOString());
 const rp=t.closest('[data-fx]');if(rp){const m=S.msgs.find(x=>x.id===rp.dataset.fx);if(m?.event)playEvent(m);return}
 if(t.closest('#emoBtn'))return $('#emo').classList.toggle('on');
 const em=t.closest('[data-e]');if(em){const tx=$('#tx'),s=tx.selectionStart??tx.value.length;tx.value=tx.value.slice(0,s)+em.dataset.e+tx.value.slice(s);tx.focus();grow();return}
 if(t.closest('#sendBtn'))return send();
 if(t.closest('#recOk'))return stopRec(true);
 if(t.closest('#recX'))return stopRec(false);
 if(t.closest('#noRep')){S.reply=null;if(S.edit){S.edit=null;$('#tx')&&($('#tx').value='')}return renderComposer()}
 const pic=t.closest('img.pic');if(pic&&pic.src){e.stopPropagation();return openLight(pic.src)}
 const jq=t.closest('[data-jump]');if(jq){e.stopPropagation();return jumpTo(jq.dataset.jump)}
 const pv=t.closest('[data-pv]');if(pv){e.stopPropagation();closeMenu();return startChat([pv.dataset.pv],false)}
 const rx=t.closest('[data-rx]');if(rx)return react(rx.dataset.m,rx.dataset.rx);
 if(t.closest('audio'))return;
 const b=t.closest('.b');if(b&&!t.closest('a')){e.stopPropagation();openMenu(b.dataset.m,b.getBoundingClientRect())}
});
$('#main').addEventListener('change',e=>{if(e.target.id==='pick'){const f=e.target.files[0];e.target.value='';sendPhoto(f)}});
$('#main').addEventListener('dblclick',e=>{const b=e.target.closest('.b');if(b){closeMenu();react(b.dataset.m,'❤️')}});
$('#main').addEventListener('input',e=>{if(e.target.id==='tx'){grow();setTyping(!!e.target.value.trim())}});
$('#main').addEventListener('keydown',e=>{
 if(e.target.id==='tx'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(min-width:761px)').matches){e.preventDefault();if(e.target.value.trim())send()}
 if(e.target.classList.contains('b')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openMenu(e.target.dataset.m,e.target.getBoundingClientRect())}
});
$('#main').addEventListener('paste',e=>{if(e.target.id!=='tx')return;const f=[...(e.clipboardData?.files||[])].find(f=>/^image\//.test(f.type));if(f){e.preventDefault();sendPhoto(f)}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){markRead();if(me)refreshChats()}});
setInterval(()=>{if(Object.keys(S.peers).length){renderHead();renderList()}},5000);

/* ---------- início ---------- */
function paintMe(){const p=person(me);$('#meAv').innerHTML=face(p.emoji,p.photo);$('#meAv').style.setProperty('--c',p.color)}
async function enter(){
 if(started)return;started=true;$('#auth').classList.add('off');
 $('#list').innerHTML='<div class="hint">Carregando conversas…</div>';
 const{data:p,error}=await sb.rpc('zap_me');
 if(error||!p){started=false;$('#auth').classList.remove('off');$('#aErr').textContent=errMsg(error,'Não consegui abrir seu perfil. O banco do Zap já foi instalado?');return}
 S.people[me]=p;paintMe();
 try{await Promise.all([loadChats(),loadBlocks()])}catch(e){$('#list').innerHTML='<div class="hint">Não consegui carregar as conversas. Confira a internet e recarregue.</div>'}
 startLive();enablePush(false);
 const h=location.hash.match(/^#c-([0-9a-f-]{36})$/);if(h&&chat(h[1])){openChat(h[1]);history.replaceState(null,'',location.pathname)}
 let seenW=false;try{seenW=!!localStorage.getItem('zap-w-'+me);localStorage.setItem('zap-w-'+me,'1')}catch(e){}
 if(!seenW&&Date.now()-ms(p.created_at)<600000)profileDlg(true);
}
function leave(){leaveCall(true);started=false;me=null;S.chats=[];S.people={};S.blocks=new Set();closeChat();live&&sb.removeChannel(live);live=null;
 for(const id of Object.keys(rooms)){sb.removeChannel(rooms[id]);delete rooms[id]}S.peers={};
 $('#auth').classList.remove('off');$('#list').innerHTML=''}
(async()=>{
 try{const r=await fetch('/api/config');const c=await r.json();if(!c.url||!c.anonKey)throw 0;DOMAIN=c.domain||DOMAIN;
  sb=supabase.createClient(c.url,c.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});
 }catch(e){$('#aErr').textContent='O site ainda não foi ligado ao Supabase. (Faltam as variáveis na Vercel.)';return}
 sb.auth.onAuthStateChange((ev,session)=>{const id=session?.user?.id||null;
  if(id&&id!==me){me=id;setTimeout(enter,0)}else if(!id&&me)leave()});
 const{data}=await sb.auth.getSession();if(!data.session)$('#aUser').focus();
})();
}
