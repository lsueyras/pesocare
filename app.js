
(function(){
'use strict';

const SUPABASE_URL='https://lqmfgxftazazqvultewm.supabase.co';
const SUPABASE_KEY='sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl';
const APP_URL='https://lsueyras.github.io/pesocare/';
const BRAND_LOGO_URL=APP_URL+'brand-logo.png';
const APP_VERSION='24.1';
const VAPID_PUBLIC_KEY='BFmDmOAgsUFCZO8zPzgfCAwK8oEWdoGppWH-bojgffhCbIm4jkil637a4c7O_ObCgAATS1muWhHniGj-ZdBc31k';
const BRAND_BUILD='BodyCare';
const SESSION_KEY='pesocare_session_v2';
const REMEMBER_KEY='pesocare_remember_me';
const SIGNUP_COOLDOWN_KEY='pesocare_signup_cooldown_until';
const PASSKEY_LOCAL_KEY='bodycare_passkey_enrolled_v1';
const PASSKEY_UNLOCKED_KEY='bodycare_passkey_unlocked_session_v1';
const PASSKEY_OFFER_PREFIX='bodycare_passkey_offer_';

const app=document.getElementById('app');

const startupFailureView=message=>{
  try{
    if(!app)return;
    app.innerHTML=`<main class="shell">
      <section class="card auth-card startup-error-card">
        <div class="brandrow" style="justify-content:center">
          <img src="${BRAND_LOGO_URL}" alt="BodyCare" class="brand-image brand-image-small" onerror="this.style.display='none'">
          <div><div class="brand">BodyCare</div><div class="muted">Recuperación de inicio</div></div>
        </div>
        <h2 class="section-title" style="margin-top:18px">No fue posible iniciar BodyCare</h2>
        <p class="muted">La aplicación detectó un error de arranque. Tus datos permanecen en Supabase.</p>
        <div class="notice warning">${String(message||'Error inesperado').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>
        <button type="button" class="primary" onclick="location.reload()">Reintentar</button>
      </section>
      <div class="footer">BodyCare · Salud y progreso · v${APP_VERSION}</div>
    </main>`;
  }catch{}
};
window.addEventListener('error',e=>{
  console.error('BodyCare startup error',e.error||e.message);
  startupFailureView(e?.error?.message||e?.message||'Error de ejecución');
});
window.addEventListener('unhandledrejection',e=>{
  console.error('BodyCare unhandled rejection',e.reason);
});

let session=null, currentUser=null, profile=null, records=[];
let account=null, roles=[], activePortal='PATIENT';
let careLinks=[], linkedDoctorProfiles=[], patientPrescriptions=[], patientMessages=[], patientControls=[], supportTickets=[];
let patientCarePlan={goals:[],actions:[]}, patientCarePlanDoctorId=null, patientCarePlanSyncing=false;
let patientNutritionPlan={plan:null,items:[]}, patientNutritionCatalog=[], patientNutritionDay=null;
let patientNutritionDoctorId=null, patientNutritionDate=null, patientNutritionSyncing=false;
let editingNutritionPlanItemId=null;
let doctorProfile=null, doctorPatients=[], doctorPatientDetail=null;
let doctorPriorities=[], doctorAlertSettings=null;
let doctorAgenda=[], doctorAgendaMode='TODAY', doctorAgendaSyncing=false;
let doctorOutcomes=[], doctorOutcomeFilter='ALL', doctorOutcomeSearch='';
let doctorTimelineFilter='ALL', doctorTimelineLastSync=0;
let adminUsers=[], adminTickets=[], adminLoaded=false;
let editingPrescriptionId=null;
let editingWeightRecordId=null;
let editingCareGoalId=null, editingCareActionId=null;
let notifications=[];
let realtimeSocket=null, realtimeHeartbeat=null, realtimeReconnectTimer=null;
let realtimeAttempts=0, realtimeRef=0, realtimeJoinRef=null, realtimeTopic=null;
let realtimeStatus='offline', realtimeManuallyStopped=false;
let realtimeFallbackTimer=null;
let activePatientTab=localStorage.getItem('pesocare_patient_tab')||'TRACKING';
let supportSyncSeq=0;
let contextSyncTimer=null, lifecycleSyncBound=false;
let patientMessagesSyncing=false, patientMessagesSyncPending=false;
let patientPrescriptionsSyncing=false, patientPrescriptionsSyncPending=false;
let doctorMessagesSyncing=false, doctorMessagesSyncPending=false;
let doctorPrescriptionsSyncing=false, doctorPrescriptionsSyncPending=false;
let patientControlsSyncing=false, patientControlsSyncPending=false;
let doctorControlsSyncing=false, doctorControlsSyncPending=false;
let notificationPreferences={
  push_enabled:true,
  messages:true,
  prescriptions:true,
  care_updates:true,
  support:true,
  appointment_reminders:true,
  confirmation_reminders:true,
  record_reminders:true
};
let patientReminderPlan=null;
let patientReminderSaving=false;
let patientReminderDirty=false;
let pushBrowserSubscription=null;
let pushSettingsLoaded=false;
let launchNotificationId=new URLSearchParams(location.search).get('notification');
let sessionRefreshPromise=null;


const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
patientNutritionDate=today();
const parseDate=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
const fmt=s=>{if(!s)return '—';const[y,m,d]=s.split('-');return `${d}/${m}/${y}`};
const formatDateCL=iso=>{
  if(!iso)return '';
  const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}/${m[2]}/${m[1]}`:'';
};

const parseDateCL=value=>{
  const raw=String(value||'').trim();
  const m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m)return null;
  const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
  const dt=new Date(Date.UTC(year,month-1,day));
  if(dt.getUTCFullYear()!==year||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day)return null;
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
};

function normalizeDateCLInput(el){
  if(!el)return true;
  const raw=el.value.trim();
  if(!raw){
    delete el.dataset.isoDate;
    el.classList.remove('date-invalid');
    return true;
  }
  const iso=parseDateCL(raw);
  if(!iso){
    delete el.dataset.isoDate;
    el.classList.add('date-invalid');
    return false;
  }
  el.value=formatDateCL(iso);
  el.dataset.isoDate=iso;
  el.classList.remove('date-invalid');
  return true;
}

function bindDateCLInputs(root=document){
  root.querySelectorAll('[data-date-cl]').forEach(el=>{
    enhanceDateCLControl(el);
    if(el.dataset.dateBound==='1')return;
    el.dataset.dateBound='1';

    el.addEventListener('blur',()=>normalizeDateCLInput(el));
    el.addEventListener('input',()=>{
      delete el.dataset.isoDate;
      el.classList.remove('date-invalid');
      let v=el.value.replace(/\D/g,'').slice(0,8);
      if(v.length>4)v=v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
      else if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2);
      el.value=v;
    });
  });
}

function requireDateCL(id,label,allowEmpty=false){
  const el=document.getElementById(id);
  if(!el)return allowEmpty?null:'';
  const raw=el.value.trim();
  if(!raw&&allowEmpty)return null;

  const visibleIso=parseDateCL(raw);
  const storedIso=/^\d{4}-\d{2}-\d{2}$/.test(el.dataset.isoDate||'')?el.dataset.isoDate:null;
  const iso=visibleIso||storedIso;

  if(!iso){
    el.classList.add('date-invalid');
    throw new Error(`${label}: selecciona una fecha o usa el formato DD/MM/AAAA.`);
  }

  el.value=formatDateCL(iso);
  el.dataset.isoDate=iso;
  el.classList.remove('date-invalid');
  return iso;
}



let bodycareCalendarTargetId=null;
let bodycareCalendarYear=null;
let bodycareCalendarMonth=null;

function calendarButtonSvg(){
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"/>
  </svg>`;
}

function currentCalendarTarget(){
  return bodycareCalendarTargetId?document.getElementById(bodycareCalendarTargetId):null;
}

function ensureBodyCareCalendar(){
  let overlay=document.getElementById('bodycareCalendarOverlay');
  if(overlay)return overlay;

  overlay=document.createElement('div');
  overlay.id='bodycareCalendarOverlay';
  overlay.className='bodycare-calendar-overlay';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML=`
    <div class="bodycare-calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="bodycareCalendarTitle">
      <div class="bodycare-calendar-header">
        <button type="button" class="bodycare-calendar-nav" data-calendar-action="prev" aria-label="Mes anterior">‹</button>
        <div id="bodycareCalendarTitle" class="bodycare-calendar-title"></div>
        <button type="button" class="bodycare-calendar-nav" data-calendar-action="next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="bodycare-calendar-weekdays">
        <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span>
      </div>
      <div id="bodycareCalendarGrid" class="bodycare-calendar-grid"></div>
      <div class="bodycare-calendar-footer">
        <button type="button" class="secondary small-btn" data-calendar-action="today">Hoy</button>
        <button type="button" class="secondary small-btn" data-calendar-action="close">Cerrar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click',e=>{
    const action=e.target.closest('[data-calendar-action]')?.dataset.calendarAction;
    const dayButton=e.target.closest('[data-calendar-date]');

    if(e.target===overlay){
      closeBodyCareCalendar();
      return;
    }

    if(dayButton){
      applyBodyCareCalendarDate(dayButton.dataset.calendarDate);
      return;
    }

    if(action==='prev'){
      bodycareCalendarMonth-=1;
      if(bodycareCalendarMonth<0){
        bodycareCalendarMonth=11;
        bodycareCalendarYear-=1;
      }
      renderBodyCareCalendar();
    }else if(action==='next'){
      bodycareCalendarMonth+=1;
      if(bodycareCalendarMonth>11){
        bodycareCalendarMonth=0;
        bodycareCalendarYear+=1;
      }
      renderBodyCareCalendar();
    }else if(action==='today'){
      applyBodyCareCalendarDate(today());
    }else if(action==='close'){
      closeBodyCareCalendar();
    }
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&overlay.classList.contains('open'))closeBodyCareCalendar();
  });

  return overlay;
}

function openBodyCareCalendar(input){
  if(!input?.id)return;

  bodycareCalendarTargetId=input.id;
  const selected=parseDateCL(input.value)||input.dataset.isoDate||today();
  const m=String(selected).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return;

  bodycareCalendarYear=Number(m[1]);
  bodycareCalendarMonth=Number(m[2])-1;

  const overlay=ensureBodyCareCalendar();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden','false');
  renderBodyCareCalendar();
}

function closeBodyCareCalendar(){
  const overlay=document.getElementById('bodycareCalendarOverlay');
  if(overlay){
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
  }
  bodycareCalendarTargetId=null;
}

function applyBodyCareCalendarDate(iso){
  const target=currentCalendarTarget();
  if(!target||!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return;

  target.value=formatDateCL(iso);
  target.dataset.isoDate=iso;
  target.classList.remove('date-invalid');

  // Availability and other dependent modules listen to change.
  target.dispatchEvent(new Event('change',{bubbles:true}));

  // Re-assert after listeners in case another handler touched the value.
  target.value=formatDateCL(iso);
  target.dataset.isoDate=iso;

  closeBodyCareCalendar();
}

function renderBodyCareCalendar(){
  const title=document.getElementById('bodycareCalendarTitle');
  const grid=document.getElementById('bodycareCalendarGrid');
  const target=currentCalendarTarget();
  if(!title||!grid||bodycareCalendarYear===null||bodycareCalendarMonth===null)return;

  const year=bodycareCalendarYear;
  const month=bodycareCalendarMonth;

  title.textContent=new Intl.DateTimeFormat('es-CL',{
    month:'long',
    year:'numeric',
    timeZone:'UTC'
  }).format(new Date(Date.UTC(year,month,1))).replace(/^./,c=>c.toUpperCase());

  const first=new Date(Date.UTC(year,month,1));
  const lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const leading=(first.getUTCDay()+6)%7;
  const selected=target?(parseDateCL(target.value)||target.dataset.isoDate||null):null;
  const todayIso=today();

  let html='';
  for(let i=0;i<leading;i++)html+='<span class="bodycare-calendar-empty"></span>';

  for(let day=1;day<=lastDay;day++){
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cls=[
      'bodycare-calendar-day',
      iso===selected?'selected':'',
      iso===todayIso?'today':''
    ].filter(Boolean).join(' ');

    html+=`<button type="button" class="${cls}" data-calendar-date="${iso}" aria-label="${formatDateCL(iso)}">${day}</button>`;
  }

  grid.innerHTML=html;
}

function enhanceDateCLControl(input){
  if(!input||input.dataset.calendarEnhanced==='1')return;
  input.dataset.calendarEnhanced='1';

  const initialIso=parseDateCL(input.value);
  if(initialIso){
    input.dataset.isoDate=initialIso;
    input.value=formatDateCL(initialIso);
  }

  let wrap=input.parentElement;

  // Reuse BodyCare's visible field frame when one already exists.
  if(wrap?.classList.contains('control-frame')){
    wrap.classList.add('date-cl-control');
  }else if(!wrap?.classList.contains('date-cl-control')){
    const newWrap=document.createElement('div');
    newWrap.className='date-cl-control';
    input.parentNode.insertBefore(newWrap,input);
    newWrap.appendChild(input);
    wrap=newWrap;
  }

  const button=document.createElement('button');
  button.type='button';
  button.className='date-cl-button';
  button.setAttribute('aria-label','Abrir calendario');
  button.innerHTML=calendarButtonSvg();

  button.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    openBodyCareCalendar(input);
  });

  wrap.appendChild(button);
}

const parseDecimal=value=>{
  const normalized=String(value??'').trim().replace(/\s/g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  return Number(normalized);
};
const kg=n=>Number(n).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:2})+' kg';
const cm=n=>n===null||n===undefined||n===''?'—':Number(n).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})+' cm';
const weekOf=date=>profile?Math.max(0,Math.floor((parseDate(date)-parseDate(profile.start_date))/(7*86400000))):0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));


const RX_OTHER='__OTHER__';

const WEIGHT_RX_CATALOG=[
  {
    id:'wegovy_sc',
    group:'Inyectables',
    label:'Wegovy® inyectable',
    medication:'Wegovy',
    aliases:['wegovy'],
    ingredients:['Semaglutida'],
    routes:['Subcutánea'],
    regulatory:'Chile: registro ISP confirmado para presentaciones 0,25–2,4 mg. Confirmar siempre ficha profesional vigente.',
    doses:['0,25 mg','0,5 mg','1 mg','1,7 mg','2,4 mg'],
    frequencies:['1 vez por semana'],
    durations:['4 semanas','8 semanas','12 semanas','16 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '0,25 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '0,5 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '1 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '1,7 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '2,4 mg':{frequency:'1 vez por semana',duration:'Mantención continua según respuesta/tolerancia'}
    }
  },
  {
    id:'tirzepatide_sc',
    group:'Inyectables',
    label:'Mounjaro® / Zepbound® (tirzepatida)',
    medication:'Tirzepatida (Mounjaro/Zepbound)',
    aliases:['mounjaro','zepbound','tirzepatida','tirzepatide'],
    ingredients:['Tirzepatida'],
    routes:['Subcutánea'],
    regulatory:'Chile: ISP registra presentaciones de Mounjaro/tirzepatida 2,5–15 mg. Confirmar indicación específica y ficha vigente del producto.',
    doses:['2,5 mg','5 mg','7,5 mg','10 mg','12,5 mg','15 mg'],
    frequencies:['1 vez por semana'],
    durations:['4 semanas','8 semanas','12 semanas','16 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '2,5 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '5 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '7,5 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '10 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '12,5 mg':{frequency:'1 vez por semana',duration:'4 semanas'},
      '15 mg':{frequency:'1 vez por semana',duration:'Mantención continua según respuesta/tolerancia'}
    }
  },
  {
    id:'saxenda_sc',
    group:'Inyectables',
    label:'Saxenda®',
    medication:'Saxenda',
    aliases:['saxenda','liraglutida','liraglutide'],
    ingredients:['Liraglutida'],
    routes:['Subcutánea'],
    regulatory:'Indicación antiobesidad establecida internacionalmente. Verificar registro y ficha ISP vigente antes de emitir receta.',
    doses:['0,6 mg','1,2 mg','1,8 mg','2,4 mg','3 mg'],
    frequencies:['1 vez al día'],
    durations:['1 semana','2 semanas','4 semanas','8 semanas','12 semanas','16 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '0,6 mg':{frequency:'1 vez al día',duration:'1 semana'},
      '1,2 mg':{frequency:'1 vez al día',duration:'1 semana'},
      '1,8 mg':{frequency:'1 vez al día',duration:'1 semana'},
      '2,4 mg':{frequency:'1 vez al día',duration:'1 semana'},
      '3 mg':{frequency:'1 vez al día',duration:'Mantención continua según respuesta/tolerancia'}
    }
  },
  {
    id:'wegovy_oral',
    group:'Comprimidos',
    label:'Wegovy® comprimidos (semaglutida oral)',
    medication:'Wegovy comprimidos',
    aliases:['wegovy comprimidos','wegovy oral','semaglutida oral'],
    ingredients:['Semaglutida'],
    routes:['Oral'],
    regulatory:'FDA 2026 / recomendación EMA 2026. Disponibilidad y registro para obesidad en Chile: verificar antes de prescribir.',
    doses:['1,5 mg','4 mg','9 mg','25 mg'],
    frequencies:['1 vez al día, en ayunas'],
    durations:['30 días','60 días','90 días','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '1,5 mg':{frequency:'1 vez al día, en ayunas',duration:'30 días'},
      '4 mg':{frequency:'1 vez al día, en ayunas',duration:'30 días'},
      '9 mg':{frequency:'1 vez al día, en ayunas',duration:'30 días'},
      '25 mg':{frequency:'1 vez al día, en ayunas',duration:'Mantención continua según respuesta/tolerancia'}
    }
  },
  {
    id:'naltrexone_bupropion',
    group:'Comprimidos',
    label:'Naltrexona / Bupropión LP (Mysimba® / Contrave®)',
    medication:'Naltrexona/Bupropión LP',
    aliases:['mysimba','contrave','naltrexona/bupropión','naltrexona bupropion','naltrexone bupropion'],
    ingredients:['Naltrexona + Bupropión'],
    routes:['Oral'],
    regulatory:'Indicación antiobesidad FDA/EMA. Verificar registro, contraindicaciones y ficha ISP vigente en Chile.',
    doses:[
      '1 comprimido AM (8/90 mg)',
      '1 comprimido AM + 1 PM (16/180 mg/día)',
      '2 comprimidos AM + 1 PM (24/270 mg/día)',
      '2 comprimidos AM + 2 PM (32/360 mg/día)'
    ],
    frequencies:['1 vez al día (mañana)','2 veces al día (mañana y tarde)'],
    durations:['1 semana','4 semanas','8 semanas','12 semanas','16 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '1 comprimido AM (8/90 mg)':{frequency:'1 vez al día (mañana)',duration:'1 semana'},
      '1 comprimido AM + 1 PM (16/180 mg/día)':{frequency:'2 veces al día (mañana y tarde)',duration:'1 semana'},
      '2 comprimidos AM + 1 PM (24/270 mg/día)':{frequency:'2 veces al día (mañana y tarde)',duration:'1 semana'},
      '2 comprimidos AM + 2 PM (32/360 mg/día)':{frequency:'2 veces al día (mañana y tarde)',duration:'Mantención continua según respuesta/tolerancia'}
    }
  },
  {
    id:'orlistat',
    group:'Comprimidos',
    label:'Orlistat (Xenical® / genérico)',
    medication:'Orlistat',
    aliases:['orlistat','xenical','alli'],
    ingredients:['Orlistat'],
    routes:['Oral'],
    regulatory:'Indicación antiobesidad establecida internacionalmente. Verificar presentación y ficha ISP vigente.',
    doses:['60 mg','120 mg'],
    frequencies:['Con cada comida principal que contenga grasa, hasta 3 veces al día'],
    durations:['4 semanas','8 semanas','12 semanas','16 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '60 mg':{frequency:'Con cada comida principal que contenga grasa, hasta 3 veces al día',duration:'12 semanas'},
      '120 mg':{frequency:'Con cada comida principal que contenga grasa, hasta 3 veces al día',duration:'12 semanas'}
    }
  },
  {
    id:'phentermine_topiramate',
    group:'Comprimidos',
    label:'Fentermina / Topiramato LP (Qsymia®)',
    medication:'Fentermina/Topiramato LP',
    aliases:['qsymia','fentermina/topiramato','phentermine/topiramate'],
    ingredients:['Fentermina + Topiramato'],
    routes:['Oral'],
    regulatory:'Aprobado para control de peso en EE.UU.; contiene fármaco controlado. Verificar estrictamente disponibilidad, registro y regulación chilena.',
    doses:['3,75/23 mg','7,5/46 mg','11,25/69 mg','15/92 mg'],
    frequencies:['1 vez al día, por la mañana'],
    durations:['14 días','4 semanas','8 semanas','12 semanas','3 meses','6 meses','12 meses','Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      '3,75/23 mg':{frequency:'1 vez al día, por la mañana',duration:'14 días'},
      '7,5/46 mg':{frequency:'1 vez al día, por la mañana',duration:'12 semanas'},
      '11,25/69 mg':{frequency:'1 vez al día, por la mañana',duration:'14 días'},
      '15/92 mg':{frequency:'1 vez al día, por la mañana',duration:'12 semanas'}
    }
  },
  {
    id:'setmelanotide',
    group:'Uso especializado',
    label:'Setmelanotida (Imcivree®) — obesidad genética específica',
    medication:'Setmelanotida (Imcivree)',
    aliases:['setmelanotida','setmelanotide','imcivree'],
    ingredients:['Setmelanotida'],
    routes:['Subcutánea'],
    regulatory:'Uso reservado a indicaciones genéticas específicas de obesidad. Requiere evaluación especializada y ficha técnica vigente.',
    doses:['Dosis individualizada según edad, indicación genética y ficha técnica'],
    frequencies:['1 vez al día'],
    durations:['Mantención continua según respuesta/tolerancia'],
    doseDefaults:{
      'Dosis individualizada según edad, indicación genética y ficha técnica':{frequency:'1 vez al día',duration:'Mantención continua según respuesta/tolerancia'}
    }
  }
];

const RX_STANDARD_DURATIONS=[
  '1 semana','2 semanas','14 días','4 semanas','8 semanas','12 semanas','16 semanas',
  '30 días','60 días','90 días','3 meses','6 meses','12 meses',
  'Mantención continua según respuesta/tolerancia'
];

function normalizeRxText(value){
  return String(value||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[®™]/g,'');
}

function findRxCatalogEntry(medication,ingredient=''){
  const med=normalizeRxText(medication);
  const ing=normalizeRxText(ingredient);
  return WEIGHT_RX_CATALOG.find(item=>{
    if(normalizeRxText(item.medication)===med)return true;
    if(item.aliases.some(a=>med.includes(normalizeRxText(a))||normalizeRxText(a).includes(med)))return true;
    return !!ing && item.ingredients.some(i=>normalizeRxText(i)===ing);
  })||null;
}

function optionMarkup(value,label,selected){
  return `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label??value)}</option>`;
}

function rxCatalogMedicationOptions(selectedEntryId=''){
  const groups=[...new Set(WEIGHT_RX_CATALOG.map(x=>x.group))];
  return `<option value="">Selecciona medicamento…</option>`+
    groups.map(group=>`<optgroup label="${esc(group)}">${
      WEIGHT_RX_CATALOG.filter(x=>x.group===group).map(x=>optionMarkup(x.id,x.label,x.id===selectedEntryId)).join('')
    }</optgroup>`).join('')+
    `<option value="${RX_OTHER}" ${selectedEntryId===RX_OTHER?'selected':''}>Otro medicamento / esquema personalizado…</option>`;
}

function rxFieldOptions(values,current,placeholder='Selecciona…'){
  const unique=[...new Set((values||[]).filter(Boolean))];
  const known=unique.includes(current);
  return `<option value="">${esc(placeholder)}</option>`+
    unique.map(v=>optionMarkup(v,v,v===current)).join('')+
    `<option value="${RX_OTHER}" ${current&&!known?'selected':''}>Otra opción…</option>`;
}

function rxResolvedValue(selectId,otherId){
  const sel=document.getElementById(selectId);
  if(!sel)return '';
  if(sel.value===RX_OTHER)return document.getElementById(otherId)?.value.trim()||'';
  return sel.value.trim();
}

function rxManualField(id,label,value=''){
  return `<div class="rx-manual-field" id="${id}Wrap">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" value="${esc(value)}">
  </div>`;
}

function prescriptionFormMarkup(editing){
  const entry=editing?findRxCatalogEntry(editing.medication_name,editing.active_ingredient):null;
  const entryId=editing?(entry?.id||RX_OTHER):'';

  const currentMedication=editing?.medication_name||'';
  const currentIngredient=editing?.active_ingredient||'';
  const currentRoute=editing?.route_text||'';
  const currentDose=editing?.dose_text||'';
  const currentFrequency=editing?.frequency_text||'';
  const currentDuration=editing?.duration_text||'';

  const ingredients=entry?.ingredients||[];
  const routes=entry?.routes||[];
  const doses=entry?.doses||[];
  const frequencies=entry?.frequencies||[];
  const durations=entry?.durations||RX_STANDARD_DURATIONS;

  return `<form id="doctorPrescriptionForm">
    <div class="rx-catalog-note">
      <strong>Catálogo clínico BodyCare</strong>
      <span>Opciones de apoyo basadas en tratamientos antiobesidad con indicación regulatoria. El profesional debe confirmar registro, ficha técnica, contraindicaciones e indicación vigente en Chile antes de prescribir.</span>
    </div>

    <div class="grid rx-grid">
      <div>
        <label>Medicamento</label>
        <select id="rxMedicationSelect" required>${rxCatalogMedicationOptions(entryId)}</select>
        ${rxManualField('rxMedicationOther','Otro medicamento',entryId===RX_OTHER?currentMedication:'')}
      </div>

      <div>
        <label>Principio activo</label>
        <select id="rxIngredientSelect" required>${rxFieldOptions(ingredients,currentIngredient,'Selecciona principio activo…')}</select>
        ${rxManualField('rxIngredientOther','Otro principio activo',currentIngredient&&!ingredients.includes(currentIngredient)?currentIngredient:'')}
      </div>

      <div>
        <label>Vía / presentación</label>
        <select id="rxRouteSelect">${rxFieldOptions(routes,currentRoute,'Selecciona vía…')}</select>
        ${rxManualField('rxRouteOther','Otra vía / presentación',currentRoute&&!routes.includes(currentRoute)?currentRoute:'')}
      </div>

      <div>
        <label>Dosis</label>
        <select id="rxDoseSelect" required>${rxFieldOptions(doses,currentDose,'Selecciona dosis…')}</select>
        ${rxManualField('rxDoseOther','Otra dosis',currentDose&&!doses.includes(currentDose)?currentDose:'')}
      </div>

      <div>
        <label>Frecuencia</label>
        <select id="rxFrequencySelect" required>${rxFieldOptions(frequencies,currentFrequency,'Selecciona frecuencia…')}</select>
        ${rxManualField('rxFrequencyOther','Otra frecuencia',currentFrequency&&!frequencies.includes(currentFrequency)?currentFrequency:'')}
      </div>

      <div>
        <label>Fecha inicio</label>
        <input id="rxStart" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl value="${formatDateCL(editing?.start_date||today())}">
      </div>

      <div>
        <label>Duración</label>
        <select id="rxDurationSelect">${rxFieldOptions(durations,currentDuration,'Selecciona duración…')}</select>
        ${rxManualField('rxDurationOther','Otra duración',currentDuration&&!durations.includes(currentDuration)?currentDuration:'')}
      </div>
    </div>

    <div id="rxRegulatoryNote" class="rx-regulatory-note">${entry?esc(entry.regulatory):'Selecciona un medicamento para ver información regulatoria de referencia.'}</div>

    <label style="margin-top:10px">Indicaciones adicionales</label>
    <textarea id="rxInstructions" rows="3">${esc(editing?.instructions||'')}</textarea>

    <div class="form-actions">
      <button class="primary" type="submit">${editing?'Guardar cambios':'Guardar y compartir indicación'}</button>
      ${editing?'<button class="secondary" id="cancelPrescriptionEdit" type="button">Cancelar edición</button>':''}
    </div>
  </form>`;
}

function toggleRxOther(selectId,otherId){
  const sel=document.getElementById(selectId);
  const wrap=document.getElementById(otherId+'Wrap');
  if(!sel||!wrap)return;
  wrap.classList.toggle('show',sel.value===RX_OTHER);
}

function populateRxField(selectId,otherId,values,current='',placeholder='Selecciona…'){
  const sel=document.getElementById(selectId);
  const other=document.getElementById(otherId);
  if(!sel)return;
  sel.innerHTML=rxFieldOptions(values,current,placeholder);
  if(current && !(values||[]).includes(current)){
    sel.value=RX_OTHER;
    if(other)other.value=current;
  }
  toggleRxOther(selectId,otherId);
}

function bindPrescriptionCatalog(editing){
  const medicationSelect=document.getElementById('rxMedicationSelect');
  if(!medicationSelect)return;

  const refreshFromMedication=(preserve=false)=>{
    const entry=WEIGHT_RX_CATALOG.find(x=>x.id===medicationSelect.value)||null;
    const old={
      ingredient:preserve?rxResolvedValue('rxIngredientSelect','rxIngredientOther'):'',
      route:preserve?rxResolvedValue('rxRouteSelect','rxRouteOther'):'',
      dose:preserve?rxResolvedValue('rxDoseSelect','rxDoseOther'):'',
      frequency:preserve?rxResolvedValue('rxFrequencySelect','rxFrequencyOther'):'',
      duration:preserve?rxResolvedValue('rxDurationSelect','rxDurationOther'):''
    };

    if(entry){
      populateRxField('rxIngredientSelect','rxIngredientOther',entry.ingredients,entry.ingredients.includes(old.ingredient)?old.ingredient:entry.ingredients[0],'Selecciona principio activo…');
      populateRxField('rxRouteSelect','rxRouteOther',entry.routes,entry.routes.includes(old.route)?old.route:entry.routes[0],'Selecciona vía…');
      populateRxField('rxDoseSelect','rxDoseOther',entry.doses,entry.doses.includes(old.dose)?old.dose:'','Selecciona dosis…');
      populateRxField('rxFrequencySelect','rxFrequencyOther',entry.frequencies,entry.frequencies.includes(old.frequency)?old.frequency:entry.frequencies[0],'Selecciona frecuencia…');
      populateRxField('rxDurationSelect','rxDurationOther',entry.durations,entry.durations.includes(old.duration)?old.duration:'','Selecciona duración…');
      document.getElementById('rxRegulatoryNote').textContent=entry.regulatory;
    }else{
      populateRxField('rxIngredientSelect','rxIngredientOther',[],old.ingredient,'Selecciona principio activo…');
      populateRxField('rxRouteSelect','rxRouteOther',[],old.route,'Selecciona vía…');
      populateRxField('rxDoseSelect','rxDoseOther',[],old.dose,'Selecciona dosis…');
      populateRxField('rxFrequencySelect','rxFrequencyOther',[],old.frequency,'Selecciona frecuencia…');
      populateRxField('rxDurationSelect','rxDurationOther',RX_STANDARD_DURATIONS,old.duration,'Selecciona duración…');
      document.getElementById('rxRegulatoryNote').textContent='Esquema personalizado: confirmar registro, indicación, dosis y ficha técnica vigente antes de prescribir.';
    }
    toggleRxOther('rxMedicationSelect','rxMedicationOther');
  };

  medicationSelect.addEventListener('change',()=>{
    refreshFromMedication(false);
    if(medicationSelect.value===RX_OTHER){
      document.getElementById('rxMedicationOther')?.focus();
    }
  });

  [
    ['rxIngredientSelect','rxIngredientOther'],
    ['rxRouteSelect','rxRouteOther'],
    ['rxDoseSelect','rxDoseOther'],
    ['rxFrequencySelect','rxFrequencyOther'],
    ['rxDurationSelect','rxDurationOther']
  ].forEach(([s,o])=>{
    document.getElementById(s)?.addEventListener('change',()=>{
      toggleRxOther(s,o);
      if(document.getElementById(s)?.value===RX_OTHER)document.getElementById(o)?.focus();
    });
  });

  document.getElementById('rxDoseSelect')?.addEventListener('change',()=>{
    const entry=WEIGHT_RX_CATALOG.find(x=>x.id===medicationSelect.value);
    const dose=document.getElementById('rxDoseSelect').value;
    const defaults=entry?.doseDefaults?.[dose];
    if(!defaults)return;

    const freq=document.getElementById('rxFrequencySelect');
    if(freq && [...freq.options].some(o=>o.value===defaults.frequency))freq.value=defaults.frequency;

    const dur=document.getElementById('rxDurationSelect');
    if(dur && [...dur.options].some(o=>o.value===defaults.duration))dur.value=defaults.duration;
  });

  if(editing){
    toggleRxOther('rxMedicationSelect','rxMedicationOther');
    [
      ['rxIngredientSelect','rxIngredientOther'],
      ['rxRouteSelect','rxRouteOther'],
      ['rxDoseSelect','rxDoseOther'],
      ['rxFrequencySelect','rxFrequencyOther'],
      ['rxDurationSelect','rxDurationOther']
    ].forEach(([s,o])=>toggleRxOther(s,o));
  }
}

function shell(content){
  return `<main class="shell">${content}<div class="footer">BodyCare · Salud y progreso · v${APP_VERSION}</div></main>`;
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
    const err=new Error(msg);
    err.status=res.status;
    err.data=data;
    throw err;
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
  if(sessionRefreshPromise)return sessionRefreshPromise;
  if(!session?.refresh_token)return false;

  const refreshToken=session.refresh_token;

  sessionRefreshPromise=(async()=>{
    try{
      const data=await jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
        method:'POST',
        headers:authHeaders(),
        body:JSON.stringify({refresh_token:refreshToken})
      });

      if(!data?.access_token)throw new Error('Supabase no devolvió un nuevo access token.');

      saveSession({
        access_token:data.access_token,
        refresh_token:data.refresh_token||refreshToken,
        expires_at:Date.now()+Number(data.expires_in||3600)*1000
      });

      try{sendRealtimeAccessToken()}catch{}
      return true;
    }catch(err){
      console.warn('Session refresh failed',err);

      // Only clear if the session still uses the token that actually failed.
      // This prevents one concurrent request from deleting a session
      // already renewed by another context/tab.
      if(session?.refresh_token===refreshToken){
        clearStoredSession();
        session=null;
      }
      return false;
    }finally{
      sessionRefreshPromise=null;
    }
  })();

  return sessionRefreshPromise;
}

async function ensureFreshAccessToken(){
  if(!session?.access_token)return false;
  if(session.expires_at && Date.now()>session.expires_at-90000){
    return refreshSession();
  }
  return true;
}

async function withSessionRetry(requestFn){
  if(!session?.access_token)throw new Error('La sesión no está disponible. Vuelve a iniciar sesión.');

  await ensureFreshAccessToken();

  try{
    return await requestFn();
  }catch(err){
    if(Number(err?.status)===401 && session?.refresh_token){
      const refreshed=await refreshSession();
      if(refreshed){
        return await requestFn();
      }
    }
    throw err;
  }
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
  return withSessionRetry(()=>jsonFetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    cache:'no-store',
    headers:{
      ...authHeaders(session.access_token),
      'Accept':'application/json',
      'Cache-Control':'no-cache'
    }
  }));
}

async function dbInsert(table,obj){
  return withSessionRetry(()=>jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`,{
    method:'POST',
    headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
    body:JSON.stringify(obj)
  }));
}

