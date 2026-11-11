import * as THREE from 'three';

const canvas = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78877d);
scene.fog = new THREE.FogExp2(0x78877d, 0.0115);
const camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const colliders = [];
const enemies = [];
const tracers = [];
const particles = [];
const mats = {};
const ui = Object.fromEntries(['start-screen','deploy-button','pause-screen','resume-button','objective-title','objective-copy','objective-bar','objective-state','enemy-count','health-value','health-bar','ammo-current','ammo-reserve','frag-count','hitmarker','toast','interaction','objective-marker','marker-distance','compass-deg','damage-vignette','objective-complete','next-round','game-over','restart-game','mobile-controls','joystick','joystick-knob','mobile-fire','mobile-reload','mobile-secure','center-hud'].map(id => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

const state = { started:false, paused:false, over:false, won:false, hp:100, ammo:30, reserve:120, grenades:1, yaw:0, pitch:0, firing:false, aiming:false, reloading:false, securing:false, secureTime:0, shots:0, kills:0, round:1, lastShot:0, hitAt:0, damageAt:0, toastAt:0, time:0, recoil:0, bob:0, moving:false, roll:0, invulnerable:0, touchMove:{x:0,y:0}, touchLook:false };
const player = new THREE.Group();
scene.add(player);

function material(color, roughness=0.85, metalness=0){ return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function box(parent, name, size, pos, mat, cast=true, receive=true){ const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat); m.name=name; m.position.set(...pos); m.castShadow=cast; m.receiveShadow=receive; parent.add(m); return m; }
function cylinder(parent, name, r1, r2, h, pos, mat, segments=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat);m.name=name;m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function addCollider(x,z,w,d){colliders.push({x,z,w,d});}

function makeWorld(){
  mats.concrete=material(0x59645b); mats.wall=material(0x555e57); mats.wallDark=material(0x343e39); mats.trim=material(0x737b70); mats.tan=material(0x8c7657); mats.rust=material(0x965c3c); mats.crate=material(0x645b47); mats.dark=material(0x202a27); mats.glass=new THREE.MeshStandardMaterial({color:0xb98a50,emissive:0x5c3312,emissiveIntensity:.42,roughness:.32}); mats.green=material(0x485a48); mats.sand=material(0x887b62); mats.yellow=material(0xd0a949); mats.red=material(0xa84639);
  const hemi=new THREE.HemisphereLight(0xc8d7dc,0x3f4335,2.1);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffd5a0,3.0);sun.position.set(-20,34,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.bias=-.0002;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xa4c5d0,1.05);fill.position.set(15,14,-30);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(130,150),mats.concrete);ground.rotation.x=-Math.PI/2;ground.position.y=-.09;ground.receiveShadow=true;scene.add(ground);
  // Asphalt lanes and painted, worn markings.
  const road=box(scene,'road',[20,.035,90],[0,-.045,-1],material(0x3d4743),false);road.receiveShadow=true;
  for(let z=38;z>-43;z-=7){box(scene,'lane dash',[.12,.025,3],[0,-.018,z],mats.yellow,false);}
  for(let side of [-1,1]){
    box(scene,'sidewalk',[5,.24,88],[side*12.7,.04,-1],mats.sand);
    box(scene,'outer curb',[.32,.42,90],[side*10.15,.06,-1],mats.trim);
    for(let i=0;i<5;i++){const z=-33+i*15;building(side*20,5.5,z,11,11+(i%2)*2,14, i%3===0?mats.tan:(i%3===1?mats.wall:mats.green));}
  }
  // Low perimeter walls and lane closure at the far end.
  box(scene,'far wall',[55,4,1], [0,1.7,-45],mats.wall);addCollider(0,-45,55,1);
  box(scene,'near wall',[55,4,1], [0,1.7,44],mats.wall);addCollider(0,44,55,1);
  for(let x of [-29,29]){box(scene,'boundary',[1,4,90],[x,1.7,-.5],mats.wall);addCollider(x,-.5,1,90);}
  // Uplink site, a bright tactical objective in the open plaza.
  const site=new THREE.Group();site.position.set(0,0,-27);scene.add(site);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.045,8,64),new THREE.MeshBasicMaterial({color:0xd9f36a,transparent:true,opacity:.8}));ring.rotation.x=Math.PI/2;ring.position.y=.045;site.add(ring);
  const inner=new THREE.Mesh(new THREE.CircleGeometry(2.38,48),new THREE.MeshBasicMaterial({color:0xb5d74c,transparent:true,opacity:.09,side:THREE.DoubleSide}));inner.rotation.x=-Math.PI/2;inner.position.y=.01;site.add(inner);
  const console=new THREE.Group();console.position.set(0,0,0);site.add(console);
  box(console,'uplink base',[1.1,.42,.8],[0,.25,0],mats.dark);
  box(console,'uplink screen',[.72,.38,.07],[0,.65,-.22],new THREE.MeshStandardMaterial({color:0xb4e3a8,emissive:0x68ba67,emissiveIntensity:1.6,roughness:.3}));
  cylinder(console,'antenna',.035,.035,.8,[.4,.8,.2],mats.yellow,8);
  for(let i=0;i<3;i++){const beacon=new THREE.PointLight(0x9de56f,.6,3);beacon.position.set((i-1)*.2,.9,0);console.add(beacon);}
  // Utility poles, street lights, cable and destructible-looking cover (all solid scenery).
  for(let x of [-9.7,9.7]){for(let z of [-35,-17,1,19,37]){if(Math.abs(z+27)<8)continue;lamp(x,z);}}
  // Scatter varied waist-high cover along the lane and plaza.
  crate(-6,-18,1.4,1.25,1.4);crate(6,-14,1.5,1.3,1.5);crate(-8,-5,2.2,1.25,1.1);crate(8,3,2,1.2,1.4);crate(-4,14,1.4,1.1,1.1);crate(4,25,1.8,1.25,1.1);
  barricade(-2,-8,3.3,1.0,1.2);barricade(3,8,3.2,1.0,1.2);
  for(let z of [-29,-22,-9,4,17,30]){for(let side of [-1,1]){if(z < -20 && Math.abs(side*7)<8)continue;propCluster(side*(7.8+(z%3)*.2),z);}}
  // Skyline silhouettes and warm windows.
  for(let side of [-1,1]){for(let i=0;i<3;i++){const z=-34+i*27;box(scene,'distant silhouette',[10,18+(i%2)*7,9],[side*34,8,z],mats.wallDark,false);}}
  return {site,ring,console};
}
function building(x,y,z,w,h,d,mat){
  const b=box(scene,'district facade',[w,h,d],[x,y,z],mat);addCollider(x,z,w,d);
  // Facade ledges, window frames, dark panes.
  box(scene,'parapet',[w+.3,.3,d+.25],[x,y+h/2-.15,z],mats.wallDark);
  const front=x>0?x-w/2-.012:x+w/2+.012;
  const rows=Math.floor((h-2)/2.8), cols=Math.max(2,Math.floor(d/3.5));
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const wz=z-d/2+1.6+c*(d-3.2)/Math.max(1,cols-1), wy=1.5+r*2.7;
    box(scene,'window recess',[.08,1.05,1.2],[front,wy,wz],mats.wallDark,false);
    box(scene,'window glass',[.035,.77,.88],[front+(x>0?-.06:.06),wy,wz],(r+c)%3===0?mats.glass:mats.dark,false);
    box(scene,'window sill',[.15,.08,1.35],[front+(x>0?-.1:.1),wy-.56,wz],mats.trim,false);
  }
  box(scene,'awning',[.75,.12,d*.55],[front+(x>0?-.38:.38),1.0,z],mats.rust);
  box(scene,'entry door',[.08,1.9,1.15],[front+(x>0?-.01:.01),.98,z+d*.24],mats.dark);
  const sign=box(scene,'shop sign',[.1,.42,2.5],[front+(x>0?-.09:.09),2.1,z-d*.08],mats.yellow,false);sign.rotation.z=.02;
}
function crate(x,z,w,h,d){const mesh=box(scene,'field crate',[w,h,d],[x,h/2,z],mats.crate);box(scene,'crate band',[w+.03,.09,d+.03],[x,h*.72,z],mats.trim);box(scene,'crate stripe',[w+.04,.07,.07],[x,h/2,z],mats.yellow);addCollider(x,z,w,d);}
function barricade(x,z,w,h,d){const b=box(scene,'concrete barricade',[w,h,d],[x,h/2,z],mats.wallDark);b.rotation.y=.08;box(scene,'barricade stripe',[w,.12,d+.02],[x,h*.72,z],mats.yellow);addCollider(x,z,w,d);}
function propCluster(x,z){cylinder(scene,'planter',.72,.8,.42,[x,.2,z],mats.wallDark,12);for(let i=0;i<4;i++){const leaf=box(scene,'planter leaves',[.36,.45,.32],[x+Math.sin(i*1.6)*.28,.6,z+Math.cos(i*1.6)*.28],mats.green,false);leaf.rotation.y=i;}if(Math.abs(x)>8){cylinder(scene,'street barrel',.42,.4,.86,[x+Math.sign(x)*1.1,.43,z+.6],mats.rust,12);}}
function lamp(x,z){cylinder(scene,'lamp post',.09,.12,6,[x,3,z],mats.wallDark,8);box(scene,'lamp arm',[1.2,.08,.08],[x+(x<0?.45:-.45),5.9,z],mats.wallDark);const light=new THREE.PointLight(0xffd28a,2.2,11,2);light.position.set(x+(x<0?.8:-.8),5.7,z);scene.add(light);box(scene,'lamp glow',[.32,.12,.32],light.position.toArray(),mats.glass,false);}

