
(function(){
'use strict';

const SUPABASE_URL='https://lqmfgxftazazqvultewm.supabase.co';
const SUPABASE_KEY='sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl';
const APP_URL='https://lsueyras.github.io/pesocare/';
const BRAND_LOGO_URL=APP_URL+'brand-logo.png';
const APP_VERSION='14.2';
const SESSION_KEY='pesocare_session_v2';
const REMEMBER_KEY='pesocare_remember_me';
const SIGNUP_COOLDOWN_KEY='pesocare_signup_cooldown_until';

const app=document.getElementById('app');
let session=null, currentUser=null, profile=null, records=[];
let account=null, roles=[], activePortal='PATIENT';
let careLinks=[], linkedDoctorProfiles=[], patientPrescriptions=[], patientMessages=[], supportTickets=[];
let doctorProfile=null, doctorPatients=[], doctorPatientDetail=null;
let adminUsers=[], adminTickets=[], adminLoaded=false;
let editingPrescriptionId=null;
let notifications=[];
let realtimeSocket=null, realtimeHeartbeat=null, realtimeReconnectTimer=null;
let realtimeAttempts=0, realtimeRef=0, realtimeJoinRef=null, realtimeTopic=null;
let realtimeStatus='offline', realtimeManuallyStopped=false;
let realtimeFallbackTimer=null;

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const parseDate=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
const fmt=s=>{if(!s)return '—';const[y,m,d]=s.split('-');return `${d}/${m}/${y}`};
const parseDecimal=value=>{
  const normalized=String(value??'').trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
};
const kg=n=>Number(n).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:2})+' kg';
const cm=n=>n===null||n===undefined||n===''?'—':Number(n).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})+' cm';
const weekOf=date=>profile?Math.max(0,Math.floor((parseDate(date)-parseDate(profile.start_date))/(7*86400000))):0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function shell(content){
  return `<main class="shell">${content}<div class="footer">PesoCare · Seguimiento personal de peso · v${APP_VERSION}</div></main>`;
}

function authHeaders(token){
  const h={'apikey':SUPABASE_KEY,'Content-Type':'application/json'};
  if(token) h.Authorization='Bearer '+token;
  return h;
}

