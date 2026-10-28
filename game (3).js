// SKKKRT Arcade — jeu GPS + Bluetooth pour Dash (utilise S, cfg, F, sv, theme… de index.html)
(function(){
const $=s=>document.querySelector(s),R2=Math.PI/180;
const G=J('game',{sc:0,best:0,done:{}}),st=Object.assign({bg:'col',col:null,mo:100,z:18,hs:1,hc:'#ffa31a',mm:1,dk:null,sim:0,sv:25,na:1,rm:0},J('gset',{}));G.h=G.h||[];
const MS=[['Échauffement','Facile',{f:0,c:10,r:2,d:250}],['Premiers drapeaux','Facile',{f:3,c:8,r:1,d:400}],['Slalom d\'anneaux','Moyen',{f:2,c:10,r:6,d:700,t:480}],['Course aux drapeaux','Moyen',{f:5,c:15,r:3,d:1200,t:420}],['Anneaux rapides','Difficile',{f:3,c:10,r:6,d:1500,t:420,v:20}],['Marathon','Difficile',{f:8,c:25,r:5,d:3000,t:900}],['Maître SKKKRT','Expert',{f:10,c:40,r:10,d:5000,t:1200,v:25}]];
const sset=()=>W('gset',st),dk=()=>st.dk==null?document.documentElement.dataset.t==='d':st.dk;
let rot=0,t0=0,endRes='',on=0,me=null,hd=0,gp=null,wid=null,run=null,its=[],nx=0,sc=0,nc=0,nr=0,nf=0,cb=1,cbT=0,tl=0,lt=0,ht=0,tr=[],dist=0,mt=0,mi=-1,init=0,saved=0,ac;
const off=(p,d,b)=>[p[0]+d*Math.cos(b)/111320,p[1]+d*Math.sin(b)/(111320*Math.cos(p[0]*R2))];
const dm=(a,b)=>Math.hypot((b[0]-a[0])*111320,(b[1]-a[1])*111320*Math.cos(a[0]*R2)),brg=(a,b)=>Math.atan2((b[1]-a[1])*Math.cos(a[0]*R2),b[0]-a[0]);
const wp=(la,lo,z)=>{const n=256*2**z,r=la*R2;return[(lo+180)/360*n,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n]};
const beep=f=>{try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;o.type='square';g.gain.value=.05;o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.09)}catch(e){}};
const rgb=c=>c[0]=='#'?[1,3,5].map(i=>parseInt(c.substr(i,2),16)):c.match(/\d+/g).map(Number);

