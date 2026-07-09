/* nc-parsers.js — чистые парсеры и форматтеры (без DOM и состояния приложения).
   Общая глобальная область с neurocatch.js; загружается ПЕРЕД ним.
   Покрыто тестами в tests.html. */

const URL_RE=/https?:\/\/[^\s<>"')]+/gi;
function fmtDue(d,hasTime){const dd=d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'});return hasTime?(dd+', '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})):dd;}
function fmtDueShort(ts){return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'});}
function parseDateTime(text,base){
  if(!text)return null;base=base||new Date();const t=text.toLowerCase();
  let hasTime=false,hh=9,mm=0,hasDate=false,d=new Date(base);
  const WD={'понедельник':1,'вторник':2,'сред':3,'четверг':4,'пятниц':5,'суббот':6,'воскрес':0};
  const MON=[['март',2],['мая',4],['май',4],['янв',0],['фев',1],['апр',3],['июн',5],['июл',6],['авг',7],['сен',8],['окт',9],['ноя',10],['дек',11],['ма',4]];
  let mt=t.match(/(\d{1,2}):(\d{2})(?!\d)/)||t.match(/в\s*(\d{1,2})[.:](\d{2})(?!\d)/);
  if(mt){hh=+mt[1];mm=+mt[2];hasTime=true;}
  else{let m2=t.match(/в\s*(\d{1,2})(?:\s*(утра|дня|вечера|ночи|час\w*))?/);if(m2){hh=+m2[1];mm=0;hasTime=true;const q=m2[2]||'';if(/вечера|дня/.test(q)&&hh<12)hh+=12;if(/ночи/.test(q)&&hh===12)hh=0;}}
  if(/послезавтра/.test(t)){d=new Date(base);d.setDate(d.getDate()+2);hasDate=true;}
  else if(/завтра/.test(t)){d=new Date(base);d.setDate(d.getDate()+1);hasDate=true;}
  else if(/сегодня/.test(t)){d=new Date(base);hasDate=true;}
  let mr=t.match(/через\s+(\d+)\s*(минут\w*|час\w*|недел\w*|дн\w*|день)/);
  if(mr){const n=+mr[1],u=mr[2];d=new Date(base);if(/минут/.test(u)){d.setMinutes(d.getMinutes()+n);hasTime=true;hh=d.getHours();mm=d.getMinutes();}else if(/час/.test(u)){d.setHours(d.getHours()+n);hasTime=true;hh=d.getHours();mm=d.getMinutes();}else if(/недел/.test(u)){d.setDate(d.getDate()+n*7);}else{d.setDate(d.getDate()+n);}hasDate=true;}
  if(!hasDate){for(const k in WD){if(t.includes(k)){const target=WD[k];d=new Date(base);let diff=(target-d.getDay()+7)%7;if(diff===0)diff=7;d.setDate(d.getDate()+diff);hasDate=true;break;}}}
  let md=t.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/);
  if(md){const dd=+md[1],mo=+md[2]-1;let yy=md[3]?+md[3]:base.getFullYear();if(yy<100)yy+=2000;if(mo>=0&&mo<12&&dd>=1&&dd<=31){d=new Date(yy,mo,dd);hasDate=true;}}
  if(!md){let mn=t.match(/(\d{1,2})\s+([а-я]+)/);if(mn){const dd=+mn[1],name=mn[2];let moi=-1;for(const it of MON){if(name.startsWith(it[0])){moi=it[1];break;}}if(moi>=0){d=new Date(base.getFullYear(),moi,dd);hasDate=true;}}}
  if(!hasDate&&!hasTime)return null;
  if(hasTime)d.setHours(hh,mm,0,0);else d.setHours(9,0,0,0);
  if(hasTime&&!hasDate&&d.getTime()<base.getTime()-60000){d.setDate(d.getDate()+1);}
  return {ts:d.getTime(),hasTime,label:fmtDue(d,hasTime)};
}
function parseMd(md){md=md||'';const d={insights:[],summaries:[],tasks:[],tags:[],links:[],bookmarks:[]};let sec=null,cur=null;
  const addLink=(url,title)=>{if(!url)return;url=url.replace(/[),.]+$/,'');const ex=d.links.find(l=>l.url===url);if(ex){if(title&&!ex.title)ex.title=title;}else d.links.push({url,title:title||''});};
  md.split('\n').forEach(raw=>{const line=raw.replace(/\s+$/,'');const t=line.trim();
    if(/^##\s/.test(t)){ // section heading (## ...)
      if(/инсайт/i.test(t))sec='ins';else if(/конспект/i.test(t))sec='sum';else if(/закладк/i.test(t))sec='bm';else if(/задач/i.test(t))sec='task';else if(/ссылк/i.test(t))sec='link';else if(/тег/i.test(t))sec='tag';else sec=null;cur=null;return;}
    if(sec==='sum'){ // конспекты — многострочные блоки, разбитые по ### Заголовок
      if(/^###\s+/.test(t)){cur={title:t.replace(/^###\s+/,''),body:'',source:''};d.summaries.push(cur);return;}
      if(cur&&!cur.body&&(t.startsWith('🔗')||/^https?:\/\/\S+$/.test(t))){const um=t.match(URL_RE);if(um){cur.source=um[0].replace(/[),.]+$/,'');addLink(cur.source,cur.title);return;}}
      if(!cur){cur={title:'',body:'',source:''};d.summaries.push(cur);}
      cur.body+=(cur.body?'\n':'')+line;return;}
    if(sec==='bm'){if(!t||/^_/.test(t))return;const bm=t.replace(/^[-*]\s*/,'');const lm=bm.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);let url='',title='';if(lm){title=lm[1];url=lm[2];}else{const um=bm.match(URL_RE);if(um)url=um[0];}if(!url)return;url=url.replace(/[),.]+$/,'');const parts=bm.split('|').map(x=>x.trim());let cat=parts[1]||'Прочее',desc=parts.length>=3?parts.slice(2).join(' | '):'';d.bookmarks.push({url,title:title||'',category:cat,desc:desc});return;}
    if(sec==='link'){const lm=t.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);if(lm)addLink(lm[2],lm[1]);else (t.match(URL_RE)||[]).forEach(u=>addLink(u,''));return;}
    if(!t)return;
    if(sec==='tag'||/^#[^\s#]/.test(t)){(t.match(/#[\wа-яёА-ЯЁ-]+/g)||[]).forEach(x=>{if(!d.tags.includes(x))d.tags.push(x);});return;}
    const m=t.replace(/^[-*]\s*/,'');
    if(sec==='ins')d.insights.push(m);
    else if(sec==='task')d.tasks.push(m.replace(/^\[[ xX]?\]\s*/,''));});
  d.summaries.forEach(s=>s.body=s.body.trim());
  d.summaries=d.summaries.filter(s=>s.title||s.body);
  return d;}
