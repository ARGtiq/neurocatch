const $=s=>document.querySelector(s);

/* ---------- state ---------- */
let catches=[], history=[], currentEntry=null, bookmarks=[];
let settings={key:'',model:'gemini-2.5-flash',themeMode:'dark',seed:'#7c5cff',prompt:'',sbUrl:'',sbKey:'',sbEmail:'',microlinkKey:'',microPerLink:false,microExclude:[],studyCustomName:'',studyCustomUrl:'',provider:'gemini',orKey:'',orModel:'',ollamaUrl:'',ollamaModel:'',clearAfter:true,autoClip:true,bg:'mesh',autoSync:true,preset:'standard',swipesOn:true,voiceAutoAdd:true,archiveDays:90};
let calCursor=new Date(); calCursor.setDate(1);
let filterDate=null, searchQuery='', tagFilter=null, hideDone=false, backTarget='#view-input', streamAbort=null, typewriterStop=false;
let showArchived=false;
let lastRitualDebug=null;
let taskCalMode='week', taskCalCursor=new Date(), selTaskDate=null, doneOpen=false, noteTagFilter=null, noteSearch='', noteCatFilterVal=null;
let taskGroupMode=(function(){try{return localStorage.getItem('neurocatch_task_group')||'none';}catch(e){return 'none';}})();
let matrixDate=''; // инициализируется ниже, после объявления dateKey() — см. строку после const dateKey=
let habits=[], curSubTab='tasks';
const EIS=[{n:'Срочно и важно',s:'Сделать сейчас',c:'q1'},{n:'Важно, не срочно',s:'Запланировать',c:'q2'},{n:'Срочно, не важно',s:'Делегировать',c:'q3'},{n:'Не срочно, не важно',s:'Не делать',c:'q4'}];
const PRESETS=['#4f378a','#7c5cff','#4aa8ff','#3ddc97','#f7a53b','#ff6b6b','#ff5c93','#22c7c7'];
const mql=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const APP_VERSION='2025.7-06';const SW_VER='v52';
const VAPID_PUBLIC_KEY='BJaLyd8hrKLUwqYuwUib6x6lt0iehguXj0tkHHfRJ2TyZzJJqWIG9OCUA006NnX096bNq-I-SSLZcTAA-Rv84gk';
let crumbs=[];function crumb(m){try{crumbs.push(new Date().toISOString().slice(11,19)+' '+m);if(crumbs.length>25)crumbs.shift();}catch(e){}}
let lastErrors=[];
window.addEventListener('error',e=>{lastErrors.push({t:Date.now(),msg:e.message,src:e.filename,line:e.lineno});if(lastErrors.length>10)lastErrors.shift();showErrorModal(e.message);});
window.addEventListener('unhandledrejection',e=>{const m='promise: '+(e.reason&&e.reason.message||e.reason);lastErrors.push({t:Date.now(),msg:m});if(lastErrors.length>10)lastErrors.shift();showErrorModal(m);});
let localUpdatedAt=0, applyingRemote=false, booting=true;

/* ---------- persistence ---------- */
function loadBookmarks(){try{bookmarks=JSON.parse(localStorage.getItem('neurocatch_bookmarks')||'[]');}catch(e){bookmarks=[];}}
function saveBookmarks(){localStorage.setItem('neurocatch_bookmarks',JSON.stringify(bookmarks));touchLocal();}
function normalizeUrl(u){
  try{const url=new URL(u);let host=url.hostname.replace(/^www\./,'').toLowerCase();let path=url.pathname.replace(/\/+$/,'')||'/';
    const params=[...url.searchParams.entries()].filter(([k])=>!/^(utm_|fbclid|gclid|yclid|ref|_ga)/i.test(k));
    params.sort((a,b)=>a[0].localeCompare(b[0]));const qs=params.map(([k,v])=>k+'='+v).join('&');
    return host+path+(qs?'?'+qs:'')+(url.hash&&!/^#(top|main)?$/i.test(url.hash)?url.hash:'');
  }catch(e){return String(u||'').trim().replace(/\/+$/,'').toLowerCase();}
}
function findBookmarkByUrl(u){const n=normalizeUrl(u);return bookmarks.find(x=>normalizeUrl(x.url)===n);}
function ingestBookmarks(list){let added=0,dupes=0;const dupeTitles=[];(list||[]).forEach(b=>{if(!b||!b.url)return;const ex=findBookmarkByUrl(b.url);if(ex){dupes++;dupeTitles.push(ex.title||b.title||hostOf(b.url));if(!ex.title&&b.title)ex.title=b.title;if(!ex.desc&&b.desc)ex.desc=b.desc;if((!ex.category||ex.category==='Прочее')&&b.category)ex.category=b.category;}else{bookmarks.unshift({id:uid('b'),url:b.url,title:b.title||hostOf(b.url),desc:b.desc||'',category:b.category||'Прочее',ts:Date.now()});added++;}});if(added||dupes)saveBookmarks();return {added,dupes,dupeTitles};}
function catList(){const set=new Set(['Инструменты','Библиотеки','ИИ','Дизайн','Обучение','Статьи','DevTools','Прочее']);bookmarks.forEach(b=>{if(b.category)set.add(b.category);});return [...set];}
function ensureEntry(e){
  if(!e.tags||!e.tasks||!e.links||!e.insights||!e.summaries){const d=parseMd(e.markdown);
    if(!e.tags)e.tags=d.tags;
    if(!e.tasks)e.tasks=d.tasks.map((t,i)=>({id:e.id+'_t'+i,text:t,done:false}));
    if(!e.links)e.links=assembleLinks(d,e.markdown);
    if(!e.insights)e.insights=d.insights||[];
    if(!e.summaries)e.summaries=d.summaries||[];}
  if(!e.bookmarks){try{e.bookmarks=parseMd(e.markdown).bookmarks||[];}catch(_){e.bookmarks=[];}}
  return e;
}
function loadAll(){
  const hadSettings=!!localStorage.getItem('neurocatch_settings');
  localUpdatedAt=+(localStorage.getItem('neurocatch_updated')||0);
  loadBookmarks();loadHabits();
  try{const s=JSON.parse(localStorage.getItem('neurocatch_settings')||'{}');settings={key:s.key||'',model:s.model||'gemini-2.5-flash',themeMode:s.themeMode||'dark',seed:s.seed||'#7c5cff',prompt:s.prompt||'',sbUrl:s.sbUrl||'',sbKey:s.sbKey||'',sbEmail:s.sbEmail||'',microlinkKey:s.microlinkKey||'',microPerLink:!!s.microPerLink,microExclude:Array.isArray(s.microExclude)?s.microExclude:[],studyCustomName:s.studyCustomName||'',studyCustomUrl:s.studyCustomUrl||'',provider:s.provider||'gemini',orKey:s.orKey||'',orModel:s.orModel||'',ollamaUrl:s.ollamaUrl||'',ollamaModel:s.ollamaModel||'',clearAfter:s.clearAfter!==false,autoClip:s.autoClip!==false,bg:s.bg||'mesh',autoSync:s.autoSync!==false,preset:s.preset||'standard',swipesOn:s.swipesOn!==false,voiceAutoAdd:s.voiceAutoAdd!==false,archiveDays:(s.archiveDays!=null?+s.archiveDays:90)};}catch(e){}
  if(!hadSettings){const sysC=detectSystemAccent();if(sysC){settings.seed=sysC;toast('Акцент взят из системы');}}
  try{catches=JSON.parse(localStorage.getItem('neurocatch_catches')||'[]');}catch(e){catches=[];}
  try{history=JSON.parse(localStorage.getItem('neurocatch_history')||'[]');}catch(e){history=[];}
  catches.forEach(c=>{if(!c.id)c.id=uid('c');});
  history.forEach(h=>{try{ensureEntry(h);}catch(e){}});
  if(!localStorage.getItem('neurocatch_bm_migrated')){try{history.forEach(h=>ingestBookmarks(h.bookmarks));}catch(e){}localStorage.setItem('neurocatch_bm_migrated','1');}
  localStorage.setItem('neurocatch_catches',JSON.stringify(catches));
  localStorage.setItem('neurocatch_history',JSON.stringify(history));
  try{fillSettings();}catch(e){}
  try{refreshCount();setAccent(settings.seed,false);applyThemeMode(settings.themeMode,false);buildSwatches();}catch(e){}
  if(settings.sbUrl&&settings.sbKey){try{cloudInit();}catch(e){}}
}
function touchLocal(){if(applyingRemote||booting)return;localUpdatedAt=Date.now();localStorage.setItem('neurocatch_updated',String(localUpdatedAt));scheduleCloudPush();}
function saveSettings(){localStorage.setItem('neurocatch_settings',JSON.stringify(settings));}
function saveCatches(){localStorage.setItem('neurocatch_catches',JSON.stringify(catches));touchLocal();}
function saveHistory(){localStorage.setItem('neurocatch_history',JSON.stringify(history));touchLocal();}
function fillSettings(){
  const setv=(id,v)=>{const el=$('#'+id);if(el)el.value=v;};
  setv('apikey',settings.key);setv('model',settings.model);setv('themeSel',settings.themeMode);
  setv('colorPick',settings.seed);setv('promptInput',settings.prompt||DEFAULT_PROMPT);
  setv('sbUrl',settings.sbUrl);setv('sbKey',settings.sbKey);setv('sbEmail',settings.sbEmail);setv('microKey',settings.microlinkKey);
  const mp=$('#microPerLink');if(mp)mp.checked=settings.microPerLink;
  const nOn=$('#notifyOn');if(nOn)nOn.checked=!!settings.notifyOn;
  const nT=$('#notifyTime');if(nT)nT.value=settings.notifyTime||'21:00';
  setv('studyName',settings.studyCustomName);setv('studyUrl',settings.studyCustomUrl);
  setv('provider',settings.provider||'gemini');setv('orKey',settings.orKey);setv('orModel',settings.orModel);setv('ollamaUrl',settings.ollamaUrl);setv('ollamaModel',settings.ollamaModel);const ca=$('#clearAfter');if(ca)ca.checked=settings.clearAfter!==false;const ac=$('#autoClip');if(ac)ac.checked=settings.autoClip!==false;const asy=$('#autoSync');if(asy)asy.checked=settings.autoSync!==false;const sw=$('#swipesOn');if(sw)sw.checked=settings.swipesOn!==false;const va=$('#voiceAutoAdd');if(va)va.checked=settings.voiceAutoAdd!==false;const ad=$('#archiveDays');if(ad)ad.value=String(settings.archiveDays!=null?settings.archiveDays:90);updateProviderUI();try{applyBg();}catch(e){}
}

function detectSystemAccent(){try{const p=document.createElement('span');p.style.cssText='color:AccentColor;position:absolute;opacity:0;pointer-events:none';document.body.appendChild(p);const c=getComputedStyle(p).color;p.remove();const m=c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);if(!m)return null;const r=+m[1],g=+m[2],b=+m[3];if(Math.max(r,g,b)-Math.min(r,g,b)<12)return null;return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(e){return null;}}
/* ---------- color / Material You ---------- */
function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}return[h*360,s*100,l*100];}
function hslToHex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));const to=x=>Math.round(x*255).toString(16).padStart(2,'0');return'#'+to(f(0))+to(f(8))+to(f(4));}
function setAccent(hex,persist=true){const rgb=hexToRgb(hex);const[h,s,l]=rgbToHsl(...rgb);const a2=hslToHex(h,Math.min(s,90),Math.min(l+12,90));const root=document.documentElement.style;root.setProperty('--seed',hex);root.setProperty('--seed-rgb',rgb.join(','));root.setProperty('--accent',hex);root.setProperty('--accent-2',a2);settings.seed=hex;if(persist)saveSettings();}
function buildSwatches(){const wrap=$('#swatches');if(!wrap)return;wrap.querySelectorAll('.swatch').forEach(e=>e.remove());const cp=$('#colorPick');PRESETS.forEach(c=>{const b=document.createElement('button');b.className='swatch'+(c.toLowerCase()===settings.seed.toLowerCase()?' sel':'');b.style.background=c;b.type='button';b.title=c;b.addEventListener('click',()=>{setAccent(c);const cp2=$('#colorPick');if(cp2)cp2.value=c;buildSwatches();});if(cp)wrap.insertBefore(b,cp);else wrap.appendChild(b);});}
$('#colorPick')&&$('#colorPick').addEventListener('input',e=>{setAccent(e.target.value);buildSwatches();});

/* ---------- theme ---------- */
function effectiveTheme(){if(settings.themeMode!=='auto')return settings.themeMode;if(mql&&mql.media!=='not all')return mql.matches?'dark':'light';const hr=new Date().getHours();return(hr>=7&&hr<20)?'light':'dark';}
function applyEffective(){document.documentElement.setAttribute('data-theme',effectiveTheme());}
function applyThemeMode(mode,persist=true){settings.themeMode=mode;if(persist)saveSettings();const ts=$('#themeSel');if(ts)ts.value=mode;const ic={dark:'moon',light:'sun',auto:'sun-moon'}[mode];const tb=$('#themeBtn');if(tb){tb.innerHTML='';const i=document.createElement('i');i.setAttribute('data-lucide',ic);tb.appendChild(i);lucide.createIcons();}applyEffective();}
$('#themeBtn')&&$('#themeBtn').addEventListener('click',()=>{const next={dark:'light',light:'auto',auto:'dark'}[settings.themeMode];applyThemeMode(next);toast('Тема: '+({dark:'тёмная',light:'светлая',auto:'авто'}[next]));});
if(mql)mql.addEventListener('change',()=>{if(settings.themeMode==='auto')applyEffective();});
setInterval(()=>{if(settings.themeMode==='auto')applyEffective();},600000);

/* ---------- helpers ---------- */
function show(view){crumb('view '+(view&&view.id));document.querySelectorAll('.view').forEach(v=>{if(v!==view)v.hidden=true;});view.hidden=false;view.classList.add('enter');requestAnimationFrame(()=>requestAnimationFrame(()=>view.classList.remove('enter')));
  const isHome=!!(view&&view.id==='view-input');
  const zt=$('#uiToggle');if(zt)zt.hidden=!isHome;
  if(!isHome&&document.body.classList.contains('minimal')){localStorage.setItem('neurocatch_minimal','0');applyMinimal();}
}
let toastTimer;
function toast(msg,err){const t=$('#toast'),tt=$('#toastText');if(!t||!tt){try{console.log('[toast]',msg);}catch(e){}return;}tt.textContent=msg;t.classList.toggle('err',!!err);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
function refreshCount(){const b=$('#ritualCount');if(!b)return;if(catches.length>0){b.textContent=catches.length;b.hidden=false;}else b.hidden=true;const r=$('#ritual');if(r){r.classList.remove('pulse');void r.offsetWidth;r.classList.add('pulse');}}
const esc=s=>String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const safe=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
const dateKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
matrixDate=dateKey(Date.now());
const fmtDate=ts=>new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
const fmtTime=ts=>new Date(ts).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});

/* ---------- textarea ---------- */
const ta=$('#brain');
function grow(){if(!ta)return;ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,340)+'px';}
ta&&ta.addEventListener('input',grow);
ta&&ta.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('#submit')&&$('#submit').click();}});
$('#submit')&&$('#submit').addEventListener('click',()=>{const v=ta.value.trim();if(!v){ta.focus();return;}const c={id:uid('c'),text:v,at:Date.now()};try{const due=parseDateTime(v);if(due){c.due=due.ts;c.dueLabel=due.label;c.dueHasTime=due.hasTime;}}catch(e){}catches.push(c);saveCatches();refreshCount();ta.value='';grow();ta.focus();toast(c.dueLabel?('Закинуто • срок '+c.dueLabel):'Закинуто в чёрную дыру');});

/* ---------- voice ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let recog=null,recording=false;
$('#mic')&&$('#mic').addEventListener('click',e=>{const b=e.currentTarget;if(!SR){toast('Голосовой ввод не поддерживается браузером',true);return;}if(!window.isSecureContext){toast('Микрофон работает только по https. Открой приложение с GitHub Pages, а не как файл.',true);return;}if(recording){recog&&recog.stop();return;}recog=new SR();recog.lang='ru-RU';recog.interimResults=true;recog.continuous=false;const base=ta.value?ta.value+' ':'';recog.onstart=()=>{recording=true;b.classList.add('rec');toast('Слушаю...');};recog.onresult=ev=>{let t='';for(let i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;ta.value=base+t;grow();};recog.onerror=ev=>{const msg=ev.error==='not-allowed'?'Нет доступа к микрофону: разреши его в настройках сайта (нужен https)':ev.error==='no-speech'?'Речь не распознана, попробуй ещё раз':'Ошибка микрофона: '+ev.error;toast(msg,true);};recog.onend=()=>{
    recording=false;b.classList.remove('rec');
    if(settings.voiceAutoAdd===false)return;
    const v=ta.value.trim();if(!v||v===base.trim())return;
    const c={id:uid('c'),text:v,at:Date.now()};
    try{const due=parseDateTime(v);if(due){c.due=due.ts;c.dueLabel=due.label;c.dueHasTime=due.hasTime;}}catch(e){}
    catches.push(c);saveCatches();refreshCount();ta.value='';grow();
    toast(c.dueLabel?('🎙 Добавлено • срок '+c.dueLabel):'🎙 Добавлено в улов');
  };recog.start();});

/* ---------- queue ---------- */
$('#ritualCount')&&$('#ritualCount').addEventListener('click',e=>{e.stopPropagation();renderQueue();show($('#view-queue'));});
$('#queueBack')&&$('#queueBack').addEventListener('click',()=>show($('#view-input')));
$('#queueRitual')&&$('#queueRitual').addEventListener('click',()=>runRitual());
function renderQueue(){
  const box=$('#qList');if(!box)return;const qr=$('#queueRitual');if(qr)qr.disabled=!catches.length;
  if(!catches.length){box.innerHTML='<div class="empty"><i data-lucide="inbox"></i>Улов пуст. Закинь первую мысль.</div>';lucide.createIcons();return;}
  const excl=new Set(settings.microExclude||[]);
  box.innerHTML=catches.map(c=>{
    const urls=c.text.match(URL_RE)||[];
    const off=urls.length&&urls.every(u=>excl.has(u.replace(/[),.]+$/,'')));
    const mbtn=(settings.microPerLink&&urls.length)?`<button class="ql-btn${off?' off':''}" data-mic="${c.id}"><i data-lucide="link"></i>${off?'microlink выкл':'microlink вкл'}</button>`:'';
    const bmbtn=urls.length?`<button class="ql-btn${c.markBookmark?' bm-on':''}" data-bm="${c.id}" title="Не конспектировать — просто сохранить как закладку"><i data-lucide="bookmark"></i>${c.markBookmark?'это закладка ✓':'это закладка?'}</button>`:'';
    return `<div class="q-item${c.markBookmark?' as-bookmark':''}" data-id="${c.id}">
      <div style="flex:1;min-width:0"><div class="q-text" contenteditable="true" data-id="${c.id}">${esc(c.text)}</div><div class="q-time">${fmtTime(c.at)}${c.dueLabel?' · <span class="due-badge">⏰ '+esc(c.dueLabel)+'</span>':''}</div><div class="q-btnrow">${mbtn}${bmbtn}</div></div>
      <button class="q-del" data-del="${c.id}" aria-label="Удалить"><i data-lucide="trash-2"></i></button></div>`;}).join('');
  lucide.createIcons();
  box.querySelectorAll('.q-text').forEach(el=>el.addEventListener('input',()=>{const c=catches.find(x=>x.id===el.dataset.id);if(c){c.text=el.textContent;saveCatches();}}));
  box.querySelectorAll('.q-del').forEach(b=>b.addEventListener('click',()=>{catches=catches.filter(x=>x.id!==b.dataset.del);saveCatches();refreshCount();renderQueue();}));
  box.querySelectorAll('.q-item').forEach(it=>attachSwipe(it,{onLeft:()=>{catches=catches.filter(x=>x.id!==it.dataset.id);saveCatches();refreshCount();renderQueue();toast('Удалено');}}));
  box.querySelectorAll('[data-mic]').forEach(b=>b.addEventListener('click',()=>{const c=catches.find(x=>x.id===b.dataset.mic);if(!c)return;const urls=(c.text.match(URL_RE)||[]).map(u=>u.replace(/[),.]+$/,''));const ex=new Set(settings.microExclude||[]);const allOff=urls.every(u=>ex.has(u));urls.forEach(u=>{if(allOff)ex.delete(u);else ex.add(u);});settings.microExclude=[...ex];saveSettings();renderQueue();toast(allOff?'microlink включён для ссылки':'microlink отключён для ссылки');}));
  box.querySelectorAll('[data-bm]').forEach(b=>b.addEventListener('click',()=>{const c=catches.find(x=>x.id===b.dataset.bm);if(!c)return;c.markBookmark=!c.markBookmark;saveCatches();renderQueue();}));
}

/* ---------- Gemini ---------- */
const PRESET_INTRO={
  standard:'',
  clinical:'РЕЖИМ РАЗБОРА: Клинический (урология-андрология). Пиши как коллега-врач: выделяй клинически значимое, дифференциальные диагнозы, красные флаги, что уточнить у пациента и что назначить/проверить. Термины — корректно. Это рабочие заметки врача, не ставь диагноз пациенту напрямую.',
  content:'РЕЖИМ РАЗБОРА: Для медицинского контента (Instagram @dr.garipov). Ищи идеи для постов и каруселей: цепляющие тезисы, «мифы vs факты», вопросы аудитории, готовую структуру карусели. В инсайтах предлагай форматы подачи и заголовки.',
  personal:'РЕЖИМ РАЗБОРА: Личное. Спокойный, поддерживающий тон. Фокус на смысле, эмоциях, целях и конкретных следующих шагах. Без клинического жаргона.'
};
const DEFAULT_PROMPT=`Ты — ассистент дневного brain-dump. Ниже записи пользователя за день.
Проанализируй их и верни ТОЛЬКО markdown строго в таком виде, без вступлений:
## 🧠 Инсайты
- наблюдение (можно **жирным** выделять ключевое)
## 📚 Конспекты
Для каждой содержательной записи или ссылки-СТАТЬИ/ВИДЕО сделай РАЗВЁРНУТЫЙ конспект, а не одну строку. НЕ конспектируй ссылки-ориентиры (сайты сервисов, продуктов, инструментов, приложений, репозитории GitHub, библиотеки, лендинги, магазины) — их выноси ТОЛЬКО в раздел «Закладки» ниже, никогда не создавай по ним задачи. Формат каждого источника-статьи/видео:
### <Ёмкий заголовок источника>
🔗 <точный URL источника, если этот конспект по ссылке; иначе пропусти эту строку>
<2–4 абзаца сути: о чём это, главные мысли, аргументы автора, выводы. Пиши связным текстом.>
- ключевой тезис
- ещё важный момент
- практический вывод
Если запись содержит ссылку на статью — открой страницу и законспектируй её реальное содержание. Если ссылка на YouTube-видео — законспектируй содержание видео (о чём, структура, ключевые тезисы, вывод). Не выдумывай факты: опирайся на реальный текст страницы/видео.
## 🔗 Ссылки
Перечисли ВСЕ ссылки из записей с их настоящими заголовками (заголовок страницы или название видео):
- [<Настоящий заголовок>](<URL>)
## 🔖 Закладки
Если запись — это ссылка-ориентир (сайт сервиса, продукта, инструмента, приложения, репозиторий GitHub, библиотека, лендинг, магазин и т.п.) — НЕ делай по ней конспект и НЕ создавай по ней задачу в разделе «Задачи». Вместо этого добавь её сюда: придумай короткую подходящую категорию (например Инструменты, Библиотеки, ИИ, Дизайн, Обучение, DevTools, Сервисы, Покупки) и краткое описание ОДНИМ АБЗАЦЕМ (2–3 предложения: что это, зачем нужно, чем полезно). Формат:
- [<Заголовок>](<URL>) | <Категория> | <описание одним абзацем, 2–3 предложения>
## ✅ Задачи
Создавай задачу ТОЛЬКО если запись явно требует действия (например «напомни», «нужно», «сделать», «купить», «позвонить», дедлайн). Наличие ссылки или конспект по ней — это НЕ повод создавать задачу вроде «прочитать статью» или «посмотреть видео»: конспект уже сохранён отдельно, дублировать его в задачу не нужно.
- [ ] конкретное действие
## 🏷 Теги
#тег1 #тег2 #тег3
Теги — короткие категории на русском (например #идея #задача #ссылка #видео #здоровье). Отвечай на русском. Записи:
{{RECORDS}}`;
function carryContext(){
  let ot=[];history.forEach(h=>{try{ensureEntry(h);}catch(e){}(h.tasks||[]).forEach(t=>{if(!t.done)ot.push({text:t.text,due:t.due||0});});});
  const now=Date.now();ot.sort((a,b)=>{const ao=a.due&&a.due<now?0:1,bo=b.due&&b.due<now?0:1;if(ao!==bo)return ao-bo;return (a.due||9e15)-(b.due||9e15);});
  const openTasks=ot.map(t=>t.text+(t.due?((t.due<now?' (ПРОСРОЧЕНО, срок ':' (срок ')+fmtDueShort(t.due)+')'):''));
  const todayK=dateKey(Date.now());const undone=habits.filter(hb=>!(hb.checks&&hb.checks[todayK])).map(hb=>hb.name);
  let out='';
  if(openTasks.length)out+='Открытые задачи (они УЖЕ существуют — НЕ дублируй их в разделе «Задачи», туда добавляй только новые действия из записей выше; в «Инсайтах» кратко напомни о самых важных или просроченных):\n'+openTasks.slice(0,40).map(t=>'- '+t).join('\n')+'\n\n';
  if(undone.length)out+='Сегодня ещё не отмечены привычки (мягко напомни о них в «Инсайтах»):\n'+undone.map(n=>'- '+n).join('\n')+'\n';
  return out.trim();
}
function buildPrompt(items){const recs=items.map((c,i)=>`${i+1}. ${c.text}${c.dueLabel?(' [срок: '+c.dueLabel+']'):''}`).join('\n');const _p=settings.preset||'standard';let tpl;if(_p==='custom'){tpl=(settings.prompt&&settings.prompt.trim())?settings.prompt:DEFAULT_PROMPT;}else{tpl=(PRESET_INTRO[_p]?PRESET_INTRO[_p]+'\n\n':'')+DEFAULT_PROMPT;}let out=tpl.includes('{{RECORDS}}')?tpl.replace('{{RECORDS}}',recs):tpl+'\n\nЗаписи:\n'+recs;
  if(items===catches){const ctx=carryContext();if(ctx)out+='\n\n— — —\n'+ctx;}
  return out;}

/* ---------- parse & render ---------- */
function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return u.replace(/^https?:\/\//,'').split('/')[0];}}
function assembleLinks(d,text){const map=new Map();
  const add=(u,t)=>{if(!u)return;u=u.replace(/[),.]+$/,'');if(!map.has(u))map.set(u,t||'');else if(t&&!map.get(u))map.set(u,t);};
  d.links.forEach(l=>add(l.url,l.title));
  d.summaries.forEach(s=>{if(s.source)add(s.source,s.title);});
  (text.match(URL_RE)||[]).forEach(u=>add(u,''));
  return [...map].map(([url,title])=>({url,title:title||hostOf(url)}));}