async function dbUpdate(table,filter,obj){
  return withSessionRetry(()=>jsonFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`,{
    method:'PATCH',
    headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
    body:JSON.stringify(obj)
  }));
}



async function dbRpc(name,params={}){
  try{
    return await withSessionRetry(()=>jsonFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{...authHeaders(session.access_token),'Prefer':'return=representation'},
      body:JSON.stringify(params)
    }));
  }catch(err){
    const raw=String(err?.message||err);
    const friendly=
      /only the sender/i.test(raw)?'Solo puedes eliminar mensajes que tú enviaste.':
      /care link inactive/i.test(raw)?'La relación médico-paciente ya no está activa.':
      /not a participant/i.test(raw)?'No tienes permiso para modificar esta conversación.':
      /prescription not found/i.test(raw)?'No se encontró la indicación. Actualiza la pantalla e inténtalo nuevamente.':
      /message not found/i.test(raw)?'No se encontró el mensaje. Es posible que ya haya sido eliminado.':
      /control not found/i.test(raw)?'No se encontró el control. Es posible que ya haya sido modificado.':
      /Control already scheduled for this date and time/i.test(raw)?'Ya existe un control agendado con este médico para esa fecha y hora.':
      /SLOT_UNAVAILABLE/i.test(raw)?raw:
      /not authorized/i.test(raw)?'Tu sesión no tiene autorización para realizar esta acción.':
      Number(err?.status)===401?'Tu sesión venció y no pudo renovarse automáticamente. Vuelve a iniciar sesión.':
      raw;
    const wrapped=new Error(friendly);
    wrapped.status=err?.status;
    throw wrapped;
  }
}

async function invokeFunction(name,body){
  return withSessionRetry(async()=>{
    const res=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{
      method:'POST',
      headers:{...authHeaders(session?.access_token),'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const text=await res.text();
    let data={};
    if(text){try{data=JSON.parse(text)}catch{data={error:text}}}
    if(!res.ok){
      const err=new Error(data?.error||`Error ${res.status}`);
      err.status=res.status;
      err.data=data;
      throw err;
    }
    return data;
  });
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
  document.getElementById('securityBtn')?.addEventListener('click',showSecurityCenter);
  document.getElementById('notificationBtn')?.addEventListener('click',showNotificationCenter);
  updateHeaderNotificationUI();
  document.querySelectorAll('[data-portal]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const portal=btn.dataset.portal;
      if(!portal||!hasRole(portal))return;
      activePortal=portal;
      localStorage.setItem('pesocare_active_portal',portal);
      doctorPatientDetail=null;
      supportSyncSeq++;
      render();
    });
  });
}

function suspendedView(){
  app.innerHTML=shell(`${header()}
    <section class="card">
      <h2 class="section-title">Cuenta suspendida</h2>
      <p class="muted">Tu cuenta está temporalmente suspendida. Contacta al soporte de BodyCare para revisar el acceso.</p>
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



const PATIENT_MEDICAL_NOTIFICATION_TYPES=[
  'NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED',
  'NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED',
  'NEW_CONTROL','CONTROL_CANCELLED','CONTROL_COMPLETED','CONTROL_NO_SHOW',
  'CONTROL_CONFIRMATION_REMINDER','CONTROL_REMINDER'
];

const CARE_PLAN_NOTIFICATION_TYPES=['CARE_PLAN_UPDATED','CARE_ACTION_UPDATED'];
const NUTRITION_NOTIFICATION_TYPES=['NUTRITION_PLAN_UPDATED'];

const DOCTOR_PATIENT_CONTEXT_NOTIFICATION_TYPES=[
  'NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED',
  'NEW_CONTROL','CONTROL_CANCELLED','CONTROL_CONFIRMED',
  'NEW_WEIGHT','WEIGHT_UPDATED','WEIGHT_REMOVED',
  'CLINICAL_ALERT','CARE_PLAN_UPDATED','CARE_ACTION_UPDATED'
];

function isActionableUnread(n){
  return !!n && !n.read_at && n.type!=='PUSH_TEST';
}

function unreadCount(){
  return notifications.filter(isActionableUnread).length;
}

function reconcileNotificationRecord(incoming){
  if(!incoming?.id)return incoming;
  const existing=notifications.find(n=>n.id===incoming.id);
  if(!existing)return incoming;

  // Read state is monotonic. A delayed packet can never turn READ back into UNREAD.
  return {
    ...existing,
    ...incoming,
    read_at:existing.read_at||incoming.read_at||null
  };
}

function reconcileNotificationSnapshot(latest){
  const local=new Map(notifications.map(n=>[n.id,n]));
  return (latest||[]).map(incoming=>{
    const existing=local.get(incoming.id);
    if(!existing)return incoming;
    return {
      ...existing,
      ...incoming,
      read_at:existing.read_at||incoming.read_at||null
    };
  });
}

async function reloadNotificationsAuthoritative(){
  if(!currentUser?.id||!session?.access_token)return;
  const latest=await dbGet(`user_notifications?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc&limit=50`)||[];
  notifications=reconcileNotificationSnapshot(latest);
  updateHeaderNotificationUI();
}


function base64UrlToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function isIOSDevice(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}

function isStandaloneApp(){
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone===true;
}

function pushSupportInfo(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)){
    return {supported:false,reason:'Este navegador no admite notificaciones push.'};
  }
  if(isIOSDevice()&&!isStandaloneApp()){
    return {
      supported:false,
      reason:'En iPhone/iPad, instala BodyCare en la pantalla de inicio y ábrelo desde ese ícono para activar notificaciones push.'
    };
  }
  return {supported:true,reason:''};
}

async function loadPushSettings(){
  if(!currentUser?.id||!session?.access_token)return;
  try{
    const [prefs]=await Promise.all([
      dbGet(`notification_preferences?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`)
    ]);
    if(prefs?.[0]){
      notificationPreferences={
        push_enabled:prefs[0].push_enabled!==false,
        messages:prefs[0].messages!==false,
        prescriptions:prefs[0].prescriptions!==false,
        care_updates:prefs[0].care_updates!==false,
        support:prefs[0].support!==false,
        appointment_reminders:prefs[0].appointment_reminders!==false,
        confirmation_reminders:prefs[0].confirmation_reminders!==false,
        record_reminders:prefs[0].record_reminders!==false
      };
    }
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.ready;
      pushBrowserSubscription=await reg.pushManager.getSubscription();
    }
  }catch(err){
    console.warn('Push settings unavailable',err);
  }finally{
    pushSettingsLoaded=true;
    renderPushSettings();
  }
}

function pushStatusLabel(){
  const support=pushSupportInfo();
  if(!support.supported)return 'No disponible';
  if(Notification.permission==='denied')return 'Bloqueadas';
  if(pushBrowserSubscription&&notificationPreferences.push_enabled)return 'Activas';
  return 'Desactivadas';
}

function pushSettingsMarkup(){
  const support=pushSupportInfo();
  const permission=('Notification' in window)?Notification.permission:'default';
  const active=!!pushBrowserSubscription && notificationPreferences.push_enabled;

  if(!support.supported){
    return `<div class="push-settings-content">
      <div class="push-settings-state unsupported">${esc(support.reason)}</div>
    </div>`;
  }

  if(permission==='denied'){
    return `<div class="push-settings-content">
      <div class="push-settings-state unsupported">Las notificaciones están bloqueadas en el navegador. Debes habilitarlas desde los ajustes del dispositivo/navegador.</div>
    </div>`;
  }

  return `<div class="push-settings-content">
    <div class="push-settings-state ${active?'enabled':'disabled'}">
      <span class="push-state-dot"></span>
      <span>${active?'Este dispositivo recibirá avisos aunque BodyCare no esté abierto.':'Activa los avisos para recibir mensajes e indicaciones fuera de la aplicación.'}</span>
    </div>

    <div class="push-actions">
      <button type="button" class="${active?'secondary':'primary'} small-btn" id="${active?'disablePushBtn':'enablePushBtn'}">
        ${active?'Desactivar en este dispositivo':'Activar en este dispositivo'}
      </button>
      ${active?'<button type="button" class="secondary small-btn" id="testPushBtn">Enviar prueba</button>':''}
    </div>

    <div class="push-preferences">
      <label><input type="checkbox" id="pushPrefMessages" ${notificationPreferences.messages?'checked':''}> <span>Mensajes</span></label>
      <label><input type="checkbox" id="pushPrefPrescriptions" ${notificationPreferences.prescriptions?'checked':''}> <span>Indicaciones médicas</span></label>
      <label><input type="checkbox" id="pushPrefCare" ${notificationPreferences.care_updates?'checked':''}> <span>Actualizaciones de seguimiento</span></label>
      <label><input type="checkbox" id="pushPrefSupport" ${notificationPreferences.support?'checked':''}> <span>Soporte y administración</span></label>
    </div>
  </div>`;
}

function renderPushSettings(){
  const body=document.getElementById('pushSettingsBody');
  const status=document.getElementById('pushSettingsStatus');
  if(status)status.textContent=pushSettingsLoaded?pushStatusLabel():'Cargando…';
  if(!body)return;
  body.innerHTML=pushSettingsLoaded?pushSettingsMarkup():'<div class="muted">Cargando configuración…</div>';
  bindPushSettingsEvents();
}

async function persistPushPreferences(pushEnabled=notificationPreferences.push_enabled){
  const messages=document.getElementById('pushPrefMessages')?.checked ?? notificationPreferences.messages;
  const prescriptions=document.getElementById('pushPrefPrescriptions')?.checked ?? notificationPreferences.prescriptions;
  const care=document.getElementById('pushPrefCare')?.checked ?? notificationPreferences.care_updates;
  const support=document.getElementById('pushPrefSupport')?.checked ?? notificationPreferences.support;

  const rows=await dbRpc('bodycare_save_notification_preferences',{
    p_push_enabled:pushEnabled,
    p_messages:messages,
    p_prescriptions:prescriptions,
    p_care_updates:care,
    p_support:support
  });

  const saved=Array.isArray(rows)?rows[0]:rows;
  if(saved){
    notificationPreferences={
      push_enabled:saved.push_enabled!==false,
      messages:saved.messages!==false,
      prescriptions:saved.prescriptions!==false,
      care_updates:saved.care_updates!==false,
      support:saved.support!==false,
      appointment_reminders:saved.appointment_reminders!==false,
      confirmation_reminders:saved.confirmation_reminders!==false,
      record_reminders:saved.record_reminders!==false
    };
  }
}

async function enablePushNotifications(){
  const support=pushSupportInfo();
  if(!support.supported){
    alert(support.reason);
    return;
  }

  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      renderPushSettings();
      return;
    }

    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();

    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const json=sub.toJSON();
    if(!json?.keys?.p256dh||!json?.keys?.auth)throw new Error('El navegador no entregó las claves de la suscripción.');

    await dbRpc('bodycare_register_push_subscription',{
      p_endpoint:sub.endpoint,
      p_p256dh:json.keys.p256dh,
      p_auth:json.keys.auth,
      p_user_agent:navigator.userAgent
    });

    pushBrowserSubscription=sub;
    notificationPreferences.push_enabled=true;
    await persistPushPreferences(true);
    pushSettingsLoaded=true;
    renderPushSettings();
    showToast('Notificaciones activadas','BodyCare puede avisarte aunque la aplicación no esté abierta.','PUSH_TEST');
  }catch(err){
    console.error('Enable push error',err);
    alert('No fue posible activar las notificaciones: '+err.message);
  }
}

async function disablePushNotifications(){
  if(!confirm('¿Desactivar las notificaciones push en este dispositivo?'))return;
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(sub){
      await dbRpc('bodycare_remove_push_subscription',{p_endpoint:sub.endpoint});
      await sub.unsubscribe();
    }
    pushBrowserSubscription=null;
    await persistPushPreferences(false);
    notificationPreferences.push_enabled=false;
    renderPushSettings();
  }catch(err){
    alert('No fue posible desactivar las notificaciones: '+err.message);
  }
}

async function sendPushTest(){
  const btn=document.getElementById('testPushBtn');
  if(btn)btn.disabled=true;
  try{
    await dbRpc('bodycare_send_push_test',{});
    showToast('Prueba enviada','Deberías recibir una notificación push en este dispositivo.','PUSH_TEST');
  }catch(err){
    alert('No fue posible enviar la prueba: '+err.message);
  }finally{
    if(btn)btn.disabled=false;
  }
}

function bindPushSettingsEvents(){
  document.getElementById('enablePushBtn')?.addEventListener('click',enablePushNotifications);
  document.getElementById('disablePushBtn')?.addEventListener('click',disablePushNotifications);
  document.getElementById('testPushBtn')?.addEventListener('click',sendPushTest);
  ['pushPrefMessages','pushPrefPrescriptions','pushPrefCare','pushPrefSupport'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change',async()=>{
      try{
        await persistPushPreferences(notificationPreferences.push_enabled);
        renderPushSettings();
      }catch(err){
        alert('No fue posible guardar la preferencia: '+err.message);
      }
    });
  });
}