async function jsonFetch(url,opts={}){
  const res=await fetch(url,opts);
  let data=null;
  const text=await res.text();
  if(text){try{data=JSON.parse(text)}catch{data=text}}
  if(!res.ok){
    const msg=data?.msg||data?.message||data?.error_description||data?.error||`Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function getRememberPreference(){
  const saved=localStorage.getItem(REMEMBER_KEY);
  return saved===null ? true : saved==='true';
}

function saveRememberPreference(value){
  localStorage.setItem(REMEMBER_KEY,value?'true':'false');
}

function saveSession(s,remember=getRememberPreference()){
  session=s;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  if(!s) return;
  const target=remember ? localStorage : sessionStorage;
  target.setItem(SESSION_KEY,JSON.stringify(s));
}

function clearStoredSession(){
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function getStoredSession(){
  try{
    const persistent=localStorage.getItem(SESSION_KEY);
    if(persistent) return JSON.parse(persistent);
    const temporary=sessionStorage.getItem(SESSION_KEY);
    if(temporary) return JSON.parse(temporary);
    return null;
  }catch{
    return null;
  }
}

function captureConfirmationHash(){
  if(!location.hash||!location.hash.includes('access_token='))return false;
  const p=new URLSearchParams(location.hash.slice(1));
  const access_token=p.get('access_token');
  const refresh_token=p.get('refresh_token');
  const expires_in=Number(p.get('expires_in')||3600);
  if(access_token){
    saveSession({access_token,refresh_token,expires_at:Date.now()+expires_in*1000},getRememberPreference());
    history.replaceState(null,'',location.pathname+location.search);
    return true;
  }
  return false;
}

async function refreshSession(){
  if(!session?.refresh_token)return false;
  try{
    const data=await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',headers:authHeaders(),body:JSON.stringify({refresh_token:session.refresh_token})
    });
    saveSession({
      access_token:data.access_token,
      refresh_token:data.refresh_token||session.refresh_token,
      expires_at:Date.now()+Number(data.expires_in||3600)*1000
    });
    try{sendRealtimeAccessToken()}catch{}
    return true;
  }catch{clearStoredSession();session=null;return false}
}

async function ensureSession(){
  session=getStoredSession();
  if(!session)return false;
  if(session.expires_at && Date.now()>session.expires_at-60000){
    if(!(await refreshSession()))return false;
  }
  try{
    currentUser=await jsonFetch(`${SUPABASE_URL}/auth/v1/user`,{headers:authHeaders(session.access_token)});
    return true;
  }catch{
    if(await refreshSession()){
      try{
        currentUser=await jsonFetch(`${SUPABASE_URL}/auth/v1/user`,{headers:authHeaders(session.access_token)});
        return true;
      }catch{}
    }
    clearStoredSession();session=null;currentUser=null;return false;
  }
}

async function dbGet(path){
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{...authHeaders(session.access_token),'Accept':'application/json'}});
}
async function dbInsert(table,obj){
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`,{
    method:'POST',
    headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
    body:JSON.stringify(obj)
  });
}
async function dbUpdate(table,filter,obj){
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`,{
    method:'PATCH',
    headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
    body:JSON.stringify(obj)
  });
}



async function dbRpc(name,params={}){
  try{
    return await jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
      body:JSON.stringify(params)
    });
  }catch(err){
    const raw=String(err?.message||err);
    const friendly=
      /only the sender/i.test(raw)?'Solo puedes eliminar mensajes que tú enviaste.':
      /care link inactive/i.test(raw)?'La relación médico-paciente ya no está activa.':
      /not a participant/i.test(raw)?'No tienes permiso para modificar esta conversación.':
      /prescription not found/i.test(raw)?'No se encontró la indicación. Actualiza la pantalla e inténtalo nuevamente.':
      /message not found/i.test(raw)?'No se encontró el mensaje. Es posible que ya haya sido eliminado.':
      /not authorized/i.test(raw)?'Tu sesión no tiene autorización para realizar esta acción.':
      raw;
    throw new Error(friendly);
  }
}

async function invokeFunction(name,body){
  const res=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{
    method:'POST',
    headers:{...authHeaders(session?.access_token),'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const text=await res.text();
  let data={};
  if(text){try{data=JSON.parse(text)}catch{data={error:text}}}
  if(!res.ok)throw new Error(data?.error||`Error ${res.status}`);
  return data;
}

const hasRole=role=>roles.includes(role);

function portalTabs(){
  const available=[
    ['PATIENT','Mi seguimiento'],
    ['DOCTOR','Médico'],
    ['ADMIN','Administración']
  ].filter(([role])=>hasRole(role));
  if(available.length<=1)return '';
  return `<div class="portal-tabs">${available.map(([role,label])=>
    `<button type="button" class="portal-tab ${activePortal===role?'active':''}" data-portal="${role}">${label}</button>`
  ).join('')}</div>`;
}

function bindCommonHeader(){
  document.getElementById('logout')?.addEventListener('click',logout);
  document.getElementById('notificationBtn')?.addEventListener('click',showNotificationCenter);
  updateHeaderNotificationUI();
  document.querySelectorAll('[data-portal]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const portal=btn.dataset.portal;
      if(!portal||!hasRole(portal))return;
      activePortal=portal;
      localStorage.setItem('pesocare_active_portal',portal);
      doctorPatientDetail=null;
      render();
    });
  });
}

function suspendedView(){
  app.innerHTML=shell(`${header()}
    <section class="card">
      <h2 class="section-title">Cuenta suspendida</h2>
      <p class="muted">Tu cuenta está temporalmente suspendida. Contacta al soporte de PesoCare para revisar el acceso.</p>
    </section>`);
  bindCommonHeader();
}

function roleBadge(role){
  const labels={PATIENT:'Paciente',DOCTOR:'Médico',ADMIN:'Admin'};
  return `<span class="role-badge role-${role.toLowerCase()}">${labels[role]||role}</span>`;
}

function formatDateTime(value){
  if(!value)return '—';
  try{return new Date(value).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'})}catch{return value}
}


function unreadCount(){
  return notifications.filter(n=>!n.read_at).length;
}

function notificationIcon(type){
  const icons={
    NEW_MESSAGE:'💬',
    MESSAGE_DELETED:'🗑️',
    CONVERSATION_CLEARED:'🧹',
    NEW_PRESCRIPTION:'📋',
    PRESCRIPTION_UPDATED:'✏️',
    PRESCRIPTION_REMOVED:'🗑️',
    NEW_WEIGHT:'⚖️',
    NEW_PATIENT:'👤',
    SUPPORT:'🛠️'
  };
  return icons[type]||'🔔';
}

function userIsTyping(){
  const a=document.activeElement;
  return !!(a && ['INPUT','TEXTAREA','SELECT'].includes(a.tagName));
}

function updateHeaderNotificationUI(){
  const badge=document.getElementById('notificationBadge');
  const count=unreadCount();
  if(badge){
    badge.textContent=count>99?'99+':String(count);
    badge.classList.toggle('hidden-badge',count===0);
  }
  const dot=document.getElementById('realtimeDot');
  const text=document.getElementById('realtimeText');
  if(dot){
    dot.className=`live-dot ${realtimeStatus==='live'?'online':realtimeStatus==='connecting'?'connecting':'offline'}`;
  }
  if(text){
    text.textContent=realtimeStatus==='live'?'En vivo':realtimeStatus==='connecting'?'Conectando…':'Sin conexión';
  }
}

function showToast(title,body,type=''){
  let holder=document.getElementById('toastContainer');
  if(!holder){
    holder=document.createElement('div');
    holder.id='toastContainer';
    holder.className='toast-container';
    document.body.appendChild(holder);
  }
  const toast=document.createElement('button');
  toast.type='button';
  toast.className='app-toast';
  toast.innerHTML=`<span class="toast-icon">${notificationIcon(type)}</span><span><strong>${esc(title)}</strong><small>${esc(body||'')}</small></span>`;
  holder.prepend(toast);
  requestAnimationFrame(()=>toast.classList.add('show'));
  const remove=()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),250)};
  const timer=setTimeout(remove,5200);
  toast.addEventListener('click',()=>{clearTimeout(timer);remove();showNotificationCenter()});
}

async function loadNotifications(){
  if(!currentUser?.id||!session?.access_token){notifications=[];return}
  try{
    notifications=await dbGet(`user_notifications?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc&limit=50`)||[];
  }catch(err){
    console.warn('Notifications unavailable',err);
    notifications=[];
  }
}

async function markNotificationRead(id){
  const item=notifications.find(n=>n.id===id);
  if(!item||item.read_at)return;
  const readAt=new Date().toISOString();
  item.read_at=readAt;
  updateHeaderNotificationUI();
  try{
    await dbUpdate('user_notifications',`id=eq.${encodeURIComponent(id)}`,{read_at:readAt});
  }catch(err){console.warn(err)}
}

async function markAllNotificationsRead(){
  const unread=notifications.filter(n=>!n.read_at);
  if(!unread.length)return;
  const readAt=new Date().toISOString();
  unread.forEach(n=>n.read_at=readAt);
  updateHeaderNotificationUI();
  try{
    await dbUpdate('user_notifications',`user_id=eq.${encodeURIComponent(currentUser.id)}&read_at=is.null`,{read_at:readAt});
  }catch(err){console.warn(err)}
  renderNotificationList();
}

function notificationDestinationLabel(n){
  const map={
    NEW_MESSAGE:'Abrir conversación',
    MESSAGE_DELETED:'Abrir conversación',
    CONVERSATION_CLEARED:'Abrir conversación',
    NEW_PRESCRIPTION:'Ver indicación',
    PRESCRIPTION_UPDATED:'Ver indicación',
    PRESCRIPTION_REMOVED:'Abrir seguimiento',
    NEW_WEIGHT:'Abrir paciente',
    NEW_PATIENT:'Ver pacientes',
    SUPPORT:'Abrir soporte'
  };
  return map[n.type]||'Abrir';
}

function notificationCenterMarkup(){
  const list=notifications.slice(0,40);
  return `<div class="notification-overlay" id="notificationOverlay">
    <aside class="notification-panel" role="dialog" aria-modal="true" aria-label="Notificaciones">
      <div class="notification-panel-head">
        <div>
          <h3>Notificaciones</h3>
          <span>${unreadCount()} sin leer</span>
        </div>
        <button class="icon-button" id="closeNotifications" aria-label="Cerrar">×</button>
      </div>
      <div class="notification-tools">
        <span class="realtime-pill"><i class="live-dot ${realtimeStatus==='live'?'online':realtimeStatus==='connecting'?'connecting':'offline'}"></i>${realtimeStatus==='live'?'Actualización en vivo':'Reconectando'}</span>
        <button class="linkbtn" id="markAllRead">Marcar todas como leídas</button>
      </div>
      <div id="notificationList" class="notification-list">
        ${list.length?list.map(notificationItemMarkup).join(''):'<div class="empty-state notification-empty">No tienes notificaciones.</div>'}
      </div>
    </aside>
  </div>`;
}

function notificationItemMarkup(n){
  return `<button type="button" class="notification-item ${n.read_at?'':'unread'}" data-notification-id="${n.id}">
    <span class="notification-item-icon">${notificationIcon(n.type)}</span>
    <span class="notification-item-content">
      <strong>${esc(n.title)}</strong>
      <span>${esc(n.body||'')}</span>
      <small>${formatDateTime(n.created_at)} · ${notificationDestinationLabel(n)}</small>
    </span>
    ${n.read_at?'':'<i class="unread-dot"></i>'}
  </button>`;
}

function renderNotificationList(){
  const el=document.getElementById('notificationList');
  if(!el)return;
  el.innerHTML=notifications.length?notifications.slice(0,40).map(notificationItemMarkup).join(''):'<div class="empty-state notification-empty">No tienes notificaciones.</div>';
  document.querySelectorAll('[data-notification-id]').forEach(btn=>{
    btn.addEventListener('click',()=>openNotificationById(btn.dataset.notificationId));
  });
  const subtitle=document.querySelector('.notification-panel-head span');
  if(subtitle)subtitle.textContent=`${unreadCount()} sin leer`;
}

function showNotificationCenter(){
  document.getElementById('notificationOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend',notificationCenterMarkup());
  document.getElementById('closeNotifications')?.addEventListener('click',()=>document.getElementById('notificationOverlay')?.remove());
  document.getElementById('notificationOverlay')?.addEventListener('click',e=>{
    if(e.target?.id==='notificationOverlay')document.getElementById('notificationOverlay')?.remove();
  });
  document.getElementById('markAllRead')?.addEventListener('click',markAllNotificationsRead);
  renderNotificationList();
}

async function openNotificationById(id){
  const n=notifications.find(x=>x.id===id);
  if(!n)return;
  await markNotificationRead(id);
  document.getElementById('notificationOverlay')?.remove();

  if(['NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'].includes(n.type)){
    if(hasRole('DOCTOR') && n.related_user_id && n.related_user_id!==currentUser.id){
      activePortal='DOCTOR';
      localStorage.setItem('pesocare_active_portal','DOCTOR');
      await openDoctorPatient(n.related_user_id);
      return;
    }
    if(hasRole('PATIENT')){
      activePortal='PATIENT';
      localStorage.setItem('pesocare_active_portal','PATIENT');
      await loadData();
      render();
      setTimeout(()=>document.getElementById('patientMessageText')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
      return;
    }
  }

  if(['NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'].includes(n.type) && hasRole('PATIENT')){
    activePortal='PATIENT';
    localStorage.setItem('pesocare_active_portal','PATIENT');
    await loadData();render();
    return;
  }

  if((n.type==='NEW_WEIGHT'||n.type==='NEW_PATIENT') && hasRole('DOCTOR')){
    activePortal='DOCTOR';
    localStorage.setItem('pesocare_active_portal','DOCTOR');
    if(n.type==='NEW_WEIGHT'&&n.related_user_id){
      await openDoctorPatient(n.related_user_id);
    }else{
      doctorPatientDetail=null;
      await loadData();render();
    }
    return;
  }

  if(n.type==='SUPPORT'&&hasRole('ADMIN')){
    activePortal='ADMIN';
    localStorage.setItem('pesocare_active_portal','ADMIN');
    adminLoaded=false;
    render();
    return;
  }

  await loadData();render();
}

function sendRealtimeAccessToken(){
  if(!realtimeSocket||realtimeSocket.readyState!==WebSocket.OPEN||!realtimeTopic||!session?.access_token)return;
  realtimeSocket.send(JSON.stringify({
    topic:realtimeTopic,
    event:'access_token',
    payload:{access_token:session.access_token},
    ref:String(++realtimeRef),
    join_ref:realtimeJoinRef
  }));
}

function stopRealtime(){
  realtimeManuallyStopped=true;
  if(realtimeReconnectTimer){clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null}
  if(realtimeHeartbeat){clearInterval(realtimeHeartbeat);realtimeHeartbeat=null}
  if(realtimeFallbackTimer){clearInterval(realtimeFallbackTimer);realtimeFallbackTimer=null}
  if(realtimeSocket){
    try{realtimeSocket.onclose=null;realtimeSocket.close(1000,'logout')}catch{}
  }
  realtimeSocket=null;
  realtimeStatus='offline';
  updateHeaderNotificationUI();
}

function scheduleRealtimeReconnect(){
  if(realtimeManuallyStopped||!currentUser?.id)return;
  const delays=[1000,2000,5000,10000];
  const delay=delays[Math.min(realtimeAttempts,delays.length-1)];
  realtimeAttempts+=1;
  realtimeStatus='connecting';
  updateHeaderNotificationUI();
  if(realtimeReconnectTimer)clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer=setTimeout(startRealtime,delay);
}

function startRealtime(){
  if(!currentUser?.id||!session?.access_token)return;
  if(realtimeSocket && (realtimeSocket.readyState===WebSocket.OPEN||realtimeSocket.readyState===WebSocket.CONNECTING))return;

  realtimeManuallyStopped=false;
  realtimeStatus='connecting';
  updateHeaderNotificationUI();

  const projectRef=new URL(SUPABASE_URL).hostname.split('.')[0];
  const url=`wss://${projectRef}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`;
  const ws=new WebSocket(url);
  realtimeSocket=ws;
  realtimeTopic=`realtime:pesocare-notifications-${currentUser.id}`;

  ws.onopen=()=>{
    realtimeAttempts=0;
    const ref=String(++realtimeRef);
    realtimeJoinRef=ref;
    ws.send(JSON.stringify({
      topic:realtimeTopic,
      event:'phx_join',
      payload:{
        config:{
          broadcast:{ack:false,self:false},
          presence:{enabled:false},
          postgres_changes:[{
            event:'INSERT',
            schema:'public',
            table:'user_notifications',
            filter:`user_id=eq.${currentUser.id}`
          }],
          private:false
        },
        access_token:session.access_token
      },
      ref,
      join_ref:ref
    }));

    if(realtimeHeartbeat)clearInterval(realtimeHeartbeat);
    realtimeHeartbeat=setInterval(()=>{
      if(ws.readyState===WebSocket.OPEN){
        ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++realtimeRef),join_ref:null}));
      }
    },20000);
  };

  ws.onmessage=e=>{
    let msg;
    try{msg=JSON.parse(e.data)}catch{return}
    if(msg.event==='phx_reply' && msg.ref===realtimeJoinRef && msg.payload?.status==='ok'){
      realtimeStatus='live';
      realtimeAttempts=0;
      updateHeaderNotificationUI();
      return;
    }
    if(msg.event==='system' && msg.payload?.status==='ok'){
      realtimeStatus='live';
      updateHeaderNotificationUI();
      return;
    }
    if(msg.event==='postgres_changes'){
      const n=msg.payload?.data?.record;
      if(n?.user_id===currentUser.id){
        handleRealtimeNotification(n);
      }
    }
  };

  ws.onerror=()=>{realtimeStatus='connecting';updateHeaderNotificationUI()};
  ws.onclose=()=>{
    if(realtimeHeartbeat){clearInterval(realtimeHeartbeat);realtimeHeartbeat=null}
    realtimeSocket=null;
    if(!realtimeManuallyStopped)scheduleRealtimeReconnect();
  };

  if(!realtimeFallbackTimer){
    realtimeFallbackTimer=setInterval(syncNotificationsFallback,20000);
  }
}

async function syncNotificationsFallback(){
  if(!currentUser?.id||!session?.access_token)return;
  try{
    const latest=await dbGet(`user_notifications?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc&limit=50`)||[];
    const known=new Set(notifications.map(n=>n.id));
    const fresh=latest.filter(n=>!known.has(n.id)).reverse();
    notifications=latest;
    updateHeaderNotificationUI();
    for(const n of fresh)await handleRealtimeNotification(n,true);
  }catch{}
}

async function handleRealtimeNotification(n,fromFallback=false){
  if(!n?.id)return;
  const exists=notifications.some(x=>x.id===n.id);
  if(!exists)notifications.unshift(n);
  updateHeaderNotificationUI();
  if(!fromFallback||!exists)showToast(n.title,n.body,n.type);

  try{
    if(['NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'].includes(n.type)){
      if(hasRole('PATIENT')&&n.related_user_id){
        patientMessages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
        renderPatientMessageThread();
      }
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id===n.related_user_id){
        doctorPatientDetail.messages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(n.related_user_id)}&doctor_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
        renderDoctorMessageThread();
      }
    }

    if(['NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'].includes(n.type)&&hasRole('PATIENT')){
      patientPrescriptions=await dbGet(`prescription_drafts?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.SHARED&deleted_at=is.null&order=created_at.desc`)||[];
      if(activePortal==='PATIENT'&&!userIsTyping())render();
    }

    if(n.type==='NEW_WEIGHT'&&hasRole('DOCTOR')){
      if(doctorPatientDetail?.profile?.user_id===n.related_user_id&&!userIsTyping()){
        await openDoctorPatient(n.related_user_id);
      }else if(activePortal==='DOCTOR'&&!doctorPatientDetail&&!userIsTyping()){
        await loadData();render();
      }
    }

    if(n.type==='NEW_PATIENT'&&hasRole('DOCTOR')&&activePortal==='DOCTOR'&&!userIsTyping()){
      await loadData();render();
    }

    if(n.type==='SUPPORT'&&hasRole('ADMIN')){
      adminLoaded=false;
      if(activePortal==='ADMIN'&&!userIsTyping())render();
    }
  }catch(err){console.warn('Realtime refresh failed',err)}
}