const world=makeWorld();

function makePlayer(){
  const cloth=material(0x46584b), armor=material(0x27342d), straps=material(0x1d2823), skin=material(0x9d8064), helmet=material(0x25342d), weapon=material(0x161b1a,.45,.45), lens=new THREE.MeshStandardMaterial({color:0x33483d,metalness:.5,roughness:.22});
  const g=new THREE.Group();player.add(g);player.userData.visual=g;
  box(g,'operator torso',[.72,.82,.39],[0,1.22,0],armor);
  box(g,'plate carrier',[.76,.48,.43],[0,1.28,-.015],cloth);
  box(g,'chest plate',[.48,.36,.06],[0,1.33,-.24],straps);
  for(let i=0;i<3;i++){box(g,'mag pouch',[.14,.18,.12],[-.2+i*.2,1.1,-.28],armor);}
  box(g,'backpack',[.54,.65,.25],[0,1.34,.28],straps);
  cylinder(g,'neck',.12,.13,.16,[0,1.72,0],skin,8);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,12,10),skin);head.position.set(0,1.92,-.01);head.castShadow=true;g.add(head);
  const helmetMesh=new THREE.Mesh(new THREE.SphereGeometry(.255,12,8,0,Math.PI*2,0,Math.PI*.56),helmet);helmetMesh.position.set(0,2.01,-.015);helmetMesh.castShadow=true;g.add(helmetMesh);
  box(g,'helmet rim',[.48,.08,.42],[0,1.91,-.01],helmet);
  box(g,'visor',[.34,.1,.035],[0,1.96,-.21],lens);
  for(let s of [-1,1]){
    const arm=box(g,'sleeve',[.25,.62,.27],[s*.48,1.28,-.05],cloth);arm.rotation.z=-s*.18;
    const glove=box(g,'glove',[.21,.2,.22],[s*.51,.98,-.31],straps);glove.rotation.x=-.3;
    const leg=box(g,'trouser',[.29,.7,.31],[s*.2,.44,.02],cloth);
    box(g,'knee pad',[.3,.22,.11],[s*.2,.48,-.17],armor);
    box(g,'boot',[.32,.17,.48],[s*.2,.1,-.05],straps);
  }
  // Compact carbine in a low-ready pose, with handguard, optic and magazine.
  const rifle=new THREE.Group();rifle.position.set(.03,1.2,-.33);g.add(rifle);
  box(rifle,'receiver',[.18,.18,.7],[0,0,-.2],weapon);
  box(rifle,'handguard',[.14,.13,.6],[0,.01,-.75],straps);
  cylinder(rifle,'barrel',.035,.035,.68,[0,.02,-1.34],weapon,8).rotation.x=Math.PI/2;
  box(rifle,'stock',[.13,.14,.4],[0,.01,.34],weapon);
  box(rifle,'magazine',[.12,.28,.16],[0,-.18,-.21],weapon).rotation.x=-.15;
  box(rifle,'optic',[.08,.12,.17],[0,.15,-.34],mats.dark);
  box(rifle,'optic lens',[.07,.07,.02],[0,.16,-.43],lens);
  player.userData.rifle=rifle;
}
makePlayer();

