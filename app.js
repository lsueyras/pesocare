
(function(){
'use strict';

const SUPABASE_URL='https://lqmfgxftazazqvultewm.supabase.co';
const SUPABASE_KEY='sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl';
const APP_URL='https://lsueyras.github.io/pesocare/';
const SESSION_KEY='pesocare_session_v2';

const app=document.getElementById('app');
let session=null, currentUser=null, profile=null, records=[];

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const parseDate=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
const fmt=s=>{if(!s)return '—';const[y,m,d]=s.split('-');return `${d}/${m}/${y}`};
const kg=n=>Number(n).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg';
const weekOf=date=>profile?Math.max(0,Math.floor((parseDate(date)-parseDate(profile.start_date))/(7*86400000))):0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function shell(content){
  return `<main class="shell">${content}<div class="footer">PesoCare · Seguimiento personal de peso</div></main>`;
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

function saveSession(s){
  session=s;
  if(s) localStorage.setItem(SESSION_KEY,JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

function getStoredSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}
}

function captureConfirmationHash(){
  if(!location.hash||!location.hash.includes('access_token='))return false;
  const p=new URLSearchParams(location.hash.slice(1));
  const access_token=p.get('access_token');
  const refresh_token=p.get('refresh_token');
  const expires_in=Number(p.get('expires_in')||3600);
  if(access_token){
    saveSession({access_token,refresh_token,expires_at:Date.now()+expires_in*1000});
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
    return true;
  }catch{saveSession(null);return false}
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
    saveSession(null);currentUser=null;return false;
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

function loginView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card">
      <div class="brandrow"><div class="logo">P</div><div><div class="brand">PesoCare</div><div class="muted">Seguimiento personal</div></div></div>
      <p class="muted">Registra tu peso, revisa tu historial y monitorea tu evolución semanal.</p>
      ${message?`<div class="notice success">${esc(message)}</div>`:''}
      <form id="authForm" style="margin-top:16px">
        <label>Correo</label><input id="email" type="email" inputmode="email" autocomplete="email" required placeholder="tu@correo.com">
        <label style="margin-top:10px">Contraseña</label><input id="password" type="password" autocomplete="current-password" minlength="6" required>
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
}

async function auth(e,signup){
  e.preventDefault();
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  const msg=document.getElementById('authMsg');msg.textContent='';
  try{
    if(signup){
      const url=`${SUPABASE_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(APP_URL)}`;
      const data=await jsonFetch(url,{method:'POST',headers:authHeaders(),body:JSON.stringify({email,password})});
      if(data.access_token){
        saveSession({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+Number(data.expires_in||3600)*1000});
        await ensureSession();await loadData();render();
      }else{
        msg.textContent='Cuenta creada. Revisa tu correo y confirma el registro antes de ingresar.';
      }
    }else{
      const data=await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
        method:'POST',headers:authHeaders(),body:JSON.stringify({email,password})
      });
      saveSession({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+Number(data.expires_in||3600)*1000});
      if(await ensureSession()){await loadData();render()}
    }
  }catch(err){
    const m=String(err.message||err);
    msg.textContent=m.toLowerCase().includes('email not confirmed')
      ?'Debes confirmar tu correo antes de ingresar.'
      :'No fue posible completar la operación: '+m;
  }
}

async function forgotPassword(){
  const email=document.getElementById('email').value.trim();
  const msg=document.getElementById('authMsg');
  if(!email){msg.textContent='Ingresa primero tu correo.';return}
  try{
    await jsonFetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(APP_URL)}`,{
      method:'POST',headers:authHeaders(),body:JSON.stringify({email})
    });
    msg.textContent='Te enviamos un correo para recuperar tu contraseña.';
  }catch(err){msg.textContent=err.message}
}

async function loadData(){
  const p=await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
  profile=p?.[0]||null;
  if(profile){
    records=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=measured_on.asc,created_at.asc`)||[];
  }else records=[];
}

function render(){profile?dashboardView():initialProfileView()}