// ---------- Interface ----------
const css=document.createElement('style');css.textContent=`
#gm{position:fixed;inset:0;z-index:200;background:var(--bg);color:var(--gf,#fff);font-family:var(--ff);overflow:hidden;touch-action:none;--hs:1}
#gm[hidden]{display:none}#gm canvas,#gm video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#gm #gmm{inset:auto;left:8px;bottom:8px;width:min(38vw,230px);height:min(28vw,170px);border:1px solid var(--gf);border-radius:6px;background:#888}
#gmap.dk{filter:invert(1) hue-rotate(180deg) brightness(.85)}
#gtb{position:absolute;top:0;left:0;right:0;height:60px;background:linear-gradient(var(--gs),transparent);opacity:.55;pointer-events:none}
#gm .t{position:absolute;display:flex;flex-wrap:wrap;gap:calc(4px*var(--hs)) calc(10px*var(--hs));font-size:calc(10px*var(--hs));line-height:1.25;text-shadow:0 0 3px var(--gs),0 0 6px var(--gs);pointer-events:none;z-index:5}
#gm .t span{display:flex;flex-direction:column}#gm .t i{font-style:normal;opacity:.7;font-size:.82em}#gm .t b{font-weight:600}
#htl{top:calc(env(safe-area-inset-top) + 10px);left:56px;max-width:45vw}#htr{top:calc(env(safe-area-inset-top) + 8px);right:8px;max-width:48vw;justify-content:flex-end;align-items:center}
#hl{left:8px;top:calc(env(safe-area-inset-top) + 64px);flex-direction:column;flex-wrap:nowrap}
#hbr{right:8px;bottom:8px;max-width:calc(100vw - min(38vw,230px) - 150px);justify-content:flex-end}
#hsp{left:calc(min(38vw,230px) + 18px);bottom:8px;flex-direction:column;flex-wrap:nowrap}
#hsp .sp{font-size:calc(34px*var(--hs));font-weight:600;line-height:1}#hsp .gd{color:var(--hc);border-bottom:1px solid var(--hc);font-size:calc(12px*var(--hs));padding-bottom:2px}
#gmsg{position:absolute;top:calc(env(safe-area-inset-top) + 56px);left:50%;transform:translateX(-50%);color:var(--hc);font-weight:600;font-size:calc(15px*var(--hs));text-shadow:0 0 4px var(--gs);white-space:nowrap;z-index:6;pointer-events:none}
#gm button{background:rgba(0,0,0,.5);color:#fff;border:1px solid #fff6;border-radius:50%;width:42px;height:42px;padding:0;z-index:7}
#gm #gq{position:absolute;left:8px;top:calc(env(safe-area-inset-top) + 8px)}#grb{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:7}
#gs,#gres{position:absolute;z-index:9;top:50%;left:50%;transform:translate(-50%,-50%);width:min(92vw,420px);max-height:82vh;overflow:auto;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:14px;padding:14px;touch-action:pan-y}
#gs[hidden],#gres[hidden]{display:none}#gs p{margin:10px 0 4px;font-size:.87em;color:var(--mut)}#gs .gr{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#gm #gs button,#gm #gres button{width:auto;height:auto;border-radius:10px;padding:8px 10px;background:var(--card);color:var(--fg);border:1px solid var(--line)}#gm #gs button.on{background:var(--ac);color:var(--bg)}
@media(orientation:portrait){#hbr{left:8px;right:auto;bottom:calc(min(28vw,170px) + 18px);max-width:calc(100vw - 16px);justify-content:flex-start}}`;
document.head.appendChild(css);
const gm=document.createElement('div');gm.id='gm';gm.hidden=true;
gm.innerHTML=`<video id="gv" playsinline muted autoplay></video><canvas id="gmap"></canvas><canvas id="gg"></canvas><canvas id="gmm"></canvas><div id="gtb"></div>
<button id="gq">✕</button><div class="t" id="htl"></div><div class="t" id="htr"></div><div class="t" id="hl"></div><div class="t" id="hbr"></div><div class="t" id="hsp"></div><div id="gmsg"></div>
<div id="grb"><button data-a="s">⚙</button><button data-a="c">◎</button><button data-a="b">BT</button><button data-a="r">🧭</button></div>
<div id="gs" hidden><b>Réglages du jeu</b><p>Fond</p><div class="gr"><button data-v="#000000">Noir</button><button data-v="#ffffff">Blanc</button><button data-v="theme">Thème clair/sombre</button><button data-v="cam">Caméra</button><input type="color" id="gcol" value="#336699"></div>
<p>Opacité de la carte (100 % = opaque, 0 = cachée)</p><input class="rg" type="range" id="gmo" min="0" max="100"><div class="gr" style="margin-top:8px"><button id="gdk"></button><button id="gmm2"></button><button id="gsm"></button><button id="gna"></button></div>
<p>Vitesse simulée (km/h) — touche la carte pour tourner</p><input class="rg" type="range" id="gsv" min="0" max="50">
<p>Police</p><div class="gr" id="gfn">${Object.entries(F).map(([k,v])=>`<button data-f="${k}" style="font-family:${v[1]};${k=='ita'?'font-style:italic':''}">${v[0]}</button>`).join('')}</div>
<p>Taille du texte autour de l'écran</p><input class="rg" type="range" id="ghs" min="70" max="150"><p>Couleur de l'interface du jeu</p><div class="gr"><input type="color" id="ghc"></div>
<div class="gr" style="margin-top:12px"><button data-x="1">Fermer</button></div></div><div id="gres" hidden></div>`;
document.body.appendChild(gm);

function apply(){
  const c=rgb(st.col||getComputedStyle(document.body).backgroundColor),cam=st.bg==='cam',lt=!cam&&(.299*c[0]+.587*c[1]+.114*c[2])/255>.55;
  gm.style.background=cam?'#000':st.col||'';gm.style.setProperty('--gf',lt?'#000':'#fff');gm.style.setProperty('--gs',lt?'#fff':'#000');gm.style.setProperty('--hs',st.hs);gm.style.setProperty('--hc',st.hc);
  const v=$('#gv');v.style.display=cam?'block':'none';cam?!v.srcObject&&camOn():camOff();
  $('#gmo').value=st.mo;$('#ghs').value=st.hs*100;$('#gsv').value=st.sv;$('#ghc').value=st.hc;
  $('#gdk').textContent='Carte '+(dk()?'sombre':'claire');$('#gmm2').textContent='Mini-carte : '+(st.mm?'oui':'non');$('#gsm').textContent='Simulation : '+(st.sim?'ON':'off');$('#gna').textContent='Pointillés d\'adresses : '+(st.na?'masqués':'visibles');
  document.querySelectorAll('#gfn button').forEach(b=>b.classList.toggle('on',b.dataset.f===(cfg.f||'sys')));
}
async function camOn(){try{const v=$('#gv');v.srcObject=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});v.play()}catch(e){msg('Caméra : '+e.message);st.bg='col';sset();apply()}}
function camOff(){const v=$('#gv');if(v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}
const gs=$('#gs');
gs.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.x)gs.hidden=true;else if(d.v==='theme'){$('#th').click();st.col=null;if(st.bg==='cam')st.bg='col'}else if(d.v==='cam')st.bg='cam';else if(d.v){st.bg='col';st.col=d.v}
  else if(d.f){cfg.f=d.f;sv()}else if(b.id==='gdk')st.dk=!dk();else if(b.id==='gmm2')st.mm=+!st.mm;else if(b.id==='gsm')st.sim=+!st.sim;else if(b.id==='gna'){st.na=+!st.na;T.clear()}
  sset();apply()};
