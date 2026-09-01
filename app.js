
(function(){
'use strict';

const SUPABASE_URL='https://lqmfgxftazazqvultewm.supabase.co';
const SUPABASE_KEY='sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl';
const APP_URL='https://lsueyras.github.io/pesocare/';
const BRAND_LOGO_URL=APP_URL+'brand-logo.png';
const SESSION_KEY='pesocare_session_v2';
const REMEMBER_KEY='pesocare_remember_me';
const SIGNUP_COOLDOWN_KEY='pesocare_signup_cooldown_until';

const app=document.getElementById('app');
let session=null, currentUser=null, profile=null, records=[];

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
  const p=await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
  profile=p?.[0]||null;
  if(profile){
    records=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=measured_on.asc,created_at.asc`)||[];
  }else records=[];
}

function render(){profile?dashboardView():initialProfileView()}

function header(){
  return `<div class="top">
    <div class="brandrow">
      <img src="${BRAND_LOGO_URL}" alt="Logo PesoCare" class="brand-image brand-image-small" onerror="this.style.display='none'">
      <div><div class="brand">PesoCare</div><div class="muted">${esc(currentUser?.email||'')}</div></div>
    </div>
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
          <div><label>Peso inicial (kg)</label><input id="initial" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 82,45" required></div>
          <div><label>Peso meta (kg)</label><input id="target" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 70,00"></div>
          <div><label>Circunferencia abdominal inicial (cm)</label><input id="initialAbdomen" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 102,35" required></div>
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
        <div><label>Fecha</label><input id="date" type="date" value="${today()}" required></div>
        <div><label>Peso (kg)</label><input id="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 94,85" required></div>
        <div><label>Circunferencia abdominal (cm)</label><input id="abdomen" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 111,50" required></div>
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
    </section>`);
  document.getElementById('weightForm').addEventListener('submit',addWeight);
  document.getElementById('reportBtn').addEventListener('click',generateReport);
  document.getElementById('editPlan').addEventListener('click',editPlan);
  document.getElementById('logout').addEventListener('click',logout);
  drawCharts(sorted);
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
  try{if(session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:authHeaders(session.access_token)})}catch{}
  clearStoredSession();session=null;currentUser=null;profile=null;records=[];loginView();
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