const enemySpawns=[[-5,-20],[5,-23],[-8,-31],[8,-31],[0,-37]];
function makeEnemy(index,position){
  const root=new THREE.Group();root.position.set(position[0],0,position[1]);scene.add(root);
  const uniform=material(index%2?0x554a3c:0x48473d), armor=material(0x302e29), skin=material(0x917560), helmetMat=material(0x36372f), visor=new THREE.MeshStandardMaterial({color:0x4c574b,metalness:.35,roughness:.3});
  const meshes=[];
  const add=(name,size,pos,mat)=>{const m=box(root,name,size,pos,mat);meshes.push(m);return m;};
  add('hostile torso',[.64,.76,.35],[0,1.18,0],uniform);
  add('hostile vest',[.67,.43,.38],[0,1.26,-.02],armor);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),skin);head.position.set(0,1.78,0);head.castShadow=true;root.add(head);meshes.push(head);
  add('hostile helmet',[.4,.15,.4],[0,1.91,0],helmetMat);
  add('hostile face shield',[.28,.09,.04],[0,1.78,-.18],visor);
  for(let side of [-1,1]){const arm=add('hostile arm',[.22,.55,.24],[side*.42,1.2,-.05],uniform);arm.rotation.z=-side*.15;add('hostile leg',[.25,.64,.27],[side*.19,.39,.01],uniform);add('hostile boot',[.28,.14,.34],[side*.19,.08,-.04],armor);}
  const rifle=box(root,'hostile rifle',[.13,.13,.73],[.04,1.07,-.44],mats.dark);rifle.rotation.x=.06;
  const hitMeshes=[head,meshes[0],meshes[1]];
  const enemy={root,index,hp:100,alive:true,hitMeshes,fireAt:2+Math.random()*1.8,movePhase:Math.random()*5,flash:0,deathAt:0,seed:Math.random()*10};
  enemies.push(enemy);return enemy;
}
function spawnEnemies(){for(const e of enemies)scene.remove(e.root);enemies.length=0;enemySpawns.forEach((p,i)=>makeEnemy(i,p));}
spawnEnemies();