gs.oninput=e=>{const t=e.target,k={gmo:'mo',gsv:'sv',ghs:'hs',ghc:'hc',gcol:'col'}[t.id];if(!k)return;st[k]=k==='hs'?t.value/100:k==='col'||k==='hc'?t.value:+t.value;if(k==='col')st.bg='col';sset();apply()};
$('#grb').onclick=e=>{const a=e.target.dataset.a;if(a==='s')gs.hidden=!gs.hidden;else if(a==='c')pan=[0,0];else if(a==='b')$('#cn').click();else if(a==='r'){st.rm=+!st.rm;if(!st.rm)rot=0;msg(st.rm?'Carte : ta direction en haut':'Carte : nord en haut')}sset()};
$('#gq').onclick=close;
let pan=[0,0],g0=null;const ptr=new Map(),gg=$('#gg'),zc=z=>Math.max(14,Math.min(20,z));
gg.onpointerdown=e=>{try{gg.setPointerCapture(e.pointerId)}catch(x){}ptr.set(e.pointerId,[e.clientX,e.clientY]);g0={t:Date.now(),mv:0}};
gg.onpointermove=e=>{const o=ptr.get(e.pointerId);if(!o)return;const n=[e.clientX,e.clientY],k=2**(st.z-18),cs=Math.cos(rot),sn=Math.sin(rot);g0.mv+=Math.hypot(n[0]-o[0],n[1]-o[1]);
  const mp=(dx,dy)=>[dx*cs+dy*sn,-dx*sn+dy*cs];   // déplacement écran -> déplacement sur la carte (tient compte de la rotation)
  if(ptr.size>=2){const q=[...ptr].find(a=>a[0]!==e.pointerId)[1],d0=Math.hypot(o[0]-q[0],o[1]-q[1]),d1=Math.hypot(n[0]-q[0],n[1]-q[1]);if(d0>10&&d1>10)st.z=zc(st.z+Math.log2(d1/d0));
    const a0=Math.atan2(o[1]-q[1],o[0]-q[0]),a1=Math.atan2(n[1]-q[1],n[0]-q[0]);let da=a1-a0;da=Math.atan2(Math.sin(da),Math.cos(da));if(d0>10&&d1>10&&Math.abs(da)<1){rot+=da;if(st.rm){st.rm=0;sset()}}   // deux doigts : tourner la carte
    const m=mp(n[0]-o[0],n[1]-o[1]);pan[0]-=m[0]/2/k;pan[1]-=m[1]/2/k}
  else{const m=mp(n[0]-o[0],n[1]-o[1]);pan[0]-=m[0]/k;pan[1]-=m[1]/k}ptr.set(e.pointerId,n)};
gg.onpointerup=gg.onpointercancel=e=>{if(ptr.size===1&&st.sim&&g0&&g0.mv<8&&Date.now()-g0.t<350)hd=Math.atan2(e.clientX-innerWidth/2,-(e.clientY-innerHeight/2))-rot;ptr.delete(e.pointerId);if(!ptr.size)sset()};
gg.onwheel=e=>{st.z=zc(st.z-e.deltaY/300)};

// ---------- Carte ----------
function clean(img){ // efface les pointillés gris d'adresses (interpolation) et numéros de maisons de la tuile, le reste est identique
  const w=img.naturalWidth,h=img.naturalHeight;if(!st.na||w<64||h<64)return null;
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(img,0,0);
  const id=g.getImageData(0,0,w,h),d=id.data,N=w*h,L=new Float32Array(N),m=new Uint8Array(N);
  for(let p=0,o=0;p<N;p++,o+=4){const r=d[o],gg=d[o+1],b=d[o+2];L[p]=(r+gg+b)/3;if(Math.max(r,gg,b)-Math.min(r,gg,b)<14&&L[p]>=86&&L[p]<=172)m[p]=1}
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(!m[p])continue; // garde les pixels proches d'un trait sombre (texte, murs…)
    if(L[p-1]<78||L[p+1]<78||L[p-w]<78||L[p+w]<78||L[p-w-1]<78||L[p-w+1]<78||L[p+w-1]<78||L[p+w+1]<78)m[p]=2}
  const k=new Uint8Array(N);let n=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(m[p]!==1)continue;n++;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)k[p+j*w+i]=1}
  if(!n)return null;
  const out=new Uint8ClampedArray(d);
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const p=y*w+x;if(!k[p])continue;let r=0,gg=0,b=0,q=0;
    for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const u=p+j*w+i;if(!k[u]){const o=u*4;r+=d[o];gg+=d[o+1];b+=d[o+2];q++}}
    if(q){const o=p*4;out[o]=r/q;out[o+1]=gg/q;out[o+2]=b/q}}
  id.data.set(out);g.putImageData(id,0,0);return c}