function header(){
  return `<div class="top">
    <div class="brandrow"><div class="logo">P</div><div><div class="brand">PesoCare</div><div class="muted">${esc(currentUser?.email||'')}</div></div></div>
    <button class="secondary" id="logout">Salir</button>
  </div>`;
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
          <div><label>Peso inicial (kg)</label><input id="initial" type="number" inputmode="decimal" min="20" max="350" step="0.1" required></div>
          <div><label>Peso meta (kg)</label><input id="target" type="number" inputmode="decimal" min="20" max="350" step="0.1"></div>
        </div>
        <button class="primary" style="margin-top:14px">Crear seguimiento</button>
        <p id="profileMsg" class="error"></p>
      </form>
    </section>`);
  document.getElementById('profileForm').addEventListener('submit',createProfile);
  document.getElementById('logout').addEventListener('click',logout);
}

async function createProfile(e){
  e.preventDefault();
  const msg=document.getElementById('profileMsg');
  const p={
    user_id:currentUser.id,
    full_name:document.getElementById('name').value.trim(),
    birth_date:document.getElementById('birth').value||null,
    start_date:document.getElementById('start').value,
    planned_weeks:Number(document.getElementById('weeks').value),
    initial_weight_kg:Number(document.getElementById('initial').value),
    target_weight_kg:document.getElementById('target').value?Number(document.getElementById('target').value):null
  };
  try{
    const arr=await dbInsert('profiles',p);profile=arr[0];
    await dbInsert('weight_records',{user_id:currentUser.id,measured_on:p.start_date,weight_kg:p.initial_weight_kg,is_initial:true});
    await loadData();render();
  }catch(err){msg.textContent=err.message}
}

function dashboardView(){
  const sorted=[...records].sort((a,b)=>a.measured_on.localeCompare(b.measured_on)||String(a.created_at).localeCompare(String(b.created_at)));
  const latest=sorted.at(-1);
  if(!latest){app.innerHTML=shell(`${header()}<section class="card"><div class="error">No se encontró el registro inicial.</div></section>`);return}
  const change=Number(latest.weight_kg)-Number(profile.initial_weight_kg);
  const goal=profile.target_weight_kg?Number(profile.target_weight_kg):null;
  const currentWeek=weekOf(latest.measured_on);
  const progress=Math.min(100,Math.max(0,(currentWeek/Math.max(1,profile.planned_weeks))*100));
  app.innerHTML=shell(`${header()}
    <section class="card">
      <div class="top" style="margin-bottom:6px">
        <div><h2 class="section-title">Hola, ${esc(profile.full_name.split(' ')[0])}</h2><div class="muted">Seguimiento de ${profile.planned_weeks} semanas · Inicio ${fmt(profile.start_date)}</div></div>
        <button id="editPlan" class="secondary">Editar plan</button>
      </div><div class="progress"><div style="width:${progress}%"></div></div>
    </section>
    <section class="metrics">
      <div class="metric"><span>Peso actual</span><strong>${kg(latest.weight_kg)}</strong></div>
      <div class="metric"><span>Cambio</span><strong>${change>0?'+':''}${change.toFixed(1)} kg</strong></div>
      <div class="metric"><span>Semana</span><strong>${currentWeek} / ${profile.planned_weeks}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${goal?kg(goal):'—'}</strong></div>
    </section>
    <section class="card">
      <h2 class="section-title">Registrar peso</h2>
      <p class="muted">La fecha de hoy viene propuesta. Puedes cambiarla para registrar un dato anterior.</p>
      <form id="weightForm"><div class="grid">
        <div><label>Fecha</label><input id="date" type="date" value="${today()}" required></div>
        <div><label>Peso (kg)</label><input id="weight" type="number" inputmode="decimal" min="20" max="350" step="0.1" required></div>
      </div><button class="primary" style="margin-top:12px">Guardar peso</button><p id="weightMsg" class="error"></p></form>
    </section>
    <section class="card">
      <h2 class="section-title">Peso por semana</h2>
      <div class="muted">Evolución desde Semana 0 hasta Semana ${profile.planned_weeks}</div>
      <div id="chart" class="chart-wrap"></div>
    </section>
    <section class="card">
      <h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th></tr></thead>
      <tbody>${sorted.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOf(r.measured_on)}</td><td>${kg(r.weight_kg)}</td></tr>`).join('')}</tbody></table></div>
    </section>`);
  document.getElementById('weightForm').addEventListener('submit',addWeight);
  document.getElementById('editPlan').addEventListener('click',editPlan);
  document.getElementById('logout').addEventListener('click',logout);
  drawChart(sorted);
}

