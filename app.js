
(function(){
'use strict';

const SUPABASE_URL='https://lqmfgxftazazqvultewm.supabase.co';
const SUPABASE_KEY='sb_publishable_jPT0bQ9OuTC8XYqypqWY5w_GTDI7bGl';
const APP_URL='https://lsueyras.github.io/pesocare/';
const BRAND_LOGO_URL=APP_URL+'brand-logo.png';
const APP_VERSION='16.4';
const VAPID_PUBLIC_KEY='BFmDmOAgsUFCZO8zPzgfCAwK8oEWdoGppWH-bojgffhCbIm4jkil637a4c7O_ObCgAATS1muWhHniGj-ZdBc31k';
const BRAND_BUILD='BodyCare';
const SESSION_KEY='pesocare_session_v2';
const REMEMBER_KEY='pesocare_remember_me';
const SIGNUP_COOLDOWN_KEY='pesocare_signup_cooldown_until';

const app=document.getElementById('app');
let session=null, currentUser=null, profile=null, records=[];
let account=null, roles=[], activePortal='PATIENT';
let careLinks=[], linkedDoctorProfiles=[], patientPrescriptions=[], patientMessages=[], patientControls=[], supportTickets=[];
let doctorProfile=null, doctorPatients=[], doctorPatientDetail=null;
let doctorPriorities=[], doctorAlertSettings=null;
let adminUsers=[], adminTickets=[], adminLoaded=false;
let editingPrescriptionId=null;
let editingWeightRecordId=null;
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
let notificationPreferences={push_enabled:true,messages:true,prescriptions:true,care_updates:true,support:true};
let pushBrowserSubscription=null;
let pushSettingsLoaded=false;
let launchNotificationId=new URLSearchParams(location.search).get('notification');
let sessionRefreshPromise=null;


const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
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


function unreadCount(){
  return notifications.filter(n=>!n.read_at).length;
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
        support:prefs[0].support!==false
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
      support:saved.support!==false
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
    SUPPORT:'Abrir soporte',
    PUSH_TEST:'Abrir BodyCare',
    NEW_CONTROL:'Ver control',
    CONTROL_CANCELLED:'Ver controles',
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

  if(['NEW_CONTROL','CONTROL_CANCELLED'].includes(n.type)){
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

    if(['NEW_CONTROL','CONTROL_CANCELLED'].includes(n.type)){
      if(hasRole('PATIENT')&&activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
        await syncPatientControls();
      }
      if(hasRole('DOCTOR')&&doctorPatientDetail?.profile?.user_id===n.related_user_id){
        await syncDoctorControls(n.related_user_id);
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

function loginView(message=''){
  app.innerHTML=shell(`
    <section class="card auth-card">
      ${brandBlock('Seguimiento personal · Salud y progreso')}
      <p class="muted">Registra tu evolución, revisa tu historial, mantente conectado con tu médico y sigue tus indicaciones en un solo lugar.</p>
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
  doctorProfile=null;doctorPatients=[];doctorPriorities=[];doctorAlertSettings=null;

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
  return notifications.filter(n=>!n.read_at&&[
    'NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED',
    'NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'
  ].includes(n.type)).length;
}

function patientSubTabsMarkup(){
  const medicalCount=medicalUnreadCount();
  const openTickets=(supportTickets||[]).filter(t=>t.status!=='RESOLVED').length;
  return `<nav class="patient-subtabs" aria-label="Secciones del paciente">
    <button type="button" class="patient-subtab ${activePatientTab==='TRACKING'?'active':''}" data-patient-tab="TRACKING">Seguimiento</button>
    <button type="button" class="patient-subtab ${activePatientTab==='DOCTOR'?'active':''}" data-patient-tab="DOCTOR">
      Mi médico ${medicalCount?`<span class="subtab-badge">${medicalCount>99?'99+':medicalCount}</span>`:''}
    </button>
    <button type="button" class="patient-subtab ${activePatientTab==='SUPPORT'?'active':''}" data-patient-tab="SUPPORT">
      Soporte ${openTickets?`<span class="subtab-badge neutral">${openTickets}</span>`:''}
    </button>
  </nav>`;
}

function bindPatientSubTabs(){
  document.querySelectorAll('[data-patient-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const next=btn.dataset.patientTab;
      if(!['TRACKING','DOCTOR','SUPPORT'].includes(next))return;
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
    if(activePortal==='PATIENT'&&activePatientTab==='DOCTOR')await syncPatientMedicalData();
    else if(activePortal==='PATIENT'&&activePatientTab==='SUPPORT')await syncSupportTickets();
    else if(activePortal==='DOCTOR'&&doctorPatientDetail?.profile?.user_id)await syncDoctorMedicalData(doctorPatientDetail.profile.user_id);
  }catch(err){console.warn('Context sync failed',err)}
}

function startContextSync(){
  if(contextSyncTimer){clearInterval(contextSyncTimer);contextSyncTimer=null}
  bindLifecycleSync();

  if(activePortal==='PATIENT'&&activePatientTab==='DOCTOR'){
    syncPatientMedicalData();
    contextSyncTimer=setInterval(()=>syncPatientMedicalData(),3000);
  }else if(activePortal==='PATIENT'&&activePatientTab==='SUPPORT'){
    syncSupportTickets();
    contextSyncTimer=setInterval(()=>syncSupportTickets(),10000);
  }else if(activePortal==='DOCTOR'&&doctorPatientDetail?.profile?.user_id){
    const patientId=doctorPatientDetail.profile.user_id;
    syncDoctorMedicalData(patientId);
    contextSyncTimer=setInterval(()=>syncDoctorMedicalData(patientId),3000);
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
    <section class="card"><h2 class="section-title">Peso por semana</h2><div class="muted">Evolución desde Semana 0 hasta Semana ${profile.planned_weeks}</div><div id="chart" class="chart-wrap"></div></section>
    <section class="card"><h2 class="section-title">Circunferencia abdominal por semana</h2><div class="muted">Evolución en centímetros durante el seguimiento</div><div id="abdomenChart" class="chart-wrap"></div></section>
    <section class="card">
      <h2 class="section-title">Historial</h2>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Semana</th><th>Peso</th><th>Circ. abdominal</th><th>Acciones</th></tr></thead>
      <tbody>${sorted.map(r=>`<tr>
        <td>${fmt(r.measured_on)}${r.is_initial?' <span class="initial-record-chip">Inicial</span>':''}</td>
        <td>${weekOf(r.measured_on)}</td>
        <td>${kg(r.weight_kg)}</td>
        <td>${cm(r.abdominal_circumference_cm)}</td>
        <td><div class="record-actions">
          <button type="button" class="secondary small-btn" data-edit-weight="${r.id}">Editar</button>
          ${r.is_initial?'':`<button type="button" class="secondary small-btn danger-outline" data-delete-weight="${r.id}">Eliminar</button>`}
        </div></td>
      </tr>`).join('')}</tbody></table></div>
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

    <section class="card" id="patientControlsSection">
      <div class="card-head">
        <div>
          <h2 class="section-title">Controles</h2>
          <div class="muted">Médico y paciente pueden registrar un nuevo control. El cambio queda compartido automáticamente.</div>
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

function controlListMarkup(rows,context){
  const list=[...(rows||[])]
    .filter(c=>c.status==='SCHEDULED')
    .sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  if(!list.length)return '<div class="empty-state">Aún no hay controles agendados.</div>';

  return `<div class="control-list">${list.map(c=>`
    <div class="control-card">
      <div class="control-card-main">
        <div class="control-date">${esc(formatControlDateTime(c.scheduled_at))}</div>
        <div class="control-meta">
          <span class="control-status scheduled">Agendado</span>
          <span>${esc(controlCreatorLabel(c,context))}</span>
          <span>${validControlSlotMinutes(c.slot_minutes||30)} min</span>
        </div>
        ${c.notes?`<div class="control-notes">${esc(c.notes)}</div>`:''}
      </div>
      <button type="button" class="secondary small-btn control-cancel-btn" data-cancel-control="${c.id}" data-control-context="${context}">Cancelar</button>
    </div>`).join('')}</div>`;
}

function setControlSyncStatus(context,state,text){
  const el=document.getElementById(context==='patient'?'patientControlSyncStatus':'doctorControlSyncStatus');
  if(!el)return;
  el.className=`control-sync-status ${state||''}`;
  const label=el.querySelector('span:last-child');
  if(label)label.textContent=text;
}

function bindControlCancelButtons(root=document){
  root.querySelectorAll('[data-cancel-control]').forEach(btn=>{
    btn.addEventListener('click',()=>cancelSharedControl(btn.dataset.cancelControl,btn.dataset.controlContext));
  });
}

function renderPatientControls(){
  const el=document.getElementById('patientControlList');
  if(!el)return;
  el.innerHTML=controlListMarkup(patientControls,'patient');
  bindControlCancelButtons(el);
}

function renderDoctorControls(){
  const el=document.getElementById('doctorControlList');
  if(!el||!doctorPatientDetail)return;
  el.innerHTML=controlListMarkup(doctorPatientDetail.controls||[],'doctor');
  bindControlCancelButtons(el);
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

async function cancelSharedControl(id,context){
  const source=context==='doctor'?(doctorPatientDetail?.controls||[]):patientControls;
  const item=source.find(c=>c.id===id);
  if(!item||item.status==='CANCELLED')return;

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
        technical_context:{user_agent:navigator.userAgent,url:location.href,app_version:'BodyCare v16.4'}
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
  notifications.filter(n=>!n.read_at&&[
    'NEW_PRESCRIPTION','PRESCRIPTION_UPDATED','PRESCRIPTION_REMOVED'
  ].includes(n.type)).forEach(n=>markNotificationRead(n.id));
  if(selectedDoctor){
    notifications.filter(n=>!n.read_at&&[
      'NEW_MESSAGE','MESSAGE_DELETED','CONVERSATION_CLEARED'
    ].includes(n.type)&&n.related_user_id===selectedDoctor).forEach(n=>markNotificationRead(n.id));
  }
  if(selectedControlDoctor){
    notifications.filter(n=>!n.read_at&&[
      'NEW_CONTROL','CONTROL_CANCELLED'
    ].includes(n.type)&&n.related_user_id===selectedControlDoctor).forEach(n=>markNotificationRead(n.id));
  }
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
  await Promise.allSettled([syncDoctorMessages(patientId),syncDoctorPrescriptions(patientId),syncDoctorControls(patientId)]);
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
    abdominal_increase_cm:5
  };
}

async function saveDoctorAlertSettings(e){
  e.preventDefault();
  const noRecord=Number(document.getElementById('alertNoRecordDays')?.value);
  const gain=Number(document.getElementById('alertWeightGainPct')?.value);
  const loss=Number(document.getElementById('alertRapidLossPct')?.value);
  const abdomen=Number(document.getElementById('alertAbdominalIncrease')?.value);

  try{
    const rows=await dbRpc('bodycare_save_alert_settings',{
      p_no_record_days:noRecord,
      p_weight_gain_pct:gain,
      p_rapid_loss_pct:loss,
      p_abdominal_increase_cm:abdomen
    });
    doctorAlertSettings=Array.isArray(rows)?rows[0]:rows;
    await syncDoctorPriorities(true);
    showToast('Criterios actualizados','BodyCare aplicará estos umbrales a los nuevos registros.','CLINICAL_ALERT');
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
          <div class="clinical-settings-note">Estos criterios organizan la revisión de pacientes y no representan por sí mismos una conclusión clínica.</div>
          <button class="secondary" type="submit" style="margin-top:12px">Guardar criterios</button>
        </form>
      </section>`}
  `);

  bindCommonHeader();
  document.getElementById('doctorProfileForm')?.addEventListener('submit',saveDoctorProfile);
  document.getElementById('doctorAlertSettingsForm')?.addEventListener('submit',saveDoctorAlertSettings);

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
    try{doctorPriorities=await dbRpc('bodycare_get_doctor_priorities',{})||[]}catch{}
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
    doctorPatientDetail={profile:p,records:recs,prescriptions,messages,controls};
    const matching=notifications.filter(n=>!n.read_at&&[
      'NEW_MESSAGE','NEW_CONTROL','CONTROL_CANCELLED','CLINICAL_ALERT'
    ].includes(n.type)&&n.related_user_id===patientId);
    for(const n of matching)markNotificationRead(n.id);
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
    ${doctorAlertPanelMarkup()}
    <section class="metrics">
      <div class="metric"><span>Peso inicial</span><strong>${kg(p.initial_weight_kg)}</strong></div>
      <div class="metric"><span>Peso actual</span><strong>${latest?kg(latest.weight_kg):'—'}</strong></div>
      <div class="metric"><span>Peso meta</span><strong>${p.target_weight_kg?kg(p.target_weight_kg):'—'}</strong></div>
      <div class="metric"><span>Cintura actual</span><strong>${waist?cm(waist.abdominal_circumference_cm):'—'}</strong></div>
    </section>
    <section class="card"><h2 class="section-title">Evolución de peso</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'weight_kg',p.target_weight_kg?Number(p.target_weight_kg):null,'Peso (kg)','kg')}</div></section>
    <section class="card"><h2 class="section-title">Circunferencia abdominal</h2><div class="chart-wrap">${buildStandaloneChart(recs,p,'abdominal_circumference_cm',null,'Circunferencia (cm)','cm')}</div></section>
    <section class="card" id="doctorControlsSection">
      <div class="card-head">
        <div>
          <h2 class="section-title">Controles</h2>
          <div class="muted">Registra un nuevo control. El paciente lo verá de inmediato y recibirá una notificación.</div>
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
    </section>`);
  bindCommonHeader();
  bindDoctorAlertPanel();
  renderDoctorMessageThread();
  renderDoctorPrescriptionList();
  renderDoctorControls();
  bindControlAvailabilityEvents('doctor');
  document.getElementById('doctorControlForm')?.addEventListener('submit',createDoctorControl);
  document.getElementById('doctorControlSyncStatus')?.addEventListener('click',()=>syncDoctorControls(p.user_id));
  bindDateCLInputs();
  document.getElementById('backPatients')?.addEventListener('click',()=>{editingPrescriptionId=null;doctorPatientDetail=null;doctorView()});
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
  clearStoredSession();session=null;currentUser=null;profile=null;records=[];account=null;roles=[];careLinks=[];linkedDoctorProfiles=[];patientControls=[];doctorProfile=null;doctorPatients=[];doctorPriorities=[];doctorAlertSettings=null;doctorPatientDetail=null;editingPrescriptionId=null;editingWeightRecordId=null;adminUsers=[];adminTickets=[];adminLoaded=false;loginView();
}

async function boot(){
  try{
    const confirmed=captureConfirmationHash();
    if(await ensureSession()){
      await loadData();
      render();
      startRealtime();
      await handleLaunchNotification();
    } else loginView(confirmed?'Correo confirmado. Ya puedes ingresar.':'');
  }catch(err){
    console.error(err);
    loginView();
    const m=document.getElementById('authMsg');if(m)m.textContent='No fue posible conectar con el servicio. Recarga la página.';
  }
}
boot();
})();