const T=new Map();
function tile(z,x,y){const k=z+'/'+x+'/'+y;let i=T.get(k);if(!i){i=new Image();i.crossOrigin='anonymous';const u=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  i.onload=()=>{try{i.c=clean(i)}catch(e){}};
  i.onerror=()=>{if(i.crossOrigin){i.removeAttribute('crossorigin');i.crossOrigin=null;i.src=u}};
  i.src=u;T.set(k,i);if(T.size>300)T.delete(T.keys().next().value)}return i}
function fit(c,w,h){const d=devicePixelRatio||1,g=c.getContext('2d');if(c.width!==Math.round(w*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}g.setTransform(d,0,0,d,0,0);return g}
function vw(z,m){const zi=Math.min(19,Math.round(z)),k=2**(zi-18),[cx,cy]=wp(me[0],me[1],zi);return{zi,sc:m?2**(z-zi):1,cx:cx+(m?pan[0]*k:0),cy:cy+(m?pan[1]*k:0)}}
function dmap(c,w,h,z,m){const g=fit(c,w,h);g.clearRect(0,0,w,h);if(!me)return;const{zi,sc,cx,cy}=vw(z,m),n=2**zi,A=Math.hypot(w,h)/sc/2,B=A;g.translate(w/2,h/2);g.rotate(rot);g.scale(sc,sc);
  for(let x=Math.floor((cx-A)/256);x<=Math.floor((cx+A)/256);x++)for(let y=Math.floor((cy-B)/256);y<=Math.floor((cy+B)/256);y++){if(y<0||y>=n)continue;const i=tile(zi,((x%n)+n)%n,y);if(i.complete&&i.naturalWidth)g.drawImage(i.c||i,Math.round(x*256-cx),Math.round(y*256-cy),256,256)}}
function dg(c,w,h,z0,sm,cl,m){
  const g=fit(c,w,h);if(cl)g.clearRect(0,0,w,h);if(!me)return;
  const{zi:z,sc,cx,cy}=vw(z0,m),ex=Math.hypot(w,h)/sc,ey=ex,pm=2**z/(156543.03*Math.cos(me[0]*R2)),u=sm?.7:1,T=Date.now(),xy=p=>{const q=wp(p[0],p[1],z);return[q[0]-cx+w/2,q[1]-cy+h/2]};g.translate(w/2,h/2);g.rotate(rot);g.scale(sc,sc);g.translate(-w/2,-h/2);
  g.lineWidth=2*u;g.strokeStyle=st.hc;g.globalAlpha=.5;g.beginPath();tr.forEach((p,i)=>{const[x,y]=xy(p);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();g.globalAlpha=1;
  if(PH){g.lineWidth=Math.max(4,5*u);g.lineJoin='round';g.globalAlpha=.28;g.beginPath();PH.forEach((p,i)=>{const[x,y]=xy(p);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();g.globalAlpha=1}
  for(const i of its){if(i.ok)continue;const[x,y]=xy(i.p);if(x<-ex-40||y<-ey-40||x>w+ex+40||y>h+ey+40)continue;const s=Math.max(7,15*pm)*u;
    if(i.t==='c'){g.fillStyle='#ffc400';g.strokeStyle='#a87800';g.lineWidth=2;g.beginPath();g.arc(x,y,s*.6,0,7);g.fill();g.stroke();g.fillStyle='rgba(255,255,255,.6)';g.beginPath();g.arc(x-s*.15,y-s*.15,s*.22,0,7);g.fill()}
    else if(i.t==='r'){g.strokeStyle=i.v?'#ff2d95':'#19d3ff';g.lineWidth=Math.max(3,s*.28);g.beginPath();g.arc(x,y,s*.85+Math.sin(T/200)*1.5,0,7);g.stroke()}
    else{const a=i.n===nx;g.globalAlpha=a?1:.45;g.strokeStyle=g.fillStyle=a?st.hc:'#888';g.lineWidth=2;g.beginPath();g.moveTo(x,y);g.lineTo(x,y-s*1.8);g.stroke();g.beginPath();g.moveTo(x,y-s*1.8);g.lineTo(x+s*1.1,y-s*1.35);g.lineTo(x,y-s*.9);g.fill();g.fillStyle='#fff';g.font=`bold ${Math.round(s*.6)}px sans-serif`;g.fillText(i.n+1,x-s*.15,y+s*.9);g.globalAlpha=1}}
  g.save();const pp=xy(me);g.translate(pp[0],pp[1]);g.rotate(hd);g.fillStyle=st.hc;g.strokeStyle='#fff';g.lineWidth=2;g.shadowColor=st.hc;g.shadowBlur=12;g.beginPath();g.moveTo(0,-12*u);g.lineTo(8*u,10*u);g.lineTo(0,5*u);g.lineTo(-8*u,10*u);g.closePath();g.fill();g.stroke();g.restore();
}
function draw(){if(st.rm){let d=-hd-rot;d=Math.atan2(Math.sin(d),Math.cos(d));rot+=d*.2}const w=innerWidth,h=innerHeight,m=$('#gmap');m.style.opacity=st.mo/100;m.className=dk()?'dk':'';dmap(m,w,h,st.z,1);dg(gg,w,h,st.z,0,1,1);
  const mm=$('#gmm'),sh=st.mm&&st.mo<60;mm.style.display=sh?'block':'none';if(sh){const a=mm.clientWidth,b=mm.clientHeight,z=Math.max(14,Math.round(st.z)-2);dmap(mm,a,b,z,0);dg(mm,a,b,z,1,0,0)}}

// ---------- Jeu ----------
const spd=()=>typeof S!=='undefined'&&S?Math.min(50,S.speed):st.sim?st.sv:(gp&&gp.sp>0?gp.sp*3.6:0);
function msg(t,k){const m=$('#gmsg');m.textContent=t;clearTimeout(mt);if(!k)mt=setTimeout(()=>m.textContent='',1800)}
let GR=null,ld=0,sid=0,pf=0;
function build(ws,c,r){const n=new Map(),k=p=>p[0].toFixed(6)+','+p[1].toFixed(6);
  for(const g of ws)for(let i=0;i<g.length;i++){const p=g[i],a=k(p);if(!n.has(a))n.set(a,{p,a:[]});if(i){const b=k(g[i-1]);n.get(a).a.push(b);n.get(b).a.push(a)}}
  if(n.size<2)return false;GR={n,c,r,k:[...n.keys()]};return true}
let LE='',PH=null,FP=0,fr=0;const FM={f:0,c:14,r:3};
function race(U,ok,ms){return new Promise(res=>{const ctl=window.AbortController?new AbortController():null,er=[];let n=U.length,done=0,t;
  const fin=v=>{if(!done){done=1;clearTimeout(t);ctl&&ctl.abort();res(v)}};t=setTimeout(()=>{LE='délai dépassé';fin(null)},ms);
  U.forEach(u=>fetch(u,{signal:ctl?ctl.signal:undefined}).then(x=>{if(!x.ok)throw new Error('HTTP '+x.status);return x.json()}).then(j=>{if(!ok(j))throw new Error('réponse vide');fin(j)}).catch(e=>{er.push(e.message);if(!--n&&!done){LE=er[0];lg('Routes : '+er.join(' | '));fin(null)}}))})}
const fetchRoads=q=>race(['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.openstreetmap.fr/api/interpreter'].map(u=>u+'?data='+encodeURIComponent(q)),j=>j.elements&&j.elements.length,14000);
async function osrm(d,K){let p=me,b=Math.random()*6.283;const w=[me],L=d/K*.75;for(let k=0;k<K;k++){b+=(Math.random()-.5)*1.4;p=off(p,L,b);w.push(p)}
  const qs='/route/v1/driving/'+w.map(q=>q[1].toFixed(5)+','+q[0].toFixed(5)).join(';')+'?overview=full&geometries=geojson',ok=j=>j.routes&&j.routes[0];
  const j=await race(['https://routing.openstreetmap.de/routed-bike'+qs],ok,7000)||await race(['https://router.project-osrm.org'+qs],ok,7000);
  return j?j.routes[0].geometry.coordinates.map(q=>[q[1],q[0]]):null}
async function roads(c,rd){
  try{const z=J('rdc',null);if(z&&z.r-dm(c,z.c)>=rd*.8&&build(z.w,z.c,z.r))return true}catch(e){}
  const j=await fetchRoads(`[out:json][timeout:25];way(around:${rd},${c[0]},${c[1]})["highway"~"^(residential|tertiary|secondary|primary|unclassified|living_street|cycleway|tertiary_link|secondary_link|primary_link)$"]["access"!~"private|no"];out skel geom;`);
  if(!j)return false;const ws=j.elements.filter(w=>w.geometry).map(w=>w.geometry.map(g=>[+g.lat.toFixed(6),+g.lon.toFixed(6)]));
  if(!build(ws,c,rd))return false;W('rdc',{c,r:rd,w:ws});return true}
function near(){let b,d=1e9;for(const[k,v]of GR.n){const x=dm(me,v.p);if(x<d){d=x;b=k}}return b}
function walk(d){let cur=near(),prev=null,len=0,n=0;const seen=new Set([cur]),P=[GR.n.get(cur).p];
  while(len<d&&n++<20000){const nd=GR.n.get(cur);let o=nd.a.filter(x=>!seen.has(x));if(!o.length)o=nd.a.filter(x=>x!==prev);if(!o.length)o=nd.a;if(!o.length)break;
    const q=o[Math.random()*o.length|0],p=GR.n.get(q).p;len+=dm(nd.p,p);P.push(p);prev=cur;cur=q;seen.add(q)}
  return P}
function gen(i,P){place(MS[i][2],P||walk(MS[i][2].d))}
function place(m,P){const C=[0];its=[];PH=P;for(let j=1;j<P.length;j++)C.push(C[j-1]+dm(P[j-1],P[j]));const T=C[C.length-1];if(P.length<2||T<80)return;
  const at=f=>{const s=f*T;let j=1;while(j<C.length-1&&C[j]<s)j++;const u=Math.min(1,(s-C[j-1])/((C[j]-C[j-1])||1)),a=P[j-1],b=P[j];return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]};
  for(let k=0;k<m.f;k++)its.push({t:'f',p:at((k+1)/m.f),n:k});
  for(let k=0;k<m.c;k++)its.push({t:'c',p:at((k+.5)/m.c)});
  for(let k=0;k<m.r;k++)its.push({t:'r',p:at(Math.min(.99,(k+.5)/m.r+.02)),v:m.v&&k%2?m.v:0})}
function free(){its=its.filter(i=>!i.ok&&dm(me,i.p)<2000);
  if(FP){if(its.length<5&&!fr){fr=1;osrm(1500,4).then(P=>{fr=0;if(P&&on){const o=its;place(FM,P);its=its.concat(o)}})}return}
  if(!GR)return;
  if(dm(me,GR.c)>500&&!GR.busy){GR.busy=1;const g=GR;roads(me,900).then(ok=>{if(!ok)g.busy=0})}
  for(let t=0;its.length<14&&t<40;t++){const p=GR.n.get(GR.k[Math.random()*GR.k.length|0]).p,d=dm(me,p);if(d>60&&d<400)its.push({t:Math.random()<.8?'c':'r',p})}}
function save(){if(saved)return;saved=1;G.sc+=sc;G.best=Math.max(G.best,sc);
  if(t0){G.h.unshift({d:Date.now(),m:mi>=0?MS[mi][0]:'Mode libre',r:endRes||(mi<0?'Libre':'Interrompue'),sc,t:Math.round((Date.now()-t0)/1000),nc,nr,nf,km:dist/1000});G.h.length=Math.min(G.h.length,100)}
  W('game',G)}
function fin(w){run.end=1;endRes=w?'Réussie':'Temps écoulé';let b=0;if(w){b=Math.round(500*(mi+1)+Math.max(0,tl)*2);sc+=b;G.done[mi]=Math.max(G.done[mi]||0,sc)}save();
  $('#gres').innerHTML=`<b>${w?'Mission réussie !':'Temps écoulé'}</b><p>${MS[mi][0]}<br>Score : <b>${sc}</b>${b?' (bonus '+b+')':''}<br>Pièces ${nc} · Anneaux ${nr} · Drapeaux ${nf}</p><button id="gok">OK</button>`;$('#gres').hidden=false;$('#gok').onclick=close}
async function boot(){const id=sid,m=mi>=0?MS[mi][2]:null;msg('Chargement des routes…',1);
  const P=await osrm(m?m.d:1500,m?m.f||4:4);if(id!==sid)return;
  if(P){if(m){run={t:m.t||0};tl=run.t;gen(mi,P)}else{FP=1;place(FM,P)}}
  else{const need=m?Math.min(1200,350+m.d*.25):900,ok=GR&&GR.r-dm(me,GR.c)>=need*.8?1:await roads(me,Math.max(need,700));if(id!==sid)return;if(ok){if(m){run={t:m.t||0};tl=run.t;gen(mi)}}}
  if(mi<0||its.length){init=1;ld=0;t0=Date.now();msg('Routes prêtes ✓');return}
  msg('Routes indisponibles : '+LE);setTimeout(()=>{if(id===sid)ld=0},3000)}
function tick(dt){
  if(!me)return;
  if(!init){if(!ld){ld=1;boot()}return}
  const v=spd()/3.6,now=Date.now();if((st.sim||gp)&&v>.3)me=off(me,v*dt,hd);
  const l=tr[tr.length-1];if(!l||dm(l,me)>4){tr.push(me);if(tr.length>400)tr.shift();if(l)dist+=dm(l,me)}
  const rr=Math.max(16,Math.min(35,(gp&&gp.acc)||0));
  for(const i of its){if(i.ok||dm(me,i.p)>rr||(i.t==='f'&&i.n!==nx))continue;
    if(i.t==='r'&&i.v&&spd()<i.v){msg('Trop lent ! Il faut ≥ '+i.v+' km/h');continue}
    i.ok=1;cb=now-cbT<8000?Math.min(5,cb+.5):1;cbT=now;const g=Math.round({c:10,r:50,f:200}[i.t]*(i.v?2:1)*cb);sc+=g;
    if(i.t==='c')nc++;else if(i.t==='r')nr++;else{nf++;nx++}
    msg('+'+g+' '+{c:'pièce',r:'anneau',f:'drapeau '+(i.n+1)}[i.t]+(cb>1?' ×'+cb:''));beep(i.t==='c'?880:i.t==='r'?660:520);navigator.vibrate&&navigator.vibrate(i.t==='f'?[60,40,60]:25)}
  if(now-cbT>8000)cb=1;
  if(run&&!run.end){const fl=its.filter(i=>i.t==='f');if(fl.length?nx>=fl.length:its.every(i=>i.ok))fin(1);else if(run.t&&(tl-=dt)<=0)fin(0)}
  if(mi<0)free();
}
function fix(p){const c=p.coords;gp={acc:c.accuracy,sp:c.speed,alt:c.altitude};if(c.heading!=null&&!isNaN(c.heading)&&c.speed>1)hd=c.heading*R2;if(!(st.sim&&me))me=[c.latitude,c.longitude]}

function hud(){
  const s=typeof S!=='undefined'?S:null,k=s&&s.mph?1.6:1,u=s&&s.mph?'mph':'km/h',ku=k>1?'mi':'km',bt=typeof dev!=='undefined'&&dev&&dev.gatt.connected,c=(l,v)=>`<span><i>${l}</i><b>${v}</b></span>`,f1=x=>(x/k).toFixed(1),oo=x=>s?x:'—';
  $('#htl').innerHTML=c('Mode',oo('M'+(s&&s.gear)))+c('Bluetooth',bt?'connecté':'non connecté')+c('Phare',oo(s&&s.head?'ON':'off'))+c('Feu arr.',oo(s&&s.tail?'ON':'off'))+c('Régul.',oo(s&&s.cruise?'ON':'off'))+c('Verrou',oo(s&&s.lock?'oui':'non'));
  const col=!s?'#888':s.bat>30?'#2ecc71':s.bat>15?'#ffa31a':'#ff3b30';
  $('#htr').innerHTML=`<svg width="28" height="28" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#8888" stroke-width="3.5"/><circle cx="18" cy="18" r="15" fill="none" stroke="${col}" stroke-width="3.5" stroke-dasharray="${(s?s.bat:0)*.942} 94.2" transform="rotate(-90 18 18)"/><text x="18" y="22" text-anchor="middle" font-size="11" fill="currentColor">${s?s.bat:'--'}</text></svg>`
    +c('Durée',s?fm(s.time/60):'—')+c('Reste',$('#r2').textContent.split(' · ')[0])+c('GPS',gp?'±'+Math.round(gp.acc)+' m':'…')+c('Cap',(Math.round(hd/R2)+360)%360+'°')+c('Alt.',gp&&gp.alt!=null?Math.round(gp.alt)+' m':'—');
  $('#hl').innerHTML=c('Score',sc)+c('Pièces',nc)+c('Anneaux',nr)+c('Drapeaux',nf)+c('Combo','×'+cb)+c('Mission',run?MS[mi][0]+(run.t?' · '+Math.max(0,Math.ceil(tl))+' s':''):'libre');
  const av=s&&tS?vS/tS:0;
  $('#hbr').innerHTML=c('Odomètre',oo(s&&Math.round(s.total/k)+' '+ku))+c('Trajet',s?f1(s.trip)+' '+ku:(dist/1000).toFixed(2)+' km')+c('Vit. moy.',av?f1(av):'—')+c('Vit. max',s?f1(vMax):'—')+c('Accél.',s?f1(aNow)+'/s':'—')+c('Freins br.',svc.hard)+c('Défauts',s&&s.faults?'⚠ '+s.faults:'0')+c('Batt. utilisée',s&&sb0!=null?Math.max(0,sb0-s.bat)+' %':'—')+c('Distance GPS',(dist/1000).toFixed(2)+' km');
  const t=me&&(its.find(i=>i.t==='f'&&i.n===nx&&!i.ok)||its.filter(i=>!i.ok).sort((a,b)=>dm(me,a.p)-dm(me,b.p))[0]);
  $('#hsp').innerHTML=`<div class="sp">${(spd()/k).toFixed(1)} <small style="font-size:.4em">${u}</small></div>`+(!me?'<div class="gd">Recherche GPS…</div>':t?`<div class="gd"><span style="display:inline-block;transform:rotate(${Math.round((brg(me,t.p)-hd)/R2)}deg)">▲</span> ${{c:'Pièce',r:'Anneau',f:'Drapeau '+(t.n+1)}[t.t]} · ${Math.round(dm(me,t.p))} m</div>`:'');
}
function loop(t){if(!on)return;requestAnimationFrame(loop);if(t-lt<33)return;const dt=Math.min(.2,(t-lt)/1e3);lt=t;try{tick(dt);draw();if(t-ht>200){ht=t;hud()}}catch(e){lg('Jeu : '+e.message)}}
function open(i){
  if(!navigator.geolocation){alert('GPS indisponible');return}
  rot=0;t0=0;endRes='';pan=[0,0];PH=null;FP=0;fr=0;mi=i;sid++;ld=0;init=0;its=[];sc=nc=nr=nf=nx=0;cb=1;tr=[];dist=0;run=null;saved=0;me=null;gp=null;$('#gres').hidden=true;gs.hidden=true;
  wid=navigator.geolocation.watchPosition(fix,e=>msg('GPS : '+e.message),{enableHighAccuracy:true,maximumAge:0});
  navigator.geolocation.getCurrentPosition(fix,()=>{},{maximumAge:60000,timeout:4000});gm.hidden=false;on=1;apply();requestAnimationFrame(loop);typeof wl==='function'&&wl()}
function close(){save();on=0;navigator.geolocation.clearWatch(wid);camOff();gm.hidden=true;menu()}

function menu(){
  $('#e').innerHTML=`<h3>SKKKRT Arcade</h3><p class="n">Points totaux : <b>${G.sc}</b> · Meilleure partie : <b>${G.best}</b></p>
  <p class="n">Ramasse les pièces dorées et les anneaux bleus, passe les drapeaux dans l'ordre. Tout est placé sur de vraies routes (OpenStreetMap, il faut du réseau) : le chemin à suivre est tracé en transparence. Les anneaux roses demandent une vitesse minimale. La vitesse et la batterie viennent du Bluetooth (bouton « Connecter » de l'onglet Tableau, ou « BT » dans le jeu) ; la position vient du GPS.</p>`
  +MS.map((m,i)=>{const o=m[2];return`<div class="c" style="margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px"><span><b>${m[0]}</b><small>${m[1]} · ${o.f?o.f+' drapeaux · ':''}${o.c} pièces · ${o.r} anneaux${o.t?' · '+o.t/60+' min':''}${o.v?' · roses ≥ '+o.v+' km/h':''}</small></span><button data-p="${i}">${G.done[i]?'✓ ':''}Jouer</button></div>`}).join('')
  +`<button data-p="-1" style="width:100%;margin-top:6px">Mode libre (pièces à l'infini)</button>
  <p class="n">Pour tester à la maison : dans le jeu, ⚙ → Simulation (ou roule sur béquille avec le Bluetooth connecté).</p>
  <p class="n err">Sécurité : garde les yeux sur la route et fixe le téléphone au guidon. Les objets suivent les routes publiques, mais vérifie toujours que le passage est sûr et permis pour une trottinette (pas d'autoroute, de trottoir interdit, etc.) et respecte le code de la route.</p>`
  +hist()}
function hist(){const mm=t=>Math.floor(t/60)+':'+String(t%60).padStart(2,'0'),h=G.h;
  return`<h3 style="margin-top:26px">Historique des parties</h3>`+(h.length?h.map(x=>{const d=new Date(x.d);return`<div class="c" style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px"><b>${x.m}</b><b>${x.sc} pts</b></div><small>${d.toLocaleDateString('fr-CA',{day:'numeric',month:'short'})} ${d.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})} · ${x.r} · ${mm(x.t)}</small><small>Pièces ${x.nc} · Anneaux ${x.nr} · Drapeaux ${x.nf} · ${x.km.toFixed(2)} km</small></div>`}).join('')+`<button data-clr="1" style="width:100%;margin-top:6px">Effacer l'historique</button>`:'<p class="n">Aucune partie pour l\'instant.</p>')}
$('#e').onclick=e=>{if(e.target.closest('[data-clr]')){if(confirm('Effacer tout l\'historique des parties ?')){G.h=[];W('game',G);menu()}return}const b=e.target.closest('[data-p]');if(b)open(+b.dataset.p)};
menu();
document.querySelector('#nav [data-s=e]').addEventListener('click',()=>{if(GR||pf||!navigator.geolocation)return;pf=1;navigator.geolocation.getCurrentPosition(p=>roads([p.coords.latitude,p.coords.longitude],1200).then(()=>pf=0),()=>pf=0,{maximumAge:60000,timeout:8000})});
})();