const materialTracer=new THREE.LineBasicMaterial({color:0xf7d784,transparent:true,opacity:.85});
const enemyTracerMat=new THREE.LineBasicMaterial({color:0xff785d,transparent:true,opacity:.8});
function tracer(a,b,mat=materialTracer,life=.09){const geo=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(geo,mat);scene.add(line);tracers.push({line,life,max:life});}
function burst(position,color=0xe0c36d,count=5){for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.035+Math.random()*.035,5,4),new THREE.MeshBasicMaterial({color,transparent:true}));mesh.position.copy(position);scene.add(mesh);particles.push({mesh,vel:new THREE.Vector3((Math.random()-.5)*2,Math.random()*2,(Math.random()-.5)*2),life:.28+Math.random()*.25});}}

function addToast(text){ui.toast.textContent=text;ui.toast.classList.add('visible');state.toastAt=performance.now()+1500;}
function updateHUD(){
  ui.healthValue.textContent=Math.max(0,Math.ceil(state.hp));ui.healthBar.style.width=`${Math.max(0,state.hp)}%`;ui.healthBar.style.background=state.hp<35?'#f15d55':'#d9f36a';
  ui.ammoCurrent.textContent=state.ammo;ui.ammoReserve.textContent=state.reserve;ui.fragCount.textContent=state.grenades;
  const alive=enemies.filter(e=>e.alive).length;document.querySelector('#enemy-count b').textContent=String(alive).padStart(2,'0');
  document.querySelector('.threat-bars').style.opacity=alive?1:.28;
  ui.objectiveState.textContent=alive?'SITE CONTESTED':'AREA CLEAR';ui.objectiveState.style.color=alive?'#e8bc73':'#d9f36a';
  const d=player.position.distanceTo(new THREE.Vector3(0,0,-27));ui.markerDistance.textContent=`${Math.round(d)}M`;
  ui.objectiveMarker.style.opacity=d<3.3?'0':'1';
}
function fire(){
  if(!state.started||state.paused||state.over||state.won||state.reloading||state.ammo<=0)return;
  const now=performance.now();if(now-state.lastShot<116)return;state.lastShot=now;state.ammo--;state.shots++;state.recoil=Math.min(.09,state.recoil+.035);updateHUD();
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);raycaster.far=75;
  const hits=raycaster.intersectObjects(enemies.filter(e=>e.alive).flatMap(e=>e.hitMeshes),false);
  const from=camera.position.clone().add(new THREE.Vector3(0,-.18,0));const to=hits.length?hits[0].point:raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction,54);
  tracer(from,to);burst(player.position.clone().add(new THREE.Vector3(Math.sin(state.yaw)*.65,1.4,-Math.cos(state.yaw)*.65)),0xffd77d,3);
  if(hits.length){const target=enemies.find(e=>e.alive&&e.hitMeshes.includes(hits[0].object));if(target){const head=hits[0].object===target.hitMeshes[0];target.hp-=head?100:52;state.hitAt=now;ui.hitmarker.classList.add('show');if(target.hp<=0){target.alive=false;target.deathAt=now;target.root.rotation.x=-.15;state.kills++;burst(target.root.position.clone().add(new THREE.Vector3(0,1.2,0)),0xf0c46d,9);addToast(head?'HEADSHOT // HOSTILE NEUTRALIZED':'HOSTILE NEUTRALIZED');}updateHUD();}}
}
function reload(){if(!state.started||state.paused||state.reloading||state.ammo===30||state.reserve<=0)return;state.reloading=true;addToast('RELOADING');setTimeout(()=>{if(state.over||state.won){state.reloading=false;return;}const n=Math.min(30-state.ammo,state.reserve);state.ammo+=n;state.reserve-=n;state.reloading=false;updateHUD();},1250);}
function throwGrenade(){if(!state.started||state.paused||state.grenades<1||state.over||state.won)return;state.grenades--;updateHUD();const direction=new THREE.Vector3(Math.sin(state.yaw),.15,-Math.cos(state.yaw));const grenade=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),mats.dark);grenade.position.copy(player.position).add(new THREE.Vector3(0,1.35,0));scene.add(grenade);let v=direction.multiplyScalar(12);v.y=5;const t=performance.now();const tick=()=>{const dt=.016;v.y-=9.8*dt;grenade.position.addScaledVector(v,dt);if(grenade.position.y<.12||performance.now()-t>1000){const p=grenade.position.clone();scene.remove(grenade);burst(p,0xf4a457,28);const ring=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),new THREE.MeshBasicMaterial({color:0xf6a947,transparent:true,opacity:.42,wireframe:true}));ring.position.copy(p);scene.add(ring);let scale=0;const grow=()=>{scale+=.28;ring.scale.setScalar(scale);if(scale<10)requestAnimationFrame(grow);else scene.remove(ring);};grow();for(const e of enemies){if(e.alive&&e.root.position.distanceTo(p)<8){e.hp-=125;if(e.hp<=0){e.alive=false;e.deathAt=performance.now();state.kills++;}}}updateHUD();}else requestAnimationFrame(tick);};tick();}