function mdBlock(src){const lines=(src||'').split('\n');let html='',para=[],inList=false;
  const fp=()=>{if(para.length){html+='<p>'+safe(para.join(' '))+'</p>';para=[];}};
  const fl=()=>{if(inList){html+='</ul>';inList=false;}};
  lines.forEach(l=>{const t=l.trim();
    if(!t){fp();fl();return;}
    if(/^[-*]\s+/.test(t)){fp();if(!inList){html+='<ul class="bullets">';inList=true;}html+='<li>'+safe(t.replace(/^[-*]\s+/,''))+'</li>';}
    else if(/^#{1,6}\s+/.test(t)){fp();fl();html+='<h5>'+safe(t.replace(/^#{1,6}\s+/,''))+'</h5>';}
    else para.push(t);});
  fp();fl();return html;}
const attr=u=>String(u).replace(/"/g,'%22');
function renderDigest(entry){
  currentEntry=entry;
  const eIns=entry.insights||[], eSum=entry.summaries||[];
  const ins=eIns.length?eIns.map((x,i)=>`<li><span class="ins-text">${safe(x)}</span><button class="mini note-anki" data-i="${i}" title="Создать карточку Anki"><i data-lucide="layers"></i></button><button class="mini item-del" data-kind="ins" data-i="${i}" title="Удалить"><i data-lucide="x"></i></button></li>`).join(''):'<li><span class="ins-text">Ничего заметного.</span></li>';
  const sum=eSum.length?eSum.map((s,i)=>{const badge=s.source?` <a class="src-link" href="${attr(s.source)}" target="_blank" rel="noopener" title="${esc(hostOf(s.source))}"><i data-lucide="link"></i></a>`:'';return `<div class="summary-item"><div class="sum-head"><h4>${s.title?safe(s.title):'Конспект'}${badge}</h4><div class="sec-actions"><button class="mini sum-exp" data-si="${i}" title="Скачать этот конспект .md"><i data-lucide="file-down"></i></button><button class="mini item-del" data-kind="sum" data-i="${i}" title="Удалить"><i data-lucide="x"></i></button></div></div>${mdBlock(s.body)}</div>`;}).join(''):'<p>Конспектировать нечего.</p>';
  const tasks=entry.tasks.length?entry.tasks.map((t,i)=>`<li><label class="task"><input type="checkbox" data-ti="${i}" ${t.done?'checked':''}><span class="check"><i data-lucide="check"></i></span><span class="task-label">${safe(t.text)}</span></label><button class="mini item-del" data-kind="task" data-i="${i}" title="Удалить"><i data-lucide="x"></i></button></li>`).join(''):'<p>Задач нет.</p>';
  const links=entry.links&&entry.links.length?`<div class="md-section"><h3>🔗 Ссылки</h3><div class="link-list">${entry.links.map((l,i)=>`<div class="link-row"><a class="lmain" href="${attr(l.url)}" target="_blank" rel="noopener"><span class="lic">${l.logo?`<img class="lg" src="${attr(l.logo)}" alt="" loading="lazy">`:`<i data-lucide="link"></i>`}</span><span class="lt"><span class="ltt">${esc(l.title)}</span><span class="lth">${esc(l.publisher||hostOf(l.url))}</span></span></a><button class="mini study" data-url="${attr(l.url)}" title="Изучить в ИИ"><i data-lucide="sparkle"></i></button><a class="mini" href="${attr(l.url)}" target="_blank" rel="noopener" title="Открыть"><i data-lucide="external-link"></i></a><button class="mini item-del" data-kind="link" data-i="${i}" title="Удалить"><i data-lucide="x"></i></button></div>`).join('')}</div></div>`:'';
  const covered=new Set(eSum.map(x=>x.source).filter(Boolean));
  const failed=(entry.links||[]).filter(l=>!covered.has(l.url));
  const bms=entry.bookmarks||[];
  const dupeN=entry.bmDupeCount||0;const bmBlock=bms.length?`<div class="md-section"><h3>🔖 Закладки</h3><div class="bm-summary">${bms.length} ссылк${bms.length===1?'а отправлена':(bms.length<5?'и отправлены':'ок отправлено')} в закладки без конспекта${dupeN?(' · из них уже было раньше: '+dupeN):''} — ниже видно, куда именно, и можно поправить.</div><div class="bm-list">${bms.map((b,i)=>`<div class="bm-row"><div class="bm-main"><a href="${attr(b.url)}" target="_blank" rel="noopener" class="bm-title">${esc(b.title||hostOf(b.url))}</a>${b.desc?`<div class="bm-desc">${esc(b.desc)}</div>`:''}<div class="bm-host">${esc(hostOf(b.url))}</div></div><div class="bm-rowacts"><button class="bm-cat" data-bi="${i}" title="Изменить категорию">📁 ${esc(b.category||'Прочее')}</button><button class="mini bm-toart" data-bi="${i}" title="Это статья — законспектировать"><i data-lucide="notebook-pen"></i></button><button class="mini item-del" data-kind="bm" data-i="${i}" title="Удалить"><i data-lucide="x"></i></button></div></div>`).join('')}</div><div class="hint" style="margin-top:8px">Все закладки и категории — в разделе «Закладки» (иконка-флажок в шапке).</div></div>`:'';
  const failBlock=failed.length?`<div class="md-section fail-box"><h3>⚠️ Без конспекта</h3><p style="margin-bottom:12px">По этим ссылкам конспект не сделан или неполон — скопируй и разбери отдельно:</p>${failed.map(l=>`<div class="fail-row"><span class="u">${esc(l.url)}</span><button class="cp study" data-url="${attr(l.url)}" title="Изучить в ИИ"><i data-lucide="sparkle"></i></button><button class="cp" data-cpurl="${attr(l.url)}" title="Скопировать"><i data-lucide="clipboard"></i></button></div>`).join('')}<button class="btn fail-all" id="copyAllFailed"><i data-lucide="clipboard"></i>Скопировать все (${failed.length})</button></div>`:'';
  const tags=entry.tags&&entry.tags.length?`<div class="md-section"><h3>🏷 Теги</h3><div class="tags">${entry.tags.map((t,i)=>`<span class="tag-pill-del"><button class="tag-pill" data-tag="${esc(t)}">${esc(t)}</button><button class="tag-x" data-kind="tag" data-i="${i}" title="Убрать тег"><i data-lucide="x"></i></button></span>`).join('')}</div></div>`:'';
  $('#digestCard').innerHTML=`<div class="md-section"><h3>🧠 Инсайты</h3><ul class="bullets">${ins}</ul></div>
    <div class="md-section"><h3>📚 Конспекты</h3>${sum}</div>
    ${links}
    ${bmBlock}
    ${failBlock}
    <div class="md-section"><div class="sec-head"><h3>✅ Задачи</h3><div class="sec-actions"><button class="mini" id="tasksMdBtn" title="Скачать задачи .md"><i data-lucide="file-down"></i></button><button class="mini" id="tasksTickBtn" title="Копировать для TickTick"><i data-lucide="clipboard"></i></button></div></div><ul>${tasks}</ul></div>${tags}`;
  $('#digestCard').querySelectorAll('input[data-ti]').forEach(inp=>inp.addEventListener('change',()=>{const i=+inp.dataset.ti;entry.tasks[i].done=inp.checked;saveHistory();}));
  $('#digestCard').querySelectorAll('.tag-pill[data-tag]').forEach(b=>b.addEventListener('click',()=>openHistoryWithTag(b.dataset.tag)));
  $('#digestCard').querySelectorAll('[data-cpurl]').forEach(b=>b.addEventListener('click',()=>copyText(b.dataset.cpurl)));
  $('#digestCard').querySelectorAll('.note-anki[data-i]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;const text=(entry.insights||[])[i];if(!text)return;openAnkiCardEditor({back:text,front:''});}));
  $('#digestCard').querySelectorAll('.study[data-url]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openStudyMenu(b.dataset.url,b);}));
  $('#digestCard').querySelectorAll('.bm-cat[data-bi]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.bi;const bm=entry.bookmarks[i];if(!bm)return;openCatMenu(b,bm.category,cat=>{bm.category=cat;const g=bookmarks.find(x=>x.url===bm.url);if(g)g.category=cat;else ingestBookmarks([bm]);saveHistory();saveBookmarks();renderDigest(entry);});}));
  $('#digestCard').querySelectorAll('.bm-toart[data-bi]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.bi;const bm=entry.bookmarks[i];if(!bm)return;
    entry.bookmarks=entry.bookmarks.filter((_,idx)=>idx!==i);
    bookmarks=bookmarks.filter(x=>x.url!==bm.url);saveBookmarks();saveHistory();
    toast('Отправляю на конспектирование…');
    runRitual([{id:uid('c'),text:bm.url,at:Date.now()}],{title:'Разбор ссылки',back:backTarget});
  }));
  $('#digestCard').querySelectorAll('.item-del[data-kind]').forEach(b=>b.addEventListener('click',()=>{
    const kind=b.dataset.kind,i=+b.dataset.i;const map={ins:'insights',sum:'summaries',task:'tasks',link:'links',bm:'bookmarks',tag:'tags'};
    const field=map[kind];if(!field||!entry[field])return;
    entry[field]=entry[field].filter((_,idx)=>idx!==i);
    saveHistory();renderDigest(entry);toast('Удалено из отчёта');
  }));
  const cpAll=$('#copyAllFailed');if(cpAll)cpAll.addEventListener('click',()=>copyText(failed.map(l=>l.url).join('\n')));
  $('#digestCard').querySelectorAll('.sum-exp[data-si]').forEach(b=>b.addEventListener('click',()=>downloadSummary(+b.dataset.si)));
  const tmb=$('#tasksMdBtn');if(tmb)tmb.addEventListener('click',()=>{download('tasks_'+dateKey(entry.ts)+'.md',tasksToMd(entry.tasks),'text/markdown');toast('Задачи сохранены .md');});
  const ttb=$('#tasksTickBtn');if(ttb)ttb.addEventListener('click',()=>copyTick(entry.tasks));
  lucide.createIcons();
  enrichTitles(entry);
}
function openHistoryWithTag(tag){filterDate=null;searchQuery='';$('#searchInput').value='';tagFilter=tag;renderHistory();show($('#view-history'));}
async function fetchMeta(url){ // YouTube -> oEmbed (без лимита); прочее -> microlink.io
  try{
    if(isYT(url)){const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url));if(!r.ok)return null;const j=await r.json();return{title:j.title||'',logo:j.thumbnail_url||'',publisher:j.author_name||''};}
    const opt=settings.microlinkKey?{headers:{'x-api-key':settings.microlinkKey}}:{};
    const r=await fetch('https://api.microlink.io/?url='+encodeURIComponent(url),opt);
    if(!r.ok)return null;const j=await r.json();
    if(j&&j.status==='success'&&j.data){const dd=j.data;return{title:dd.title||'',desc:dd.description||'',logo:(dd.logo&&dd.logo.url)||(dd.image&&dd.image.url)||'',publisher:dd.publisher||''};}
    return null;
  }catch(e){return null;}
}
async function enrichTitles(entry){
  if(!entry.links||!entry.links.length)return;let changed=false;
  const excl=new Set(settings.microExclude||[]);
  const todo=entry.links.filter(l=>!l._tried&&!excl.has(l.url)&&(!l.title||l.title===hostOf(l.url)||!l.logo)).slice(0,10);
  if(!todo.length)return;
  await Promise.all(todo.map(async l=>{l._tried=true;const m=await fetchMeta(l.url);if(!m)return;
    if(m.title&&(!l.title||l.title===hostOf(l.url))){l.title=m.title;changed=true;}
    if(m.logo&&!l.logo){l.logo=m.logo;changed=true;}
    if(m.publisher&&!l.publisher){l.publisher=m.publisher;changed=true;}}));
  if(changed){saveHistory();if(currentEntry===entry&&!$('#view-digest').hidden)renderDigest(entry);}
}
async function checkMicro(){setStatus('microStatus','проверяю...','wait');const m=await fetchMeta('https://example.com');if(m&&(m.title||m.publisher||m.logo!==undefined))setStatus('microStatus','работает'+(settings.microlinkKey?' (с ключом)':' (free)'),'ok');else setStatus('microStatus','нет ответа / лимит','err');}
function aiTargets(){
  const list=[
    {n:'Perplexity',u:q=>'https://www.perplexity.ai/?q='+q},
    {n:'ChatGPT',u:q=>'https://chatgpt.com/?q='+q},
    {n:'Claude',u:q=>'https://claude.ai/new?q='+q},
    {n:'Gemini',u:()=>'https://gemini.google.com/app'},
    {n:'Grok',u:q=>'https://grok.com/?q='+q}
  ];
  if(settings.studyCustomUrl){list.push({n:settings.studyCustomName||'Свой ИИ',u:(q,url)=>settings.studyCustomUrl.replace('{q}',q).replace('{url}',encodeURIComponent(url))});}
  return list;
}
function studyOutside(e){if(!e.target.closest('#studyMenu')&&!e.target.closest('.study'))closeStudyMenu();}
function closeStudyMenu(){const m=$('#studyMenu');if(m)m.remove();document.removeEventListener('click',studyOutside);}
function openStudyMenu(url,anchor){
  closeStudyMenu();
  const prompt='Изучи и сделай подробный конспект этой ссылки — ключевые тезисы и выводы:\n'+url;
  const q=encodeURIComponent(prompt);
  const targets=aiTargets();
  const m=document.createElement('div');m.className='study-menu';m.id='studyMenu';
  m.innerHTML='<div class="sm-h">Изучить в ИИ</div>'+targets.map((t,i)=>`<button data-i="${i}">${esc(t.n)}</button>`).join('');
  document.body.appendChild(m);
  const r=anchor.getBoundingClientRect();
  m.style.top=(r.bottom+6+window.scrollY)+'px';
  let left=r.right-200+window.scrollX;if(left<8)left=8+window.scrollX;m.style.left=left+'px';
  m.querySelectorAll('button[data-i]').forEach(b=>b.addEventListener('click',async()=>{
    const t=targets[+b.dataset.i];
    try{await navigator.clipboard.writeText(url);}catch(e){}
    window.open(t.u(q,url),'_blank','noopener');
    closeStudyMenu();toast('Ссылка скопирована → '+t.n);
  }));
  setTimeout(()=>document.addEventListener('click',studyOutside),0);
}
function openCatMenu(anchor,current,onPick,options){
  const ex=$('#catMenu');if(ex)ex.remove();
  const cats=(options&&options.length)?options:catList();
  const m=document.createElement('div');m.className='study-menu';m.id='catMenu';
  m.innerHTML='<div class="sm-h">Категория</div>'+cats.map(c=>`<button data-c="${attr(c)}"${c===current?' style="color:var(--accent-2)"':''}>${esc(c)}</button>`).join('')+'<button data-new="1">＋ Новая…</button>';
  document.body.appendChild(m);
  const r=anchor.getBoundingClientRect();m.style.top=(r.bottom+6+window.scrollY)+'px';let left=r.right-200+window.scrollX;if(left<8+window.scrollX)left=8+window.scrollX;m.style.left=left+'px';
  const close=()=>{m.remove();document.removeEventListener('click',out);};
  function out(e){if(!e.target.closest('#catMenu')&&e.target!==anchor)close();}
  m.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.new){const nc=prompt('Новая категория:');close();if(nc&&nc.trim())onPick(nc.trim());return;}onPick(b.dataset.c);close();}));
  setTimeout(()=>document.addEventListener('click',out),0);
}
function renderBookmarks(){
  const box=$('#bmMgr');if(!box)return;$('#bmCount').textContent=bookmarks.length;
  if(!bookmarks.length){box.innerHTML='<div class="empty">Пока нет закладок. Ссылки-ориентиры (репозитории, инструменты) добавятся сюда автоматически при разборе, либо добавь вручную выше.</div>';return;}
  const groups={};bookmarks.forEach(b=>{const c=b.category||'Прочее';(groups[c]=groups[c]||[]).push(b);});
  box.innerHTML=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'ru')).map(cat=>`<div class="bm-group"><div class="bm-cat-h"><i data-lucide="folder"></i>${esc(cat)}<span class="bm-n">${groups[cat].length}</span></div>${groups[cat].map(b=>`<div class="bm-row"><div class="bm-main"><a href="${attr(b.url)}" target="_blank" rel="noopener" class="bm-title">${esc(b.title||hostOf(b.url))}</a>${b.desc?`<div class="bm-desc">${esc(b.desc)}</div>`:''}<div class="bm-host">${esc(hostOf(b.url))}</div></div><div class="bm-acts"><button class="mini bm-recat" data-id="${b.id}" title="Категория"><i data-lucide="folder"></i></button><button class="mini bm-toart" data-id="${b.id}" title="Это статья — законспектировать"><i data-lucide="notebook-pen"></i></button><button class="mini bm-del" data-id="${b.id}" title="Удалить"><i data-lucide="trash-2"></i></button></div></div>`).join('')}</div>`).join('');
  lucide.createIcons();
  box.querySelectorAll('.bm-del').forEach(b=>b.addEventListener('click',()=>{bookmarks=bookmarks.filter(x=>x.id!==b.dataset.id);saveBookmarks();renderBookmarks();toast('Закладка удалена');}));
  box.querySelectorAll('.bm-recat').forEach(b=>b.addEventListener('click',()=>{const bm=bookmarks.find(x=>x.id===b.dataset.id);if(!bm)return;openCatMenu(b,bm.category,cat=>{bm.category=cat;saveBookmarks();renderBookmarks();});}));
  box.querySelectorAll('.bm-toart').forEach(b=>b.addEventListener('click',()=>{const bm=bookmarks.find(x=>x.id===b.dataset.id);if(!bm)return;bookmarks=bookmarks.filter(x=>x.id!==bm.id);saveBookmarks();toast('Отправляю на конспектирование…');runRitual([{id:uid('c'),text:bm.url,at:Date.now()}],{title:'Разбор ссылки',back:'#view-bookmarks'});}));
}
$('#openBookmarks')&&$('#openBookmarks').addEventListener('click',()=>{renderBookmarks();show($('#view-bookmarks'));});
$('#bmBack')&&$('#bmBack').addEventListener('click',()=>show($('#view-input')));
$('#bmAddBtn')&&$('#bmAddBtn').addEventListener('click',async()=>{const u=$('#bmUrl').value.trim();if(!/^https?:\/\//i.test(u)){toast('Вставь ссылку (http/https)',true);return;}$('#bmUrl').value='';let title=hostOf(u),desc='';try{const m=await fetchMeta(u);if(m){if(m.title)title=m.title;if(m.desc)desc=m.desc;}}catch(e){}ingestBookmarks([{url:u,title,desc,category:'Прочее'}]);renderBookmarks();toast('Закладка добавлена — задай категорию');});
$('#bmUrl')&&$('#bmUrl').addEventListener('keydown',e=>{if(e.key==='Enter')$('#bmAddBtn').click();});
function loadNoteCats(){try{return JSON.parse(localStorage.getItem('neurocatch_note_cats')||'{}');}catch(e){return {};}}
function saveNoteCats(o){localStorage.setItem('neurocatch_note_cats',JSON.stringify(o));touchLocal();}
function loadManualNotes(){try{return JSON.parse(localStorage.getItem('neurocatch_manual_notes')||'[]');}catch(e){return [];}}
function saveManualNotes(arr){localStorage.setItem('neurocatch_manual_notes',JSON.stringify(arr));touchLocal();}
function loadExtracted(){try{return JSON.parse(localStorage.getItem('neurocatch_extracted')||'[]');}catch(e){return [];}}
function saveExtracted(arr){localStorage.setItem('neurocatch_extracted',JSON.stringify(arr));touchLocal();}
function buildNotes(){const notes=[];history.forEach(h=>{ensureEntry(h);
  (h.summaries||[]).forEach((sm,i)=>notes.push({id:h.id+':s'+i,kind:'sum',title:sm.title||'Конспект',body:sm.body||'',source:sm.source||'',tags:h.tags||[],ts:h.ts,reportId:h.id,
    insights:(i===0)?(h.insights||[]):[]}));});
  loadManualNotes().forEach(mn=>notes.push({id:mn.id,kind:'man',title:mn.title,body:mn.body||'',source:'',tags:mn.tags||[],ts:mn.ts,manual:true,insights:[]}));
  return notes.sort((a,b)=>b.ts-a.ts);}
function loadNoteLinks(){try{return JSON.parse(localStorage.getItem('neurocatch_note_links')||'{}');}catch(e){return {};}}
function saveNoteLinks(o){localStorage.setItem('neurocatch_note_links',JSON.stringify(o));touchLocal();}
function linkNotes(idA,idB){if(idA===idB)return;const L=loadNoteLinks();L[idA]=L[idA]||[];L[idB]=L[idB]||[];if(!L[idA].includes(idB))L[idA].push(idB);if(!L[idB].includes(idA))L[idB].push(idA);saveNoteLinks(L);}
function unlinkNotes(idA,idB){const L=loadNoteLinks();if(L[idA])L[idA]=L[idA].filter(x=>x!==idB);if(L[idB])L[idB]=L[idB].filter(x=>x!==idA);saveNoteLinks(L);}
function getLinkedNoteIds(id){const L=loadNoteLinks();return L[id]||[];}
function extractInsight(text,tags,fromReportTs,source){
  const arr=loadExtracted();
  const ex={id:uid('ex'),text,tags:tags||[],ts:fromReportTs||Date.now()};
  arr.unshift(ex);saveExtracted(arr);
  if(source&&source.reportId!=null&&source.idx!=null){
    const h=history.find(x=>x.id===source.reportId);
    if(h&&h.insights){h.insights=h.insights.filter((_,i)=>i!==source.idx);saveHistory();if(h===currentEntry)renderDigest(currentEntry);}
  }
  toast('Инсайт сохранён отдельной заметкой');
  return ex;
}
function noteCat(n,cats){return cats[n.id]||(n.tags&&n.tags[0])||'Без тега';}
function insightsSubBlock(n){
  if(!n.insights||!n.insights.length)return '';
  return `<div class="note-insights"><div class="note-insights-h"><i data-lucide="lightbulb"></i>Инсайты разбора</div>${n.insights.map((t,i)=>`<div class="note-ins-row"><span class="note-ins-text">${esc(t)}</span><button class="mini note-ins-anki" data-nid="${attr(n.id)}" data-i="${i}" title="Создать карточку Anki"><i data-lucide="layers"></i></button></div>`).join('')}</div>`;
}
function noteCardHtml(n,cats){
  const cat=noteCat(n,cats);const bodyHtml=n.body?mdBlock(n.body):'';
  const icon=n.kind==='man'?'<i data-lucide=\'sticky-note\'></i>':'';
  const actions=`<button class="mini note-edit" data-nid="${attr(n.id)}" title="Изменить"><i data-lucide="pencil"></i></button><button class="mini note-del" data-nid="${attr(n.id)}" title="Удалить"><i data-lucide="trash-2"></i></button><button class="mini note-share" data-nid="${attr(n.id)}" title="Поделиться ссылкой"><i data-lucide="share"></i></button><button class="mini note-file" data-nid="${attr(n.id)}" title="Скачать файл"><i data-lucide="download"></i></button>`;
  return `<div class="note-card ${n.kind}"><div class="note-head"><span class="note-cat-wrap"><button class="bm-cat note-cat" data-nid="${attr(n.id)}" title="Показать всё с этим тегом"><i data-lucide="folder"></i>${esc(cat)}</button><button class="mini note-cat-edit" data-nid="${attr(n.id)}" title="Изменить основной тег"><i data-lucide="pencil"></i></button></span><div class="note-actions">${actions}<span class="note-date">${fmtDate(n.ts)}</span></div></div><div class="note-title note-open" data-nid="${attr(n.id)}">${icon}${esc(n.title)}</div>${n.source?`<a class="note-src" href="${attr(n.source)}" target="_blank" rel="noopener"><i data-lucide="link"></i>${esc(hostOf(n.source))}</a>`:''}${bodyHtml?`<div class="note-body clamp note-open" data-nid="${attr(n.id)}">${bodyHtml}</div>`:''}${insightsSubBlock(n)}<div class="note-tags">${n.tags.map(t=>`<span class="tag-pill" data-t="${attr(t)}">${esc(t)}</span>`).join('')}${getLinkedNoteIds(n.id).length?`<span class="tag-pill nd-link-badge">🔗 ${getLinkedNoteIds(n.id).length}</span>`:''}</div></div>`;
}
function wireNoteCards(box,notes){
  box.querySelectorAll('.note-cat[data-nid]').forEach(b=>b.addEventListener('click',()=>{const n=notes.find(x=>x.id===b.dataset.nid);if(!n)return;const cc=loadNoteCats();noteCatFilterVal=noteCat(n,cc);renderNotes();}));
  box.querySelectorAll('.note-cat-edit[data-nid]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const n=notes.find(x=>x.id===b.dataset.nid);if(!n)return;const cc=loadNoteCats();const opts=(n.tags&&n.tags.length)?n.tags.slice():catList();openCatMenu(b,noteCat(n,cc),cat=>{cc[n.id]=cat;saveNoteCats(cc);renderNotes();},opts);}));
  box.querySelectorAll('.note-open[data-nid]').forEach(el=>el.addEventListener('click',()=>{const n=notes.find(x=>x.id===el.dataset.nid);if(n)openNoteDetail(n);}));
  box.querySelectorAll('.note-ins-anki[data-nid]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const n=notes.find(x=>x.id===b.dataset.nid);if(!n)return;const text=(n.insights||[])[+b.dataset.i];if(text)openAnkiCardEditor({back:text,front:''});}));
  box.querySelectorAll('.note-tags .tag-pill[data-t]').forEach(p=>p.addEventListener('click',()=>{noteTagFilter=p.dataset.t;renderNotes();}));
  box.querySelectorAll('.note-share[data-nid]').forEach(b=>b.addEventListener('click',()=>{const n=notes.find(x=>x.id===b.dataset.nid);if(n)openShareMenu(b,n);}));
  box.querySelectorAll('.note-file[data-nid]').forEach(b=>b.addEventListener('click',()=>{const n=notes.find(x=>x.id===b.dataset.nid);if(n)shareNoteFile(n);}));
  box.querySelectorAll('.note-edit[data-nid]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const n=notes.find(x=>x.id===b.dataset.nid);if(n)openNoteEditor(n);}));
  box.querySelectorAll('.note-del[data-nid]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const n=notes.find(x=>x.id===b.dataset.nid);if(!n)return;if(!confirm('Удалить эту заметку?'))return;deleteNoteAny(n);toast('Заметка удалена');renderNotes();}));
}
function renderNotes(){
  const box=$('#notesList');if(!box)return;const notes=buildNotes();const cats=loadNoteCats();
  const tset=new Set();notes.forEach(n=>n.tags.forEach(t=>tset.add(t)));const tags=[...tset];
  $('#noteTags').innerHTML=tags.map(t=>`<button class="tagchip${noteTagFilter===t?' on':''}" data-t="${attr(t)}">${esc(t)}</button>`).join('');
  $('#noteTags').querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click',()=>{noteTagFilter=noteTagFilter===b.dataset.t?null:b.dataset.t;renderNotes();}));
  const ntCnt=$('#noteTagsCount');if(ntCnt)ntCnt.textContent=tags.length?('('+tags.length+')'):'';
  initTagCollapse('noteTagsWrap');
  const cf=$('#noteCatFilterChip');
  if(cf){cf.hidden=!noteCatFilterVal;cf.textContent='📁 '+(noteCatFilterVal||'')+'  ✕';}
  let list=notes;
  if(noteCatFilterVal)list=list.filter(n=>noteCat(n,cats)===noteCatFilterVal);
  if(noteTagFilter)list=list.filter(n=>n.tags.includes(noteTagFilter));
  if(noteSearch)list=list.filter(n=>((n.title||'')+' '+(n.body||'')).toLowerCase().includes(noteSearch));
  $('#notesCount').textContent=list.length;
  if(!list.length){box.innerHTML='<div class="empty">Заметок нет. Конспекты появятся здесь после разбора.</div>';return;}
  box.innerHTML=list.map(n=>noteCardHtml(n,cats)).join('');
  lucide.createIcons();
  wireNoteCards(box,notes);
}
/* ---------- highlights ---------- */
function loadHighlights(){try{return JSON.parse(localStorage.getItem('neurocatch_highlights')||'{}');}catch(e){return {};}}
function saveHighlights(o){localStorage.setItem('neurocatch_highlights',JSON.stringify(o));touchLocal();}
function getHighlights(noteId){return (loadHighlights()[noteId])||[];}
function addHighlight(noteId,text){text=text.trim();if(!text)return;const H=loadHighlights();H[noteId]=H[noteId]||[];if(!H[noteId].includes(text))H[noteId].push(text);saveHighlights(H);}
function removeHighlight(noteId,idx){const H=loadHighlights();if(H[noteId]){H[noteId]=H[noteId].filter((_,i)=>i!==idx);saveHighlights(H);}}
function wireHighlightCapture(n){
  document.querySelectorAll('.hl-popup').forEach(p=>p.remove());
  const bodyEl=$('#ndBody')?$('#ndBody').querySelector('.note-body'):null;
  if(!bodyEl)return;
  const popup=document.createElement('div');popup.className='hl-popup';popup.hidden=true;
  popup.innerHTML='<button id="hlConfirm"><i data-lucide="highlighter"></i>Выделить</button><button id="hlToAnki"><i data-lucide="layers"></i>+ Anki</button>';
  document.body.appendChild(popup);lucide.createIcons();
  let curText='';
  function onUp(){
    const sel=window.getSelection();
    const text=sel?sel.toString().trim():'';
    if(!text||sel.rangeCount===0||!bodyEl.contains(sel.getRangeAt(0).commonAncestorContainer)){popup.hidden=true;return;}
    curText=text;
    const r=sel.getRangeAt(0).getBoundingClientRect();
    popup.style.top=Math.max(8,window.scrollY+r.top-46)+'px';
    popup.style.left=Math.max(8,r.left+window.scrollX)+'px';
    popup.hidden=false;
  }
  bodyEl.addEventListener('mouseup',onUp);
  bodyEl.addEventListener('touchend',()=>setTimeout(onUp,50));
  popup.querySelector('#hlConfirm').addEventListener('click',()=>{
    if(curText){addHighlight(n.id,curText);toast('Сохранено в выделения');openNoteDetail(n);}
    popup.hidden=true;window.getSelection().removeAllRanges();
  });
  popup.querySelector('#hlToAnki').addEventListener('click',()=>{
    popup.hidden=true;window.getSelection().removeAllRanges();
    openAnkiCardEditor({back:curText,front:'',sourceNoteId:n.id});
  });
}
function similarNotesBlock(n,allNotes){
  if(!n.tags||!n.tags.length)return '';
  const scored=allNotes.filter(x=>x.id!==n.id).map(x=>({x,score:(x.tags||[]).filter(t=>n.tags.includes(t)).length})).filter(s=>s.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
  if(!scored.length)return '';
  return `<div class="nd-links" style="margin-top:16px"><div class="nd-links-h">🏷 Похожие по тегам</div>${scored.map(s=>`<button class="nd-link-row nd-link-open-full" data-sid="${attr(s.x.id)}">${s.x.kind==='man'?'📝 ':'📄 '}${esc(s.x.title)}<span class="sim-score">${s.score}</span></button>`).join('')}</div>`;
}
async function openNoteDetail(n){
  $('#ndKindLabel').textContent=n.kind==='man'?'Заметка':'Конспект';
  const dt=new Date(n.ts||Date.now()).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  let preview='';
  if(n.source){
    preview='<div class="nd-preview" id="ndPreview"><div class="nd-preview-loading">Загружаю превью…</div></div>';
  }
  const body=n.body?mdBlock(n.body):'';
  const allNotes=buildNotes();
  const linkedIds=getLinkedNoteIds(n.id);
  const linked=linkedIds.map(id=>allNotes.find(x=>x.id===id)).filter(Boolean);
  const relBlock=`<div class="nd-links"><div class="nd-links-h">🔗 Связанные заметки<button class="mini nd-link-add" id="ndLinkAdd" title="Добавить связь"><i data-lucide="plus"></i></button></div>${linked.length?linked.map(ln=>`<div class="nd-link-row"><button class="nd-link-open" data-lid="${attr(ln.id)}">${ln.kind==='man'?'📝 ':'📄 '}${esc(ln.title)}</button><button class="mini nd-link-rm" data-lid="${attr(ln.id)}" title="Убрать связь"><i data-lucide="x"></i></button></div>`).join(''):'<div class="empty" style="padding:10px 0;font-size:13px">Пока нет связей — нажми «+», чтобы связать с другой заметкой.</div>'}</div>`;
  const hl=getHighlights(n.id);
  const hlBlock=`<details class="hl-spoiler" ${hl.length?'open':''}><summary><i data-lucide="highlighter"></i>Выделения<span class="t-group-n">${hl.length}</span></summary><div class="hl-list" id="hlList">${hl.length?hl.map((t,i)=>`<div class="hl-item"><span class="hl-text">${esc(t)}</span><button class="mini hl-del" data-i="${i}" title="Убрать"><i data-lucide="x"></i></button></div>`).join(''):'<div class="empty" style="padding:8px 0;font-size:13px">Выдели текст в тексте ниже — появится тут.</div>'}</div></details>`;
  const simBlock=similarNotesBlock(n,allNotes);
  const insBlock=insightsSubBlock(n);
  $('#ndBody').innerHTML=`
    <h1 class="nd-title">${n.kind==='man'?'📝 ':''}${esc(n.title)}<button class="mini nd-edit-btn" id="ndEditBtn" title="Изменить"><i data-lucide="pencil"></i></button><button class="mini nd-edit-btn" id="ndDelBtn" title="Удалить"><i data-lucide="trash-2"></i></button></h1>
    <div class="nd-meta"><i data-lucide="calendar"></i>${esc(dt)}</div>
    ${hlBlock}
    ${preview}
    ${body?`<div class="note-body" style="margin-top:16px">${body}</div>`:''}
    ${insBlock}
    <div class="note-tags" style="margin-top:16px">${(n.tags||[]).map(t=>`<span class="tag-pill">${esc(t)}</span>`).join('')||'<span class="empty" style="padding:0">Тегов нет</span>'}</div>
    ${relBlock}
    ${simBlock}
  `;
  lucide.createIcons();
  $('#noteDetailOverlay').classList.add('open');
  $('#ndEditBtn')&&$('#ndEditBtn').addEventListener('click',()=>{$('#noteDetailOverlay').classList.remove('open');openNoteEditor(n);});
  $('#ndDelBtn')&&$('#ndDelBtn').addEventListener('click',()=>{if(!confirm('Удалить эту заметку?'))return;deleteNoteAny(n);$('#noteDetailOverlay').classList.remove('open');toast('Заметка удалена');renderNotes();});
  $('#ndBody').querySelectorAll('.note-ins-anki[data-nid]').forEach(b=>b.addEventListener('click',()=>{const text=(n.insights||[])[+b.dataset.i];if(text)openAnkiCardEditor({back:text,front:''});}));
  $('#ndLinkAdd')&&$('#ndLinkAdd').addEventListener('click',()=>openNotePicker(n,allNotes));
  $('#ndBody').querySelectorAll('.nd-link-open[data-lid]').forEach(b=>b.addEventListener('click',()=>{const ln=allNotes.find(x=>x.id===b.dataset.lid);if(ln)openNoteDetail(ln);}));
  $('#ndBody').querySelectorAll('.nd-link-rm[data-lid]').forEach(b=>b.addEventListener('click',()=>{unlinkNotes(n.id,b.dataset.lid);openNoteDetail(n);}));
  $('#ndBody').querySelectorAll('.nd-link-open-full[data-sid]').forEach(b=>b.addEventListener('click',()=>{const sn=allNotes.find(x=>x.id===b.dataset.sid);if(sn)openNoteDetail(sn);}));
  $('#ndBody').querySelectorAll('.hl-del[data-i]').forEach(b=>b.addEventListener('click',()=>{removeHighlight(n.id,+b.dataset.i);openNoteDetail(n);}));
  wireHighlightCapture(n);
  if(n.source){
    try{const m=await fetchMeta(n.source);const box=$('#ndPreview');if(box){
      box.innerHTML=`<a href="${attr(n.source)}" target="_blank" rel="noopener" class="nd-preview-link">${m&&m.logo?`<img src="${attr(m.logo)}" class="nd-preview-img" alt="">`:'<div class="nd-preview-img nd-preview-ph"><i data-lucide="link"></i></div>'}<div class="nd-preview-txt"><div class="nd-preview-title">${esc((m&&m.title)||n.source)}</div><div class="nd-preview-host">${esc(hostOf(n.source))}</div></div><i data-lucide="external-link"></i></a>`;
      lucide.createIcons();
    }}catch(e){const box=$('#ndPreview');if(box)box.innerHTML=`<a href="${attr(n.source)}" target="_blank" rel="noopener" class="nd-preview-link"><div class="nd-preview-img nd-preview-ph"><i data-lucide="link"></i></div><div class="nd-preview-txt"><div class="nd-preview-title">${esc(n.source)}</div><div class="nd-preview-host">${esc(hostOf(n.source))}</div></div></a>`;lucide.createIcons();}
  }
}
function openNotePicker(n,allNotes){
  const ex=$('#notePickerOverlay');if(ex)ex.remove();
  const linkedIds=new Set(getLinkedNoteIds(n.id));
  const candidates=allNotes.filter(x=>x.id!==n.id&&!linkedIds.has(x.id));
  const ov=document.createElement('div');ov.className='overlay open';ov.id='notePickerOverlay';
  ov.innerHTML=`<div class="modal" style="max-width:440px"><div class="modal-head"><h2>Связать с заметкой</h2><button class="icon-btn" id="npClose"><i data-lucide="x"></i></button></div>
    <div class="search-wrap"><i data-lucide="search"></i><input type="text" id="npSearch" placeholder="Поиск заметки по названию…" autocomplete="off"></div>
    <div id="npList" class="np-list"></div></div>`;
  document.body.appendChild(ov);lucide.createIcons();
  const paint=q=>{q=(q||'').toLowerCase();const list=candidates.filter(c=>!q||(c.title||'').toLowerCase().includes(q));
    $('#npList').innerHTML=list.length?list.slice(0,60).map(c=>`<button class="np-item" data-id="${attr(c.id)}">${c.kind==='ins'?'💡 ':'📄 '}${esc(c.title)}</button>`).join(''):'<div class="empty">Ничего не найдено</div>';
    $('#npList').querySelectorAll('.np-item').forEach(b=>b.addEventListener('click',()=>{linkNotes(n.id,b.dataset.id);ov.remove();openNoteDetail(n);}));};
  paint('');
  ov.querySelector('#npSearch').addEventListener('input',e=>paint(e.target.value));
  ov.querySelector('#npClose').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  setTimeout(()=>ov.querySelector('#npSearch').focus(),50);
}
/* ---------- manual note create/edit ---------- */
let neEditingId=null;
let neEditingKind='man';
function parseSumId(id){const m=/^(.+):s(\d+)$/.exec(id);return m?{reportId:m[1],idx:+m[2]}:null;}
function openNoteEditor(existing){
  neEditingId=existing?existing.id:null;
  neEditingKind=existing?existing.kind:'man';
  $('#neTitle').textContent=existing?'Изменить заметку':'Новая заметка';
  $('#neTitleInput').value=existing?existing.title:'';
  const bodyField=$('#neBodyInput');
  if(bodyField){bodyField.hidden=(neEditingKind==='ins');bodyField.value=existing?existing.body:'';}
  const bodyLabel=document.querySelector('label[for="neBodyInput"]');if(bodyLabel)bodyLabel.hidden=(neEditingKind==='ins');
  const tagsField=$('#neTagsInput');const tagsLabel=document.querySelector('label[for="neTagsInput"]');
  if(neEditingKind==='sum'){
    if(tagsField)tagsField.hidden=true;if(tagsLabel){tagsLabel.hidden=true;}
  }else{
    if(tagsField){tagsField.hidden=false;tagsField.value=existing&&existing.tags?existing.tags.join(', '):'';}
    if(tagsLabel)tagsLabel.hidden=false;
  }
  const nd=$('#neDelete');if(nd)nd.hidden=!existing;
  const tb=$('#neToolbar'),pv=$('#nePreviewToggle');
  const noBody=(neEditingKind==='ins');
  if(tb)tb.hidden=noBody;if(pv)pv.hidden=noBody;
  setNePreview(false);
  $('#noteEditOverlay').classList.add('open');
  setTimeout(()=>$('#neTitleInput').focus(),50);
}
/* ---------- simple markdown editor: toolbar + preview ---------- */
function neWrapSelection(before,after,placeholder){
  const ta=$('#neBodyInput');if(!ta)return;
  const s=ta.selectionStart,e=ta.selectionEnd;const val=ta.value;
  const sel=val.slice(s,e)||placeholder||'';
  ta.value=val.slice(0,s)+before+sel+(after!=null?after:before)+val.slice(e);
  const pos=s+before.length;
  ta.focus();ta.setSelectionRange(pos,pos+sel.length);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}
function neLinePrefix(prefix){
  const ta=$('#neBodyInput');if(!ta)return;
  const s=ta.selectionStart;const val=ta.value;
  const lineStart=val.lastIndexOf('\n',s-1)+1;
  ta.value=val.slice(0,lineStart)+prefix+val.slice(lineStart);
  const pos=s+prefix.length;
  ta.focus();ta.setSelectionRange(pos,pos);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}
function neApplyMd(kind){
  if(kind==='bold')neWrapSelection('**','**','жирный текст');
  else if(kind==='italic')neWrapSelection('*','*','курсив');
  else if(kind==='h')neLinePrefix('### ');
  else if(kind==='ul')neLinePrefix('- ');
  else if(kind==='ol')neLinePrefix('1. ');
  else if(kind==='quote')neLinePrefix('> ');
  else if(kind==='link'){
    const ta=$('#neBodyInput');const sel=ta?ta.value.slice(ta.selectionStart,ta.selectionEnd):'';
    neWrapSelection('[', '](https://)', sel||'текст ссылки');
  }
}
document.querySelectorAll('#neToolbar [data-md]').forEach(b=>b.addEventListener('click',()=>neApplyMd(b.dataset.md)));
function setNePreview(on){
  const ta=$('#neBodyInput'),pvBox=$('#nePreview'),pvBtn=$('#nePreviewToggle'),tb=$('#neToolbar');
  if(!ta||!pvBox)return;
  if(on){pvBox.innerHTML=mdBlock(ta.value.trim())||'<p style="color:var(--faint)">Пусто.</p>';pvBox.hidden=false;ta.hidden=true;if(tb)tb.hidden=true;if(pvBtn)pvBtn.textContent='Редактировать';}
  else{pvBox.hidden=true;ta.hidden=false;if(tb&&neEditingKind!=='ins')tb.hidden=false;if(pvBtn)pvBtn.textContent='Предпросмотр';}
}
$('#nePreviewToggle')&&$('#nePreviewToggle').addEventListener('click',()=>{const pvBox=$('#nePreview');setNePreview(pvBox&&pvBox.hidden);});
$('#neBodyInput')&&$('#neBodyInput').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();neApplyMd('bold');}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='i'){e.preventDefault();neApplyMd('italic');}
});
$('#noteAddBtn')&&$('#noteAddBtn').addEventListener('click',()=>openNoteEditor(null));
$('#noteCatFilterChip')&&$('#noteCatFilterChip').addEventListener('click',()=>{noteCatFilterVal=null;renderNotes();});
$('#neClose')&&$('#neClose').addEventListener('click',()=>$('#noteEditOverlay').classList.remove('open'));
$('#noteEditOverlay')&&$('#noteEditOverlay').addEventListener('click',e=>{if(e.target===$('#noteEditOverlay'))$('#noteEditOverlay').classList.remove('open');});
$('#neSave')&&$('#neSave').addEventListener('click',()=>{
  const title=$('#neTitleInput').value.trim();
  if(!title){toast('Название не может быть пустым',true);return;}
  const body=$('#neBodyInput')?$('#neBodyInput').value.trim():'';
  const tags=$('#neTagsInput').value.split(',').map(t=>t.trim()).filter(Boolean).map(t=>t.startsWith('#')?t:'#'+t);
  if(neEditingKind==='sum'){
    if(!neEditingId){toast('Ошибка редактирования конспекта',true);$('#noteEditOverlay').classList.remove('open');return;}
    const parsed=parseSumId(neEditingId);const h=parsed&&history.find(x=>x.id===parsed.reportId);
    if(h&&h.summaries&&h.summaries[parsed.idx]){h.summaries[parsed.idx].title=title;h.summaries[parsed.idx].body=body;if(h===currentEntry)renderDigest(currentEntry);saveHistory();}
  }else if(neEditingKind==='ins'){
    const arr=loadExtracted();
    if(neEditingId){const ex=arr.find(x=>x.id===neEditingId);if(ex){ex.text=title;ex.tags=tags;}}
    else{arr.unshift({id:uid('ex'),text:title,tags,ts:Date.now()});}
    saveExtracted(arr);
  }else{
    const arr=loadManualNotes();
    if(neEditingId){const mn=arr.find(x=>x.id===neEditingId);if(mn){mn.title=title;mn.body=body;mn.tags=tags;}}
    else{arr.unshift({id:uid('mn'),title,body,tags,ts:Date.now()});}
    saveManualNotes(arr);
  }
  $('#noteEditOverlay').classList.remove('open');
  toast(neEditingId?'Заметка обновлена':'Заметка добавлена');
  renderNotes();
});
$('#neDelete')&&$('#neDelete').addEventListener('click',()=>{
  if(!neEditingId)return;
  if(!confirm('Удалить эту заметку?'))return;
  deleteNoteAny({id:neEditingId,kind:neEditingKind});
  $('#noteEditOverlay').classList.remove('open');
  $('#noteDetailOverlay').classList.remove('open');
  toast('Заметка удалена');
  renderNotes();
});
function deleteNoteAny(note){
  if(note.kind==='sum'){
    const parsed=parseSumId(note.id);const h=parsed&&history.find(x=>x.id===parsed.reportId);
    if(h&&h.summaries){h.summaries=h.summaries.filter((_,i)=>i!==parsed.idx);saveHistory();if(h===currentEntry)renderDigest(currentEntry);}
  }else{
    saveManualNotes(loadManualNotes().filter(x=>x.id!==note.id));
  }
}
function findNoteById(notes,id){return notes.find(x=>x.id===id);}
$('#ndClose')&&$('#ndClose').addEventListener('click',()=>$('#noteDetailOverlay').classList.remove('open'));
$('#noteDetailOverlay')&&$('#noteDetailOverlay').addEventListener('click',e=>{if(e.target===$('#noteDetailOverlay'))$('#noteDetailOverlay').classList.remove('open');});
$('#openNotes')&&$('#openNotes').addEventListener('click',()=>{renderNotes();show($('#view-notes'));});
$('#notesBack')&&$('#notesBack').addEventListener('click',()=>show($('#view-input')));
$('#noteSearch')&&$('#noteSearch').addEventListener('input',e=>{noteSearch=e.target.value.toLowerCase();renderNotes();});
async function llmComplete(prompt){
  const p=settings.provider||'gemini';
  if(p==='openrouter'){const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.orKey,'HTTP-Referer':location.origin,'X-Title':'NeuroCatch'},body:JSON.stringify({model:settings.orModel||'meta-llama/llama-3.3-70b-instruct:free',messages:[{role:'user',content:prompt}]})});const j=await res.json();return (j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||'';}
  if(p==='ollama'){const base=(settings.ollamaUrl||'http://localhost:11434').replace(/\/$/,'');const res=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:settings.ollamaModel||'llama3.1',stream:false,messages:[{role:'user',content:prompt}]})});const j=await res.json();return (j.message&&j.message.content)||'';}
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+(settings.model||'gemini-2.5-flash')+':generateContent?key='+encodeURIComponent(settings.key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2048}})});
  const j=await res.json();try{return j.candidates[0].content.parts.map(x=>x.text||'').join('');}catch(e){return '';}
}
async function semanticSearch(){
  const box=$('#searchResults');if(!box)return;const q=(($('#globalSearch')&&$('#globalSearch').value)||'').trim();
  if(q.length<2){toast('Введите запрос',true);return;}
  if(!hasLLM()){toast('Сначала настрой провайдера ИИ',true);return;}
  box.innerHTML='<div class="empty">Ищу по смыслу через '+providerName()+'…</div>';
  const notes=buildNotes().slice(0,60);
  if(!notes.length){box.innerHTML='<div class="empty">Пока нет заметок для поиска.</div>';return;}
  const corpus=notes.map((n,i)=>`[${i}] ${(n.title||'').slice(0,80)} · ${(n.tags||[]).join(' ')} · ${(n.body||'').replace(/\s+/g,' ').slice(0,200)}`).join('\n');
  const prompt='Ты ищешь по личной базе заметок ПО СМЫСЛУ (не по точным словам).\nЗапрос пользователя: "'+q+'"\nЗаметки (формат [номер] заголовок · теги · фрагмент):\n'+corpus+'\n\nВерни ТОЛЬКО JSON-массив до 8 самых релевантных по смыслу, без пояснений вокруг: [{"i":номер,"why":"кратко почему подходит"}]. Если ничего не подходит — [].';
  try{
    let txt=await llmComplete(prompt);txt=(txt||'').replace(/```json|```/g,'').trim();const mm=txt.match(/\[[\s\S]*\]/);const arr=JSON.parse(mm?mm[0]:txt);
    if(!arr.length){box.innerHTML='<div class="empty">По смыслу ничего не нашлось.</div>';return;}
    box.innerHTML='<div class="sr-group"><div class="sr-h">По смыслу · ИИ<span>'+arr.length+'</span></div>'+arr.map(r=>{const n=notes[r.i];if(!n)return '';return `<button class="sr-item" data-nid="${attr(n.id)}"><span class="sr-t">${esc(n.title||'Заметка')}</span><span class="sr-sub">${esc(r.why||'')}</span></button>`;}).join('')+'</div>';
    box.querySelectorAll('.sr-item[data-nid]').forEach(b=>b.addEventListener('click',()=>{noteTagFilter=null;noteSearch='';const ns=$('#noteSearch');if(ns)ns.value='';renderNotes();show($('#view-notes'));}));
  }catch(e){box.innerHTML='<div class="empty">Не удалось выполнить смысловой поиск. Попробуй ещё раз.</div>';}
}
/* ---------- swipe gestures ---------- */
function attachSwipe(el,opts){
  if(settings.swipesOn===false)return;
  let x0=0,y0=0,dx=0,active=false;
  el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;x0=e.touches[0].clientX;y0=e.touches[0].clientY;dx=0;active=true;el.style.transition='none';},{passive:true});
  el.addEventListener('touchmove',e=>{if(!active)return;dx=e.touches[0].clientX-x0;const dy=e.touches[0].clientY-y0;if(Math.abs(dy)>Math.abs(dx)+6){active=false;el.style.transform='';el.style.opacity='';return;}el.style.transform='translateX('+dx+'px)';el.style.opacity=String(Math.max(0.3,1-Math.abs(dx)/300));},{passive:true});
  el.addEventListener('touchend',e=>{if(!active)return;active=false;el.style.transition='transform .2s,opacity .2s';const th=90;
    if(dx<-th&&opts.onLeft){e.preventDefault();el.style.transform='translateX(-120%)';el.style.opacity='0';setTimeout(opts.onLeft,170);}
    else if(dx>th&&opts.onRight){e.preventDefault();el.style.transform='translateX(120%)';el.style.opacity='0';setTimeout(opts.onRight,170);}
    else{el.style.transform='';el.style.opacity='';}},{passive:false});
}
$('#semBtn')&&$('#semBtn').addEventListener('click',semanticSearch);
function globalSearch(q){
  const box=$('#searchResults');if(!box)return;q=(q||'').trim().toLowerCase();
  if(q.length<2){box.innerHTML='<div class="empty">Введите минимум 2 символа для поиска.</div>';return;}
  const flat=[];const groups=[];
  const push=(name,items)=>{if(items.length){groups.push([name,items.map(it=>{const fi=flat.length;flat.push(it.act);return {t:it.t,sub:it.sub,fi};})]);}};
  push('Улов',catches.filter(c=>c.text.toLowerCase().includes(q)).slice(0,15).map(c=>({t:c.text,act:()=>{show($('#view-queue'));try{renderQueue();}catch(e){}}})));
  const tm=[];history.forEach(h=>{try{ensureEntry(h);}catch(e){}(h.tasks||[]).forEach(t=>{if(t.text.toLowerCase().includes(q))tm.push({t:t.text+(t.done?' ✓':''),act:()=>{show($('#view-tasks'));setSubTab('tasks');}});});});
  push('Задачи',tm.slice(0,15));
  const nm=[];try{buildNotes().forEach(n=>{if(((n.title||'')+' '+(n.body||'')).toLowerCase().includes(q))nm.push({t:n.title,sub:n.kind==='ins'?'инсайт':'конспект',act:()=>{noteSearch=q;const ns=$('#noteSearch');if(ns)ns.value=q;renderNotes();show($('#view-notes'));}});});}catch(e){}
  push('Заметки',nm.slice(0,15));
  push('Закладки',bookmarks.filter(b=>((b.title||'')+' '+(b.desc||'')+' '+b.url).toLowerCase().includes(q)).slice(0,15).map(b=>({t:b.title||b.url,sub:b.category,act:()=>{renderBookmarks();show($('#view-bookmarks'));}})));
  push('Отчёты',realHistory().filter(h=>((h.markdown||'')+' '+(h.tags||[]).join(' ')).toLowerCase().includes(q)).slice(0,15).map(h=>({t:fmtDate(h.ts)+' · '+((h.tags||[]).slice(0,3).join(', ')||'разбор')+(h.archived?' 📦':''),act:()=>openReport(h.id)})));
  push('Привычки',habits.filter(hb=>hb.name.toLowerCase().includes(q)).slice(0,10).map(hb=>({t:hb.name,act:()=>{show($('#view-tasks'));setSubTab('habits');}})));
  const total=groups.reduce((n,g)=>n+g[1].length,0);
  if(!total){box.innerHTML='<div class="empty">Ничего не найдено по «'+esc(q)+'».</div>';return;}
  box.innerHTML=groups.map(([name,items])=>`<div class="sr-group"><div class="sr-h">${esc(name)}<span>${items.length}</span></div>${items.map(it=>`<button class="sr-item" data-fi="${it.fi}"><span class="sr-t">${esc(it.t)}</span>${it.sub?`<span class="sr-sub">${esc(it.sub)}</span>`:''}</button>`).join('')}</div>`).join('');
  box.querySelectorAll('.sr-item').forEach(b=>b.addEventListener('click',()=>{const f=flat[+b.dataset.fi];if(f)f();}));
}
$('#openSearch')&&$('#openSearch').addEventListener('click',()=>{show($('#view-search'));setTimeout(()=>{const gi=$('#globalSearch');if(gi)gi.focus();},60);});
$('#searchBack')&&$('#searchBack').addEventListener('click',()=>show($('#view-input')));
$('#globalSearch')&&$('#globalSearch').addEventListener('input',e=>globalSearch(e.target.value));
async function generatePeriodReport(kind){
  const now=Date.now();const spanMs=kind==='week'?7*86400000:30*86400000;
  const cutoff=now-spanMs;
  const items=realHistory().filter(h=>h.ts>=cutoff).sort((a,b)=>a.ts-b.ts);
  if(!items.length){toast('За этот период разборов нет',true);return;}
  if(!hasLLM()){toast('Сначала настрой провайдера ИИ в настройках',true);return;}
  const label=kind==='week'?'неделю':'месяц';
  const box=document.createElement('div');box.className='overlay open';box.id='periodReportOverlay';
  box.innerHTML='<div class="modal" style="max-width:600px"><div class="modal-head"><h2>Отчёт за '+label+'</h2><button class="icon-btn" id="prClose"><i data-lucide="x"></i></button></div><div id="prBody" class="note-body"><div class="empty">Собираю сводку через '+providerName()+'…</div></div><div id="prActions" style="display:flex;gap:10px;margin-top:14px"></div></div>';
  document.body.appendChild(box);lucide.createIcons();
  box.querySelector('#prClose').addEventListener('click',()=>box.remove());
  box.addEventListener('click',e=>{if(e.target===box)box.remove();});
  const digest=items.map((h,i)=>{
    const tg=(h.tags||[]).join(', ');
    const tks=(h.tasks||[]).filter(t=>!t.done).map(t=>t.text).slice(0,5).join('; ');
    let d;try{d=parseMd(h.markdown);}catch(e){d={insights:[]};}
    const ins=(d.insights||[]).slice(0,3).join('; ');
    return `${i+1}. ${fmtDate(h.ts)}${tg?(' [теги: '+tg+']'):''}${ins?('\n   Инсайты: '+ins):''}${tks?('\n   Открытые задачи: '+tks):''}`;
  }).join('\n');
  const prompt='Ты помогаешь подвести итоги '+label+'. Ниже сжатые данные по всем разборам за период (даты, теги, ключевые инсайты, ещё не закрытые задачи).\n\n'+digest+'\n\nНапиши краткую сводку на русском (3-6 абзацев): какие темы преобладали, что было важным, что осталось незавершённым, есть ли повторяющиеся паттерны. Пиши связным текстом, без markdown-заголовков, дружелюбно и по делу.';
  try{
    const text=await llmComplete(prompt);
    const body=box.querySelector('#prBody');
    body.innerHTML=mdBlock(text||'Не удалось получить сводку.');
    const acts=box.querySelector('#prActions');
    acts.innerHTML='<button class="btn btn-primary" id="prSave" style="flex:1"><i data-lucide="check"></i>Сохранить как заметку</button><button class="btn" id="prDownload" style="flex:1"><i data-lucide="download"></i>Скачать .md</button>';
    acts.querySelector('#prSave').addEventListener('click',()=>{
      const arr=loadManualNotes();
      arr.unshift({id:uid('mn'),title:'Итоги за '+label+' · '+fmtDate(now),body:text,tags:['#'+kind+'-отчёт'],ts:now});
      saveManualNotes(arr);toast('Сохранено в заметках');box.remove();
    });
    acts.querySelector('#prDownload').addEventListener('click',()=>{
      download('report_'+kind+'_'+dateKey(now)+'.md','# Итоги за '+label+' · '+fmtDate(now)+'\n\n'+text,'text/markdown');
    });
  }catch(e){box.querySelector('#prBody').innerHTML='<div class="empty">Ошибка: '+esc(e.message||e)+'</div>';}
}
$('#periodWeekBtn')&&$('#periodWeekBtn').addEventListener('click',()=>generatePeriodReport('week'));
$('#periodMonthBtn')&&$('#periodMonthBtn').addEventListener('click',()=>generatePeriodReport('month'));
/* ---------- Anki (spaced repetition) ---------- */
function loadAnkiDecks(){try{const d=JSON.parse(localStorage.getItem('neurocatch_anki_decks')||'[]');if(!d.length){const def={id:uid('dk'),name:'Общая',ts:Date.now()};localStorage.setItem('neurocatch_anki_decks',JSON.stringify([def]));return [def];}return d;}catch(e){return [];}}
function saveAnkiDecks(a){localStorage.setItem('neurocatch_anki_decks',JSON.stringify(a));touchLocal();}
function loadAnkiCards(){try{return JSON.parse(localStorage.getItem('neurocatch_anki_cards')||'[]');}catch(e){return [];}}
function saveAnkiCards(a){localStorage.setItem('neurocatch_anki_cards',JSON.stringify(a));touchLocal();}
function ankiDueCount(deckId){const now=Date.now();return loadAnkiCards().filter(c=>c.deckId===deckId&&c.due<=now).length;}
function ankiRate(card,rating){
  card.reps=(card.reps||0)+1;card.ease=card.ease||2.5;
  if(rating==='again'){card.interval=1;card.ease=Math.max(1.3,card.ease-0.2);card.reps=0;}
  else if(rating==='hard'){card.interval=Math.max(1,Math.round((card.interval||1)*1.2));card.ease=Math.max(1.3,card.ease-0.15);}
  else if(rating==='good'){card.interval=card.interval?Math.round(card.interval*card.ease):1;if(card.interval===0)card.interval=1;if(card.reps===1&&!card.interval)card.interval=1;}
  else if(rating==='easy'){card.interval=card.interval?Math.round(card.interval*card.ease*1.3):4;card.ease=card.ease+0.15;}
  if(!card.interval||card.interval<1)card.interval=1;
  card.due=Date.now()+card.interval*86400000;
  card.lastReview=Date.now();
}
let ankiStudyQueue=[],ankiStudyDeck=null,ankiCurCard=null,ankiEditingId=null;
function renderAnkiDeckList(){
  const box=$('#ankiDeckList');if(!box)return;
  const decks=loadAnkiDecks();const cards=loadAnkiCards();
  box.innerHTML=decks.map(d=>{
    const total=cards.filter(c=>c.deckId===d.id).length;
    const due=ankiDueCount(d.id);
    return `<div class="anki-deck-card" data-id="${d.id}">
      <div class="anki-deck-main"><div class="anki-deck-name">${esc(d.name)}</div><div class="anki-deck-meta">${total} карточ${total===1?'ка':(total>=2&&total<=4?'ки':'ек')}${due?(' · <b class="anki-due-n">'+due+' на повтор</b>'):''}</div></div>
      <div class="anki-deck-acts"><button class="mini anki-deck-rename" data-id="${d.id}" title="Переименовать"><i data-lucide="pencil"></i></button><button class="mini anki-deck-del" data-id="${d.id}" title="Удалить колоду"><i data-lucide="trash-2"></i></button></div>
    </div>`;
  }).join('')||'<div class="empty">Колод нет.</div>';
  box.innerHTML+='<button class="btn" id="ankiNewDeck" style="width:100%;margin-top:10px"><i data-lucide="plus"></i>Новая колода</button>';
  lucide.createIcons();
  box.querySelectorAll('.anki-deck-card').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('.anki-deck-acts'))return;openAnkiStudy(el.dataset.id);}));
  box.querySelectorAll('.anki-deck-rename').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const d=decks.find(x=>x.id===b.dataset.id);if(!d)return;const nm=prompt('Название колоды:',d.name);if(nm&&nm.trim()){d.name=nm.trim();saveAnkiDecks(decks);renderAnkiDeckList();}}));
  box.querySelectorAll('.anki-deck-del').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(decks.length<=1){toast('Нужна хотя бы одна колода',true);return;}if(!confirm('Удалить колоду и все её карточки?'))return;const id=b.dataset.id;saveAnkiDecks(decks.filter(x=>x.id!==id));saveAnkiCards(cards.filter(c=>c.deckId!==id));renderAnkiDeckList();}));
  const nd=$('#ankiNewDeck');if(nd)nd.addEventListener('click',()=>{const nm=prompt('Название новой колоды:');if(nm&&nm.trim()){const arr=loadAnkiDecks();arr.push({id:uid('dk'),name:nm.trim(),ts:Date.now()});saveAnkiDecks(arr);renderAnkiDeckList();}});
}
function openAnkiStudy(deckId){
  const decks=loadAnkiDecks();const deck=decks.find(d=>d.id===deckId);if(!deck)return;
  ankiStudyDeck=deck;
  const now=Date.now();
  ankiStudyQueue=loadAnkiCards().filter(c=>c.deckId===deckId&&c.due<=now).sort((a,b)=>a.due-b.due);
  $('#ankiStudyDeckName').textContent=deck.name;
  $('#ankiStudyOverlay').classList.add('open');
  ankiNextCard();
}
function ankiNextCard(){
  const body=$('#ankiStudyBody');if(!body)return;
  if(!ankiStudyQueue.length){
    body.innerHTML='<div class="empty" style="padding:40px 20px"><i data-lucide="check-circle"></i>Все карточки этой колоды повторены 👍</div>';
    lucide.createIcons();ankiCurCard=null;return;
  }
  ankiCurCard=ankiStudyQueue[0];
  body.innerHTML=`<div class="anki-card-face"><div class="anki-card-text">${esc(ankiCurCard.front||'(без вопроса)')}</div></div>
    <button class="btn btn-primary" id="ankiReveal" style="width:100%;margin-top:16px">Показать ответ</button>
    <div class="anki-progress">Осталось: ${ankiStudyQueue.length}</div>`;
  lucide.createIcons();
  $('#ankiReveal')&&$('#ankiReveal').addEventListener('click',ankiRevealAnswer);
}
function ankiRevealAnswer(){
  const body=$('#ankiStudyBody');if(!body||!ankiCurCard)return;
  body.innerHTML=`<div class="anki-card-face"><div class="anki-card-text">${esc(ankiCurCard.front||'(без вопроса)')}</div><div class="anki-card-divider"></div><div class="anki-card-text anki-card-back">${esc(ankiCurCard.back)}</div></div>
    <div class="anki-rate-row">
      <button class="anki-rate again" data-r="again">Забыл</button>
      <button class="anki-rate hard" data-r="hard">Трудно</button>
      <button class="anki-rate good" data-r="good">Хорошо</button>
      <button class="anki-rate easy" data-r="easy">Легко</button>
    </div>
    <div class="anki-progress">Осталось: ${ankiStudyQueue.length}</div>`;
  body.querySelectorAll('.anki-rate').forEach(b=>b.addEventListener('click',()=>{
    const cards=loadAnkiCards();const c=cards.find(x=>x.id===ankiCurCard.id);
    if(c){ankiRate(c,b.dataset.r);saveAnkiCards(cards);}
    ankiStudyQueue.shift();
    ankiNextCard();
    renderAnkiDeckList();
  }));
}
function openAnkiCardEditor(opts){
  opts=opts||{};ankiEditingId=opts.id||null;
  const decks=loadAnkiDecks();
  const sel=$('#ankiDeckSelect');if(sel)sel.innerHTML=decks.map(d=>`<option value="${attr(d.id)}">${esc(d.name)}</option>`).join('');
  if(sel&&opts.deckId)sel.value=opts.deckId;
  $('#ankiCardTitle').textContent=ankiEditingId?'Изменить карточку':'Новая карточка';
  const fi=$('#ankiFrontInput');if(fi)fi.value=opts.front||'';
  const bi=$('#ankiBackInput');if(bi)bi.value=opts.back||'';
  const del=$('#ankiCardDelete');if(del)del.hidden=!ankiEditingId;
  $('#ankiCardOverlay').classList.add('open');
  setTimeout(()=>{if(bi)bi.focus();},50);
}
$('#ankiCardClose')&&$('#ankiCardClose').addEventListener('click',()=>$('#ankiCardOverlay').classList.remove('open'));
$('#ankiCardOverlay')&&$('#ankiCardOverlay').addEventListener('click',e=>{if(e.target===$('#ankiCardOverlay'))$('#ankiCardOverlay').classList.remove('open');});
$('#ankiCardSave')&&$('#ankiCardSave').addEventListener('click',()=>{
  const back=$('#ankiBackInput').value.trim();
  if(!back){toast('Заполни ответ/оборот карточки',true);return;}
  const front=$('#ankiFrontInput').value.trim();
  const deckId=$('#ankiDeckSelect').value;
  const cards=loadAnkiCards();
  if(ankiEditingId){const c=cards.find(x=>x.id===ankiEditingId);if(c){c.front=front;c.back=back;c.deckId=deckId;}}
  else{cards.push({id:uid('ac'),deckId,front,back,ease:2.5,interval:0,due:Date.now(),reps:0,ts:Date.now()});}
  saveAnkiCards(cards);
  $('#ankiCardOverlay').classList.remove('open');
  toast(ankiEditingId?'Карточка обновлена':'Карточка создана');
  renderAnkiDeckList();
});
$('#ankiCardDelete')&&$('#ankiCardDelete').addEventListener('click',()=>{
  if(!ankiEditingId)return;if(!confirm('Удалить карточку?'))return;
  saveAnkiCards(loadAnkiCards().filter(x=>x.id!==ankiEditingId));
  $('#ankiCardOverlay').classList.remove('open');
  toast('Карточка удалена');renderAnkiDeckList();
});
$('#ankiStudyClose')&&$('#ankiStudyClose').addEventListener('click',()=>{$('#ankiStudyOverlay').classList.remove('open');renderAnkiDeckList();});
$('#ankiStudyOverlay')&&$('#ankiStudyOverlay').addEventListener('click',e=>{if(e.target===$('#ankiStudyOverlay')){$('#ankiStudyOverlay').classList.remove('open');renderAnkiDeckList();}});
$('#ankiNewCard')&&$('#ankiNewCard').addEventListener('click',()=>openAnkiCardEditor({}));
$('#openAnki')&&$('#openAnki').addEventListener('click',()=>{renderAnkiDeckList();show($('#view-anki'));});
$('#ankiBack')&&$('#ankiBack').addEventListener('click',()=>show($('#view-input')));
function renderDashboard(){
  const box=$('#dashBody');if(!box)return;
  history.forEach(h=>{try{ensureEntry(h);}catch(e){}});
  const rh=realHistory();
  const reportsTotal=rh.length;
  const dayset=new Set(rh.map(h=>h.date||dateKey(h.ts)));
  let streak=0;{const d=new Date();d.setHours(0,0,0,0);if(!dayset.has(dateKey(d.getTime())))d.setDate(d.getDate()-1);while(dayset.has(dateKey(d.getTime()))){streak++;d.setDate(d.getDate()-1);}}
  let tTotal=0,tDone=0;history.forEach(h=>(h.tasks||[]).forEach(t=>{tTotal++;if(t.done)tDone++;}));
  const tPct=tTotal?Math.round(tDone/tTotal*100):0;
  const weekKeys=[];{const d=new Date();for(let i=0;i<7;i++){weekKeys.push(dateKey(d.getTime()));d.setDate(d.getDate()-1);}}
  let habBest=0,habWeek=0;habits.forEach(hb=>{habBest=Math.max(habBest,habitStreak(hb));weekKeys.forEach(k=>{if(hb.checks&&hb.checks[k])habWeek++;});});
  let noteCount=0;try{noteCount=buildNotes().length;}catch(e){}
  const days=[];{const d=new Date();d.setHours(0,0,0,0);for(let i=13;i>=0;i--){const dd=new Date(d);dd.setDate(d.getDate()-i);const k=dateKey(dd.getTime());days.push({k,d:dd,n:rh.filter(h=>(h.date||dateKey(h.ts))===k).length});}}
  const maxN=Math.max(1,...days.map(x=>x.n));
  const tagFreq={};rh.forEach(h=>(h.tags||[]).forEach(t=>{tagFreq[t]=(tagFreq[t]||0)+1;}));
  const tags=Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,24);const maxT=Math.max(1,...tags.map(t=>t[1]));
  const card=(n,l,extra)=>`<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${l}</div>${extra||''}</div>`;
  box.innerHTML=`
    <div class="dash-grid">
      ${card(reportsTotal,'разборов')}
      ${card('🔥 '+streak,'дней подряд')}
      ${card(tDone+'/'+tTotal,'задач закрыто','<div class="stat-bar"><span style="width:'+tPct+'%"></span></div>')}
      ${card(habits.length,'привычек · 🔥'+habBest)}
      ${card(noteCount,'заметок')}
      ${card(bookmarks.length,'закладок')}
      ${card(catches.length,'в улове')}
      ${card((()=>{let o=0;history.forEach(h=>(h.tasks||[]).forEach(t=>{if(!t.done&&t.due&&t.due<Date.now())o++;}));return o;})(),'просрочено')}
      ${card(habWeek,'отметок за неделю')}
    </div>
    <div class="dash-sec"><h3>Активность · 14 дней</h3><div class="act-chart">${days.map(x=>`<div class="act-col"><div class="act-bar${x.n?'':' zero'}" style="height:${x.n?Math.max(8,Math.round(x.n/maxN*100)):3}%" title="${x.n} разбор(ов)"></div><span class="act-d">${x.d.getDate()}</span></div>`).join('')}</div></div>
    <div class="dash-sec"><h3>Облако тегов</h3><div class="tag-cloud">${tags.length?tags.map(([t,n])=>`<button class="tag-cloud-item" data-t="${attr(t)}" style="font-size:${(0.85+n/maxT*0.85).toFixed(2)}rem;opacity:${(0.6+n/maxT*0.4).toFixed(2)}">${esc(t)}<span class="tcn">${n}</span></button>`).join(''):'<span class="empty">Тегов пока нет</span>'}</div></div>`;
  box.querySelectorAll('.tag-cloud-item').forEach(b=>b.addEventListener('click',()=>{noteTagFilter=b.dataset.t;renderNotes();show($('#view-notes'));}));
}
$('#openDash')&&$('#openDash').addEventListener('click',()=>{renderDashboard();show($('#view-dashboard'));});
$('#dashBack')&&$('#dashBack').addEventListener('click',()=>show($('#view-input')));
function renderActionBar(mode){
  const bar=$('#actionBar');
  const btns=[`<button class="btn btn-copy" id="copyBtn"><i data-lucide="copy"></i>В Obsidian</button>`,
    `<button class="btn" id="mdBtn"><i data-lucide="file-down"></i>Экспорт .md</button>`,
    `<button class="btn" id="addMoreBtn"><i data-lucide="plus-circle"></i>Дозакинуть</button>`];
  if(mode==='fresh')btns.push(`<button class="btn btn-clear" id="clearBtn"><i data-lucide="trash-2"></i>Очистить день</button>`);
  else btns.push(`<button class="btn btn-clear" id="delRepBtn"><i data-lucide="trash-2"></i>Удалить отчёт</button>`);
  bar.innerHTML=btns.join('');lucide.createIcons();
  $('#copyBtn')&&$('#copyBtn').addEventListener('click',copyDigest);
  $('#mdBtn')&&$('#mdBtn').addEventListener('click',exportMd);
  $('#addMoreBtn')&&$('#addMoreBtn').addEventListener('click',()=>{show($('#view-input'));ta.focus();toast('Добавляй в улов');});
  if(mode==='fresh')$('#clearBtn')&&$('#clearBtn').addEventListener('click',()=>{catches=[];saveCatches();refreshCount();show($('#view-input'));toast('День очищен');});
  else $('#delRepBtn')&&$('#delRepBtn').addEventListener('click',()=>{if(currentEntry&&confirm('Удалить этот отчёт?')){history=history.filter(x=>x.id!==currentEntry.id);saveHistory();show($('#view-history'));renderHistory();toast('Отчёт удалён');}});
}