async function handleLaunchNotification(){
  if(!launchNotificationId||!currentUser?.id)return;
  const id=launchNotificationId;
  launchNotificationId=null;

  try{
    const clean=new URL(location.href);
    clean.searchParams.delete('notification');
    clean.searchParams.delete('type');
    history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
  }catch{}

  let n=notifications.find(x=>x.id===id);
  if(!n){
    try{
      const rows=await dbGet(`user_notifications?select=*&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
      n=rows?.[0]||null;
      if(n&&!notifications.some(x=>x.id===n.id))notifications.unshift(n);
    }catch{}
  }

  if(n){
    setTimeout(()=>openNotificationById(id),120);
  }
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
    SUPPORT:'🛠️',
    PUSH_TEST:'🔔',
    NEW_CONTROL:'🗓️',
    CONTROL_CANCELLED:'🚫',
    CONTROL_CONFIRMED:'✅',
    CONTROL_COMPLETED:'🩺',
    CONTROL_NO_SHOW:'⚠️',
    CONTROL_CONFIRMATION_REMINDER:'⏰',
    CONTROL_REMINDER:'⏱️',
    RECORD_REMINDER:'⚖️',
    CARE_PLAN_UPDATED:'🎯',
    CARE_ACTION_UPDATED:'✅',
    NUTRITION_PLAN_UPDATED:'🥗',
    CLINICAL_ALERT:'🔴',
    WEIGHT_UPDATED:'✏️',
    WEIGHT_REMOVED:'🗑️'
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
  updatePatientSubtabNotificationUI();
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
    const latest=await dbGet(`user_notifications?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc&limit=50`)||[];
    notifications=reconcileNotificationSnapshot(latest);
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
    await dbRpc('bodycare_mark_notifications_read',{p_notification_ids:[id]});
    // Keep optimistic read state. The periodic sync will confirm it from Supabase.
  }catch(err){
    console.warn('Notification read persistence failed',err);
    try{await reloadNotificationsAuthoritative()}catch{}
  }
}

async function markAllNotificationsRead(){
  const unread=notifications.filter(n=>!n.read_at);

  if(!unread.length){
    updateHeaderNotificationUI();
    renderNotificationList();
    return;
  }

  const readAt=new Date().toISOString();
  unread.forEach(n=>n.read_at=readAt);
  updateHeaderNotificationUI();
  renderNotificationList();

  try{
    await dbRpc('bodycare_mark_notifications_read',{p_notification_ids:null});
    await reloadNotificationsAuthoritative();
  }catch(err){
    console.warn('Mark all notifications read failed',err);
    try{await reloadNotificationsAuthoritative()}catch{}
  }

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
    SUPPORT:'Abrir soporte',
    PUSH_TEST:'Abrir BodyCare',
    NEW_CONTROL:'Ver control',
    CONTROL_CANCELLED:'Ver controles',
    CONTROL_CONFIRMED:'Ver control confirmado',
    CONTROL_COMPLETED:'Ver resumen del control',
    CONTROL_NO_SHOW:'Ver control',
    CONTROL_CONFIRMATION_REMINDER:'Confirmar control',
    CONTROL_REMINDER:'Ver control',
    RECORD_REMINDER:'Registrar seguimiento',
    CARE_PLAN_UPDATED:'Ver mi plan',
    CARE_ACTION_UPDATED:'Ver mi plan',
    NUTRITION_PLAN_UPDATED:'Ver nutrición',
    CLINICAL_ALERT:'Revisar paciente',
    WEIGHT_UPDATED:'Ver seguimiento',
    WEIGHT_REMOVED:'Ver seguimiento'
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
      <section class="push-settings-card">
        <div class="push-settings-head">
          <div><strong>Notificaciones push</strong><small>Avisos fuera de BodyCare</small></div>
          <span class="push-status-chip" id="pushSettingsStatus">${pushSettingsLoaded?pushStatusLabel():'Cargando…'}</span>
        </div>
        <div id="pushSettingsBody">${pushSettingsLoaded?pushSettingsMarkup():'<div class="muted">Cargando configuración…</div>'}</div>
      </section>
      <div id="notificationList" class="notification-list">
        ${list.length?list.map(notificationItemMarkup).join(''):'<div class="empty-state notification-empty">No tienes notificaciones.</div>'}
      </div>
    </aside>
  </div>`;
}

function notificationItemMarkup(n){
  const unread=isActionableUnread(n);
  return `<button type="button" class="notification-item ${unread?'unread':''}" data-notification-id="${n.id}">
    <span class="notification-item-icon">${notificationIcon(n.type)}</span>
    <span class="notification-item-content">
      <strong>${esc(n.title)}</strong>
      <span>${esc(n.body||'')}</span>
      <small>${formatDateTime(n.created_at)} · ${notificationDestinationLabel(n)}</small>
    </span>
    ${unread?'<i class="unread-dot"></i>':''}
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
  updateHeaderNotificationUI();
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
  pushSettingsLoaded=false;
  renderPushSettings();
  loadPushSettings();
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
      activePatientTab='DOCTOR';
      localStorage.setItem('pesocare_active_portal','PATIENT');
      localStorage.setItem('pesocare_patient_tab','DOCTOR');
      if(n.related_user_id)localStorage.setItem('pesocare_selected_doctor',n.related_user_id);
      await loadData();
      render();
      setTimeout(()=>document.getElementById('patientMessageText')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
      return;
    }
  }

  if(['NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'].includes(n.type) && hasRole('PATIENT')){
    activePortal='PATIENT';
    activePatientTab='DOCTOR';
    localStorage.setItem('pesocare_active_portal','PATIENT');
    localStorage.setItem('pesocare_patient_tab','DOCTOR');
    if(n.related_user_id)localStorage.setItem('pesocare_selected_doctor',n.related_user_id);
    await loadData();render();
    setTimeout(()=>document.getElementById('patientPrescriptionList')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
    return;
  }

  if(['NEW_CONTROL','CONTROL_CANCELLED','CONTROL_CONFIRMED','CONTROL_COMPLETED','CONTROL_NO_SHOW','CONTROL_CONFIRMATION_REMINDER','CONTROL_REMINDER'].includes(n.type)){
    if(hasRole('DOCTOR') && n.related_user_id && n.related_user_id!==currentUser.id){
      activePortal='DOCTOR';
      localStorage.setItem('pesocare_active_portal','DOCTOR');
      await openDoctorPatient(n.related_user_id);
      setTimeout(()=>document.getElementById('doctorControlsSection')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
      return;
    }
    if(hasRole('PATIENT')){
      activePortal='PATIENT';
      activePatientTab='DOCTOR';
      localStorage.setItem('pesocare_active_portal','PATIENT');
      localStorage.setItem('pesocare_patient_tab','DOCTOR');
      if(n.related_user_id)localStorage.setItem('bodycare_selected_control_doctor',n.related_user_id);
      await loadData();
      render();
      setTimeout(()=>document.getElementById('patientControlsSection')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
      return;
    }
  }

  if(NUTRITION_NOTIFICATION_TYPES.includes(n.type)&&hasRole('PATIENT')){
    activePortal='PATIENT';activePatientTab='NUTRITION';
    localStorage.setItem('pesocare_active_portal','PATIENT');
    localStorage.setItem('pesocare_patient_tab','NUTRITION');
    if(n.related_user_id)localStorage.setItem('bodycare_selected_nutrition_doctor',n.related_user_id);
    await loadData();render();
    return;
  }

  if(CARE_PLAN_NOTIFICATION_TYPES.includes(n.type)){
    if(hasRole('DOCTOR')&&n.related_user_id&&n.related_user_id!==currentUser.id){
      activePortal='DOCTOR';localStorage.setItem('pesocare_active_portal','DOCTOR');
      await openDoctorPatient(n.related_user_id);
      setTimeout(()=>document.getElementById('doctorCarePlanSection')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
      return;
    }
    if(hasRole('PATIENT')){
      activePortal='PATIENT';activePatientTab='PLAN';
      localStorage.setItem('pesocare_active_portal','PATIENT');localStorage.setItem('pesocare_patient_tab','PLAN');
      if(n.related_user_id)localStorage.setItem('bodycare_selected_plan_doctor',n.related_user_id);
      await loadData();render();
      setTimeout(()=>document.getElementById('patientCarePlanContent')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
      return;
    }
  }

  if(n.type==='RECORD_REMINDER'&&hasRole('PATIENT')){
    activePortal='PATIENT';activePatientTab='TRACKING';
    localStorage.setItem('pesocare_active_portal','PATIENT');localStorage.setItem('pesocare_patient_tab','TRACKING');
    await loadData();render();
    setTimeout(()=>document.getElementById('weightEntryCard')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    return;
  }

  if(n.type==='CLINICAL_ALERT'&&hasRole('DOCTOR')){
    activePortal='DOCTOR';
    localStorage.setItem('pesocare_active_portal','DOCTOR');
    if(n.related_user_id){
      await openDoctorPatient(n.related_user_id);
      setTimeout(()=>document.getElementById('doctorClinicalPrioritySection')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    }else{
      doctorPatientDetail=null;
      await loadData();render();
    }
    return;
  }

  if((['NEW_WEIGHT','WEIGHT_UPDATED','WEIGHT_REMOVED','NEW_PATIENT'].includes(n.type)) && hasRole('DOCTOR')){
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

  if(n.type==='PUSH_TEST'){
    await loadData();render();
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
    realtimeFallbackTimer=setInterval(syncNotificationsFallback,8000);
  }
}

async function syncNotificationsFallback(){
  if(!currentUser?.id||!session?.access_token)return;
  try{
    const latest=await dbGet(`user_notifications?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc&limit=50`)||[];
    const known=new Set(notifications.map(n=>n.id));
    const fresh=latest.filter(n=>!known.has(n.id)).reverse();

    notifications=reconcileNotificationSnapshot(latest);
    updateHeaderNotificationUI();

    for(const n of fresh)await handleRealtimeNotification(n,true);
  }catch(err){
    console.warn('Notification fallback sync failed',err);
  }
}

async function handleRealtimeNotification(n,fromFallback=false){
  if(!n?.id)return;

  const index=notifications.findIndex(x=>x.id===n.id);
  const exists=index>=0;
  const merged=reconcileNotificationRecord(n);

  if(exists)notifications[index]=merged;
  else notifications.unshift(merged);

  updateHeaderNotificationUI();
  if(!fromFallback&&!exists)showToast(merged.title,merged.body,merged.type);

  try{
    if(['NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'].includes(n.type)){
      if(hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
        await syncPatientMessages();
      }
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id===n.related_user_id){
        await syncDoctorMessages(n.related_user_id);
      }
    }

    if(['NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'].includes(n.type)){
      if(hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
        await syncPatientPrescriptions();
      }
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id){
        await syncDoctorPrescriptions(doctorPatientDetail.profile.user_id);
      }
    }

    if(['NEW_CONTROL','CONTROL_CANCELLED','CONTROL_CONFIRMED','CONTROL_COMPLETED','CONTROL_NO_SHOW','CONTROL_CONFIRMATION_REMINDER','CONTROL_REMINDER'].includes(n.type)){
      if(hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
        await syncPatientControls();
      }
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id===n.related_user_id){
        await syncDoctorControls(n.related_user_id);
      }else if(hasRole('DOCTOR')&&activePortal==='DOCTOR'&&!doctorPatientDetail){
        await Promise.allSettled([syncDoctorAgenda(true),syncDoctorOutcomes(true)]);
      }
    }

    if(n.type==='RECORD_REMINDER'&&hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
      await syncPatientReminderPlan(!patientReminderDirty&&!patientReminderSaving);
    }

    if(NUTRITION_NOTIFICATION_TYPES.includes(n.type)&&hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='NUTRITION'){
      await syncPatientNutrition(true);
    }

    if(CARE_PLAN_NOTIFICATION_TYPES.includes(n.type)){
      if(hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='PLAN')await syncPatientCarePlan(true);
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id===n.related_user_id){
        await syncDoctorCarePlan(n.related_user_id,true);
        await syncDoctorTimeline(true,true);
      }
    }

    if(n.type==='CLINICAL_ALERT'&&hasRole('DOCTOR')){
      await syncDoctorPriorities(false);
      if(doctorPatientDetail?.profile?.user_id===n.related_user_id){
        renderDoctorAlertPanel();
      }else if(activePortal==='DOCTOR'&&!doctorPatientDetail&&!userIsTyping()){
        renderDoctorPriorityDashboard();
      }
    }

    if(['NEW_WEIGHT','WEIGHT_UPDATED','WEIGHT_REMOVED'].includes(n.type)&&hasRole('DOCTOR')){
      if(doctorPatientDetail?.profile?.user_id===n.related_user_id&&!userIsTyping()){
        await openDoctorPatient(n.related_user_id);
      }else if(activePortal==='DOCTOR'&&!doctorPatientDetail&&!userIsTyping()){
        await loadData();render();
      }
    }

    if(n.type==='NEW_PATIENT'&&hasRole('DOCTOR')&&activePortal==='DOCTOR'&&!userIsTyping()){
      await loadData();render();
      if(!doctorPatientDetail)syncDoctorHomeData();
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
  const messages=(doctorPatientDetail.messages||[]).filter(m=>!m.deleted_at);
  el.innerHTML=messages.length?messages.map(m=>`
    <div class="message-bubble ${m.sender_user_id===currentUser.id?'mine':'theirs'} ${m.pending?'pending-message':''}">
      <div>${esc(m.message)}</div>
      <div class="message-meta"><span>${m.pending?'Enviando…':formatDateTime(m.created_at)}</span>${m.sender_user_id===currentUser.id&&!m.pending?`<button type="button" class="message-delete" data-delete-message="${m.id}" data-message-context="doctor">Eliminar</button>`:''}</div>
    </div>`).join(''):'<div class="empty-state">Aún no hay mensajes.</div>';
  el.querySelectorAll('[data-delete-message]').forEach(btn=>btn.addEventListener('click',()=>deleteSentMessage(btn.dataset.deleteMessage,btn.dataset.messageContext)));
  el.scrollTop=el.scrollHeight;
}

function brandBlock(subtitle='Seguimiento personal'){
  return `<div class="brandrow brand-hero">
    <img src="${BRAND_LOGO_URL}" alt="Logo BodyCare" class="brand-image" onerror="this.style.display='none'">
    <div>
      <div class="brand">BodyCare</div>
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


function passkeyClientSupported(){
  return !!(
    window.isSecureContext &&
    window.PublicKeyCredential &&
    navigator.credentials &&
    typeof navigator.credentials.create==='function' &&
    typeof navigator.credentials.get==='function'
  );
}
async function platformAuthenticatorAvailable(){
  if(!passkeyClientSupported())return false;
  try{
    if(typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==='function'){
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  }catch{}
  return true;
}
function base64UrlEncode(buffer){
  const bytes=new Uint8Array(buffer);
  let binary='';
  bytes.forEach(b=>binary+=String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function passkeyCreationOptions(options){
  const copy=structuredClone(options||{});
  copy.challenge=base64UrlToUint8Array(copy.challenge);
  if(copy.user?.id)copy.user.id=base64UrlToUint8Array(copy.user.id);
  if(Array.isArray(copy.excludeCredentials)){
    copy.excludeCredentials=copy.excludeCredentials.map(c=>({...c,id:base64UrlToUint8Array(c.id)}));
  }
  copy.authenticatorSelection={
    ...(copy.authenticatorSelection||{}),
    authenticatorAttachment:'platform',
    residentKey:'required',
    requireResidentKey:true,
    userVerification:'required'
  };
  return copy;
}
function passkeyRequestOptions(options){
  const copy=structuredClone(options||{});
  copy.challenge=base64UrlToUint8Array(copy.challenge);
  if(Array.isArray(copy.allowCredentials)){
    copy.allowCredentials=copy.allowCredentials.map(c=>({...c,id:base64UrlToUint8Array(c.id)}));
  }
  copy.userVerification='required';
  return copy;
}
function serializePasskeyCredential(credential){
  if(!credential)return null;
  const response=credential.response;
  const out={
    id:credential.id,
    rawId:base64UrlEncode(credential.rawId),
    type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment||undefined,
    clientExtensionResults:credential.getClientExtensionResults?.()||{},
    response:{
      clientDataJSON:base64UrlEncode(response.clientDataJSON)
    }
  };
  if(response.attestationObject){
    out.response.attestationObject=base64UrlEncode(response.attestationObject);
    if(typeof response.getTransports==='function')out.response.transports=response.getTransports();
  }
  if(response.authenticatorData)out.response.authenticatorData=base64UrlEncode(response.authenticatorData);
  if(response.signature)out.response.signature=base64UrlEncode(response.signature);
  if('userHandle' in response)out.response.userHandle=response.userHandle?base64UrlEncode(response.userHandle):null;
  return out;
}
function passkeyFriendlyError(err){
  const raw=String(err?.message||err||'');
  const code=String(err?.data?.code||err?.data?.error_code||'');
  if(err?.name==='NotAllowedError')return 'La verificación fue cancelada o el dispositivo no pudo completar la biometría.';
  if(err?.name==='SecurityError')return 'El dominio de BodyCare no coincide con la configuración biométrica. Revisa el Relying Party ID en Supabase.';
  if(/passkey_disabled/i.test(raw)||code==='passkey_disabled')return 'El acceso biométrico todavía no está habilitado en Supabase Auth.';
  if(/credential.*exists/i.test(raw)||code==='webauthn_credential_exists')return 'Este autenticador ya está registrado para tu cuenta.';
  if(/credential.*not found/i.test(raw)||code==='webauthn_credential_not_found')return 'No se encontró una passkey válida para esta cuenta en el dispositivo.';
  if(/challenge.*expired/i.test(raw)||code==='webauthn_challenge_expired')return 'La solicitud biométrica expiró. Inténtalo nuevamente.';
  if(/verification failed/i.test(raw)||code==='webauthn_verification_failed')return 'No fue posible validar la credencial biométrica.';
  return raw||'No fue posible completar el acceso biométrico.';
}
async function passkeyAuthFetch(path,{method='POST',token=null,body=null}={}){
  const opts={method,headers:authHeaders(token)};
  if(body!==null)opts.body=JSON.stringify(body);
  return jsonFetch(`${SUPABASE_URL}/auth/v1/passkeys${path}`,opts);
}
async function listPasskeys(){
  if(!session?.access_token)return [];
  return (await passkeyAuthFetch('/',{method:'GET',token:session.access_token}))||[];
}
async function registerBodyCarePasskey(){
  if(!session?.access_token||!currentUser?.id)throw new Error('Debes iniciar sesión antes de activar biometría.');
  if(!passkeyClientSupported())throw new Error('Este navegador o dispositivo no admite acceso biométrico WebAuthn.');

  const available=await platformAuthenticatorAvailable();
  if(!available)throw new Error('No se encontró un autenticador biométrico o de dispositivo disponible.');

  const start=await passkeyAuthFetch('/registration/options',{token:session.access_token,body:{}});
  const credential=await navigator.credentials.create({publicKey:passkeyCreationOptions(start.options)});
  if(!credential)throw new Error('No se creó la credencial biométrica.');

  const created=await passkeyAuthFetch('/registration/verify',{
    token:session.access_token,
    body:{challenge_id:start.challenge_id,credential:serializePasskeyCredential(credential)}
  });

  localStorage.setItem(PASSKEY_LOCAL_KEY,'true');
  sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'true');
  localStorage.setItem(PASSKEY_OFFER_PREFIX+currentUser.id,'done');
  return created;
}
async function signInWithBodyCarePasskey(){
  if(!passkeyClientSupported())throw new Error('Este navegador o dispositivo no admite acceso biométrico.');

  const available=await platformAuthenticatorAvailable();
  if(!available)throw new Error('No se encontró un autenticador biométrico o de dispositivo disponible.');

  const start=await passkeyAuthFetch('/authentication/options',{body:{}});
  const credential=await navigator.credentials.get({publicKey:passkeyRequestOptions(start.options)});
  if(!credential)throw new Error('No se recibió una credencial biométrica.');

  const data=await passkeyAuthFetch('/authentication/verify',{
    body:{challenge_id:start.challenge_id,credential:serializePasskeyCredential(credential)}
  });

  if(!data?.access_token)throw new Error('Supabase no devolvió una sesión después de verificar la biometría.');

  saveRememberPreference(true);
  saveSession({
    access_token:data.access_token,
    refresh_token:data.refresh_token,
    expires_at:Date.now()+Number(data.expires_in||3600)*1000
  },true);
  sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'true');
  localStorage.setItem(PASSKEY_LOCAL_KEY,'true');

  if(!(await ensureSession()))throw new Error('No fue posible iniciar la sesión biométrica.');
  await loadData();
  render();
}
function passkeyLoginButtonMarkup(){
  if(!passkeyClientSupported())return '';
  return `<div class="passkey-login-block">
    <button type="button" class="passkey-primary-btn" id="passkeyLoginBtn">
      <span class="passkey-symbol">◎</span>
      <span><strong>Ingresar con biometría</strong><small>Face ID · huella · Windows Hello</small></span>
    </button>
    <div class="passkey-login-divider"><span>o usa tu contraseña</span></div>
  </div>`;
}
async function handlePasskeyLogin(){
  const btn=document.getElementById('passkeyLoginBtn');
  const msg=document.getElementById('authMsg')||document.getElementById('biometricGateMsg');
  if(btn){btn.disabled=true;btn.classList.add('working')}
  if(msg){msg.className='muted';msg.textContent='Esperando validación del dispositivo…'}
  try{
    await signInWithBodyCarePasskey();
  }catch(err){
    if(msg){msg.className='error';msg.textContent=passkeyFriendlyError(err)}
  }finally{
    if(btn){btn.disabled=false;btn.classList.remove('working')}
  }
}
function biometricGateView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card biometric-gate-card">
      ${brandBlock('Acceso seguro')}
      <div class="biometric-gate-icon">◎</div>
      <h2 class="section-title">Desbloquear BodyCare</h2>
      <p class="muted">Usa la biometría o seguridad de este dispositivo para acceder. No necesitas escribir tu correo ni contraseña.</p>
      ${message?`<div class="notice success">${esc(message)}</div>`:''}
      <button type="button" class="passkey-primary-btn biometric-unlock-btn" id="passkeyLoginBtn">
        <span class="passkey-symbol">◎</span>
        <span><strong>Desbloquear con biometría</strong><small>Face ID · huella · Windows Hello</small></span>
      </button>
      <button type="button" class="linkbtn biometric-password-fallback" id="usePasswordBtn">Usar correo y contraseña</button>
      <p id="biometricGateMsg" class="error"></p>
    </section>`);
  document.getElementById('passkeyLoginBtn')?.addEventListener('click',handlePasskeyLogin);
  document.getElementById('usePasswordBtn')?.addEventListener('click',()=>{
    sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'password');
    loginView();
  });
}
async function maybeOfferPasskeyEnrollment(){
  if(!currentUser?.id||!session?.access_token||!passkeyClientSupported())return;
  if(localStorage.getItem(PASSKEY_LOCAL_KEY)==='true')return;
  if(localStorage.getItem(PASSKEY_OFFER_PREFIX+currentUser.id)==='done')return;

  const available=await platformAuthenticatorAvailable();
  if(!available)return;

  document.getElementById('passkeyEnrollmentOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend',`
    <div class="passkey-overlay" id="passkeyEnrollmentOverlay">
      <section class="passkey-enroll-modal" role="dialog" aria-modal="true">
        <div class="biometric-gate-icon compact">◎</div>
        <h3>Activar acceso biométrico</h3>
        <p>Desde el próximo acceso podrás entrar a BodyCare con Face ID, huella o Windows Hello sin escribir usuario y contraseña.</p>
        <div class="passkey-enroll-actions">
          <button type="button" class="primary" id="enrollPasskeyNow">Activar ahora</button>
          <button type="button" class="secondary" id="enrollPasskeyLater">Más tarde</button>
        </div>
        <p id="passkeyEnrollMsg" class="error"></p>
      </section>
    </div>
  `);
  document.getElementById('enrollPasskeyNow')?.addEventListener('click',async()=>{
    const btn=document.getElementById('enrollPasskeyNow');
    const msg=document.getElementById('passkeyEnrollMsg');
    if(btn)btn.disabled=true;
    if(msg){msg.className='muted';msg.textContent='Preparando el acceso seguro…'}
    try{
      await registerBodyCarePasskey();
      document.getElementById('passkeyEnrollmentOverlay')?.remove();
      showToast('Biometría activada','Este dispositivo ya puede ingresar sin contraseña.','PUSH_TEST');
    }catch(err){
      if(msg){msg.className='error';msg.textContent=passkeyFriendlyError(err)}
      if(btn)btn.disabled=false;
    }
  });
  document.getElementById('enrollPasskeyLater')?.addEventListener('click',()=>{
    localStorage.setItem(PASSKEY_OFFER_PREFIX+currentUser.id,'done');
    document.getElementById('passkeyEnrollmentOverlay')?.remove();
  });
}
function passkeyDate(value){
  if(!value)return 'Nunca';
  try{return new Date(value).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'})}catch{return value}
}
async function securityCenterMarkup(){
  const supported=passkeyClientSupported();
  let keys=[];
  let loadError='';
  if(supported){
    try{keys=await listPasskeys()}catch(err){loadError=passkeyFriendlyError(err)}
  }
  return `<div class="security-center-content">
    <div class="security-summary ${supported?'supported':'unsupported'}">
      <div class="security-lock-icon">🔐</div>
      <div><strong>Acceso biométrico / Passkey</strong><span>${supported?'Este dispositivo admite acceso seguro sin contraseña.':'Este navegador no admite WebAuthn.'}</span></div>
    </div>
    ${loadError?`<div class="notice warning">${esc(loadError)}</div>`:''}
    ${supported?`<button type="button" class="primary" id="securityAddPasskey">Agregar este dispositivo</button>`:''}
    <div class="security-key-list">
      ${keys.length?keys.map(k=>`<div class="security-key-row">
        <div><strong>${esc(k.friendly_name||'Passkey')}</strong><span>Creada ${passkeyDate(k.created_at)}${k.last_used_at?` · último uso ${passkeyDate(k.last_used_at)}`:''}</span></div>
        <div class="security-key-actions">
          <button type="button" class="secondary small-btn" data-rename-passkey="${k.id}" data-passkey-name="${esc(k.friendly_name||'Passkey')}">Renombrar</button>
          <button type="button" class="danger-btn small-btn" data-delete-passkey="${k.id}">Eliminar</button>
        </div>
      </div>`).join(''):'<div class="empty-state">No hay passkeys registradas en esta cuenta.</div>'}
    </div>
    <div class="security-help">La contraseña se mantiene como método de recuperación. BodyCare no recibe ni almacena tu huella, rostro o PIN.</div>
  </div>`;
}
async function renderSecurityCenter(){
  const body=document.getElementById('securityCenterBody');
  if(!body)return;
  body.innerHTML='<div class="muted">Cargando seguridad…</div>';
  body.innerHTML=await securityCenterMarkup();
  bindSecurityCenterActions();
}
async function renamePasskey(id,currentName){
  const name=prompt('Nombre para este dispositivo o passkey:',currentName||'Mi dispositivo');
  if(!name||!name.trim())return;
  try{
    await passkeyAuthFetch('/'+encodeURIComponent(id),{
      method:'PATCH',
      token:session.access_token,
      body:{friendly_name:name.trim().slice(0,120)}
    });
    await renderSecurityCenter();
  }catch(err){alert(passkeyFriendlyError(err))}
}
async function deletePasskey(id){
  if(!confirm('¿Eliminar este acceso biométrico? El dispositivo dejará de poder usar esa passkey.'))return;
  try{
    await passkeyAuthFetch('/'+encodeURIComponent(id),{method:'DELETE',token:session.access_token});
    const remaining=await listPasskeys();
    if(!remaining.length)localStorage.removeItem(PASSKEY_LOCAL_KEY);
    await renderSecurityCenter();
  }catch(err){alert(passkeyFriendlyError(err))}
}
function bindSecurityCenterActions(){
  document.getElementById('securityAddPasskey')?.addEventListener('click',async()=>{
    const btn=document.getElementById('securityAddPasskey');if(btn)btn.disabled=true;
    try{
      await registerBodyCarePasskey();
      await renderSecurityCenter();
      showToast('Acceso agregado','La passkey quedó registrada correctamente.','PUSH_TEST');
    }catch(err){alert(passkeyFriendlyError(err));if(btn)btn.disabled=false}
  });
  document.querySelectorAll('[data-rename-passkey]').forEach(btn=>btn.addEventListener('click',()=>renamePasskey(btn.dataset.renamePasskey,btn.dataset.passkeyName)));
  document.querySelectorAll('[data-delete-passkey]').forEach(btn=>btn.addEventListener('click',()=>deletePasskey(btn.dataset.deletePasskey)));
}
async function showSecurityCenter(){
  document.getElementById('securityCenterOverlay')?.remove();
  document.body.insertAdjacentHTML('beforeend',`
    <div class="security-overlay" id="securityCenterOverlay">
      <section class="security-modal" role="dialog" aria-modal="true">
        <div class="security-modal-head"><div><h3>Seguridad y acceso</h3><span>Administra la biometría de tu cuenta</span></div><button type="button" class="modal-close" id="closeSecurityCenter">×</button></div>
        <div id="securityCenterBody"><div class="muted">Cargando seguridad…</div></div>
      </section>
    </div>
  `);
  document.getElementById('closeSecurityCenter')?.addEventListener('click',()=>document.getElementById('securityCenterOverlay')?.remove());
  document.getElementById('securityCenterOverlay')?.addEventListener('click',e=>{if(e.target?.id==='securityCenterOverlay')e.currentTarget.remove()});
  await renderSecurityCenter();
}

function loginView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card">
      ${brandBlock('Seguimiento personal · Salud y progreso')}
      <p class="muted">Registra tu evolución, revisa tu historial, mantente conectado con tu médico y sigue tus indicaciones en un solo lugar.</p>
      ${message?`<div class="notice success">${esc(message)}</div>`:''}
      ${passkeyLoginButtonMarkup()}
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
  document.getElementById('passkeyLoginBtn')?.addEventListener('click',handlePasskeyLogin);
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
        sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'true');
        await loadData();
        render();
        setTimeout(()=>maybeOfferPasskeyEnrollment(),350);
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
        sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'true');
        await loadData();
        render();
        setTimeout(()=>maybeOfferPasskeyEnrollment(),350);
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

  try{
    const prefRows=await dbGet(`notification_preferences?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
    if(prefRows?.[0]){
      const p=prefRows[0];
      notificationPreferences={
        push_enabled:p.push_enabled!==false,
        messages:p.messages!==false,
        prescriptions:p.prescriptions!==false,
        care_updates:p.care_updates!==false,
        support:p.support!==false,
        appointment_reminders:p.appointment_reminders!==false,
        confirmation_reminders:p.confirmation_reminders!==false,
        record_reminders:p.record_reminders!==false
      };
    }
  }catch(err){console.warn('Notification preferences unavailable',err)}

  const storedPortal=localStorage.getItem('pesocare_active_portal');
  if(storedPortal&&roles.includes(storedPortal))activePortal=storedPortal;
  else if(roles.includes('PATIENT'))activePortal='PATIENT';
  else if(roles.includes('DOCTOR'))activePortal='DOCTOR';
  else if(roles.includes('ADMIN'))activePortal='ADMIN';

  profile=null;records=[];careLinks=[];linkedDoctorProfiles=[];
  patientPrescriptions=[];patientMessages=[];supportTickets=[];
  patientCarePlan={goals:[],actions:[]};patientCarePlanDoctorId=null;
  patientNutritionPlan={plan:null,items:[]};patientNutritionCatalog=[];patientNutritionDay=null;patientNutritionDoctorId=null;
  doctorProfile=null;doctorPatients=[];doctorPriorities=[];doctorAlertSettings=null;doctorAgenda=[];doctorOutcomes=[];

  if(account?.status!=='ACTIVE')return;

  if(hasRole('PATIENT')){
    const p=await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
    profile=p?.[0]||null;
    if(profile){
      records=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=measured_on.asc,created_at.asc`)||[];
    }

    careLinks=await dbGet(`doctor_patient_links?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.ACTIVE&order=created_at.asc`)||[];
    if(careLinks.length){
      const ids=careLinks.map(l=>l.doctor_user_id).join(',');
      linkedDoctorProfiles=await dbGet(`doctor_profiles?select=*&user_id=in.(${ids})`)||[];
      patientMessages=(await dbGet(`care_messages?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&deleted_at=is.null&order=created_at.asc`)||[]).filter(m=>!m.deleted_at);
      patientPrescriptions=(await dbGet(`prescription_drafts?select=*&patient_user_id=eq.${encodeURIComponent(currentUser.id)}&status=eq.SHARED&deleted_at=is.null&order=created_at.desc`)||[]).filter(p=>!p.deleted_at);
    }
    supportTickets=await dbGet(`support_tickets?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc`)||[];
    try{
      const pref=await dbRpc('bodycare_get_reminder_preferences',{});
      const savedPref=Array.isArray(pref)?pref[0]||null:pref;
      applyReminderPreferencesFromSource(savedPref);

      const plan=await dbRpc('bodycare_get_patient_reminder_plan',{});
      patientReminderPlan=Array.isArray(plan)?plan[0]||null:plan;
    }catch(err){
      console.warn('Patient reminder settings unavailable',err);
      patientReminderPlan=null;
    }
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
    try{
      doctorPriorities=await dbRpc('bodycare_get_doctor_priorities',{})||[];
      const settings=await dbRpc('bodycare_get_alert_settings',{});
      doctorAlertSettings=Array.isArray(settings)?settings[0]||null:settings;
    }catch(err){
      console.warn('Doctor priority data unavailable',err);
      doctorPriorities=[];
      doctorAlertSettings=null;
    }

    try{
      doctorAgenda=await dbRpc('bodycare_get_doctor_agenda',{
        p_start_date:today(),
        p_days:7
      })||[];
    }catch(err){
      console.warn('Doctor agenda unavailable',err);
      doctorAgenda=[];
    }

    try{
      doctorOutcomes=await dbRpc('bodycare_get_doctor_outcomes',{
        p_control_window_days:90
      })||[];
    }catch(err){
      console.warn('Doctor outcomes unavailable',err);
      doctorOutcomes=[];
    }
  }
}

function render(){
  let result;
  if(account?.status!=='ACTIVE')result=suspendedView();
  else if(activePortal==='ADMIN'&&hasRole('ADMIN'))result=adminView();
  else if(activePortal==='DOCTOR'&&hasRole('DOCTOR')){
    result=doctorPatientDetail?doctorPatientDetailView():doctorView();
  }else if(!profile){
    result=initialProfileView();
  }else if(activePatientTab==='PLAN'){
    result=patientPlanView();
  }else if(activePatientTab==='NUTRITION'){
    result=patientNutritionView();
  }else if(activePatientTab==='DOCTOR'){
    result=patientDoctorView();
  }else if(activePatientTab==='SUPPORT'){
    result=patientSupportView();
  }else{
    result=dashboardView();
  }
  setTimeout(startRealtime,0);
  setTimeout(startContextSync,0);
  setTimeout(()=>bindDateCLInputs(),0);
  return result;
}

function header(){
  const display=doctorProfile?.display_name||profile?.full_name||account?.display_name||currentUser?.email||'';
  const count=unreadCount();
  return `<div class="top">
    <div class="brandrow">
      <img src="${BRAND_LOGO_URL}" alt="Logo BodyCare" class="brand-image brand-image-small" onerror="this.style.display='none'">
      <div><div class="brand">BodyCare</div><div class="muted">${esc(display)}</div></div>
    </div>
    <div class="top-actions">
      <span class="realtime-indicator" title="Estado de actualización">
        <i id="realtimeDot" class="live-dot ${realtimeStatus==='live'?'online':realtimeStatus==='connecting'?'connecting':'offline'}"></i>
        <span id="realtimeText">${realtimeStatus==='live'?'En vivo':realtimeStatus==='connecting'?'Conectando…':'Sin conexión'}</span>
      </span>
      <button class="security-header-button" id="securityBtn" type="button" aria-label="Seguridad y acceso" title="Seguridad y acceso">
        <span aria-hidden="true">🔐</span>
      </button>
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
          <div><label>Fecha de nacimiento</label><input id="birth" type="text" inputmode="numeric" autocomplete="bday" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl></div>
          <div><label>Fecha de inicio</label><input id="start" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl value="${formatDateCL(today())}" required></div>
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
  bindDateCLInputs();
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

  let birthDate,startDate;
  try{
    birthDate=requireDateCL('birth','Fecha de nacimiento',true);
    startDate=requireDateCL('start','Fecha de inicio');
  }catch(err){
    msg.textContent=err.message;
    return;
  }

  const p={
    user_id:currentUser.id,
    full_name:document.getElementById('name').value.trim(),
    birth_date:birthDate,
    start_date:startDate,
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


function medicalUnreadCount(){
  return notifications.filter(n=>isActionableUnread(n)&&PATIENT_MEDICAL_NOTIFICATION_TYPES.includes(n.type)).length;
}
function planUnreadCount(){
  return notifications.filter(n=>isActionableUnread(n)&&CARE_PLAN_NOTIFICATION_TYPES.includes(n.type)).length;
}
function nutritionUnreadCount(){
  return notifications.filter(n=>isActionableUnread(n)&&NUTRITION_NOTIFICATION_TYPES.includes(n.type)).length;
}
function updateSubtabBadge(tabName,count,neutral=false){
  const tab=document.querySelector(`[data-patient-tab="${tabName}"]`);
  if(!tab)return;
  let badge=tab.querySelector('.subtab-badge');
  if(count===0){badge?.remove();return}
  if(!badge){
    badge=document.createElement('span');
    badge.className=`subtab-badge${neutral?' neutral':''}`;
    tab.append(' ',badge);
  }
  badge.textContent=count>99?'99+':String(count);
}
function updatePatientSubtabNotificationUI(){
  updateSubtabBadge('DOCTOR',medicalUnreadCount());
  updateSubtabBadge('PLAN',planUnreadCount());
  updateSubtabBadge('NUTRITION',nutritionUnreadCount());
}
function patientSubTabsMarkup(){
  const medicalCount=medicalUnreadCount(),planCount=planUnreadCount(),nutritionCount=nutritionUnreadCount();
  const openTickets=(supportTickets||[]).filter(t=>t.status!=='RESOLVED').length;
  return `<nav class="patient-subtabs" aria-label="Secciones del paciente">
    <button type="button" class="patient-subtab ${activePatientTab==='TRACKING'?'active':''}" data-patient-tab="TRACKING">Seguimiento</button>
    <button type="button" class="patient-subtab ${activePatientTab==='PLAN'?'active':''}" data-patient-tab="PLAN">Mi plan ${planCount?`<span class="subtab-badge">${planCount>99?'99+':planCount}</span>`:''}</button>
    <button type="button" class="patient-subtab ${activePatientTab==='NUTRITION'?'active':''}" data-patient-tab="NUTRITION">Nutrición ${nutritionCount?`<span class="subtab-badge">${nutritionCount>99?'99+':nutritionCount}</span>`:''}</button>
    <button type="button" class="patient-subtab ${activePatientTab==='DOCTOR'?'active':''}" data-patient-tab="DOCTOR">Mi médico ${medicalCount?`<span class="subtab-badge">${medicalCount>99?'99+':medicalCount}</span>`:''}</button>
    <button type="button" class="patient-subtab ${activePatientTab==='SUPPORT'?'active':''}" data-patient-tab="SUPPORT">Soporte ${openTickets?`<span class="subtab-badge neutral">${openTickets}</span>`:''}</button>
  </nav>`;
}
function bindPatientSubTabs(){
  document.querySelectorAll('[data-patient-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const next=btn.dataset.patientTab;
      if(!['TRACKING','PLAN','NUTRITION','DOCTOR','SUPPORT'].includes(next))return;
      activePatientTab=next;
      localStorage.setItem('pesocare_patient_tab',next);
      supportSyncSeq++;
      render();
    });
  });
}
function bindLifecycleSync(){
  if(lifecycleSyncBound)return;
  lifecycleSyncBound=true;
  const refresh=async()=>{
    if(document.visibilityState!=='visible')return;
    try{
      await ensureFreshAccessToken();
      await syncVisibleContext();
    }catch(err){
      console.warn('Visible context refresh failed',err);
    }
  };
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
}

async function syncVisibleContext(){
  try{
    if(activePortal==='PATIENT'&&activePatientTab==='PLAN')await syncPatientCarePlan(true);
    else if(activePortal==='PATIENT'&&activePatientTab==='NUTRITION')await syncPatientNutrition(true);
    else if(activePortal==='PATIENT'&&activePatientTab==='DOCTOR')await syncPatientMedicalData();
    else if(activePortal==='PATIENT'&&activePatientTab==='SUPPORT')await syncSupportTickets();
    else if(activePortal==='DOCTOR'&&doctorPatientDetail?.profile?.user_id)await syncDoctorMedicalData(doctorPatientDetail.profile.user_id);
    else if(activePortal==='DOCTOR'&&!doctorPatientDetail)await syncDoctorHomeData();
  }catch(err){console.warn('Context sync failed',err)}
}

function startContextSync(){
  if(contextSyncTimer){clearInterval(contextSyncTimer);contextSyncTimer=null}
  bindLifecycleSync();

  if(activePortal==='PATIENT'&&activePatientTab==='PLAN'){
    syncPatientCarePlan(true);
    contextSyncTimer=setInterval(()=>syncPatientCarePlan(true),6000);
  }else if(activePortal==='PATIENT'&&activePatientTab==='NUTRITION'){
    syncPatientNutrition(true);
    contextSyncTimer=setInterval(()=>syncPatientNutrition(true),12000);
  }else if(activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
    syncPatientMedicalData();
    contextSyncTimer=setInterval(()=>syncPatientMedicalData(),3000);
  }else if(activePortal==='PATIENT'&&activePatientTab==='SUPPORT'){
    syncSupportTickets();
    contextSyncTimer=setInterval(()=>syncSupportTickets(),10000);
  }else if(activePortal==='DOCTOR'&&doctorPatientDetail?.profile?.user_id){
    const patientId=doctorPatientDetail.profile.user_id;
    syncDoctorMedicalData(patientId);
    contextSyncTimer=setInterval(()=>syncDoctorMedicalData(patientId),3000);
  }else if(activePortal==='DOCTOR'&&!doctorPatientDetail){
    syncDoctorHomeData();
    contextSyncTimer=setInterval(()=>syncDoctorHomeData(),15000);
  }
}

function dashboardView(){
  const sorted=[...records].sort((a,b)=>a.measured_on.localeCompare(b.measured_on)||String(a.created_at).localeCompare(String(b.created_at)));
  const latest=sorted.at(-1);
  if(!latest){app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}<section class="card"><div class="error">No se encontró el registro inicial.</div></section>`);bindCommonHeader();bindPatientSubTabs();return}
  const change=Number(latest.weight_kg)-Number(profile.initial_weight_kg);
  const goal=profile.target_weight_kg?Number(profile.target_weight_kg):null;
  const latestWithAbdomen=[...sorted].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);
  const currentAbdomen=latestWithAbdomen?Number(latestWithAbdomen.abdominal_circumference_cm):null;
  const initialAbdomen=profile.initial_abdominal_circumference_cm!==null&&profile.initial_abdominal_circumference_cm!==undefined?Number(profile.initial_abdominal_circumference_cm):null;
  const abdomenChange=currentAbdomen!==null&&initialAbdomen!==null?currentAbdomen-initialAbdomen:null;
  const currentWeek=weekOf(latest.measured_on);
  const progress=Math.min(100,Math.max(0,(currentWeek/Math.max(1,profile.planned_weeks))*100));
  const editingRecord=editingWeightRecordId?records.find(r=>r.id===editingWeightRecordId)||null:null;

  app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}
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
    <section class="card" id="weightEntryCard">
      <div class="card-head">
        <div>
          <h2 class="section-title">${editingRecord?'Editar registro':'Registrar peso'}</h2>
          <p class="muted">${editingRecord
            ? (editingRecord.is_initial?'Puedes corregir peso y circunferencia del registro inicial. La fecha inicial se mantiene.':'Corrige fecha, peso o circunferencia y guarda los cambios.')
            :'La fecha de hoy viene propuesta. Puedes cambiarla para registrar un dato anterior.'}</p>
        </div>
        ${editingRecord?'<span class="edit-badge">Modo edición</span>':''}
      </div>
      <form id="weightForm"><div class="record-grid">
        <div class="record-field"><label for="date">Fecha</label><div class="control-frame"><input id="date" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl value="${formatDateCL(editingRecord?.measured_on||today())}" ${editingRecord?.is_initial?'readonly':''} required></div></div>
        <div class="record-field"><label for="weight">Peso (kg)</label><div class="control-frame"><input id="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 94,85" value="${editingRecord?String(editingRecord.weight_kg).replace('.',','):''}" required></div></div>
        <div class="record-field"><label for="abdomen">Circunferencia abdominal (cm)</label><div class="control-frame"><input id="abdomen" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 111,50" value="${editingRecord?.abdominal_circumference_cm!==null&&editingRecord?.abdominal_circumference_cm!==undefined?String(editingRecord.abdominal_circumference_cm).replace('.',','):''}" required></div></div>
      </div>
      <div class="form-actions" style="margin-top:12px">
        <button class="primary" type="submit">${editingRecord?'Guardar cambios':'Guardar registro'}</button>
        ${editingRecord?'<button class="secondary" type="button" id="cancelWeightEdit">Cancelar edición</button>':''}
      </div>
      <p id="weightMsg" class="error"></p></form>
    </section>
    <section class="card"><h2 class="section-title">Evolución de peso</h2><div class="muted">Cada medición se ubica según su fecha exacta dentro de las semanas de seguimiento.</div><div id="chart" class="chart-wrap"></div></section>
    <section class="card"><h2 class="section-title">Evolución de circunferencia abdominal</h2><div class="muted">La línea incluye todas las mediciones registradas, incluso varias dentro de una misma semana.</div><div id="abdomenChart" class="chart-wrap"></div></section>
    <section class="card">
      <h2 class="section-title">Historial</h2>
      <div class="table-wrap history-table-wrap"><table class="history-table">
        <colgroup>
          <col class="history-col-date">
          <col class="history-col-week">
          <col class="history-col-weight">
          <col class="history-col-waist">
          <col class="history-col-actions">
        </colgroup>
        <thead><tr>
          <th>Fecha</th>
          <th><span class="history-head-desktop">Semana</span><span class="history-head-mobile">Sem.</span></th>
          <th>Peso</th>
          <th><span class="history-head-desktop">Circ. abdominal</span><span class="history-head-mobile">Cint.</span></th>
          <th><span class="history-head-desktop">Acciones</span><span class="history-head-mobile">Acc.</span></th>
        </tr></thead>
        <tbody>${sorted.map(r=>`<tr>
          <td class="history-date-cell">${fmt(r.measured_on)}${r.is_initial?' <span class="initial-record-chip"><span class="initial-label-desktop">Inicial</span><span class="initial-label-mobile">I</span></span>':''}</td>
          <td class="history-week-cell">${weekOf(r.measured_on)}</td>
          <td class="history-number-cell">${kg(r.weight_kg)}</td>
          <td class="history-number-cell">${cm(r.abdominal_circumference_cm)}</td>
          <td class="history-actions-cell"><div class="record-actions">
            <button type="button" class="secondary small-btn record-action-btn" data-edit-weight="${r.id}" aria-label="Editar registro del ${fmt(r.measured_on)}" title="Editar">
              <span class="record-action-icon" aria-hidden="true">✎</span><span class="record-action-label">Editar</span>
            </button>
            ${r.is_initial?'':`<button type="button" class="secondary small-btn danger-outline record-action-btn" data-delete-weight="${r.id}" aria-label="Eliminar registro del ${fmt(r.measured_on)}" title="Eliminar">
              <span class="record-action-icon record-delete-icon" aria-hidden="true">×</span><span class="record-action-label">Eliminar</span>
            </button>`}
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`);

  document.getElementById('weightForm').addEventListener('submit',saveWeightRecord);
  document.getElementById('cancelWeightEdit')?.addEventListener('click',()=>{
    editingWeightRecordId=null;
    dashboardView();
  });
  document.querySelectorAll('[data-edit-weight]').forEach(btn=>btn.addEventListener('click',()=>{
    editingWeightRecordId=btn.dataset.editWeight;
    dashboardView();
    setTimeout(()=>document.getElementById('weightEntryCard')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }));
  document.querySelectorAll('[data-delete-weight]').forEach(btn=>btn.addEventListener('click',()=>deleteWeightRecord(btn.dataset.deleteWeight)));
  bindDateCLInputs();
  document.getElementById('reportBtn').addEventListener('click',generateReport);
  document.getElementById('editPlan').addEventListener('click',editPlan);
  bindCommonHeader();
  bindPatientSubTabs();
  drawCharts(sorted);
}



function applyReminderPreferencesFromSource(source){
  if(!source)return;
  notificationPreferences={
    ...notificationPreferences,
    appointment_reminders:source.appointment_reminders!==false,
    confirmation_reminders:source.confirmation_reminders!==false,
    record_reminders:source.record_reminders!==false
  };
}

function setReminderSaveStatus(state,text){
  const el=document.getElementById('reminderSaveStatus');
  if(!el)return;
  el.className=`reminder-save-status ${state||''}`.trim();
  el.textContent=text||'';
}

function setReminderInputsDisabled(disabled){
  ['reminderPrefAppointment','reminderPrefConfirmation','reminderPrefRecord'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.disabled=!!disabled;
  });
}

function patientReminderDueLabel(){
  const due=patientReminderPlan?.next_record_due_date;
  if(!due)return 'Sin fecha calculada';
  const t=today();
  if(due<t)return `Pendiente desde ${fmt(due)}`;
  if(due===t)return 'Corresponde hoy';
  return `Próximo registro sugerido: ${fmt(due)}`;
}

function patientReminderNextControlLabel(){
  const value=patientReminderPlan?.next_control_at;
  if(!value)return 'Sin control próximo';
  return `${fmt(chileDateFromTimestamp(value))} · ${chileTimeFromTimestamp(value)}`;
}

function patientReminderCardMarkup(){
  const days=Number(patientReminderPlan?.record_reminder_days||7);
  const statusClass=patientReminderSaving?'saving':patientReminderDirty?'dirty':'saved';
  const statusText=patientReminderSaving?'Guardando…':patientReminderDirty?'Cambios sin guardar':'Preferencias guardadas';

  return `<section class="card engagement-card" id="patientReminderCard">
    <div class="card-head">
      <div>
        <h2 class="section-title">Recordatorios BodyCare</h2>
        <div class="muted">Elige qué recordatorios quieres recibir y guarda tus cambios.</div>
      </div>
      <span class="engagement-status">Automático</span>
    </div>

    <div class="engagement-summary">
      <div>
        <span>Frecuencia de registro</span>
        <strong>Cada ${days} días</strong>
        <small>${esc(patientReminderDueLabel())}</small>
      </div>
      <div>
        <span>Próximo control</span>
        <strong>${esc(patientReminderNextControlLabel())}</strong>
        <small>${patientReminderPlan?.next_control_at?(patientReminderPlan?.next_control_status==='CONFIRMED'?'Confirmado':'Programado'):'Sin agenda activa'}</small>
      </div>
    </div>

    <div class="reminder-preference-list">
      <label class="reminder-preference-row">
        <span class="bodycare-switch">
          <input type="checkbox" id="reminderPrefConfirmation" ${notificationPreferences.confirmation_reminders?'checked':''}>
          <i aria-hidden="true"></i>
        </span>
        <span>
          <strong>Confirmación de control</strong>
          <small>Aviso aproximadamente 24 horas antes si aún no has confirmado.</small>
        </span>
      </label>

      <label class="reminder-preference-row">
        <span class="bodycare-switch">
          <input type="checkbox" id="reminderPrefAppointment" ${notificationPreferences.appointment_reminders?'checked':''}>
          <i aria-hidden="true"></i>
        </span>
        <span>
          <strong>Control próximo</strong>
          <small>Aviso aproximadamente 2 horas antes del control.</small>
        </span>
      </label>

      <label class="reminder-preference-row">
        <span class="bodycare-switch">
          <input type="checkbox" id="reminderPrefRecord" ${notificationPreferences.record_reminders?'checked':''}>
          <i aria-hidden="true"></i>
        </span>
        <span>
          <strong>Registro de seguimiento</strong>
          <small>Aviso cuando superas la frecuencia definida por tu profesional.</small>
        </span>
      </label>
    </div>

    <div class="reminder-save-row reminder-save-actions">
      <span id="reminderSaveStatus" class="reminder-save-status ${statusClass}">${statusText}</span>
      <button type="button" id="saveReminderPreferences" class="primary small-btn" ${patientReminderDirty&&!patientReminderSaving?'':'disabled'}>
        Guardar preferencias
      </button>
    </div>

    <div class="engagement-note">Los cambios solo quedan activos después de presionar <strong>Guardar preferencias</strong>. Si Push está habilitado, los avisos también pueden llegar con BodyCare cerrado.</div>
  </section>`;
}

async function syncPatientReminderPlan(renderCard=false){
  if(!hasRole('PATIENT'))return;
  try{
    const plan=await dbRpc('bodycare_get_patient_reminder_plan',{});
    patientReminderPlan=Array.isArray(plan)?plan[0]||null:plan;

    if(renderCard && !patientReminderSaving && !patientReminderDirty){
      renderPatientReminderCard();
    }
  }catch(err){
    console.warn('Patient reminder plan sync failed',err);
  }
}

function renderPatientReminderCard(){
  const old=document.getElementById('patientReminderCard');
  if(!old)return;

  const temp=document.createElement('div');
  temp.innerHTML=patientReminderCardMarkup().trim();
  const fresh=temp.firstElementChild;
  if(fresh){
    old.replaceWith(fresh);
    bindPatientReminderPreferences();
  }
}

function markPatientReminderDirty(){
  if(patientReminderSaving)return;
  patientReminderDirty=true;

  const status=document.getElementById('reminderSaveStatus');
  if(status){
    status.className='reminder-save-status dirty';
    status.textContent='Cambios sin guardar';
  }

  const save=document.getElementById('saveReminderPreferences');
  if(save)save.disabled=false;
}

async function loadAuthoritativeReminderPreferences(){
  const pref=await dbRpc('bodycare_get_reminder_preferences',{});
  const saved=Array.isArray(pref)?pref[0]||null:pref;
  if(!saved)throw new Error('Supabase no devolvió las preferencias.');
  applyReminderPreferencesFromSource(saved);
  return saved;
}

async function savePatientReminderPreferences(){
  if(patientReminderSaving||!patientReminderDirty)return;

  const appointment=document.getElementById('reminderPrefAppointment')?.checked ?? notificationPreferences.appointment_reminders;
  const confirmation=document.getElementById('reminderPrefConfirmation')?.checked ?? notificationPreferences.confirmation_reminders;
  const record=document.getElementById('reminderPrefRecord')?.checked ?? notificationPreferences.record_reminders;

  patientReminderSaving=true;
  setReminderInputsDisabled(true);
  setReminderSaveStatus('saving','Guardando…');

  const save=document.getElementById('saveReminderPreferences');
  if(save)save.disabled=true;

  try{
    await dbRpc('bodycare_save_reminder_preferences',{
      p_appointment_reminders:appointment,
      p_confirmation_reminders:confirmation,
      p_record_reminders:record
    });

    const saved=await loadAuthoritativeReminderPreferences();

    const confirmed=
      saved.appointment_reminders===appointment &&
      saved.confirmation_reminders===confirmation &&
      saved.record_reminders===record;

    if(!confirmed){
      throw new Error('La confirmación de Supabase no coincide con los cambios seleccionados.');
    }

    patientReminderDirty=false;
    setReminderSaveStatus('saved','Guardado');
    showToast('Preferencias guardadas','BodyCare confirmó tus recordatorios en Supabase.','CONTROL_REMINDER');

    await syncPatientReminderPlan(false);
  }catch(err){
    console.warn('Reminder preference save failed',err);

    try{
      await loadAuthoritativeReminderPreferences();
    }catch{}

    patientReminderDirty=false;
    alert('No fue posible guardar los recordatorios: '+err.message);
  }finally{
    patientReminderSaving=false;
    renderPatientReminderCard();
  }
}

function bindPatientReminderPreferences(){
  ['reminderPrefAppointment','reminderPrefConfirmation','reminderPrefRecord'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el||el.dataset.reminderBound==='1')return;
    el.dataset.reminderBound='1';
    el.addEventListener('change',markPatientReminderDirty);
  });

  const save=document.getElementById('saveReminderPreferences');
  if(save&&save.dataset.reminderBound!=='1'){
    save.dataset.reminderBound='1';
    save.addEventListener('click',savePatientReminderPreferences);
  }
}


function careGoalTypeLabel(type){return ({WEIGHT:'Peso',WAIST:'Circunferencia',RECORDING:'Registro',CUSTOM:'Personalizado'})[type]||'Objetivo'}
function careGoalStatusLabel(status){return ({ACTIVE:'Activo',ACHIEVED:'Logrado',PAUSED:'Pausado',CANCELLED:'Cancelado'})[status]||status||'Activo'}
function careActionStatusLabel(status){return ({PENDING:'Pendiente',IN_PROGRESS:'En progreso',COMPLETED:'Completada',CANCELLED:'Cancelada'})[status]||status||'Pendiente'}
function careGoalTargetText(goal){
  const parts=[];
  if(goal.target_value!==null&&goal.target_value!==undefined&&goal.target_value!==''){
    const n=Number(goal.target_value);
    parts.push(`${Number.isFinite(n)?n.toLocaleString('es-CL',{maximumFractionDigits:2}):goal.target_value}${goal.target_unit?` ${goal.target_unit}`:''}`);
  }
  if(goal.target_date)parts.push(`hasta ${fmt(goal.target_date)}`);
  return parts.join(' · ')||'Sin valor/meta temporal específica';
}
function carePlanCounts(plan){
  const goals=plan?.goals||[],actions=plan?.actions||[];
  return {
    activeGoals:goals.filter(g=>g.status==='ACTIVE').length,
    achievedGoals:goals.filter(g=>g.status==='ACHIEVED').length,
    pendingActions:actions.filter(a=>['PENDING','IN_PROGRESS'].includes(a.status)).length,
    completedActions:actions.filter(a=>a.status==='COMPLETED').length
  };
}
function carePlanProgress(plan){
  const relevant=(plan?.actions||[]).filter(a=>a.status!=='CANCELLED');
  return relevant.length?Math.round(relevant.filter(a=>a.status==='COMPLETED').length/relevant.length*100):0;
}
function currentMetricForGoal(goal){
  if(goal.goal_type==='WEIGHT'){const last=(records||[]).at(-1);return last?kg(last.weight_kg):null}
  if(goal.goal_type==='WAIST'){const last=[...(records||[])].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);return last?cm(last.abdominal_circumference_cm):null}
  return null;
}
function selectedPatientPlanDoctorId(){
  const select=document.getElementById('patientPlanDoctorSelect');
  if(select?.value)return select.value;
  const stored=localStorage.getItem('bodycare_selected_plan_doctor');
  if(stored&&linkedDoctorProfiles.some(d=>d.user_id===stored))return stored;
  return linkedDoctorProfiles[0]?.user_id||null;
}
function patientCareGoalMarkup(goal){
  const current=currentMetricForGoal(goal);
  return `<article class="care-goal-card ${String(goal.status||'ACTIVE').toLowerCase()}">
    <div class="care-card-head"><div><span class="care-type-chip">${careGoalTypeLabel(goal.goal_type)}</span><strong>${esc(goal.title)}</strong></div><span class="care-status-chip ${String(goal.status||'ACTIVE').toLowerCase()}">${careGoalStatusLabel(goal.status)}</span></div>
    ${goal.description?`<p>${esc(goal.description)}</p>`:''}
    <div class="care-goal-meta"><span><b>Objetivo:</b> ${esc(careGoalTargetText(goal))}</span>${current?`<span><b>Dato actual:</b> ${esc(current)}</span>`:''}</div>
  </article>`;
}
function patientCareActionMarkup(action){
  const locked=['COMPLETED','CANCELLED'].includes(action.status);
  return `<article class="care-action-card ${String(action.status||'PENDING').toLowerCase()}">
    <div class="care-card-head"><div><strong>${esc(action.title)}</strong>${action.due_date?`<span class="care-due-date">Fecha objetivo ${fmt(action.due_date)}</span>`:''}</div><span class="care-status-chip ${String(action.status||'PENDING').toLowerCase()}">${careActionStatusLabel(action.status)}</span></div>
    ${action.description?`<p>${esc(action.description)}</p>`:''}
    ${action.patient_note?`<div class="care-patient-note"><b>Mi nota:</b> ${esc(action.patient_note)}</div>`:''}
    ${!locked?`<label class="care-note-label">Nota de avance <span class="muted">(opcional)</span></label>
      <textarea rows="2" maxlength="1000" data-care-action-note="${action.id}" placeholder="Puedes dejar una nota para tu médico...">${esc(action.patient_note||'')}</textarea>
      <div class="care-action-buttons">${action.status==='PENDING'?`<button type="button" class="secondary small-btn" data-patient-care-action="${action.id}" data-care-status="IN_PROGRESS">Iniciar</button>`:''}<button type="button" class="primary small-btn" data-patient-care-action="${action.id}" data-care-status="COMPLETED">Marcar completada</button></div>`:''}
  </article>`;
}
function patientCarePlanContentMarkup(){
  const plan=patientCarePlan||{goals:[],actions:[]},counts=carePlanCounts(plan),progress=carePlanProgress(plan);
  return `<div class="care-plan-summary">
    <div><span>Objetivos activos</span><strong>${counts.activeGoals}</strong></div><div><span>Objetivos logrados</span><strong>${counts.achievedGoals}</strong></div><div><span>Acciones pendientes</span><strong>${counts.pendingActions}</strong></div><div><span>Acciones completadas</span><strong>${counts.completedActions}</strong></div>
  </div>
  <div class="care-progress-card"><div><strong>Avance de acciones</strong><span>${progress}% completado</span></div><div class="care-progress-track"><i style="width:${progress}%"></i></div></div>
  <section class="care-plan-block"><div class="care-block-head"><h3>Mis objetivos</h3><span>${(plan.goals||[]).length}</span></div><div class="care-goal-list">${(plan.goals||[]).length?(plan.goals||[]).map(patientCareGoalMarkup).join(''):'<div class="empty-state">Tu médico aún no ha definido objetivos compartidos.</div>'}</div></section>
  <section class="care-plan-block"><div class="care-block-head"><h3>Acciones e hitos</h3><span>${(plan.actions||[]).length}</span></div><div class="care-action-list">${(plan.actions||[]).length?(plan.actions||[]).map(patientCareActionMarkup).join(''):'<div class="empty-state">No tienes acciones asignadas por ahora.</div>'}</div></section>`;
}
function renderPatientCarePlanContent(){
  const el=document.getElementById('patientCarePlanContent');if(!el)return;
  el.innerHTML=patientCarePlanContentMarkup();bindPatientCarePlanActions();
  const st=document.getElementById('patientCarePlanStatus');if(st){st.textContent='Actualizado';st.classList.remove('syncing')}
}
function markVisiblePlanNotifications(doctorId){
  if(!doctorId)return;
  notifications.filter(n=>isActionableUnread(n)&&CARE_PLAN_NOTIFICATION_TYPES.includes(n.type)&&n.related_user_id===doctorId).forEach(n=>markNotificationRead(n.id));
  updateHeaderNotificationUI();
}
async function syncPatientCarePlan(renderUI=true){
  if(!hasRole('PATIENT'))return;
  const doctorId=selectedPatientPlanDoctorId();
  if(!doctorId){patientCarePlan={goals:[],actions:[]};patientCarePlanDoctorId=null;if(renderUI)renderPatientCarePlanContent();return}
  if(patientCarePlanSyncing)return;
  patientCarePlanSyncing=true;
  const st=document.getElementById('patientCarePlanStatus');if(st){st.textContent='Actualizando…';st.classList.add('syncing')}
  try{
    const data=await dbRpc('bodycare_get_care_plan',{p_doctor_user_id:doctorId,p_patient_user_id:currentUser.id});
    if(selectedPatientPlanDoctorId()===doctorId){
      patientCarePlan=data||{goals:[],actions:[]};patientCarePlanDoctorId=doctorId;markVisiblePlanNotifications(doctorId);
      if(renderUI&&!userIsTyping())renderPatientCarePlanContent();
    }
  }catch(err){console.warn('Patient care plan sync failed',err);if(st){st.textContent='No se pudo actualizar';st.classList.remove('syncing')}}
  finally{patientCarePlanSyncing=false}
}
async function updatePatientCareAction(actionId,status){
  const note=document.querySelector(`[data-care-action-note="${actionId}"]`)?.value.trim()||null;
  try{
    await dbRpc('bodycare_set_care_action_status',{p_action_id:actionId,p_status:status,p_patient_note:note});
    await syncPatientCarePlan(false);renderPatientCarePlanContent();
    showToast(status==='COMPLETED'?'Acción completada':'Avance actualizado','Tu médico verá el cambio en BodyCare.','CARE_ACTION_UPDATED');
  }catch(err){alert('No fue posible actualizar la acción: '+err.message)}
}
function bindPatientCarePlanActions(){
  document.querySelectorAll('[data-patient-care-action]').forEach(btn=>btn.addEventListener('click',()=>updatePatientCareAction(btn.dataset.patientCareAction,btn.dataset.careStatus)));
}

const NUTRITION_MEALS=[
  {type:'BREAKFAST',label:'Desayuno',time:'08:00'},
  {type:'SNACK_AM',label:'Snack AM',time:'10:30'},
  {type:'LUNCH',label:'Almuerzo',time:'14:00'},
  {type:'SNACK_PM',label:'Snack PM',time:'17:00'},
  {type:'DINNER',label:'Cena',time:'20:00'}
];
function nutritionMeal(type){return NUTRITION_MEALS.find(m=>m.type===type)||{type,label:type,time:''}}
function nutritionNum(v,d=1){
  const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('es-CL',{minimumFractionDigits:d,maximumFractionDigits:d}):'0';
}
function selectedPatientNutritionDoctorId(){
  const select=document.getElementById('patientNutritionDoctorSelect');
  if(select?.value)return select.value;
  const stored=localStorage.getItem('bodycare_selected_nutrition_doctor');
  if(stored&&linkedDoctorProfiles.some(d=>d.user_id===stored))return stored;
  return linkedDoctorProfiles[0]?.user_id||null;
}
function nutritionFoodById(id,catalog=patientNutritionCatalog){return (catalog||[]).find(f=>f.id===id)||null}
function nutritionItemsForMeal(type,plan=patientNutritionPlan){
  return (plan?.items||[]).filter(i=>i.meal_type===type);
}
function nutritionSuggestedGrams(type,foodId){
  const planned=nutritionItemsForMeal(type).find(i=>i.food_id===foodId);
  const food=nutritionFoodById(foodId);
  return Number(planned?.portion_grams||food?.reference_serving_grams||100);
}
function nutritionEstimate(food,grams){
  const g=Math.max(0,Number(grams)||0),factor=g/100;
  return {
    kcal:Number(food?.kcal_per_100g||0)*factor,
    protein_g:Number(food?.protein_g_per_100g||0)*factor,
    sugars_g:Number(food?.sugars_g_per_100g||0)*factor,
    fat_g:Number(food?.fat_g_per_100g||0)*factor
  };
}
function nutritionTargetCard(key,label,unit){
  const target=Number(patientNutritionDay?.targets?.[key]||0);
  const consumed=Number(patientNutritionDay?.totals?.[key]||0);
  const pct=target>0?consumed/target*100:0;
  const over=target>0&&pct>100;
  const protein=key==='protein_g';
  const status=!target?'Meta no definida':protein&&pct>=100?'Meta alcanzada':over?`${nutritionNum(consumed-target,1)} ${unit} sobre pauta`:`${nutritionNum(Math.max(target-consumed,0),1)} ${unit} disponibles`;
  return `<div class="nutrition-target-card ${over&&!protein?'over':''} ${protein&&pct>=100?'reached':''}">
    <span>${label}</span>
    <strong>${nutritionNum(consumed,key==='kcal'?0:1)} <small>/ ${target?nutritionNum(target,key==='kcal'?0:1):'—'} ${unit}</small></strong>
    <div class="nutrition-progress"><i style="width:${Math.min(100,Math.max(0,pct))}%"></i></div>
    <em>${esc(status)}</em>
  </div>`;
}
function nutritionPlanSourceNotice(){
  return `<div class="nutrition-reference-note">
    <strong>Referencia nutricional</strong>
    <span>Los valores genéricos se calculan por 100 g y se ajustan a los gramos registrados. Productos “light”, marcas locales y preparaciones caseras deben confirmarse con su etiqueta o receta cuando se requiera mayor precisión.</span>
  </div>`;
}
function patientNutritionFoodOptions(type){
  const planIds=new Set(nutritionItemsForMeal(type).map(i=>i.food_id));
  const planned=patientNutritionCatalog.filter(f=>planIds.has(f.id));
  const others=patientNutritionCatalog.filter(f=>!planIds.has(f.id));
  const option=f=>`<option value="${f.id}">${esc(f.name)} · ${nutritionNum(f.kcal_per_100g,0)} kcal/100g</option>`;
  return `${planned.length?`<optgroup label="Alimentos de tu pauta">${planned.map(option).join('')}</optgroup>`:''}<optgroup label="Otros alimentos del catálogo">${others.map(option).join('')}</optgroup>`;
}
function patientNutritionLoggedMeal(type){
  const rows=(patientNutritionDay?.items||[]).filter(i=>i.meal_type===type);
  if(!rows.length)return '<div class="nutrition-meal-empty">Aún no registras alimentos en esta comida.</div>';
  return `<div class="nutrition-log-list">${rows.map(i=>`<div class="nutrition-log-row">
    <div><strong>${esc(i.food_name_snapshot)}</strong><span>${nutritionNum(i.grams,0)} g · ${nutritionNum(i.kcal,0)} kcal · P ${nutritionNum(i.protein_g,1)} g · Az ${nutritionNum(i.sugars_g,1)} g · G ${nutritionNum(i.fat_g,1)} g</span>${i.note?`<small>${esc(i.note)}</small>`:''}</div>
    <button type="button" class="nutrition-delete-btn" data-delete-nutrition-log="${i.id}" aria-label="Eliminar">×</button>
  </div>`).join('')}</div>`;
}
function patientNutritionPlanHint(type){
  const items=nutritionItemsForMeal(type);
  if(!items.length)return '';
  const groups=new Map();
  items.forEach(i=>{
    const key=i.option_group||'PAUTA';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(i);
  });
  return `<details class="nutrition-plan-hint"><summary>Ver alimentos sugeridos por la pauta</summary>
    ${[...groups.entries()].map(([group,rows])=>`<div class="nutrition-option-group"><b>${esc(group.replaceAll('_',' '))}</b>${rows.map(i=>`<span>${esc(i.source_text||i.name)} · ${nutritionNum(i.portion_grams,0)} g</span>`).join('')}</div>`).join('')}
  </details>`;
}
function patientNutritionMealCard(type){
  const m=nutritionMeal(type);
  return `<section class="nutrition-meal-card">
    <div class="nutrition-meal-head"><div><strong>${m.label}</strong><span>${m.time}</span></div></div>
    ${patientNutritionPlanHint(type)}
    ${patientNutritionLoggedMeal(type)}
    <form class="nutrition-log-form" data-nutrition-meal-form="${type}">
      <div class="nutrition-log-grid">
        <div><label>Alimento</label><select data-nutrition-food required>${patientNutritionFoodOptions(type)}</select></div>
        <div><label>Cantidad</label><div class="suffix-input"><input data-nutrition-grams type="number" min="1" max="5000" step="1" required><span>g</span></div></div>
      </div>
      <div class="nutrition-estimate" data-nutrition-estimate>Selecciona el alimento y la cantidad para ver el cálculo.</div>
      <input data-nutrition-note maxlength="300" placeholder="Nota opcional: preparación, marca, etc.">
      <button class="secondary small-btn" type="submit">Agregar a ${m.label.toLowerCase()}</button>
    </form>
  </section>`;
}
function patientNutritionContentMarkup(){
  const p=patientNutritionPlan?.plan;
  if(!p)return `<div class="empty-state">Tu profesional aún no ha activado una pauta nutricional en BodyCare.</div>`;
  return `<section class="card">
    <div class="card-head"><div><h2 class="section-title">${esc(p.program_name||'Plan nutricional')}</h2><div class="muted">Registro diario comparado con la pauta definida por tu profesional.</div></div><span class="nutrition-program-chip">Activo</span></div>
    ${p.instructions?`<div class="nutrition-instructions">${esc(p.instructions)}</div>`:''}
    <div class="nutrition-guidance-grid">
      <div><b>Evitar según pauta</b><span>${esc(p.avoid_text||'—')}</span></div>
      <div><b>Consumo libre según pauta</b><span>${esc(p.free_text||'—')}</span></div>
    </div>
    ${nutritionPlanSourceNotice()}
  </section>
  <section class="nutrition-targets">
    ${nutritionTargetCard('kcal','Calorías','kcal')}
    ${nutritionTargetCard('protein_g','Proteína','g')}
    ${nutritionTargetCard('sugars_g','Azúcares totales','g')}
    ${nutritionTargetCard('fat_g','Grasa total','g')}
  </section>
  <section class="card nutrition-date-card">
    <div><label for="patientNutritionDate">Día del registro</label><input id="patientNutritionDate" type="text" inputmode="numeric" maxlength="10" data-date-cl value="${formatDateCL(patientNutritionDate)}"></div>
    <button type="button" id="nutritionTodayBtn" class="secondary small-btn">Hoy</button>
  </section>
  <div class="nutrition-meal-stack">${NUTRITION_MEALS.map(m=>patientNutritionMealCard(m.type)).join('')}</div>`;
}
function renderPatientNutritionContent(){
  const el=document.getElementById('patientNutritionContent');if(!el)return;
  el.innerHTML=patientNutritionContentMarkup();
  bindPatientNutritionContent();
  bindDateCLInputs(el);
}
function markVisibleNutritionNotifications(doctorId){
  notifications.filter(n=>isActionableUnread(n)&&NUTRITION_NOTIFICATION_TYPES.includes(n.type)&&(!doctorId||n.related_user_id===doctorId)).forEach(n=>markNotificationRead(n.id));
  updateHeaderNotificationUI();
}
async function syncPatientNutrition(renderUI=true){
  if(!hasRole('PATIENT'))return;
  const doctorId=selectedPatientNutritionDoctorId();
  if(!doctorId)return;
  if(patientNutritionSyncing)return;
  patientNutritionSyncing=true;
  try{
    const [plan,catalog]=await Promise.all([
      dbRpc('bodycare_get_nutrition_plan',{p_doctor_user_id:doctorId,p_patient_user_id:currentUser.id}),
      dbRpc('bodycare_get_nutrition_catalog',{p_doctor_user_id:doctorId})
    ]);
    patientNutritionPlan=plan||{plan:null,items:[]};
    patientNutritionCatalog=catalog||[];
    patientNutritionDoctorId=doctorId;
    if(patientNutritionPlan?.plan?.id){
      patientNutritionDay=await dbRpc('bodycare_get_nutrition_day',{p_doctor_user_id:doctorId,p_plan_id:patientNutritionPlan.plan.id,p_log_date:patientNutritionDate});
    }else patientNutritionDay=null;
    markVisibleNutritionNotifications(doctorId);
    if(renderUI&&!userIsTyping())renderPatientNutritionContent();
  }catch(err){console.warn('Nutrition sync failed',err)}
  finally{patientNutritionSyncing=false}
}
function updateNutritionEstimate(form){
  const foodId=form.querySelector('[data-nutrition-food]')?.value;
  const food=nutritionFoodById(foodId);
  const grams=Number(form.querySelector('[data-nutrition-grams]')?.value||0);
  const el=form.querySelector('[data-nutrition-estimate]');
  if(!food||!el)return;
  const n=nutritionEstimate(food,grams);
  el.innerHTML=`<strong>${nutritionNum(n.kcal,0)} kcal</strong> · proteína ${nutritionNum(n.protein_g,1)} g · azúcares ${nutritionNum(n.sugars_g,1)} g · grasa ${nutritionNum(n.fat_g,1)} g <small>${food.reference_quality==='VERIFY_LABEL'?'Referencia genérica: confirmar etiqueta cuando sea posible.':esc(food.source_name||'Referencia')}</small>`;
}
function bindNutritionMealForm(form){
  const type=form.dataset.nutritionMealForm;
  const select=form.querySelector('[data-nutrition-food]');
  const grams=form.querySelector('[data-nutrition-grams]');
  const refresh=()=>{
    if(select?.value&&(!grams.value||Number(grams.value)<=0))grams.value=String(Math.round(nutritionSuggestedGrams(type,select.value)));
    updateNutritionEstimate(form);
  };
  select?.addEventListener('change',()=>{grams.value=String(Math.round(nutritionSuggestedGrams(type,select.value)));updateNutritionEstimate(form)});
  grams?.addEventListener('input',()=>updateNutritionEstimate(form));
  if(select?.options?.length){select.selectedIndex=0;refresh()}
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const foodId=select?.value,g=Number(grams?.value||0),note=form.querySelector('[data-nutrition-note]')?.value.trim()||null;
    if(!foodId||!g)return;
    try{
      await dbRpc('bodycare_log_nutrition_item',{p_doctor_user_id:patientNutritionDoctorId,p_plan_id:patientNutritionPlan.plan.id,p_log_date:patientNutritionDate,p_meal_type:type,p_food_id:foodId,p_grams:g,p_note:note});
      await syncPatientNutrition(false);renderPatientNutritionContent();
      showToast('Comida registrada','Los totales diarios fueron actualizados.','NUTRITION_PLAN_UPDATED');
    }catch(err){alert('No fue posible registrar el alimento: '+err.message)}
  });
}
function bindPatientNutritionContent(){
  document.querySelectorAll('[data-nutrition-meal-form]').forEach(bindNutritionMealForm);
  document.querySelectorAll('[data-delete-nutrition-log]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('¿Eliminar este alimento del registro diario?'))return;
    try{await dbRpc('bodycare_delete_nutrition_log_item',{p_log_item_id:btn.dataset.deleteNutritionLog});await syncPatientNutrition(false);renderPatientNutritionContent()}
    catch(err){alert('No fue posible eliminar el registro: '+err.message)}
  }));
  document.getElementById('patientNutritionDate')?.addEventListener('change',async e=>{
    const iso=parseDateCLInput(e.target.value);
    if(!iso){alert('Fecha inválida. Usa DD/MM/AAAA.');e.target.value=formatDateCL(patientNutritionDate);return}
    if(iso>today()){alert('No puedes registrar comidas en una fecha futura.');e.target.value=formatDateCL(patientNutritionDate);return}
    patientNutritionDate=iso;await syncPatientNutrition(false);renderPatientNutritionContent();
  });
  document.getElementById('nutritionTodayBtn')?.addEventListener('click',async()=>{patientNutritionDate=today();await syncPatientNutrition(false);renderPatientNutritionContent()});
}
function patientNutritionView(){
  const selected=selectedPatientNutritionDoctorId();
  app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}
    <section class="card patient-section-hero"><div><h2 class="section-title">Nutrición</h2><div class="muted">Registra tus cinco comidas y revisa cuánto llevas consumido frente a tu pauta diaria.</div></div><span class="realtime-pill"><i class="live-dot online"></i>Cálculo automático</span></section>
    ${linkedDoctorProfiles.length?`<section class="card nutrition-doctor-selector"><label for="patientNutritionDoctorSelect">Pauta indicada por</label><select id="patientNutritionDoctorSelect">${linkedDoctorProfiles.map(d=>`<option value="${d.user_id}" ${d.user_id===selected?'selected':''}>${esc(d.display_name||'Médico')}</option>`).join('')}</select></section><div id="patientNutritionContent"><div class="empty-state">Cargando pauta nutricional…</div></div>`:`<section class="card"><div class="empty-state">Vincula un profesional para habilitar Nutrición.</div></section>`}`);
  bindCommonHeader();bindPatientSubTabs();
  document.getElementById('patientNutritionDoctorSelect')?.addEventListener('change',async e=>{localStorage.setItem('bodycare_selected_nutrition_doctor',e.target.value);patientNutritionDoctorId=null;await syncPatientNutrition(true)});
  setTimeout(()=>syncPatientNutrition(true),0);
}

function patientPlanView(){
  const selected=selectedPatientPlanDoctorId();
  if(patientCarePlanDoctorId!==selected)patientCarePlan={goals:[],actions:[]};
  app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}
    <section class="card patient-section-hero"><div><h2 class="section-title">Mi plan</h2><div class="muted">Objetivos y acciones compartidas con tu equipo tratante.</div></div><span id="patientCarePlanStatus" class="agenda-sync-status">Actualizando…</span></section>
    ${linkedDoctorProfiles.length?`<section class="card"><label for="patientPlanDoctorSelect">Plan definido por</label><select id="patientPlanDoctorSelect">${linkedDoctorProfiles.map(d=>`<option value="${d.user_id}" ${d.user_id===selected?'selected':''}>${esc(d.display_name||'Médico')}</option>`).join('')}</select><div class="clinical-settings-note">Este plan refleja objetivos y acciones definidos o compartidos con tu profesional. BodyCare no genera recomendaciones clínicas automáticas.</div></section>
      <section class="card" id="patientCarePlanContent">${patientCarePlanDoctorId===selected?patientCarePlanContentMarkup():'<div class="empty-state">Cargando tu plan de seguimiento…</div>'}</section>`:`<section class="card"><div class="empty-state">Vincula un médico para habilitar un plan de seguimiento compartido.</div></section>`}`);
  bindCommonHeader();bindPatientSubTabs();bindPatientCarePlanActions();
  document.getElementById('patientPlanDoctorSelect')?.addEventListener('change',e=>{localStorage.setItem('bodycare_selected_plan_doctor',e.target.value);patientCarePlanDoctorId=null;patientCarePlan={goals:[],actions:[]};syncPatientCarePlan(true)});
  setTimeout(()=>syncPatientCarePlan(true),0);
}

function patientDoctorView(){
  const selectedStored=localStorage.getItem('pesocare_selected_doctor');
  const selectedDoctor=linkedDoctorProfiles.some(d=>d.user_id===selectedStored)?selectedStored:(linkedDoctorProfiles[0]?.user_id||'');
  const selectedControlStored=localStorage.getItem('bodycare_selected_control_doctor');
  const selectedControlDoctor=linkedDoctorProfiles.some(d=>d.user_id===selectedControlStored)?selectedControlStored:(selectedDoctor||linkedDoctorProfiles[0]?.user_id||'');

  app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}
    <section class="card patient-section-hero">
      <div>
        <h2 class="section-title">Mi médico</h2>
        <div class="muted">Controles, mensajes, indicaciones y profesionales autorizados en un solo lugar.</div>
      </div>
      <span class="realtime-pill"><i class="live-dot ${realtimeStatus==='live'?'online':realtimeStatus==='connecting'?'connecting':'offline'}"></i>Sincronización automática</span>
    </section>

    <section class="card">
      <h2 class="section-title">Profesionales vinculados</h2>
      ${linkedDoctorProfiles.length
        ? linkedDoctorProfiles.map(d=>`
          <div class="doctor-row">
            <div>
              <strong>${esc(d.display_name||'Médico')}</strong>
              <div class="muted">${esc(d.specialty||'Especialidad pendiente')}${d.clinic_name?` · ${esc(d.clinic_name)}`:''} · controles ${validControlSlotMinutes(d.control_slot_minutes||30)} min</div>
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

    ${patientReminderCardMarkup()}

    <section class="card" id="patientControlsSection">
      <div class="card-head">
        <div>
          <h2 class="section-title">Controles</h2>
          <div class="muted">Médico y paciente pueden agendar controles. El paciente puede confirmar asistencia y el resultado queda compartido en el historial.</div>
        </div>
      </div>
      ${linkedDoctorProfiles.length?`
        <form id="patientControlForm" class="control-form">
          <div class="grid control-grid">
            <div>
              <label for="patientControlDoctorSelect">Médico</label>
              <select id="patientControlDoctorSelect" required>
                ${linkedDoctorProfiles.map(d=>`<option value="${d.user_id}" ${d.user_id===selectedControlDoctor?'selected':''}>${esc(d.display_name||'Médico')}</option>`).join('')}
              </select>
            </div>
            <div>
              <label for="patientControlDate">Fecha</label>
              <input id="patientControlDate" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl value="${formatDateCL(today())}" required>
            </div>
            <div>
              <label for="patientControlTime">Hora</label>
              <div class="time-control-frame">
                <input id="patientControlTime" type="time" required>
              </div>
            </div>
          </div>
          <div id="patientControlSlotInfo" class="slot-info control-slot-info-full">Bloques definidos por el médico: ${validControlSlotMinutes(linkedDoctorProfiles.find(d=>d.user_id===selectedControlDoctor)?.control_slot_minutes||30)} minutos.</div>
          <div id="patientControlAvailability" class="control-availability"></div>
          <label for="patientControlNotes" style="margin-top:10px">Observación <span class="muted">(opcional)</span></label>
          <textarea id="patientControlNotes" rows="2" maxlength="1000" placeholder="Ej: control de evolución"></textarea>
          <div class="form-actions"><button class="primary" type="submit">Registrar control</button></div>
        </form>
        <div id="patientControlSyncStatus" class="control-sync-status syncing"><span class="control-sync-dot"></span><span>Actualizando controles…</span></div>
        <div id="patientControlList">${controlListMarkup(patientControls,'patient')}</div>`
        :'<div class="empty-state">Vincula un médico para registrar controles compartidos.</div>'}
    </section>

    <section class="card">
      <h2 class="section-title">Indicaciones compartidas</h2>
      <div class="integration-note">La receta electrónica, firma y conexión SNRE quedan pendientes. Estas indicaciones funcionan dentro de BodyCare y no sustituyen todavía una receta oficial.</div>
      <div id="patientPrescriptionSyncStatus" class="rx-sync-status syncing"><span class="rx-sync-dot"></span><span>Actualizando indicaciones…</span></div>
      <div id="patientPrescriptionList">${patientPrescriptionListMarkup()}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2 class="section-title">Mensajes</h2><div class="muted">La conversación se actualiza automáticamente.</div></div>
        ${linkedDoctorProfiles.length?'<button type="button" class="link-danger" id="patientClearConversation">Eliminar historial</button>':''}
      </div>
      ${linkedDoctorProfiles.length?`
        <label for="patientDoctorSelect">Conversación con</label>
        <select id="patientDoctorSelect">
          ${linkedDoctorProfiles.map(d=>`<option value="${d.user_id}" ${d.user_id===selectedDoctor?'selected':''}>${esc(d.display_name||'Médico')}</option>`).join('')}
        </select>
        <div id="patientChatSyncStatus" class="chat-sync-status syncing"><span class="chat-sync-dot"></span><span>Actualizando conversación…</span></div>
        <div id="patientMessageThread" class="message-thread"></div>
        <form id="patientMessageForm" class="message-form">
          <textarea id="patientMessageText" rows="3" maxlength="4000" placeholder="Escribe un mensaje..." required></textarea>
          <button class="primary" type="submit">Enviar mensaje</button>
        </form>`
      :'<div class="empty-state">Vincula un médico para habilitar mensajería.</div>'}
    </section>`);

  bindCommonHeader();
  bindPatientSubTabs();
  bindPatientCare();
  bindPatientReminderPreferences();
  setTimeout(()=>syncPatientReminderPlan(false),0);
  renderPatientPrescriptionList();
  renderPatientMessageThread();
  renderPatientControls();
  markVisibleMedicalNotifications();
}

function patientSupportView(){
  app.innerHTML=shell(`${header()}${patientSubTabsMarkup()}
    <section class="card patient-section-hero">
      <div><h2 class="section-title">Soporte BodyCare</h2><div class="muted">Reporta incidencias y revisa el estado de tus solicitudes.</div></div>
    </section>
    <section class="card">
      <h2 class="section-title">Nueva solicitud</h2>
      <form id="supportForm">
        <div class="grid">
          <div><label>Asunto</label><input id="supportSubject" required placeholder="Ej: No puedo registrar un dato"></div>
          <div><label>Descripción</label><textarea id="supportDescription" rows="4" required></textarea></div>
        </div>
        <button class="primary" type="submit" style="margin-top:12px">Enviar solicitud</button>
        <p id="supportMsg" class="error"></p>
      </form>
    </section>
    <section class="card">
      <h2 class="section-title">Mis solicitudes</h2>
      <div id="supportTicketList">${supportTicketListMarkup()}</div>
    </section>`);

  bindCommonHeader();
  bindPatientSubTabs();
  bindPatientCare();
}


function measurementWeekPosition(date,startDate){
  const start=parseDate(startDate);
  const current=parseDate(date);
  return Math.max(0,(current-start)/(7*86400000));
}

function measurementWeekLabel(position){
  const whole=Math.floor(position);
  const days=Math.round((position-whole)*7);
  return days>0?`Semana ${whole} + ${days} día${days===1?'':'s'}`:`Semana ${whole}`;
}

function getMeasurementPoints(sorted,field,p=profile){
  return (sorted||[])
    .filter(r=>{
      const raw=r[field];
      return raw!==null&&raw!==undefined&&raw!=='';
    })
    .map(r=>[
      measurementWeekPosition(r.measured_on,p.start_date),
      Number(r[field]),
      r.measured_on,
      weekOfFor(r.measured_on,p)
    ])
    .sort((a,b)=>a[0]-b[0]);
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
    ariaLabel='Gráfico',
    plan=profile
  }=options;

  const vals=points.map(p=>p[1]).concat(goal!==null?[Number(goal)]:[]);
  let min=Math.min(...vals),max=Math.max(...vals);

  if(max-min<4){
    min-=2; max+=2;
  }else{
    const pad=(max-min)*0.15;
    min-=pad; max+=pad;
  }

  const pointMax=Math.max(0,...points.map(p=>Number(p[0])||0));
  const xMax=Math.max(1,Number(plan?.planned_weeks||0),Math.ceil(pointMax));

  const W=760,H=330,L=58,R=18,T=20,B=50,iw=W-L-R,ih=H-T-B;
  const x=position=>L+(position/xMax)*iw;
  const y=v=>T+((max-v)/(max-min))*ih;

  let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;

  const yTicks=5;
  for(let i=0;i<=yTicks;i++){
    const v=max-(max-min)*i/yTicks;
    const yy=T+ih*i/yTicks;
    svg+=`<line class="chart-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/>`;
    svg+=`<text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${v.toFixed(decimals)}</text>`;
  }

  const step=xMax<=16?2:xMax<=32?4:Math.max(1,Math.ceil(xMax/8));
  for(let w=0;w<=xMax;w+=step){
    const xx=x(w);
    svg+=`<line class="chart-grid" x1="${xx}" y1="${T}" x2="${xx}" y2="${T+ih}"/>`;
    svg+=`<text class="chart-label" x="${xx}" y="${H-22}" text-anchor="middle">${w}</text>`;
  }
  if(xMax%step!==0){
    svg+=`<text class="chart-label" x="${x(xMax)}" y="${H-22}" text-anchor="middle">${xMax}</text>`;
  }

  if(goal!==null){
    svg+=`<line class="${goalClass}" x1="${L}" y1="${y(Number(goal))}" x2="${W-R}" y2="${y(Number(goal))}"/>`;
  }

  const path=points.map(([position,value],i)=>`${i?'L':'M'} ${x(position).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  svg+=`<path class="${lineClass}" d="${path}"/>`;

  points.forEach(([position,value,date])=>{
    const dateLabel=date?fmt(date):'';
    const weekLabel=measurementWeekLabel(position);
    svg+=`<circle class="${pointClass}" cx="${x(position)}" cy="${y(value)}" r="5"><title>${dateLabel} · ${weekLabel}: ${value.toFixed(decimals)} ${valueSuffix}</title></circle>`;
  });

  svg+=`<text class="chart-label" x="${L+iw/2}" y="${H-4}" text-anchor="middle">Semanas de seguimiento</text>`;
  svg+=`<text class="chart-label" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  svg+='</svg>';

  return svg;
}

function drawCharts(sorted){
  const weightPoints=getMeasurementPoints(sorted,'weight_kg',profile);
  const abdomenPoints=getMeasurementPoints(sorted,'abdominal_circumference_cm',profile);

  const weightEl=document.getElementById('chart');
  if(weightEl){
    weightEl.innerHTML=
      buildChartSvg(weightPoints,{
        goal:profile.target_weight_kg?Number(profile.target_weight_kg):null,
        yLabel:'Peso (kg)',
        valueSuffix:'kg',
        decimals:2,
        ariaLabel:'Gráfico de evolución de peso',
        plan:profile
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
        ariaLabel:'Gráfico de evolución de circunferencia abdominal',
        plan:profile
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

  const weightPoints=getMeasurementPoints(sorted,'weight_kg',profile);
  const abdomenPoints=getMeasurementPoints(sorted,'abdominal_circumference_cm',profile);

  const weightSvg=buildChartSvg(weightPoints,{
    goal:profile.target_weight_kg?Number(profile.target_weight_kg):null,
    yLabel:'Peso (kg)',
    valueSuffix:'kg',
    decimals:2,
    ariaLabel:'Evolución de peso',
    plan:profile
  });

  const abdomenSvg=buildChartSvg(abdomenPoints,{
    yLabel:'Circunferencia (cm)',
    valueSuffix:'cm',
    decimals:2,
    lineClass:'chart-line-abdomen',
    pointClass:'chart-point-abdomen',
    ariaLabel:'Evolución de circunferencia abdominal',
    plan:profile
  });

  const generatedAt=new Date().toLocaleString('es-CL');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte BodyCare - ${esc(profile.full_name)}</title>
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
      <img src="${BRAND_LOGO_URL}" alt="Logo BodyCare" class="report-logo" onerror="this.style.display='none'">
      <div>
        <div class="brand">BodyCare</div>
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

  <div class="footer">BodyCare · Reporte personal de seguimiento</div>
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



function validControlSlotMinutes(value){
  const n=Number(value);
  return [15,30,45,60].includes(n)?n:30;
}

function linkedDoctorSlotMinutes(doctorId){
  return validControlSlotMinutes(linkedDoctorProfiles.find(d=>d.user_id===doctorId)?.control_slot_minutes||30);
}

function controlSlotMinutesForContext(context){
  if(context==='doctor')return validControlSlotMinutes(doctorProfile?.control_slot_minutes||30);
  return linkedDoctorSlotMinutes(selectedPatientControlDoctorId());
}

function controlContextIds(context){
  if(context==='doctor'){
    return {
      doctorId:currentUser.id,
      patientId:doctorPatientDetail?.profile?.user_id||null
    };
  }
  return {
    doctorId:selectedPatientControlDoctorId(),
    patientId:currentUser.id
  };
}

function controlInputIds(context){
  return context==='doctor'
    ? {date:'doctorControlDate',time:'doctorControlTime',availability:'doctorControlAvailability',slotInfo:'doctorControlSlotInfo'}
    : {date:'patientControlDate',time:'patientControlTime',availability:'patientControlAvailability',slotInfo:'patientControlSlotInfo'};
}

function formatSuggestedControl(dateIso,timeValue){
  return `${formatDateCL(dateIso)} · ${String(timeValue||'').slice(0,5)}`;
}

function applyControlSlotStep(context){
  const ids=controlInputIds(context);
  const input=document.getElementById(ids.time);
  const info=document.getElementById(ids.slotInfo);
  const mins=controlSlotMinutesForContext(context);
  if(input)input.step=String(mins*60);
  if(info)info.textContent=`Bloques definidos por el médico: ${mins} minutos.`;
}

function clearControlAvailability(context){
  const el=document.getElementById(controlInputIds(context).availability);
  if(el){
    el.innerHTML='';
    el.className='control-availability';
  }
}

function renderControlAvailability(context,result,requestedTime=''){
  const ids=controlInputIds(context);
  const el=document.getElementById(ids.availability);
  if(!el)return;

  if(!result){
    clearControlAvailability(context);
    return;
  }

  const mins=validControlSlotMinutes(result.slot_minutes||controlSlotMinutesForContext(context));

  if(result.available){
    el.className='control-availability available';
    el.innerHTML=`<span class="availability-dot"></span><span>Horario disponible · bloque de ${mins} min</span>`;
    return;
  }

  const suggestionDate=result.suggested_date;
  const suggestionTime=result.suggested_time;
  const reason=result.reason==='NOT_ALIGNED'
    ? `La agenda de este médico utiliza bloques de ${mins} minutos y ${esc(requestedTime||'esa hora')} no corresponde al inicio de un bloque.`
    : `Ese horario no está disponible en la agenda del médico.`;

  el.className='control-availability unavailable';
  el.innerHTML=`
    <div>
      <strong>Horario no disponible</strong>
      <span>${reason}</span>
      ${suggestionDate&&suggestionTime?`<span>Horario disponible más cercano: <strong>${esc(formatSuggestedControl(suggestionDate,suggestionTime))}</strong></span>`:''}
    </div>
    ${suggestionDate&&suggestionTime?`<button type="button" class="secondary small-btn" data-use-control-slot="${context}" data-slot-date="${esc(suggestionDate)}" data-slot-time="${esc(suggestionTime)}">Usar este horario</button>`:''}
  `;

  el.querySelector('[data-use-control-slot]')?.addEventListener('click',e=>{
    const btn=e.currentTarget;
    const dateInput=document.getElementById(ids.date);
    const timeInput=document.getElementById(ids.time);
    if(dateInput)dateInput.value=formatDateCL(btn.dataset.slotDate);
    if(timeInput)timeInput.value=btn.dataset.slotTime;
    checkControlAvailability(context,false);
  });
}

async function checkControlAvailability(context,showStatus=true){
  const ids=controlInputIds(context);
  const relation=controlContextIds(context);
  const dateEl=document.getElementById(ids.date);
  const timeEl=document.getElementById(ids.time);

  if(!relation.doctorId||!relation.patientId||!dateEl?.value||!timeEl?.value){
    clearControlAvailability(context);
    return null;
  }

  let controlDate;
  try{
    controlDate=requireDateCL(ids.date,'Fecha del control');
  }catch{
    clearControlAvailability(context);
    return null;
  }

  if(showStatus)setControlSyncStatus(context,'syncing','Verificando disponibilidad…');

  try{
    const result=await dbRpc('bodycare_check_control_slot',{
      p_doctor_user_id:relation.doctorId,
      p_patient_user_id:relation.patientId,
      p_control_date:controlDate,
      p_control_time:timeEl.value
    });
    renderControlAvailability(context,result,timeEl.value);
    if(showStatus){
      setControlSyncStatus(
        context,
        result?.available?'ok':'',
        result?.available?'Horario disponible':'Selecciona una alternativa disponible'
      );
    }
    return result;
  }catch(err){
    console.warn('Control availability check',err);
    if(showStatus)setControlSyncStatus(context,'error','No fue posible verificar la disponibilidad.');
    return null;
  }
}

function parseSlotUnavailable(message){
  const m=String(message||'').match(/SLOT_UNAVAILABLE\|([^|]*)\|([^|]*)\|(\d+)/i);
  if(!m)return null;
  return {
    available:false,
    reason:'OCCUPIED',
    suggested_date:m[1]||null,
    suggested_time:m[2]||null,
    slot_minutes:Number(m[3]||30)
  };
}

function bindControlAvailabilityEvents(context){
  const ids=controlInputIds(context);
  const dateEl=document.getElementById(ids.date);
  const timeEl=document.getElementById(ids.time);

  applyControlSlotStep(context);

  dateEl?.addEventListener('change',()=>{
    if(timeEl?.value)checkControlAvailability(context);
  });
  timeEl?.addEventListener('change',()=>checkControlAvailability(context));
}

function selectedPatientControlDoctorId(){
  const select=document.getElementById('patientControlDoctorSelect');
  if(select?.value)return select.value;
  const stored=localStorage.getItem('bodycare_selected_control_doctor');
  if(stored&&linkedDoctorProfiles.some(d=>d.user_id===stored))return stored;
  return linkedDoctorProfiles[0]?.user_id||null;
}

function formatControlDateTime(value){
  if(!value)return '—';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '—';

  const dateParts=new Intl.DateTimeFormat('es-CL',{
    timeZone:'America/Santiago',
    day:'2-digit',month:'2-digit',year:'numeric'
  }).formatToParts(d).reduce((acc,p)=>{acc[p.type]=p.value;return acc},{});

  const timeParts=new Intl.DateTimeFormat('es-CL',{
    timeZone:'America/Santiago',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(d).reduce((acc,p)=>{acc[p.type]=p.value;return acc},{});

  return `${dateParts.day}/${dateParts.month}/${dateParts.year} · ${timeParts.hour}:${timeParts.minute}`;
}

function controlCreatorLabel(c,context){
  if(c.created_by_user_id===currentUser.id)return 'Registrado por ti';
  return context==='doctor'?'Registrado por paciente':'Registrado por médico';
}

function controlStatusLabel(status){
  const labels={
    SCHEDULED:'Programado',
    CONFIRMED:'Confirmado',
    COMPLETED:'Completado',
    NO_SHOW:'No asistió',
    CANCELLED:'Cancelado'
  };
  return labels[status]||status||'Control';
}

function isActiveControl(c){
  return ['SCHEDULED','CONFIRMED'].includes(c?.status);
}

function controlActionMarkup(c,context){
  if(context==='patient'){
    if(c.status==='SCHEDULED'){
      return `<div class="control-card-actions">
        <button type="button" class="primary small-btn" data-confirm-control="${c.id}">Confirmar</button>
        <button type="button" class="secondary small-btn control-cancel-btn" data-cancel-control="${c.id}" data-control-context="patient">Cancelar</button>
      </div>`;
    }
    if(c.status==='CONFIRMED'){
      return `<div class="control-card-actions"><button type="button" class="secondary small-btn control-cancel-btn" data-cancel-control="${c.id}" data-control-context="patient">Cancelar</button></div>`;
    }
    return '';
  }

  if(context==='doctor'&&isActiveControl(c)){
    return `<div class="control-card-actions doctor-control-actions">
      <button type="button" class="primary small-btn" data-complete-control="${c.id}">Completar</button>
      <button type="button" class="secondary small-btn" data-no-show-control="${c.id}">No asistió</button>
      <button type="button" class="secondary small-btn control-cancel-btn" data-cancel-control="${c.id}" data-control-context="doctor">Cancelar</button>
    </div>`;
  }

  if(context==='doctor'&&['COMPLETED','NO_SHOW'].includes(c.status)){
    return `<div class="control-card-actions"><button type="button" class="secondary small-btn" data-next-control="${c.id}">Agendar próximo</button></div>`;
  }

  return '';
}

function controlCardMarkup(c,context){
  return `<div class="control-card control-card-${String(c.status||'').toLowerCase()}">
    <div class="control-card-main">
      <div class="control-date">${esc(formatControlDateTime(c.scheduled_at))}</div>
      <div class="control-meta">
        <span class="control-status ${String(c.status||'').toLowerCase()}">${controlStatusLabel(c.status)}</span>
        <span>${esc(controlCreatorLabel(c,context))}</span>
        <span>${validControlSlotMinutes(c.slot_minutes||30)} min</span>
      </div>
      ${c.notes?`<div class="control-notes">${esc(c.notes)}</div>`:''}
      ${c.status==='COMPLETED'&&c.outcome_summary?`<div class="control-outcome"><strong>Resumen del control</strong><span>${esc(c.outcome_summary)}</span></div>`:''}
      ${c.status==='NO_SHOW'?`<div class="control-outcome no-show-note"><span>Este control quedó registrado como no realizado.</span></div>`:''}
    </div>
    ${controlActionMarkup(c,context)}
  </div>`;
}

function controlListMarkup(rows,context){
  const all=[...(rows||[])].filter(c=>c.status!=='CANCELLED');
  const upcoming=all.filter(isActiveControl).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const history=all.filter(c=>['COMPLETED','NO_SHOW'].includes(c.status)).sort((a,b)=>String(b.scheduled_at).localeCompare(String(a.scheduled_at)));

  if(!all.length)return '<div class="empty-state">Aún no hay controles registrados.</div>';

  return `<div class="control-lifecycle-list">
    <div class="control-list-section">
      <div class="control-list-heading">Próximos controles <span>${upcoming.length}</span></div>
      ${upcoming.length?`<div class="control-list">${upcoming.map(c=>controlCardMarkup(c,context)).join('')}</div>`:'<div class="empty-state compact">No hay próximos controles.</div>'}
    </div>
    <div class="control-list-section control-history-section">
      <div class="control-list-heading">Historial de controles <span>${history.length}</span></div>
      ${history.length?`<div class="control-list">${history.map(c=>controlCardMarkup(c,context)).join('')}</div>`:'<div class="empty-state compact">Aún no hay controles completados.</div>'}
    </div>
  </div>`;
}

function setControlSyncStatus(context,state,text){
  const el=document.getElementById(context==='patient'?'patientControlSyncStatus':'doctorControlSyncStatus');
  if(!el)return;
  el.className=`control-sync-status ${state||''}`;
  const label=el.querySelector('span:last-child');
  if(label)label.textContent=text;
}

function bindControlActionButtons(root=document){
  root.querySelectorAll('[data-cancel-control]').forEach(btn=>{
    btn.addEventListener('click',()=>cancelSharedControl(btn.dataset.cancelControl,btn.dataset.controlContext));
  });
  root.querySelectorAll('[data-confirm-control]').forEach(btn=>{
    btn.addEventListener('click',()=>confirmPatientControl(btn.dataset.confirmControl));
  });
  root.querySelectorAll('[data-complete-control]').forEach(btn=>{
    btn.addEventListener('click',()=>openCompleteControlDialog(btn.dataset.completeControl));
  });
  root.querySelectorAll('[data-no-show-control]').forEach(btn=>{
    btn.addEventListener('click',()=>markDoctorControlNoShow(btn.dataset.noShowControl));
  });
  root.querySelectorAll('[data-next-control]').forEach(btn=>{
    btn.addEventListener('click',()=>prepareNextDoctorControl(btn.dataset.nextControl));
  });
}

function renderPatientControls(){
  const el=document.getElementById('patientControlList');
  if(!el)return;
  el.innerHTML=controlListMarkup(patientControls,'patient');
  bindControlActionButtons(el);
}

function renderDoctorControls(){
  const el=document.getElementById('doctorControlList');
  if(!el||!doctorPatientDetail)return;
  el.innerHTML=controlListMarkup(doctorPatientDetail.controls||[],'doctor');
  bindControlActionButtons(el);
}

async function syncPatientControls(){
  if(!hasRole('PATIENT'))return;
  if(patientControlsSyncing){
    patientControlsSyncPending=true;
    return;
  }

  const doctorId=selectedPatientControlDoctorId();
  if(!doctorId){
    patientControls=[];
    renderPatientControls();
    return;
  }

  patientControlsSyncing=true;
  setControlSyncStatus('patient','syncing','Actualizando controles…');

  try{
    do{
      patientControlsSyncPending=false;
      const requestedDoctor=selectedPatientControlDoctorId();
      if(!requestedDoctor)break;

      const rows=await dbRpc('bodycare_get_controls',{
        p_doctor_user_id:requestedDoctor,
        p_patient_user_id:currentUser.id
      });

      if(selectedPatientControlDoctorId()===requestedDoctor){
        patientControls=rows||[];
        renderPatientControls();
        setControlSyncStatus(
          'patient','ok',
          patientControls.length?`Sincronizado · ${patientControls.length} control${patientControls.length===1?'':'es'}`:'Sin controles registrados'
        );
      }
    }while(patientControlsSyncPending);
  }catch(err){
    console.warn('Patient controls sync',err);
    setControlSyncStatus('patient','error','No fue posible cargar los controles. Toca aquí para reintentar.');
  }finally{
    patientControlsSyncing=false;
  }
}

async function syncDoctorControls(patientId){
  if(!hasRole('DOCTOR')||!patientId)return;
  if(doctorControlsSyncing){
    doctorControlsSyncPending=true;
    return;
  }

  doctorControlsSyncing=true;
  setControlSyncStatus('doctor','syncing','Actualizando controles…');

  try{
    do{
      doctorControlsSyncPending=false;
      const rows=await dbRpc('bodycare_get_controls',{
        p_doctor_user_id:currentUser.id,
        p_patient_user_id:patientId
      });

      if(doctorPatientDetail?.profile?.user_id===patientId){
        doctorPatientDetail.controls=rows||[];
        renderDoctorControls();
        setControlSyncStatus(
          'doctor','ok',
          doctorPatientDetail.controls.length?`Sincronizado · ${doctorPatientDetail.controls.length} control${doctorPatientDetail.controls.length===1?'':'es'}`:'Sin controles registrados'
        );
      }
    }while(doctorControlsSyncPending);
  }catch(err){
    console.warn('Doctor controls sync',err);
    setControlSyncStatus('doctor','error','No fue posible cargar los controles. Toca aquí para reintentar.');
  }finally{
    doctorControlsSyncing=false;
  }
}

async function createPatientControl(e){
  e.preventDefault();
  const doctorId=document.getElementById('patientControlDoctorSelect')?.value;
  if(!doctorId)return;

  let controlDate;
  try{
    controlDate=requireDateCL('patientControlDate','Fecha del control');
  }catch(err){
    alert(err.message);
    return;
  }

  const controlTime=document.getElementById('patientControlTime')?.value;
  if(!controlTime){
    alert('Selecciona la hora del control.');
    return;
  }

  const notes=document.getElementById('patientControlNotes')?.value.trim()||null;

  const availability=await checkControlAvailability('patient',true);
  if(!availability?.available){
    if(!availability)setControlSyncStatus('patient','error','No fue posible verificar el horario.');
    return;
  }

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  setControlSyncStatus('patient','syncing','Registrando control…');

  try{
    const rows=await dbRpc('bodycare_create_control',{
      p_doctor_user_id:doctorId,
      p_patient_user_id:currentUser.id,
      p_control_date:controlDate,
      p_control_time:controlTime,
      p_notes:notes
    });
    const saved=Array.isArray(rows)?rows[0]:rows;
    if(!saved?.id)throw new Error('No se recibió confirmación del control.');

    patientControls=[
      ...patientControls.filter(c=>c.id!==saved.id),
      saved
    ].sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

    renderPatientControls();

    const patientDate=document.getElementById('patientControlDate');
    const patientTime=document.getElementById('patientControlTime');
    const patientNotes=document.getElementById('patientControlNotes');
    if(patientDate)patientDate.value=formatDateCL(today());
    if(patientTime)patientTime.value='';
    if(patientNotes)patientNotes.value='';
    clearControlAvailability('patient');

    setControlSyncStatus('patient','ok','Control registrado y compartido');
    showToast('Control registrado','Tu médico recibirá la actualización automáticamente.','NEW_CONTROL');
    syncPatientControls().catch(()=>{});
  }catch(err){
    const slot=parseSlotUnavailable(err.message);
    if(slot){
      renderControlAvailability('patient',slot,controlTime);
      setControlSyncStatus('patient','','Ese horario acaba de ocuparse. Elige la alternativa sugerida.');
    }else{
      setControlSyncStatus('patient','error','No se pudo registrar el control.');
      alert(err.message);
    }
  }finally{
    if(button)button.disabled=false;
  }
}

async function createDoctorControl(e){
  e.preventDefault();
  const patientId=doctorPatientDetail?.profile?.user_id;
  if(!patientId)return;

  let controlDate;
  try{
    controlDate=requireDateCL('doctorControlDate','Fecha del control');
  }catch(err){
    alert(err.message);
    return;
  }

  const controlTime=document.getElementById('doctorControlTime')?.value;
  if(!controlTime){
    alert('Selecciona la hora del control.');
    return;
  }

  const notes=document.getElementById('doctorControlNotes')?.value.trim()||null;

  const availability=await checkControlAvailability('doctor',true);
  if(!availability?.available){
    if(!availability)setControlSyncStatus('doctor','error','No fue posible verificar el horario.');
    return;
  }

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  setControlSyncStatus('doctor','syncing','Registrando control…');

  try{
    const rows=await dbRpc('bodycare_create_control',{
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:patientId,
      p_control_date:controlDate,
      p_control_time:controlTime,
      p_notes:notes
    });
    const saved=Array.isArray(rows)?rows[0]:rows;
    if(!saved?.id)throw new Error('No se recibió confirmación del control.');

    doctorPatientDetail.controls=[
      ...(doctorPatientDetail.controls||[]).filter(c=>c.id!==saved.id),
      saved
    ].sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

    renderDoctorControls();

    const doctorDate=document.getElementById('doctorControlDate');
    const doctorTime=document.getElementById('doctorControlTime');
    const doctorNotes=document.getElementById('doctorControlNotes');
    if(doctorDate)doctorDate.value=formatDateCL(today());
    if(doctorTime)doctorTime.value='';
    if(doctorNotes)doctorNotes.value='';
    clearControlAvailability('doctor');

    setControlSyncStatus('doctor','ok','Control registrado y compartido');
    showToast('Control registrado','El paciente recibirá la actualización automáticamente.','NEW_CONTROL');
    syncDoctorControls(patientId).catch(()=>{});
  }catch(err){
    const slot=parseSlotUnavailable(err.message);
    if(slot){
      renderControlAvailability('doctor',slot,controlTime);
      setControlSyncStatus('doctor','','Ese horario acaba de ocuparse. Elige la alternativa sugerida.');
    }else{
      setControlSyncStatus('doctor','error','No se pudo registrar el control.');
      alert(err.message);
    }
  }finally{
    if(button)button.disabled=false;
  }
}

async function confirmPatientControl(id){
  const item=patientControls.find(c=>c.id===id);
  if(!item||item.status!=='SCHEDULED')return;
  if(!confirm(`¿Confirmar asistencia al control del ${formatControlDateTime(item.scheduled_at)}?`))return;

  setControlSyncStatus('patient','syncing','Confirmando control…');
  try{
    const rows=await dbRpc('bodycare_confirm_control',{p_control_id:id});
    const saved=Array.isArray(rows)?rows[0]:rows;
    patientControls=patientControls.map(c=>c.id===id?(saved||{...c,status:'CONFIRMED'}):c);
    renderPatientControls();
    setControlSyncStatus('patient','ok','Control confirmado');
    showToast('Control confirmado','Tu médico recibió la confirmación.','CONTROL_CONFIRMED');
    syncPatientControls().catch(()=>{});
  }catch(err){
    setControlSyncStatus('patient','error','No fue posible confirmar el control.');
    alert(err.message);
  }
}

function closeCompleteControlDialog(){
  document.getElementById('completeControlOverlay')?.remove();
}

function openCompleteControlDialog(id){
  const item=(doctorPatientDetail?.controls||[]).find(c=>c.id===id);
  if(!item||!isActiveControl(item))return;
  closeCompleteControlDialog();

  const overlay=document.createElement('div');
  overlay.id='completeControlOverlay';
  overlay.className='control-outcome-overlay';
  overlay.innerHTML=`<div class="control-outcome-dialog" role="dialog" aria-modal="true" aria-labelledby="completeControlTitle">
    <div class="card-head">
      <div><h3 id="completeControlTitle">Completar control</h3><div class="muted">${esc(formatControlDateTime(item.scheduled_at))}</div></div>
      <button type="button" class="icon-button" data-close-control-outcome aria-label="Cerrar">×</button>
    </div>
    <label for="controlOutcomeSummary">Resumen compartido con el paciente <span class="muted">(opcional)</span></label>
    <textarea id="controlOutcomeSummary" rows="5" maxlength="3000" placeholder="Ej: evolución revisada, acuerdos de seguimiento y próximos pasos..."></textarea>
    <div class="clinical-settings-note">Este resumen será visible para el paciente. Evita incluir información que no quieras compartir en su portal.</div>
    <div class="form-actions" style="margin-top:12px">
      <button type="button" class="primary" id="saveCompletedControl">Guardar como completado</button>
      <button type="button" class="secondary" data-close-control-outcome>Cancelar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-control-outcome]').forEach(btn=>btn.addEventListener('click',closeCompleteControlDialog));
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeCompleteControlDialog()});
  document.getElementById('saveCompletedControl')?.addEventListener('click',()=>completeDoctorControl(id));
  setTimeout(()=>document.getElementById('controlOutcomeSummary')?.focus(),50);
}

async function completeDoctorControl(id){
  const summary=document.getElementById('controlOutcomeSummary')?.value.trim()||null;
  const button=document.getElementById('saveCompletedControl');
  if(button)button.disabled=true;
  try{
    const rows=await dbRpc('bodycare_complete_control',{p_control_id:id,p_outcome_summary:summary});
    const saved=Array.isArray(rows)?rows[0]:rows;
    if(doctorPatientDetail){
      doctorPatientDetail.controls=(doctorPatientDetail.controls||[]).map(c=>c.id===id?(saved||{...c,status:'COMPLETED',outcome_summary:summary}):c);
    }
    closeCompleteControlDialog();
    renderDoctorControls();
    setControlSyncStatus('doctor','ok','Control completado y compartido');
    showToast('Control completado','El resumen quedó disponible para el paciente.','CONTROL_COMPLETED');
    syncDoctorAgenda(false).catch(()=>{});
    syncDoctorControls(doctorPatientDetail?.profile?.user_id).catch(()=>{});
  }catch(err){
    if(button)button.disabled=false;
    alert('No fue posible completar el control: '+err.message);
  }
}

async function markDoctorControlNoShow(id){
  const item=(doctorPatientDetail?.controls||[]).find(c=>c.id===id);
  if(!item||!isActiveControl(item))return;
  if(!confirm(`¿Registrar que el paciente no asistió al control del ${formatControlDateTime(item.scheduled_at)}?`))return;

  setControlSyncStatus('doctor','syncing','Registrando inasistencia…');
  try{
    const rows=await dbRpc('bodycare_mark_control_no_show',{p_control_id:id});
    const saved=Array.isArray(rows)?rows[0]:rows;
    doctorPatientDetail.controls=(doctorPatientDetail.controls||[]).map(c=>c.id===id?(saved||{...c,status:'NO_SHOW'}):c);
    renderDoctorControls();
    setControlSyncStatus('doctor','ok','Inasistencia registrada');
    showToast('Control no realizado','El paciente fue informado y puede coordinar una nueva fecha.','CONTROL_NO_SHOW');
    syncDoctorAgenda(false).catch(()=>{});
    syncDoctorControls(doctorPatientDetail.profile.user_id).catch(()=>{});
  }catch(err){
    setControlSyncStatus('doctor','error','No fue posible registrar la inasistencia.');
    alert(err.message);
  }
}

function prepareNextDoctorControl(id){
  const item=(doctorPatientDetail?.controls||[]).find(c=>c.id===id);
  const date=document.getElementById('doctorControlDate');
  const time=document.getElementById('doctorControlTime');
  const notes=document.getElementById('doctorControlNotes');
  if(date){
    date.value=formatDateCL(today());
    date.dataset.isoDate=today();
  }
  if(time)time.value='';
  if(notes&&!notes.value)notes.value=item?.status==='NO_SHOW'?'Reagendamiento de control':'Próximo control de seguimiento';
  clearControlAvailability('doctor');
  document.getElementById('doctorControlForm')?.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.getElementById('doctorControlTime')?.focus(),250);
}

async function cancelSharedControl(id,context){
  const source=context==='doctor'?(doctorPatientDetail?.controls||[]):patientControls;
  const item=source.find(c=>c.id===id);
  if(!item||!isActiveControl(item))return;

  if(!confirm(`¿Cancelar el control del ${formatControlDateTime(item.scheduled_at)}? El otro usuario será notificado.`))return;

  const previous=[...source];

  if(context==='doctor'){
    doctorPatientDetail.controls=source.filter(c=>c.id!==id);
    renderDoctorControls();
    setControlSyncStatus('doctor','syncing','Cancelando control…');
  }else{
    patientControls=source.filter(c=>c.id!==id);
    renderPatientControls();
    setControlSyncStatus('patient','syncing','Cancelando control…');
  }

  try{
    await dbRpc('bodycare_cancel_control',{p_control_id:id});

    if(context==='doctor'){
      renderDoctorControls();
      setControlSyncStatus('doctor','ok','Control cancelado · horario liberado');
      syncDoctorControls(doctorPatientDetail.profile.user_id).catch(()=>{});
      if(document.getElementById('doctorControlTime')?.value)checkControlAvailability('doctor',false);
    }else{
      renderPatientControls();
      setControlSyncStatus('patient','ok','Control cancelado · horario liberado');
      syncPatientControls().catch(()=>{});
      if(document.getElementById('patientControlTime')?.value)checkControlAvailability('patient',false);
    }

    showToast('Control cancelado','La otra persona recibió la actualización.','CONTROL_CANCELLED');
  }catch(err){
    if(context==='doctor'){
      doctorPatientDetail.controls=previous;
      renderDoctorControls();
      setControlSyncStatus('doctor','error','No se pudo cancelar. Se restauró el control.');
    }else{
      patientControls=previous;
      renderPatientControls();
      setControlSyncStatus('patient','error','No se pudo cancelar. Se restauró el control.');
    }
    alert(err.message);
  }
}

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

  document.getElementById('patientDoctorSelect')?.addEventListener('change',e=>{
    localStorage.setItem('pesocare_selected_doctor',e.target.value);
    patientMessages=[];
    renderPatientMessageThread();
    syncPatientMessages();
    syncPatientPrescriptions();
  });
  document.getElementById('patientMessageForm')?.addEventListener('submit',sendPatientMessage);
  document.getElementById('patientClearConversation')?.addEventListener('click',()=>{
    const doctorId=document.getElementById('patientDoctorSelect')?.value;
    if(doctorId)clearConversation(doctorId,currentUser.id,'patient');
  });
  document.getElementById('patientChatSyncStatus')?.addEventListener('click',()=>syncPatientMessages());
  document.getElementById('patientPrescriptionSyncStatus')?.addEventListener('click',()=>syncPatientPrescriptions());

  document.getElementById('patientControlDoctorSelect')?.addEventListener('change',e=>{
    localStorage.setItem('bodycare_selected_control_doctor',e.target.value);
    patientControls=[];
    renderPatientControls();
    applyControlSlotStep('patient');
    clearControlAvailability('patient');
    syncPatientControls();
    if(document.getElementById('patientControlTime')?.value)checkControlAvailability('patient');
  });
  bindControlAvailabilityEvents('patient');
  document.getElementById('patientControlForm')?.addEventListener('submit',createPatientControl);
  document.getElementById('patientControlSyncStatus')?.addEventListener('click',()=>syncPatientControls());
  bindDateCLInputs();

  document.getElementById('supportForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const msg=document.getElementById('supportMsg');msg.textContent='';
    try{
      await dbInsert('support_tickets',{
        user_id:currentUser.id,
        subject:document.getElementById('supportSubject').value.trim(),
        description:document.getElementById('supportDescription').value.trim(),
        technical_context:{user_agent:navigator.userAgent,url:location.href,app_version:'BodyCare v24.1'}
      });
      msg.className='notice success';msg.textContent='Solicitud enviada a BodyCare Admin.';
      e.target.reset();
      await syncSupportTickets();
    }catch(err){msg.textContent=err.message}
  });
}

function supportTicketListMarkup(){
  return supportTickets.length
    ? supportTickets.map(t=>`
      <div class="support-ticket-card">
        <div class="support-ticket-head">
          <strong>${esc(t.subject)}</strong>
          <span class="status-chip status-${String(t.status).toLowerCase()}">${esc(t.status)}</span>
        </div>
        <div class="muted">${formatDateTime(t.created_at)}</div>
        <div class="support-ticket-description">${esc(t.description||'')}</div>
      </div>`).join('')
    : '<div class="empty-state">Aún no tienes solicitudes de soporte.</div>';
}

function renderSupportTickets(){
  const el=document.getElementById('supportTicketList');
  if(el)el.innerHTML=supportTicketListMarkup();
}

async function syncSupportTickets(){
  const seq=++supportSyncSeq;
  if(!hasRole('PATIENT'))return;
  try{
    const rows=await dbGet(`support_tickets?select=*&user_id=eq.${encodeURIComponent(currentUser.id)}&order=created_at.desc`)||[];
    if(seq!==supportSyncSeq)return;
    supportTickets=rows;
    renderSupportTickets();
  }catch(err){console.warn('Support sync',err)}
}

function setPrescriptionSyncStatus(context,state,text){
  const el=document.getElementById(context==='patient'?'patientPrescriptionSyncStatus':'doctorPrescriptionSyncStatus');
  if(!el)return;
  el.className=`rx-sync-status ${state||''}`;
  const label=el.querySelector('span:last-child');
  if(label)label.textContent=text;
}

function patientPrescriptionListMarkup(){
  const active=(patientPrescriptions||[]).filter(p=>!p.deleted_at&&p.status==='SHARED');
  return active.length
    ? active.map(p=>`
      <div class="prescription-card">
        <div class="prescription-title">${esc(p.medication_name)}</div>
        <div><strong>Dosis:</strong> ${esc(p.dose_text)}</div>
        ${p.active_ingredient?`<div><strong>Principio activo:</strong> ${esc(p.active_ingredient)}</div>`:''}
        ${p.route_text?`<div><strong>Vía:</strong> ${esc(p.route_text)}</div>`:''}
        <div><strong>Frecuencia:</strong> ${esc(p.frequency_text)}</div>
        ${p.duration_text?`<div><strong>Duración:</strong> ${esc(p.duration_text)}</div>`:''}
        ${p.instructions?`<div class="muted">${esc(p.instructions)}</div>`:''}
        <div class="small-muted">Versión ${p.revision||1} · integración legal pendiente</div>
      </div>`).join('')
    : '<div class="empty-state">No tienes indicaciones compartidas.</div>';
}

function renderPatientPrescriptionList(){
  const el=document.getElementById('patientPrescriptionList');
  if(el)el.innerHTML=patientPrescriptionListMarkup();
}

function markVisibleMedicalNotifications(){
  const selectedDoctor=document.getElementById('patientDoctorSelect')?.value;
  const selectedControlDoctor=selectedPatientControlDoctorId();
  const ids=[];

  notifications.filter(n=>isActionableUnread(n)&&[
    'NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'
  ].includes(n.type)).forEach(n=>ids.push(n.id));

  if(selectedDoctor){
    notifications.filter(n=>isActionableUnread(n)&&[
      'NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'
    ].includes(n.type)&&n.related_user_id===selectedDoctor).forEach(n=>ids.push(n.id));
  }

  if(selectedControlDoctor){
    notifications.filter(n=>isActionableUnread(n)&&[
      'NEW_CONTROL','CONTROL_CANCELLED','CONTROL_COMPLETED','CONTROL_NO_SHOW'
    ].includes(n.type)&&n.related_user_id===selectedControlDoctor).forEach(n=>ids.push(n.id));
  }

  [...new Set(ids)].forEach(id=>markNotificationRead(id));
  updateHeaderNotificationUI();
}

function selectedPatientDoctorId(){
  const select=document.getElementById('patientDoctorSelect');
  if(select?.value)return select.value;
  const stored=localStorage.getItem('pesocare_selected_doctor');
  if(stored&&linkedDoctorProfiles.some(d=>d.user_id===stored))return stored;
  return linkedDoctorProfiles[0]?.user_id||null;
}

function setChatSyncStatus(context,state,text){
  const el=document.getElementById(context==='patient'?'patientChatSyncStatus':'doctorChatSyncStatus');
  if(!el)return;
  el.className=`chat-sync-status ${state||''}`;
  const label=el.querySelector('span:last-child');
  if(label)label.textContent=text;
}

async function syncPatientMessages(){
  if(!hasRole('PATIENT'))return;
  if(patientMessagesSyncing){
    patientMessagesSyncPending=true;
    return;
  }

  const initialDoctor=selectedPatientDoctorId();
  if(!initialDoctor){
    patientMessages=[];
    renderPatientMessageThread();
    return;
  }

  patientMessagesSyncing=true;
  setChatSyncStatus('patient','syncing','Actualizando conversación…');

  try{
    do{
      patientMessagesSyncPending=false;
      const requestedDoctor=selectedPatientDoctorId();
      if(!requestedDoctor)break;

      const rows=await dbRpc('bodycare_get_conversation',{
        p_doctor_user_id:requestedDoctor,
        p_patient_user_id:currentUser.id
      });

      if(selectedPatientDoctorId()===requestedDoctor){
        patientMessages=(rows||[])
          .filter(m=>!m.deleted_at)
          .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
        renderPatientMessageThread();
        setChatSyncStatus('patient','ok',`Sincronizado · ${patientMessages.length} mensaje${patientMessages.length===1?'':'s'}`);
      }
    }while(patientMessagesSyncPending);
  }catch(err){
    console.warn('Patient messages sync',err);
    setChatSyncStatus('patient','error','No fue posible cargar la conversación. Toca aquí para reintentar.');
  }finally{
    patientMessagesSyncing=false;
  }
}

async function syncPatientPrescriptions(){
  if(!hasRole('PATIENT'))return;
  if(patientPrescriptionsSyncing){
    patientPrescriptionsSyncPending=true;
    return;
  }
  patientPrescriptionsSyncing=true;
  setPrescriptionSyncStatus('patient','syncing','Actualizando indicaciones…');
  try{
    do{
      patientPrescriptionsSyncPending=false;
      const doctorIds=linkedDoctorProfiles.map(d=>d.user_id);
      if(!doctorIds.length){
        patientPrescriptions=[];
        renderPatientPrescriptionList();
        setPrescriptionSyncStatus('patient','ok','Sin indicaciones compartidas');
        break;
      }
      const results=await Promise.all(
        doctorIds.map(doctorId=>dbRpc('bodycare_get_prescriptions',{
          p_doctor_user_id:doctorId,
          p_patient_user_id:currentUser.id
        }).catch(()=>[]))
      );
      patientPrescriptions=results.flat()
        .filter(p=>p&&!p.deleted_at&&p.status==='SHARED')
        .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
      renderPatientPrescriptionList();
      setPrescriptionSyncStatus(
        'patient','ok',
        patientPrescriptions.length
          ? `Sincronizado · ${patientPrescriptions.length} indicación${patientPrescriptions.length===1?'':'es'}`
          : 'Sin indicaciones compartidas'
      );
    }while(patientPrescriptionsSyncPending);
  }catch(err){
    console.warn('Patient prescriptions sync',err);
    setPrescriptionSyncStatus('patient','error','No fue posible cargar las indicaciones. Toca aquí para reintentar.');
  }finally{
    patientPrescriptionsSyncing=false;
  }
}

async function syncPatientMedicalData(){
  await Promise.allSettled([syncPatientMessages(),syncPatientPrescriptions(),syncPatientControls()]);
}

async function syncPatientConversation(){return syncPatientMessages()}

async function syncDoctorMessages(patientId){
  if(!hasRole('DOCTOR')||!patientId)return;
  if(doctorMessagesSyncing){
    doctorMessagesSyncPending=true;
    return;
  }

  doctorMessagesSyncing=true;
  setChatSyncStatus('doctor','syncing','Actualizando conversación…');

  try{
    do{
      doctorMessagesSyncPending=false;

      const rows=await dbRpc('bodycare_get_conversation',{
        p_doctor_user_id:currentUser.id,
        p_patient_user_id:patientId
      });

      if(doctorPatientDetail?.profile?.user_id===patientId){
        doctorPatientDetail.messages=(rows||[])
          .filter(m=>!m.deleted_at)
          .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
        renderDoctorMessageThread();
        setChatSyncStatus('doctor','ok',`Sincronizado · ${doctorPatientDetail.messages.length} mensaje${doctorPatientDetail.messages.length===1?'':'s'}`);
      }
    }while(doctorMessagesSyncPending);
  }catch(err){
    console.warn('Doctor messages sync',err);
    setChatSyncStatus('doctor','error','No fue posible cargar la conversación. Toca aquí para reintentar.');
  }finally{
    doctorMessagesSyncing=false;
  }
}

async function syncDoctorPrescriptions(patientId){
  if(!hasRole('DOCTOR')||!patientId)return;
  if(doctorPrescriptionsSyncing){
    doctorPrescriptionsSyncPending=true;
    return;
  }
  doctorPrescriptionsSyncing=true;
  setPrescriptionSyncStatus('doctor','syncing','Actualizando indicaciones…');
  try{
    do{
      doctorPrescriptionsSyncPending=false;
      const rows=await dbRpc('bodycare_get_prescriptions',{
        p_doctor_user_id:currentUser.id,
        p_patient_user_id:patientId
      });
      if(doctorPatientDetail?.profile?.user_id===patientId){
        doctorPatientDetail.prescriptions=(rows||[])
          .filter(p=>p&&!p.deleted_at)
          .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
        renderDoctorPrescriptionList();
        setPrescriptionSyncStatus(
          'doctor','ok',
          doctorPatientDetail.prescriptions.length
            ? `Sincronizado · ${doctorPatientDetail.prescriptions.length} indicación${doctorPatientDetail.prescriptions.length===1?'':'es'}`
            : 'Sin indicaciones creadas'
        );
      }
    }while(doctorPrescriptionsSyncPending);
  }catch(err){
    console.warn('Doctor prescriptions sync',err);
    setPrescriptionSyncStatus('doctor','error','No fue posible cargar las indicaciones. Toca aquí para reintentar.');
  }finally{
    doctorPrescriptionsSyncing=false;
  }
}

async function syncDoctorMedicalData(patientId){
  await Promise.allSettled([syncDoctorMessages(patientId),syncDoctorPrescriptions(patientId),syncDoctorControls(patientId),syncDoctorCarePlan(patientId,true),syncDoctorNutrition(patientId,true)]);
  await syncDoctorTimeline(true,false);

  if(doctorPatientDetail?.profile?.user_id===patientId){
    notifications.filter(n=>
      isActionableUnread(n) &&
      DOCTOR_PATIENT_CONTEXT_NOTIFICATION_TYPES.includes(n.type) &&
      n.related_user_id===patientId
    ).forEach(n=>markNotificationRead(n.id));
  }
}

async function syncDoctorConversation(patientId){return syncDoctorMessages(patientId)}


function renderPatientMessageThread(){
  const select=document.getElementById('patientDoctorSelect');
  const el=document.getElementById('patientMessageThread');
  if(!select||!el)return;
  const doctorId=select.value;
  localStorage.setItem('pesocare_selected_doctor',doctorId);
  notifications.filter(n=>!n.read_at&&['NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'].includes(n.type)&&n.related_user_id===doctorId).forEach(n=>markNotificationRead(n.id));
  const messages=patientMessages.filter(m=>m.doctor_user_id===doctorId&&!m.deleted_at);
  el.innerHTML=messages.length?messages.map(m=>`
    <div class="message-bubble ${m.sender_user_id===currentUser.id?'mine':'theirs'} ${m.pending?'pending-message':''}">
      <div>${esc(m.message)}</div>
      <div class="message-meta"><span>${m.pending?'Enviando…':formatDateTime(m.created_at)}</span>${m.sender_user_id===currentUser.id&&!m.pending?`<button type="button" class="message-delete" data-delete-message="${m.id}" data-message-context="patient">Eliminar</button>`:''}</div>
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

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;

  const tempId=`pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pendingRow={
    id:tempId,
    doctor_user_id:doctorId,
    patient_user_id:currentUser.id,
    sender_user_id:currentUser.id,
    message,
    created_at:new Date().toISOString(),
    pending:true
  };

  patientMessages=[
    ...patientMessages.filter(m=>!String(m.id).startsWith('pending-')),
    pendingRow
  ].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));

  input.value='';
  renderPatientMessageThread();
  setChatSyncStatus('patient','syncing','Enviando mensaje…');

  try{
    const rows=await dbRpc('bodycare_send_message',{
      p_doctor_user_id:doctorId,
      p_patient_user_id:currentUser.id,
      p_message:message
    });

    const saved=Array.isArray(rows)?rows[0]:rows;

    patientMessages=patientMessages.filter(m=>m.id!==tempId);
    if(saved?.id){
      patientMessages=[
        ...patientMessages.filter(m=>m.id!==saved.id),
        saved
      ].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    }

    renderPatientMessageThread();
    setChatSyncStatus('patient','ok','Mensaje enviado');
    await syncPatientMessages();
  }catch(err){
    patientMessages=patientMessages.filter(m=>m.id!==tempId);
    renderPatientMessageThread();
    input.value=message;
    setChatSyncStatus('patient','error','No se pudo enviar. Toca aquí para reintentar.');
    alert(err.message);
  }finally{
    if(button)button.disabled=false;
  }
}



function chileDateFromTimestamp(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Santiago',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d).reduce((acc,p)=>{acc[p.type]=p.value;return acc},{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function chileTimeFromTimestamp(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('es-CL',{
    timeZone:'America/Santiago',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(d).reduce((acc,p)=>{acc[p.type]=p.value;return acc},{});
  return `${parts.hour}:${parts.minute}`;
}

function agendaDateLabel(dateIso){
  if(!dateIso)return '';
  const [y,m,d]=dateIso.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  const label=new Intl.DateTimeFormat('es-CL',{
    weekday:'long',day:'numeric',month:'long',timeZone:'UTC'
  }).format(dt);
  return label.replace(/^./,c=>c.toUpperCase());
}

function doctorAgendaRows(){
  const todayIso=today();
  const rows=[...(doctorAgenda||[])].sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  return doctorAgendaMode==='TODAY'
    ? rows.filter(c=>chileDateFromTimestamp(c.scheduled_at)===todayIso)
    : rows;
}

function doctorAgendaCounts(){
  const todayIso=today();
  const rows=doctorAgenda||[];
  return {
    today:rows.filter(c=>chileDateFromTimestamp(c.scheduled_at)===todayIso).length,
    week:rows.length
  };
}

function agendaCreatorText(item){
  return item.created_by_user_id===currentUser.id?'Agendado por ti':'Agendado por paciente';
}

function doctorAgendaMarkup(){
  const rows=doctorAgendaRows();
  if(!rows.length){
    return `<div class="agenda-empty">
      <span class="agenda-empty-icon">🗓️</span>
      <strong>${doctorAgendaMode==='TODAY'?'Sin controles para hoy':'Sin controles en los próximos 7 días'}</strong>
      <span>Los nuevos controles aparecerán aquí automáticamente.</span>
    </div>`;
  }

  let lastDate='';
  return `<div class="doctor-agenda-list">${rows.map(item=>{
    const dateIso=chileDateFromTimestamp(item.scheduled_at);
    const priority=priorityForPatient(item.patient_user_id);
    const dateHeader=dateIso!==lastDate;
    lastDate=dateIso;

    return `${dateHeader?`<div class="agenda-date-heading">${agendaDateLabel(dateIso)}</div>`:''}
      <div class="agenda-row">
        <div class="agenda-time-block">
          <strong>${esc(chileTimeFromTimestamp(item.scheduled_at))}</strong>
          <span>${Number(item.slot_minutes||30)} min</span>
        </div>
        <div class="agenda-patient">
          <div class="agenda-patient-title">
            <strong>${esc(item.patient_name||'Paciente')}</strong>
            <span class="control-status ${String(item.status||'SCHEDULED').toLowerCase()}">${controlStatusLabel(item.status)}</span>
            <span class="priority-chip ${String(priority.priority||'GREEN').toLowerCase()}">${priorityLabel(priority.priority||'GREEN')}</span>
          </div>
          <div class="agenda-meta">${esc(agendaCreatorText(item))}${item.notes?` · ${esc(item.notes)}`:''}</div>
        </div>
        <button type="button" class="secondary small-btn agenda-open-patient" data-open-agenda-patient="${item.patient_user_id}">Abrir paciente</button>
      </div>`;
  }).join('')}</div>`;
}

function renderDoctorAgenda(){
  const counts=doctorAgendaCounts();
  const todayCount=document.getElementById('agendaTodayCount');
  const weekCount=document.getElementById('agendaWeekCount');
  if(todayCount)todayCount.textContent=String(counts.today);
  if(weekCount)weekCount.textContent=String(counts.week);

  document.querySelectorAll('[data-agenda-mode]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.agendaMode===doctorAgendaMode);
  });

  const list=document.getElementById('doctorAgendaList');
  if(list){
    list.innerHTML=doctorAgendaMarkup();
    list.querySelectorAll('[data-open-agenda-patient]').forEach(btn=>{
      btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openAgendaPatient));
    });
  }

  const status=document.getElementById('doctorAgendaStatus');
  if(status){
    status.textContent=doctorAgendaSyncing?'Actualizando…':'Actualizado';
    status.classList.toggle('syncing',doctorAgendaSyncing);
  }
}

async function syncDoctorAgenda(renderUI=true){
  if(!hasRole('DOCTOR')||doctorAgendaSyncing)return;
  doctorAgendaSyncing=true;
  if(renderUI)renderDoctorAgenda();

  try{
    doctorAgenda=await dbRpc('bodycare_get_doctor_agenda',{
      p_start_date:today(),
      p_days:7
    })||[];
  }catch(err){
    console.warn('Doctor agenda sync failed',err);
  }finally{
    doctorAgendaSyncing=false;
    if(renderUI)renderDoctorAgenda();
  }
}


function outcomeNumber(value,digits=1){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function outcomePercent(value,digits=0){
  const n=outcomeNumber(value,digits);
  if(n===null)return '—';
  return `${n.toLocaleString('es-CL',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
}

function outcomeSigned(value,suffix='',digits=1){
  const n=outcomeNumber(value,digits);
  if(n===null)return '—';
  const text=Math.abs(n).toLocaleString('es-CL',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  return `${n>0?'+':n<0?'−':''}${text}${suffix}`;
}

function doctorOutcomeSummary(){
  const rows=doctorOutcomes||[];
  const weightRows=rows.filter(r=>outcomeNumber(r.weight_change_pct)!==null);
  const waistRows=rows.filter(r=>outcomeNumber(r.waist_change_cm)!==null);
  const adherenceRows=rows.filter(r=>outcomeNumber(r.record_adherence_pct_28d)!==null);
  const attendanceRows=rows.filter(r=>outcomeNumber(r.attendance_pct)!==null);

  const avg=items=>items.length?items.reduce((s,v)=>s+v,0)/items.length:null;

  return {
    patients:rows.length,
    avgWeightPct:avg(weightRows.map(r=>Number(r.weight_change_pct))),
    achieved5:rows.filter(r=>r.achieved_5pct===true).length,
    avgAdherence:avg(adherenceRows.map(r=>Number(r.record_adherence_pct_28d))),
    avgAttendance:avg(attendanceRows.map(r=>Number(r.attendance_pct))),
    avgWaist:avg(waistRows.map(r=>Number(r.waist_change_cm)))
  };
}

function outcomeForPatient(patientId){
  return (doctorOutcomes||[]).find(r=>r.patient_user_id===patientId)||null;
}

function goalProgressPct(row){
  const initial=outcomeNumber(row?.initial_weight);
  const current=outcomeNumber(row?.current_weight);
  const target=outcomeNumber(row?.target_weight);
  if(initial===null||current===null||target===null||initial===target)return null;
  const pct=((initial-current)/(initial-target))*100;
  return Math.max(0,Math.min(100,pct));
}

function outcomePriority(row){
  return priorityForPatient(row.patient_user_id);
}

function outcomeFilterMatches(row){
  const priority=outcomePriority(row);
  const adherence=outcomeNumber(row.record_adherence_pct_28d)||0;
  if(doctorOutcomeFilter==='PRIORITY'&&!['RED','ORANGE'].includes(priority.priority))return false;
  if(doctorOutcomeFilter==='ACHIEVED5'&&row.achieved_5pct!==true)return false;
  if(doctorOutcomeFilter==='LOW_ADHERENCE'&&adherence>=50)return false;

  const q=String(doctorOutcomeSearch||'').trim().toLocaleLowerCase('es-CL');
  if(q&&!String(row.patient_name||'').toLocaleLowerCase('es-CL').includes(q))return false;
  return true;
}

function outcomeStatusText(row){
  const adherence=outcomeNumber(row.record_adherence_pct_28d);
  const attendance=outcomeNumber(row.attendance_pct);
  const parts=[];
  if(adherence!==null)parts.push(`Registros ${outcomePercent(adherence,0)}`);
  if(attendance!==null)parts.push(`Asistencia ${outcomePercent(attendance,0)}`);
  return parts.join(' · ')||'Sin métricas suficientes';
}

function nextControlText(value){
  if(!value)return 'Sin próximo control';
  const d=chileDateFromTimestamp(value);
  const t=chileTimeFromTimestamp(value);
  return `${fmt(d)} · ${t}`;
}

function outcomeRowMarkup(row){
  const priority=outcomePriority(row);
  const changePct=outcomeNumber(row.weight_change_pct);
  const adherence=outcomeNumber(row.record_adherence_pct_28d);
  const attendance=outcomeNumber(row.attendance_pct);
  return `<div class="outcome-patient-row">
    <div class="outcome-patient-identity">
      <div class="outcome-patient-name">
        <strong>${esc(row.patient_name||'Paciente')}</strong>
        <span class="priority-chip ${String(priority.priority||'GREEN').toLowerCase()}">${priorityLabel(priority.priority||'GREEN')}</span>
      </div>
      <span>${row.latest_record_date?`Último registro ${fmt(row.latest_record_date)}`:'Sin registro reciente'}</span>
    </div>
    <div class="outcome-cell">
      <span>Peso actual</span>
      <strong>${row.current_weight!==null&&row.current_weight!==undefined?kg(row.current_weight):'—'}</strong>
      <small>${changePct===null?'Sin comparación':`${outcomeSigned(row.weight_change_kg,' kg',2)} · ${outcomeSigned(changePct,'%',1)}`}</small>
    </div>
    <div class="outcome-cell">
      <span>Cintura</span>
      <strong>${row.current_waist!==null&&row.current_waist!==undefined?cm(row.current_waist):'—'}</strong>
      <small>${outcomeSigned(row.waist_change_cm,' cm',1)}</small>
    </div>
    <div class="outcome-cell">
      <span>Adherencia 4 sem</span>
      <strong>${adherence===null?'—':outcomePercent(adherence,0)}</strong>
      <div class="outcome-progress"><i style="width:${Math.max(0,Math.min(100,adherence||0))}%"></i></div>
    </div>
    <div class="outcome-cell">
      <span>Asistencia 90 días</span>
      <strong>${attendance===null?'—':outcomePercent(attendance,0)}</strong>
      <small>${Number(row.completed_controls||0)} completados · ${Number(row.no_show_controls||0)} inasist.</small>
    </div>
    <div class="outcome-cell outcome-next-control">
      <span>Próximo control</span>
      <strong>${esc(nextControlText(row.next_control_at))}</strong>
    </div>
    <button type="button" class="primary small-btn outcome-open-btn" data-open-outcome-patient="${row.patient_user_id}">Abrir</button>
  </div>`;
}

function doctorOutcomesMarkup(){
  const rows=(doctorOutcomes||[]).filter(outcomeFilterMatches);
  if(!doctorOutcomes.length)return '<div class="empty-state">Aún no hay pacientes con datos para analizar.</div>';
  if(!rows.length)return '<div class="empty-state">No hay pacientes que coincidan con este filtro.</div>';
  return `<div class="outcome-patient-list">${rows.map(outcomeRowMarkup).join('')}</div>`;
}

function outcomeWeightBarsMarkup(){
  const rows=(doctorOutcomes||[])
    .filter(r=>outcomeNumber(r.weight_change_pct)!==null)
    .sort((a,b)=>Number(a.weight_change_pct)-Number(b.weight_change_pct))
    .slice(0,12);

  if(!rows.length)return '<div class="empty-state">Sin datos suficientes para comparar cambios de peso.</div>';

  const maxAbs=Math.max(5,...rows.map(r=>Math.abs(Number(r.weight_change_pct))));
  return `<div class="outcome-bars">${rows.map(r=>{
    const value=Number(r.weight_change_pct);
    const width=Math.max(2,Math.min(100,Math.abs(value)/maxAbs*100));
    return `<div class="outcome-bar-row">
      <span class="outcome-bar-name">${esc(r.patient_name||'Paciente')}</span>
      <div class="outcome-bar-track"><i class="${value<=0?'loss':'gain'}" style="width:${width}%"></i></div>
      <strong>${outcomeSigned(value,'%',1)}</strong>
    </div>`;
  }).join('')}</div>`;
}

function doctorOutcomesSectionMarkup(){
  const s=doctorOutcomeSummary();
  return `<section class="card outcomes-dashboard-card" id="doctorOutcomesSection">
    <div class="card-head">
      <div>
        <h2 class="section-title">Resultados y adherencia</h2>
        <div class="muted">Vista descriptiva de evolución y participación de pacientes vinculados.</div>
      </div>
      <span class="clinical-disclaimer">Apoyo al seguimiento · no diagnóstico</span>
    </div>

    <div class="outcome-kpis">
      <div class="outcome-kpi"><span>Pacientes activos</span><strong>${s.patients}</strong><small>Cartera vinculada</small></div>
      <div class="outcome-kpi"><span>Cambio peso promedio</span><strong>${s.avgWeightPct===null?'—':outcomeSigned(s.avgWeightPct,'%',1)}</strong><small>Desde inicio del plan</small></div>
      <div class="outcome-kpi"><span>Reducción ≥5%</span><strong>${s.achieved5}</strong><small>Pacientes</small></div>
      <div class="outcome-kpi"><span>Adherencia registros</span><strong>${s.avgAdherence===null?'—':outcomePercent(s.avgAdherence,0)}</strong><small>Promedio últimas 4 sem.</small></div>
      <div class="outcome-kpi"><span>Asistencia controles</span><strong>${s.avgAttendance===null?'—':outcomePercent(s.avgAttendance,0)}</strong><small>Últimos 90 días</small></div>
      <div class="outcome-kpi"><span>Cambio cintura promedio</span><strong>${s.avgWaist===null?'—':outcomeSigned(s.avgWaist,' cm',1)}</strong><small>Desde línea basal</small></div>
    </div>

    <div class="outcomes-grid">
      <div class="outcomes-visual-card">
        <div class="outcomes-subhead">
          <div><strong>Cambio de peso por paciente</strong><span>Variación porcentual desde el inicio</span></div>
        </div>
        ${outcomeWeightBarsMarkup()}
      </div>

      <div class="outcomes-visual-card">
        <div class="outcomes-subhead">
          <div><strong>Lectura de indicadores</strong><span>Criterios transparentes utilizados por BodyCare</span></div>
        </div>
        <div class="outcome-method-list">
          <div><b>Adherencia de registros</b><span>Semanas con ≥1 registro durante las últimas 4 semanas.</span></div>
          <div><b>Asistencia</b><span>Completados ÷ (completados + no asistió) en los últimos 90 días.</span></div>
          <div><b>Reducción ≥5%</b><span>Comparación entre peso inicial y último peso registrado.</span></div>
        </div>
      </div>
    </div>

    <div class="outcome-patient-toolbar">
      <div class="outcome-filter-buttons">
        <button type="button" class="outcome-filter-btn ${doctorOutcomeFilter==='ALL'?'active':''}" data-outcome-filter="ALL">Todos</button>
        <button type="button" class="outcome-filter-btn ${doctorOutcomeFilter==='PRIORITY'?'active':''}" data-outcome-filter="PRIORITY">Prioridad</button>
        <button type="button" class="outcome-filter-btn ${doctorOutcomeFilter==='ACHIEVED5'?'active':''}" data-outcome-filter="ACHIEVED5">≥5%</button>
        <button type="button" class="outcome-filter-btn ${doctorOutcomeFilter==='LOW_ADHERENCE'?'active':''}" data-outcome-filter="LOW_ADHERENCE">Baja adherencia</button>
      </div>
      <input id="doctorOutcomeSearch" class="outcome-search" type="search" placeholder="Buscar paciente" value="${esc(doctorOutcomeSearch)}">
    </div>

    <div id="doctorOutcomesPatientList">${doctorOutcomesMarkup()}</div>
  </section>`;
}

function bindDoctorOutcomes(){
  document.querySelectorAll('[data-outcome-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    doctorOutcomeFilter=btn.dataset.outcomeFilter||'ALL';
    renderDoctorOutcomes();
  }));

  document.getElementById('doctorOutcomeSearch')?.addEventListener('input',e=>{
    doctorOutcomeSearch=e.target.value||'';
    renderDoctorOutcomePatientList();
  });

  document.querySelectorAll('[data-open-outcome-patient]').forEach(btn=>{
    btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openOutcomePatient));
  });
}

function renderDoctorOutcomePatientList(){
  const list=document.getElementById('doctorOutcomesPatientList');
  if(!list)return;
  list.innerHTML=doctorOutcomesMarkup();
  list.querySelectorAll('[data-open-outcome-patient]').forEach(btn=>{
    btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openOutcomePatient));
  });
}

function renderDoctorOutcomes(){
  const old=document.getElementById('doctorOutcomesSection');
  if(!old)return;
  const temp=document.createElement('div');
  temp.innerHTML=doctorOutcomesSectionMarkup().trim();
  const fresh=temp.firstElementChild;
  if(fresh){
    old.replaceWith(fresh);
    bindDoctorOutcomes();
  }
}

async function syncDoctorOutcomes(renderUI=true){
  if(!hasRole('DOCTOR'))return;
  try{
    doctorOutcomes=await dbRpc('bodycare_get_doctor_outcomes',{p_control_window_days:90})||[];
    if(renderUI&&!doctorPatientDetail)renderDoctorOutcomes();
  }catch(err){
    console.warn('Outcome sync failed',err);
  }
}

function patientOutcomeSummaryMarkup(patientId){
  const row=outcomeForPatient(patientId);
  if(!row)return '';
  const goalPct=goalProgressPct(row);
  return `<section class="card patient-outcome-summary">
    <div class="card-head">
      <div>
        <h2 class="section-title">Resumen de evolución</h2>
        <div class="muted">Indicadores descriptivos del seguimiento de este paciente.</div>
      </div>
      ${row.achieved_5pct===true?'<span class="outcome-achievement">≥5% reducción</span>':''}
    </div>
    <div class="patient-outcome-grid">
      <div><span>Cambio de peso</span><strong>${outcomeSigned(row.weight_change_kg,' kg',2)}</strong><small>${outcomeSigned(row.weight_change_pct,'%',1)}</small></div>
      <div><span>Cambio de cintura</span><strong>${outcomeSigned(row.waist_change_cm,' cm',1)}</strong><small>Desde línea basal</small></div>
      <div><span>Adherencia 4 semanas</span><strong>${outcomePercent(row.record_adherence_pct_28d,0)}</strong><small>${Number(row.records_28d||0)} semana${Number(row.records_28d||0)===1?'':'s'} con registro</small></div>
      <div><span>Asistencia 90 días</span><strong>${outcomePercent(row.attendance_pct,0)}</strong><small>${Number(row.completed_controls||0)} completados · ${Number(row.no_show_controls||0)} inasist.</small></div>
      <div><span>Avance hacia meta</span><strong>${goalPct===null?'—':outcomePercent(goalPct,0)}</strong><small>${row.target_weight?`Meta ${kg(row.target_weight)}`:'Sin peso meta definido'}</small></div>
      <div><span>Próximo control</span><strong class="patient-next-control">${esc(nextControlText(row.next_control_at))}</strong><small>${row.next_control_at?'Agenda activa':'Sin control futuro'}</small></div>
    </div>
    <div class="clinical-settings-note">Estos indicadores apoyan la revisión longitudinal y no constituyen por sí solos una conclusión clínica.</div>
  </section>`;
}

async function syncDoctorHomeData(){
  if(!hasRole('DOCTOR')||doctorPatientDetail)return;
  await Promise.allSettled([
    syncDoctorAgenda(false),
    syncDoctorPriorities(false),
    syncDoctorOutcomes(false)
  ]);
  if(activePortal==='DOCTOR'&&!doctorPatientDetail&&!userIsTyping()){
    renderDoctorAgenda();
    renderDoctorPriorityDashboard();
    renderDoctorOutcomes();
  }
}

function priorityRank(value){
  return value==='RED'?1:value==='ORANGE'?2:3;
}

function priorityLabel(value){
  return value==='RED'?'Requiere atención':value==='ORANGE'?'Revisar':'Seguimiento normal';
}

function priorityForPatient(patientId){
  return doctorPriorities.find(x=>x.patient_user_id===patientId)||{
    patient_user_id:patientId,
    priority:'GREEN',
    open_alerts:0,
    days_since_record:null,
    latest_weight:null,
    latest_record_date:null,
    reasons:[]
  };
}

function priorityReasonMarkup(reason,includeAction=false){
  if(!reason)return '';
  const severity=reason.severity||'ORANGE';
  return `<div class="clinical-reason ${severity.toLowerCase()}">
    <div>
      <strong>${esc(reason.title||'Criterio de seguimiento')}</strong>
      <span>${esc(reason.detail||'')}</span>
    </div>
    ${includeAction&&reason.id?`<button type="button" class="secondary small-btn" data-review-alert="${esc(reason.id)}">Marcar revisada</button>`:''}
  </div>`;
}

function doctorPriorityCounts(){
  return doctorPriorities.reduce((acc,p)=>{
    if(p.priority==='RED')acc.red++;
    else if(p.priority==='ORANGE')acc.orange++;
    else acc.green++;
    return acc;
  },{red:0,orange:0,green:0});
}

function doctorPriorityPatientsMarkup(){
  const rows=[...doctorPriorities].sort((a,b)=>{
    const r=priorityRank(a.priority)-priorityRank(b.priority);
    if(r)return r;
    return String(a.patient_name||'').localeCompare(String(b.patient_name||''),'es');
  });

  if(!rows.length)return '<div class="empty-state">Aún no tienes pacientes vinculados.</div>';

  return rows.map(p=>{
    const patient=doctorPatients.find(x=>x.link.patient_user_id===p.patient_user_id);
    const reasons=Array.isArray(p.reasons)?p.reasons:[];
    return `<div class="priority-patient-row ${String(p.priority).toLowerCase()}">
      <div class="priority-patient-main">
        <div class="priority-patient-head">
          <strong>${esc(p.patient_name||patient?.profile?.full_name||'Paciente')}</strong>
          <span class="priority-chip ${String(p.priority).toLowerCase()}">${priorityLabel(p.priority)}</span>
        </div>
        <div class="priority-patient-meta">
          ${p.latest_record_date?`Último registro ${fmt(p.latest_record_date)}`:'Sin registro'}
          ${p.latest_weight!==null&&p.latest_weight!==undefined?` · ${kg(p.latest_weight)}`:''}
          ${Number(p.open_alerts||0)>0?` · ${Number(p.open_alerts)} alerta${Number(p.open_alerts)===1?'':'s'} abierta${Number(p.open_alerts)===1?'':'s'}`:''}
        </div>
        ${reasons.length?`<div class="priority-reasons-mini">${reasons.slice(0,2).map(r=>`<span>${esc(r.title||'Revisar seguimiento')}</span>`).join('')}</div>`:''}
      </div>
      <button class="primary small-btn" data-open-patient="${p.patient_user_id}">Abrir seguimiento</button>
    </div>`;
  }).join('');
}

function renderDoctorPriorityDashboard(){
  const counts=doctorPriorityCounts();
  const red=document.getElementById('priorityRedCount');
  const orange=document.getElementById('priorityOrangeCount');
  const green=document.getElementById('priorityGreenCount');
  if(red)red.textContent=counts.red;
  if(orange)orange.textContent=counts.orange;
  if(green)green.textContent=counts.green;

  const list=document.getElementById('doctorPriorityPatientList');
  if(list){
    list.innerHTML=doctorPriorityPatientsMarkup();
    list.querySelectorAll('[data-open-patient]').forEach(btn=>btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openPatient)));
  }
}

async function syncDoctorPriorities(renderUI=true){
  if(!hasRole('DOCTOR'))return;
  try{
    doctorPriorities=await dbRpc('bodycare_get_doctor_priorities',{})||[];
    if(renderUI){
      if(doctorPatientDetail)renderDoctorAlertPanel();
      else renderDoctorPriorityDashboard();
    }
  }catch(err){
    console.warn('Priority sync failed',err);
  }
}

function alertSettingsValues(){
  return doctorAlertSettings||{
    no_record_days:7,
    weight_gain_pct:2,
    rapid_loss_pct:3,
    abdominal_increase_cm:5,
    record_reminder_days:7
  };
}

async function saveDoctorAlertSettings(e){
  e.preventDefault();
  const noRecord=Number(document.getElementById('alertNoRecordDays')?.value);
  const gain=Number(document.getElementById('alertWeightGainPct')?.value);
  const loss=Number(document.getElementById('alertRapidLossPct')?.value);
  const abdomen=Number(document.getElementById('alertAbdominalIncrease')?.value);
  const reminderDays=Number(document.getElementById('recordReminderDays')?.value);

  try{
    const rows=await dbRpc('bodycare_save_alert_settings',{
      p_no_record_days:noRecord,
      p_weight_gain_pct:gain,
      p_rapid_loss_pct:loss,
      p_abdominal_increase_cm:abdomen
    });
    doctorAlertSettings=Array.isArray(rows)?rows[0]:rows;
    const reminderRows=await dbRpc('bodycare_save_record_reminder_days',{p_days:reminderDays});
    const reminderSaved=Array.isArray(reminderRows)?reminderRows[0]:reminderRows;
    if(reminderSaved)doctorAlertSettings=reminderSaved;
    await syncDoctorPriorities(true);
    showToast('Criterios y recordatorios actualizados','BodyCare aplicará los umbrales y la nueva frecuencia de acompañamiento.','CLINICAL_ALERT');
  }catch(err){
    alert('No fue posible guardar los criterios de seguimiento: '+err.message);
  }
}

function doctorAlertPanelMarkup(){
  if(!doctorPatientDetail)return '';
  const patientId=doctorPatientDetail.profile.user_id;
  const p=priorityForPatient(patientId);
  const reasons=Array.isArray(p.reasons)?p.reasons:[];
  return `<section class="card clinical-priority-card ${String(p.priority).toLowerCase()}" id="doctorClinicalPrioritySection">
    <div class="card-head">
      <div>
        <h2 class="section-title">Prioridad de seguimiento</h2>
        <div class="muted">Banderas operacionales configurables. No constituyen diagnóstico ni reemplazan el juicio clínico.</div>
      </div>
      <span class="priority-chip large ${String(p.priority).toLowerCase()}">${priorityLabel(p.priority)}</span>
    </div>
    ${reasons.length
      ? `<div class="clinical-reasons">${reasons.map(r=>priorityReasonMarkup(r,true)).join('')}</div>`
      : '<div class="clinical-normal">Sin criterios de alerta abiertos con los umbrales actuales.</div>'}
  </section>`;
}

function bindDoctorAlertPanel(){
  document.querySelectorAll('[data-review-alert]').forEach(btn=>{
    btn.addEventListener('click',()=>reviewDoctorAlert(btn.dataset.reviewAlert));
  });
}

function renderDoctorAlertPanel(){
  const old=document.getElementById('doctorClinicalPrioritySection');
  if(!old||!doctorPatientDetail)return;
  const temp=document.createElement('div');
  temp.innerHTML=doctorAlertPanelMarkup().trim();
  const fresh=temp.firstElementChild;
  if(fresh){
    old.replaceWith(fresh);
    bindDoctorAlertPanel();
  }
}

async function reviewDoctorAlert(id){
  if(!id)return;
  try{
    await dbRpc('bodycare_review_alert',{p_alert_id:id});
    await syncDoctorPriorities(false);
    renderDoctorAlertPanel();
    await syncDoctorTimeline(true,true);
    showToast('Alerta revisada','La alerta quedó registrada como revisada.','CLINICAL_ALERT');
  }catch(err){
    alert('No fue posible marcar la alerta como revisada: '+err.message);
  }
}

async function saveDoctorProfile(e){
  e.preventDefault();
  const payload={
    user_id:currentUser.id,
    display_name:document.getElementById('docName').value.trim(),
    specialty:document.getElementById('docSpecialty').value.trim(),
    registration_number:document.getElementById('docRegistration').value.trim()||null,
    clinic_name:document.getElementById('docClinic').value.trim()||null,
    professional_email:document.getElementById('docEmail').value.trim()||currentUser.email,
    control_slot_minutes:validControlSlotMinutes(document.getElementById('docSlotMinutes')?.value||30)
  };
  try{
    if(doctorProfile){
      await dbUpdate('doctor_profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{
        display_name:payload.display_name,specialty:payload.specialty,
        registration_number:payload.registration_number,clinic_name:payload.clinic_name,
        professional_email:payload.professional_email,control_slot_minutes:payload.control_slot_minutes,
        updated_at:new Date().toISOString()
      });
    }else await dbInsert('doctor_profiles',payload);
    await loadData();render();
  }catch(err){alert(err.message)}
}

function doctorView(){
  const counts=doctorPriorityCounts();
  const settings=alertSettingsValues();

  app.innerHTML=shell(`${header()}
    <section class="card">
      <div class="card-head">
        <div><h2 class="section-title">BodyCare Pro</h2><div class="muted">Seguimiento priorizado de pacientes vinculados</div></div>
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
          <div><label>Duración de cada control</label><select id="docSlotMinutes"><option value="15">15 minutos</option><option value="30" selected>30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></div>
        </div><button class="primary" type="submit" style="margin-top:12px">Guardar perfil médico</button></form>
      </section>`
      :`
      <section class="card">
        <div class="doctor-row"><div>
          <strong>${esc(doctorProfile.display_name||account?.display_name||'Médico')}</strong>
          <div class="muted">${esc(doctorProfile.specialty||'Sin especialidad')}${doctorProfile.clinic_name?` · ${esc(doctorProfile.clinic_name)}`:''}</div>
          <div class="doctor-slot-summary">Agenda: controles de ${validControlSlotMinutes(doctorProfile.control_slot_minutes||30)} minutos</div>
        </div><button id="editDoctorProfile" class="secondary small-btn">Editar perfil</button></div>

        <div class="doctor-schedule-setting">
          <div><label for="doctorSlotMinutesSetting">Duración de cada control</label><div class="muted">Define el bloque que BodyCare reservará en tu agenda.</div></div>
          <select id="doctorSlotMinutesSetting">
            ${[15,30,45,60].map(v=>`<option value="${v}" ${validControlSlotMinutes(doctorProfile.control_slot_minutes||30)===v?'selected':''}>${v} minutos</option>`).join('')}
          </select>
          <button type="button" id="saveDoctorSlotMinutes" class="secondary small-btn">Guardar agenda</button>
        </div>
      </section>

      <section class="card doctor-agenda-card">
        <div class="card-head">
          <div>
            <h2 class="section-title">Agenda médica</h2>
            <div class="muted">Controles programados y acceso directo al seguimiento de cada paciente.</div>
          </div>
          <span id="doctorAgendaStatus" class="agenda-sync-status">Actualizado</span>
        </div>

        <div class="agenda-toolbar">
          <div class="agenda-mode-buttons">
            <button type="button" class="agenda-mode-btn ${doctorAgendaMode==='TODAY'?'active':''}" data-agenda-mode="TODAY">
              Hoy <strong id="agendaTodayCount">${doctorAgendaCounts().today}</strong>
            </button>
            <button type="button" class="agenda-mode-btn ${doctorAgendaMode==='WEEK'?'active':''}" data-agenda-mode="WEEK">
              Próximos 7 días <strong id="agendaWeekCount">${doctorAgendaCounts().week}</strong>
            </button>
          </div>
          <button type="button" id="refreshDoctorAgenda" class="secondary small-btn">Actualizar</button>
        </div>

        <div id="doctorAgendaList">${doctorAgendaMarkup()}</div>
      </section>

      ${doctorOutcomesSectionMarkup()}

      <section class="priority-summary">
        <div class="priority-summary-card red"><span>Requiere atención</span><strong id="priorityRedCount">${counts.red}</strong></div>
        <div class="priority-summary-card orange"><span>Revisar</span><strong id="priorityOrangeCount">${counts.orange}</strong></div>
        <div class="priority-summary-card green"><span>Seguimiento normal</span><strong id="priorityGreenCount">${counts.green}</strong></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="section-title">Priorización de pacientes</h2>
            <div class="muted">Ordenado por criterios de seguimiento pendientes y antigüedad del último registro.</div>
          </div>
          <span class="clinical-disclaimer">Apoyo al seguimiento · no diagnóstico</span>
        </div>
        <div id="doctorPriorityPatientList">${doctorPriorityPatientsMarkup()}</div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="section-title">Criterios de seguimiento</h2>
            <div class="muted">Configura cuándo BodyCare debe levantar una bandera para revisión.</div>
          </div>
        </div>
        <form id="doctorAlertSettingsForm">
          <div class="grid clinical-settings-grid">
            <div>
              <label for="alertNoRecordDays">Sin registro por</label>
              <div class="suffix-input"><input id="alertNoRecordDays" type="number" min="3" max="30" step="1" value="${Number(settings.no_record_days||7)}"><span>días</span></div>
            </div>
            <div>
              <label for="recordReminderDays">Recordar registro al paciente</label>
              <div class="suffix-input"><input id="recordReminderDays" type="number" min="3" max="14" step="1" value="${Number(settings.record_reminder_days||7)}"><span>días</span></div>
            </div>
            <div>
              <label for="alertWeightGainPct">Aumento de peso</label>
              <div class="suffix-input"><input id="alertWeightGainPct" type="number" min="0.5" max="10" step="0.1" value="${Number(settings.weight_gain_pct||2)}"><span>%</span></div>
            </div>
            <div>
              <label for="alertRapidLossPct">Disminución rápida</label>
              <div class="suffix-input"><input id="alertRapidLossPct" type="number" min="1" max="15" step="0.1" value="${Number(settings.rapid_loss_pct||3)}"><span>% / 7 días</span></div>
            </div>
            <div>
              <label for="alertAbdominalIncrease">Aumento de cintura</label>
              <div class="suffix-input"><input id="alertAbdominalIncrease" type="number" min="1" max="20" step="0.5" value="${Number(settings.abdominal_increase_cm||5)}"><span>cm</span></div>
            </div>
          </div>
          <div class="clinical-settings-note">Los criterios clínico-operacionales organizan la revisión. La frecuencia de recordatorio solo define cuándo BodyCare invita al paciente a actualizar su seguimiento; no representa una conclusión clínica.</div>
          <button class="secondary" type="submit" style="margin-top:12px">Guardar criterios</button>
        </form>
      </section>`}
  `);

  bindCommonHeader();
  document.getElementById('doctorProfileForm')?.addEventListener('submit',saveDoctorProfile);
  document.getElementById('doctorAlertSettingsForm')?.addEventListener('submit',saveDoctorAlertSettings);
  bindDoctorOutcomes();

  document.querySelectorAll('[data-agenda-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    doctorAgendaMode=btn.dataset.agendaMode==='WEEK'?'WEEK':'TODAY';
    renderDoctorAgenda();
  }));
  document.getElementById('refreshDoctorAgenda')?.addEventListener('click',()=>syncDoctorAgenda(true));
  document.querySelectorAll('[data-open-agenda-patient]').forEach(btn=>btn.addEventListener('click',()=>openDoctorPatient(btn.dataset.openAgendaPatient)));

  document.getElementById('saveDoctorSlotMinutes')?.addEventListener('click',async()=>{
    const minutes=validControlSlotMinutes(document.getElementById('doctorSlotMinutesSetting')?.value||30);
    try{
      await dbUpdate('doctor_profiles',`user_id=eq.${encodeURIComponent(currentUser.id)}`,{
        control_slot_minutes:minutes,
        updated_at:new Date().toISOString()
      });
      await loadData();
      render();
      showToast('Agenda actualizada',`Los nuevos controles usarán bloques de ${minutes} minutos.`,'NEW_CONTROL');
    }catch(err){
      alert('No fue posible actualizar la duración de los controles: '+err.message);
    }
  });

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
  const points=getMeasurementPoints(rows,field,p);
  if(!points.length)return '<div class="empty-state">Sin datos suficientes.</div>';

  const vals=points.map(x=>x[1]).concat(goal!==null?[Number(goal)]:[]);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(max-min<4){min-=2;max+=2}else{const pad=(max-min)*.15;min-=pad;max+=pad}

  const pointMax=Math.max(0,...points.map(x=>Number(x[0])||0));
  const xMax=Math.max(1,Number(p.planned_weeks||0),Math.ceil(pointMax));

  const W=760,H=300,L=58,R=18,T=18,B=45,iw=W-L-R,ih=H-T-B;
  const x=position=>L+(position/xMax)*iw;
  const y=v=>T+((max-v)/(max-min))*ih;

  let svg=`<svg class="chart-svg" viewBox="0 0 ${W} ${H}">`;

  for(let i=0;i<=5;i++){
    const v=max-(max-min)*i/5,yy=T+ih*i/5;
    svg+=`<line class="chart-grid" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="chart-label" x="${L-8}" y="${yy+4}" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  const step=xMax<=16?2:xMax<=32?4:Math.max(1,Math.ceil(xMax/8));
  for(let w=0;w<=xMax;w+=step){
    const xx=x(w);
    svg+=`<line class="chart-grid" x1="${xx}" y1="${T}" x2="${xx}" y2="${T+ih}"/><text class="chart-label" x="${xx}" y="${H-22}" text-anchor="middle">${w}</text>`;
  }
  if(xMax%step!==0){
    svg+=`<text class="chart-label" x="${x(xMax)}" y="${H-22}" text-anchor="middle">${xMax}</text>`;
  }

  if(goal!==null)svg+=`<line class="chart-goal" x1="${L}" y1="${y(Number(goal))}" x2="${W-R}" y2="${y(Number(goal))}"/>`;

  const path=points.map(([position,value],i)=>`${i?'L':'M'} ${x(position).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  svg+=`<path class="${field==='weight_kg'?'chart-line':'chart-line-abdomen'}" d="${path}"/>`;

  points.forEach(([position,value,date])=>{
    svg+=`<circle class="${field==='weight_kg'?'chart-point':'chart-point-abdomen'}" cx="${x(position)}" cy="${y(value)}" r="5"><title>${fmt(date)} · ${measurementWeekLabel(position)}: ${value.toFixed(2)} ${suffix}</title></circle>`;
  });

  svg+=`<text class="chart-label" x="${L+iw/2}" y="${H-4}" text-anchor="middle">Semanas de seguimiento</text><text class="chart-label" transform="translate(14 ${T+ih/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
  return svg;
}


function timelineEventIcon(type){
  const icons={WEIGHT_RECORD:'⚖️',CONTROL:'🗓️',PRESCRIPTION:'📋',CARE_PLAN:'🎯',CLINICAL_ALERT:'⚠️',ALERT_REVIEWED:'✓'};
  return icons[type]||'•';
}
function timelineEventGroup(type){
  if(type==='WEIGHT_RECORD')return 'WEIGHT';
  if(type==='CONTROL')return 'CONTROL';
  if(type==='PRESCRIPTION')return 'PRESCRIPTION';
  if(type==='CARE_PLAN')return 'PLAN';
  if(['CLINICAL_ALERT','ALERT_REVIEWED'].includes(type))return 'ALERT';
  return 'OTHER';
}
function timelineFilterLabel(value){return ({ALL:'Todo',WEIGHT:'Registros',CONTROL:'Controles',PRESCRIPTION:'Indicaciones',PLAN:'Plan',ALERT:'Alertas'})[value]||'Todo'}
function timelineEventDate(value){return value?formatDateTime(value):'—'}
function timelineEventMarkup(item){
  const group=timelineEventGroup(item.event_type), severity=String(item.severity||'').toLowerCase();
  return `<div class="clinical-timeline-item ${group.toLowerCase()} ${severity}">
    <div class="clinical-timeline-rail"><span class="clinical-timeline-icon">${timelineEventIcon(item.event_type)}</span><i></i></div>
    <div class="clinical-timeline-content"><div class="clinical-timeline-head"><div><strong>${esc(item.title||'Evento de seguimiento')}</strong><span>${esc(timelineEventDate(item.event_at))}</span></div>
    <div class="clinical-timeline-tags"><span class="timeline-type-chip">${esc(timelineFilterLabel(group))}</span>${item.severity?`<span class="timeline-severity-chip ${severity}">${esc(item.severity)}</span>`:''}</div></div>
    ${item.detail?`<div class="clinical-timeline-detail">${esc(item.detail)}</div>`:''}</div></div>`;
}
function filteredDoctorTimeline(){const rows=doctorPatientDetail?.timeline||[];return doctorTimelineFilter==='ALL'?rows:rows.filter(x=>timelineEventGroup(x.event_type)===doctorTimelineFilter)}
function doctorTimelineMarkup(){const rows=filteredDoctorTimeline();return rows.length?`<div class="clinical-timeline">${rows.map(timelineEventMarkup).join('')}</div>`:`<div class="empty-state">No hay eventos para el filtro ${esc(timelineFilterLabel(doctorTimelineFilter).toLowerCase())}.</div>`}
function renderDoctorTimeline(){
  document.querySelectorAll('[data-timeline-filter]').forEach(b=>b.classList.toggle('active',b.dataset.timelineFilter===doctorTimelineFilter));
  const list=document.getElementById('doctorClinicalTimelineList');if(list)list.innerHTML=doctorTimelineMarkup();
  const status=document.getElementById('doctorTimelineStatus');if(status){status.textContent='Actualizado';status.classList.remove('syncing')}
}
function bindDoctorTimeline(){
  document.querySelectorAll('[data-timeline-filter]').forEach(btn=>btn.addEventListener('click',()=>{doctorTimelineFilter=btn.dataset.timelineFilter||'ALL';renderDoctorTimeline()}));
  document.getElementById('refreshDoctorTimeline')?.addEventListener('click',()=>syncDoctorTimeline(true,true));
}
async function syncDoctorTimeline(renderUI=true,force=false){
  const patientId=doctorPatientDetail?.profile?.user_id;if(!hasRole('DOCTOR')||!patientId)return;
  if(!force&&Date.now()-doctorTimelineLastSync<12000)return;
  const st=document.getElementById('doctorTimelineStatus');if(st){st.textContent='Actualizando…';st.classList.add('syncing')}
  try{const rows=await dbRpc('bodycare_get_patient_timeline',{p_patient_user_id:patientId,p_limit:160})||[];
    if(doctorPatientDetail?.profile?.user_id===patientId){doctorPatientDetail.timeline=rows;doctorTimelineLastSync=Date.now();if(renderUI)renderDoctorTimeline()}}
  catch(err){console.warn('Clinical timeline sync failed',err);if(st){st.textContent='No se pudo actualizar';st.classList.remove('syncing')}}
}
function doctorTimelineSectionMarkup(){return `<section class="card clinical-timeline-card" id="doctorClinicalTimelineSection">
  <div class="card-head"><div><h2 class="section-title">Timeline clínico</h2><div class="muted">Historia longitudinal consolidada de registros, controles, indicaciones y alertas.</div></div><span id="doctorTimelineStatus" class="agenda-sync-status">Actualizado</span></div>
  <div class="timeline-toolbar"><div class="timeline-filter-buttons">${['ALL','WEIGHT','CONTROL','PRESCRIPTION','PLAN','ALERT'].map(v=>`<button type="button" class="timeline-filter-btn ${doctorTimelineFilter===v?'active':''}" data-timeline-filter="${v}">${timelineFilterLabel(v)}</button>`).join('')}</div><button type="button" id="refreshDoctorTimeline" class="secondary small-btn">Actualizar</button></div>
  <div id="doctorClinicalTimelineList">${doctorTimelineMarkup()}</div></section>`}
function reportMetricCell(label,value,sub=''){return `<div class="report-metric"><span>${esc(label)}</span><strong>${esc(value||'—')}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function buildDoctorLongitudinalReport(includeTimeline=true){
  if(!doctorPatientDetail)return '';
  const d=doctorPatientDetail,p=d.profile,recs=[...(d.records||[])].sort((a,b)=>String(a.measured_on).localeCompare(String(b.measured_on))),latest=recs.at(-1)||null;
  const latestWaist=[...recs].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined)||null;
  const outcome=outcomeForPatient(p.user_id),priority=priorityForPatient(p.user_id),timeline=(d.timeline||[]).slice(0,60),activeRx=(d.prescriptions||[]).filter(rx=>!rx.deleted_at);
  const carePlan=d.carePlan||{goals:[],actions:[]},reportGoals=(carePlan.goals||[]).filter(g=>g.status!=='CANCELLED'),reportActions=(carePlan.actions||[]).filter(a=>a.status!=='CANCELLED');
  const completed=timeline.filter(x=>x.event_type==='CONTROL'&&x.metadata?.status==='COMPLETED');
  const logoUrl=new URL(BRAND_LOGO_URL,APP_URL).href;
  const reportDate=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BodyCare · Informe longitudinal · ${esc(p.full_name)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#182230;font-family:Arial,Helvetica,sans-serif}.page{max-width:980px;margin:20px auto;background:#fff;padding:30px;box-shadow:0 8px 30px rgba(16,24,40,.10)}
  .top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #175cd3;padding-bottom:18px}.brand{display:flex;align-items:center;gap:14px}.brand img{width:62px;height:62px;object-fit:contain}h1{margin:0;font-size:24px}.sub{color:#667085;margin-top:4px;font-size:13px}.print-actions{display:flex;gap:8px}.print-actions button{border:0;border-radius:8px;padding:9px 12px;cursor:pointer}.primary{background:#175cd3;color:#fff}.secondary{background:#eef2f6;color:#344054}h2{font-size:16px;margin:24px 0 10px}.box{border:1px solid #e4e7ec;border-radius:12px;padding:14px;margin-top:12px}.patient-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.report-metric{border:1px solid #e4e7ec;border-radius:10px;padding:10px;background:#f9fafb}.report-metric span{display:block;color:#667085;font-size:11px}.report-metric strong{display:block;margin-top:4px;font-size:15px}.report-metric small{display:block;margin-top:3px;color:#667085;font-size:10px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border-bottom:1px solid #eaecf0;text-align:left;vertical-align:top}th{background:#f9fafb;color:#475467}.rx{padding:9px 0;border-bottom:1px solid #eaecf0}.rx:last-child{border-bottom:0}.rx strong{display:block}.rx span{font-size:11px;color:#667085}.event{display:grid;grid-template-columns:90px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid #f2f4f7}.event:last-child{border-bottom:0}.event time{font-size:10px;color:#667085}.event strong{font-size:12px}.event p{margin:3px 0 0;font-size:10.5px;color:#475467;line-height:1.4}.disclaimer{margin-top:24px;padding:12px;border-radius:10px;background:#fffaeb;color:#7a2e0e;font-size:10.5px;line-height:1.45}.footer{margin-top:22px;padding-top:12px;border-top:1px solid #e4e7ec;color:#98a2b3;font-size:10px;text-align:center}
  @media(max-width:720px){.page{margin:0;padding:18px}.metric-grid,.patient-grid{grid-template-columns:1fr 1fr}.print-actions{display:none}}@media print{body{background:#fff}.page{max-width:none;margin:0;box-shadow:none;padding:12mm}.print-actions{display:none}.box,.report-metric{break-inside:avoid}@page{size:A4;margin:10mm}}
  </style></head><body><div class="page"><div class="top"><div class="brand"><img src="${logoUrl}" alt="BodyCare"><div><h1>Informe longitudinal de seguimiento</h1><div class="sub">BodyCare · Salud y progreso</div><div class="sub">Generado ${esc(reportDate)}</div></div></div><div class="print-actions"><button class="primary" onclick="window.print()">Imprimir / Guardar PDF</button><button class="secondary" onclick="window.close()">Cerrar</button></div></div>
  <h2>Paciente y profesional</h2><div class="box patient-grid">${reportMetricCell('Paciente',p.full_name)}${reportMetricCell('Inicio seguimiento',fmt(p.start_date))}${reportMetricCell('Duración plan',`${p.planned_weeks} semanas`)}${reportMetricCell('Profesional',doctorProfile?.display_name||account?.display_name||'Médico')}${reportMetricCell('Especialidad',doctorProfile?.specialty||'—')}${reportMetricCell('Centro / consulta',doctorProfile?.clinic_name||'—')}</div>
  <h2>Resumen de evolución</h2><div class="metric-grid">${reportMetricCell('Peso inicial',kg(p.initial_weight_kg))}${reportMetricCell('Peso actual',latest?kg(latest.weight_kg):'—',outcome?`${outcomeSigned(outcome.weight_change_kg,' kg',2)} · ${outcomeSigned(outcome.weight_change_pct,'%',1)}`:'—')}${reportMetricCell('Peso meta',p.target_weight_kg?kg(p.target_weight_kg):'—')}${reportMetricCell('Cintura actual',latestWaist?cm(latestWaist.abdominal_circumference_cm):'—',outcome?outcomeSigned(outcome.waist_change_cm,' cm',1):'—')}${reportMetricCell('Adherencia 4 semanas',outcome?outcomePercent(outcome.record_adherence_pct_28d,0):'—')}${reportMetricCell('Asistencia 90 días',outcome?outcomePercent(outcome.attendance_pct,0):'—')}${reportMetricCell('Prioridad actual',priorityLabel(priority.priority))}${reportMetricCell('Próximo control',outcome?nextControlText(outcome.next_control_at):'Sin próximo control')}</div>
  <h2>Plan de seguimiento</h2><div class="box">${reportGoals.length?`<table><thead><tr><th>Objetivo</th><th>Meta</th><th>Estado</th></tr></thead><tbody>${reportGoals.map(g=>`<tr><td><strong>${esc(g.title)}</strong>${g.description?`<div class="sub">${esc(g.description)}</div>`:''}</td><td>${esc(careGoalTargetText(g))}</td><td>${esc(careGoalStatusLabel(g.status))}</td></tr>`).join('')}</tbody></table>`:'<div class="sub">Sin objetivos compartidos.</div>'}${reportActions.length?`<h3 style="font-size:13px;margin:16px 0 6px">Acciones e hitos</h3><table><thead><tr><th>Acción</th><th>Fecha objetivo</th><th>Estado</th></tr></thead><tbody>${reportActions.map(a=>`<tr><td>${esc(a.title)}${a.patient_note?`<div class="sub">Nota paciente: ${esc(a.patient_note)}</div>`:''}</td><td>${a.due_date?fmt(a.due_date):'—'}</td><td>${esc(careActionStatusLabel(a.status))}</td></tr>`).join('')}</tbody></table>`:''}</div>
  <h2>Indicaciones vigentes</h2><div class="box">${activeRx.length?activeRx.map(rx=>`<div class="rx"><strong>${esc(rx.medication_name)} · ${esc(rx.dose_text)}</strong><span>${esc(rx.frequency_text)}${rx.duration_text?` · ${esc(rx.duration_text)}`:''}${rx.route_text?` · ${esc(rx.route_text)}`:''}</span>${rx.instructions?`<span style="display:block;margin-top:3px">${esc(rx.instructions)}</span>`:''}</div>`).join(''):'<div class="sub">Sin indicaciones activas registradas en BodyCare.</div>'}</div>
  <h2>Controles completados</h2><div class="box">${completed.length?`<table><thead><tr><th>Fecha</th><th>Resumen compartido</th></tr></thead><tbody>${completed.map(c=>`<tr><td>${esc(timelineEventDate(c.event_at))}</td><td>${esc(c.metadata?.outcome_summary||'Sin resumen registrado')}</td></tr>`).join('')}</tbody></table>`:'<div class="sub">Aún no hay controles completados con resumen.</div>'}</div>
  <h2>Historial de registros</h2><div class="box">${recs.length?`<table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Cintura</th></tr></thead><tbody>${recs.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOfFor(r.measured_on,p)}</td><td>${kg(r.weight_kg)}</td><td>${cm(r.abdominal_circumference_cm)}</td></tr>`).join('')}</tbody></table>`:'<div class="sub">Sin registros.</div>'}</div>
  ${includeTimeline?`<h2>Timeline clínico reciente</h2><div class="box">${timeline.length?timeline.map(item=>`<div class="event"><time>${esc(timelineEventDate(item.event_at))}</time><div><strong>${esc(item.title||'Evento')}</strong>${item.detail?`<p>${esc(item.detail)}</p>`:''}</div></div>`).join(''):'<div class="sub">Sin eventos disponibles.</div>'}</div>`:''}
  <div class="disclaimer">Este informe resume información registrada en BodyCare y sirve como apoyo al seguimiento longitudinal. No constituye por sí solo diagnóstico, indicación terapéutica ni reemplaza la evaluación y el juicio clínico del profesional tratante. Las indicaciones farmacológicas mostradas corresponden al registro interno de BodyCare; la integración de receta electrónica legal permanece pendiente.</div><div class="footer">BodyCare · Informe longitudinal de seguimiento</div></div></body></html>`;
}
function closeDoctorReportOptions(){
  document.getElementById('doctorReportOptionsOverlay')?.remove();
}

function openDoctorLongitudinalReport(includeTimeline){
  if(!doctorPatientDetail)return;
  closeDoctorReportOptions();

  const win=window.open('','_blank');
  if(!win){
    alert('El navegador bloqueó la apertura del informe. Permite ventanas emergentes para BodyCare e inténtalo nuevamente.');
    return;
  }

  win.document.open();
  win.document.write(buildDoctorLongitudinalReport(includeTimeline));
  win.document.close();
}

function generateDoctorLongitudinalReport(){
  if(!doctorPatientDetail)return;

  closeDoctorReportOptions();

  document.body.insertAdjacentHTML('beforeend',`
    <div class="report-options-overlay" id="doctorReportOptionsOverlay">
      <section class="report-options-modal" role="dialog" aria-modal="true" aria-labelledby="doctorReportOptionsTitle">
        <div class="report-options-icon">📄</div>
        <h3 id="doctorReportOptionsTitle">Generar informe longitudinal</h3>
        <p>¿Quieres incluir el Timeline clínico en el informe?</p>

        <div class="report-options-explanation">
          <div>
            <strong>Con Timeline</strong>
            <span>Incluye la secuencia reciente de registros, controles, indicaciones y alertas.</span>
          </div>
          <div>
            <strong>Sin Timeline</strong>
            <span>Genera un informe más breve manteniendo evolución, controles, indicaciones e historial.</span>
          </div>
        </div>

        <div class="report-options-actions">
          <button type="button" class="primary" id="reportWithTimeline">Generar con Timeline</button>
          <button type="button" class="secondary" id="reportWithoutTimeline">Generar sin Timeline</button>
          <button type="button" class="linkbtn report-cancel-btn" id="cancelReportOptions">Cancelar</button>
        </div>
      </section>
    </div>
  `);

  document.getElementById('reportWithTimeline')?.addEventListener('click',()=>openDoctorLongitudinalReport(true));
  document.getElementById('reportWithoutTimeline')?.addEventListener('click',()=>openDoctorLongitudinalReport(false));
  document.getElementById('cancelReportOptions')?.addEventListener('click',closeDoctorReportOptions);
  document.getElementById('doctorReportOptionsOverlay')?.addEventListener('click',e=>{
    if(e.target?.id==='doctorReportOptionsOverlay')closeDoctorReportOptions();
  });
}

async function openDoctorPatient(patientId){
  try{
    try{doctorPriorities=await dbRpc('bodycare_get_doctor_priorities',{})||[]}catch{}
    try{doctorOutcomes=await dbRpc('bodycare_get_doctor_outcomes',{p_control_window_days:90})||[]}catch{}
    const p=(await dbGet(`profiles?select=*&user_id=eq.${encodeURIComponent(patientId)}&limit=1`))?.[0];
    if(!p)throw new Error('No se encontró la ficha del paciente.');
    const recs=await dbGet(`weight_records?select=*&user_id=eq.${encodeURIComponent(patientId)}&deleted_at=is.null&order=measured_on.asc,created_at.asc`)||[];
    const prescriptions=(await dbRpc('bodycare_get_prescriptions',{
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:patientId
    })||[]).filter(p=>!p.deleted_at);
    const messages=(await dbRpc('bodycare_get_conversation',{
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:patientId
    })||[]).filter(m=>!m.deleted_at);
    const controls=(await dbRpc('bodycare_get_controls',{
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:patientId
    })||[]);
    const carePlan=(await dbRpc('bodycare_get_care_plan',{p_doctor_user_id:currentUser.id,p_patient_user_id:patientId}))||{goals:[],actions:[]};
    const nutritionPlan=(await dbRpc('bodycare_get_nutrition_plan',{p_doctor_user_id:currentUser.id,p_patient_user_id:patientId}))||{plan:null,items:[]};
    const nutritionCatalog=(await dbRpc('bodycare_get_nutrition_catalog',{p_doctor_user_id:currentUser.id}))||[];
    const timeline=(await dbRpc('bodycare_get_patient_timeline',{p_patient_user_id:patientId,p_limit:160})||[]);
    doctorTimelineLastSync=Date.now();
    doctorPatientDetail={profile:p,records:recs,prescriptions,messages,controls,carePlan,nutritionPlan,nutritionCatalog,timeline};
    const matching=notifications.filter(n=>
      isActionableUnread(n) &&
      DOCTOR_PATIENT_CONTEXT_NOTIFICATION_TYPES.includes(n.type) &&
      n.related_user_id===patientId
    );
    for(const n of matching)markNotificationRead(n.id);
    updateHeaderNotificationUI();
    doctorPatientDetailView();
  }catch(err){alert(err.message)}
}


function doctorPrescriptionListMarkup(){
  const rows=(doctorPatientDetail?.prescriptions||[]).filter(rx=>!rx.deleted_at);
  return rows.length?`<div class="prescription-list">${rows.map(rx=>`
    <div class="prescription-card">
      <div class="prescription-card-head"><div><strong>${esc(rx.medication_name)} · ${esc(rx.dose_text)}</strong><div>${esc(rx.frequency_text)}${rx.duration_text?` · ${esc(rx.duration_text)}`:''}</div></div><span class="revision-chip">v${rx.revision||1}</span></div>
      <div class="rx-summary-line">${rx.active_ingredient?`<span>${esc(rx.active_ingredient)}</span>`:''}${rx.route_text?`<span>${esc(rx.route_text)}</span>`:''}</div>
      ${rx.instructions?`<div class="muted prescription-instructions">${esc(rx.instructions)}</div>`:''}
      <div class="small-muted">${rx.status} · receta legal pendiente · actualizada ${formatDateTime(rx.updated_at)}</div>
      <div class="prescription-actions"><button type="button" class="secondary small-btn" data-edit-prescription="${rx.id}">Editar</button><button type="button" class="danger-btn small-btn" data-delete-prescription="${rx.id}">Eliminar</button></div>
    </div>`).join('')}</div>`:'<div class="empty-state">Todavía no hay indicaciones para este paciente.</div>';
}

function renderDoctorPrescriptionList(){
  const el=document.getElementById('doctorPrescriptionList');
  if(!el)return;
  el.innerHTML=doctorPrescriptionListMarkup();
  el.querySelectorAll('[data-edit-prescription]').forEach(btn=>btn.addEventListener('click',()=>{
    editingPrescriptionId=btn.dataset.editPrescription;
    renderDoctorPrescriptionForm();
    document.getElementById('doctorPrescriptionFormWrap')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  el.querySelectorAll('[data-delete-prescription]').forEach(btn=>{
    btn.addEventListener('click',()=>deleteDoctorPrescription(btn.dataset.deletePrescription));
  });
}

function bindDoctorPrescriptionForm(){
  const editing=doctorPatientDetail?.prescriptions?.find(rx=>rx.id===editingPrescriptionId)||null;
  document.getElementById('doctorPrescriptionForm')?.addEventListener('submit',saveDoctorPrescription);
  bindPrescriptionCatalog(editing);
  bindDateCLInputs();
  document.getElementById('cancelPrescriptionEdit')?.addEventListener('click',()=>{
    editingPrescriptionId=null;
    renderDoctorPrescriptionForm();
  });
}

function renderDoctorPrescriptionForm(){
  const wrap=document.getElementById('doctorPrescriptionFormWrap');
  if(!wrap||!doctorPatientDetail)return;
  const editing=doctorPatientDetail.prescriptions.find(rx=>rx.id===editingPrescriptionId)||null;
  wrap.innerHTML=prescriptionFormMarkup(editing);
  bindDoctorPrescriptionForm();
}



function doctorCarePlan(){return doctorPatientDetail?.carePlan||{goals:[],actions:[]}}
function careGoalFormMarkup(){
  const goal=(doctorCarePlan().goals||[]).find(g=>g.id===editingCareGoalId)||null;
  return `<form id="doctorCareGoalForm" class="care-editor-form"><div class="grid care-editor-grid">
    <div><label for="careGoalType">Tipo</label><select id="careGoalType" required>${[['WEIGHT','Peso'],['WAIST','Circunferencia'],['RECORDING','Registro'],['CUSTOM','Personalizado']].map(([v,l])=>`<option value="${v}" ${goal?.goal_type===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div><label for="careGoalTitle">Objetivo</label><input id="careGoalTitle" maxlength="160" required value="${esc(goal?.title||'')}" placeholder="Ej: Alcanzar peso objetivo"></div>
    <div><label for="careGoalTarget">Valor meta <span class="muted">(opcional)</span></label><input id="careGoalTarget" inputmode="decimal" value="${goal?.target_value!==null&&goal?.target_value!==undefined?String(goal.target_value).replace('.',','):''}" placeholder="Ej: 85"></div>
    <div><label for="careGoalUnit">Unidad <span class="muted">(opcional)</span></label><input id="careGoalUnit" maxlength="30" value="${esc(goal?.target_unit||'')}" placeholder="kg, cm, días..."></div>
    <div><label for="careGoalDate">Fecha objetivo <span class="muted">(opcional)</span></label><input id="careGoalDate" type="text" inputmode="numeric" maxlength="10" data-date-cl placeholder="DD/MM/AAAA" value="${goal?.target_date?formatDateCL(goal.target_date):''}"></div>
  </div><label for="careGoalDescription" style="margin-top:10px">Descripción <span class="muted">(opcional)</span></label><textarea id="careGoalDescription" rows="2" maxlength="1500">${esc(goal?.description||'')}</textarea><div class="form-actions"><button class="primary" type="submit">${goal?'Guardar objetivo':'Agregar objetivo'}</button>${goal?'<button type="button" class="secondary" id="cancelCareGoalEdit">Cancelar edición</button>':''}</div></form>`;
}
function careActionFormMarkup(){
  const action=(doctorCarePlan().actions||[]).find(a=>a.id===editingCareActionId)||null;
  const goals=(doctorCarePlan().goals||[]).filter(g=>g.status!=='CANCELLED'||g.id===action?.goal_id);
  return `<form id="doctorCareActionForm" class="care-editor-form"><div class="grid care-editor-grid">
    <div><label for="careActionGoal">Objetivo relacionado</label><select id="careActionGoal"><option value="">Sin objetivo específico</option>${goals.map(g=>`<option value="${g.id}" ${action?.goal_id===g.id?'selected':''}>${esc(g.title)}</option>`).join('')}</select></div>
    <div><label for="careActionTitle">Acción / hito</label><input id="careActionTitle" maxlength="180" required value="${esc(action?.title||'')}" placeholder="Ej: Registrar peso esta semana"></div>
    <div><label for="careActionDue">Fecha objetivo <span class="muted">(opcional)</span></label><input id="careActionDue" type="text" inputmode="numeric" maxlength="10" data-date-cl placeholder="DD/MM/AAAA" value="${action?.due_date?formatDateCL(action.due_date):''}"></div>
  </div><label for="careActionDescription" style="margin-top:10px">Detalle <span class="muted">(opcional)</span></label><textarea id="careActionDescription" rows="2" maxlength="1500">${esc(action?.description||'')}</textarea><div class="form-actions"><button class="primary" type="submit">${action?'Guardar acción':'Asignar acción'}</button>${action?'<button type="button" class="secondary" id="cancelCareActionEdit">Cancelar edición</button>':''}</div></form>`;
}
function doctorCareGoalCard(goal){
  return `<article class="care-goal-card ${String(goal.status).toLowerCase()}"><div class="care-card-head"><div><span class="care-type-chip">${careGoalTypeLabel(goal.goal_type)}</span><strong>${esc(goal.title)}</strong></div><span class="care-status-chip ${String(goal.status).toLowerCase()}">${careGoalStatusLabel(goal.status)}</span></div>${goal.description?`<p>${esc(goal.description)}</p>`:''}<div class="care-goal-meta"><span><b>Meta:</b> ${esc(careGoalTargetText(goal))}</span></div><div class="care-action-buttons"><button type="button" class="secondary small-btn" data-edit-care-goal="${goal.id}">Editar</button>${goal.status!=='ACHIEVED'?`<button type="button" class="secondary small-btn" data-care-goal-status="${goal.id}" data-status="ACHIEVED">Logrado</button>`:''}${goal.status==='ACTIVE'?`<button type="button" class="secondary small-btn" data-care-goal-status="${goal.id}" data-status="PAUSED">Pausar</button>`:''}${['PAUSED','ACHIEVED','CANCELLED'].includes(goal.status)?`<button type="button" class="secondary small-btn" data-care-goal-status="${goal.id}" data-status="ACTIVE">Reactivar</button>`:''}${goal.status!=='CANCELLED'?`<button type="button" class="link-danger small-btn" data-care-goal-status="${goal.id}" data-status="CANCELLED">Cancelar</button>`:''}</div></article>`;
}
function doctorCareActionCard(action){
  return `<article class="care-action-card ${String(action.status).toLowerCase()}"><div class="care-card-head"><div><strong>${esc(action.title)}</strong>${action.due_date?`<span class="care-due-date">Fecha objetivo ${fmt(action.due_date)}</span>`:''}</div><span class="care-status-chip ${String(action.status).toLowerCase()}">${careActionStatusLabel(action.status)}</span></div>${action.description?`<p>${esc(action.description)}</p>`:''}${action.patient_note?`<div class="care-patient-note"><b>Nota del paciente:</b> ${esc(action.patient_note)}</div>`:''}<div class="care-action-buttons"><button type="button" class="secondary small-btn" data-edit-care-action="${action.id}">Editar</button>${action.status!=='COMPLETED'?`<button type="button" class="secondary small-btn" data-doctor-care-action="${action.id}" data-status="COMPLETED">Completar</button>`:''}${['COMPLETED','CANCELLED'].includes(action.status)?`<button type="button" class="secondary small-btn" data-doctor-care-action="${action.id}" data-status="PENDING">Reabrir</button>`:''}${action.status!=='CANCELLED'?`<button type="button" class="link-danger small-btn" data-doctor-care-action="${action.id}" data-status="CANCELLED">Cancelar</button>`:''}</div></article>`;
}
function doctorCarePlanSectionMarkup(){
  const plan=doctorCarePlan(),counts=carePlanCounts(plan),progress=carePlanProgress(plan);
  return `<section class="card doctor-care-plan-section" id="doctorCarePlanSection"><div class="card-head"><div><h2 class="section-title">Plan de seguimiento</h2><div class="muted">Objetivos y acciones compartidas con el paciente. BodyCare registra quién realiza cada cambio.</div></div><span class="clinical-disclaimer">Definido por profesional</span></div>
  <div class="care-plan-summary"><div><span>Objetivos activos</span><strong>${counts.activeGoals}</strong></div><div><span>Objetivos logrados</span><strong>${counts.achievedGoals}</strong></div><div><span>Acciones pendientes</span><strong>${counts.pendingActions}</strong></div><div><span>Acciones completadas</span><strong>${counts.completedActions}</strong></div></div>
  <div class="care-progress-card"><div><strong>Avance de acciones</strong><span>${progress}% completado</span></div><div class="care-progress-track"><i style="width:${progress}%"></i></div></div>
  <details class="care-editor-panel" ${editingCareGoalId?'open':''}><summary>${editingCareGoalId?'Editar objetivo':'Agregar objetivo'}</summary>${careGoalFormMarkup()}</details>
  <div class="care-goal-list">${(plan.goals||[]).length?(plan.goals||[]).map(doctorCareGoalCard).join(''):'<div class="empty-state">Aún no hay objetivos compartidos.</div>'}</div>
  <details class="care-editor-panel" ${editingCareActionId?'open':''}><summary>${editingCareActionId?'Editar acción':'Asignar acción / hito'}</summary>${careActionFormMarkup()}</details>
  <div class="care-action-list">${(plan.actions||[]).length?(plan.actions||[]).map(doctorCareActionCard).join(''):'<div class="empty-state">Aún no hay acciones asignadas.</div>'}</div></section>`;
}
function renderDoctorCarePlanSection(){
  const old=document.getElementById('doctorCarePlanSection');if(!old||!doctorPatientDetail)return;
  const temp=document.createElement('div');temp.innerHTML=doctorCarePlanSectionMarkup().trim();const fresh=temp.firstElementChild;
  if(fresh){old.replaceWith(fresh);bindDoctorCarePlan();bindDateCLInputs(fresh)}
}
async function syncDoctorCarePlan(patientId,renderUI=true){
  if(!hasRole('DOCTOR')||!patientId)return;
  try{
    const plan=await dbRpc('bodycare_get_care_plan',{p_doctor_user_id:currentUser.id,p_patient_user_id:patientId});
    if(doctorPatientDetail?.profile?.user_id===patientId){doctorPatientDetail.carePlan=plan||{goals:[],actions:[]};if(renderUI&&!userIsTyping())renderDoctorCarePlanSection()}
  }catch(err){console.warn('Doctor care plan sync failed',err)}
}
async function saveDoctorCareGoal(e){
  e.preventDefault();const patientId=doctorPatientDetail?.profile?.user_id;if(!patientId)return;
  let targetDate=null;try{targetDate=requireDateCL('careGoalDate','Fecha objetivo',true)}catch(err){alert(err.message);return}
  const raw=document.getElementById('careGoalTarget')?.value.trim()||'',target=raw===''?null:parseDecimal(raw);
  if(raw!==''&&!Number.isFinite(target)){alert('Valor meta: usa un número válido.');return}
  try{
    await dbRpc('bodycare_save_care_goal',{p_goal_id:editingCareGoalId||null,p_patient_user_id:patientId,p_goal_type:document.getElementById('careGoalType').value,p_title:document.getElementById('careGoalTitle').value.trim(),p_description:document.getElementById('careGoalDescription').value.trim()||null,p_target_value:target,p_target_unit:document.getElementById('careGoalUnit').value.trim()||null,p_target_date:targetDate});
    editingCareGoalId=null;await syncDoctorCarePlan(patientId,false);renderDoctorCarePlanSection();await syncDoctorTimeline(true,true);showToast('Plan actualizado','El objetivo quedó compartido con el paciente.','CARE_PLAN_UPDATED');
  }catch(err){alert('No fue posible guardar el objetivo: '+err.message)}
}
async function saveDoctorCareAction(e){
  e.preventDefault();const patientId=doctorPatientDetail?.profile?.user_id;if(!patientId)return;
  let due=null;try{due=requireDateCL('careActionDue','Fecha objetivo de acción',true)}catch(err){alert(err.message);return}
  try{
    await dbRpc('bodycare_save_care_action',{p_action_id:editingCareActionId||null,p_patient_user_id:patientId,p_goal_id:document.getElementById('careActionGoal').value||null,p_title:document.getElementById('careActionTitle').value.trim(),p_description:document.getElementById('careActionDescription').value.trim()||null,p_due_date:due});
    editingCareActionId=null;await syncDoctorCarePlan(patientId,false);renderDoctorCarePlanSection();await syncDoctorTimeline(true,true);showToast('Acción compartida','El paciente verá la acción en Mi plan.','CARE_ACTION_UPDATED');
  }catch(err){alert('No fue posible guardar la acción: '+err.message)}
}
async function setDoctorCareGoalStatus(id,status){
  try{await dbRpc('bodycare_set_care_goal_status',{p_goal_id:id,p_status:status});await syncDoctorCarePlan(doctorPatientDetail.profile.user_id,false);renderDoctorCarePlanSection();await syncDoctorTimeline(true,true)}
  catch(err){alert('No fue posible actualizar el objetivo: '+err.message)}
}
async function setDoctorCareActionStatus(id,status){
  try{await dbRpc('bodycare_set_care_action_status',{p_action_id:id,p_status:status,p_patient_note:null});await syncDoctorCarePlan(doctorPatientDetail.profile.user_id,false);renderDoctorCarePlanSection();await syncDoctorTimeline(true,true)}
  catch(err){alert('No fue posible actualizar la acción: '+err.message)}
}
function bindDoctorCarePlan(){
  document.getElementById('doctorCareGoalForm')?.addEventListener('submit',saveDoctorCareGoal);
  document.getElementById('doctorCareActionForm')?.addEventListener('submit',saveDoctorCareAction);
  document.getElementById('cancelCareGoalEdit')?.addEventListener('click',()=>{editingCareGoalId=null;renderDoctorCarePlanSection()});
  document.getElementById('cancelCareActionEdit')?.addEventListener('click',()=>{editingCareActionId=null;renderDoctorCarePlanSection()});
  document.querySelectorAll('[data-edit-care-goal]').forEach(btn=>btn.addEventListener('click',()=>{editingCareGoalId=btn.dataset.editCareGoal;renderDoctorCarePlanSection();document.getElementById('doctorCarePlanSection')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  document.querySelectorAll('[data-edit-care-action]').forEach(btn=>btn.addEventListener('click',()=>{editingCareActionId=btn.dataset.editCareAction;renderDoctorCarePlanSection();document.getElementById('doctorCarePlanSection')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  document.querySelectorAll('[data-care-goal-status]').forEach(btn=>btn.addEventListener('click',()=>setDoctorCareGoalStatus(btn.dataset.careGoalStatus,btn.dataset.status)));
  document.querySelectorAll('[data-doctor-care-action]').forEach(btn=>btn.addEventListener('click',()=>setDoctorCareActionStatus(btn.dataset.doctorCareAction,btn.dataset.status)));
}


function doctorNutritionData(){return doctorPatientDetail?.nutritionPlan||{plan:null,items:[]}}
function doctorNutritionCatalog(){return doctorPatientDetail?.nutritionCatalog||[]}
function nutritionPortionMetrics(item){
  const n=nutritionEstimate(item,Number(item.portion_grams||0));
  return `${nutritionNum(n.kcal,0)} kcal · P ${nutritionNum(n.protein_g,1)} g · Az ${nutritionNum(n.sugars_g,1)} g · G ${nutritionNum(n.fat_g,1)} g`;
}
function doctorNutritionMealMarkup(type){
  const rows=(doctorNutritionData().items||[]).filter(i=>i.meal_type===type);
  const m=nutritionMeal(type);
  return `<details class="nutrition-doctor-meal" ${type==='BREAKFAST'?'open':''}>
    <summary><span>${m.label} · ${m.time}</span><b>${rows.length}</b></summary>
    ${rows.length?`<div class="nutrition-plan-item-list">${rows.map(i=>`<div class="nutrition-plan-item-row">
      <div><strong>${esc(i.name)}</strong><span>${nutritionNum(i.portion_grams,0)} g · ${nutritionPortionMetrics(i)}</span><small>${esc(i.source_text||'')}${i.reference_quality==='VERIFY_LABEL'?' · Confirmar etiqueta':''}</small></div>
      <div class="nutrition-row-actions"><button type="button" class="secondary small-btn" data-edit-nutrition-item="${i.id}">Editar</button><button type="button" class="link-danger small-btn" data-remove-nutrition-item="${i.id}">Quitar</button></div>
    </div>`).join('')}</div>`:'<div class="empty-state">Sin alimentos definidos para esta comida.</div>'}
  </details>`;
}
function doctorNutritionItemFormMarkup(){
  const data=doctorNutritionData(),item=(data.items||[]).find(i=>i.id===editingNutritionPlanItemId)||null;
  const catalog=doctorNutritionCatalog();
  return `<form id="doctorNutritionItemForm" class="nutrition-item-editor">
    <div class="grid nutrition-editor-grid">
      <div><label>Comida</label><select id="nutritionItemMeal">${NUTRITION_MEALS.map(m=>`<option value="${m.type}" ${item?.meal_type===m.type?'selected':''}>${m.label} · ${m.time}</option>`).join('')}</select></div>
      <div><label>Alimento</label><select id="nutritionItemFood">${catalog.map(f=>`<option value="${f.id}" ${item?.food_id===f.id?'selected':''}>${esc(f.name)}${f.reference_quality==='VERIFY_LABEL'?' ⚠':''}</option>`).join('')}</select></div>
      <div><label>Porción</label><div class="suffix-input"><input id="nutritionItemGrams" type="number" min="1" max="5000" step="1" value="${item?Number(item.portion_grams):''}" required><span>g</span></div></div>
      <div><label>Grupo / elección</label><input id="nutritionItemGroup" maxlength="60" value="${esc(item?.option_group||'')}" placeholder="Ej: PROTEINA"></div>
    </div>
    <label style="margin-top:8px">Texto de pauta</label><input id="nutritionItemSourceText" maxlength="300" value="${esc(item?.source_text||'')}" placeholder="Ej: elegir una alternativa">
    <label style="margin-top:8px">Instrucción</label><input id="nutritionItemInstructions" maxlength="500" value="${esc(item?.instructions||'')}">
    <div class="form-actions"><button class="primary" type="submit">${item?'Guardar alimento':'Agregar alimento'}</button>${item?'<button type="button" class="secondary" id="cancelNutritionItemEdit">Cancelar edición</button>':''}</div>
  </form>`;
}
function doctorNutritionSectionMarkup(){
  const data=doctorNutritionData(),p=data.plan;
  if(!p)return `<section class="card doctor-nutrition-section" id="doctorNutritionSection">
    <div class="card-head"><div><h2 class="section-title">Indicación nutricional</h2><div class="muted">Programa alimentario ajustable y diario nutricional para el paciente.</div></div><span class="clinical-disclaimer">Nueva indicación</span></div>
    <div class="nutrition-template-preview"><strong>Plan Nutricional Detox</strong><span>Basado en el documento aportado: 08:00 desayuno · 10:30 snack · 14:00 almuerzo · 17:00 snack · 20:00 cena.</span></div>
    <button type="button" id="activateDetoxPlan" class="primary">Activar Plan Detox</button>
    <div class="clinical-settings-note">Las metas de calorías, proteína, azúcares y grasa no vienen definidas en el documento y deben ser establecidas por el profesional.</div>
  </section>`;
  return `<section class="card doctor-nutrition-section" id="doctorNutritionSection">
    <div class="card-head"><div><h2 class="section-title">Indicación nutricional · ${esc(p.program_name)}</h2><div class="muted">Ajusta metas, porciones y alimentos. El paciente verá la pauta en Nutrición.</div></div><span class="nutrition-program-chip">Activo</span></div>
    <form id="doctorNutritionTargetsForm">
      <div class="grid nutrition-target-editor">
        <div><label>Calorías diarias</label><div class="suffix-input"><input id="nutritionKcalTarget" type="number" min="0" step="1" value="${p.daily_kcal_target??''}"><span>kcal</span></div></div>
        <div><label>Proteína diaria</label><div class="suffix-input"><input id="nutritionProteinTarget" type="number" min="0" step="1" value="${p.daily_protein_g_target??''}"><span>g</span></div></div>
        <div><label>Azúcares totales</label><div class="suffix-input"><input id="nutritionSugarTarget" type="number" min="0" step="1" value="${p.daily_sugars_g_target??''}"><span>g</span></div></div>
        <div><label>Grasa total</label><div class="suffix-input"><input id="nutritionFatTarget" type="number" min="0" step="1" value="${p.daily_fat_g_target??''}"><span>g</span></div></div>
      </div>
      <label>Indicaciones generales</label><textarea id="nutritionInstructions" rows="2">${esc(p.instructions||'')}</textarea>
      <div class="grid nutrition-text-grid">
        <div><label>Evitar según pauta</label><textarea id="nutritionAvoid" rows="3">${esc(p.avoid_text||'')}</textarea></div>
        <div><label>Consumo libre según pauta</label><textarea id="nutritionFree" rows="3">${esc(p.free_text||'')}</textarea></div>
      </div>
      <button class="primary" type="submit">Guardar pauta diaria</button>
    </form>
    ${nutritionPlanSourceNotice()}
    <div class="nutrition-doctor-meals">${NUTRITION_MEALS.map(m=>doctorNutritionMealMarkup(m.type)).join('')}</div>
    <details class="care-editor-panel" ${editingNutritionPlanItemId?'open':''}><summary>${editingNutritionPlanItemId?'Editar alimento de pauta':'Agregar alimento a la pauta'}</summary>${doctorNutritionItemFormMarkup()}</details>
    <details class="care-editor-panel"><summary>Agregar alimento personalizado desde etiqueta</summary>
      <form id="customNutritionFoodForm" class="care-editor-form">
        <div class="grid nutrition-custom-grid">
          <div><label>Nombre</label><input id="customFoodName" required maxlength="160"></div>
          <div><label>Categoría</label><input id="customFoodCategory" maxlength="80" value="Personalizado"></div>
          <div><label>Porción de referencia</label><input id="customFoodServingLabel" maxlength="80" placeholder="Ej: 1 rebanada"></div>
          <div><label>Gramos por porción</label><input id="customFoodServingGrams" type="number" min="1" step="1" required></div>
          <div><label>kcal /100 g</label><input id="customFoodKcal" type="number" min="0" step="0.1" required></div>
          <div><label>Proteína /100 g</label><input id="customFoodProtein" type="number" min="0" step="0.1" required></div>
          <div><label>Azúcares /100 g</label><input id="customFoodSugar" type="number" min="0" step="0.1" required></div>
          <div><label>Grasa /100 g</label><input id="customFoodFat" type="number" min="0" step="0.1" required></div>
        </div>
        <label>Fuente / etiqueta</label><input id="customFoodSource" maxlength="300" placeholder="Ej: etiqueta nutricional marca X">
        <button class="secondary" type="submit">Guardar alimento en mi catálogo</button>
      </form>
    </details>
  </section>`;
}
async function syncDoctorNutrition(patientId,renderUI=true){
  if(!doctorPatientDetail||doctorPatientDetail.profile.user_id!==patientId)return;
  try{
    const [plan,catalog]=await Promise.all([
      dbRpc('bodycare_get_nutrition_plan',{p_doctor_user_id:currentUser.id,p_patient_user_id:patientId}),
      dbRpc('bodycare_get_nutrition_catalog',{p_doctor_user_id:currentUser.id})
    ]);
    doctorPatientDetail.nutritionPlan=plan||{plan:null,items:[]};
    doctorPatientDetail.nutritionCatalog=catalog||[];
    if(renderUI&&!userIsTyping())renderDoctorNutritionSection();
  }catch(err){console.warn('Doctor nutrition sync failed',err)}
}
function renderDoctorNutritionSection(){
  const old=document.getElementById('doctorNutritionSection');if(!old)return;
  const temp=document.createElement('div');temp.innerHTML=doctorNutritionSectionMarkup().trim();const fresh=temp.firstElementChild;
  if(fresh){old.replaceWith(fresh);bindDoctorNutrition()}
}
async function activateDoctorDetoxPlan(){
  const patientId=doctorPatientDetail?.profile?.user_id;if(!patientId)return;
  try{
    await dbRpc('bodycare_activate_detox_nutrition_plan',{p_patient_user_id:patientId});
    editingNutritionPlanItemId=null;await syncDoctorNutrition(patientId,false);renderDoctorNutritionSection();
    showToast('Plan nutricional activado','Ahora define las metas diarias antes de iniciar el seguimiento.','NUTRITION_PLAN_UPDATED');
  }catch(err){alert('No fue posible activar el plan: '+err.message)}
}
async function saveDoctorNutritionTargets(e){
  e.preventDefault();const patientId=doctorPatientDetail?.profile?.user_id;if(!patientId)return;
  const val=id=>{const raw=document.getElementById(id)?.value.trim();return raw?Number(raw):0};
  try{
    await dbRpc('bodycare_update_nutrition_plan',{
      p_patient_user_id:patientId,p_daily_kcal_target:val('nutritionKcalTarget'),p_daily_protein_g_target:val('nutritionProteinTarget'),
      p_daily_sugars_g_target:val('nutritionSugarTarget'),p_daily_fat_g_target:val('nutritionFatTarget'),
      p_instructions:document.getElementById('nutritionInstructions')?.value||null,p_avoid_text:document.getElementById('nutritionAvoid')?.value||null,p_free_text:document.getElementById('nutritionFree')?.value||null
    });
    await syncDoctorNutrition(patientId,false);renderDoctorNutritionSection();showToast('Pauta guardada','Las metas nutricionales fueron actualizadas.','NUTRITION_PLAN_UPDATED');
  }catch(err){alert('No fue posible guardar la pauta: '+err.message)}
}
async function saveDoctorNutritionItem(e){
  e.preventDefault();const patientId=doctorPatientDetail?.profile?.user_id;if(!patientId)return;
  try{
    await dbRpc('bodycare_save_nutrition_plan_item',{
      p_item_id:editingNutritionPlanItemId||null,p_patient_user_id:patientId,p_meal_type:document.getElementById('nutritionItemMeal').value,
      p_food_id:document.getElementById('nutritionItemFood').value,p_portion_grams:Number(document.getElementById('nutritionItemGrams').value),
      p_option_group:document.getElementById('nutritionItemGroup').value.trim()||null,p_source_text:document.getElementById('nutritionItemSourceText').value.trim()||null,
      p_instructions:document.getElementById('nutritionItemInstructions').value.trim()||null
    });
    editingNutritionPlanItemId=null;await syncDoctorNutrition(patientId,false);renderDoctorNutritionSection();
  }catch(err){alert('No fue posible guardar el alimento: '+err.message)}
}
async function removeDoctorNutritionItem(id){
  if(!confirm('¿Quitar este alimento de la pauta?'))return;
  try{await dbRpc('bodycare_remove_nutrition_plan_item',{p_item_id:id});await syncDoctorNutrition(doctorPatientDetail.profile.user_id,false);renderDoctorNutritionSection()}
  catch(err){alert('No fue posible quitar el alimento: '+err.message)}
}
async function saveCustomNutritionFood(e){
  e.preventDefault();
  try{
    await dbRpc('bodycare_save_custom_nutrition_food',{
      p_name:document.getElementById('customFoodName').value.trim(),p_category:document.getElementById('customFoodCategory').value.trim(),
      p_serving_label:document.getElementById('customFoodServingLabel').value.trim()||null,p_serving_grams:Number(document.getElementById('customFoodServingGrams').value),
      p_kcal_100g:Number(document.getElementById('customFoodKcal').value),p_protein_100g:Number(document.getElementById('customFoodProtein').value),
      p_sugars_100g:Number(document.getElementById('customFoodSugar').value),p_fat_100g:Number(document.getElementById('customFoodFat').value),
      p_source_detail:document.getElementById('customFoodSource').value.trim()||null
    });
    await syncDoctorNutrition(doctorPatientDetail.profile.user_id,false);renderDoctorNutritionSection();
    showToast('Alimento agregado','Ya está disponible en tu catálogo nutricional.','NUTRITION_PLAN_UPDATED');
  }catch(err){alert('No fue posible guardar el alimento: '+err.message)}
}
function bindDoctorNutrition(){
  document.getElementById('activateDetoxPlan')?.addEventListener('click',activateDoctorDetoxPlan);
  document.getElementById('doctorNutritionTargetsForm')?.addEventListener('submit',saveDoctorNutritionTargets);
  document.getElementById('doctorNutritionItemForm')?.addEventListener('submit',saveDoctorNutritionItem);
  document.getElementById('customNutritionFoodForm')?.addEventListener('submit',saveCustomNutritionFood);
  document.getElementById('cancelNutritionItemEdit')?.addEventListener('click',()=>{editingNutritionPlanItemId=null;renderDoctorNutritionSection()});
  document.querySelectorAll('[data-edit-nutrition-item]').forEach(btn=>btn.addEventListener('click',()=>{editingNutritionPlanItemId=btn.dataset.editNutritionItem;renderDoctorNutritionSection();document.getElementById('doctorNutritionSection')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  document.querySelectorAll('[data-remove-nutrition-item]').forEach(btn=>btn.addEventListener('click',()=>removeDoctorNutritionItem(btn.dataset.removeNutritionItem)));
  const food=document.getElementById('nutritionItemFood'),grams=document.getElementById('nutritionItemGrams');
  if(food&&grams&&!editingNutritionPlanItemId){
    const f=doctorNutritionCatalog().find(x=>x.id===food.value);if(f)grams.value=String(Math.round(Number(f.reference_serving_grams||100)));
    food.addEventListener('change',()=>{const x=doctorNutritionCatalog().find(v=>v.id===food.value);if(x)grams.value=String(Math.round(Number(x.reference_serving_grams||100)))});
  }
}

function doctorPatientDetailView(){
  const d=doctorPatientDetail;if(!d)return doctorView();
  const p=d.profile,recs=d.records,latest=recs.at(-1);
  const waist=[...recs].reverse().find(r=>r.abdominal_circumference_cm!==null&&r.abdominal_circumference_cm!==undefined);
  const editing=d.prescriptions.find(rx=>rx.id===editingPrescriptionId)||null;
  app.innerHTML=shell(`${header()}
    <section class="card"><div class="doctor-patient-header"><div><button class="linkbtn" id="backPatients">← Mis pacientes</button><h2 class="section-title">${esc(p.full_name)}</h2><div class="muted">Seguimiento desde ${fmt(p.start_date)}</div></div><button type="button" class="primary" id="doctorLongitudinalReport">Generar informe</button></div></section>
    ${doctorAlertPanelMarkup()}
    ${patientOutcomeSummaryMarkup(p.user_id)}
    <section class="metrics">
      <div class="metric"><span>Peso inicial</span><strong>${kg(p.initial_weight_kg)}</strong></div>
      <div class="metric"><span>Peso actual</span><strong>${latest?kg(latest.weight_kg):'—'}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${p.target_weight_kg?kg(p.target_weight_kg):'—'}</strong></div>
      <div class="metric"><span>Cintura actual</span><strong>${waist?cm(waist.abdominal_circumference_cm):'—'}</strong></div>
    </section>
    ${doctorCarePlanSectionMarkup()}
    <section class="card"><h2 class="section-title">Evolución de peso</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'weight_kg',p.target_weight_kg?Number(p.target_weight_kg):null,'Peso (kg)','kg')}</div></section>
    <section class="card"><h2 class="section-title">Circunferencia abdominal</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'abdominal_circumference_cm',null,'Circunferencia (cm)','cm')}</div></section>
    <section class="card" id="doctorControlsSection">
      <div class="card-head">
        <div>
          <h2 class="section-title">Controles</h2>
          <div class="muted">Agenda, completa o registra inasistencias. El paciente verá el estado y los resúmenes compartidos.</div>
        </div>
      </div>
      <form id="doctorControlForm" class="control-form">
        <div class="grid control-grid">
          <div>
            <label for="doctorControlDate">Fecha</label>
            <input id="doctorControlDate" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-date-cl value="${formatDateCL(today())}" required>
          </div>
          <div>
            <label for="doctorControlTime">Hora</label>
            <div class="time-control-frame">
              <input id="doctorControlTime" type="time" required>
            </div>
          </div>
        </div>
        <div id="doctorControlSlotInfo" class="slot-info control-slot-info-full">Bloques definidos en tu perfil: ${validControlSlotMinutes(doctorProfile?.control_slot_minutes||30)} minutos.</div>
        <div id="doctorControlAvailability" class="control-availability"></div>
        <label for="doctorControlNotes" style="margin-top:10px">Observación <span class="muted">(opcional)</span></label>
        <textarea id="doctorControlNotes" rows="2" maxlength="1000" placeholder="Ej: control de evolución"></textarea>
        <div class="form-actions"><button class="primary" type="submit">Registrar control</button></div>
      </form>
      <div id="doctorControlSyncStatus" class="control-sync-status syncing"><span class="control-sync-dot"></span><span>Actualizando controles…</span></div>
      <div id="doctorControlList">${controlListMarkup(d.controls||[],'doctor')}</div>
    </section>

    ${doctorNutritionSectionMarkup()}

    <section class="card">
      <div class="card-head"><div><h2 class="section-title">Indicación farmacológica</h2><div class="muted">Crea una nueva indicación o selecciona una existente para editarla.</div></div></div>
      <div class="integration-note">La receta electrónica, firma y SNRE quedan pendientes. Esta versión permite crear, modificar, retirar y compartir la indicación dentro de BodyCare.</div>
      <div id="doctorPrescriptionFormWrap">${prescriptionFormMarkup(editing)}</div>
      <div id="doctorPrescriptionSyncStatus" class="rx-sync-status syncing"><span class="rx-sync-dot"></span><span>Actualizando indicaciones…</span></div>
      <div id="doctorPrescriptionList">${doctorPrescriptionListMarkup()}</div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2 class="section-title">Mensajes</h2><div class="muted">Puedes eliminar tus mensajes enviados o limpiar todo el historial visible.</div></div><button type="button" class="link-danger" id="doctorClearConversation">Eliminar historial</button></div>
      <div id="doctorChatSyncStatus" class="chat-sync-status syncing"><span class="chat-sync-dot"></span><span>Actualizando conversación…</span></div>
      <div class="message-thread" id="doctorMessageThread"></div>
      <form id="doctorMessageForm" class="message-form"><textarea id="doctorMessageText" rows="3" maxlength="4000" required placeholder="Escribe al paciente..."></textarea><button class="primary" type="submit">Enviar mensaje</button></form>
    </section>
    <section class="card"><h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Circunferencia</th></tr></thead>
      <tbody>${recs.map(r=>`<tr><td>${fmt(r.measured_on)}</td><td>${weekOfFor(r.measured_on,p)}</td><td>${kg(r.weight_kg)}</td><td>${cm(r.abdominal_circumference_cm)}</td></tr>`).join('')}</tbody></table></div>
    </section>

    ${doctorTimelineSectionMarkup()}`);
  bindCommonHeader();
  bindDoctorAlertPanel();
  bindDoctorCarePlan();
  bindDoctorNutrition();
  bindDoctorTimeline();
  document.getElementById('doctorLongitudinalReport')?.addEventListener('click',generateDoctorLongitudinalReport);
  renderDoctorMessageThread();
  renderDoctorPrescriptionList();
  renderDoctorControls();
  bindControlAvailabilityEvents('doctor');
  document.getElementById('doctorControlForm')?.addEventListener('submit',createDoctorControl);
  document.getElementById('doctorControlSyncStatus')?.addEventListener('click',()=>syncDoctorControls(p.user_id));
  bindDateCLInputs();
  document.getElementById('backPatients')?.addEventListener('click',()=>{editingPrescriptionId=null;editingCareGoalId=null;editingCareActionId=null;doctorTimelineFilter='ALL';doctorTimelineLastSync=0;doctorPatientDetail=null;doctorView()});
  bindDoctorPrescriptionForm();
  document.getElementById('doctorPrescriptionSyncStatus')?.addEventListener('click',()=>syncDoctorPrescriptions(p.user_id));
  document.getElementById('doctorMessageForm')?.addEventListener('submit',sendDoctorMessage);
  document.getElementById('doctorChatSyncStatus')?.addEventListener('click',()=>syncDoctorMessages(p.user_id));
  document.getElementById('doctorClearConversation')?.addEventListener('click',()=>clearConversation(currentUser.id,p.user_id,'doctor'));
}

async function saveDoctorPrescription(e){
  e.preventDefault();
  const p=doctorPatientDetail.profile;
  const medicationSelect=document.getElementById('rxMedicationSelect');
  const selectedEntry=WEIGHT_RX_CATALOG.find(x=>x.id===medicationSelect?.value)||null;

  let rxStartDate;
  try{
    rxStartDate=requireDateCL('rxStart','Fecha de inicio de la indicación',true);
  }catch(err){
    alert(err.message);
    return;
  }

  const payload={
    medication_name:medicationSelect?.value===RX_OTHER
      ? document.getElementById('rxMedicationOther')?.value.trim()
      : selectedEntry?.medication||'',
    active_ingredient:rxResolvedValue('rxIngredientSelect','rxIngredientOther')||null,
    route_text:rxResolvedValue('rxRouteSelect','rxRouteOther')||null,
    dose_text:rxResolvedValue('rxDoseSelect','rxDoseOther'),
    frequency_text:rxResolvedValue('rxFrequencySelect','rxFrequencyOther'),
    start_date:rxStartDate,
    duration_text:rxResolvedValue('rxDurationSelect','rxDurationOther')||null,
    instructions:document.getElementById('rxInstructions').value.trim()||null
  };

  if(!payload.medication_name||!payload.active_ingredient||!payload.dose_text||!payload.frequency_text){
    alert('Completa medicamento, principio activo, dosis y frecuencia antes de guardar.');
    return;
  }

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  setPrescriptionSyncStatus('doctor','syncing',editingPrescriptionId?'Guardando cambios…':'Compartiendo indicación…');

  try{
    const rows=await dbRpc('bodycare_save_prescription',{
      p_prescription_id:editingPrescriptionId||null,
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:p.user_id,
      p_medication_name:payload.medication_name,
      p_active_ingredient:payload.active_ingredient,
      p_dose_text:payload.dose_text,
      p_frequency_text:payload.frequency_text,
      p_route_text:payload.route_text,
      p_start_date:payload.start_date,
      p_duration_text:payload.duration_text,
      p_instructions:payload.instructions
    });

    const saved=Array.isArray(rows)?rows[0]:rows;
    if(!saved?.id)throw new Error('No se recibió confirmación de la indicación guardada.');

    const existed=(doctorPatientDetail.prescriptions||[]).some(rx=>rx.id===saved.id);
    doctorPatientDetail.prescriptions=[
      saved,
      ...(doctorPatientDetail.prescriptions||[]).filter(rx=>rx.id!==saved.id)
    ].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));

    editingPrescriptionId=null;
    renderDoctorPrescriptionList();
    renderDoctorPrescriptionForm();
    setPrescriptionSyncStatus('doctor','ok',existed?'Indicación actualizada y compartida':'Indicación creada y compartida');
    showToast(
      existed?'Indicación actualizada':'Indicación compartida',
      'El paciente recibirá la actualización automáticamente.',
      existed?'PRESCRIPTION_UPDATED':'NEW_PRESCRIPTION'
    );

    await syncDoctorPrescriptions(p.user_id);
    await syncDoctorTimeline(true,true);
  }catch(err){
    setPrescriptionSyncStatus('doctor','error','No se pudo guardar la indicación. Toca aquí para reintentar.');
    alert(err.message);
  }finally{
    if(button)button.disabled=false;
  }
}

async function deleteDoctorPrescription(id){
  const rx=doctorPatientDetail?.prescriptions?.find(x=>x.id===id);
  if(!rx)return;

  if(!confirm(`¿Eliminar la indicación de ${rx.medication_name}? El paciente dejará de verla. La acción quedará auditada.`))return;

  const previousPrescriptions=[...(doctorPatientDetail.prescriptions||[])];
  const wasEditing=editingPrescriptionId===id;

  // Optimistic UI: remove immediately before waiting for Supabase.
  doctorPatientDetail.prescriptions=previousPrescriptions.filter(p=>p.id!==id);

  if(wasEditing){
    editingPrescriptionId=null;
    renderDoctorPrescriptionForm();
  }

  renderDoctorPrescriptionList();
  setPrescriptionSyncStatus('doctor','syncing','Retirando indicación…');

  try{
    await dbRpc('delete_prescription_draft',{p_prescription_id:id});

    setPrescriptionSyncStatus('doctor','ok','Indicación retirada');
    showToast(
      'Indicación retirada',
      'La indicación fue eliminada y el paciente dejará de verla automáticamente.',
      'PRESCRIPTION_REMOVED'
    );

    // Reconcile only prescription data after the UI has already updated.
    syncDoctorPrescriptions(doctorPatientDetail.profile.user_id).catch(err=>{
      console.warn('Prescription reconcile after delete',err);
    });
    syncDoctorTimeline(true,true).catch(err=>console.warn('Timeline reconcile after prescription delete',err));
  }catch(err){
    // Restore UI if backend deletion failed.
    doctorPatientDetail.prescriptions=previousPrescriptions;

    if(wasEditing){
      editingPrescriptionId=id;
      renderDoctorPrescriptionForm();
    }

    renderDoctorPrescriptionList();
    setPrescriptionSyncStatus('doctor','error','No se pudo retirar la indicación. Se restauró en pantalla.');
    alert(err.message);
  }
}

async function deleteSentMessage(id,context){
  if(!confirm('¿Eliminar este mensaje enviado? Desaparecerá de la conversación para ambos participantes.'))return;
  try{
    await dbRpc('delete_care_message',{p_message_id:id});

    if(context==='patient'){
      patientMessages=patientMessages.filter(m=>m.id!==id);
      renderPatientMessageThread();
      await syncPatientMessages();
    }else if(doctorPatientDetail){
      const patientId=doctorPatientDetail.profile.user_id;
      doctorPatientDetail.messages=(doctorPatientDetail.messages||[]).filter(m=>m.id!==id);
      renderDoctorMessageThread();
      await syncDoctorMessages(patientId);
    }
  }catch(err){alert(err.message)}
}

async function clearConversation(doctorId,patientId,context){
  if(!confirm('Esta acción eliminará todo el historial visible de la conversación para médico y paciente. Los eventos quedarán auditados. ¿Continuar?'))return;
  if(prompt('Escribe ELIMINAR para confirmar:')!=='ELIMINAR')return;

  try{
    await dbRpc('clear_care_conversation',{p_doctor_user_id:doctorId,p_patient_user_id:patientId});

    if(context==='patient'){
      patientMessages=[];
      renderPatientMessageThread();
      await syncPatientMessages();
    }else if(doctorPatientDetail){
      doctorPatientDetail.messages=[];
      renderDoctorMessageThread();
      await syncDoctorMessages(patientId);
    }

    showToast('Conversación eliminada','El historial visible fue eliminado correctamente.','CONVERSATION_CLEARED');
  }catch(err){alert(err.message)}
}

async function sendDoctorMessage(e){
  e.preventDefault();

  const p=doctorPatientDetail.profile;
  const input=document.getElementById('doctorMessageText');
  const message=input?.value.trim();
  if(!message)return;

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;

  const tempId=`pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pendingRow={
    id:tempId,
    doctor_user_id:currentUser.id,
    patient_user_id:p.user_id,
    sender_user_id:currentUser.id,
    message,
    created_at:new Date().toISOString(),
    pending:true
  };

  doctorPatientDetail.messages=[
    ...(doctorPatientDetail.messages||[]).filter(m=>!String(m.id).startsWith('pending-')),
    pendingRow
  ].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));

  input.value='';
  renderDoctorMessageThread();
  setChatSyncStatus('doctor','syncing','Enviando mensaje…');

  try{
    const rows=await dbRpc('bodycare_send_message',{
      p_doctor_user_id:currentUser.id,
      p_patient_user_id:p.user_id,
      p_message:message
    });

    const saved=Array.isArray(rows)?rows[0]:rows;

    doctorPatientDetail.messages=(doctorPatientDetail.messages||[]).filter(m=>m.id!==tempId);
    if(saved?.id){
      doctorPatientDetail.messages=[
        ...(doctorPatientDetail.messages||[]).filter(m=>m.id!==saved.id),
        saved
      ].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    }

    renderDoctorMessageThread();
    setChatSyncStatus('doctor','ok','Mensaje enviado');
    await syncDoctorMessages(p.user_id);
  }catch(err){
    doctorPatientDetail.messages=(doctorPatientDetail.messages||[]).filter(m=>m.id!==tempId);
    renderDoctorMessageThread();
    input.value=message;
    setChatSyncStatus('doctor','error','No se pudo enviar. Toca aquí para reintentar.');
    alert(err.message);
  }finally{
    if(button)button.disabled=false;
  }
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
    app.innerHTML=shell(`${header()}<section class="card"><div class="loading">Cargando BodyCare Admin…</div></section>`);
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
    <section class="card admin-hero"><div><h2 class="section-title">BodyCare Admin</h2><div class="muted">Gestión de usuarios, accesos y soporte</div></div><span class="owner-chip">${account?.is_owner?'Owner':'Administrador'}</span></section>
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

async function saveWeightRecord(e){
  e.preventDefault();

  const weight_kg=parseDecimal(document.getElementById('weight').value);
  const abdominal_circumference_cm=parseDecimal(document.getElementById('abdomen').value);
  const msg=document.getElementById('weightMsg');
  msg.textContent='';

  let measured_on;
  try{
    measured_on=requireDateCL('date','Fecha del registro');
  }catch(err){
    msg.textContent=err.message;
    return;
  }

  const editing=editingWeightRecordId?records.find(r=>r.id===editingWeightRecordId)||null:null;

  if(!editing?.is_initial && parseDate(measured_on)<parseDate(profile.start_date)){
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

  const button=e.submitter||e.target.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  msg.className='muted';
  msg.textContent=editing?'Guardando cambios…':'Guardando registro…';

  try{
    const rows=await dbRpc('bodycare_save_weight_record',{
      p_record_id:editingWeightRecordId||null,
      p_measured_on:measured_on,
      p_weight_kg:weight_kg,
      p_abdominal_circumference_cm:abdominal_circumference_cm
    });

    const saved=Array.isArray(rows)?rows[0]:rows;
    if(!saved?.id)throw new Error('No se recibió confirmación del registro guardado.');

    // Update local state immediately; do not wait for a full loadData().
    records=[
      ...records.filter(r=>r.id!==saved.id),
      saved
    ].filter(r=>!r.deleted_at)
     .sort((a,b)=>String(a.measured_on).localeCompare(String(b.measured_on))||String(a.created_at).localeCompare(String(b.created_at)));

    if(saved.is_initial){
      profile={
        ...profile,
        initial_weight_kg:saved.weight_kg,
        initial_abdominal_circumference_cm:saved.abdominal_circumference_cm
      };
    }

    editingWeightRecordId=null;
    dashboardView();
    syncPatientReminderPlan(false).catch(()=>{});

    showToast(
      editing?'Registro actualizado':'Registro guardado',
      editing?'Los cambios se reflejaron en tu seguimiento.':'Tu peso y circunferencia se actualizaron inmediatamente.',
      editing?'WEIGHT_UPDATED':'NEW_WEIGHT'
    );
  }catch(err){
    msg.className='error';
    msg.textContent='No fue posible guardar el registro: '+err.message;
    if(button)button.disabled=false;
  }
}

async function deleteWeightRecord(id){
  const record=records.find(r=>r.id===id);
  if(!record)return;
  if(record.is_initial){
    alert('El registro inicial no puede eliminarse. Puedes editar sus valores si necesitas corregirlos.');
    return;
  }

  if(!confirm(`¿Eliminar el registro del ${fmt(record.measured_on)}? Dejará de afectar tus métricas y gráficos.`))return;

  const previous=[...records];

  // Optimistic removal.
  records=records.filter(r=>r.id!==id);
  if(editingWeightRecordId===id)editingWeightRecordId=null;
  dashboardView();

  try{
    await dbRpc('bodycare_delete_weight_record',{p_record_id:id});
    showToast('Registro eliminado','El registro fue retirado del seguimiento y quedó conservado para auditoría.','WEIGHT_REMOVED');
  }catch(err){
    records=previous;
    dashboardView();
    alert('No fue posible eliminar el registro: '+err.message);
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
  sessionRefreshPromise=null;
  if(contextSyncTimer){clearInterval(contextSyncTimer);contextSyncTimer=null}
  try{if(session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:authHeaders(session.access_token)})}catch{}
  clearStoredSession();sessionStorage.removeItem(PASSKEY_UNLOCKED_KEY);session=null;currentUser=null;profile=null;records=[];account=null;roles=[];careLinks=[];linkedDoctorProfiles=[];patientControls=[];doctorProfile=null;doctorPatients=[];doctorPriorities=[];doctorAlertSettings=null;doctorAgenda=[];doctorOutcomes=[];doctorTimelineFilter='ALL';doctorTimelineLastSync=0;patientReminderPlan=null;patientReminderSaving=false;patientReminderDirty=false;patientNutritionPlan={plan:null,items:[]};patientNutritionCatalog=[];patientNutritionDay=null;patientNutritionDoctorId=null;doctorPatientDetail=null;editingPrescriptionId=null;editingWeightRecordId=null;adminUsers=[];adminTickets=[];adminLoaded=false;loginView();
}

async function boot(){
  try{
    const confirmed=captureConfirmationHash();
    const localPasskey=localStorage.getItem(PASSKEY_LOCAL_KEY)==='true';
    const unlocked=sessionStorage.getItem(PASSKEY_UNLOCKED_KEY)==='true';

    // A new PWA/browser session with a locally enrolled passkey starts behind the biometric gate.
    // Normal page refreshes within the same session remain unlocked.
    if(localPasskey&&!unlocked&&passkeyClientSupported()){
      biometricGateView(confirmed?'Correo confirmado. Ya puedes acceder con biometría.':'');
      return;
    }

    if(await ensureSession()){
      sessionStorage.setItem(PASSKEY_UNLOCKED_KEY,'true');
      await loadData();
      render();
      startRealtime();
      await handleLaunchNotification();
    } else {
      loginView(confirmed?'Correo confirmado. Ya puedes ingresar.':'');
    }
  }catch(err){
    console.error(err);
    loginView();
    const m=document.getElementById('authMsg');if(m)m.textContent='No fue posible conectar con el servicio. Recarga la página.';
  }
}
boot();
})();