function damage(amount){if(state.invulnerable>0||state.over||state.won)return;state.hp=Math.max(0,state.hp-amount);state.invulnerable=.42;state.damageAt=performance.now();ui.damageVignette.classList.add('active');updateHUD();if(state.hp<=0){state.over=true;ui.gameOver.classList.add('visible');document.exitPointerLock?.();}}

function enemyAI(dt){
  const now=performance.now(), alive=enemies.filter(e=>e.alive);
  for(const e of enemies){
    if(!e.alive){if(now-e.deathAt<650){e.root.position.y=Math.max(-.55,-(now-e.deathAt)/1200);e.root.rotation.x=-.5;}else e.root.visible=false;continue;}
    const dx=player.position.x-e.root.position.x,dz=player.position.z-e.root.position.z,dist=Math.hypot(dx,dz);
    if(dist>5.6&&dist<34){const speed=dist>17?1.12:.45;const nx=e.root.position.x+dx/dist*speed*dt,nz=e.root.position.z+dz/dist*speed*dt;
      if(Math.abs(nx)<9.3){e.root.position.x=nx;e.root.position.z=nz;}else{e.root.position.z=nz;e.root.position.x+=Math.sign(-e.root.position.x)*speed*.5*dt;}
    }
    if(dist>0.1)e.root.rotation.y=Math.atan2(dx,-dz);
    e.movePhase+=dt*3;e.root.position.y=Math.abs(Math.sin(e.movePhase))*.025;
    if(dist<25&&now>e.fireAt*1000){e.fireAt=now/1000+1.5+Math.random()*1.7;const origin=e.root.position.clone().add(new THREE.Vector3(0,1.35,0));const aim=player.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.3,1.3+(Math.random()-.5)*.8,(Math.random()-.5)*1.2));tracer(origin,aim,enemyTracerMat,.11);burst(origin,0xffa56d,2);if(dist<17&&Math.random()<.66)damage(5+Math.random()*5);}
  }
  if(alive.length===0&&state.started&&!state.won){const d=player.position.distanceTo(new THREE.Vector3(0,0,-27));const can=d<3.4;ui.interaction.classList.toggle('visible',can);if(can){if(state.securing){state.secureTime+=dt;ui.objectiveBar.style.width=`${Math.min(100,state.secureTime/4*100)}%`;if(state.secureTime>=4){state.won=true;state.securing=false;ui.objectiveTitle.textContent='INTEL SECURED';ui.objectiveCopy.textContent='Uplink secured. Extraction is inbound.';ui.objectiveComplete.classList.add('visible');document.exitPointerLock?.();}}}else{state.securing=false;state.secureTime=0;ui.objectiveBar.style.width='0%';}}else if(alive.length>0){state.securing=false;state.secureTime=0;ui.objectiveBar.style.width='0%';}
  updateHUD();
}