/* ---------- ritual ---------- */
function saveToHistory(md,items){const d=parseMd(md);const src=(items||catches).map(c=>c.text).join('\n');const bmUrls=new Set((d.bookmarks||[]).map(b=>b.url));const entry={id:uid('d'),ts:Date.now(),date:dateKey(Date.now()),markdown:md,tags:d.tags,links:assembleLinks(d,src).filter(l=>!bmUrls.has(l.url)),tasks:d.tasks.map((t,i)=>({id:'d'+Date.now()+'_t'+i,text:t,done:false})),bookmarks:d.bookmarks||[],insights:d.insights||[],summaries:d.summaries||[]};history.unshift(entry);ingestBookmarks(entry.bookmarks);saveHistory();return entry;}
/* ---------- offline queue for ritual ---------- */
function loadRitualQueue(){try{return JSON.parse(localStorage.getItem('neurocatch_ritual_queue')||'[]');}catch(e){return [];}}
function saveRitualQueue(q){localStorage.setItem('neurocatch_ritual_queue',JSON.stringify(q));}
function queueRitual(items,opts){
  const isDaily=(items===catches);
  const q=loadRitualQueue();
  q.push({id:uid('rq'),kind:isDaily?'daily':'link',items:isDaily?null:items,opts:{title:opts.title,back:opts.back},queuedAt:Date.now()});
  saveRitualQueue(q);
  refreshQueueBadge();
  show($('#view-input'));
  toast('Нет сети — разбор поставлен в очередь и запустится автоматически, когда сеть вернётся');
}
function refreshQueueBadge(){const n=loadRitualQueue().length;const el=$('#ritualQueueBadge');if(el){el.hidden=!n;el.textContent=n;}}
let processingQueue=false;
async function processRitualQueue(){
  if(processingQueue)return;if(!navigator.onLine)return;
  if(!$('#view-digest')||!$('#loader'))return; // страница без интерфейса разбора (напр. tasks.html)
  const q=loadRitualQueue();if(!q.length)return;
  processingQueue=true;
  const entry=q.shift();saveRitualQueue(q);refreshQueueBadge();
  toast('Сеть вернулась — запускаю отложенный разбор…');
  try{await runRitual(entry.kind==='daily'?catches:entry.items,entry.opts||{});}catch(e){}
  processingQueue=false;
  if(loadRitualQueue().length)setTimeout(processRitualQueue,1500);
}
window.addEventListener('online',()=>{setTimeout(processRitualQueue,800);});
async function processMarkedBookmarks(items){
  const marked=items.filter(c=>c.markBookmark);
  if(!marked.length)return items;
  const rest=items.filter(c=>!c.markBookmark);
  const isDaily=(items===catches);
  toast('Добавляю '+marked.length+' в закладки…');
  await Promise.all(marked.map(async c=>{
    const url=(c.text.match(URL_RE)||[])[0];
    if(!url){return;}
    let title=hostOf(url),desc='';
    try{const m=await fetchMeta(url);if(m){if(m.title)title=m.title;if(m.desc)desc=m.desc;}}catch(e){}
    ingestBookmarks([{url,title,desc,category:'Прочее'}]);
  }));
  if(isDaily){catches=catches.filter(c=>!c.markBookmark);saveCatches();refreshCount();}
  toast('Добавлено в закладки: '+marked.length);
  return isDaily?catches:rest; // сохраняем ссылочное равенство с catches для isDaily-проверок ниже
}
async function runRitual(items,opts){
  opts=opts||{};items=items||catches;
  items=await processMarkedBookmarks(items);
  if(!items.length){show($('#view-input'));toast('Все записи отправлены в закладки — разбирать нечего');return;}
  if(!$('#view-digest')||!$('#loader')||!$('#digestTitle')){toast('Разбор доступен только в основном приложении',true);return;}
  backTarget=opts.back||'#view-input';$('#digestTitle').textContent=opts.title||'Дайджест';show($('#view-digest'));
  $('#loader').hidden=false;$('#streamWrap').hidden=true;$('#result').hidden=true;
  const box=$('#streamBox');box.innerHTML='';
  const startStream=()=>{$('#loader').hidden=true;$('#streamWrap').hidden=false;};
  const isDaily=(items===catches);crumb('ritual '+(isDaily?'daily':'link')+' n='+items.length+' via '+(settings.provider||'gemini'));
  const finish=(md,real)=>{streamAbort=null;$('#streamWrap').hidden=true;const entry=saveToHistory(md,items);if(isDaily&&real&&catches.length&&settings.clearAfter!==false){catches=[];saveCatches();refreshCount();toast('Улов разобран и очищен');}renderDigest(entry);renderActionBar('fresh');$('#result').hidden=false;$('#result').classList.add('enter');requestAnimationFrame(()=>requestAnimationFrame(()=>$('#result').classList.remove('enter')));};
  const showRitualError=(msg)=>{
    $('#loader').hidden=true;$('#streamWrap').hidden=true;
    show($('#view-input'));
    showErrorModal(msg);
  };
  if(!items.length){show($('#view-input'));toast('Улов пуст — нечего разбирать',true);return;}
  if(!hasLLM()){show($('#view-input'));toast('Сначала настрой провайдера ИИ в настройках',true);return;}
  if(!navigator.onLine){queueRitual(items,opts);return;}
  const lk=classifyLinks(items);$('#loaderText').textContent=(lk.yt.length||lk.web.length)?('Читаю ссылки и конспектирую… ('+providerName()+')'):('Думает '+providerName()+'…');
  crumb('stream start provider='+(settings.provider||'gemini')+' links(yt='+lk.yt.length+',web='+lk.web.length+')');
  let opened=false,acc='',lastChunkAt=Date.now();streamAbort=new AbortController();
  const stallCheck=setInterval(()=>{if(Date.now()-lastChunkAt>45000){crumb('stream stall >45s, aborting');streamAbort.abort();}},5000);
  try{const full=await streamLLM(items,txt=>{acc=txt;lastChunkAt=Date.now();if(!opened){opened=true;startStream();crumb('stream first chunk');}box.innerHTML=esc(txt)+'<span class="cursor"></span>';box.scrollTop=box.scrollHeight;},streamAbort.signal);
    clearInterval(stallCheck);
    crumb('stream done len='+(full||'').length+(lastRitualDebug&&lastRitualDebug.finishReason?(' finishReason='+lastRitualDebug.finishReason):''));
    if(!full&&!acc){showRitualError('Провайдер '+providerName()+' вернул пустой ответ. Проверь ключ/модель и попробуй ещё раз, либо открой баг-репорт — там сохранены технические детали последнего запроса.');return;}
    finish(full||acc,true);}
  catch(err){
    clearInterval(stallCheck);
    crumb('stream error: '+(err.name||'')+' '+(err.message||''));
    if(err.name==='AbortError'){
      const stalled=(Date.now()-lastChunkAt>44000);
      if(acc){finish(acc,false);toast(stalled?'Ответ завис — сохранил то, что успело прийти':'Остановлено — сохранён частичный разбор');}
      else{show($('#view-input'));toast(stalled?'Провайдер завис и не ответил — попробуй ещё раз':'Остановлено');}
    }
    else if(acc&&acc.length>40){finish(acc,false);toast('Соединение прервалось — сохранил частичный разбор',true);}
    else if(!navigator.onLine||/network|failed to fetch|econnrefused|econnreset/i.test(err.message||'')){queueRitual(items,opts);}
    else{showRitualError(providerName()+': '+(err.message||'неизвестная ошибка')+'. Технические детали сохранены — если повторится, отправь баг-репорт.');}
  }
}
$('#ritual')&&$('#ritual').addEventListener('click',()=>{if(!catches.length){toast('Улов пуст — сначала закинь что-нибудь',true);return;}renderQueue();show($('#view-queue'));});
/* single-link analyzer */
$('#openLink')&&$('#openLink').addEventListener('click',()=>{$('#linkInput').value='';$('#linkOverlay').classList.add('open');setTimeout(()=>$('#linkInput').focus(),100);});
$('#closeLink')&&$('#closeLink').addEventListener('click',()=>$('#linkOverlay').classList.remove('open'));
$('#linkOverlay')&&$('#linkOverlay').addEventListener('click',e=>{if(e.target===$('#linkOverlay'))$('#linkOverlay').classList.remove('open');});
$('#linkGo')&&$('#linkGo').addEventListener('click',()=>{const u=$('#linkInput').value.trim();if(!/^https?:\/\//i.test(u)){toast('Вставь ссылку (http/https)',true);return;}$('#linkOverlay').classList.remove('open');runRitual([{id:uid('c'),text:u,at:Date.now()}],{title:'Разбор ссылки'});});
$('#stopBtn')&&$('#stopBtn').addEventListener('click',()=>{if(streamAbort)streamAbort.abort();else typewriterStop=true;});

/* ---------- digest shared actions ---------- */
$('#backBtn')&&$('#backBtn').addEventListener('click',()=>show($(backTarget)));
async function copyDigest(){if(!currentEntry)return;await copyText(currentEntry.markdown);}
function download(name,text,mime){const blob=new Blob([text],{type:mime||'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
function slug(t){return (String(t||'').trim().toLowerCase().replace(/[^\wа-яё]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,40))||'konspekt';}
function exportMd(){if(!currentEntry)return;download('neurocatch_'+dateKey(currentEntry.ts)+'.md',currentEntry.markdown,'text/markdown');toast('Экспорт .md');}
function downloadSummary(i){if(!currentEntry)return;const s=(currentEntry.summaries||[])[i];if(!s)return;const md='### '+(s.title||'Конспект')+(s.source?'\n\n🔗 '+s.source:'')+'\n\n'+s.body+'\n';download('konspekt_'+slug(s.title)+'.md',md,'text/markdown');toast('Конспект сохранён .md');}
function tasksToMd(list){return list.map(t=>'- ['+(t.done?'x':' ')+'] '+t.text).join('\n')+'\n';}
function tasksForTick(list){return list.filter(t=>!t.done).map(t=>t.text).join('\n');}
async function copyTick(list){const txt=tasksForTick(list);if(!txt){toast('Нет открытых задач');return;}await copyText(txt);}
function allTasksFlat(){const a=[];history.forEach(h=>{ensureEntry(h);h.tasks.forEach(t=>a.push({text:t.text,done:t.done,ts:h.ts}));});return a.sort((x,y)=>(x.done-y.done)||(y.ts-x.ts));}

/* ---------- history / calendar ---------- */
$('#openHistory')&&$('#openHistory').addEventListener('click',()=>{filterDate=null;searchQuery='';tagFilter=null;showArchived=false;$('#searchInput').value='';renderHistory();show($('#view-history'));});
$('#histBack')&&$('#histBack').addEventListener('click',()=>show($('#view-input')));
$('#calPrev')&&$('#calPrev').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()-1);renderCalendar();});
$('#calNext')&&$('#calNext').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()+1);renderCalendar();});
$('#clearFilter')&&$('#clearFilter').addEventListener('click',()=>{filterDate=null;searchQuery='';tagFilter=null;$('#searchInput').value='';renderHistory();});
$('#toggleArchive')&&$('#toggleArchive').addEventListener('click',()=>{showArchived=!showArchived;filterDate=null;searchQuery='';tagFilter=null;$('#searchInput').value='';renderHistory();});
$('#searchInput')&&$('#searchInput').addEventListener('input',e=>{searchQuery=e.target.value.trim().toLowerCase();renderRepList();});
function renderHistory(){renderCalendar();renderTagFilter();renderRepList();}
function renderCalendar(){
  const y=calCursor.getFullYear(),m=calCursor.getMonth();
  $('#calMonth').textContent=calCursor.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  const daysWith=new Set(realHistory().map(h=>h.date));
  const first=new Date(y,m,1);let start=first.getDay();start=start===0?6:start-1;
  const total=new Date(y,m+1,0).getDate();const todayKey=dateKey(Date.now());
  let html=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<div class="dow">${d}</div>`).join('');
  for(let i=0;i<start;i++)html+='<div class="cal-cell pad"></div>';
  for(let d=1;d<=total;d++){const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const has=daysWith.has(key),today=key===todayKey,sel=filterDate===key;html+=`<div class="cal-cell${has?' has':''}${today?' today':''}${sel?' sel':''}" ${has?`data-date="${key}"`:''}>${d}${has?'<span class="pip"></span>':''}</div>`;}
  $('#calGrid').innerHTML=html;
  $('#calGrid').querySelectorAll('[data-date]').forEach(c=>c.addEventListener('click',()=>{filterDate=filterDate===c.dataset.date?null:c.dataset.date;renderHistory();}));
}
function initTagCollapse(id){
  const det=$('#'+id);if(!det||det.dataset.wired)return;det.dataset.wired='1';
  const key='neurocatch_tagcol_'+id;
  det.open=localStorage.getItem(key)!=='0';
  det.addEventListener('toggle',()=>localStorage.setItem(key,det.open?'1':'0'));
}
function renderTagFilter(){
  const all=[...new Set(realHistory().flatMap(h=>h.tags||[]))];
  const box=$('#tagFilter');
  box.innerHTML=all.map(t=>`<span class="tf${tagFilter===t?' on':''}" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
  box.querySelectorAll('.tf').forEach(el=>el.addEventListener('click',()=>{tagFilter=tagFilter===el.dataset.tag?null:el.dataset.tag;renderHistory();}));
  const cnt=$('#tagFilterCount');if(cnt)cnt.textContent=all.length?('('+all.length+')'):'';
  initTagCollapse('tagFilterWrap');
}
function autoArchiveOldReports(){
  const days=settings.archiveDays;if(!days)return;
  const lastRun=localStorage.getItem('neurocatch_last_autoarchive');const todayK=dateKey(Date.now());
  if(lastRun===todayK)return;
  const cutoff=Date.now()-days*86400000;let changed=false;
  history.forEach(h=>{if(!h.archived&&h.ts<cutoff){h.archived=true;changed=true;}});
  localStorage.setItem('neurocatch_last_autoarchive',todayK);
  if(changed)saveHistory();
}
function archiveReport(id,val){const h=history.find(x=>x.id===id);if(!h)return;h.archived=val;saveHistory();renderHistory();toast(val?'Отчёт архивирован':'Отчёт возвращён из архива');}
function renderRepList(){
  let items=realHistory().slice().sort((a,b)=>b.ts-a.ts);
  const hasIntentFilter=!!(filterDate||tagFilter||searchQuery);
  if(!hasIntentFilter&&!showArchived)items=items.filter(h=>!h.archived);
  if(!hasIntentFilter&&showArchived)items=items.filter(h=>h.archived);
  if(filterDate)items=items.filter(h=>h.date===filterDate);
  if(tagFilter)items=items.filter(h=>(h.tags||[]).includes(tagFilter));
  if(searchQuery)items=items.filter(h=>h.markdown.toLowerCase().includes(searchQuery));
  const parts=[];if(searchQuery)parts.push(`«${$('#searchInput').value.trim()}»`);if(filterDate)parts.push(fmtDate(new Date(filterDate+'T00:00:00')));if(tagFilter)parts.push(tagFilter);
  $('#listLabel').textContent=parts.length?parts.join(' · '):(showArchived?'Архив':'Все отчёты');
  const cf=$('#clearFilter');if(cf)cf.hidden=!(filterDate||searchQuery||tagFilter);
  const archN=history.filter(h=>h.archived).length;
  const acEl=$('#archCount');if(acEl)acEl.textContent=archN?('('+archN+')'):'';
  const tb=$('#toggleArchive');if(tb)tb.classList.toggle('on',showArchived);
  if(!items.length){$('#repList').innerHTML=`<div class="empty"><i data-lucide="inbox"></i>${showArchived?'В архиве пусто.':(history.length?'Ничего не найдено':'История пуста. Проведи «Вечерний ритуал».')}</div>`;lucide.createIcons();return;}
  $('#repList').innerHTML=items.map(h=>{ensureEntry(h);const prev=((h.insights||[])[0]||(h.summaries||[])[0]?.title||(h.tasks[0]&&h.tasks[0].text)||'Разбор').replace(/\*\*/g,'');const tg=(h.tags||[]).slice(0,3).map(t=>`<span>${esc(t)}</span>`).join('');
    return `<div class="rep${h.archived?' archived':''}" data-id="${h.id}"><div class="ic"><i data-lucide="clock"></i></div><div class="txt"><div class="d">${fmtDate(h.ts)}${h.archived?' <span class="arch-badge">архив</span>':''}</div><div class="p">${isIns?'💡 ':''}${esc(prev)}</div>${tg?`<div class="rt">${tg}</div>`:''}</div><div class="meta">${fmtTime(h.ts)}</div><button class="arch" data-arch="${h.id}" data-val="${h.archived?'0':'1'}" aria-label="${h.archived?'Вернуть из архива':'В архив'}" title="${h.archived?'Вернуть из архива':'В архив'}"><i data-lucide="${h.archived?'archive-restore':'archive'}"></i></button><button class="del" data-del="${h.id}" aria-label="Удалить"><i data-lucide="trash-2"></i></button></div>`;}).join('');
  lucide.createIcons();
  $('#repList').querySelectorAll('.rep').forEach(r=>r.addEventListener('click',()=>openReport(r.dataset.id)));
  $('#repList').querySelectorAll('.del').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteReport(b.dataset.del);}));
  $('#repList').querySelectorAll('.arch').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();archiveReport(b.dataset.arch,b.dataset.val==='1');}));
}
function deleteReport(id){if(!confirm('Удалить этот отчёт? Действие необратимо.'))return;history=history.filter(x=>x.id!==id);saveHistory();if(filterDate&&!history.some(h=>h.date===filterDate))filterDate=null;renderHistory();toast('Отчёт удалён');}
function openReport(id){const h=history.find(x=>x.id===id);if(!h)return;ensureEntry(h);backTarget='#view-history';$('#digestTitle').textContent=fmtDate(h.ts);show($('#view-digest'));$('#loader').hidden=true;$('#streamWrap').hidden=true;renderDigest(h);renderActionBar('history');$('#result').hidden=false;}