function renderDoctorMessageThread(){
  const el=document.getElementById('doctorMessageThread');
  if(!el||!doctorPatientDetail)return;
  const messages=doctorPatientDetail.messages||[];
  el.innerHTML=messages.length?messages.map(m=>`
    <div class="message-bubble ${m.sender_user_id===currentUser.id?'mine':'theirs'}">
      <div>${esc(m.message)}</div>
      <div class="message-meta"><span>${formatDateTime(m.created_at)}</span>${m.sender_user_id===currentUser.id?`<button type="button" class="message-delete" data-delete-message="${m.id}" data-message-context="doctor">Eliminar</button>`:''}</div>
    </div>`).join(''):'<div class="empty-state">Aún no hay mensajes.</div>';
  el.querySelectorAll('[data-delete-message]').forEach(btn=>btn.addEventListener('click',()=>deleteSentMessage(btn.dataset.deleteMessage,btn.dataset.messageContext)));
  el.scrollTop=el.scrollHeight;
}

function brandBlock(subtitle='Seguimiento personal'){
  return `<div class="brandrow brand-hero">
    <img src="${BRAND_LOGO_URL}" alt="Logo PesoCare" class="brand-image" onerror="this.style.display='none'">
    <div>
      <div class="brand">PesoCare</div>
      <div class="muted brand-subtitle">${esc(subtitle)}</div>
    </div>
  </div>`;
}


function getSignupCooldownSeconds(){
  const until=Number(localStorage.getItem(SIGNUP_COOLDOWN_KEY)||0);
  const remaining=Math.ceil((until-Date.now())/1000);
  return Math.max(0,remaining);
}

function setSignupCooldown(seconds=60){
  const safe=Math.max(1,Math.min(300,Number(seconds)||60));
  localStorage.setItem(SIGNUP_COOLDOWN_KEY,String(Date.now()+safe*1000));
}

function parseRetrySeconds(message){
  const m=String(message||'');
  const match=m.match(/after\s+(\d+)\s+seconds?/i);
  if(match) return Math.max(1,Number(match[1]));
  if(/security purposes|rate limit|too many requests/i.test(m)) return 60;
  return null;
}

function friendlyAuthError(message){
  const m=String(message||'');
  const retry=parseRetrySeconds(m);

  if(retry!==null){
    return `Por seguridad, debes esperar ${retry} segundo${retry===1?'':'s'} antes de solicitar otro correo de registro. Revisa primero tu bandeja de entrada y Spam.`;
  }
  if(/email not confirmed/i.test(m)){
    return 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada y Spam.';
  }
  if(/user already registered|already been registered|email.*registered/i.test(m)){
    return 'Este correo ya tiene una cuenta. Usa “Ingresar” o “Olvidé mi contraseña”.';
  }
  if(/invalid login credentials/i.test(m)){
    return 'Correo o contraseña incorrectos.';
  }
  return 'No fue posible completar la operación. Inténtalo nuevamente.';
}

let signupTimer=null;
function updateSignupCooldownUI(){
  const btn=document.getElementById('signup');
  if(!btn) return;

  const seconds=getSignupCooldownSeconds();
  if(signupTimer){
    clearInterval(signupTimer);
    signupTimer=null;
  }

  if(seconds<=0){
    btn.disabled=false;
    btn.textContent='Crear cuenta';
    return;
  }

  const render=()=>{
    const left=getSignupCooldownSeconds();
    if(left<=0){
      btn.disabled=false;
      btn.textContent='Crear cuenta';
      if(signupTimer){
        clearInterval(signupTimer);
        signupTimer=null;
      }
    }else{
      btn.disabled=true;
      btn.textContent=`Espera ${left} s`;
    }
  };

  render();
  signupTimer=setInterval(render,1000);
}

function loginView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card">
      ${brandBlock('Seguimiento personal · Salud y progreso')}
      <p class="muted">Registra tu peso, revisa tu historial, monitorea tu evolución semanal y comparte reportes con tu médico.</p>
      ${message?`<div class="notice success">${esc(message)}</div>`:''}
      <form id="authForm" style="margin-top:16px">
        <label>Correo</label>
        <input id="email" type="email" inputmode="email" autocomplete="email" required placeholder="tu@correo.com">

        <label style="margin-top:10px">Contraseña</label>
        <input id="password" type="password" autocomplete="current-password" minlength="6" required>

        <label class="remember-row">
          <input id="rememberMe" type="checkbox" ${getRememberPreference()?'checked':''}>
          <span>
            <strong>Recordarme en este dispositivo</strong>
            <small>No guardamos tu contraseña.</small>
          </span>
        </label>

        <div class="actions" style="margin-top:14px">
          <button class="primary" type="submit">Ingresar</button>
          <button class="secondary" type="button" id="signup">Crear cuenta</button>
        </div>

        <div style="margin-top:12px"><button type="button" class="linkbtn" id="forgot">Olvidé mi contraseña</button></div>
        <p id="authMsg" class="error"></p>
      </form>
    </section>`);
  document.getElementById('authForm').addEventListener('submit',e=>auth(e,false));
  document.getElementById('signup').addEventListener('click',e=>auth(e,true));
  document.getElementById('forgot').addEventListener('click',forgotPassword);
  updateSignupCooldownUI();
}

async function auth(e,signup){
  e.preventDefault();

  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  const remember=document.getElementById('rememberMe')?.checked ?? true;
  saveRememberPreference(remember);

  const msg=document.getElementById('authMsg');
  msg.textContent='';

  if(signup && getSignupCooldownSeconds()>0){
    updateSignupCooldownUI();
    msg.textContent='Espera unos segundos antes de solicitar otro correo de registro.';
    return;
  }

  try{
    if(signup){
      const url=`${SUPABASE_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(APP_URL)}`;
      const data=await jsonFetch(url,{
        method:'POST',
        headers:authHeaders(),
        body:JSON.stringify({email,password})
      });

      setSignupCooldown(60);
      updateSignupCooldownUI();

      if(data.access_token){
        saveSession({
          access_token:data.access_token,
          refresh_token:data.refresh_token,
          expires_at:Date.now()+Number(data.expires_in||3600)*1000
        },remember);

        await ensureSession();
        await loadData();
        render();
      }else{
        msg.className='notice success';
        msg.textContent='Solicitud recibida. Revisa tu correo y Spam para confirmar la cuenta. Por seguridad, un nuevo correo podrá solicitarse después de aproximadamente 60 segundos.';
      }
    }else{
      const data=await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
        method:'POST',
        headers:authHeaders(),
        body:JSON.stringify({email,password})
      });

      saveSession({
        access_token:data.access_token,
        refresh_token:data.refresh_token,
        expires_at:Date.now()+Number(data.expires_in||3600)*1000
      },remember);

      if(await ensureSession()){
        await loadData();
        render();
      }
    }
  }catch(err){
    const raw=String(err.message||err);
    const retry=parseRetrySeconds(raw);

    if(signup && retry!==null){
      setSignupCooldown(retry);
      updateSignupCooldownUI();
    }

    msg.className='error';
    msg.textContent=friendlyAuthError(raw);
  }
}

async function forgotPassword(){
  const email=document.getElementById('email').value.trim();
  const msg=document.getElementById('authMsg');

  if(!email){
    msg.className='error';
    msg.textContent='Ingresa primero tu correo.';
    return;
  }

  try{
    await jsonFetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(APP_URL)}`,{
      method:'POST',
      headers:authHeaders(),
      body:JSON.stringify({email})
    });

    msg.className='notice success';
    msg.textContent='Te enviamos un correo para recuperar tu contraseña. Revisa también Spam.';
  }catch(err){
    msg.className='error';
    msg.textContent=friendlyAuthError(String(err.message||err));
  }
}