function updateCamera(dt){
  const target=new THREE.Vector3(player.position.x,player.position.y+1.46,player.position.z);
  const distance=state.aiming?4.05:6.25;const pitch=THREE.MathUtils.clamp(state.pitch,-.52,.23);
  const aimDirection=new THREE.Vector3(Math.sin(state.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(state.yaw)*Math.cos(pitch));
  const desired=target.clone().addScaledVector(aimDirection,-distance);
  // Avoid clipping the camera into a nearby wall or cover prop.
  const direction=desired.clone().sub(target),length=direction.length();direction.normalize();raycaster.set(target,direction);raycaster.far=length;
  const obstacles=raycaster.intersectObjects(scene.children.filter(object=>object!==player),true).filter(h=>h.object.isMesh&&!h.object.name.includes('ground')&&!h.object.name.includes('road')&&!h.object.name.includes('lane')&&!h.object.name.includes('planter leaves')&&!h.object.name.includes('window'));
  const hit=obstacles.find(h=>h.distance<length&&h.point.y>0.35);
  const actual=hit?Math.max(1.05,hit.distance-.25):length;
  camera.position.copy(target).addScaledVector(direction,actual);camera.lookAt(target.clone().addScaledVector(aimDirection,20));
  const fov=state.aiming?50:63;camera.fov=THREE.MathUtils.lerp(camera.fov,fov,dt*7);camera.updateProjectionMatrix();
  const dir=new THREE.Vector3(Math.sin(state.yaw),0,-Math.cos(state.yaw));
  player.userData.visual.rotation.y=state.yaw;player.userData.visual.position.y=state.roll>0?Math.sin(state.roll*Math.PI)*-.4:state.moving?Math.sin(state.bob*10)*.025:0;
  player.userData.rifle.rotation.x=state.aiming?-.07:0;
  const compass=((Math.round(THREE.MathUtils.euclideanModulo(state.yaw*180/Math.PI,360))%360)+360)%360;ui.compassDeg.textContent=`${String(compass).padStart(3,'0')}°`;
  const mark=new THREE.Vector3(0,1.2,-27).project(camera);ui.objectiveMarker.style.left=`${(mark.x*.5+.5)*innerWidth}px`;ui.objectiveMarker.style.top=`${(-mark.y*.5+.5)*innerHeight}px`;
}
function collides(x,z){
  for(const c of colliders){const nx=Math.max(c.x-c.w/2,Math.min(x,c.x+c.w/2)),nz=Math.max(c.z-c.d/2,Math.min(z,c.z+c.d/2));if((x-nx)**2+(z-nz)**2<.46**2)return true;}
  return false;
}
function movement(dt){
  let forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-state.touchMove.y;
  let side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+state.touchMove.x;
  const length=Math.hypot(forward,side);if(length>1){forward/=length;side/=length;}
  state.moving=Math.abs(forward)+Math.abs(side)>.08;
  const sprint=keys.has('ShiftLeft')||keys.has('ShiftRight');const speed=sprint?7.2:4.15;
  const fx=Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=Math.sin(state.yaw);
  const dx=(fx*forward+rx*side)*speed*dt,dz=(fz*forward+rz*side)*speed*dt;
  const nx=THREE.MathUtils.clamp(player.position.x+dx,-27.5,27.5),nz=THREE.MathUtils.clamp(player.position.z+dz,-42.5,41.5);
  if(!collides(nx,player.position.z))player.position.x=nx;if(!collides(player.position.x,nz))player.position.z=nz;
  if(state.moving)state.bob+=dt*(sprint?13:9);if(state.roll>0){state.roll=Math.max(0,state.roll-dt*1.7);state.invulnerable=Math.max(state.invulnerable,.25);}else state.invulnerable=Math.max(0,state.invulnerable-dt);
  state.recoil=Math.max(0,state.recoil-dt*.24);
  if(state.firing)fire();
}

const keys=new Set();
function startGame(){state.started=true;state.paused=false;state.over=false;ui.startScreen.classList.add('hidden');ui.pauseScreen.classList.remove('visible');canvas.focus();if(innerWidth>800)canvas.requestPointerLock?.();updateHUD();}
function nextRound(){state.round++;document.querySelector('#round-num').textContent=String(state.round).padStart(2,'0');state.hp=Math.min(100,state.hp+35);state.ammo=30;state.reserve+=60;state.grenades=1;state.won=false;state.secureTime=0;state.securing=false;state.reloading=false;ui.objectiveComplete.classList.remove('visible');ui.objectiveTitle.textContent='SECURE THE SITE';ui.objectiveCopy.textContent='Clear hostiles, then secure the uplink.';ui.objectiveBar.style.width='0%';const spawnList=enemySpawns.slice();for(let i=5;i<5+Math.min(state.round-1,4);i++){const angle=i*2.4;spawnList.push([Math.sin(angle)*7,-31-Math.cos(angle)*7]);}for(const e of enemies)scene.remove(e.root);enemies.length=0;spawnList.forEach((p,i)=>makeEnemy(i,p));player.position.set(0,0,13);state.yaw=0;updateHUD();addToast(`ROUND ${String(state.round).padStart(2,'0')} // HOSTILES INBOUND`);}

const keyMap={KeyW:'KeyW',KeyA:'KeyA',KeyS:'KeyS',KeyD:'KeyD'};
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyR')reload();if(e.code==='KeyQ')throwGrenade();if(e.code==='KeyE')state.securing=true;if(e.code==='Space'&&state.started&&!state.paused&&!state.over&&!state.won){state.roll=.9;state.invulnerable=.6;}if(e.code==='Escape'&&state.started&&!state.over&&!state.won){state.paused=true;ui.pauseScreen.classList.add('visible');state.firing=false;document.exitPointerLock?.();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE')state.securing=false;});
canvas.addEventListener('mousedown',e=>{if(!state.started||state.paused||state.over||state.won)return;if(document.pointerLockElement!==canvas&&innerWidth>800){canvas.requestPointerLock?.();}if(e.button===0)state.firing=true;if(e.button===2)state.aiming=true;});
window.addEventListener('mouseup',e=>{if(e.button===0)state.firing=false;if(e.button===2)state.aiming=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){state.yaw-=e.movementX*.00235;state.pitch=THREE.MathUtils.clamp(state.pitch-e.movementY*.0018,-.52,.23);}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&state.started&&!state.over&&!state.won&&innerWidth>800&&state.paused===false){state.paused=true;ui.pauseScreen.classList.add('visible');state.firing=false;}});
ui.deployButton.addEventListener('click',startGame);ui.resumeButton.addEventListener('click',()=>{state.paused=false;ui.pauseScreen.classList.remove('visible');canvas.requestPointerLock?.();});ui.nextRound.addEventListener('click',nextRound);ui.restartGame.addEventListener('click',()=>{state.hp=100;state.ammo=30;state.reserve=120;state.kills=0;state.round=0;state.over=false;document.querySelector('#round-num').textContent='01';ui.gameOver.classList.remove('visible');nextRound();});

