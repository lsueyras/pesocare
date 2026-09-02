const CACHE='bodycare-v18';
const CORE=['./','./index.html','./styles.css?v=18-bodycare','./app.js?v=18-bodycare','./manifest.webmanifest','./icon.svg','./brand-logo.png','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>Promise.all(
      CORE.map(url=>cache.add(url).catch(()=>null))
    ))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    ])
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;

  const url=new URL(event.request.url);
  const isAppShell=
    url.origin===self.location.origin &&
    (
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/app.js') ||
      url.pathname.endsWith('/styles.css')
    );

  if(isAppShell){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      });
    })
  );
});


self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{
    data={title:'BodyCare',body:event.data?.text()||'Tienes una nueva actualización.'};
  }

  const title=data.title||'BodyCare';
  const options={
    body:data.body||'Tienes una nueva actualización en BodyCare.',
    icon:data.icon||'./icon-192.png',
    badge:data.badge||'./icon-192.png',
    tag:data.notification_id?`bodycare-${data.notification_id}`:'bodycare-update',
    renotify:true,
    data:{
      url:data.url||'./',
      notification_id:data.notification_id||null,
      type:data.type||null
    }
  };

  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'./';

  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});

    for(const client of windows){
      try{
        const current=new URL(client.url);
        const destination=new URL(target,self.location.origin);
        if(current.origin===destination.origin){
          if('navigate' in client)await client.navigate(destination.href);
          return client.focus();
        }
      }catch{}
    }

    if(clients.openWindow)return clients.openWindow(target);
  })());
});