function drawChart(sorted){
  const el=document.getElementById('chart');if(!el)return;
  const weekly=new Map();
  sorted.forEach(r=>{const w=weekOf(r.measured_on);if(w<=profile.planned_weeks)weekly.set(w,Number(r.weight_kg))});
  const points=[...weekly.entries()].sort((a,b)=>a[0]-b[0]);
  if(!points.length){el.innerHTML='<div class="muted">Aún no hay datos.</div>';return}
  const target=profile.target_weight_kg?Number(profile.target_weight_kg):null;
  const vals=points.map(p=>p[1]).concat(target?[target]:[]);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(max-min<4){min-=2;max+=2}else{const pad=(max-min)*.15;min-=pad;max+=pad}
  const W=760,H=330,L=55,R=18,T=20,B=48,iw=W-L-R,ih=H-T-B;
  const x=w=>L+(w/Math.max(1,profile.planned_weeks))*iw;
  const y=v=>T+((max-v)/(max-min))*ih;
  let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolución de peso">`;
  const yTicks=5;
  for(let i=0;i<=yTicks;i++){const v=max-(max-min)*i/yTicks,yy=T+ih*i/yTicks;svg+=`<line class="chart-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${v.toFixed(1)}</text>`}
  const step=profile.planned_weeks<=16?2:profile.planned_weeks<=32?4:Math.ceil(profile.planned_weeks/8);
  for(let w=0;w<=profile.planned_weeks;w+=step){const xx=x(w);svg+=`<line class="chart-grid" x1="${xx}" y1="${T}" x2="${xx}" y2="${T+ih}"/><text class="chart-label" x="${xx}" y="${H-22}" text-anchor="middle">${w}</text>`}
  if(profile.planned_weeks%step!==0){svg+=`<text class="chart-label" x="${x(profile.planned_weeks)}" y="${H-22}" text-anchor="middle">${profile.planned_weeks}</text>`}
  if(target)svg+=`<line class="chart-goal" x1="${L}" y1="${y(target)}" x2="${W-R}" y2="${y(target)}"/>`;
  const path=points.map(([w,v],i)=>`${i?'L':'M'} ${x(w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  svg+=`<path class="chart-line" d="${path}"/>`;
  points.forEach(([w,v])=>{svg+=`<circle class="chart-point" cx="${x(w)}" cy="${y(v)}" r="5"><title>Semana ${w}: ${v.toFixed(1)} kg</title></circle>`});
  svg+=`<text class="chart-label" x="${L+iw/2}" y="${H-4}" text-anchor="middle">Semanas</text><text class="chart-label" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">Peso (kg)</text></svg>`;
  svg+=`<div class="legend"><span><i class="legend-dot"></i>Peso</span>${target?'<span><i class="legend-goal"></i>Meta</span>':''}</div>`;
  el.innerHTML=svg;
}

async function addWeight(e){
  e.preventDefault();
  const measured_on=document.getElementById('date').value;
  const weight_kg=Number(document.getElementById('weight').value);
  const msg=document.getElementById('weightMsg');
  if(parseDate(measured_on)<parseDate(profile.start_date)){msg.textContent='La fecha no puede ser anterior al inicio del seguimiento.';return}
  try{
    await dbInsert('weight_records',{user_id:currentUser.id,measured_on,weight_kg,is_initial:false});
    await loadData();render();
  }catch(err){msg.textContent=err.message}
}

async function editPlan(){
  const weeks=prompt('Duración del seguimiento en semanas:',String(profile.planned_weeks));if(weeks===null)return;
  const target=prompt('Peso meta en kg. Déjalo vacío para eliminar la meta:',profile.target_weight_kg??'');
  const nextWeeks=Math.max(1,Math.min(104,Number(weeks)||profile.planned_weeks));
  const nextTarget=target===''?null:Number(target);
  try{
    await dbUpdate('profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{planned_weeks:nextWeeks,target_weight_kg:nextTarget,updated_at:new Date().toISOString()});
    await loadData();render();
  }catch(err){alert(err.message)}
}

async function logout(){
  try{if(session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:authHeaders(session.access_token)})}catch{}
  saveSession(null);currentUser=null;profile=null;records=[];loginView();
}

async function boot(){
  try{
    const confirmed=captureConfirmationHash();
    if(await ensureSession()){await loadData();render()}
    else loginView(confirmed?'Correo confirmado. Ya puedes ingresar.':'');
  }catch(err){
    console.error(err);
    loginView();
    const m=document.getElementById('authMsg');if(m)m.textContent='No fue posible conectar con el servicio. Recarga la página.';
  }
}
boot();
})();
