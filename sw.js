const C='dash-v943',F=['./','index.html','proto.js','game.js','game2d.js','freeplay.js','rides.js','manifest.webmanifest','icon.png','jeu.html','style.css','sim.js','gfx.js','gfx-math.js','nature.js','world.js','real.js','real-core.js','tilemap.js','terrain.js','city.js','traffic.js','extras.js','scooter.js','settings.js','sensors.js','telemetry.js','sessionlog.js','ui.js'],FH=['fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&!x.startsWith('skkkrt3d')).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
if(FH.includes(u.host)){e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r})));return}
if(u.origin!==location.origin||u.pathname.indexOf('/.netlify/')===0)return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