/* ---------- tasks screen ---------- */
$('#openTasks')&&$('#openTasks').addEventListener('click',()=>{setSubTab(curSubTab);show($('#view-tasks'));});
document.querySelectorAll('#view-tasks .subtab').forEach(b=>b.addEventListener('click',()=>setSubTab(b.dataset.st)));
$('#habitAdd')&&$('#habitAdd').addEventListener('click',()=>{const v=$('#habitName').value.trim();if(!v)return;habits.unshift({id:uid('hb'),name:v,checks:{},createdAt:Date.now()});$('#habitName').value='';saveHabits();renderHabits();});
$('#habitName')&&$('#habitName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#habitAdd').click();});
$('#tasksBack')&&$('#tasksBack').addEventListener('click',()=>show($('#view-input')));
function loadHabits(){try{habits=JSON.parse(localStorage.getItem('neurocatch_habits')||'[]');}catch(e){habits=[];}}
function saveHabits(){localStorage.setItem('neurocatch_habits',JSON.stringify(habits));touchLocal();}
function habitStreak(hb){let n=0;const d=new Date();for(;;){const k=dateKey(d.getTime());if(hb.checks&&hb.checks[k]){n++;d.setDate(d.getDate()-1);}else break;}return n;}
function weekKeysOf(base){const ks=[];const d=new Date(base);let dw=d.getDay();dw=dw===0?6:dw-1;d.setDate(d.getDate()-dw);for(let i=0;i<7;i++){ks.push(dateKey(d.getTime()));d.setDate(d.getDate()+1);}return ks;}
function habitWeekCount(hb){return weekKeysOf(new Date()).reduce((n,k)=>n+((hb.checks&&hb.checks[k])?1:0),0);}
function habitMonthStats(hb){const now=new Date();const y=now.getFullYear(),m=now.getMonth();const daysIn=new Date(y,m+1,0).getDate();const elapsed=now.getDate();let done=0;for(let dd=1;dd<=daysIn;dd++){if(hb.checks&&hb.checks[dateKey(new Date(y,m,dd).getTime())])done++;}const pct=elapsed?Math.round(done/elapsed*100):0;return {daysIn,elapsed,done,pct,y,m};}
function renderHabits(){
  const box=$('#habitList');if(!box)return;
  if(!habits.length){box.innerHTML='<div class="empty">Пока нет привычек. Добавь первую выше — и отмечай каждый день. Задай цель «N раз в неделю» и смотри месячный обзор.</div>';return;}
  const days=[];const base=new Date();for(let i=6;i>=0;i--){const d=new Date(base);d.setDate(base.getDate()-i);days.push(d);}
  const monthName=new Date().toLocaleDateString('ru-RU',{month:'long'});
  box.innerHTML=habits.map(hb=>{
    const goal=hb.goal||7;const wc=habitWeekCount(hb);const ms=habitMonthStats(hb);
    const goalMet=wc>=goal;
    const monthGrid=(()=>{let cells='';for(let dd=1;dd<=ms.daysIn;dd++){const k=dateKey(new Date(ms.y,ms.m,dd).getTime());const on=hb.checks&&hb.checks[k];const fut=dd>ms.elapsed;cells+=`<span class="hm-cell${on?' on':''}${fut?' fut':''}" title="${dd}">${dd}</span>`;}return cells;})();
    return `<div class="habit-card" data-id="${hb.id}">
      <div class="habit-top"><span class="habit-name">${esc(hb.name)}</span><span class="habit-streak">🔥 ${habitStreak(hb)}</span><button class="mini habit-goal" data-id="${hb.id}" title="Цель в неделю">${wc}/${goal}${goalMet?' ✓':''}</button><button class="mini habit-del" data-id="${hb.id}" title="Удалить"><i data-lucide="trash-2"></i></button></div>
      <div class="habit-week">${days.map(d=>{const k=dateKey(d.getTime());const on=hb.checks&&hb.checks[k];const today=k===dateKey(Date.now());return `<button class="habit-day${on?' on':''}${today?' today':''}" data-hid="${hb.id}" data-k="${k}"><span class="hd-dow">${['вс','пн','вт','ср','чт','пт','сб'][d.getDay()]}</span><span class="hd-num">${d.getDate()}</span></button>`;}).join('')}</div>
      <details class="habit-month"><summary><i data-lucide="chevron-down"></i>Месяц · ${esc(monthName)} — ${ms.done}/${ms.elapsed} дн (${ms.pct}%)</summary><div class="hm-bar"><span style="width:${ms.pct}%"></span></div><div class="hm-grid">${monthGrid}</div></details>
    </div>`;}).join('');
  lucide.createIcons();
  box.querySelectorAll('.habit-day').forEach(b=>b.addEventListener('click',()=>{const hb=habits.find(x=>x.id===b.dataset.hid);if(!hb)return;hb.checks=hb.checks||{};if(hb.checks[b.dataset.k])delete hb.checks[b.dataset.k];else hb.checks[b.dataset.k]=1;saveHabits();renderHabits();}));
  box.querySelectorAll('.habit-del').forEach(b=>b.addEventListener('click',()=>{habits=habits.filter(x=>x.id!==b.dataset.id);saveHabits();renderHabits();}));
  box.querySelectorAll('.habit-goal').forEach(b=>b.addEventListener('click',()=>{const hb=habits.find(x=>x.id===b.dataset.id);if(!hb)return;openCatMenu(b,String(hb.goal||7),cat=>{hb.goal=+cat||7;saveHabits();renderHabits();},['1','2','3','4','5','6','7']);}));
}
function icsEscape(t){return String(t||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');}
function icsDate(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+'T'+p(d.getUTCHours())+p(d.getUTCMinutes())+'00Z';}
function buildIcs(tasks){
  const now=icsDate(Date.now());
  const events=tasks.filter(t=>t.due).map(t=>{
    const start=icsDate(t.due);const end=icsDate(t.due+30*60000);
    return ['BEGIN:VEVENT','UID:'+t.ref+'_'+t.idx+'@neurocatch','DTSTAMP:'+now,'DTSTART:'+start,'DTEND:'+end,'SUMMARY:'+icsEscape(t.text),'DESCRIPTION:'+icsEscape('Задача из NeuroCatch'),'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NeuroCatch//Tasks//RU','CALSCALE:GREGORIAN','X-WR-CALNAME:NeuroCatch — Задачи',...events,'END:VCALENDAR'].join('\r\n');
}
function exportTasksIcs(){
  const tasks=allOpenTasks().filter(t=>t.due);
  if(!tasks.length){toast('Нет открытых задач со сроком — нечего экспортировать',true);return;}
  download('neurocatch-tasks.ics',buildIcs(tasks),'text/calendar');
  toast('Экспортировано '+tasks.length+' задач(и) — импортируй .ics в календарь');
}
async function getOrCreateIcsFeed(){
  const c=await sbClient();if(!c)throw new Error('Нужна облачная синхронизация (Supabase)');
  if(!sbUser)throw new Error('Нужен вход в облако');
  let token=localStorage.getItem('neurocatch_ics_token');
  if(token){const {data}=await c.from('ics_feeds').select('token').eq('token',token).maybeSingle();if(data)return token;}
  token=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
  const {error}=await c.from('ics_feeds').insert({token,owner:sbUser.id});
  if(error)throw error;
  localStorage.setItem('neurocatch_ics_token',token);
  return token;
}
async function subscribeCalendar(){
  try{
    toast('Создаю ссылку подписки…');
    const token=await getOrCreateIcsFeed();
    const url=settings.sbUrl.replace(/\/$/,'')+'/functions/v1/ics-feed?token='+token;
    await copyText(url);
    toast('Ссылка подписки скопирована — добавь её в календарь (см. инструкцию)');
  }catch(e){toast('Не удалось: '+(e.message||e),true);}
}
function allOpenTasks(){const a=[];history.forEach(h=>{ensureEntry(h);(h.tasks||[]).forEach((t,i)=>{if(!t.done)a.push({ref:h.id,idx:i,text:t.text,eis:t.eis||0,ts:h.ts,due:t.due||0,date:t.due?dateKey(t.due):(h.date||dateKey(h.ts))});});});return a;}
function renderMatrixDateRow(){
  const inp=$('#matrixDateInput');if(inp)inp.value=matrixDate;
  const tb=$('#matrixDateToday');if(tb)tb.hidden=(matrixDate===dateKey(Date.now()));
}
/* ---------- routine tasks catalog ---------- */
const ROUTINE_CATALOG={
  'Уборка дома':['Пропылесосить полы','Помыть полы','Протереть пыль','Помыть окна','Постирать бельё','Погладить одежду','Разобрать шкаф','Вынести мусор','Помыть зеркала','Убрать в ванной','Почистить санузел','Сменить постельное бельё','Проветрить квартиру','Разобрать балкон/кладовку'],
  'Кухня и посуда':['Помыть посуду','Разгрузить/загрузить посудомойку','Протереть столешницы','Почистить плиту','Разморозить холодильник','Выбросить просрочку из холодильника','Помыть холодильник изнутри','Почистить микроволновку','Помыть чайник от накипи','Составить список покупок','Сходить за продуктами','Приготовить еду на неделю (meal prep)'],
  'Быт и хозяйство':['Полить цветы','Пересадить растение','Проверить батарейки в датчиках дыма','Проверить огнетушитель','Сменить фильтр для воды','Почистить пылесос','Заточить ножи','Проверить сроки годности аптечки','Разобрать почту/письма','Сдать вещи на переработку/благотворительность'],
  'Здоровье и тело':['Записаться к стоматологу','Пройти диспансеризацию','Сдать анализы','Записаться к врачу на профосмотр','Проверить зрение','Пополнить аптечку','Постричься','Записаться на массаж','Обновить рецепт на очки/линзы','Проверить сроки годности лекарств','Сделать плановую прививку'],
  'Финансы':['Оплатить коммуналку','Проверить баланс счетов','Оплатить подписки','Отменить ненужные подписки','Свести бюджет за месяц','Отложить в сбережения','Проверить кредитную историю','Оплатить налоги','Продлить страховку','Проверить автосписания'],
  'Автомобиль':['Пройти ТО','Проверить давление в шинах','Поменять масло','Сменить сезонную резину','Помыть машину','Проверить омывающую жидкость','Проверить аптечку и огнетушитель в авто','Продлить страховку ОСАГО','Проверить тормозные колодки','Заправить кондиционер'],
  'Техника и дом':['Обновить прошивки роутера/устройств','Почистить кулер компьютера от пыли','Сделать резервную копию данных','Проверить сроки гарантии техники','Почистить фильтр кондиционера/вытяжки','Заменить лампочки','Проверить работу сигнализации','Смазать скрипящие петли'],
  'Работа и продуктивность':['Разобрать входящие письма','Обновить резюме/портфолио','Архивировать старые проекты','Почистить рабочий стол компьютера','Сделать бэкап важных документов','Обновить пароли','Провести ревизию задач/целей на месяц'],
  'Цифровая гигиена':['Почистить кэш и загрузки','Разобрать фото в галерее','Удалить неиспользуемые приложения','Проверить настройки приватности соцсетей','Сменить пароли на важных аккаунтах','Включить двухфакторную аутентификацию','Разобрать подписки на рассылки'],
  'Питомцы':['Показать питомца ветеринару','Обновить прививки питомца','Постричь когти','Обработать от паразитов','Помыть питомца','Купить корм','Почистить лоток/клетку/аквариум'],
  'Растения и сад':['Полить растения','Подкормить растения','Пересадить растения','Обрезать сухие листья','Прополоть грядки','Собрать урожай','Подготовить сад к сезону'],
  'Документы и администрирование':['Проверить срок действия паспорта','Продлить водительские права','Обновить страховой полис','Разобрать архив документов','Сделать копии важных документов','Проверить срок действия виз','Обновить контакты экстренной связи'],
};
function ensureRoutineEntry(){
  let h=history.find(x=>x.id==='routine-tasks');
  if(!h){h={id:'routine-tasks',ts:Date.now(),date:dateKey(Date.now()),markdown:'',tags:['#рутина'],links:[],bookmarks:[],insights:[],summaries:[],tasks:[],isRoutine:true};history.push(h);saveHistory();}
  return h;
}
function realHistory(){return history.filter(h=>!h.isRoutine);}
function routineActiveTexts(){const h=ensureRoutineEntry();return new Set((h.tasks||[]).filter(t=>!t.done).map(t=>t.text));}
function addRoutineTask(text){
  const h=ensureRoutineEntry();
  h.tasks=h.tasks||[];
  if(h.tasks.some(t=>t.text===text&&!t.done)){toast('Уже в списке задач');return;}
  h.tasks.push({id:uid('rt'),text,done:false});
  saveHistory();
  toast('Добавлено в задачи: '+text);
}
function renderRoutine(){
  const box=$('#routineList');if(!box)return;
  const q=(($('#routineSearch')&&$('#routineSearch').value)||'').trim().toLowerCase();
  const active=routineActiveTexts();
  const cats=Object.keys(ROUTINE_CATALOG);
  const html=cats.map(cat=>{
    const items=ROUTINE_CATALOG[cat].filter(t=>!q||t.toLowerCase().includes(q));
    if(!items.length)return '';
    return `<details class="routine-cat" open><summary>${esc(cat)}<span class="t-group-n">${items.length}</span></summary><div class="routine-items">${items.map(t=>{const added=active.has(t);return `<button class="routine-item${added?' added':''}" data-t="${attr(t)}" ${added?'disabled':''}><span>${esc(t)}</span><i data-lucide="${added?'check':'plus'}"></i></button>`;}).join('')}</div></details>`;
  }).join('');
  box.innerHTML=html||'<div class="empty">Ничего не найдено.</div>';
  lucide.createIcons();
  box.querySelectorAll('.routine-item:not([disabled])').forEach(b=>b.addEventListener('click',()=>{addRoutineTask(b.dataset.t);renderRoutine();}));
}
$('#routineSearch')&&$('#routineSearch').addEventListener('input',()=>renderRoutine());
function renderMatrix(){
  const un=$('#matrixUnsorted'),wrap=$('#matrixWrap');if(!wrap)return;
  renderMatrixDateRow();
  const tasks=allOpenTasks().filter(t=>t.date===matrixDate);
  const unsorted=tasks.filter(t=>!t.eis);
  un.innerHTML=unsorted.length?`<div class="mu-title">Нераспределённые (${unsorted.length})</div>`+unsorted.map(t=>`<button class="m-chip" data-ref="${t.ref}" data-idx="${t.idx}">${esc(t.text)}</button>`).join(''):'<div class="mu-title" style="opacity:.6">Все задачи распределены 👍</div>';
  wrap.innerHTML=EIS.map((q,qi)=>{const list=tasks.filter(t=>t.eis===qi+1);return `<div class="m-quad ${q.c}"><div class="m-head"><b>${esc(q.n)}</b><span>${esc(q.s)}</span></div><div class="m-list">${list.map(t=>`<button class="m-chip" data-ref="${t.ref}" data-idx="${t.idx}">${esc(t.text)}</button>`).join('')||'<span class="m-empty">—</span>'}</div></div>`;}).join('');
  wrap.querySelectorAll('.m-chip').forEach(b=>b.addEventListener('click',()=>quadMenu(b)));
  un.querySelectorAll('.m-chip').forEach(b=>b.addEventListener('click',()=>quadMenu(b)));
  if(!tasks.length&&!unsorted.length){/* still show grid with empty state per-quad, no extra banner needed */}
}
$('#matrixDateInput')&&$('#matrixDateInput').addEventListener('change',e=>{if(e.target.value){matrixDate=e.target.value;renderMatrix();}});
$('#matrixDatePrev')&&$('#matrixDatePrev').addEventListener('click',()=>{const d=new Date(matrixDate+'T00:00:00');d.setDate(d.getDate()-1);matrixDate=dateKey(d.getTime());renderMatrix();});
$('#matrixDateNext')&&$('#matrixDateNext').addEventListener('click',()=>{const d=new Date(matrixDate+'T00:00:00');d.setDate(d.getDate()+1);matrixDate=dateKey(d.getTime());renderMatrix();});
$('#matrixDateToday')&&$('#matrixDateToday').addEventListener('click',()=>{matrixDate=dateKey(Date.now());renderMatrix();});
function quadMenu(anchor){
  const ex=$('#catMenu');if(ex)ex.remove();
  const m=document.createElement('div');m.className='study-menu';m.id='catMenu';
  m.innerHTML='<div class="sm-h">Куда отнести</div>'+EIS.map((q,i)=>`<button data-q="${i+1}">${esc(q.n)}</button>`).join('')+'<button data-q="0">Убрать</button>';
  document.body.appendChild(m);const r=anchor.getBoundingClientRect();m.style.top=(r.bottom+6+window.scrollY)+'px';let left=r.left+window.scrollX;if(left+230>window.innerWidth)left=window.innerWidth-238;m.style.left=Math.max(8,left)+'px';
  const close=()=>{m.remove();document.removeEventListener('click',out);};function out(e){if(!e.target.closest('#catMenu')&&e.target!==anchor)close();}
  m.querySelectorAll('button[data-q]').forEach(b=>b.addEventListener('click',()=>{const h=history.find(x=>x.id===anchor.dataset.ref);if(h){const t=h.tasks[+anchor.dataset.idx];t.eis=+b.dataset.q||0;saveHistory();renderMatrix();}close();}));
  setTimeout(()=>document.addEventListener('click',out),0);
}
function setSubTab(st){curSubTab=st;document.querySelectorAll('#view-tasks .subtab').forEach(b=>b.classList.toggle('active',b.dataset.st===st));document.querySelectorAll('#view-tasks .st-panel').forEach(p=>p.hidden=p.dataset.st!==st);if(st==='tasks')renderTasks();else if(st==='habits')renderHabits();else if(st==='routine')renderRoutine();else{matrixDate=dateKey(Date.now());renderMatrix();}}
function taskDayStats(){const map={};history.forEach(h=>{ensureEntry(h);const rk=h.date||dateKey(h.ts);(h.tasks||[]).forEach(t=>{const k=t.due?dateKey(t.due):rk;const s=map[k]||(map[k]={done:0,total:0});s.total++;if(t.done)s.done++;});});return map;}
function shiftTaskCal(dir){if(taskCalMode==='week')taskCalCursor.setDate(taskCalCursor.getDate()+7*dir);else taskCalCursor.setMonth(taskCalCursor.getMonth()+dir);}
function renderTaskCal(){
  const box=$('#taskCal');if(!box)return;const stats=taskDayStats();const todayKey=dateKey(Date.now());
  const dots=k=>{const st=stats[k];if(!st)return '';let h='';const n=Math.min(st.total,4);for(let i=0;i<n;i++)h+='<span class="tc-dot '+(i<st.done?'d-full':'d-open')+'"></span>';if(st.total>4)h+='<span class="tc-plus">+</span>';return h;};
  const cell=(d,k)=>{const st=stats[k];const sel=selTaskDate===k;return `<div class="tc-cell${st?' has':''}${k===todayKey?' today':''}${sel?' sel':''}" data-d="${k}"><span class="tc-num">${d.getDate()}</span><span class="tc-dots">${dots(k)}</span></div>`;};
  let header='',cells='';
  if(taskCalMode==='week'){
    const base=new Date(taskCalCursor);let dw=base.getDay();dw=dw===0?6:dw-1;const mon=new Date(base);mon.setDate(base.getDate()-dw);const end=new Date(mon);end.setDate(mon.getDate()+6);
    header=mon.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' – '+end.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);cells+=cell(d,dateKey(d.getTime()));}
  }else{
    const y=taskCalCursor.getFullYear(),m=taskCalCursor.getMonth();header=taskCalCursor.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const first=new Date(y,m,1);let start=first.getDay();start=start===0?6:start-1;const total=new Date(y,m+1,0).getDate();
    cells=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<div class="tc-dow">${x}</div>`).join('');
    for(let i=0;i<start;i++)cells+='<div class="tc-cell pad"></div>';
    for(let d=1;d<=total;d++){const dt=new Date(y,m,d);cells+=cell(dt,dateKey(dt.getTime()));}
  }
  box.innerHTML=`<div class="tc-head"><button class="mini" id="tcPrev"><i data-lucide="chevron-left"></i></button><div class="tc-title">${header}</div><button class="mini" id="tcNext"><i data-lucide="chevron-right"></i></button><button class="mini" id="tcMode" title="Неделя / месяц"><i data-lucide="${taskCalMode==='week'?'chevron-down':'chevron-up'}"></i></button></div><div class="tc-grid ${taskCalMode}">${cells}</div>`;
  lucide.createIcons();
  $('#tcPrev').onclick=()=>{shiftTaskCal(-1);renderTaskCal();};
  $('#tcNext').onclick=()=>{shiftTaskCal(1);renderTaskCal();};
  $('#tcMode').onclick=()=>{taskCalMode=taskCalMode==='week'?'month':'week';renderTaskCal();};
  box.querySelectorAll('[data-d]').forEach(c=>c.addEventListener('click',()=>{selTaskDate=selTaskDate===c.dataset.d?null:c.dataset.d;renderTaskCal();renderTaskList();}));
}
function taskToggleDone(ref,idx){const h=history.find(x=>x.id===ref);if(!h)return;const t=h.tasks[idx];if(!t)return;t.done=!t.done;saveHistory();renderTasks();}
function taskDelete(ref,idx){const h=history.find(x=>x.id===ref);if(!h)return;h.tasks=h.tasks.filter((_,i)=>i!==idx);saveHistory();renderTasks();toast('Задача удалена');}
function taskSaveText(ref,idx,text){const h=history.find(x=>x.id===ref);if(!h)return;const t=h.tasks[idx];if(!t)return;const v=text.trim();if(!v){taskDelete(ref,idx);return;}if(v!==t.text){t.text=v;saveHistory();}}
function renderTaskGroupRow(){
  const box=$('#taskGroupRow');if(!box)return;
  const modes=[['none','Список'],['due','По сроку'],['report','По разбору']];
  box.innerHTML=modes.map(([k,l])=>`<button class="chip${taskGroupMode===k?' on':''}" data-g="${k}">${l}</button>`).join('');
  box.querySelectorAll('[data-g]').forEach(b=>b.addEventListener('click',()=>{taskGroupMode=b.dataset.g;localStorage.setItem('neurocatch_task_group',taskGroupMode);renderTaskList();}));
}
function dueBucket(t,todayKey,weekEndKey){
  if(!t.due)return 'Без срока';
  const k=dateKey(t.due);
  if(k<todayKey)return '⚠️ Просрочено';
  if(k===todayKey)return 'Сегодня';
  const tmr=new Date();tmr.setDate(tmr.getDate()+1);
  if(k===dateKey(tmr.getTime()))return 'Завтра';
  if(k<=weekEndKey)return 'На этой неделе';
  return 'Позже';
}
function renderTaskList(){
  renderTaskGroupRow();
  const all=[];history.forEach(h=>{ensureEntry(h);(h.tasks||[]).forEach((t,i)=>all.push({ref:h.id,idx:i,text:t.text,done:t.done,ts:h.ts,due:t.due||0,date:t.due?dateKey(t.due):(h.date||dateKey(h.ts)),reportDate:h.date||dateKey(h.ts)}));});
  const scoped=selTaskDate?all.filter(t=>t.date===selTaskDate):all;
  const openL=scoped.filter(t=>!t.done).sort((a,b)=>b.ts-a.ts);
  const doneL=scoped.filter(t=>t.done).sort((a,b)=>b.ts-a.ts);
  $('#tasksLabel').textContent=(selTaskDate?('За '+selTaskDate+' · '):'')+'Открыто: '+openL.length+' из '+scoped.length;
  const row=t=>`<div class="t-row${t.done?' done':''}" data-ref="${t.ref}" data-idx="${t.idx}"><button class="box" data-ref="${t.ref}" data-idx="${t.idx}" title="Отметить выполненной"><i data-lucide="check"></i></button><div class="tt"><div class="tx" data-ref="${t.ref}" data-idx="${t.idx}" title="Нажми, чтобы изменить">${safe(t.text)}</div><div class="src">${fmtDate(t.ts)}${t.due?` · <span class="due-badge">⏰ ${esc(fmtDueShort(t.due))}</span>`:''}</div></div><button class="mini t-date" data-ref="${t.ref}" data-idx="${t.idx}" title="Срок"><i data-lucide="calendar"></i></button><button class="mini t-del" data-ref="${t.ref}" data-idx="${t.idx}" title="Удалить"><i data-lucide="trash-2"></i></button></div>`;
  let openHtml;
  if(!openL.length){
    openHtml=`<div class="empty"><i data-lucide="list-todo"></i>Открытых задач нет${selTaskDate?' в этот день':''}.</div>`;
  }else if(taskGroupMode==='none'){
    openHtml=openL.map(row).join('');
  }else if(taskGroupMode==='due'){
    const todayKey=dateKey(Date.now());const we=new Date();we.setDate(we.getDate()+(7-we.getDay()));const weekEndKey=dateKey(we.getTime());
    const order=['⚠️ Просрочено','Сегодня','Завтра','На этой неделе','Позже','Без срока'];
    const groups={};openL.forEach(t=>{const b=dueBucket(t,todayKey,weekEndKey);(groups[b]=groups[b]||[]).push(t);});
    openHtml=order.filter(k=>groups[k]).map(k=>`<div class="t-group"><div class="t-group-h">${k}<span class="t-group-n">${groups[k].length}</span></div>${groups[k].map(row).join('')}</div>`).join('');
  }else{
    const groups={};openL.forEach(t=>{(groups[t.reportDate]=groups[t.reportDate]||[]).push(t);});
    const keys=Object.keys(groups).sort((a,b)=>b.localeCompare(a));
    openHtml=keys.map(k=>`<div class="t-group"><div class="t-group-h">${fmtDate(new Date(k+'T00:00:00').getTime())}<span class="t-group-n">${groups[k].length}</span></div>${groups[k].map(row).join('')}</div>`).join('');
  }
  $('#taskList').innerHTML=openHtml;
  $('#doneWrap').innerHTML=doneL.length?`<details class="done-spoiler"${doneOpen?' open':''}><summary><i data-lucide="chevron-down"></i>Выполненные (${doneL.length})</summary><div class="rep-list" style="margin-top:10px">${doneL.map(row).join('')}</div></details>`:'';
  lucide.createIcons();
  document.querySelectorAll('#view-tasks .box').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();taskToggleDone(b.dataset.ref,+b.dataset.idx);}));
  document.querySelectorAll('#view-tasks .t-del').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();taskDelete(b.dataset.ref,+b.dataset.idx);}));
  document.querySelectorAll('#view-tasks .t-date').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openDateMenu(b);}));
  document.querySelectorAll('#view-tasks .tx').forEach(el=>el.addEventListener('click',e=>{
    e.stopPropagation();
    if(el.isContentEditable)return;
    const ref=el.dataset.ref,idx=+el.dataset.idx;
    el.contentEditable='true';el.classList.add('editing');el.focus();
    const range=document.createRange();range.selectNodeContents(el);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    const finish=()=>{el.contentEditable='false';el.classList.remove('editing');taskSaveText(ref,idx,el.textContent);};
    el.addEventListener('blur',finish,{once:true});
    el.addEventListener('keydown',function kd(ev){if(ev.key==='Enter'){ev.preventDefault();el.blur();}if(ev.key==='Escape'){el.textContent=el.dataset.orig||el.textContent;el.blur();}},{once:false});
  }));
  document.querySelectorAll('#view-tasks .t-row').forEach(r=>attachSwipe(r,{onRight:()=>taskToggleDone(r.dataset.ref,+r.dataset.idx),onLeft:()=>taskDelete(r.dataset.ref,+r.dataset.idx)}));
  const det=$('#doneWrap').querySelector('details');if(det)det.addEventListener('toggle',()=>{doneOpen=det.open;});
}
function openDateMenu(anchor){
  const ex=$('#catMenu');if(ex)ex.remove();
  const m=document.createElement('div');m.className='study-menu';m.id='catMenu';
  const opts=[['today','Сегодня'],['tomorrow','Завтра'],['week','Через неделю'],['pick','Выбрать дату…'],['clear','Убрать срок']];
  m.innerHTML='<div class="sm-h">Срок задачи</div>'+opts.map(o=>`<button data-o="${o[0]}">${o[1]}</button>`).join('');
  document.body.appendChild(m);const r=anchor.getBoundingClientRect();m.style.top=(r.bottom+6+window.scrollY)+'px';let left=r.right-210+window.scrollX;if(left<8)left=8;m.style.left=left+'px';
  const close=()=>{m.remove();document.removeEventListener('click',out);};function out(e){if(!e.target.closest('#catMenu')&&e.target!==anchor)close();}
  const setDue=(ts)=>{const h=history.find(x=>x.id===anchor.dataset.ref);if(!h)return;const t=h.tasks[+anchor.dataset.idx];if(ts)t.due=ts;else delete t.due;saveHistory();renderTasks();};
  m.querySelectorAll('button[data-o]').forEach(b=>b.addEventListener('click',()=>{const o=b.dataset.o;const d=new Date();d.setHours(9,0,0,0);
    if(o==='today')setDue(d.getTime());
    else if(o==='tomorrow'){d.setDate(d.getDate()+1);setDue(d.getTime());}
    else if(o==='week'){d.setDate(d.getDate()+7);setDue(d.getTime());}
    else if(o==='clear')setDue(0);
    else if(o==='pick'){const inp=document.createElement('input');inp.type='date';inp.style.position='fixed';inp.style.left='-9999px';document.body.appendChild(inp);inp.onchange=()=>{if(inp.value){const dd=new Date(inp.value+'T09:00');setDue(dd.getTime());}inp.remove();};inp.showPicker?inp.showPicker():inp.click();}
    close();}));
  setTimeout(()=>document.addEventListener('click',out),0);
}
function renderTasks(){renderTaskCal();renderTaskList();try{refreshTodayBtn();}catch(e){}}

/* ---------- export / import (merge) ---------- */
$('#exportBtn')&&$('#exportBtn').addEventListener('click',()=>{const payload={app:'NeuroCatch',version:3,exportedAt:new Date().toISOString(),settings,catches,history};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='neurocatch_'+dateKey(Date.now())+'.json';a.click();URL.revokeObjectURL(a.href);toast('Данные выгружены');});
$('#importBtn')&&$('#importBtn').addEventListener('click',()=>$('#importFile').click());
$('#importFile')&&$('#importFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const o=JSON.parse(r.result);let addedH=0,addedC=0;
    const hIds=new Set(history.map(h=>h.id));
    (o.history||[]).forEach(h=>{if(h&&h.id&&!hIds.has(h.id)){ensureEntry(h);history.push(h);hIds.add(h.id);addedH++;}});
    history.sort((a,b)=>b.ts-a.ts);
    const cKeys=new Set(catches.map(c=>c.id||(c.at+'|'+c.text)));
    (o.catches||[]).forEach(c=>{const key=c.id||(c.at+'|'+c.text);if(!cKeys.has(key)){if(!c.id)c.id=uid('c');catches.push(c);cKeys.add(key);addedC++;}});
    if(o.settings){settings.model=o.settings.model||settings.model;if(typeof o.settings.prompt==='string')settings.prompt=o.settings.prompt;if(o.settings.microlinkKey)settings.microlinkKey=o.settings.microlinkKey;if(typeof o.settings.microPerLink==='boolean')settings.microPerLink=o.settings.microPerLink;if(Array.isArray(o.settings.microExclude))settings.microExclude=o.settings.microExclude;if(o.settings.studyCustomUrl){settings.studyCustomName=o.settings.studyCustomName||'';settings.studyCustomUrl=o.settings.studyCustomUrl;}if(o.settings.provider)settings.provider=o.settings.provider;if(o.settings.orKey)settings.orKey=o.settings.orKey;if(o.settings.orModel)settings.orModel=o.settings.orModel;if(o.settings.ollamaUrl)settings.ollamaUrl=o.settings.ollamaUrl;if(o.settings.ollamaModel)settings.ollamaModel=o.settings.ollamaModel;if(typeof o.settings.clearAfter==='boolean')settings.clearAfter=o.settings.clearAfter;if(typeof o.settings.autoClip==='boolean')settings.autoClip=o.settings.autoClip;if(o.settings.seed)setAccent(o.settings.seed,false);if(o.settings.themeMode)applyThemeMode(o.settings.themeMode,false);if(o.settings.key&&!settings.key)settings.key=o.settings.key;const ak=$('#apikey');if(ak)ak.value=settings.key;const md=$('#model');if(md)md.value=settings.model;buildSwatches();}
    saveSettings();saveCatches();saveHistory();refreshCount();renderHistory();
    toast(`Слито: +${addedH} отчётов, +${addedC} записей`);
  }catch(err){toast('Битый файл импорта',true);}e.target.value='';};
  r.readAsText(f);});

/* ---------- settings ---------- */
const ov=$('#overlay');
$('#openSettings')&&$('#openSettings').addEventListener('click',()=>{fillSettings();setTab('api');renderBbCustomList();ov&&ov.classList.add('open');});
$('#closeSettings')&&$('#closeSettings').addEventListener('click',()=>ov&&ov.classList.remove('open'));
$('#themeSel')&&$('#themeSel').addEventListener('change',e=>applyThemeMode(e.target.value));
$('#saveSettings')&&$('#saveSettings').addEventListener('click',()=>{settings.key=$('#apikey').value.trim();settings.model=$('#model').value;const mk=$('#microKey');if(mk)settings.microlinkKey=mk.value.trim();const sn=$('#studyName');if(sn)settings.studyCustomName=sn.value.trim();const su=$('#studyUrl');if(su)settings.studyCustomUrl=su.value.trim();const pr=$('#provider');if(pr)settings.provider=pr.value;const ok=$('#orKey');if(ok)settings.orKey=ok.value.trim();const om=$('#orModel');if(om)settings.orModel=om.value.trim();const ou=$('#ollamaUrl');if(ou)settings.ollamaUrl=ou.value.trim();const omm=$('#ollamaModel');if(omm)settings.ollamaModel=omm.value.trim();const ca=$('#clearAfter');if(ca)settings.clearAfter=ca.checked;const acl=$('#autoClip');if(acl)settings.autoClip=acl.checked;const asy=$('#autoSync');if(asy)settings.autoSync=asy.checked;const sw=$('#swipesOn');if(sw)settings.swipesOn=sw.checked;const va=$('#voiceAutoAdd');if(va)settings.voiceAutoAdd=va.checked;const ad=$('#archiveDays');if(ad)settings.archiveDays=+ad.value;const pvEl=$('#promptInput');const pv=pvEl?pvEl.value.trim():'';settings.prompt=(pv&&pv!==DEFAULT_PROMPT.trim())?pv:'';saveSettings();ov&&ov.classList.remove('open');toast('Настройки сохранены');});
$('#resetPrompt')&&$('#resetPrompt').addEventListener('click',()=>{$('#promptInput').value=DEFAULT_PROMPT;settings.prompt='';toast('Промпт сброшен к дефолту');});
ov&&ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ov)ov.classList.remove('open');});

/* ---------- cloud sync (Supabase, optional) ---------- */
let sb=null, sbUser=null, cloudTimer=null, cloudBusy=false;
function setCloudStatus(t,on){const el=$('#cloudStatus');if(el){el.textContent=t;el.classList.toggle('on',!!on);}}
function updateCloudButtons(){const io=!!sbUser;const out=$('#sbLogout');if(out)out.hidden=!io;const login=$('#sbLogin');if(!login)return;login.textContent='';const i=document.createElement('i');i.setAttribute('data-lucide','link');login.appendChild(i);login.appendChild(document.createTextNode(io?'Сменить аккаунт':'Войти по ссылке'));lucide.createIcons();}
async function sbClient(){
  if(!settings.sbUrl||!settings.sbKey)return null;
  if(sb)return sb;
  try{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    sb=createClient(settings.sbUrl,settings.sbKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return sb;
  }catch(e){toast('Не удалось загрузить Supabase (нужен интернет)',true);return null;}
}
async function cloudInit(){
  const c=await sbClient();if(!c)return;
  try{const {data}=await c.auth.getSession();
    if(data&&data.session){sbUser=data.session.user;setCloudStatus(sbUser.email,true);setSync('ok');await cloudPull(true);}
    else{setCloudStatus('не в сети');setSync();}
    c.auth.onAuthStateChange((_e,session)=>{sbUser=session?session.user:null;if(sbUser){setCloudStatus(sbUser.email,true);setSync('ok');cloudPull(true);}else{setCloudStatus('не в сети');setSync();}updateCloudButtons();});
  }catch(e){setCloudStatus('ошибка',false);}
  updateCloudButtons();
}
function cloudAppSettings(){return {model:settings.model,themeMode:settings.themeMode,seed:settings.seed,prompt:settings.prompt};}
function setSync(state){const el=$('#syncDot');if(!el)return;el.hidden=!sbUser;el.className='sync-dot'+(state?' '+state:'');el.innerHTML=state==='ok'?'<span class="d"></span>':state==='err'?'<span class="d"></span>':state==='sync'?'':'<span class="d"></span>';}
function replaceState(remote){ // last-writer-wins: полностью заменяем локальное состояние удалённым
  applyingRemote=true;
  if(Array.isArray(remote.catches)){catches=remote.catches;catches.forEach(c=>{if(!c.id)c.id=uid('c');});}
  if(Array.isArray(remote.history)){history=remote.history;history.forEach(ensureEntry);history.sort((a,b)=>b.ts-a.ts);}
  if(remote.settings&&typeof remote.settings==='object'){const rs=remote.settings;if(rs.model)settings.model=rs.model;if(typeof rs.prompt==='string')settings.prompt=rs.prompt;if(rs.seed){settings.seed=rs.seed;setAccent(rs.seed,false);buildSwatches();}if(rs.themeMode)applyThemeMode(rs.themeMode,false);const mEl=$('#model');if(mEl)mEl.value=settings.model;const pEl=$('#promptInput');if(pEl)pEl.value=settings.prompt||DEFAULT_PROMPT;}
  localStorage.setItem('neurocatch_catches',JSON.stringify(catches));
  localStorage.setItem('neurocatch_history',JSON.stringify(history));
  saveSettings();refreshCount();
  applyingRemote=false;
}
async function cloudPull(silent){
  const c=await sbClient();if(!c||!sbUser)return;
  cloudBusy=true;setSync('sync');
  try{const {data,error}=await c.from('states').select('data,updated_at').eq('id',sbUser.id).maybeSingle();
    if(error)throw error;
    const remoteTs=data&&data.updated_at?new Date(data.updated_at).getTime():0;
    if(data&&data.data&&remoteTs>localUpdatedAt){ // облако свежее — принимаем его
      replaceState(data.data);localUpdatedAt=remoteTs;localStorage.setItem('neurocatch_updated',String(remoteTs));
      cloudBusy=false;setSync('ok');if(!silent)toast('Загружено из облака (свежее)');
    }else{ // локальное свежее или равно — выгружаем
      cloudBusy=false;await cloudPush(true);if(!silent)toast('Синхронизировано');
    }
  }catch(e){cloudBusy=false;setSync('err');if(!silent)toast('Синхр: '+(e.message||e),true);}
}
async function cloudPush(silent){
  if(cloudBusy||applyingRemote){return;}const c=await sbClient();if(!c||!sbUser)return;
  setSync('sync');
  try{const ts=localUpdatedAt||Date.now();const payload={catches,history,settings:cloudAppSettings()};
    const {error}=await c.from('states').upsert({id:sbUser.id,data:payload,updated_at:new Date(ts).toISOString()});
    if(error)throw error;setSync('ok');if(!silent)toast('Выгружено в облако');
  }catch(e){setSync('err');if(!silent)toast('Выгрузка: '+(e.message||e),true);}
}
function scheduleCloudPush(){if(!sbUser)return;setSync('sync');clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>cloudPush(true),1500);}
$('#sbLogin')&&$('#sbLogin').addEventListener('click',async()=>{
  settings.sbUrl=$('#sbUrl').value.trim().replace(/\/$/,'');settings.sbKey=$('#sbKey').value.trim();settings.sbEmail=$('#sbEmail').value.trim();saveSettings();sb=null;
  if(!settings.sbUrl||!settings.sbKey){toast('Укажи Supabase URL и anon key',true);return;}
  if(!settings.sbEmail){toast('Укажи email',true);return;}
  const c=await sbClient();if(!c)return;
  try{const {error}=await c.auth.signInWithOtp({email:settings.sbEmail,options:{emailRedirectTo:location.href.split('#')[0]}});
    if(error)throw error;toast('Ссылка для входа отправлена на почту');
  }catch(e){toast('Вход: '+(e.message||e),true);}
});
$('#sbSync')&&$('#sbSync').addEventListener('click',()=>{if(!sbUser){toast('Сначала войди по ссылке',true);return;}cloudPull(false);});
$('#sbLogout')&&$('#sbLogout').addEventListener('click',async()=>{const c=await sbClient();if(c){try{await c.auth.signOut();}catch(e){}}sbUser=null;updateCloudButtons();setCloudStatus('не в сети');toast('Вышел из облака');});

$('#cloudPushNow')&&$('#cloudPushNow').addEventListener('click',()=>{if(!sbUser){toast('Сначала войди по ссылке',true);return;}cloudPush(false);});

/* ---------- status checks ---------- */
function setStatus(id,txt,cls){const el=$('#'+id);if(!el)return;el.className='status'+(cls?' '+cls:'');el.innerHTML='<span class="sd"></span>'+txt;}
function updateProviderUI(){const p=settings.provider||'gemini';document.querySelectorAll('.prov').forEach(el=>el.hidden=true);const b=document.querySelector('.prov-'+p);if(b)b.hidden=false;}

async function checkGemini(){
  const p=settings.provider||'gemini';setStatus('gemStatus','проверяю…','wait');
  try{
    if(p==='gemini'){if(!settings.key){setStatus('gemStatus','нет ключа Gemini');return;}const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?key='+encodeURIComponent(settings.key));if(r.ok)setStatus('gemStatus','Gemini подключён','ok');else{const e=await r.json().catch(()=>({}));setStatus('gemStatus','Gemini: '+((e.error&&e.error.message)||r.status),'err');}}
    else if(p==='openrouter'){if(!settings.orKey){setStatus('gemStatus','нет ключа OpenRouter');return;}const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{'Authorization':'Bearer '+settings.orKey}});if(r.ok){const j=await r.json().catch(()=>({}));const d=j.data||{};let extra='';if(d.limit!=null)extra=' • осталось $'+Math.max(0,(d.limit-(d.usage||0))).toFixed(2);else if(d.usage!=null)extra=' • потрачено $'+(+d.usage).toFixed(2);setStatus('gemStatus','OpenRouter подключён'+extra,'ok');}else setStatus('gemStatus','OpenRouter: '+r.status,'err');}
    else{const base=(settings.ollamaUrl||'http://localhost:11434').replace(/\/$/,'');const r=await fetch(base+'/api/tags');if(r.ok)setStatus('gemStatus','Ollama доступен','ok');else setStatus('gemStatus','Ollama: '+r.status,'err');}
  }catch(e){setStatus('gemStatus','нет ответа / CORS','err');}
}
async function checkDb(){
  if(!settings.sbUrl||!settings.sbKey){setStatus('dbStatus','не настроено');return;}
  setStatus('dbStatus','проверяю...','wait');
  const c=await sbClient();if(!c){setStatus('dbStatus','нет библиотеки','err');return;}
  try{const {data}=await c.auth.getSession();
    if(data&&data.session){setStatus('dbStatus','вошёл: '+data.session.user.email,'ok');}
    else setStatus('dbStatus','ключи ок, не авторизован');
  }catch(e){setStatus('dbStatus','ошибка ключей','err');}
}
$('#checkGem')&&$('#checkGem').addEventListener('click',checkGemini);
$('#provDiag')&&$('#provDiag').addEventListener('click',()=>runGuideCheck(settings.provider||'gemini','provCheck'));
$('#sbDiag')&&$('#sbDiag').addEventListener('click',()=>checkSupabaseSetup('sbCheck'));
$('#provider')&&$('#provider').addEventListener('change',e=>{settings.provider=e.target.value;saveSettings();updateProviderUI();});
$('#checkMicro')&&$('#checkMicro').addEventListener('click',checkMicro);
$('#microPerLink')&&$('#microPerLink').addEventListener('change',e=>{settings.microPerLink=e.target.checked;saveSettings();if(!$('#view-queue').hidden)renderQueue();});
$('#allTasksMd')&&$('#allTasksMd').addEventListener('click',()=>{const l=allTasksFlat();if(!l.length){toast('Задач нет');return;}download('all_tasks_'+dateKey(Date.now())+'.md',tasksToMd(l),'text/markdown');toast('Все задачи сохранены .md');});
$('#allTasksIcs')&&$('#allTasksIcs').addEventListener('click',exportTasksIcs);
$('#allTasksSub')&&$('#allTasksSub').addEventListener('click',subscribeCalendar);
$('#allTasksTick')&&$('#allTasksTick').addEventListener('click',()=>copyTick(allTasksFlat()));
$('#checkDb')&&$('#checkDb').addEventListener('click',checkDb);

/* ---------- notifications ---------- */
let notifyTimer=null;
function urlB64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);const arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return arr;
}
async function webPushSupported(){return 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;}
async function subscribeWebPush(){
  if(!(await webPushSupported())){toast('Push-уведомления не поддерживаются этим браузером',true);return false;}
  if(!settings.sbUrl||!settings.sbKey){toast('Сначала настрой облачную синхронизацию (Supabase) — push использует её',true);return false;}
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){toast('Разрешение на уведомления не выдано',true);return false;}
    const swFile=location.pathname.endsWith('tasks.html')?'sw-tasks.js':'sw.js';
    const reg=await navigator.serviceWorker.register(swFile);
    await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8Array(VAPID_PUBLIC_KEY)});}
    const c=await sbClient();if(!c)throw new Error('Нет клиента Supabase');
    const [hh,mm]=(settings.notifyTime||'21:00').split(':').map(Number);
    const localDate=new Date();localDate.setHours(hh,mm,0,0);
    const utcHH=String(localDate.getUTCHours()).padStart(2,'0'),utcMM=String(localDate.getUTCMinutes()).padStart(2,'0');
    const payload=sub.toJSON();
    const {error}=await c.from('push_subscriptions').upsert({endpoint:payload.endpoint,subscription:payload,notify_time_utc:utcHH+':'+utcMM,owner:sbUser?sbUser.id:null},{onConflict:'endpoint'});
    if(error)throw error;
    localStorage.setItem('neurocatch_webpush_endpoint',payload.endpoint);
    toast('Push-уведомления включены — теперь придут даже при закрытом приложении');
    return true;
  }catch(e){toast('Не удалось включить push: '+(e.message||e),true);return false;}
}
async function unsubscribeWebPush(){
  try{
    if(!('serviceWorker' in navigator))return;
    const swFile=location.pathname.endsWith('tasks.html')?'sw-tasks.js':'sw.js';
    const reg=await navigator.serviceWorker.getRegistration(swFile);
    if(reg){const sub=await reg.pushManager.getSubscription();if(sub){
      const endpoint=sub.endpoint;await sub.unsubscribe();
      try{const c=await sbClient();if(c)await c.from('push_subscriptions').delete().eq('endpoint',endpoint);}catch(e){}
    }}
    localStorage.removeItem('neurocatch_webpush_endpoint');
    toast('Push-уведомления отключены');
  }catch(e){toast('Ошибка отключения push',true);}
}
function refreshNotifyPermStatus(){
  const el=$('#notifyPermStatus');if(!el)return;
  if(!('Notification'in window)){el.className='status err';el.innerHTML='<span class="sd"></span>браузер не поддерживает уведомления';return;}
  const p=Notification.permission;
  if(p==='granted'){el.className='status ok';el.innerHTML='<span class="sd"></span>разрешение получено';}
  else if(p==='denied'){el.className='status err';el.innerHTML='<span class="sd"></span>заблокировано в браузере — включи вручную в настройках сайта';}
  else{el.className='status';el.innerHTML='<span class="sd"></span>ещё не запрошено';}
}
function initNotify(){const no=$('#notifyOn');if(no)no.checked=!!settings.notifyOn;const nt=$('#notifyTime');if(nt)nt.value=settings.notifyTime||'21:00';refreshNotifyPermStatus();refreshWebPushStatus();startNotifyLoop();}
$('#notifyOn')&&$('#notifyOn').addEventListener('change',async e=>{
  if(e.target.checked){if('Notification'in window){const p=await Notification.requestPermission();refreshNotifyPermStatus();if(p!=='granted'){toast('Уведомления запрещены в браузере',true);e.target.checked=false;settings.notifyOn=false;saveSettings();return;}}else{toast('Уведомления не поддерживаются',true);e.target.checked=false;return;}}
  settings.notifyOn=e.target.checked;saveSettings();startNotifyLoop();
});
$('#notifyTime')&&$('#notifyTime').addEventListener('change',e=>{settings.notifyTime=e.target.value;saveSettings();});
$('#notifyTest')&&$('#notifyTest').addEventListener('click',async()=>{if('Notification'in window&&Notification.permission!=='granted')await Notification.requestPermission();refreshNotifyPermStatus();fireNotify('Тест уведомления','Так будет выглядеть напоминание о ритуале.');});
function refreshWebPushStatus(){
  const el=$('#webPushStatus');if(!el)return;
  const on=!!localStorage.getItem('neurocatch_webpush_endpoint');
  const box=$('#webPushOn');if(box)box.checked=on;
  if(on){el.className='status ok';el.innerHTML='<span class="sd"></span>включено — придёт даже при закрытом приложении';}
  else{el.className='status';el.innerHTML='<span class="sd"></span>не включено';}
}
$('#webPushOn')&&$('#webPushOn').addEventListener('change',async e=>{
  if(e.target.checked){const ok=await subscribeWebPush();if(!ok)e.target.checked=false;}
  else{await unsubscribeWebPush();}
  refreshWebPushStatus();
});
let lastNotifyAttempt=null;
function fireNotify(title,body){
  lastNotifyAttempt={title,body,at:Date.now(),perm:(('Notification'in window)?Notification.permission:'unsupported'),hasSW:!!(navigator.serviceWorker&&navigator.serviceWorker.controller)};
  crumb('notify fire: '+title+' (perm='+lastNotifyAttempt.perm+')');
  try{
    const opt={body,icon:'icon.svg',badge:'icon.svg',tag:'neurocatch'};
    if(navigator.serviceWorker&&navigator.serviceWorker.ready&&location.protocol.startsWith('http')){navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,opt)).catch(()=>{new Notification(title,opt);});}
    else if('Notification'in window&&Notification.permission==='granted'){new Notification(title,opt);}
    else toast(title+' — '+body);
  }catch(e){toast(title);}
}
function checkTaskReminders(){
  if(!settings.notifyOn)return;
  const nowMs=Date.now();let fired;try{fired=JSON.parse(localStorage.getItem('neurocatch_task_notified')||'{}');}catch(e){fired={};}
  let changed=false;
  history.forEach(h=>{try{ensureEntry(h);}catch(e){return;}(h.tasks||[]).forEach((t,i)=>{if(t.done||!t.due)return;const key=h.id+'_'+i+'_'+t.due;if(t.due<=nowMs&&!fired[key]&&(nowMs-t.due)<86400000){fired[key]=1;changed=true;fireNotify('⏰ Задача — срок наступил',t.text);}});});
  // prune keys older than 30 days
  for(const k in fired){const due=+(k.split('_').pop());if(due&&nowMs-due>2592000000){delete fired[k];changed=true;}}
  if(changed)localStorage.setItem('neurocatch_task_notified',JSON.stringify(fired));
}
let autoSyncTimer=null;
function startAutoSync(){clearInterval(autoSyncTimer);if(settings.autoSync===false)return;autoSyncTimer=setInterval(()=>{if(settings.autoSync!==false&&sbUser)cloudPull(true);},180000);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&settings.autoSync!==false&&sbUser)cloudPull(true);});
window.addEventListener('focus',()=>{if(settings.autoSync!==false&&sbUser)cloudPull(true);});
function ritualNotifyCheck(){
  if(!settings.notifyOn)return;
  if('Notification'in window&&Notification.permission!=='granted'){crumb('notify skip: permission='+Notification.permission);return;}
  const now=new Date();
  const [th,tm]=(settings.notifyTime||'21:00').split(':').map(Number);
  const target=new Date(now);target.setHours(th||21,tm||0,0,0);
  const diffMin=(now-target)/60000;
  const today=dateKey(Date.now());
  // окно в 10 минут ПОСЛЕ целевого времени — догоняет пропуски из-за троттлинга фоновой вкладки
  if(diffMin>=0&&diffMin<=10&&localStorage.getItem('neurocatch_lastnotify')!==today){
    localStorage.setItem('neurocatch_lastnotify',today);
    fireNotify('NeuroCatch','Пора провести вечерний ритуал — разбери дневной улов.');
  }
}
function startNotifyLoop(){
  clearInterval(notifyTimer);
  if(!settings.notifyOn)return;
  ritualNotifyCheck();checkTaskReminders();
  notifyTimer=setInterval(()=>{ritualNotifyCheck();checkTaskReminders();},20000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&settings.notifyOn){ritualNotifyCheck();checkTaskReminders();}});

/* ---------- bug report ---------- */
let bugStorage=null;
function buildBugData(){
  const safeSettings=Object.assign({},settings);['key','sbKey','microlinkKey','microExclude','orKey'].forEach(k=>delete safeSettings[k]);
  let dm='browser';try{if((matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone)dm='standalone';}catch(e){}
  const av=[...document.querySelectorAll('.view')].find(v=>!v.hidden);
  const conn=(navigator.connection&&navigator.connection.effectiveType)||'?';
  return {app:'NeuroCatch',version:APP_VERSION,swCache:SW_VER,when:new Date().toISOString(),url:location.href,
    secureContext:window.isSecureContext,displayMode:dm,ua:navigator.userAgent,lang:navigator.language,
    online:navigator.onLine,connection:conn,theme:document.documentElement.getAttribute('data-theme'),
    effectiveThemeMode:settings.themeMode,provider:settings.provider,
    viewport:innerWidth+'x'+innerHeight+' @'+(window.devicePixelRatio||1)+'x',
    activeView:av?av.id:'?',currentEntry:currentEntry?currentEntry.id:null,
    counts:{catches:catches.length,history:history.length},
    cloud:{configured:!!(settings.sbUrl&&settings.sbKey),signedIn:!!sbUser,localUpdatedAt:localUpdatedAt},
    storage:bugStorage,breadcrumbs:crumbs,recentErrors:lastErrors,lastRitualDebug:lastRitualDebug,
    notify:{on:!!settings.notifyOn,time:settings.notifyTime,permission:(('Notification'in window)?Notification.permission:'unsupported'),lastFired:localStorage.getItem('neurocatch_lastnotify'),lastAttempt:lastNotifyAttempt,swController:!!(navigator.serviceWorker&&navigator.serviceWorker.controller),webPushEndpointSaved:!!localStorage.getItem('neurocatch_webpush_endpoint')},
    offline:{online:navigator.onLine,queuedRituals:loadRitualQueue().length},
    settings:safeSettings};
}
async function openBug(prefillNote){
  $('#bugNote').value=prefillNote||'';
  $('#bugData').value=JSON.stringify(buildBugData(),null,2);
  $('#bugOverlay').classList.add('open');
  try{if(navigator.storage&&navigator.storage.estimate){const est=await navigator.storage.estimate();bugStorage={usageKB:Math.round((est.usage||0)/1024),quotaMB:Math.round((est.quota||0)/1048576)};$('#bugData').value=JSON.stringify(buildBugData(),null,2);}}catch(e){}
}
/* error modal */
/* русификация частых технических ошибок API */
function translateError(raw){
  const m=String(raw||'');
  const rules=[
    [/429|rate.?limit|resource.?exhausted|quota.?exceeded|too many requests/i,'Превышен лимит запросов (429). Обычно это временно — подожди минуту-другую и попробуй снова, либо проверь остаток квоты/кредита в диагностике провайдера.'],
    [/insufficient.?quota|billing|exceeded your current quota/i,'Закончилась квота/баланс у провайдера. Проверь биллинг или лимиты в личном кабинете провайдера.'],
    [/401|unauthorized|invalid.?api.?key|api key not valid|incorrect api key/i,'Неверный или недействительный API-ключ (401). Проверь ключ в настройках — возможно, он устарел или скопирован с ошибкой.'],
    [/403|permission.?denied|forbidden/i,'Доступ запрещён (403). Ключ не имеет прав на эту модель/операцию — проверь настройки доступа у провайдера.'],
    [/404|model not found|not.?found/i,'Модель не найдена (404). Проверь название модели в настройках — возможно, оно устарело или указано с опечаткой.'],
    [/context.?length|maximum context|too long|token limit exceeded/i,'Превышена максимальная длина контекста. Улов слишком большой для этой модели — попробуй разобрать частями или выбрать модель с большим контекстом.'],
    [/timeout|timed out|etimedout/i,'Провайдер не ответил вовремя (таймаут). Обычно временная проблема на его стороне — попробуй ещё раз.'],
    [/network|failed to fetch|econnrefused|econnreset|dns/i,'Проблема с сетью — не удалось достучаться до провайдера. Проверь интернет-соединение (и что Ollama запущен, если используешь её).'],
    [/5\d\d|internal server error|service unavailable|bad gateway/i,'Сервер провайдера временно недоступен (ошибка 5xx). Это не твоя проблема — попробуй через пару минут.'],
    [/safety/i,'Ответ заблокирован фильтром безопасности модели.'],
    [/recitation/i,'Модель отказалась отвечать из-за похожести на защищённый авторским правом текст.'],
  ];
  for(const [re,ru] of rules){if(re.test(m))return {ru,raw:m};}
  return {ru:null,raw:m};
}
function showErrorModal(msg,opts){
  if(!msg||msg==='Script error.'||/ResizeObserver/.test(msg))return;
  opts=opts||{};
  const {ru,raw}=translateError(msg);
  const el=$('#errMsg');
  if(el){
    if(ru&&!opts.raw){el.innerHTML='<div class="err-ru">'+esc(ru)+'</div><details class="err-raw-wrap"><summary>Исходный текст ошибки</summary><div class="err-raw">'+esc(raw)+'</div></details>';}
    else{el.innerHTML='<div class="err-raw" style="margin:0">'+esc(raw)+'</div>';}
  }
  $('#errOverlay').dataset.rawmsg=raw;
  const ov=$('#errOverlay');if(ov&&!ov.classList.contains('open'))ov.classList.add('open');
}
$('#errClose')&&$('#errClose').addEventListener('click',()=>$('#errOverlay').classList.remove('open'));
$('#errDismiss')&&$('#errDismiss').addEventListener('click',()=>$('#errOverlay').classList.remove('open'));
$('#errCopy')&&$('#errCopy').addEventListener('click',()=>{const raw=$('#errOverlay').dataset.rawmsg||($('#errMsg')&&$('#errMsg').textContent)||'';copyText(raw);});
$('#errReport')&&$('#errReport').addEventListener('click',()=>{$('#errOverlay').classList.remove('open');const raw=$('#errOverlay').dataset.rawmsg||'';openBug(raw?('Ошибка: '+raw):'');});
/* setup guides */
const SB_SQL_RAW=`create table if not exists public.states (
  id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.states enable row level security;
create policy "own-select" on public.states for select using (auth.uid() = id);
create policy "own-insert" on public.states for insert with check (auth.uid() = id);
create policy "own-update" on public.states for update using (auth.uid() = id) with check (auth.uid() = id);

-- Публичные ссылки на заметки (с отзывом доступа):
create table if not exists public.shares (
  token text primary key,
  data jsonb not null,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;
create policy "shares public read" on public.shares for select using (true);
create policy "shares owner insert" on public.shares for insert with check (auth.uid() = owner);
create policy "shares owner delete" on public.shares for delete using (auth.uid() = owner);`;
function openGuide(which){
  const cur=location.href.split('#')[0];
  const G={
    gemini:{t:'Настройка Gemini',h:`<ol>
      <li>Открой <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio → API keys</a>, войди Google-аккаунтом.</li>
      <li>Нажми <b>Create API key</b> и скопируй ключ.</li>
      <li>В настройках выбери провайдера <b>Google Gemini</b> и вставь ключ в поле <b>Gemini API Key</b>.</li>
      <li>Нажми <b>Сохранить</b>, затем <b>Проверить подключение</b> — статус станет «подключено».</li>
    </ol><div class="guide-note">Есть бесплатный лимит. Ключ хранится только в твоём браузере.</div><button type="button" class="btn" id="guideCheckBtn" style="width:100%;margin-top:14px"><i data-lucide="refresh-cw"></i>Проверить настройку</button><div id="guideCheck" class="guide-check"></div>`},
    openrouter:{t:'Настройка OpenRouter',h:`<ol>
      <li>Зарегистрируйся на <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>.</li>
      <li>Открой <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> → <b>Create Key</b> → скопируй (<code>sk-or-...</code>).</li>
      <li>Выбери провайдера <b>OpenRouter</b> и вставь ключ.</li>
      <li>Укажи модель. Бесплатные помечены <code>:free</code> — <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noopener">список бесплатных</a>. Напр. <code>meta-llama/llama-3.3-70b-instruct:free</code>.</li>
      <li>Сохрани и проверь подключение.</li>
    </ol><div class="guide-note">Статьи по ссылкам читаются через r.jina.ai. Видео (в отличие от Gemini) не разбирается.</div><button type="button" class="btn" id="guideCheckBtn" style="width:100%;margin-top:14px"><i data-lucide="refresh-cw"></i>Проверить настройку</button><div id="guideCheck" class="guide-check"></div>`},
    microlink:{t:'Настройка Microlink',h:`<ol>
      <li>Можно не настраивать — работает без ключа: 50 запросов/день.</li>
      <li>Для большего лимита зарегистрируйся на <a href="https://microlink.io" target="_blank" rel="noopener">microlink.io</a>.</li>
      <li>В Dashboard возьми <b>API key</b> и вставь в поле <b>Microlink API key</b>, сохрани.</li>
    </ol><div class="guide-note">Тянет заголовок, лого и издателя ссылок. Приватные ссылки исключаются тумблером «Microlink для отдельных ссылок».</div><button type="button" class="btn" id="guideCheckBtn" style="width:100%;margin-top:14px"><i data-lucide="refresh-cw"></i>Проверить настройку</button><div id="guideCheck" class="guide-check"></div>`},
    supabase:{t:'Настройка Supabase',h:`<ol>
      <li>На <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> создай проект (New project). Запомни пароль БД, регион — поближе.</li>
      <li><b>Project Settings → API</b>: скопируй <b>Project URL</b> и ключ <b>anon public</b>.</li>
      <li>Открой <b>SQL Editor</b>, вставь и выполни:
        <div class="guide-code"><button class="mini" id="guideSqlCopy" title="Скопировать" style="position:absolute;top:8px;right:8px"><i data-lucide="clipboard"></i></button><pre>${esc(SB_SQL_RAW)}</pre></div></li>
      <li><b>Authentication → Providers → Email</b>: включи, оставь <b>Magic Link</b>.</li>
      <li><b>Authentication → URL Configuration</b>: в <b>Site URL</b> и <b>Redirect URLs</b> добавь:<br><code>${esc(cur)}</code></li>
      <li>В настройках вставь <b>URL</b>, <b>anon key</b>, <b>email</b> → <b>Войти по ссылке</b> → открой письмо, вернёшься авторизованным.</li>
      <li>(Опц.) GitHub Actions пинг раз в 3 дня, чтобы free-проект не засыпал.</li>
    </ol><div class="guide-note">anon-ключ публичный — держать в приложении безопасно (данные защищены RLS). Никогда не вставляй service_role ключ.</div><button type="button" class="btn" id="guideCheckBtn" style="width:100%;margin-top:14px"><i data-lucide="refresh-cw"></i>Проверить настройку</button><div id="guideCheck" class="guide-check"></div>`}
  };
  const g=G[which]||G.gemini;
  $('#guideTitle').textContent=g.t;$('#guideBody').innerHTML=g.h;lucide.createIcons();
  const sc=$('#guideSqlCopy');if(sc)sc.addEventListener('click',()=>copyText(SB_SQL_RAW));
  const cb=$('#guideCheckBtn');if(cb)cb.addEventListener('click',()=>runGuideCheck(which,'guideCheck'));
  $('#guideOverlay').classList.add('open');
}
function guideChecker(run){return async function(boxId){const box=$('#'+(boxId||'guideCheck'));if(!box)return;box.innerHTML='<div class="chk">Проверяю…</div>';const lines=[];const add=(b,t)=>{lines.push('<div class="chk '+(b?'ok':'bad')+'">'+(b?'✓ ':'✗ ')+t+'</div>');box.innerHTML=lines.join('');};try{await run(add);}catch(e){add(false,'Сбой проверки: '+(e.message||e));}};}
const checkGeminiSetup=guideChecker(async add=>{
  const key=($('#apikey')&&$('#apikey').value.trim())||settings.key;
  add(!!key,key?'Ключ указан':'Ключ не указан');if(!key)return;
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?key='+encodeURIComponent(key));
  if(!r.ok){const e=await r.json().catch(()=>({}));add(false,'Ключ отклонён: '+((e.error&&e.error.message)||r.status));return;}
  const j=await r.json();const models=(j.models||[]).map(m=>(m.name||'').replace('models/',''));
  add(true,'Ключ рабочий, моделей доступно: '+models.length);
  const qh=r.headers.get('x-ratelimit-remaining')||r.headers.get('x-goog-quota-remaining');if(qh)add(true,'Остаток квоты (по заголовку): '+qh);else add(true,'Точный остаток квоты Google по API не отдаёт — смотри в AI Studio / Cloud Console');
  const sel=($('#model')&&$('#model').value)||settings.model;
  add(models.some(m=>m===sel||m.startsWith(sel)),'Модель '+sel+(models.some(m=>m===sel||m.startsWith(sel))?' доступна':' не найдена'));
});
const checkOpenRouterSetup=guideChecker(async add=>{
  const key=($('#orKey')&&$('#orKey').value.trim())||settings.orKey;
  add(!!key,key?'Ключ указан':'Ключ не указан');if(!key)return;
  const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{'Authorization':'Bearer '+key}});
  if(!r.ok){add(false,'Ключ отклонён: HTTP '+r.status);return;}
  const j=await r.json().catch(()=>({}));const d=j.data||{};add(true,'Ключ рабочий'+(d.label?(' ('+d.label+')'):''));
  if(d.limit!=null||d.usage!=null){const used=(d.usage!=null?('$'+(+d.usage).toFixed(4)):'?');const lim=(d.limit!=null?('$'+(+d.limit).toFixed(2)):'∞');const left=(d.limit!=null?(' • осталось $'+Math.max(0,(d.limit-(d.usage||0))).toFixed(4)):'');add(true,'Лимит: '+used+' из '+lim+left);}
  if(d.is_free_tier)add(true,'Free-tier аккаунт');
  if(d.rate_limit&&d.rate_limit.requests)add(true,'Rate limit: '+d.rate_limit.requests+' / '+(d.rate_limit.interval||'?'));
  const model=($('#orModel')&&$('#orModel').value.trim())||settings.orModel||'meta-llama/llama-3.3-70b-instruct:free';
  try{const rm=await fetch('https://openrouter.ai/api/v1/models');const jm=await rm.json();const ids=(jm.data||[]).map(m=>m.id);add(ids.includes(model),'Модель '+model+(ids.includes(model)?' найдена':' не найдена — проверь имя'));}catch(e){add(false,'Список моделей недоступен');}
});
const checkMicrolinkSetup=guideChecker(async add=>{
  const key=($('#microKey')&&$('#microKey').value.trim())||settings.microlinkKey;
  add(true,key?'Ключ указан (лимит снят)':'Без ключа — 50 запросов/день (это ок)');
  const opt=key?{headers:{'x-api-key':key}}:{};
  const r=await fetch('https://api.microlink.io/?url='+encodeURIComponent('https://example.com'),opt);
  const j=await r.json().catch(()=>({}));
  add(j&&j.status==='success','Тестовый запрос: '+((j&&j.status==='success')?'работает':('ответ '+((j&&j.status)||r.status))));
  const rlLimit=r.headers.get('x-rate-limit-limit')||r.headers.get('x-ratelimit-limit');
  const rlRem=r.headers.get('x-rate-limit-remaining')||r.headers.get('x-ratelimit-remaining');
  if(rlLimit||rlRem)add(true,'Лимит запросов: осталось '+(rlRem!=null?rlRem:'?')+' из '+(rlLimit!=null?rlLimit:'?'));
});
function runGuideCheck(which,boxId){const map={gemini:checkGeminiSetup,openrouter:checkOpenRouterSetup,microlink:checkMicrolinkSetup,supabase:checkSupabaseSetup};(map[which]||function(){})(boxId||'guideCheck');}
async function checkSupabaseSetup(boxId){
  const box=$('#'+(boxId||'guideCheck'));if(!box)return;box.innerHTML='<div class="chk">Проверяю…</div>';
  const lines=[];const add=(b,t)=>lines.push('<div class="chk '+(b?'ok':'bad')+'">'+(b?'✓ ':'✗ ')+t+'</div>');
  const paint=()=>{box.innerHTML=lines.join('');};
  const url=($('#sbUrl')&&$('#sbUrl').value.trim())||settings.sbUrl;
  const key=($('#sbKey')&&$('#sbKey').value.trim())||settings.sbKey;
  const email=($('#sbEmail')&&$('#sbEmail').value.trim())||settings.sbEmail;
  add(!!url,url?'URL указан':'URL не указан');
  add(!!key,key?'anon-ключ указан':'anon-ключ не указан');
  add(!!email,email?'Email для входа указан':'Email не указан (нужен для входа)');
  if(!url||!key){paint();return;}
  let client;
  try{const m=await import('https://esm.sh/@supabase/supabase-js@2');client=m.createClient(url,key);add(true,'Библиотека Supabase и клиент загружены');}
  catch(e){add(false,'Не удалось создать клиент: '+(e.message||e)+' (проверь интернет)');paint();return;}
  try{const {data}=await client.auth.getSession();const signed=!!(data&&data.session);add(signed,signed?('Вход выполнен: '+data.session.user.email):'Не авторизован — нажми «Войти по ссылке» и открой письмо');}
  catch(e){add(false,'Auth недоступен: '+(e.message||e));}
  try{const {error}=await client.from('states').select('id').limit(1);
    if(!error){add(true,'Таблица states доступна');try{const {data:row}=await client.from('states').select('data,updated_at').limit(1).maybeSingle();if(row&&row.data){const kb=Math.round(new Blob([JSON.stringify(row.data)]).size/1024);add(true,'Размер облачных данных: ~'+kb+' КБ (лимит free — 500 МБ БД)');}}catch(_){}}
    else if(/does not exist|42P01|relation/i.test(error.message||''))add(false,'Таблицы states нет — выполни SQL выше в SQL Editor');
    else if(/permission|rls|row-level|jwt|not authorized/i.test(error.message||''))add(true,'Таблица есть, доступ ограничен RLS (это нормально)');
    else add(false,'Проблема с таблицей: '+error.message);
  }catch(e){add(false,'Сеть/URL: '+(e.message||e));}
  paint();
}
$('#guideClose')&&$('#guideClose').addEventListener('click',()=>$('#guideOverlay').classList.remove('open'));
$('#guideOverlay')&&$('#guideOverlay').addEventListener('click',e=>{if(e.target===$('#guideOverlay'))$('#guideOverlay').classList.remove('open');});
$('#overlay')&&$('#overlay').addEventListener('click',e=>{const b=e.target.closest('[data-guide]');if(b){e.preventDefault();e.stopPropagation();openGuide(b.dataset.guide);}});
$('#bugBtn')&&$('#bugBtn').addEventListener('click',()=>openBug(''));
$('#closeBug')&&$('#closeBug').addEventListener('click',()=>$('#bugOverlay').classList.remove('open'));
$('#bugOverlay')&&$('#bugOverlay').addEventListener('click',e=>{if(e.target===$('#bugOverlay'))$('#bugOverlay').classList.remove('open');});
$('#bugCopy')&&$('#bugCopy').addEventListener('click',()=>{const rep='ПРОБЛЕМА:\n'+($('#bugNote').value||'(не описано)')+'\n\nДАННЫЕ:\n'+$('#bugData').value;copyText(rep);});
$('#bugDownload')&&$('#bugDownload').addEventListener('click',()=>{const rep={note:$('#bugNote').value,data:buildBugData()};const blob=new Blob([JSON.stringify(rep,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='neurocatch_bug_'+dateKey(Date.now())+'.json';a.click();URL.revokeObjectURL(a.href);toast('Отчёт сохранён');});

/* ---------- PWA ---------- */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){const isTasks=location.pathname.endsWith('tasks.html');if(isTasks){navigator.serviceWorker.register('sw-tasks.js',{scope:'./tasks.html'}).catch(()=>{});}else{navigator.serviceWorker.register('sw.js').catch(()=>{});}}

/* ---------- init ---------- */
/* ---------- render guards (graceful degradation) ---------- */
function logRenderErr(name,e){try{lastErrors.push({t:Date.now(),msg:name+': '+(e&&e.message||e)});if(lastErrors.length>10)lastErrors.shift();crumb('render err '+name);}catch(_){}}
function digestFallback(e,args){try{const entry=args&&args[0];currentEntry=entry||currentEntry;$('#digestCard').innerHTML='<div class="md-section"><h3>⚠️ Не удалось отрисовать отчёт</h3><p style="margin-bottom:10px">Показываю исходный текст. Пожалуйста, отправь баг-репорт.</p><pre class="raw-md">'+esc((entry&&entry.markdown)||'(пусто)')+'</pre></div>';try{renderActionBar('history');}catch(_){}}catch(_){}}
function guard(name,fn,fb){return function(){try{return fn.apply(this,arguments);}catch(e){logRenderErr(name,e);if(fb){try{fb(e,arguments);}catch(_){}}else{try{toast('Ошибка отрисовки: '+name,true);}catch(__){}}}};}
renderDigest=guard('renderDigest',renderDigest,digestFallback);
renderHistory=guard('renderHistory',renderHistory);
renderTasks=guard('renderTasks',renderTasks);
renderQueue=guard('renderQueue',renderQueue);
renderActionBar=guard('renderActionBar',renderActionBar);
renderCalendar=guard('renderCalendar',renderCalendar);
renderRepList=guard('renderRepList',renderRepList);
renderTagFilter=guard('renderTagFilter',renderTagFilter);
renderBookmarks=guard('renderBookmarks',renderBookmarks);
renderNotes=guard('renderNotes',renderNotes);
renderHabits=guard('renderHabits',renderHabits);
renderMatrix=guard('renderMatrix',renderMatrix);
renderDashboard=guard('renderDashboard',renderDashboard);
renderTasks=guard('renderTasks',renderTasks);

/* ---------- clipboard auto-read ---------- */
let lastClip='';
async function checkClipboard(){
  if(settings.autoClip===false)return;
  if(!navigator.clipboard||!navigator.clipboard.readText)return;
  if(!ta)return;
  const vi=$('#view-input');if(!vi||vi.hidden)return;
  let txt='';try{txt=await navigator.clipboard.readText();}catch(e){return;}
  txt=(txt||'').trim();if(!txt||txt===lastClip)return;if(ta.value.includes(txt))return;
  lastClip=txt;
  const isUrl=/^https?:\/\//i.test(txt);const prev=txt.length>56?txt.slice(0,56)+'…':txt;
  const chip=$('#clipChip');if(!chip)return;
  chip.innerHTML='<span class="cc-label"><i data-lucide="clipboard"></i>'+(isUrl?'Ссылка в буфере: ':'В буфере: ')+esc(prev)+'</span><span class="cc-actions"><button class="cc-add">Вставить</button><button class="cc-x" aria-label="Скрыть">✕</button></span>';
  chip.hidden=false;lucide.createIcons();
  chip.querySelector('.cc-add').onclick=()=>{ta.value=(ta.value?ta.value+'\n':'')+txt;grow();ta.focus();chip.hidden=true;};
  chip.querySelector('.cc-x').onclick=()=>{chip.hidden=true;};
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(checkClipboard,300);});
window.addEventListener('focus',()=>setTimeout(checkClipboard,300));
window.addEventListener('pointerdown',()=>setTimeout(checkClipboard,120),{once:true});
/* ---------- settings tabs ---------- */
function setTab(t){document.querySelectorAll('#overlay .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('#overlay .sgroup').forEach(g=>{g.style.display=(g.dataset.grp===t?'':'none');});const bd=$('#overlay .modal');if(bd)bd.scrollTop=0;}
$('#overlay')&&$('#overlay').addEventListener('click',e=>{const b=e.target.closest('.tab-btn');if(b)setTab(b.dataset.tab);});

/* ---------- ritual presets ---------- */
const PRESET_LABELS={standard:'Стандарт',clinical:'Клинический',content:'Контент',personal:'Личное',custom:'Свой'};
function renderPresetRow(){const row=$('#presetRow');if(!row)return;const cur=settings.preset||'standard';row.innerHTML=Object.keys(PRESET_LABELS).map(k=>`<button class="preset-chip${k===cur?' on':''}" data-p="${k}">${PRESET_LABELS[k]}</button>`).join('');row.querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{settings.preset=b.dataset.p;saveSettings();renderPresetRow();toast('Режим разбора: '+PRESET_LABELS[b.dataset.p]);}));}
/* ---------- background pattern ---------- */
function applyBg(){const el=$('#bgfx');if(!el)return;el.className='bgfx bg-'+(settings.bg||'none');document.querySelectorAll('#bgPicker .bgopt').forEach(b=>b.classList.toggle('on',b.dataset.bg===(settings.bg||'none')));}
$('#bgPicker')&&$('#bgPicker').addEventListener('click',e=>{const b=e.target.closest('.bgopt');if(!b)return;settings.bg=b.dataset.bg;saveSettings();applyBg();});
/* ---------- bottombar customization (order + visibility) ---------- */
const BB_LABELS={openHistory:['calendar','История'],openTasks:['square-check','Задачи'],openSearch:['search','Поиск'],openBookmarks:['bookmark','Закладки'],openNotes:['notebook-pen','Заметки'],openAnki:['layers','Anki'],openDash:['bar-chart-3','Дашборд']};
const BB_DEFAULT_ORDER=['openHistory','openTasks','openSearch','openBookmarks','openNotes','openAnki','openDash'];
function loadBbConfig(){
  try{
    const raw=JSON.parse(localStorage.getItem('neurocatch_bb_config')||'null');
    if(raw&&Array.isArray(raw)){
      const ids=new Set(raw.map(x=>x.id));
      BB_DEFAULT_ORDER.forEach(id=>{if(!ids.has(id))raw.push({id,visible:true});});
      return raw.filter(x=>BB_DEFAULT_ORDER.includes(x.id));
    }
  }catch(e){}
  return BB_DEFAULT_ORDER.map(id=>({id,visible:true}));
}
function saveBbConfig(cfg){localStorage.setItem('neurocatch_bb_config',JSON.stringify(cfg));touchLocal();}
function applyBbConfig(){
  const bar=$('#bottomBar');if(!bar)return;
  const cfg=loadBbConfig();
  const sep=bar.querySelector('.bb-sep');
  cfg.forEach(item=>{
    const btn=bar.querySelector('[data-bb="'+item.id+'"]');
    if(!btn)return;
    btn.hidden=!item.visible;
    if(sep)bar.insertBefore(btn,sep);
  });
}
function renderBbCustomList(){
  const box=$('#bbCustomList');if(!box)return;
  const cfg=loadBbConfig();
  box.innerHTML=cfg.map((item,i)=>{
    const meta=BB_LABELS[item.id];if(!meta)return '';
    return `<div class="bb-row" data-id="${item.id}">
      <i data-lucide="${meta[0]}"></i><span class="bb-row-label">${meta[1]}</span>
      <button class="mini bb-up" data-i="${i}" title="Выше" ${i===0?'disabled':''}><i data-lucide="arrow-up"></i></button>
      <button class="mini bb-down" data-i="${i}" title="Ниже" ${i===cfg.length-1?'disabled':''}><i data-lucide="arrow-down"></i></button>
      <button class="mini bb-vis" data-i="${i}" title="${item.visible?'Скрыть':'Показать'}"><i data-lucide="${item.visible?'eye':'eye-off'}"></i></button>
    </div>`;
  }).join('');
  lucide.createIcons();
  box.querySelectorAll('.bb-up').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;const c=loadBbConfig();if(i>0){[c[i-1],c[i]]=[c[i],c[i-1]];saveBbConfig(c);applyBbConfig();renderBbCustomList();}}));
  box.querySelectorAll('.bb-down').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;const c=loadBbConfig();if(i<c.length-1){[c[i+1],c[i]]=[c[i],c[i+1]];saveBbConfig(c);applyBbConfig();renderBbCustomList();}}));
  box.querySelectorAll('.bb-vis').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.i;const c=loadBbConfig();c[i].visible=!c[i].visible;saveBbConfig(c);applyBbConfig();renderBbCustomList();}));
}
/* ---------- minimal UI toggle ---------- */
function applyMinimal(){
  const on=localStorage.getItem('neurocatch_minimal')==='1';
  document.body.classList.toggle('minimal',on);
  const showTab=$('#uiShowTab');if(showTab)showTab.hidden=!on;
}
$('#uiToggle')&&$('#uiToggle').addEventListener('click',()=>{localStorage.setItem('neurocatch_minimal','1');applyMinimal();});
$('#uiShowTab')&&$('#uiShowTab').addEventListener('click',()=>{localStorage.setItem('neurocatch_minimal','0');applyMinimal();});
/* ---------- today's tasks button ---------- */
function todayOpenCount(){const k=dateKey(Date.now());let n=0;history.forEach(h=>{ensureEntry(h);if((h.date||dateKey(h.ts))===k)(h.tasks||[]).forEach(t=>{if(!t.done)n++;});});return n;}
function refreshTodayBtn(){const b=$('#todayCount');if(!b)return;const n=todayOpenCount();if(n>0){b.textContent=n;b.hidden=false;}else b.hidden=true;}
$('#todayTasks')&&$('#todayTasks').addEventListener('click',()=>{selTaskDate=dateKey(Date.now());taskCalCursor=new Date();taskCalMode='week';curSubTab='tasks';setSubTab('tasks');show($('#view-tasks'));});

/* ---------- share note (self-contained link + file, no auth) ---------- */
function b64e(str){return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64d(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';return decodeURIComponent(escape(atob(str)));}
function encodeNote(n){return b64e(JSON.stringify({t:n.title,b:n.body,s:n.source,g:n.tags,d:n.ts,k:n.kind}));}
function noteShareUrl(n){return location.origin+location.pathname+'#n='+encodeNote(n);}
function noteHtml(n){const body=(n.body?mdBlock(n.body):'');const tags=(n.tags||[]).map(t=>'<span class="tg">#'+esc(t)+'</span>').join(' ');const dt=new Date(n.ts||Date.now()).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.title||'Заметка')}</title>
  <style>body{margin:0;background:#0b0d18;color:#e8eaf5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;padding:24px}.wrap{max-width:680px;margin:0 auto;background:#141830;border:1px solid #2a2f52;border-radius:18px;padding:28px}h1{font-size:22px;margin:0 0 6px}.meta{color:#8b90b5;font-size:13px;margin-bottom:18px}a{color:#9b8cff}.tg{color:#9b8cff;font-size:13px;margin-right:6px}p{margin:0 0 12px}h5{margin:16px 0 6px}ul{margin:0 0 12px;padding-left:20px}.src{display:inline-block;margin:6px 0 16px;color:#9b8cff;font-size:13px;word-break:break-all}.foot{margin-top:24px;color:#6b7099;font-size:12px}</style></head>
  <body><div class="wrap"><h1>${esc(n.title||'Заметка')}</h1><div class="meta">${dt}</div>${n.source?`<a class="src" href="${esc(n.source)}">${esc(n.source)}</a>`:''}${body||'<p>'+esc(n.title||'')+'</p>'}<div>${tags}</div><div class="foot">Создано в NeuroCatch</div></div></body></html>`;}
function loadShareMap(){try{return JSON.parse(localStorage.getItem('neurocatch_shares')||'{}');}catch(e){return {};}}
function saveShareMap(m){localStorage.setItem('neurocatch_shares',JSON.stringify(m));}
async function createShareLink(note){
  const c=await sbClient();if(!c||!sbUser)throw new Error('Нужен вход в облако');
  const token=Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
  const payload={t:note.title,b:note.body,s:note.source,g:note.tags,d:note.ts,k:note.kind};
  const {error}=await c.from('shares').insert({token,data:payload,owner:sbUser.id});
  if(error)throw error;
  const map=loadShareMap();map[note.id]=token;saveShareMap(map);
  return location.origin+location.pathname+'#s='+b64e(JSON.stringify({t:token,u:settings.sbUrl,k:settings.sbKey}));
}
async function revokeShareToken(token){const c=await sbClient();if(!c)return;await c.from('shares').delete().eq('token',token);}
function noteToMarkdown(note){
  const tags=(note.tags||[]).map(t=>t.replace(/^#/,'')).filter(Boolean);
  const dt=new Date(note.ts||Date.now()).toISOString().slice(0,10);
  let fm='---\n';fm+='title: '+(note.title||'Заметка').replace(/\n/g,' ')+'\n';fm+='date: '+dt+'\n';if(note.source)fm+='source: '+note.source+'\n';if(tags.length)fm+='tags: ['+tags.join(', ')+']\n';fm+='---\n\n';
  let body='# '+(note.title||'Заметка')+'\n\n';
  if(note.source)body+='> Источник: '+note.source+'\n\n';
  body+=(note.body||'')+'\n';
  if(tags.length)body+='\n'+tags.map(t=>'#'+t).join(' ')+'\n';
  download(slug(note.title||'note')+'.md',fm+body,'text/markdown');
  toast('Экспортировано в Markdown');
}
function wrapText(ctx,text,maxW){const words=(text||'').split(/\s+/);const lines=[];let line='';for(const w of words){const test=line?line+' '+w:w;if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=w;}else line=test;}if(line)lines.push(line);return lines;}
async function noteToImage(note){
  const W=1080,H=1350,P=90;const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
  const seed=getComputedStyle(document.documentElement).getPropertyValue('--seed-rgb').trim()||'124,92,255';
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0a0b18');g.addColorStop(1,'rgba('+seed+',0.28)');ctx.fillStyle='#0b0d18';ctx.fillRect(0,0,W,H);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // accent bar
  ctx.fillStyle='rgb('+seed+')';ctx.fillRect(P,150,90,10);
  // kind label
  ctx.fillStyle='rgba('+seed+',0.95)';ctx.font='600 30px -apple-system,Segoe UI,Roboto,sans-serif';ctx.fillText(note.kind==='ins'?'ИНСАЙТ':'КОНСПЕКТ',P,130);
  // title
  ctx.fillStyle='#fff';ctx.font='800 60px -apple-system,Segoe UI,Roboto,sans-serif';
  let y=250;wrapText(ctx,note.title||'Заметка',W-P*2).slice(0,4).forEach(l=>{ctx.fillText(l,P,y);y+=72;});
  y+=20;
  // body
  ctx.fillStyle='rgba(232,234,245,0.85)';ctx.font='400 34px -apple-system,Segoe UI,Roboto,sans-serif';
  const plain=(note.body||'').replace(/[#>*_`]/g,'').replace(/\n+/g,'\n');const blines=[];plain.split('\n').forEach(par=>{wrapText(ctx,par.trim(),W-P*2).forEach(l=>blines.push(l));});
  const maxLines=Math.floor((H-y-260)/46);blines.slice(0,maxLines).forEach(l=>{ctx.fillText(l,P,y);y+=46;});
  if(blines.length>maxLines){ctx.fillStyle='rgba('+seed+',0.9)';ctx.fillText('…',P,y+6);}
  // tags
  ctx.fillStyle='rgba('+seed+',0.95)';ctx.font='600 30px -apple-system,Segoe UI,Roboto,sans-serif';
  const tg=(note.tags||[]).slice(0,6).join('  ');if(tg)ctx.fillText(tg,P,H-150);
  // footer
  ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='500 28px -apple-system,Segoe UI,Roboto,sans-serif';ctx.fillText('NeuroCatch · @dr.garipov',P,H-90);
  const blob=await new Promise(res=>cv.toBlob(res,'image/png',0.95));
  const fname=slug(note.title||'card')+'.png';
  try{const file=new File([blob],fname,{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:note.title||'Заметка'});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fname;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Карточка сохранена');
}
function openShareMenu(anchor,note){
  const ex=$('#catMenu');if(ex)ex.remove();
  const map=loadShareMap();const shared=map[note.id];
  const m=document.createElement('div');m.className='study-menu';m.id='catMenu';
  let html='<div class="sm-h">Поделиться</div>';
  if(sbUser)html+='<button data-a="short">🔗 Короткая ссылка (Supabase)</button>';
  if(sbUser&&shared)html+='<button data-a="revoke" style="color:var(--red)">Отозвать доступ</button>';
  html+='<button data-a="md">⬇ Экспорт .md (Obsidian)</button><button data-a="card">🖼 Карточка PNG</button><button data-a="self">Скопировать ссылку</button><button data-a="file">Скачать .html</button>';
  if(navigator.share)html+='<button data-a="system">📤 Поделиться через…</button>';
  m.innerHTML=html;document.body.appendChild(m);
  const r=anchor.getBoundingClientRect();m.style.top=(r.bottom+6+window.scrollY)+'px';let left=r.right-230+window.scrollX;if(left<8)left=8;m.style.left=left+'px';
  const close=()=>{m.remove();document.removeEventListener('click',out);};function out(e){if(!e.target.closest('#catMenu')&&e.target!==anchor)close();}
  m.querySelectorAll('button[data-a]').forEach(b=>b.addEventListener('click',async()=>{const a=b.dataset.a;close();
    if(a==='md'){noteToMarkdown(note);}
    else if(a==='card'){noteToImage(note);}
    else if(a==='self'){shareNote(note);}
    else if(a==='file'){shareNoteFile(note);}
    else if(a==='short'){try{toast('Создаю ссылку…');const url=await createShareLink(note);await copyText(url);}catch(e){toast('Ошибка: '+(e.message||e),true);}}
    else if(a==='system'){shareViaSystem(note.title,noteShareUrl(note));}
    else if(a==='revoke'){try{await revokeShareToken(shared);const mp=loadShareMap();delete mp[note.id];saveShareMap(mp);toast('Доступ по ссылке отозван');}catch(e){toast('Не удалось отозвать',true);}}
  }));
  setTimeout(()=>document.addEventListener('click',out),0);
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast('Скопировано в буфер');return true;}
  catch(e){showCopyFallback(text);return false;}
}
function showCopyFallback(text){
  const ex=$('#copyFallbackOverlay');if(ex)ex.remove();
  const ov=document.createElement('div');ov.className='overlay open';ov.id='copyFallbackOverlay';
  ov.innerHTML=`<div class="modal" style="max-width:420px"><div class="modal-head"><h2>Скопируй вручную</h2><button class="icon-btn" id="cfClose"><i data-lucide="x"></i></button></div><p style="color:var(--muted);margin-bottom:10px;font-size:13px">Браузер заблокировал автокопирование. Текст ниже — выдели и скопируй (Ctrl/Cmd+C).</p><textarea id="cfText" readonly style="min-height:90px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px"></textarea><button class="btn btn-primary" id="cfSelect" style="width:100%;margin-top:10px">Выделить всё</button></div>`;
  document.body.appendChild(ov);lucide.createIcons();
  const ta2=ov.querySelector('#cfText');ta2.value=text;
  ov.querySelector('#cfSelect').addEventListener('click',()=>{ta2.focus();ta2.select();try{document.execCommand('copy');toast('Скопировано');}catch(e){}});
  ov.querySelector('#cfClose').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  setTimeout(()=>{ta2.focus();ta2.select();},50);
}
async function shareViaSystem(title,url){
  if(!navigator.share){toast('Системный шаринг не поддерживается — используй копирование',true);return;}
  try{await navigator.share({title:title||'Заметка',url});}catch(e){if(e&&e.name!=='AbortError')toast('Не удалось поделиться',true);}
}
async function shareNote(n){
  const url=noteShareUrl(n);
  await copyText(url);
}
async function shareNoteFile(n){
  const html=noteHtml(n);const fname=(slug(n.title||'note'))+'.html';
  try{const file=new File([html],fname,{type:'text/html'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:n.title||'Заметка'});return;}}catch(e){if(e&&e.name==='AbortError')return;}
  download(fname,html,'text/html');toast('Файл заметки сохранён');
}
/* render shared note (read-only) if opened via #n= */
function renderSharedNote(n){
  if(!$('#sharedView')||!$('#sharedBody'))return; // страница без режима просмотра заметки
  const dt=new Date(n.d||Date.now()).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  const body=n.b?mdBlock(n.b):'';const tags=(n.g||[]).map(t=>`<span class="tag-pill">${esc(t)}</span>`).join('');
  $('#sharedBody').innerHTML=`<h1 class="shared-title">${n.k==='ins'?'💡 ':''}${esc(n.t||'Заметка')}</h1><div class="shared-meta">${dt}</div>${n.s?`<a class="note-src" href="${attr(n.s)}" target="_blank" rel="noopener">${esc(n.s)}</a>`:''}<div class="note-body">${body}</div><div class="note-tags" style="margin-top:14px">${tags}</div>`;
  $('#sharedView').hidden=false;document.querySelector('.app').style.display='none';
  lucide.createIcons();
}
async function loadSharedFromSupabase(cfg){
  if(!$('#sharedView')||!$('#sharedBody'))return;
  $('#sharedBody').innerHTML='<div class="empty">Загрузка заметки…</div>';$('#sharedView').hidden=false;const app=document.querySelector('.app');if(app)app.style.display='none';
  try{const m=await import('https://esm.sh/@supabase/supabase-js@2');const c=m.createClient(cfg.u,cfg.k);
    const {data,error}=await c.from('shares').select('data').eq('token',cfg.t).maybeSingle();
    if(error||!data){$('#sharedBody').innerHTML='<div class="empty">Ссылка недействительна или доступ отозван.</div>';return;}
    renderSharedNote(data.data);
  }catch(e){$('#sharedBody').innerHTML='<div class="empty">Не удалось загрузить заметку.</div>';}
}
function checkSharedHash(){const hs=location.hash||'';
  let m=hs.match(/[#&]s=([^&]+)/);if(m){try{loadSharedFromSupabase(JSON.parse(b64d(m[1])));return true;}catch(e){}}
  m=hs.match(/[#&]n=([^&]+)/);if(m){try{renderSharedNote(JSON.parse(b64d(m[1])));return true;}catch(e){}}
  return false;}

try{loadAll();}catch(e){console.error('loadAll failed:',e);}
try{autoArchiveOldReports();}catch(e){}
try{initNotify();}catch(e){console.error('initNotify failed:',e);}
try{startAutoSync();}catch(e){}
lucide.createIcons();
booting=false;
try{refreshTodayBtn();}catch(e){}
try{applyBg();applyMinimal();renderPresetRow();refreshQueueBadge();applyBbConfig();if($('#bottomBar'))document.body.classList.add('has-bottombar');if(navigator.onLine)setTimeout(processRitualQueue,1200);}catch(e){}
if(checkSharedHash()){/* read-only share view */}
setTimeout(()=>{const vl=$('#verLine');if(vl)vl.textContent='NeuroCatch '+SW_VER;const vm=$('#verMini');if(vm)vm.textContent=SW_VER;checkClipboard();},400);

/* ---------- E2E debug bridge ----------
   Переменные, объявленные через let на верхнем уровне классического скрипта,
   НЕ становятся свойствами window — для тестов пробрасываем их явно.
   Выносим в отдельное пространство window.__nc, чтобы НЕ затенять встроенные
   свойства окна (window.history — это History API браузера!).
   Мост включается только при ?e2e=... и невидим для обычных пользователей. */
if(/[?&]e2e=/.test(location.search)){
  window.__nc={
    get catches(){return catches;}, set catches(v){catches=v;},
    get history(){return history;}, set history(v){history=v;},
    get bookmarks(){return bookmarks;}, set bookmarks(v){bookmarks=v;},
    get habits(){return habits;}, set habits(v){habits=v;},
    get lastErrors(){return lastErrors;}, set lastErrors(v){lastErrors=v;},
    get showArchived(){return showArchived;}, set showArchived(v){showArchived=v;},
    get currentEntry(){return currentEntry;}, set currentEntry(v){currentEntry=v;},
    get noteTagFilter(){return noteTagFilter;}, set noteTagFilter(v){noteTagFilter=v;},
    get noteSearch(){return noteSearch;}, set noteSearch(v){noteSearch=v;},
    get settings(){return settings;}
  };
}