let joystickPointer=null, joystickRect=null, lookPointer=null, lastTouch=null;
ui.joystick.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;ui.joystick.setPointerCapture(e.pointerId);joystickRect=ui.joystick.getBoundingClientRect();updateJoystick(e);});
ui.joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)updateJoystick(e);});
function updateJoystick(e){const r=joystickRect||ui.joystick.getBoundingClientRect();const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),clamp=Math.min(34,len),x=len?dx/len*clamp:0,y=len?dy/len*clamp:0;ui.joystickKnob.style.transform=`translate(${x}px,${y}px)`;state.touchMove.x=x/34;state.touchMove.y=y/34;}
function releaseJoystick(){joystickPointer=null;joystickRect=null;state.touchMove.x=0;state.touchMove.y=0;ui.joystickKnob.style.transform='translate(0,0)';}
ui.joystick.addEventListener('pointerup',releaseJoystick);ui.joystick.addEventListener('pointercancel',releaseJoystick);
ui.mobileFire.addEventListener('pointerdown',e=>{e.preventDefault();state.firing=true;ui.mobileFire.setPointerCapture(e.pointerId);});ui.mobileFire.addEventListener('pointerup',()=>state.firing=false);ui.mobileFire.addEventListener('pointercancel',()=>state.firing=false);
ui.mobileReload.addEventListener('pointerdown',e=>{e.preventDefault();reload();});ui.mobileSecure.addEventListener('pointerdown',e=>{e.preventDefault();state.securing=true;ui.mobileSecure.setPointerCapture(e.pointerId);});ui.mobileSecure.addEventListener('pointerup',()=>state.securing=false);ui.mobileSecure.addEventListener('pointercancel',()=>state.securing=false);
canvas.addEventListener('pointerdown',e=>{if(innerWidth>800||!state.started||e.pointerType!=='touch')return;lookPointer=e.pointerId;lastTouch={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer||!lastTouch)return;const dx=e.clientX-lastTouch.x,dy=e.clientY-lastTouch.y;state.yaw-=dx*.006;state.pitch=THREE.MathUtils.clamp(state.pitch-dy*.004,-.52,.23);lastTouch={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(e.pointerId===lookPointer){lookPointer=null;lastTouch=null;}});canvas.addEventListener('pointercancel',()=>{lookPointer=null;lastTouch=null;});

function animate(){requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());state.time+=dt;
  if(state.started&&!state.paused&&!state.over&&!state.won){movement(dt);enemyAI(dt);}else{state.firing=false;}
  updateCamera(dt);
  for(let i=tracers.length-1;i>=0;i--){const t=tracers[i];t.life-=dt;t.line.material.opacity=Math.max(0,t.life/t.max)*.82;if(t.life<=0){scene.remove(t.line);t.line.geometry.dispose();tracers.splice(i,1);}}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.vel,dt);p.vel.y-=5*dt;if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
  if(performance.now()>state.hitAt+120)ui.hitmarker.classList.remove('show');if(performance.now()>state.toastAt)ui.toast.classList.remove('visible');if(performance.now()>state.damageAt+210)ui.damageVignette.classList.remove('active');
  renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);});
player.position.set(0,0,13);state.yaw=0;updateHUD();
window.__breachTest={state,player,enemies,nextRound,damage};
updateCamera(1);animate();