async function loadData(){
  const a=await dbGet(`user_accounts?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
  account=a?.[0]||null;
  const rr=await dbGet(`user_roles?select=role&user_id=eq.${encodeURIComponent(currentUser.id)}`)||[];
  roles=rr.map(r=>r.role);
  await loadNotifications();

  const storedPortal=localStorage.getItem('pesocare_active_portal');
  if(storedPortal&&roles.includes(storedPortal))activePortal=storedPortal;
  else if(roles.includes('PATIENT'))activePortal='PATIENT';
  else if(roles.includes('DOCTOR'))activePortal='DOCTOR';
  else if(roles.includes('ADMIN'))activePortal='ADMIN';

  profile=null;records=[];careLinks=[];linkedDoctorProfiles=[];
  patientPrescriptions=[];patientMessages=[];supportTickets=[];
  doctorProfile=null;doctorPatients=[];

  if(account?.status!=='ACTIVE')return;

  if(hasRole('PATIENT')){
    const p=await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
    profile=p?.[0]||null;
    if(profile){
      records=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=measured_on.asc,created_at.asc`)||[];
    }

    careLinks=await dbGet(`doctor_patient_links?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.ACTIVE&order=created_at.asc`)||[];
    if(careLinks.length){
      const ids=careLinks.map(l=>l.doctor_user_id).join(',');
      linkedDoctorProfiles=await dbGet(`doctor_profiles?select=*&user_id=in.(${ids})`)||[];
      patientMessages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
      patientPrescriptions=await dbGet(`prescription_drafts?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.SHARED&deleted_at=is.null&order=created_at.desc`)||[];
    }
    supportTickets=await dbGet(`support_tickets?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc`)||[];
  }

  if(hasRole('DOCTOR')){
    const dp=await dbGet(`doctor_profiles?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
    doctorProfile=dp?.[0]||null;
    const links=await dbGet(`doctor_patient_links?select=*&doctor_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.ACTIVE&order=created_at.asc`)||[];
    if(links.length){
      const ids=links.map(l=>l.patient_user_id).join(',');
      const patientProfiles=await dbGet(`profiles?select=*&user_id=in.(${ids})`)||[];
      doctorPatients=links.map(l=>({link:l,profile:patientProfiles.find(p=>p.user_id===l.patient_user_id)||null}));
    }
  }
}

function render(){
  let result;
  if(account?.status!=='ACTIVE')result=suspendedView();
  else if(activePortal==='ADMIN'&&hasRole('ADMIN'))result=adminView();
  else if(activePortal==='DOCTOR'&&hasRole('DOCTOR')){
    result=doctorPatientDetail?doctorPatientDetailView():doctorView();
  }else result=profile?dashboardView():initialProfileView();
  setTimeout(startRealtime,0);
  return result;
}

function header(){
  const display=doctorProfile?.display_name||profile?.full_name||account?.display_name||currentUser?.email||'';
  const count=unreadCount();
  return `<div class="top">
    <div class="brandrow">
      <img src="${BRAND_LOGO_URL}" alt="Logo PesoCare" class="brand-image brand-image-small" onerror="this.style.display='none'">
      <div><div class="brand">PesoCare</div><div class="muted">${esc(display)}</div></div>
    </div>
    <div class="top-actions">
      <span class="realtime-indicator" title="Estado de actualización">
        <i id="realtimeDot" class="live-dot ${realtimeStatus==='live'?'online':realtimeStatus==='connecting'?'connecting':'offline'}"></i>
        <span id="realtimeText">${realtimeStatus==='live'?'En vivo':realtimeStatus==='connecting'?'Conectando…':'Sin conexión'}</span>
      </span>
      <button class="notification-button" id="notificationBtn" type="button" aria-label="Notificaciones">
        <span aria-hidden="true">🔔</span>
        <b id="notificationBadge" class="notification-badge ${count?'':'hidden-badge'}">${count>99?'99+':count}</b>
      </button>
      <button class="secondary" id="logout">Salir</button>
    </div>
  </div>${portalTabs()}`;
}

function initialProfileView(){
  app.innerHTML=shell(`${header()}
    <section class="card">
      <h2 class="section-title">Datos iniciales</h2>
      <p class="muted">Estos datos crearán automáticamente tu primer registro como Semana 0.</p>
      <form id="profileForm">
        <div class="grid">
          <div><label>Nombre completo</label><input id="name" required></div>
          <div><label>Fecha de nacimiento</label><input id="birth" type="date"></div>
          <div><label>Fecha de inicio</label><input id="start" type="date" value="${today()}" required></div>
          <div><label>Duración del seguimiento (semanas)</label><input id="weeks" type="number" min="1" max="104" value="16" required></div>
          <div><label>Peso inicial (kg)</label><input id="initial" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 82,45" required></div>
          <div><label>Peso meta (kg)</label><input id="target" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 70,00"></div>
          <div><label>Circunferencia abdominal inicial (cm)</label><input id="initialAbdomen" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 102,35" required></div>
        </div>
        <button class="primary" style="margin-top:14px">Crear seguimiento</button>
        <p id="profileMsg" class="error"></p>
      </form>
    </section>`);
  document.getElementById('profileForm').addEventListener('submit',createProfile);
  bindCommonHeader();
}

async function createProfile(e){
  e.preventDefault();
  const msg=document.getElementById('profileMsg');
  msg.textContent='';

  const initialWeight=parseDecimal(document.getElementById('initial').value);
  const targetRaw=document.getElementById('target').value.trim();
  const targetWeight=targetRaw?parseDecimal(targetRaw):null;
  const initialAbdomen=parseDecimal(document.getElementById('initialAbdomen').value);

  if(!Number.isFinite(initialWeight)||initialWeight<20||initialWeight>350){
    msg.textContent='Ingresa un peso inicial válido. Puedes usar coma o punto y hasta 2 decimales.';
    return;
  }
  if(targetRaw && (!Number.isFinite(targetWeight)||targetWeight<20||targetWeight>350)){
    msg.textContent='Ingresa un peso meta válido. Puedes usar coma o punto y hasta 2 decimales.';
    return;
  }
  if(!Number.isFinite(initialAbdomen)||initialAbdomen<30||initialAbdomen>250){
    msg.textContent='Ingresa una circunferencia abdominal válida entre 30 y 250 cm, con hasta 2 decimales.';
    return;
  }

  const p={
    user_id:currentUser.id,
    full_name:document.getElementById('name').value.trim(),
    birth_date:document.getElementById('birth').value||null,
    start_date:document.getElementById('start').value,
    planned_weeks:Number(document.getElementById('weeks').value),
    initial_weight_kg:initialWeight,
    target_weight_kg:targetWeight,
    initial_abdominal_circumference_cm:initialAbdomen
  };

  try{
    const arr=await dbInsert('profiles',p);
    profile=arr[0];
    await dbInsert('weight_records',{
      user_id:currentUser.id,
      measured_on:p.start_date,
      weight_kg:p.initial_weight_kg,
      abdominal_circumference_cm:p.initial_abdominal_circumference_cm,
      is_initial:true
    });
    await loadData();
    render();
  }catch(err){
    msg.textContent='No fue posible crear el seguimiento: '+err.message;
  }
}

function dashboardView(){
  const sorted=[...records].sort((a,b)=>a.measured_on.localeCompare(b.measured_on)||String(a.created_at).localeCompare(String(b.created_at)));
  const latest=sorted.at(-1);
  if(!latest){app.innerHTML=shell(`${header()}<section class="card"><div class="error">No se encontró el registro inicial.</div></section>`);return}
  const change=Number(latest.weight_kg)-Number(profile.initial_weight_kg);
  const goal=profile.target_weight_kg?Number(profile.target_weight_kg):null;
  const latestWithAbdomen=[...sorted].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);
  const currentAbdomen=latestWithAbdomen?Number(latestWithAbdomen.abdominal_circumference_cm):null;
  const initialAbdomen=profile.initial_abdominal_circumference_cm!==null&&profile.initial_abdominal_circumference_cm!==undefined?Number(profile.initial_abdominal_circumference_cm):null;
  const abdomenChange=currentAbdomen!==null&&initialAbdomen!==null?currentAbdomen-initialAbdomen:null;
  const currentWeek=weekOf(latest.measured_on);
  const progress=Math.min(100,Math.max(0,(currentWeek/Math.max(1,profile.planned_weeks))*100));
  app.innerHTML=shell(`${header()}
    <section class="card">
      <div class="top" style="margin-bottom:6px">
        <div><h2 class="section-title">Hola, ${esc(profile.full_name.split(' ')[0])}</h2><div class="muted">Seguimiento de ${profile.planned_weeks} semanas · Inicio ${fmt(profile.start_date)}</div></div>
        <div class="actions">
          <button id="reportBtn" class="primary">Generar PDF</button>
          <button id="editPlan" class="secondary">Editar plan</button>
        </div>
      </div><div class="progress"><div style="width:${progress}%"></div></div>
    </section>
    <section class="metrics">
      <div class="metric"><span>Peso actual</span><strong>${kg(latest.weight_kg)}</strong></div>
      <div class="metric"><span>Cambio peso</span><strong>${change>0?'+':''}${change.toFixed(2)} kg</strong></div>
      <div class="metric"><span>Cintura actual</span><strong>${cm(currentAbdomen)}</strong></div>
      <div class="metric"><span>Cambio cintura</span><strong>${abdomenChange===null?'—':`${abdomenChange>0?'+':''}${abdomenChange.toFixed(2)} cm`}</strong></div>
      <div class="metric"><span>Semana</span><strong>${currentWeek} / ${profile.planned_weeks}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${goal?kg(goal):'—'}</strong></div>
    </section>
    <section class="card">
      <h2 class="section-title">Registrar peso</h2>
      <p class="muted">La fecha de hoy viene propuesta. Puedes cambiarla para registrar un dato anterior.</p>
      <form id="weightForm"><div class="record-grid">
        <div class="record-field">
          <label for="date">Fecha</label>
          <div class="control-frame">
            <input id="date" type="date" value="${today()}" required>
          </div>
        </div>
        <div class="record-field">
          <label for="weight">Peso (kg)</label>
          <div class="control-frame">
            <input id="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 94,85" required>
          </div>
        </div>
        <div class="record-field">
          <label for="abdomen">Circunferencia abdominal (cm)</label>
          <div class="control-frame">
            <input id="abdomen" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 111,50" required>
          </div>
        </div>
      </div><button class="primary" style="margin-top:12px">Guardar registro</button><p id="weightMsg" class="error"></p></form>
    </section>
    <section class="card">
      <h2 class="section-title">Peso por semana</h2>
      <div class="muted">Evolución desde Semana 0 hasta Semana ${profile.planned_weeks}</div>
      <div id="chart" class="chart-wrap"></div>
    </section>
    <section class="card">
      <h2 class="section-title">Circunferencia abdominal por semana</h2>
      <div class="muted">Evolución en centímetros durante el seguimiento</div>
      <div id="abdomenChart" class="chart-wrap"></div>
    </section>
    <section class="card">
      <h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Circ. abdominal</th></tr></thead>
      <tbody>${sorted.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOf(r.measured_on)}</td><td>${kg(r.weight_kg)}</td><td>${cm(r.abdominal_circumference_cm)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="card">
      <h2 class="section-title">Mi equipo médico</h2>
      <div class="muted">Autoriza a un médico para revisar tu seguimiento.</div>
      ${linkedDoctorProfiles.length
        ? linkedDoctorProfiles.map(d=>`
          <div class="doctor-row">
            <div>
              <strong>${esc(d.display_name||'Médico')}</strong>
              <div class="muted">${esc(d.specialty||'Especialidad pendiente')}${d.clinic_name?` · ${esc(d.clinic_name)}`:''}</div>
              <div class="integration-note">Validación RNPI: ${d.verification_status==='VERIFIED'?'verificada':'integración pendiente'}</div>
            </div>
            <button type="button" class="secondary small-btn" data-revoke-doctor="${d.user_id}">Desvincular</button>
          </div>`).join('')
        : '<div class="empty-state">Aún no has vinculado un médico.</div>'}
      <form id="linkDoctorForm" class="inline-form">
        <input id="doctorEmail" type="email" placeholder="Correo del médico" required>
        <button class="secondary" type="submit">Vincular médico</button>
      </form>
      <p id="doctorLinkMsg" class="error"></p>
    </section>

    <section class="card">
      <h2 class="section-title">Indicaciones compartidas</h2>
      <div class="integration-note">La receta electrónica, firma y conexión SNRE quedan pendientes. Las indicaciones compartidas funcionan dentro de PesoCare, pero todavía no sustituyen una receta oficial.</div>
      ${patientPrescriptions.length
        ? patientPrescriptions.map(p=>`
          <div class="prescription-card">
            <div class="prescription-title">${esc(p.medication_name)}</div>
            <div><strong>Dosis:</strong> ${esc(p.dose_text)}</div>
            <div><strong>Frecuencia:</strong> ${esc(p.frequency_text)}</div>
            ${p.duration_text?`<div><strong>Duración:</strong> ${esc(p.duration_text)}</div>`:''}
            ${p.instructions?`<div class="muted">${esc(p.instructions)}</div>`:''}
            <div class="small-muted">Versión ${p.revision||1} · integración legal pendiente</div>
          </div>`).join('')
        : '<div class="empty-state">No tienes indicaciones compartidas.</div>'}
    </section>

    <section class="card">
      <h2 class="section-title">Mensajes con tu médico</h2>
      ${linkedDoctorProfiles.length?`
        <select id="patientDoctorSelect">
          ${linkedDoctorProfiles.map(d=>`<option value="${d.user_id}">${esc(d.display_name||'Médico')}</option>`).join('')}
        </select>
        <div id="patientMessageThread" class="message-thread"></div>
        <form id="patientMessageForm" class="message-form">
          <textarea id="patientMessageText" rows="3" maxlength="4000" placeholder="Escribe un mensaje..." required></textarea>
          <button class="primary" type="submit">Enviar mensaje</button>
        </form>
        <div class="conversation-tools"><button type="button" class="link-danger" id="patientClearConversation">Eliminar historial de conversación</button></div>`
      :'<div class="empty-state">Vincula un médico para habilitar mensajería.</div>'}
    </section>

    <section class="card">
      <h2 class="section-title">Soporte PesoCare</h2>
      <p class="muted">Reporta un problema directamente desde la aplicación.</p>
      <form id="supportForm">
        <div class="grid">
          <div><label>Asunto</label><input id="supportSubject" required placeholder="Ej: No puedo registrar un dato"></div>
          <div><label>Descripción</label><textarea id="supportDescription" rows="3" required></textarea></div>
        </div>
        <button class="secondary" type="submit" style="margin-top:12px">Enviar soporte</button>
        <p id="supportMsg" class="error"></p>
      </form>
      ${supportTickets.length?`<div class="ticket-list">${supportTickets.slice(0,5).map(t=>`
        <div class="ticket-row"><strong>${esc(t.subject)}</strong><span class="status-chip status-${t.status.toLowerCase()}">${t.status}</span></div>`).join('')}</div>`:''}
    </section>`);
  document.getElementById('weightForm').addEventListener('submit',addWeight);
  document.getElementById('reportBtn').addEventListener('click',generateReport);
  document.getElementById('editPlan').addEventListener('click',editPlan);
  bindCommonHeader();
  bindPatientCare();
  drawCharts(sorted);
  renderPatientMessageThread();
}


function getWeeklyLatest(sorted, field){
  const weekly=new Map();
  sorted.forEach(r=>{
    const w=weekOf(r.measured_on);
    const raw=r[field];
    if(w<=profile.planned_weeks && raw!==null && raw!==undefined && raw!==''){
      weekly.set(w,Number(raw));
    }
  });
  return [...weekly.entries()].sort((a,b)=>a[0]-b[0]);
}

function buildChartSvg(points, options={}){
  if(!points.length) return '<div class="muted">Aún no hay datos suficientes.</div>';

  const {
    goal=null,
    yLabel='',
    valueSuffix='',
    decimals=2,
    lineClass='chart-line',
    pointClass='chart-point',
    goalClass='chart-goal',
    ariaLabel='Gráfico'
  }=options;

  const vals=points.map(p=>p[1]).concat(goal!==null?[Number(goal)]:[]);
  let min=Math.min(...vals),max=Math.max(...vals);

  if(max-min<4){
    min-=2; max+=2;
  }else{
    const pad=(max-min)*0.15;
    min-=pad; max+=pad;
  }

  const W=760,H=330,L=58,R=18,T=20,B=50,iw=W-L-R,ih=H-T-B;
  const x=w=>L+(w/Math.max(1,profile.planned_weeks))*iw;
  const y=v=>T+((max-v)/(max-min))*ih;

  let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;

  const yTicks=5;
  for(let i=0;i<=yTicks;i++){
    const v=max-(max-min)*i/yTicks;
    const yy=T+ih*i/yTicks;
    svg+=`<line class="chart-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/>`;
    svg+=`<text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${v.toFixed(decimals)}</text>`;
  }

  const step=profile.planned_weeks<=16?2:profile.planned_weeks<=32?4:Math.ceil(profile.planned_weeks/8);
  for(let w=0;w<=profile.planned_weeks;w+=step){
    const xx=x(w);
    svg+=`<line class="chart-grid" x1="${xx}" y1="${T}" x2="${xx}" y2="${T+ih}"/>`;
    svg+=`<text class="chart-label" x="${xx}" y="${H-22}" text-anchor="middle">${w}</text>`;
  }
  if(profile.planned_weeks%step!==0){
    svg+=`<text class="chart-label" x="${x(profile.planned_weeks)}" y="${H-22}" text-anchor="middle">${profile.planned_weeks}</text>`;
  }

  if(goal!==null){
    svg+=`<line class="${goalClass}" x1="${L}" y1="${y(Number(goal))}" x2="${W-R}" y2="${y(Number(goal))}"/>`;
  }

  const path=points.map(([w,v],i)=>`${i?'L':'M'} ${x(w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  svg+=`<path class="${lineClass}" d="${path}"/>`;

  points.forEach(([w,v])=>{
    svg+=`<circle class="${pointClass}" cx="${x(w)}" cy="${y(v)}" r="5"><title>Semana ${w}: ${v.toFixed(decimals)} ${valueSuffix}</title></circle>`;
  });

  svg+=`<text class="chart-label" x="${L+iw/2}" y="${H-4}" text-anchor="middle">Semanas</text>`;
  svg+=`<text class="chart-label" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  svg+='</svg>';

  return svg;
}

function drawCharts(sorted){
  const weightPoints=getWeeklyLatest(sorted,'weight_kg');
  const abdomenPoints=getWeeklyLatest(sorted,'abdominal_circumference_cm');

  const weightEl=document.getElementById('chart');
  if(weightEl){
    weightEl.innerHTML=
      buildChartSvg(weightPoints,{
        goal:profile.target_weight_kg?Number(profile.target_weight_kg):null,
        yLabel:'Peso (kg)',
        valueSuffix:'kg',
        decimals:2,
        ariaLabel:'Gráfico de evolución de peso'
      })+
      `<div class="legend"><span><i class="legend-dot"></i>Peso</span>${profile.target_weight_kg?'<span><i class="legend-goal"></i>Meta</span>':''}</div>`;
  }

  const abdomenEl=document.getElementById('abdomenChart');
  if(abdomenEl){
    abdomenEl.innerHTML=
      buildChartSvg(abdomenPoints,{
        yLabel:'Circunferencia (cm)',
        valueSuffix:'cm',
        decimals:2,
        lineClass:'chart-line-abdomen',
        pointClass:'chart-point-abdomen',
        ariaLabel:'Gráfico de evolución de circunferencia abdominal'
      })+
      `<div class="legend"><span><i class="legend-dot abdomen"></i>Circunferencia abdominal</span></div>`;
  }
}

function buildPrintableReport(sorted){
  const latest=sorted.at(-1);
  const latestWithAbdomen=[...sorted].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);
  const currentAbdomen=latestWithAbdomen?Number(latestWithAbdomen.abdominal_circumference_cm):null;
  const initialAbdomen=profile.initial_abdominal_circumference_cm!==null&&profile.initial_abdominal_circumference_cm!==undefined
    ?Number(profile.initial_abdominal_circumference_cm):null;

  const weightPoints=getWeeklyLatest(sorted,'weight_kg');
  const abdomenPoints=getWeeklyLatest(sorted,'abdominal_circumference_cm');

  const weightSvg=buildChartSvg(weightPoints,{
    goal:profile.target_weight_kg?Number(profile.target_weight_kg):null,
    yLabel:'Peso (kg)',
    valueSuffix:'kg',
    decimals:2,
    ariaLabel:'Evolución de peso'
  });

  const abdomenSvg=buildChartSvg(abdomenPoints,{
    yLabel:'Circunferencia (cm)',
    valueSuffix:'cm',
    decimals:2,
    lineClass:'chart-line-abdomen',
    pointClass:'chart-point-abdomen',
    ariaLabel:'Evolución de circunferencia abdominal'
  });

  const generatedAt=new Date().toLocaleString('es-CL');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte PesoCare - ${esc(profile.full_name)}</title>
<style>
  @page{size:A4 landscape;margin:12mm}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#182230;margin:0;background:#fff}
  .report{max-width:1120px;margin:0 auto}
  .head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #175cd3;padding-bottom:10px;margin-bottom:12px}
  .head-left{display:flex;align-items:flex-start;gap:12px}
  .report-logo{width:78px;height:auto;object-fit:contain;flex:0 0 auto}
  .brand{font-size:28px;font-weight:800;color:#175cd3}
  .sub{color:#667085;font-size:13px}
  .patient{margin-top:4px;font-size:18px;font-weight:700}
  .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px 0}
  .metric{border:1px solid #e4e7ec;border-radius:10px;padding:9px;text-align:center}
  .metric span{display:block;color:#667085;font-size:11px}
  .metric strong{display:block;font-size:16px;margin-top:2px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .box{border:1px solid #e4e7ec;border-radius:12px;padding:10px;break-inside:avoid}
  .box h3{margin:0 0 5px;font-size:15px}
  .chart-svg{width:100%;height:auto;display:block}
  .chart-label{font-size:12px;fill:#667085}
  .chart-grid{stroke:#eaecf0;stroke-width:1}
  .chart-line{fill:none;stroke:#175cd3;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
  .chart-point{fill:#175cd3;stroke:white;stroke-width:2}
  .chart-goal{stroke:#039855;stroke-width:2;stroke-dasharray:7 6}
  .chart-line-abdomen{fill:none;stroke:#7f56d9;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
  .chart-point-abdomen{fill:#7f56d9;stroke:white;stroke-width:2}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
  th,td{border-bottom:1px solid #eaecf0;padding:6px 5px;text-align:left}
  th{color:#667085}
  .footer{margin-top:10px;color:#98a2b3;font-size:10px;text-align:right}
  .noprint{display:flex;gap:8px;margin:0 0 12px}
  button{border:0;border-radius:9px;padding:10px 14px;font-weight:700;cursor:pointer}
  .primary{background:#175cd3;color:#fff}
  .secondary{background:#eef4ff;color:#175cd3}
  @media print{.noprint{display:none}.report{max-width:none}}
</style>
</head>
<body>
<div class="report">
  <div class="noprint">
    <button class="primary" onclick="window.print()">Guardar / compartir PDF</button>
    <button class="secondary" onclick="window.close()">Cerrar</button>
  </div>

  <div class="head">
    <div class="head-left">
      <img src="${BRAND_LOGO_URL}" alt="Logo PesoCare" class="report-logo" onerror="this.style.display='none'">
      <div>
        <div class="brand">PesoCare</div>
        <div class="patient">${esc(profile.full_name)}</div>
        <div class="sub">Inicio: ${fmt(profile.start_date)} · Seguimiento: ${profile.planned_weeks} semanas</div>
      </div>
    </div>
    <div class="sub">Reporte generado: ${esc(generatedAt)}</div>
  </div>

  <div class="metrics">
    <div class="metric"><span>Peso inicial</span><strong>${kg(profile.initial_weight_kg)}</strong></div>
    <div class="metric"><span>Peso actual</span><strong>${kg(latest.weight_kg)}</strong></div>
    <div class="metric"><span>Peso meta</span><strong>${profile.target_weight_kg?kg(profile.target_weight_kg):'—'}</strong></div>
    <div class="metric"><span>Cintura inicial</span><strong>${cm(initialAbdomen)}</strong></div>
    <div class="metric"><span>Cintura actual</span><strong>${cm(currentAbdomen)}</strong></div>
  </div>

  <div class="grid2">
    <div class="box">
      <h3>Evolución de peso</h3>
      ${weightSvg}
    </div>
    <div class="box">
      <h3>Evolución de circunferencia abdominal</h3>
      ${abdomenSvg}
    </div>
  </div>

  <div class="box" style="margin-top:12px">
    <h3>Historial de registros</h3>
    <table>
      <thead>
        <tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Circunferencia abdominal</th></tr>
      </thead>
      <tbody>
        ${sorted.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOf(r.measured_on)}</td><td>${kg(r.weight_kg)}</td><td>${cm(r.abdominal_circumference_cm)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">PesoCare · Reporte personal de seguimiento</div>
</div>
</body>
</html>`;
}

function generateReport(){
  const sorted=[...records].sort((a,b)=>a.measured_on.localeCompare(b.measured_on)||String(a.created_at).localeCompare(String(b.created_at)));
  const reportHtml=buildPrintableReport(sorted);
  const win=window.open('','_blank');
  if(!win){
    alert('Safari bloqueó la apertura del reporte. Permite ventanas emergentes para este sitio e inténtalo nuevamente.');
    return;
  }
  win.document.open();
  win.document.write(reportHtml);
  win.document.close();
}


function doctorNameById(userId){
  return linkedDoctorProfiles.find(d=>d.user_id===userId)?.display_name||'Médico';
}
function linkForDoctor(userId){return careLinks.find(l=>l.doctor_user_id===userId)}

function bindPatientCare(){
  document.getElementById('linkDoctorForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=document.getElementById('doctorEmail').value.trim();
    const msg=document.getElementById('doctorLinkMsg');msg.textContent='';
    try{
      await invokeFunction('care-links',{action:'link_doctor_by_email',doctor_email:email});
      await loadData();render();
    }catch(err){msg.textContent=err.message}
  });

  document.querySelectorAll('[data-revoke-doctor]').forEach(btn=>btn.addEventListener('click',async()=>{
    const link=linkForDoctor(btn.dataset.revokeDoctor);
    if(!link||!confirm('¿Desvincular este médico?'))return;
    try{await invokeFunction('care-links',{action:'revoke_link',link_id:link.id});await loadData();render()}
    catch(err){alert(err.message)}
  }));

  document.getElementById('patientDoctorSelect')?.addEventListener('change',renderPatientMessageThread);
  document.getElementById('patientMessageForm')?.addEventListener('submit',sendPatientMessage);
  document.getElementById('patientClearConversation')?.addEventListener('click',()=>{const doctorId=document.getElementById('patientDoctorSelect')?.value;if(doctorId)clearConversation(doctorId,currentUser.id,'patient')});

  document.getElementById('supportForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const msg=document.getElementById('supportMsg');msg.textContent='';
    try{
      await dbInsert('support_tickets',{
        user_id:currentUser.id,
        subject:document.getElementById('supportSubject').value.trim(),
        description:document.getElementById('supportDescription').value.trim(),
        technical_context:{user_agent:navigator.userAgent,url:location.href,app_version:'v14.2'}
      });
      msg.className='notice success';msg.textContent='Ticket enviado a PesoCare Admin.';
      supportTickets=await dbGet(`support_tickets?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc`)||[];
    }catch(err){msg.textContent=err.message}
  });
}

function renderPatientMessageThread(){
  const select=document.getElementById('patientDoctorSelect');
  const el=document.getElementById('patientMessageThread');
  if(!select||!el)return;
  const doctorId=select.value;
  notifications.filter(n=>!n.read_at&&['NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'].includes(n.type)&&n.related_user_id===doctorId).forEach(n=>markNotificationRead(n.id));
  const messages=patientMessages.filter(m=>m.doctor_user_id===doctorId);
  el.innerHTML=messages.length?messages.map(m=>`
    <div class="message-bubble ${m.sender_user_id===currentUser.id?'mine':'theirs'}">
      <div>${esc(m.message)}</div>
      <div class="message-meta"><span>${formatDateTime(m.created_at)}</span>${m.sender_user_id===currentUser.id?`<button type="button" class="message-delete" data-delete-message="${m.id}" data-message-context="patient">Eliminar</button>`:''}</div>
    </div>`).join(''):'<div class="empty-state">Aún no hay mensajes.</div>';
  el.querySelectorAll('[data-delete-message]').forEach(btn=>btn.addEventListener('click',()=>deleteSentMessage(btn.dataset.deleteMessage,btn.dataset.messageContext)));
  el.scrollTop=el.scrollHeight;
}

async function sendPatientMessage(e){
  e.preventDefault();
  const doctorId=document.getElementById('patientDoctorSelect')?.value;
  const input=document.getElementById('patientMessageText');
  const message=input?.value.trim();
  if(!doctorId||!message)return;
  try{
    await dbInsert('care_messages',{doctor_user_id:doctorId,patient_user_id:currentUser.id,sender_user_id:currentUser.id,message});
    input.value='';
    patientMessages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
    renderPatientMessageThread();
  }catch(err){alert(err.message)}
}

async function saveDoctorProfile(e){
  e.preventDefault();
  const payload={
    user_id:currentUser.id,
    display_name:document.getElementById('docName').value.trim(),
    specialty:document.getElementById('docSpecialty').value.trim(),
    registration_number:document.getElementById('docRegistration').value.trim()||null,
    clinic_name:document.getElementById('docClinic').value.trim()||null,
    professional_email:document.getElementById('docEmail').value.trim()||currentUser.email
  };
  try{
    if(doctorProfile){
      await dbUpdate('doctor_profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{
        display_name:payload.display_name,specialty:payload.specialty,
        registration_number:payload.registration_number,clinic_name:payload.clinic_name,
        professional_email:payload.professional_email,updated_at:new Date().toISOString()
      });
    }else await dbInsert('doctor_profiles',payload);
    await loadData();render();
  }catch(err){alert(err.message)}
}

function doctorView(){
  app.innerHTML=shell(`${header()}
    <section class="card">
      <div class="card-head">
        <div><h2 class="section-title">PesoCare Pro</h2><div class="muted">Seguimiento de pacientes vinculados</div></div>
        <span class="integration-badge">RNPI pendiente</span>
      </div>
      <div class="integration-note">La validación automática del registro profesional queda pendiente de integración y no bloquea esta versión.</div>
    </section>
    ${!doctorProfile?`
      <section class="card">
        <h2 class="section-title">Completa tu perfil profesional</h2>
        <form id="doctorProfileForm"><div class="grid">
          <div><label>Nombre profesional</label><input id="docName" required value="${esc(account?.display_name||'')}"></div>
          <div><label>Especialidad</label><input id="docSpecialty" required></div>
          <div><label>Nº registro / SIS</label><input id="docRegistration"></div>
          <div><label>Centro / consulta</label><input id="docClinic"></div>
          <div><label>Email profesional</label><input id="docEmail" type="email" value="${esc(currentUser.email||'')}"></div>
        </div><button class="primary" type="submit" style="margin-top:12px">Guardar perfil médico</button></form>
      </section>`
      :`
      <section class="card">
        <div class="doctor-row"><div>
          <strong>${esc(doctorProfile.display_name||account?.display_name||'Médico')}</strong>
          <div class="muted">${esc(doctorProfile.specialty||'Sin especialidad')}${doctorProfile.clinic_name?` · ${esc(doctorProfile.clinic_name)}`:''}</div>
        </div><button id="editDoctorProfile" class="secondary small-btn">Editar perfil</button></div>
      </section>
      <section class="card">
        <h2 class="section-title">Mis pacientes</h2>
        ${doctorPatients.length?doctorPatients.map(x=>`
          <div class="patient-row"><div><strong>${esc(x.profile?.full_name||'Paciente')}</strong>
          <div class="muted">${x.profile?`Inicio ${fmt(x.profile.start_date)} · ${x.profile.planned_weeks} semanas`:'Ficha pendiente'}</div>
          </div><button class="primary small-btn" data-open-patient="${x.link.patient_user_id}">Abrir seguimiento</button></div>`).join('')
          :'<div class="empty-state">Aún no tienes pacientes vinculados. El paciente debe autorizarte usando tu correo.</div>'}
      </section>`}
  `);
  bindCommonHeader();
  document.getElementById('doctorProfileForm')?.addEventListener('submit',saveDoctorProfile);
  document.getElementById('editDoctorProfile')?.addEventListener('click',()=>{
    const name=prompt('Nombre profesional:',doctorProfile.display_name||'');if(name===null)return;
    const specialty=prompt('Especialidad:',doctorProfile.specialty||'');if(specialty===null)return;
    const clinic=prompt('Centro / consulta:',doctorProfile.clinic_name||'');if(clinic===null)return;
    dbUpdate('doctor_profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{
      display_name:name.trim(),specialty:specialty.trim(),clinic_name:clinic.trim()||null,updated_at:new Date().toISOString()
    }).then(()=>loadData()).then(render).catch(err=>alert(err.message));
  });
  document.querySelectorAll('[data-open-patient]').forEach(btn=>btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openPatient)));
}

function weekOfFor(date,p){return Math.max(0,Math.floor((parseDate(date)-parseDate(p.start_date))/(7*86400000)))}

function buildStandaloneChart(rows,p,field,goal=null,yLabel='',suffix=''){
  const weekly=new Map();
  rows.forEach(r=>{
    const raw=r[field];if(raw===null||raw===undefined||raw==='')return;
    const w=weekOfFor(r.measured_on,p);if(w<=p.planned_weeks)weekly.set(w,Number(raw));
  });
  const points=[...weekly.entries()].sort((a,b)=>a[0]-b[0]);
  if(!points.length)return '<div class="empty-state">Sin datos suficientes.</div>';
  const vals=points.map(x=>x[1]).concat(goal!==null?[Number(goal)]:[]);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(max-min<4){min-=2;max+=2}else{const pad=(max-min)*.15;min-=pad;max+=pad}
  const W=760,H=300,L=58,R=18,T=18,B=45,iw=W-L-R,ih=H-T-B;
  const x=w=>L+(w/Math.max(1,p.planned_weeks))*iw;
  const y=v=>T+((max-v)/(max-min))*ih;
  let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=5;i++){const v=max-(max-min)*i/5,yy=T+ih*i/5;svg+=`<line class="chart-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${v.toFixed(1)}</text>`}
  if(goal!==null)svg+=`<line class="chart-goal" x1="${L}" y1="${y(Number(goal))}" x2="${W-R}" y2="${y(Number(goal))}"/>`;
  const path=points.map(([w,v],i)=>`${i?'L':'M'} ${x(w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  svg+=`<path class="${field==='weight_kg'?'chart-line':'chart-line-abdomen'}" d="${path}"/>`;
  points.forEach(([w,v])=>svg+=`<circle class="${field==='weight_kg'?'chart-point':'chart-point-abdomen'}" cx="${x(w)}" cy="${y(v)}" r="5"><title>Semana ${w}: ${v.toFixed(2)} ${suffix}</title></circle>`);
  svg+=`<text class="chart-label" x="${L+iw/2}" y="${H-4}" text-anchor="middle">Semanas</text><text class="chart-label" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
  return svg;
}

async function openDoctorPatient(patientId){
  try{
    const p=(await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(patientId)}&limit=1`))?.[0];
    if(!p)throw new Error('No se encontró la ficha del paciente.');
    const recs=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(patientId)}&order=measured_on.asc,created_at.asc`)||[];
    const prescriptions=await dbGet(`prescription_drafts?select=*&patient_user_id=eq.${encodeURIComponent(patientId)}&doctor_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.desc`)||[];
    const messages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(patientId)}&doctor_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
    doctorPatientDetail={profile:p,records:recs,prescriptions,messages};
    const matching=notifications.filter(n=>!n.read_at&&n.type==='NEW_MESSAGE'&&n.related_user_id===patientId);
    for(const n of matching)markNotificationRead(n.id);
    doctorPatientDetailView();
  }catch(err){alert(err.message)}
}

function doctorPatientDetailView(){
  const d=doctorPatientDetail;if(!d)return doctorView();
  const p=d.profile,recs=d.records,latest=recs.at(-1);
  const waist=[...recs].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);
  const editing=d.prescriptions.find(rx=>rx.id===editingPrescriptionId)||null;
  app.innerHTML=shell(`${header()}
    <section class="card">
      <button class="linkbtn" id="backPatients">← Mis pacientes</button>
      <h2 class="section-title">${esc(p.full_name)}</h2><div class="muted">Seguimiento desde ${fmt(p.start_date)}</div>
    </section>
    <section class="metrics">
      <div class="metric"><span>Peso inicial</span><strong>${kg(p.initial_weight_kg)}</strong></div>
      <div class="metric"><span>Peso actual</span><strong>${latest?kg(latest.weight_kg):'—'}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${p.target_weight_kg?kg(p.target_weight_kg):'—'}</strong></div>
      <div class="metric"><span>Cintura actual</span><strong>${waist?cm(waist.abdominal_circumference_cm):'—'}</strong></div>
    </section>
    <section class="card"><h2 class="section-title">Evolución de peso</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'weight_kg',p.target_weight_kg?Number(p.target_weight_kg):null,'Peso (kg)','kg')}</div></section>
    <section class="card"><h2 class="section-title">Circunferencia abdominal</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'abdominal_circumference_cm',null,'Circunferencia (cm)','cm')}</div></section>
    <section class="card">
      <div class="card-head"><div><h2 class="section-title">Indicación farmacológica</h2><div class="muted">${editing?'Editando indicación existente':'Crear nueva indicación'}</div></div>${editing?'<span class="edit-badge">Modo edición</span>':''}</div>
      <div class="integration-note">La receta electrónica, firma y SNRE quedan pendientes. Esta versión permite crear, modificar, retirar y compartir la indicación dentro de PesoCare.</div>
      <form id="doctorPrescriptionForm"><div class="grid">
        <div><label>Medicamento</label><input id="rxMedication" required placeholder="Ej: Wegovy" value="${esc(editing?.medication_name||'')}"></div>
        <div><label>Principio activo</label><input id="rxIngredient" placeholder="Ej: semaglutida" value="${esc(editing?.active_ingredient||'')}"></div>
        <div><label>Dosis</label><input id="rxDose" required placeholder="Ej: 0,5 mg" value="${esc(editing?.dose_text||'')}"></div>
        <div><label>Frecuencia</label><input id="rxFrequency" required placeholder="Ej: 1 vez por semana" value="${esc(editing?.frequency_text||'')}"></div>
        <div><label>Fecha inicio</label><input id="rxStart" type="date" value="${editing?.start_date||today()}"></div>
        <div><label>Duración</label><input id="rxDuration" placeholder="Ej: 4 semanas" value="${esc(editing?.duration_text||'')}"></div>
      </div><label style="margin-top:10px">Indicaciones</label><textarea id="rxInstructions" rows="3">${esc(editing?.instructions||'')}</textarea>
      <div class="form-actions"><button class="primary" type="submit">${editing?'Guardar cambios':'Guardar y compartir indicación'}</button>${editing?'<button class="secondary" id="cancelPrescriptionEdit" type="button">Cancelar edición</button>':''}</div></form>
      ${d.prescriptions.length?`<div class="prescription-list">${d.prescriptions.map(rx=>`
        <div class="prescription-card">
          <div class="prescription-card-head"><div><strong>${esc(rx.medication_name)} · ${esc(rx.dose_text)}</strong><div>${esc(rx.frequency_text)}${rx.duration_text?` · ${esc(rx.duration_text)}`:''}</div></div><span class="revision-chip">v${rx.revision||1}</span></div>
          ${rx.instructions?`<div class="muted prescription-instructions">${esc(rx.instructions)}</div>`:''}
          <div class="small-muted">${rx.status} · receta legal pendiente · actualizada ${formatDateTime(rx.updated_at)}</div>
          <div class="prescription-actions"><button type="button" class="secondary small-btn" data-edit-prescription="${rx.id}">Editar</button><button type="button" class="danger-btn small-btn" data-delete-prescription="${rx.id}">Eliminar</button></div>
        </div>`).join('')}</div>`:'<div class="empty-state">Todavía no hay indicaciones para este paciente.</div>'}
    </section>
    <section class="card">
      <div class="card-head"><div><h2 class="section-title">Mensajes</h2><div class="muted">Puedes eliminar tus mensajes enviados o limpiar todo el historial visible.</div></div><button type="button" class="link-danger" id="doctorClearConversation">Eliminar historial</button></div>
      <div class="message-thread" id="doctorMessageThread"></div>
      <form id="doctorMessageForm" class="message-form"><textarea id="doctorMessageText" rows="3" maxlength="4000" required placeholder="Escribe al paciente..."></textarea><button class="primary" type="submit">Enviar mensaje</button></form>
    </section>
    <section class="card"><h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Circunferencia</th></tr></thead>
      <tbody>${recs.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOfFor(r.measured_on,p)}</td><td>${kg(r.weight_kg)}</td><td>${cm(r.abdominal_circumference_cm)}</td></tr>`).join('')}</tbody></table></div>
    </section>`);
  bindCommonHeader();
  renderDoctorMessageThread();
  document.getElementById('backPatients')?.addEventListener('click',()=>{editingPrescriptionId=null;doctorPatientDetail=null;doctorView()});
  document.getElementById('doctorPrescriptionForm')?.addEventListener('submit',saveDoctorPrescription);
  document.getElementById('cancelPrescriptionEdit')?.addEventListener('click',()=>{editingPrescriptionId=null;doctorPatientDetailView()});
  document.querySelectorAll('[data-edit-prescription]').forEach(btn=>btn.addEventListener('click',()=>{editingPrescriptionId=btn.dataset.editPrescription;doctorPatientDetailView();document.getElementById('doctorPrescriptionForm')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  document.querySelectorAll('[data-delete-prescription]').forEach(btn=>btn.addEventListener('click',()=>deleteDoctorPrescription(btn.dataset.deletePrescription)));
  document.getElementById('doctorMessageForm')?.addEventListener('submit',sendDoctorMessage);
  document.getElementById('doctorClearConversation')?.addEventListener('click',()=>clearConversation(currentUser.id,p.user_id,'doctor'));
}

async function saveDoctorPrescription(e){
  e.preventDefault();const p=doctorPatientDetail.profile;
  const payload={
    medication_name:document.getElementById('rxMedication').value.trim(),
    active_ingredient:document.getElementById('rxIngredient').value.trim()||null,
    dose_text:document.getElementById('rxDose').value.trim(),
    frequency_text:document.getElementById('rxFrequency').value.trim(),
    start_date:document.getElementById('rxStart').value||null,
    duration_text:document.getElementById('rxDuration').value.trim()||null,
    instructions:document.getElementById('rxInstructions').value.trim()||null
  };
  try{
    if(editingPrescriptionId){
      await dbUpdate('prescription_drafts',`id=eq.${encodeURIComponent(editingPrescriptionId)}`,payload);
      editingPrescriptionId=null;
    }else{
      await dbInsert('prescription_drafts',{
        doctor_user_id:currentUser.id,patient_user_id:p.user_id,
        ...payload,status:'SHARED',legal_status:'PENDING_LEGAL_INTEGRATION'
      });
    }
    await openDoctorPatient(p.user_id);
  }catch(err){alert(err.message)}
}

async function deleteDoctorPrescription(id){
  const rx=doctorPatientDetail?.prescriptions?.find(x=>x.id===id);if(!rx)return;
  if(!confirm(`¿Eliminar la indicación de ${rx.medication_name}? El paciente dejará de verla. La acción quedará auditada.`))return;
  try{
    await dbRpc('delete_prescription_draft',{p_prescription_id:id});
    if(editingPrescriptionId===id)editingPrescriptionId=null;
    await openDoctorPatient(doctorPatientDetail.profile.user_id);
  }catch(err){alert(err.message)}
}

async function deleteSentMessage(id,context){
  if(!confirm('¿Eliminar este mensaje enviado? Desaparecerá de la conversación para ambos participantes.'))return;
  try{
    await dbRpc('delete_care_message',{p_message_id:id});
    if(context==='patient'){
      patientMessages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
      renderPatientMessageThread();
    }else if(doctorPatientDetail){
      const patientId=doctorPatientDetail.profile.user_id;
      doctorPatientDetail.messages=await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(patientId)}&doctor_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[];
      renderDoctorMessageThread();
    }
  }catch(err){alert(err.message)}
}

async function clearConversation(doctorId,patientId,context){
  if(!confirm('Esta acción eliminará todo el historial visible de la conversación para médico y paciente. Los eventos quedarán auditados. ¿Continuar?'))return;
  if(prompt('Escribe ELIMINAR para confirmar:')!=='ELIMINAR')return;
  try{
    await dbRpc('clear_care_conversation',{p_doctor_user_id:doctorId,p_patient_user_id:patientId});
    if(context==='patient'){
      patientMessages=[];renderPatientMessageThread();
    }else if(doctorPatientDetail){
      doctorPatientDetail.messages=[];renderDoctorMessageThread();
    }
    showToast('Conversación eliminada','El historial visible fue eliminado correctamente.','CONVERSATION_CLEARED');
  }catch(err){alert(err.message)}
}

async function sendDoctorMessage(e){
  e.preventDefault();const p=doctorPatientDetail.profile;
  const message=document.getElementById('doctorMessageText').value.trim();if(!message)return;
  try{
    await dbInsert('care_messages',{doctor_user_id:currentUser.id,patient_user_id:p.user_id,sender_user_id:currentUser.id,message});
    await openDoctorPatient(p.user_id);
  }catch(err){alert(err.message)}
}

async function loadAdminData(){
  const [u,t]=await Promise.all([
    invokeFunction('admin-console',{action:'list_users',page:1,per_page:200}),
    invokeFunction('admin-console',{action:'list_tickets'})
  ]);
  adminUsers=u.users||[];adminTickets=t.tickets||[];adminLoaded=true;
}

function adminView(){
  if(!adminLoaded){
    app.innerHTML=shell(`${header()}<section class="card"><div class="loading">Cargando PesoCare Admin…</div></section>`);
    bindCommonHeader();
    loadAdminData().then(adminView).catch(err=>{
      app.innerHTML=shell(`${header()}<section class="card"><div class="error">${esc(err.message)}</div></section>`);
      bindCommonHeader();
    });
    return;
  }
  const total=adminUsers.length;
  const patients=adminUsers.filter(u=>u.roles.includes('PATIENT')).length;
  const doctors=adminUsers.filter(u=>u.roles.includes('DOCTOR')).length;
  const suspended=adminUsers.filter(u=>u.status==='SUSPENDED').length;
  app.innerHTML=shell(`${header()}
    <section class="card admin-hero"><div><h2 class="section-title">PesoCare Admin</h2><div class="muted">Gestión de usuarios, accesos y soporte</div></div><span class="owner-chip">${account?.is_owner?'Owner':'Administrador'}</span></section>
    <section class="metrics admin-metrics">
      <div class="metric"><span>Usuarios</span><strong>${total}</strong></div>
      <div class="metric"><span>Pacientes</span><strong>${patients}</strong></div>
      <div class="metric"><span>Médicos</span><strong>${doctors}</strong></div>
      <div class="metric"><span>Suspendidos</span><strong>${suspended}</strong></div>
    </section>
    <section class="card"><h2 class="section-title">Agregar usuario</h2>
      <form id="adminInviteForm"><div class="grid">
        <div><label>Nombre</label><input id="adminInviteName" required></div>
        <div><label>Correo</label><input id="adminInviteEmail" type="email" required></div>
        <div><label>Rol principal</label><select id="adminInviteRole"><option value="PATIENT">Paciente</option><option value="DOCTOR">Médico</option>${account?.is_owner?'<option value="ADMIN">Administrador</option>':''}</select></div>
      </div><button class="primary" type="submit" style="margin-top:12px">Enviar invitación</button><p id="adminInviteMsg" class="error"></p></form>
    </section>
    <section class="card">
      <div class="card-head"><div><h2 class="section-title">Usuarios</h2><div class="muted">Modificar cuentas, roles y accesos</div></div><button id="refreshAdmin" class="secondary small-btn">Actualizar</button></div>
      <input id="adminSearch" placeholder="Buscar por nombre o correo"><div id="adminUserList" class="admin-user-list"></div>
    </section>
    <section class="card"><h2 class="section-title">Tickets de soporte</h2>
      ${adminTickets.length?adminTickets.map(t=>`
        <div class="support-admin-row"><div><strong>${esc(t.subject)}</strong>
        <div class="muted">${esc(t.user?.display_name||t.user?.email_snapshot||'Usuario')} · ${formatDateTime(t.created_at)}</div>
        <div>${esc(t.description)}</div></div>
        <select data-ticket-status="${t.id}">${['NEW','IN_PROGRESS','RESOLVED'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`).join('')
        :'<div class="empty-state">No hay tickets.</div>'}
    </section>`);
  bindCommonHeader();bindAdminEvents();renderAdminUsers();
}

function renderAdminUsers(){
  const el=document.getElementById('adminUserList');if(!el)return;
  const q=(document.getElementById('adminSearch')?.value||'').trim().toLowerCase();
  const list=adminUsers.filter(u=>!q||String(u.display_name||'').toLowerCase().includes(q)||String(u.email||'').toLowerCase().includes(q));
  el.innerHTML=list.map(u=>`
    <div class="admin-user-card"><div class="admin-user-main"><strong>${esc(u.display_name||u.email||'Usuario')}</strong>
    <div class="muted">${esc(u.email||'')}</div><div class="badge-row">${u.roles.map(roleBadge).join('')} <span class="status-chip status-${u.status.toLowerCase()}">${u.status}</span> ${u.is_owner?'<span class="owner-chip">Owner</span>':''}</div>
    <div class="small-muted">Último acceso: ${formatDateTime(u.last_sign_in_at)}</div></div>
    <div class="admin-actions"><button class="secondary small-btn" data-admin-edit="${u.id}">Editar</button>
    <button class="secondary small-btn" data-admin-reset="${u.id}">Reset clave</button>
    ${!u.is_owner?`<button class="secondary small-btn" data-admin-status="${u.id}">${u.status==='ACTIVE'?'Suspender':'Reactivar'}</button><button class="danger-btn small-btn" data-admin-delete="${u.id}">Eliminar</button>`:''}</div></div>`).join('')||'<div class="empty-state">Sin resultados.</div>';
  bindAdminUserButtons();
}

function bindAdminEvents(){
  document.getElementById('adminSearch')?.addEventListener('input',renderAdminUsers);
  document.getElementById('refreshAdmin')?.addEventListener('click',()=>{adminLoaded=false;adminView()});
  document.getElementById('adminInviteForm')?.addEventListener('submit',adminInviteUser);
  document.querySelectorAll('[data-ticket-status]').forEach(sel=>sel.addEventListener('change',async()=>{
    try{await invokeFunction('admin-console',{action:'update_ticket',ticket_id:sel.dataset.ticketStatus,status:sel.value});adminLoaded=false;adminView()}
    catch(err){alert(err.message)}
  }));
}
function bindAdminUserButtons(){
  document.querySelectorAll('[data-admin-edit]').forEach(b=>b.addEventListener('click',()=>adminEditUser(b.dataset.adminEdit)));
  document.querySelectorAll('[data-admin-reset]').forEach(b=>b.addEventListener('click',()=>adminResetPassword(b.dataset.adminReset)));
  document.querySelectorAll('[data-admin-status]').forEach(b=>b.addEventListener('click',()=>adminToggleStatus(b.dataset.adminStatus)));
  document.querySelectorAll('[data-admin-delete]').forEach(b=>b.addEventListener('click',()=>adminDeleteUser(b.dataset.adminDelete)));
}

async function adminInviteUser(e){
  e.preventDefault();
  const role=document.getElementById('adminInviteRole').value;
  const inviteRoles=role==='PATIENT'?['PATIENT']:role==='DOCTOR'?['PATIENT','DOCTOR']:['PATIENT','ADMIN'];
  const msg=document.getElementById('adminInviteMsg');msg.textContent='';
  try{
    await invokeFunction('admin-console',{action:'invite_user',email:document.getElementById('adminInviteEmail').value.trim(),display_name:document.getElementById('adminInviteName').value.trim(),roles:inviteRoles});
    msg.className='notice success';msg.textContent='Invitación enviada.';adminLoaded=false;setTimeout(adminView,400);
  }catch(err){msg.textContent=err.message}
}
async function adminEditUser(id){
  const u=adminUsers.find(x=>x.id===id);if(!u)return;
  const name=prompt('Nombre:',u.display_name||'');if(name===null)return;
  const email=prompt('Correo:',u.email||'');if(email===null)return;
  const rt=prompt('Roles separados por coma: PATIENT, DOCTOR, ADMIN',u.roles.join(', '));if(rt===null)return;
  const nextRoles=rt.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  try{await invokeFunction('admin-console',{action:'update_user',user_id:id,display_name:name,email,roles:nextRoles});adminLoaded=false;adminView()}
  catch(err){alert(err.message)}
}
async function adminResetPassword(id){
  const u=adminUsers.find(x=>x.id===id);if(!u||!confirm(`¿Enviar reset de contraseña a ${u.email}?`))return;
  try{await invokeFunction('admin-console',{action:'send_password_reset',user_id:id});alert('Correo de restablecimiento enviado.')}
  catch(err){alert(err.message)}
}
async function adminToggleStatus(id){
  const u=adminUsers.find(x=>x.id===id);if(!u)return;
  const next=u.status==='ACTIVE'?'SUSPENDED':'ACTIVE';
  if(!confirm(`${next==='SUSPENDED'?'Suspender':'Reactivar'} a ${u.display_name||u.email}?`))return;
  try{await invokeFunction('admin-console',{action:'update_user',user_id:id,status:next});adminLoaded=false;adminView()}
  catch(err){alert(err.message)}
}
async function adminDeleteUser(id){
  const u=adminUsers.find(x=>x.id===id);if(!u)return;
  if(!confirm(`Eliminar definitivamente a ${u.display_name||u.email} y sus datos asociados?`))return;
  if(prompt('Escribe ELIMINAR para confirmar:')!=='ELIMINAR')return;
  try{await invokeFunction('admin-console',{action:'delete_user',user_id:id});adminLoaded=false;adminView()}
  catch(err){alert(err.message)}
}

async function addWeight(e){
  e.preventDefault();
  const measured_on=document.getElementById('date').value;
  const weight_kg=parseDecimal(document.getElementById('weight').value);
  const abdominal_circumference_cm=parseDecimal(document.getElementById('abdomen').value);
  const msg=document.getElementById('weightMsg');
  msg.textContent='';

  if(parseDate(measured_on)<parseDate(profile.start_date)){
    msg.textContent='La fecha no puede ser anterior al inicio del seguimiento.';
    return;
  }
  if(!Number.isFinite(weight_kg)||weight_kg<20||weight_kg>350){
    msg.textContent='Ingresa un peso válido. Puedes usar coma o punto y hasta 2 decimales.';
    return;
  }
  if(!Number.isFinite(abdominal_circumference_cm)||abdominal_circumference_cm<30||abdominal_circumference_cm>250){
    msg.textContent='Ingresa una circunferencia abdominal válida entre 30 y 250 cm, con hasta 2 decimales.';
    return;
  }

  try{
    await dbInsert('weight_records',{
      user_id:currentUser.id,
      measured_on,
      weight_kg,
      abdominal_circumference_cm,
      is_initial:false
    });
    await loadData();
    render();
  }catch(err){
    msg.textContent='No fue posible guardar el registro: '+err.message;
  }
}

async function editPlan(){
  const weeks=prompt('Duración del seguimiento en semanas:',String(profile.planned_weeks));
  if(weeks===null)return;

  const target=prompt('Peso meta en kg. Puedes usar coma o punto. Déjalo vacío para eliminar la meta:',profile.target_weight_kg??'');
  if(target===null)return;

  const abdomen=prompt('Circunferencia abdominal inicial en cm. Puedes usar coma o punto:',profile.initial_abdominal_circumference_cm??'');
  if(abdomen===null)return;

  const nextWeeks=Math.max(1,Math.min(104,Number(weeks)||profile.planned_weeks));
  const nextTarget=target.trim()===''?null:parseDecimal(target);
  const nextAbdomen=abdomen.trim()===''?null:parseDecimal(abdomen);

  if(target.trim()!=='' && (!Number.isFinite(nextTarget)||nextTarget<20||nextTarget>350)){
    alert('Peso meta inválido.');
    return;
  }
  if(abdomen.trim()!=='' && (!Number.isFinite(nextAbdomen)||nextAbdomen<30||nextAbdomen>250)){
    alert('Circunferencia abdominal inicial inválida.');
    return;
  }

  try{
    await dbUpdate('profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{
      planned_weeks:nextWeeks,
      target_weight_kg:nextTarget,
      initial_abdominal_circumference_cm:nextAbdomen,
      updated_at:new Date().toISOString()
    });

    if(nextAbdomen!==null){
      await dbUpdate('weight_records',`user_id=eq.${encodeURIComponent(currentUser.id)}&is_initial=eq.true`,{
        abdominal_circumference_cm:nextAbdomen
      });
    }

    await loadData();
    render();
  }catch(err){
    alert('No fue posible actualizar el plan: '+err.message);
  }
}

async function logout(){
  stopRealtime();
  try{if(session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:authHeaders(session.access_token)})}catch{}
  clearStoredSession();session=null;currentUser=null;profile=null;records=[];account=null;roles=[];careLinks=[];linkedDoctorProfiles=[];doctorProfile=null;doctorPatients=[];doctorPatientDetail=null;editingPrescriptionId=null;adminUsers=[];adminTickets=[];adminLoaded=false;loginView();
}

async function boot(){
  try{
    const confirmed=captureConfirmationHash();
    if(await ensureSession()){await loadData();render();startRealtime()}
    else loginView(confirmed?'Correo confirmado. Ya puedes ingresar.':'');
  }catch(err){
    console.error(err);
    loginView();
    const m=document.getElementById('authMsg');if(m)m.textContent='No fue posible conectar con el servicio. Recarga la página.';
  }
}
boot();
})();
