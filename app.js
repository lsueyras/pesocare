
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm'

const supabase = createClient('https://lqmfgxftazazqvultewm.supabase.co', 'sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl')
const app = document.querySelector('#app')
let currentUser=null, profile=null, records=[], chart=null

const today=()=>{
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const parseDate=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))}
const fmt=s=>{if(!s)return'—';const[y,m,d]=s.split('-');return `${d}/${m}/${y}`}
const kg=n=>Number(n).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg'
const weekOf=date=>profile?Math.max(0,Math.floor((parseDate(date)-parseDate(profile.start_date))/(7*86400000))):0

function shell(content){
  return `<main class="shell">${content}<div class="footer">PesoCare · Seguimiento personal de peso</div></main>`
}

function loginView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card">
      <div class="brandrow">
        <div class="logo">P</div>
        <div><div class="brand">PesoCare</div><div class="muted">Seguimiento personal</div></div>
      </div>
      <p class="muted">Registra tu peso, revisa tu historial y monitorea tu evolución semanal.</p>
      ${message?`<div class="notice success">${message}</div>`:''}
      <form id="authForm" style="margin-top:16px">
        <label>Correo</label>
        <input id="email" type="email" inputmode="email" autocomplete="email" required placeholder="tu@correo.com">
        <label style="margin-top:10px">Contraseña</label>
        <input id="password" type="password" autocomplete="current-password" minlength="6" required>
        <div class="actions" style="margin-top:14px">
          <button class="primary" type="submit">Ingresar</button>
          <button class="secondary" type="button" id="signup">Crear cuenta</button>
        </div>
        <div style="margin-top:12px"><button type="button" class="linkbtn" id="forgot">Olvidé mi contraseña</button></div>
        <p id="authMsg" class="error"></p>
      </form>
    </section>`)
  document.querySelector('#authForm').addEventListener('submit',e=>auth(e,false))
  document.querySelector('#signup').addEventListener('click',e=>auth(e,true))
  document.querySelector('#forgot').addEventListener('click',forgotPassword)
}

async function auth(e,signup){
  e.preventDefault()
  const email=document.querySelector('#email').value.trim()
  const password=document.querySelector('#password').value
  const msg=document.querySelector('#authMsg')
  msg.textContent=''
  if(signup){
    const {data,error}=await supabase.auth.signUp({
      email,password,
      options:{emailRedirectTo:window.location.origin+window.location.pathname}
    })
    if(error){msg.textContent=error.message;return}
    if(data.session){
      currentUser=data.user;await loadData();render()
    } else {
      msg.textContent='Cuenta creada. Revisa tu correo y confirma el registro antes de ingresar.'
    }
  } else {
    const {data,error}=await supabase.auth.signInWithPassword({email,password})
    if(error){msg.textContent='No fue posible ingresar. Revisa el correo, contraseña y confirmación de la cuenta.';return}
    currentUser=data.user;await loadData();render()
  }
}

async function forgotPassword(){
  const email=document.querySelector('#email').value.trim()
  const msg=document.querySelector('#authMsg')
  if(!email){msg.textContent='Ingresa primero tu correo.';return}
  const {error}=await supabase.auth.resetPasswordForEmail(email,{
    redirectTo:window.location.origin+window.location.pathname
  })
  msg.textContent=error?error.message:'Te enviamos un correo para recuperar tu contraseña.'
}

async function loadData(){
  const {data:p,error:pe}=await supabase.from('profiles').select('*').eq('user_id',currentUser.id).maybeSingle()
  if(pe) throw pe
  profile=p||null
  if(profile){
    const {data:r,error:re}=await supabase.from('weight_records').select('*').eq('user_id',currentUser.id).order('measured_on')
    if(re) throw re
    records=r||[]
  } else records=[]
}

function render(){
  if(!profile) initialProfileView()
  else dashboardView()
}

function header(){
  return `<div class="top">
    <div class="brandrow"><div class="logo">P</div><div><div class="brand">PesoCare</div><div class="muted">${currentUser?.email||''}</div></div></div>
    <button class="secondary" id="logout">Salir</button>
  </div>`
}

function initialProfileView(){
  app.innerHTML=shell(`${header()}
    <section class="card">
      <h2 class="section-title">Datos iniciales</h2>
      <p class="muted">Estos datos crearán automáticamente tu registro inicial como Semana 0.</p>
      <form id="profileForm">
        <div class="grid">
          <div><label>Nombre completo</label><input id="name" required></div>
          <div><label>Fecha de nacimiento</label><input id="birth" type="date"></div>
          <div><label>Fecha de inicio</label><input id="start" type="date" value="${today()}" required></div>
          <div><label>Duración del seguimiento</label><input id="weeks" type="number" min="1" max="104" value="16" required></div>
          <div><label>Peso inicial (kg)</label><input id="initial" type="number" inputmode="decimal" min="20" max="350" step="0.1" required></div>
          <div><label>Peso meta (kg)</label><input id="target" type="number" inputmode="decimal" min="20" max="350" step="0.1"></div>
        </div>
        <button class="primary" style="margin-top:14px">Crear seguimiento</button>
        <p id="profileMsg" class="error"></p>
      </form>
    </section>`)
  document.querySelector('#profileForm').addEventListener('submit',createProfile)
  document.querySelector('#logout').addEventListener('click',logout)
}

async function createProfile(e){
  e.preventDefault()
  const p={
    user_id:currentUser.id,
    full_name:document.querySelector('#name').value.trim(),
    birth_date:document.querySelector('#birth').value||null,
    start_date:document.querySelector('#start').value,
    planned_weeks:Number(document.querySelector('#weeks').value),
    initial_weight_kg:Number(document.querySelector('#initial').value),
    target_weight_kg:document.querySelector('#target').value?Number(document.querySelector('#target').value):null
  }
  const msg=document.querySelector('#profileMsg')
  const {data,error}=await supabase.from('profiles').insert(p).select().single()
  if(error){msg.textContent=error.message;return}
  profile=data
  const {error:we}=await supabase.from('weight_records').insert({
    user_id:currentUser.id, measured_on:p.start_date, weight_kg:p.initial_weight_kg, is_initial:true
  })
  if(we){msg.textContent=we.message;return}
  await loadData();render()
}

function dashboardView(){
  const sorted=[...records].sort((a,b)=>a.measured_on.localeCompare(b.measured_on))
  const latest=sorted.at(-1)
  const change=Number(latest.weight_kg)-Number(profile.initial_weight_kg)
  const goal=profile.target_weight_kg?Number(profile.target_weight_kg):null
  const currentWeek=weekOf(latest.measured_on)
  const progress=Math.min(100,Math.max(0,(currentWeek/Math.max(1,profile.planned_weeks))*100))
  app.innerHTML=shell(`${header()}
    <section class="card">
      <div class="top" style="margin-bottom:6px">
        <div><h2 class="section-title">Hola, ${profile.full_name.split(' ')[0]}</h2>
        <div class="muted">Seguimiento de ${profile.planned_weeks} semanas · Inicio ${fmt(profile.start_date)}</div></div>
        <button id="editPlan" class="secondary">Editar plan</button>
      </div>
      <div class="progress"><div style="width:${progress}%"></div></div>
    </section>

    <section class="metrics">
      <div class="metric"><span>Peso actual</span><strong>${kg(latest.weight_kg)}</strong></div>
      <div class="metric"><span>Cambio</span><strong>${change>0?'+':''}${change.toFixed(1)} kg</strong></div>
      <div class="metric"><span>Semana</span><strong>${currentWeek} / ${profile.planned_weeks}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${goal?kg(goal):'—'}</strong></div>
    </section>

    <section class="card">
      <h2 class="section-title">Registrar peso</h2>
      <p class="muted">La fecha de hoy viene propuesta. Puedes cambiarla si estás ingresando un registro anterior.</p>
      <form id="weightForm">
        <div class="grid">
          <div><label>Fecha</label><input id="date" type="date" value="${today()}" required></div>
          <div><label>Peso (kg)</label><input id="weight" type="number" inputmode="decimal" min="20" max="350" step="0.1" required></div>
        </div>
        <button class="primary" style="margin-top:12px">Guardar peso</button>
        <p id="weightMsg" class="error"></p>
      </form>
    </section>

    <section class="card">
      <h2 class="section-title">Peso por semana</h2>
      <div class="muted">Evolución desde Semana 0 hasta Semana ${profile.planned_weeks}</div>
      <div class="chart-wrap"><canvas id="chart"></canvas></div>
    </section>

    <section class="card">
      <h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th></tr></thead>
        <tbody>${sorted.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOf(r.measured_on)}</td><td>${kg(r.weight_kg)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`)
  document.querySelector('#weightForm').addEventListener('submit',addWeight)
  document.querySelector('#editPlan').addEventListener('click',editPlan)
  document.querySelector('#logout').addEventListener('click',logout)
  drawChart(sorted)
}

function drawChart(sorted){
  const weekly=new Map()
  sorted.forEach(r=>{
    const w=weekOf(r.measured_on)
    if(w<=profile.planned_weeks) weekly.set(w,Number(r.weight_kg))
  })
  const labels=Array.from({length:profile.planned_weeks+1},(_,i)=>String(i))
  const values=labels.map((_,i)=>weekly.has(i)?weekly.get(i):null)
  const datasets=[{
    label:'Peso',
    data:values,
    borderColor:'#175cd3',
    backgroundColor:'#175cd3',
    tension:.25, spanGaps:true, borderWidth:3, pointRadius:4, pointHoverRadius:6
  }]
  if(profile.target_weight_kg) datasets.push({
    label:'Meta',
    data:labels.map(()=>Number(profile.target_weight_kg)),
    borderColor:'#039855', backgroundColor:'#039855',
    borderDash:[6,6], pointRadius:0, borderWidth:2
  })
  chart?.destroy()
  chart=new Chart(document.querySelector('#chart'),{
    type:'line',
    data:{labels,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'nearest',intersect:false},
      plugins:{legend:{position:'bottom'}},
      scales:{
        x:{title:{display:true,text:'Semanas'},grid:{color:'#f2f4f7'}},
        y:{title:{display:true,text:'Peso (kg)'},grid:{color:'#f2f4f7'}}
      }
    }
  })
}

async function addWeight(e){
  e.preventDefault()
  const measured_on=document.querySelector('#date').value
  const weight_kg=Number(document.querySelector('#weight').value)
  const msg=document.querySelector('#weightMsg')
  if(parseDate(measured_on)<parseDate(profile.start_date)){msg.textContent='La fecha no puede ser anterior al inicio del seguimiento.';return}
  const {error}=await supabase.from('weight_records').insert({
    user_id:currentUser.id, measured_on, weight_kg, is_initial:false
  })
  if(error){msg.textContent=error.message;return}
  await loadData();render()
}

async function editPlan(){
  const weeks=prompt('Duración del seguimiento en semanas:',String(profile.planned_weeks))
  if(weeks===null)return
  const target=prompt('Peso meta en kg. Déjalo vacío para eliminar la meta:',profile.target_weight_kg??'')
  const nextWeeks=Math.max(1,Math.min(104,Number(weeks)||profile.planned_weeks))
  const nextTarget=target===''?null:Number(target)
  const {error}=await supabase.from('profiles').update({
    planned_weeks:nextWeeks,target_weight_kg:nextTarget,updated_at:new Date().toISOString()
  }).eq('user_id',currentUser.id)
  if(error){alert(error.message);return}
  await loadData();render()
}

async function logout(){
  await supabase.auth.signOut()
  currentUser=null;profile=null;records=[]
  loginView()
}

async function boot(){
  const {data}=await supabase.auth.getSession()
  currentUser=data.session?.user||null
  supabase.auth.onAuthStateChange(async(_event,session)=>{
    if(session?.user && !currentUser){
      currentUser=session.user
      await loadData();render()
    }
  })
  if(currentUser){await loadData();render()}else loginView()
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js')}catch(_e){}
  }
}
boot()
