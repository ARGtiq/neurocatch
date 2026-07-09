const CACHE='neurocatch-v36';
const ASSETS=['./','./neurocatch.html','./neurocatch.css','./nc-parsers.js','./neurocatch.js','./manifest.webmanifest','./tasks.html','./tasks.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.origin!==location.origin){return;} // API и внешние запросы — напрямую
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
      const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;
    }).catch(()=>caches.match('./neurocatch.html')))
  );
});

self.addEventListener('push',e=>{
  let data={title:'NeuroCatch',body:'У тебя новое напоминание.'};
  try{if(e.data)data=Object.assign(data,e.data.json());}catch(err){}
  const opt={body:data.body,icon:'icon.svg',badge:'icon.svg',tag:data.tag||'neurocatch'};
  e.waitUntil(self.registration.showNotification(data.title,opt));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list=>{
    for(const c of list){if('focus' in c)return c.focus();}
    if(clients.openWindow)return clients.openWindow('./neurocatch.html');
  }));
});