function serializeMd(d){ // обратное к parseMd — собирает markdown из распарсенной структуры (после ручных удалений в черновике)
  const hostOf2=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return u;}};
  let out='## 🧠 Инсайты\n';
  out+=(d.insights.length?d.insights.map(x=>'- '+x).join('\n'):'- Ничего заметного.')+'\n\n';
  out+='## 📚 Конспекты\n';
  out+=d.summaries.length?d.summaries.map(s=>'### '+(s.title||'')+'\n'+(s.source?('🔗 '+s.source+'\n'):'')+(s.body||'')).join('\n\n')+'\n\n':'Конспектировать нечего.\n\n';
  out+='## 🔗 Ссылки\n';
  out+=(d.links.length?d.links.map(l=>'- ['+(l.title||hostOf2(l.url))+']('+l.url+')').join('\n'):'')+'\n\n';
  out+='## 🔖 Закладки\n';
  out+=(d.bookmarks.length?d.bookmarks.map(b=>'- ['+(b.title||hostOf2(b.url))+']('+b.url+') | '+(b.category||'Прочее')+(b.desc?(' | '+b.desc):'')).join('\n'):'')+'\n\n';
  out+='## ✅ Задачи\n';
  out+=(d.tasks.length?d.tasks.map(t=>'- [ ] '+t).join('\n'):'')+'\n\n';
  out+='## 🏷 Теги\n';
  out+=(d.tags||[]).join(' ')+'\n';
  return out;}
