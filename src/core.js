/* Apex Foundry — circuit geometry and deterministic, shared vehicle dynamics.
 * No runtime dependencies. Distances: m; angles: radians; simulation: seconds.
 * Copyright (c) 2026. Released under the MIT license. */
(function (root) {
'use strict';
const PI=Math.PI, TAU=PI*2, DEG=PI/180;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const wrap=(s,L)=>((s%L)+L)%L;
const angle=(a)=>Math.atan2(Math.sin(a),Math.cos(a));
const smooth=(t)=>t*t*(3-2*t);
// Three arcade classes. Player/base tuning and explicit AI performance scales are separate.
// Speeds are m/s internally. These are game tunes, not real-vehicle claims.
const CAR=Object.freeze({id:'sedan',name:'Street Sedan',maxSpeed:60,reverseSpeed:10,acceleration:8.5,braking:14,drag:0.00135,rolling:0.23,grip:28,aeroGrip:0,wheelbase:2.65,steerAngle:0.72,steerResponse:18,steerReturn:24,steerSpeedFade:0.020,yawResponse:16,radius:1.14,collisionRadius:.98,collisionHalfLength:1.15,wheelHalfTrack:1.01,wheelHalfBase:1.36,tyreHalfWidth:.16});
const CARS=Object.freeze({sedan:CAR,
 rally:Object.freeze({...CAR,id:'rally',name:'Rally Special',maxSpeed:280/3.6,acceleration:13,braking:22,drag:.0012,grip:35,wheelbase:2.55,steerAngle:.79,steerResponse:22,steerReturn:27,steerSpeedFade:.017,yawResponse:19,wheelHalfBase:1.27}),
 f1:Object.freeze({...CAR,id:'f1',name:'Formula One',maxSpeed:380/3.6,acceleration:22,braking:42,drag:.00115,grip:62,aeroGrip:.0015,wheelbase:3.1,steerAngle:.82,steerResponse:26,steerReturn:32,steerSpeedFade:.014,yawResponse:24,radius:1.2,collisionRadius:1.05,collisionHalfLength:1.65,wheelHalfTrack:1.06,wheelHalfBase:1.66,tyreHalfWidth:.23})});
const specOf=value=>typeof value==='string'?(Object.hasOwn(CARS,value)?CARS[value]:CAR):(value?.spec||value||CAR);
// Editor values use human-readable km/h and degrees; dynamics remain SI.
const TUNE_FIELDS=Object.freeze([
 {key:'maxSpeed',label:'Top speed',unit:'km/h',min:60,max:600,step:1,scale:3.6},
 {key:'acceleration',label:'Acceleration',unit:'m/s²',min:2,max:60,step:.5,scale:1},
 {key:'braking',label:'Braking force',unit:'m/s²',min:5,max:100,step:.5,scale:1},
 {key:'grip',label:'Mechanical grip',unit:'m/s²',min:8,max:130,step:.5,scale:1},
 {key:'aeroGrip',label:'Aero grip coefficient',unit:'m⁻¹',min:0,max:.008,step:.0001,scale:1},
 {key:'steerAngle',label:'Maximum steering angle',unit:'degrees',min:15,max:65,step:1,scale:1/DEG},
 {key:'steerResponse',label:'Steering response',unit:'s⁻¹',min:4,max:50,step:1,scale:1},
 {key:'steerReturn',label:'Steering return',unit:'s⁻¹',min:4,max:60,step:1,scale:1},
 {key:'yawResponse',label:'Heading response',unit:'s⁻¹',min:4,max:50,step:1,scale:1},
 {key:'steerSpeedFade',label:'High-speed steering reduction',unit:'s/m · lower = sharper',min:.003,max:.06,step:.001,scale:1},
 {key:'drag',label:'Aerodynamic drag',unit:'m⁻¹ · lower = less drag',min:.0003,max:.004,step:.00005,scale:1},
 {key:'rolling',label:'Rolling resistance',unit:'m/s² · lower = less drag',min:0,max:1,step:.01,scale:1}
]);
const AI_PRESETS=Object.freeze({easy:90,medium:100,hard:120});
const scaledSpecCache=new Map();
function tuneValues(value='sedan') {const v=specOf(value);return Object.fromEntries(TUNE_FIELDS.map(f=>[f.key,Number((v[f.key]*f.scale).toFixed(8))]));}
function tunedSpec(id='sedan',values={}) {
 if(!Object.hasOwn(CARS,id))throw Error('Unknown car class.');
 const v={...CARS[id]};
 for(const f of TUNE_FIELDS){if(values[f.key]===undefined)continue;const x=values[f.key];if(typeof x!=='number'||!Number.isFinite(x)||x<f.min-1e-8||x>f.max+1e-8)throw Error(f.label+' must be between '+f.min+' and '+f.max+' '+f.unit+'.');v[f.key]=x/f.scale;}
 const same=TUNE_FIELDS.every(f=>Math.abs(v[f.key]-CARS[id][f.key])<1e-8);return same?CARS[id]:Object.freeze(v);
}
function specKey(value) {const v=specOf(value);return v.id+':'+TUNE_FIELDS.map(f=>v[f.key].toPrecision(10)).join(',');}
function scaledSpec(value,percent=100) {
 const base=specOf(value);if(!Number.isFinite(percent)||percent<50||percent>200)throw Error('AI performance must be 50–200%.');
 if(percent===100)return base;
 const key=specKey(base)+'@'+percent;if(scaledSpecCache.has(key))return scaledSpecCache.get(key);
 const f=percent/100,v={...base};
 // A visible, intentional arcade handicap, not rubber-banding. Geometry is fixed.
 for(const k of ['maxSpeed','reverseSpeed','acceleration','braking','grip','aeroGrip','steerAngle','steerResponse','steerReturn','yawResponse'])v[k]=base[k]*f;
 for(const k of ['steerSpeedFade','drag','rolling'])v[k]=base[k]/f;
 v.performancePercent=percent;Object.freeze(v);
 if(scaledSpecCache.size>256)scaledSpecCache.clear();scaledSpecCache.set(key,v);return v;
}

const DAMAGE_KEYS=Object.freeze(['maxSpeed','reverseSpeed','acceleration','braking','grip','aeroGrip','steerAngle','steerResponse','steerReturn','yawResponse']);
function damageFactor(damage=0){return 1-clamp(Number(damage)||0,0,100)*.005;}
function damagedSpec(value,damage=0){
 const base=specOf(value),f=damageFactor(damage);if(f===1)return base;
 const v={...base};for(const k of DAMAGE_KEYS)v[k]=base[k]*f;
 // These are adverse coefficients: more resistance / attenuation means WORSE performance.
 // Dimensions, wheelbase, mass proxy and rule-based runoff caps never change.
 for(const k of ['drag','rolling','steerSpeedFade'])v[k]=base[k]/f;
 v.damage=clamp(damage,0,100);v.conditionFactor=f;return Object.freeze(v);
}
// Impact severity is calculated before subtracting any damage threshold. Small
// normal speeds are deliberately much less damaging than high-speed collisions.
const IMPACT_THRESHOLDS=Object.freeze({initiator:Object.freeze({front:5,left:10,right:10,rear:10}),receiver:Object.freeze({front:10,left:20,right:20,rear:20})});
function impactDamage(normalDeltaV){
 const v=Math.max(0,Number(normalDeltaV)||0);
 return clamp(.32*Math.pow(Math.max(0,v-.15),1.45)*clamp(v/12,.12,1),0,100);
}
function impactZone(car,nx,nz){
 const along=Math.sin(car.heading)*nx+Math.cos(car.heading)*nz;
 if(along>.58)return 'front';if(along<-.58)return 'rear';
 return Math.cos(car.heading)*nx-Math.sin(car.heading)*nz>=0?'right':'left';
}
function netImpactDamage(raw,role='initiator',zone='front'){
 const limit=IMPACT_THRESHOLDS[role]?.[zone];
 if(limit===undefined)throw Error('Invalid impact role or body zone.');
 return Math.max(0,Math.min(100,Number(raw)||0)-limit);
}
function recordImpact(car,normalDeltaV){
 if(normalDeltaV<.2)return;
 car.collisionRevision=(car.collisionRevision||0)+1;
 car.lastImpactSpeed=normalDeltaV;
}
function bounceImpulse(car,nx,nz,force,sign){
 const fx=Math.sin(car.heading),fz=Math.cos(car.heading),along=nx*fx+nz*fz,side=nx*fz-nz*fx;
 car.speed+=sign*force*along;
 car.bounceVX=clamp((car.bounceVX||0)+sign*force*(nx-along*fx),-12,12);
 car.bounceVZ=clamp((car.bounceVZ||0)+sign*force*(nz-along*fz),-12,12);
 car.impactYaw=clamp((car.impactYaw||0)+sign*side*force*.025,-.7,.7);
}

function applyDamage(c,amount,reason='Impact',other=null,normalDeltaV=0,metadata={}){
 if(!Number.isFinite(amount)||amount<=0)return 0;
 c.intactSpec??=c.spec||CAR;const old=c.damage||0;c.damage=clamp(old+amount,0,100);const added=c.damage-old;
 if(added<=0)return 0;
 c.spec=damagedSpec(c.intactSpec,c.damage);c.conditionFactor=damageFactor(c.damage);
 c.speed=clamp(c.speed,-c.spec.reverseSpeed,c.spec.maxSpeed);enforceSpeedLimit(c);
 c.lapInvalid=true;c.avoidance=Math.max(c.avoidance||0,2.5);c.damageRevision=(c.damageRevision||0)+1;
 const zone=['front','left','right','rear'].includes(metadata.zone)?metadata.zone:'front';
 c.damageZones??={front:0,left:0,right:0,rear:0};c.damageZones[zone]=(c.damageZones[zone]||0)+added;
 c.incidents.push({time:c.simTime,reason,damage:added,total:c.damage,normalDeltaV,other:other?.name||null,zone,role:metadata.role||'initiator',rawSeverity:metadata.rawSeverity??amount});
 if(c.incidents.length>100)c.incidents.shift();return added;
}

const steeringLimit=(speed,value=CAR)=>{const v=specOf(value);return Math.min(1.48,v.steerAngle/(1+Math.abs(speed)*v.steerSpeedFade));};
const gripAt=(value,speed,bank=0,sign=1)=>{const v=specOf(value);return Math.max(1,v.grip+v.aeroGrip*speed*speed+9.81*Math.sin(bank)*sign);};
const DIFFICULTY=Object.freeze({
 easy:Object.freeze({pace:.72,grip:.67,look:.70,reaction:.18,brake:.72,benchmark:1.20}),
 medium:Object.freeze({pace:.90,grip:.86,look:.50,reaction:.09,brake:.84,benchmark:1.08}),
 hard:Object.freeze({pace:1,grip:.98,look:.36,reaction:.035,brake:.94,benchmark:.98})
});
const SURFACES=Object.freeze({asphalt:Object.freeze({grip:.86,drag:.7}),gravel:Object.freeze({grip:.56,drag:3.4}),grass:Object.freeze({grip:.43,drag:2.3})});
const seg=(type,length=200,radius=60,turn=90,grade=0,bank=0,width=16)=>({type,length,radius,angle:turn,grade,bank,width,runoffLeft:20,runoffRight:20,runoffSurface:'grass'});
function preset(which='dockside') {
 let segments, name;
 if(which==='oval') {
  name='Velocity Oval'; segments=[seg('straight',320),seg('right',0,100,180,0,9),seg('straight',320),seg('right',0,100,180,0,9)];
 } else if(which==='technical') {
  name='Switchback Works'; segments=[seg('straight',220),seg('right',0,45,90,0,5),seg('straight',65),seg('left',0,38,90,0,-5),seg('straight',100),seg('right',0,60,180,0,7),seg('straight',100),seg('left',0,38,90,0,-5),seg('straight',65),seg('right',0,45,90,0,5),seg('straight',220),seg('right',0,60,180,0,7)];
 } else if(which==='highland') {
  name='Summit Ring'; segments=[seg('straight',300,60,90,4),seg('right',0,85,90,2,7),seg('straight',180,60,90,-2),seg('right',0,85,90,-2,7),seg('straight',300,60,90,-4),seg('right',0,85,90,2,7),seg('straight',180,60,90,2),seg('right',0,85,90,-2,7)];
 } else {
  name='Dockside Circuit'; segments=[seg('straight',260),seg('right',0,62,90,0,5),seg('straight',130,60,90,4),seg('right',0,62,90,0,5),seg('straight',260),seg('right',0,62,90,0,5),seg('straight',130,60,90,-4),seg('right',0,62,90,0,5)];
 }
 return {version:1,name,direction:1,width:16,segments};
}

function validateKerbs(input){
 if(!input||input.version!==1||!Array.isArray(input.zones)||input.zones.length>1000)throw Error('Kerb maps require version 1 and at most 1,000 zones.');
 const zones=input.zones.map((z,i)=>{
  if(!z||!Number.isFinite(z.start)||!Number.isFinite(z.end)||z.start<0||z.start>=1||z.end<=z.start||z.end>1||![-1,1].includes(z.side))throw Error('Invalid kerb span '+(i+1)+'. Use forward fractions 0–1 and side -1 or +1.');
  const width=z.width??.85;if(!Number.isFinite(width)||width<.2||width>3)throw Error('Kerb width must be 0.2–3 m.');
  return {start:z.start,end:z.end,side:z.side,width,color:['redwhite','bluewhite','blackwhite','redyellow'].includes(z.color)?z.color:'redwhite',evidence:String(z.evidence||'User edited').slice(0,160),label:String(z.label||'').slice(0,80)};
 });return {version:1,status:String(input.status||'Custom map').slice(0,200),zones};
}

function validateConfig(input) {
 if(input?.version===2)return validateMappedConfig(input);
 if(!input || typeof input!=='object' || input.version!==1 || !Array.isArray(input.segments)) throw Error('This is not an Apex Foundry v1 track file.');
 if(input.segments.length<2 || input.segments.length>64) throw Error('A circuit must contain 2–64 sections.');
 const out={version:1,name:String(input.name||'Untitled Circuit').slice(0,56),direction:input.direction===-1?-1:1,width:16,segments:[]};
 for(const [i,s] of input.segments.entries()) {
  if(!['straight','left','right'].includes(s.type)) throw Error('Invalid section type at section '+(i+1));
  const clean={type:s.type};
  for(const [key,min,max,def] of [['length',15,3000,200],['radius',16,1500,60],['angle',5,180,90],['grade',-15,15,0],['bank',-18,18,0],['width',6,30,16],['runoffLeft',0,100,20],['runoffRight',0,100,20]]) {
   const v=s[key]===undefined?def:Number(s[key]);
   if(!Number.isFinite(v)||v<min||v>max) {
    // Corner length is derived from its angle and radius, not its stored length.
    if(key==='length' && s.type!=='straight') {clean[key]=200;continue;}
    throw Error('Section '+(i+1)+': '+key+' must be between '+min+' and '+max+'.');
   }
   clean[key]=v;
  }
  clean.runoffSurface=s.runoffSurface===undefined?'grass':s.runoffSurface;
  if(!SURFACES[clean.runoffSurface])throw Error('Section '+(i+1)+': invalid runoff surface.');
  out.segments.push(clean);
 }
 out.width=out.segments[0].width;
 if(input.kerbs!==undefined)out.kerbs=validateKerbs(input.kerbs);return out;
}
const segmentLength=s=>(s.type==='straight'||s.type==='mapped')?s.length:s.radius*s.angle*DEG;
function buildTrack(config) {
 if(config.version===2&&config.geometry==='mapped')return buildMappedTrack(config);
 let points=[], x=0,z=0,y=0,h=0,bank=config.segments.at(-1).bank*DEG,width=config.segments.at(-1).width;
 let runoffLeft=config.segments.at(-1).runoffLeft??20,runoffRight=config.segments.at(-1).runoffRight??20;
 let authoredLength=0, sections=[];
 for(let k=0;k<config.segments.length;k++) {
  const s=config.segments[k],length=segmentLength(s),n=Math.max(4,Math.ceil(length/3));
  const delta=s.type==='straight'?0:(s.type==='right'?1:-1)*s.angle*DEG;
  const start={x,z,y,h,bank,width},rise=length*s.grade/100;
  sections.push({start:points.length,length,seg:k});
  for(let j=0;j<n;j++) {
   const t=j/n, a=h+delta*t;
   let px,pz;
   if(!delta) {px=x+Math.sin(h)*length*t;pz=z+Math.cos(h)*length*t;}
   else {const r=length/delta;px=x+r*(Math.cos(h)-Math.cos(a));pz=z+r*(Math.sin(a)-Math.sin(h));}
   const blend=smooth(Math.min(1,t*length/Math.min(28,length*.45)));
   points.push({x:px,z:pz,y:y+rise*smooth(t),h:a,bank:lerp(bank,s.bank*DEG,blend),width:lerp(width,s.width,blend),runoffLeft:lerp(runoffLeft,s.runoffLeft??20,blend),runoffRight:lerp(runoffRight,s.runoffRight??20,blend),runoffSurface:s.runoffSurface||'grass',seg:k});
  }
  if(!delta){x+=Math.sin(h)*length;z+=Math.cos(h)*length;}
  else{const r=length/delta;x+=r*(Math.cos(h)-Math.cos(h+delta));z+=r*(Math.sin(h+delta)-Math.sin(h));}
  y+=rise;h+=delta;bank=s.bank*DEG;width=s.width; authoredLength+=length;runoffLeft=s.runoffLeft??20;runoffRight=s.runoffRight??20;
 }
 const closeDistance=Math.hypot(x,z), headingMismatch=Math.abs(angle(h));
 let closure=false, closureLength=0;
 if(closeDistance>.2 || headingMismatch>.01 || Math.abs(y)>.03) {
  closure=true;
  const handle=clamp(closeDistance*.52,40,900);
  // A cubic Bezier connects both endpoint tangents. Altitude and camber
  // blend smoothly; there is no vertical snap at the start/finish seam.
  const p0={x,z},p1={x:x+Math.sin(h)*handle,z:z+Math.cos(h)*handle};
  const p2={x:0,z:-handle},p3={x:0,z:0};
  const estimate=closeDistance+2*handle, n=Math.max(24,Math.ceil(estimate/2.5));
  for(let j=0;j<n;j++) {
   const t=j/n,u=1-t;
   const px=u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x;
   const pz=u*u*u*p0.z+3*u*u*t*p1.z+3*u*t*t*p2.z;
   const dx=3*u*u*(p1.x-p0.x)+6*u*t*(p2.x-p1.x)+3*t*t*(p3.x-p2.x);
   const dz=3*u*u*(p1.z-p0.z)+6*u*t*(p2.z-p1.z)+3*t*t*(p3.z-p2.z);
   points.push({x:px,z:pz,y:lerp(y,0,smooth(t)),h:Math.atan2(dx,dz),bank:lerp(bank,points[0].bank,smooth(t)),width:lerp(width,points[0].width,smooth(t)),runoffLeft:lerp(runoffLeft,points[0].runoffLeft,smooth(t)),runoffRight:lerp(runoffRight,points[0].runoffRight,smooth(t)),runoffSurface:config.segments.at(-1).runoffSurface||'grass',seg:-1});
  }
 }
 return finalizeTrack(config,points,sections,closure,authoredLength);
}
function finalizeTrack(config,points,sections,closure,authoredLength) {
 let closureLength=0;
 // Stable authored-distance coordinates keep a kerb map attached to physical
 // geometry when direction is reversed. Never infer kerb position from lap timing.
 let authoredS=0;for(let i=0;i<points.length;i++){points[i].kerbU=authoredS;const q=points[(i+1)%points.length];authoredS+=Math.hypot(q.x-points[i].x,q.z-points[i].z,q.y-points[i].y);}for(const p of points)p.kerbU/=Math.max(1,authoredS);
 // Reverse the sampled course, including camber sign; geometry remains identical.
 if(config.direction===-1) {
  points=points.reverse().map(p=>({...p,h:angle(p.h+PI),bank:-p.bank,runoffLeft:p.runoffRight,runoffRight:p.runoffLeft}));
 }
 let total=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,minY=Infinity,maxY=-Infinity,maxGrade=0,maxK=0;
 for(let i=0;i<points.length;i++) {
  const p=points[i],q=points[(i+1)%points.length];
  p.s=total;p.ds=Math.hypot(q.x-p.x,q.z-p.z,q.y-p.y);total+=p.ds;
  p.slope=(q.y-p.y)/Math.max(Math.hypot(q.x-p.x,q.z-p.z),.001);
  p.k=angle(q.h-p.h)/Math.max(p.ds,.001);
  if(p.seg===-1)closureLength+=p.ds;
  minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
  maxGrade=Math.max(maxGrade,Math.abs(p.slope));maxK=Math.max(maxK,Math.abs(p.k));
 }
 const forwardStart=config.geometry==='mapped'?0:Math.min(90,segmentLength(config.segments[0])*.68);
 const startS=config.direction===-1?wrap(total-points.at(-1).ds-forwardStart,total):forwardStart;
 const track={points,length:total,sections,closure,closureLength,authoredLength,bounds:{minX,maxX,minZ,maxZ,minY,maxY},maxGrade,maxK,config,startS};
 track.viewBounds={...track.bounds};
 for(const p of points)for(const side of [-1,1]){const o=side*(p.width/2+(side>0?p.runoffRight:p.runoffLeft)+1.5),x=p.x+Math.cos(p.h)*o,z=p.z-Math.sin(p.h)*o,y=p.y-o*Math.tan(p.bank),b=track.viewBounds;b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);b.minZ=Math.min(b.minZ,z);b.maxZ=Math.max(b.maxZ,z);b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);}
 track.sample=s=>sample(track,s);
 track.nearest=(x,z,idx=null)=>nearest(track,x,z,idx);
 track.warnings=[];
 if(closure)track.warnings.push('A '+Math.round(closureLength)+' m automatic connector closes the circuit. Inspect its shape before racing.');
 if(maxGrade>.22)track.warnings.push(config.geometry==='mapped'?'A mapped or edited section has a steep gradient. Inspect its height transitions before racing.':'The closing section has a steep gradient. Balance the section elevation changes for a smoother circuit.');
 if(maxK>.09)track.warnings.push(config.geometry==='mapped'?'A tight mapped bend needs low entry speed. Road and inside runoff widths remain adjustable.':'A very tight bend was detected. Increase its radius or revise the automatic connector.');
 // Flag crossings at similar elevation for optional review; grade-separated overpasses are permitted.
 let crossing=false; const stride=Math.max(2,Math.floor(points.length/550));
 for(let i=0;i<points.length&&!crossing;i+=stride) {
  const a=points[i],b=points[(i+stride)%points.length];
  for(let j=i+stride*3;j<points.length-stride*2;j+=stride) {
   const c=points[j],d=points[(j+stride)%points.length];
   if(Math.abs(a.y-c.y)>5)continue;
   const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
   const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=cross(rx,rz,sx,sz);
   if(Math.abs(den)<.001)continue;
   const t=cross(c.x-a.x,c.z-a.z,sx,sz)/den,u=cross(c.x-a.x,c.z-a.z,rx,rz)/den;
   if(t>.015&&t<.985&&u>.015&&u<.985){crossing=true;break;}
  }
 }
 track.crossing=crossing;
 track.runoffFolded=points.some(p=>Math.abs(p.k)*(p.width/2+(p.k>0?p.runoffRight:p.runoffLeft)+1.5)>.98);
 if(track.runoffFolded)track.warnings.push('An inner runoff overlaps a tight bend. Reduce its inside width for a cleaner surface; racing remains available.');
 track.folded=points.some(p=>Math.abs(p.k)*(p.width/2+(config.geometry==='mapped'?.62:1.5))>.98);
 // Legacy diagnostic flag: this identifies risky geometry, not a hard race lock.
 track.invalid=crossing||track.folded;
 if(track.folded)track.warnings.push('A bend folds the road into itself. You can increase its radius, balance opposing sections, or accept the layout and race as it is.');
 if(crossing)track.warnings.push('Sections cross at road level. You can reroute them or accept the layout and race as it is. Crossing routes are not handled as dedicated junctions.');
 return track;
}
// Version 2: a portable, closed geographic centerline with editable surface zones.
// Zone numbers are NOT official corner numbers. All point arrays use [east,north,height,bankDegrees].
function validateMappedConfig(input) {
 if(input.geometry!=='mapped'||!Array.isArray(input.path)||input.path.length<40||input.path.length>12000)throw Error('Mapped tracks require 40–12,000 valid centerline points.');
 const path=input.path.map((p,i)=>{
  if(!Array.isArray(p)||p.length!==4||p.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid centerline point '+(i+1)+'.');
  if(Math.abs(p[0])>50000||Math.abs(p[1])>50000||Math.abs(p[2])>3000||Math.abs(p[3])>35)throw Error('Mapped coordinate outside supported limits.');
  return p.slice();
 });
 let len=0;
 for(let i=0;i<path.length;i++){const p=path[i],q=path[(i+1)%path.length],ds=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);if(ds<.02||ds>50)throw Error('Mapped samples must be spaced 0.02–50 m apart.');len+=ds;}
 if(len<300||len>25000)throw Error('Mapped circuits must be 300–25,000 m long.');
 if(!Array.isArray(input.segments)||input.segments.length<2||input.segments.length>64)throw Error('Mapped circuits require 2–64 surface zones.');
 const segments=input.segments.map((s,i)=>{
  if(s.type!=='mapped')throw Error('A mapped layout cannot mix curve primitives with mapped zones.');
  const out={type:'mapped',length:len/input.segments.length,radius:60,angle:90,grade:0};
  for(const [key,min,max,def]of[['width',6,30,12],['bank',-18,18,0],['elevation',-250,250,0],['runoffLeft',0,100,20],['runoffRight',0,100,20]]){
   const v=s[key]===undefined?def:Number(s[key]);if(!Number.isFinite(v)||v<min||v>max)throw Error('Zone '+(i+1)+': '+key+' must be between '+min+' and '+max+'.');out[key]=v;
  }
  out.runoffSurface=s.runoffSurface||'grass';if(!SURFACES[out.runoffSurface])throw Error('Invalid mapped runoff surface.');return out;
 });
 const source={};
 if(input.source&&typeof input.source==='object'){
  for(const key of ['id','name','country','city','retrieved','source','geometrySource','widthEvidence','widthNote','elevationNote','runoffNote','layoutNote','raceDirection'])if(typeof input.source[key]==='string')source[key]=input.source[key].slice(0,1200);
  for(const key of ['length','corners','firstGP','nominalWidth'])if(Number.isFinite(input.source[key]))source[key]=clamp(input.source[key],0,25000);
  source.modified=!!input.source.modified;
 }
 return {version:2,geometry:'mapped',name:String(input.name||'Mapped Circuit').slice(0,56),direction:input.direction===-1?-1:1,width:segments[0].width,path,segments,source,...(input.kerbs!==undefined?{kerbs:validateKerbs(input.kerbs)}:{})};
}
function buildMappedTrack(config) {
 const src=config.path,N=src.length,Z=config.segments.length,points=[],sections=[];
 const baseLength=src.reduce((sum,p,i)=>{const q=src[(i+1)%N];return sum+Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);},0);
 for(let i=0;i<N;i++){
  const pos=i/N*Z,k=Math.floor(pos),t=pos-k,seg=config.segments[k],prev=config.segments[(k+Z-1)%Z],p=src[i],a=src[(i+N-1)%N],b=src[(i+1)%N];
  if(i===0||Math.floor((i-1)/N*Z)!==k)sections.push({start:i,length:baseLength/Z,seg:k});
  const transition=smooth(Math.min(1,t*baseLength/Z/Math.min(22,baseLength/Z*.4)));
  points.push({x:p[0],z:p[1],y:p[2]+lerp(prev.elevation||0,seg.elevation||0,smooth(t)),h:Math.atan2(b[0]-a[0],b[1]-a[1]),bank:clamp(p[3]+lerp(prev.bank,seg.bank,transition),-35,35)*DEG,width:lerp(prev.width,seg.width,transition),runoffLeft:lerp(prev.runoffLeft,seg.runoffLeft,transition),runoffRight:lerp(prev.runoffRight,seg.runoffRight,transition),runoffSurface:seg.runoffSurface,seg:k});
 }
 return finalizeTrack(config,points,sections,false,baseLength);
}

function sample(track,s) {
 s=wrap(s,track.length);const arr=track.points;let lo=0,hi=arr.length-1;
 while(lo<hi){const m=Math.ceil((lo+hi)/2);if(arr[m].s<=s)lo=m;else hi=m-1;}
 const p=arr[lo],q=arr[(lo+1)%arr.length],t=clamp((s-p.s)/Math.max(p.ds,.001),0,1);
 return {x:lerp(p.x,q.x,t),z:lerp(p.z,q.z,t),y:lerp(p.y,q.y,t),h:p.h+angle(q.h-p.h)*t,bank:lerp(p.bank,q.bank,t),width:lerp(p.width,q.width,t),runoffLeft:lerp(p.runoffLeft,q.runoffLeft,t),runoffRight:lerp(p.runoffRight,q.runoffRight,t),runoffSurface:p.runoffSurface,k:p.k,slope:p.slope,idx:lo,s,seg:p.seg};
}
function nearest(track,x,z,hint=null,window=85) {
 const p=track.points,N=p.length;let best=Infinity,result=null;
 const range=hint===null?N:Math.min(N,window),start=hint===null?0:hint-Math.floor(range/2);
 for(let k=0;k<range;k++) {
  const i=wrap(start+k,N),a=p[i],b=p[(i+1)%N],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/Math.max(l2,.0001),0,1);
  const px=a.x+t*dx,pz=a.z+t*dz,dist=(x-px)**2+(z-pz)**2;
  if(dist<best){best=dist;const h=a.h+angle(b.h-a.h)*t;result={x:px,z:pz,y:lerp(a.y,b.y,t),h,bank:lerp(a.bank,b.bank,t),width:lerp(a.width,b.width,t),runoffLeft:lerp(a.runoffLeft,b.runoffLeft,t),runoffRight:lerp(a.runoffRight,b.runoffRight,t),runoffSurface:a.runoffSurface,s:wrap(a.s+a.ds*t,track.length),slope:a.slope,k:a.k,idx:i,offset:(x-px)*Math.cos(h)-(z-pz)*Math.sin(h),distance:Math.sqrt(dist)};}
 }
 return result;
}
// Track-limit rules apply identically to human and AI cars. Tyre contact, not
// the body or centre point, decides whether the car is outside the main road.
const LIMIT_RULES=Object.freeze({grace:1,speedKmh:80,returnSeconds:2});
function limitRules(value={}) {
 const read=(key,lo,hi)=>Number.isFinite(Number(value?.[key]))?clamp(Number(value[key]),lo,hi):LIMIT_RULES[key];
 return Object.freeze({grace:read('grace',.1,10),speedKmh:read('speedKmh',20,160),returnSeconds:read('returnSeconds',0,20)});
}
function wheelStatus(c,track,road=c.road) {
 const v=c.spec||CAR,half=v.wheelHalfTrack,axle=v.wheelHalfBase;
 let outside=0;const wheels=[];
 const pitch=Math.atan(road.slope*Math.cos(angle(c.heading-road.h))),bank=road.bank*Math.cos(angle(c.heading-road.h));
 const sh=Math.sin(c.heading),ch=Math.cos(c.heading),sp=Math.sin(pitch),cp=Math.cos(pitch),sb=Math.sin(bank),cb=Math.cos(bank);
 // Same yaw/pitch/bank basis as the rendered car, projected onto the road.
 const fx=sh*cp,fz=ch*cp,rx=ch*cb+sp*sh*sb,rz=-sh*cb+sp*ch*sb;
 for(const front of [-1,1])for(const side of [-1,1]){
  const x=c.x+rx*side*half+fx*front*axle;
  const z=c.z+rz*side*half+fz*front*axle;
  const window=clamp(9+2*Math.ceil(axle/Math.max(.1,track.points[road.idx].ds)),13,85);
  const p=nearest(track,x,z,road.idx,window),tireAngle=front>0?c.steer*steeringLimit(c.speed,v):0,cs=Math.cos(tireAngle),sn=Math.sin(tireAngle),nx=Math.cos(p.h),nz=-Math.sin(p.h);
  // The finite contact patch includes the tread edge. Touching the track edge
  // remains legal; tyre tread and contact length follow the car's bank and pitch.
  const extent=Math.abs((rx*cs-fx*sn)*nx+(rz*cs-fz*sn)*nz)*v.tyreHalfWidth+Math.abs((fx*cs+rx*sn)*nx+(fz*cs+rz*sn)*nz)*.10;
  const off=Math.abs(p.offset)-extent>p.width/2+1e-5;if(off)outside++;
  wheels.push({x,z,offset:p.offset,extent,off});
 }
 return {outside,allOutside:outside===4,wheels};
}
function enforceSpeedLimit(c){
 if(c.runoffLatched||c.limitRemaining>1e-8){const cap=c.trackLimitRules.speedKmh/3.6;c.speed=clamp(c.speed,-Math.min(cap,c.spec.reverseSpeed),cap);}
}
function updateTrackLimits(c,track,dt,status=null){
 const w=status||wheelStatus(c,track);c.wheelsOutside=w.outside;c.offTrack=w.allOutside;c.onRunoff=w.outside>0;
 const rules=c.trackLimitRules;
 if(c.offTrack){
  c.lapInvalid=true;c.offTrackTime+=dt;
  if(c.offTrackTime>rules.grace+1e-8&&!c.runoffLatched){
   c.runoffLatched=true;c.limitIncidents++;
   c.limitEvents.push({time:c.simTime,reason:'Four wheels outside',speedKmh:rules.speedKmh,returnSeconds:rules.returnSeconds});
   if(c.limitEvents.length>100)c.limitEvents.shift();
  }
  // Re-entering runoff never serves the remaining on-track penalty.
 }else{
  c.offTrackTime=0;
  if(c.runoffLatched){c.runoffLatched=false;c.limitRemaining=Math.max(c.limitRemaining,rules.returnSeconds);}
  else c.limitRemaining=Math.max(0,c.limitRemaining-dt);
 }
 enforceSpeedLimit(c);return w;
}
function hash32(n){n=(n^n>>>16)>>>0;n=Math.imul(n,0x7feb352d);n=(n^n>>>15)>>>0;n=Math.imul(n,0x846ca68b);return (n^n>>>16)>>>0;}
function configureGrid(track,cars,{spacing=15,stagger=.12,seed=1}={}){
 spacing=clamp(Number(spacing)||15,10,30);stagger=clamp(Number(stagger)||0,0,.5);
 // Use single file if ANY of the occupied grid is narrow, not just pole position.
 let width=Infinity;for(let d=0;d<=cars.length*spacing;d+=5)width=Math.min(width,sample(track,track.startS-12-d).width);
 const single=cars.length===1||width<9.5;
 for(const c of cars){const g=c.grid,row=single?g:Math.floor(g/2),relative=-12-row*spacing-(single?0:(g%2)*spacing*.34),p=sample(track,track.startS+relative);
  const offset=single?0:(g%2?1:-1)*Math.min(2.65,p.width/2-c.spec.wheelHalfTrack-c.spec.tyreHalfWidth-.55);
  Object.assign(c,{x:p.x+Math.cos(p.h)*offset,z:p.z-Math.sin(p.h)*offset,y:p.y-offset*Math.tan(p.bank),heading:p.h,road:{...p,offset},idx:p.idx,progress:relative,previousS:p.s,gridOffset:offset,aiLane:offset,gridSingleFile:single,
   launchDelay:c.isPlayer?row*stagger:.12+(hash32(seed+c.id*37)%1000)/1000*.24+row*stagger,
   aiSeed:hash32(seed+c.id*137),launchManaged:true});
 }
 return {singleFile:single,spacing,stagger};
}
function createCar(track,{id=0,name='Driver',color='#c4f464',difficulty='medium',grid=0,isPlayer=false,carClass='sedan',paceFactor=1,penaltySeconds=3,trackLimitRules=LIMIT_RULES,aiProfile=null,lookScale=1,aiSeed=0,variation=false,carSpec=null,performancePercent=100}={}) {
 const baseSpec=carSpec||specOf(carClass),spec=scaledSpec(baseSpec,isPlayer?100:performancePercent),row=Math.floor(grid/2),s=track.startS-9-row*9,p=sample(track,s),offset=(grid%2?1:-1)*Math.min(2.5,p.width*.20);
 return {id,name,color,difficulty,isPlayer,carClass:spec.id,spec,intactSpec:spec,damage:0,conditionFactor:1,damageRevision:0,damageZones:{front:0,left:0,right:0,rear:0},collisionRevision:0,lastImpactSpeed:0,bounceVX:0,bounceVZ:0,impactYaw:0,wallDamageAwarded:0,baseSpec,performancePercent:isPlayer?100:(performancePercent===100&&carSpec?.performancePercent?carSpec.performancePercent:performancePercent),paceFactor,penaltySeconds,x:p.x+Math.cos(p.h)*offset,z:p.z-Math.sin(p.h)*offset,y:p.y-offset*Math.tan(p.bank),heading:p.h,speed:0,steer:0,yaw:0,road:{...p,offset},idx:p.idx,progress:-9-row*9,previousS:p.s,lap:0,lapStart:0,lastLap:null,bestLap:null,lapTimes:[],validLapTimes:[],lapInvalid:false,finished:false,finishTime:0,colliding:0,aiClock:0,control:{throttle:0,brake:0,steer:0},grid,stuck:0,slipAngle:0,drifting:false,driftCharge:0,boost:0,penalty:0,contacts:0,wallContacts:0,incidents:[],simTime:0,contactPairs:new Map(),avoidance:0,offTrack:false,
  trackLimitRules:limitRules(trackLimitRules),wheelsOutside:0,offTrackTime:0,runoffLatched:false,limitRemaining:0,limitIncidents:0,limitEvents:[],aiProfile,lookScale,aiSeed,variation,aiLane:offset,launchDelay:0,launchManaged:false};
}
function stepCar(c,input,track,dt) {
 const v=c.spec||CAR;
 // Shared dynamics for every driver. Rally drift/charge/boost is removed.
 const p=nearest(track,c.x,c.z,c.idx);c.road=p;c.idx=p.idx;c.simTime+=dt;
 if(c.launchManaged&&c.simTime<c.launchDelay)input={throttle:0,brake:1,steer:input.steer||0};
 const throttle=clamp(input.throttle||0,-1,1),brake=clamp(input.brake||0,0,1),steer=clamp(input.steer||0,-1,1);
 c.steer=lerp(c.steer,steer,1-Math.exp(-(steer===0?v.steerReturn:v.steerResponse)*dt));
 const tyres=wheelStatus(c,track,p),fraction=tyres.outside/4,surface=fraction?(SURFACES[p.runoffSurface]||SURFACES.asphalt):null;
 c.slipAngle=0;c.drifting=false;c.driftCharge=0;c.boost=0;
 const oldSpeed=c.speed,direction=c.speed>=0?1:-1;
 let acceleration=throttle*v.acceleration*(1-.30*clamp(Math.abs(c.speed)/v.maxSpeed,0,1));
 acceleration-=direction*(v.rolling+v.drag*c.speed*c.speed+(surface?surface.drag*fraction:0));
 acceleration-=9.81*Math.sin(Math.atan(p.slope))*Math.cos(angle(c.heading-p.h));
 if(brake>0){const b=brake*v.braking*(1-fraction*.18)*dt;if(Math.abs(c.speed)<b)c.speed=0;else c.speed-=direction*b;}
 c.speed+=acceleration*dt;if(!throttle&&Math.abs(c.speed)<.12)c.speed=0;
 c.speed=clamp(c.speed,-v.reverseSpeed,v.maxSpeed);enforceSpeedLimit(c);
 c.wheelTravel=(c.wheelTravel||0)+c.speed*dt;c.control={throttle,brake,steer};
 const delta=c.steer*steeringLimit(c.speed,v);
 let requested=c.speed/v.wheelbase*Math.tan(delta);
 const grip=gripAt(v,c.speed,p.bank,Math.sign(requested||1))*(surface?lerp(1,surface.grip,fraction):1),maxYaw=grip/Math.max(Math.abs(c.speed),4);
 // Acoustic slip cues are based on demanded grip rather than key presses alone.
 c.tyreScrub=clamp((Math.abs(requested)-maxYaw*.70)/Math.max(.01,maxYaw*.8),0,1);
 const lateralDemand=Math.min(grip,Math.abs(requested*c.speed)),longitudinalBudget=Math.sqrt(Math.max(0,grip*grip-lateralDemand*lateralDemand));c.wheelspin=clamp((Math.max(0,throttle)*v.acceleration-longitudinalBudget*(surface?.55:.8))/Math.max(4,grip),0,1)*clamp(1-Math.abs(c.speed)/50,0,1);
 c.brakeStress=brake*clamp(Math.abs(c.speed)/14,0,1);c.accelerationActual=(c.speed-oldSpeed)/Math.max(.001,dt);
 requested=clamp(requested,-maxYaw,maxYaw);c.yaw=lerp(c.yaw,requested,1-Math.exp(-v.yawResponse*dt));
 // Collision response is an independent, short-lived lateral velocity and yaw
 // impulse: even a collision below the damage threshold deflects the car.
 c.heading=angle(c.heading+(c.yaw+(c.impactYaw||0))*dt);
 const horizontal=Math.cos(Math.atan(p.slope)),velocityHeading=c.heading;
 c.x+=(Math.sin(velocityHeading)*c.speed*horizontal+(c.bounceVX||0))*dt;
 c.z+=(Math.cos(velocityHeading)*c.speed*horizontal+(c.bounceVZ||0))*dt;
 const bounceDecay=Math.exp(-dt*4.5);
 c.bounceVX=(c.bounceVX||0)*bounceDecay;c.bounceVZ=(c.bounceVZ||0)*bounceDecay;
 c.impactYaw=(c.impactYaw||0)*Math.exp(-dt*5.2);
 let q=nearest(track,c.x,c.z,c.idx),side=Math.sign(q.offset)||1,runoff=side>0?q.runoffRight:q.runoffLeft,edge=q.width*.5+runoff+1.15-v.radius;
 const wall=Math.abs(q.offset)>edge;
 if(wall){const excess=Math.abs(q.offset)-edge;c.x-=Math.cos(q.h)*side*excess;c.z+=Math.sin(q.h)*side*excess;
  const outward=Math.sin(angle(velocityHeading-q.h))*side*Math.sign(c.speed||1);
  if(outward>0){c.speed*=Math.max(.50,1-outward*dt*5);c.heading=angle(c.heading-angle(c.heading-q.h)*Math.min(1,dt*3.2));c.colliding=.15;c.lapInvalid=true;}
  const wallNX=Math.cos(q.h)*side,wallNZ=-Math.sin(q.h)*side;
  const normalDeltaV=Math.max(0,oldSpeed*(Math.sin(velocityHeading)*wallNX+Math.cos(velocityHeading)*wallNZ)+(c.bounceVX||0)*wallNX+(c.bounceVZ||0)*wallNZ);
  if(normalDeltaV>.15&&(!c.wallActive||normalDeltaV>(c.wallImpactPeak||0)+1.5)){
   const zone=impactZone(c,wallNX,wallNZ),raw=impactDamage(normalDeltaV);
   const totalAward=netImpactDamage(raw,'initiator',zone);
   const incremental=Math.max(0,totalAward-(c.wallDamageAwarded||0));
   if(!c.wallActive)c.wallContacts++;
   applyDamage(c,incremental,c.wallActive?'Stronger barrier impact':'Barrier impact',null,normalDeltaV,{zone,role:'initiator',rawSeverity:raw});
   c.wallDamageAwarded=Math.max(c.wallDamageAwarded||0,totalAward);c.wallImpactPeak=normalDeltaV;
   recordImpact(c,normalDeltaV);
   c.bounceVX=clamp((c.bounceVX||0)-wallNX*Math.min(5.5,normalDeltaV*.23),-12,12);
   c.bounceVZ=clamp((c.bounceVZ||0)-wallNZ*Math.min(5.5,normalDeltaV*.23),-12,12);
   c.impactYaw=clamp((c.impactYaw||0)-side*Math.min(.38,normalDeltaV*.012),-.7,.7);
  }
  if(normalDeltaV>.15)c.lapInvalid=true;
  c.wallActive=true;c.wallFree=0;q=nearest(track,c.x,c.z,q.idx);
 }else{c.wallFree=(c.wallFree||0)+dt;if(c.wallFree>.3){c.wallActive=false;c.wallImpactPeak=0;c.wallDamageAwarded=0;}}
 c.y=q.y-q.offset*Math.tan(q.bank);c.road=q;c.idx=q.idx;updateTrackLimits(c,track,dt);
 let ds=q.s-c.previousS;if(ds>track.length/2)ds-=track.length;if(ds<-track.length/2)ds+=track.length;
 if(Math.abs(ds)<Math.max(6,Math.abs(c.speed)*dt*3))c.progress+=ds;
 c.previousS=q.s;c.colliding=Math.max(0,c.colliding-dt);c.avoidance=Math.max(0,c.avoidance-dt);
}
function speedPlan(track,value=CAR,difficulty='hard') {
 const v=specOf(value),d=DIFFICULTY[difficulty]||DIFFICULTY.medium,key=specKey(v)+':'+difficulty;
 track.pacePlans??=new Map();if(track.pacePlans.has(key))return track.pacePlans.get(key);
 const pts=track.points,n=pts.length,speeds=new Float64Array(n);
 for(let i=0;i<n;i++){const p=pts[i],k=Math.abs(p.k);const grip=gripAt(v,v.maxSpeed,p.bank,Math.sign(p.k));speeds[i]=Math.min(v.maxSpeed*d.pace,k>.0001?Math.sqrt(grip*d.grip/k):v.maxSpeed);}
 // Recompute aero grip at corner speed, then propagate braking over the closed loop.
 for(let pass=0;pass<3;pass++)for(let i=0;i<n;i++){const p=pts[i],k=Math.abs(p.k);if(k>.0001)speeds[i]=Math.min(speeds[i],Math.sqrt(gripAt(v,speeds[i],p.bank,Math.sign(p.k))*d.grip/k));}
 for(let pass=0;pass<3;pass++)for(let i=n-1;i>=0;i--)speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[(i+1)%n]**2+2*v.braking*d.brake*pts[i].ds));
 if(track.pacePlans.size>128)track.pacePlans.clear();track.pacePlans.set(key,speeds);return speeds;
}
function profileSample(profile,s){
 const n=profile.nodes.length,f=wrap(s-profile.startS,profile.length)/profile.length*n,i=Math.floor(f),t=f-i,a=profile.nodes[i],b=profile.nodes[(i+1)%n];
 return {offset:lerp(a.offset,b.offset,t),speed:lerp(a.speed,b.speed,t),acceleration:lerp(a.acceleration||0,b.acceleration||0,t),throttle:lerp(a.throttle||0,b.throttle||0,t),brake:lerp(a.brake||0,b.brake||0,t),steer:lerp(a.steer||0,b.steer||0,t),headingError:lerp(a.headingError||0,b.headingError||0,t)};
}
function drivingVariation(c,track){
 const lap=Math.max(0,c.lap);if(c.variantLap!==lap){const h=hash32(c.aiSeed+lap*104729);c.variantLap=lap;c.variant={phase:(h%65536)/65536*TAU,lane:((h>>>16)%1000/999-.5)*.38,speed:1+((hash32(h)%1000)/999-.5)*.009,brakeShift:((hash32(h+1)%1000)/999-.5)*1.4,response:.96+(hash32(h+2)%1000)/999*.08};}
 const v=c.variant,u=wrap(c.road.s-track.startS,track.length)/track.length;
 return {lane:v.lane*Math.sin(TAU*u*3+v.phase),speed:v.speed*(1+.002*Math.sin(TAU*u*7+v.phase)),brakeShift:v.brakeShift,response:v.response};
}
function aiControl(c,track,cars,dt) {
 const d=DIFFICULTY[c.difficulty]||DIFFICULTY.medium,v=c.spec||CAR;
 if(c.launchManaged&&c.simTime<c.launchDelay){c.control={throttle:0,brake:1,steer:0};c.aiClock=0;return c.control;}
 c.aiClock-=dt;if(c.aiClock>0)return c.control;c.aiClock=Math.min(d.reaction,c.aiProfile?.055:d.reaction);
 const p=c.road,speed=Math.max(0,c.speed),profile=c.aiProfile,variation=c.variation?drivingVariation(c,track):{lane:0,speed:1,brakeShift:0,response:1};
 const factor=clamp(c.paceFactor||1,.10,1.35)*variation.speed;
 const look=clamp((5+speed*(profile?.29:d.look))*(c.lookScale||1),7,(v.id==='f1'?38:29)*Math.max(1,Math.sqrt((c.performancePercent||100)/100)));
 const ref=profile?profileSample(profile,p.s+variation.brakeShift):null;
 const target=sample(track,p.s+look),aheadRef=profile?profileSample(profile,p.s+look):null;
 let targetSpeed=Math.min(v.maxSpeed,(ref?ref.speed:speedPlan(track,v,c.difficulty)[track.sample(p.s+2).idx])*factor);
 if((c.damage||0)>0)targetSpeed=Math.min(targetSpeed,speedPlan(track,v,c.difficulty)[track.sample(p.s+2).idx]);
 const limit=Math.max(0,Math.min(p.width,target.width)/2-v.wheelHalfTrack-v.tyreHalfWidth-.65);
 const desiredLane=clamp((aheadRef?.offset||0)+variation.lane,-limit,limit);
 let lane=desiredLane,nearestAhead=Infinity,blocker=null,alongside=false;
 const launchAge=c.simTime-(c.launchDelay||0),launch=c.launchManaged&&launchAge<7;
 // Keep the two grid lanes during the launch and blend only when a merge is clear.
 if(launch)lane=lerp(clamp(c.gridOffset||0,-limit,limit),desiredLane,smooth(clamp((launchAge-3)/4,0,1)));
 for(const other of cars){if(other===c||other.finished||Math.abs(other.y-c.y)>2.5)continue;
  let gap=wrap(other.road.s-p.s,track.length);if(gap>track.length/2)gap-=track.length;
  const sep=Math.abs((other.road.offset||0)-(p.offset||0)),relative=Math.max(0,speed-other.speed);
  const latVelocity=Math.sin(angle(other.heading-other.road.h))*other.speed;
  const projected=other.road.offset+latVelocity*.30;
  if(gap>0&&gap<Math.max(40,speed*1.35)&&Math.min(sep,Math.abs(projected-p.offset))<2.8&&gap<nearestAhead){nearestAhead=gap;blocker=other;}
  if(Math.abs(gap)<v.collisionHalfLength+other.spec.collisionHalfLength+5&&sep<5.2){
   alongside=true;const side=p.offset>=other.road.offset?1:-1;
   // Reserve the neighbour's occupied lane, rather than having both cars converge.
   lane=side>0?Math.max(lane,other.road.offset+2.65):Math.min(lane,other.road.offset-2.65);
   if(sep<2.6&&gap>0)targetSpeed=Math.min(targetSpeed,Math.max(0,other.speed-2));
  }
 }
 if(blocker){const options=[blocker.road.offset-3.2,blocker.road.offset+3.2].filter(x=>Math.abs(x)<=limit);
  const safe=options.filter(x=>cars.every(o=>{if(o===c||o===blocker||o.finished||Math.abs(o.y-c.y)>2.5)return true;let g=wrap(o.road.s-p.s,track.length);if(g>track.length/2)g-=track.length;return g < -14||g>45||Math.abs(o.road.offset-x)>3.0;}));
  if(safe.length&&nearestAhead>10&&!launch&&Math.abs(target.k)<.055){safe.sort((a,b)=>Math.abs(a-p.offset)-Math.abs(b-p.offset));lane=safe[0];}
  const closing=Math.max(0,speed-blocker.speed),body=v.collisionHalfLength+blocker.spec.collisionHalfLength+v.collisionRadius+blocker.spec.collisionRadius;
  const safeGap=body+2+speed*(launch?.55:.32)+closing*closing/(2*v.braking*.85);
  if(nearestAhead<safeGap&&Math.abs(p.offset-blocker.road.offset)<2.85)targetSpeed=Math.min(targetSpeed,Math.max(0,blocker.speed+(nearestAhead-safeGap)*1.5));
  if(nearestAhead<body+1&&Math.abs(p.offset-blocker.road.offset)<2.55)targetSpeed=0;
 }
 if(c.avoidance>0)targetSpeed*=.96;
 lane=clamp(lane,-limit,limit);
 if((launch||alongside||blocker)&&Math.abs(target.k)>.003){const radiusScale=Math.max(.4,1-target.k*lane);targetSpeed*=Math.min(1,Math.sqrt(radiusScale))*.97;}
 c.aiLane=lerp(c.aiLane||0,lane,1-Math.exp(-c.aiClock*(launch||alongside?2.6:4.8)));
 const tx=target.x+Math.cos(target.h)*c.aiLane,tz=target.z-Math.sin(target.h)*c.aiLane;
 const error=angle(Math.atan2(tx-c.x,tz-c.z)-c.heading),distance=Math.max(3,Math.hypot(tx-c.x,tz-c.z)),curvature=2*Math.sin(error)/distance;
 let steering=clamp(Math.atan(v.wheelbase*curvature)/steeringLimit(c.speed,v),-1,1);
 if(profile?.source==='qualifying telemetry'&&!blocker&&!alongside&&!launch){const recorded=ref.steer*steeringLimit(ref.speed,v)/steeringLimit(c.speed,v);steering=clamp(.94*steering+.06*recorded,-1,1);}
 if(Math.abs(error)>.8)targetSpeed=Math.min(targetSpeed,16);if(c.offTrack)targetSpeed=Math.min(targetSpeed,24);
 if(c.runoffLatched||c.limitRemaining>0)targetSpeed=Math.min(targetSpeed,c.trackLimitRules.speedKmh/3.6);
 const delta=targetSpeed-c.speed,resistance=v.rolling+v.drag*c.speed*c.speed+9.81*Math.sin(Math.atan(p.slope))*Math.cos(angle(c.heading-p.h));
 const available=Math.max(1,v.acceleration*(1-.30*clamp(speed/v.maxSpeed,0,1)));
 let throttle,brake;
 if(profile){
  // Distance-domain acceleration is learned from the reference speed trace.
  // Feed-forward follows its braking zones; feedback handles deviations/traffic.
  const inputFeed=ref.throttle*available-ref.brake*v.braking-resistance;
  const feed=(profile.source==='qualifying telemetry'?lerp(ref.acceleration,inputFeed,.22):ref.acceleration)*factor*factor;
  const demand=clamp(feed+(delta*4.0*variation.response),-v.braking,available)+resistance;
  throttle=demand>0?clamp(demand/available,0,1):0;brake=demand<0?clamp(-demand/v.braking,0,1):0;
 }else{const cruise=resistance/available;throttle=delta>-.18?clamp(cruise+delta/3.0,0,1):0;brake=delta<-.18?clamp(-delta/2.8,0,1):0;}
 if(launch)throttle=Math.min(throttle,clamp(.35+Math.max(0,launchAge)*1.2,.35,1));
 c.control={steer:steering,throttle,brake};return c.control;
}
function collisionFault(a,b,nx,nz) {
 // Rear-end impacts: following driver. Side contacts: lateral movement toward
 // the other car. A neutral/ambiguous squeeze is shared rather than blamed on AI alone.
 const headingDifference=Math.abs(angle(a.heading-b.heading));
 const dx=b.x-a.x,dz=b.z-a.z,along=dx*Math.sin(a.road.h)+dz*Math.cos(a.road.h),lateral=dx*Math.cos(a.road.h)-dz*Math.sin(a.road.h);
 if(headingDifference<.65&&Math.abs(along)>2.0&&Math.abs(lateral)<1.8){
  if(along>0&&a.speed>b.speed+.3)return [a];if(along<0&&b.speed>a.speed+.3)return [b];
 }
 const side=Math.sign(lateral)||1,latA=a.speed*Math.sin(angle(a.heading-(a.slipAngle||0)-a.road.h))*side,latB=-b.speed*Math.sin(angle(b.heading-(b.slipAngle||0)-b.road.h))*side;
 if(latA>Math.max(.6,latB+.7))return [a];if(latB>Math.max(.6,latA+.7))return [b];
 const va=a.speed*(Math.sin(a.heading)*nx+Math.cos(a.heading)*nz),vb=-b.speed*(Math.sin(b.heading)*nx+Math.cos(b.heading)*nz);
 if(headingDifference>1&&Math.abs(va-vb)>2)return va>vb?[a]:[b];return [a,b];
}
function collideCars(cars) {
 for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++) {
  const a=cars[i],b=cars[j],av=a.spec||CAR,bv=b.spec||CAR;if(a.finished||b.finished)continue;
  const distance=Math.hypot(a.x-b.x,a.z-b.z),range=av.collisionHalfLength+bv.collisionHalfLength+av.collisionRadius+bv.collisionRadius;
  if(Math.abs(a.y-b.y)>2.5||distance>range+.5){a.contactPairs?.delete(b);b.contactPairs?.delete(a);continue;}
  let deepest=0,nx=0,nz=0;
  for(const sa of [-1,1])for(const sb of [-1,1]){
   const dx=b.x+Math.sin(b.heading)*bv.collisionHalfLength*sb-a.x-Math.sin(a.heading)*av.collisionHalfLength*sa;
   const dz=b.z+Math.cos(b.heading)*bv.collisionHalfLength*sb-a.z-Math.cos(a.heading)*av.collisionHalfLength*sa;
   const d=Math.hypot(dx,dz),depth=av.collisionRadius+bv.collisionRadius-d;
   if(depth>deepest){deepest=depth;nx=d>.0001?dx/d:Math.cos(a.heading);nz=d>.0001?dz/d:-Math.sin(a.heading);}
  }
  if(deepest>0){
   const rel=(a.speed*Math.sin(a.heading)-b.speed*Math.sin(b.heading))*nx+(a.speed*Math.cos(a.heading)-b.speed*Math.cos(b.heading))*nz+(a.bounceVX||0)*nx+(a.bounceVZ||0)*nz-(b.bounceVX||0)*nx-(b.bounceVZ||0)*nz;
   const existing=a.contactPairs?.get(b),previousPeak=existing?.peak||0;
   let awardedA=existing?.awardedA||0,awardedB=existing?.awardedB||0,faultForEpisode=existing?.fault||null;
   if(rel>.3&&(!existing||rel>previousPeak+1.5)){
    const dv=rel*.5,raw=impactDamage(dv),fault=faultForEpisode||collisionFault(a,b,nx,nz).map(c=>c===a?'a':'b');faultForEpisode=fault;
    const roles=[fault.includes('a')?'initiator':'receiver',fault.includes('b')?'initiator':'receiver'];
    const zones=[impactZone(a,nx,nz),impactZone(b,-nx,-nz)];
    const netA=netImpactDamage(raw,roles[0],zones[0]),netB=netImpactDamage(raw,roles[1],zones[1]);
    a.contacts++;b.contacts++;
    applyDamage(a,Math.max(0,netA-awardedA),'Car-to-car impact',b,dv,{zone:zones[0],role:roles[0],rawSeverity:raw});
    applyDamage(b,Math.max(0,netB-awardedB),'Car-to-car impact',a,dv,{zone:zones[1],role:roles[1],rawSeverity:raw});
    awardedA=Math.max(netA,awardedA);awardedB=Math.max(netB,awardedB);
    a.lapInvalid=b.lapInvalid=true;recordImpact(a,dv);recordImpact(b,dv);
    // Velocity-normal restitution plus a damped lateral impulse changes the path.
    const impulse=Math.min(14,rel*.36);
    bounceImpulse(a,nx,nz,impulse,-1);bounceImpulse(b,nx,nz,impulse,1);
   }
   const episode={peak:Math.max(previousPeak,rel),time:Math.max(a.simTime,b.simTime),awardedA,awardedB,fault:faultForEpisode};a.contactPairs?.set(b,episode);b.contactPairs?.set(a,episode);
   const push=deepest*.5;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;
   a.colliding=b.colliding=.12;a.speed=clamp(a.speed,-a.spec.reverseSpeed,a.spec.maxSpeed);b.speed=clamp(b.speed,-b.spec.reverseSpeed,b.spec.maxSpeed);enforceSpeedLimit(a);enforceSpeedLimit(b);
  }else if(Math.max(a.simTime,b.simTime)-(a.contactPairs?.get(b)?.time||0)>.25){a.contactPairs?.delete(b);b.contactPairs?.delete(a);}
 }
}
function resetCar(c,track) {
 const p=sample(track,track.startS+c.progress);c.x=p.x;c.z=p.z;c.y=p.y;c.heading=p.h;c.speed=0;c.steer=0;c.yaw=0;c.bounceVX=0;c.bounceVZ=0;c.impactYaw=0;c.slipAngle=0;c.boost=0;c.drifting=false;c.driftCharge=0;c.idx=p.idx;c.previousS=p.s;c.road=p;c.lapInvalid=true;c.offTrackTime=0;c.offTrack=false;c.onRunoff=false;c.wheelsOutside=0;if(c.runoffLatched){c.runoffLatched=false;c.limitRemaining=Math.max(c.limitRemaining,c.trackLimitRules.returnSeconds);}c.control={throttle:0,brake:0,steer:0};
}
function updateTiming(c,track,time,laps) {
 const crossed=Math.floor(Math.max(0,c.progress)/track.length);
 if(!c.started&&c.progress>=0){c.started=true;c.lapStart=time;c.lapInvalid=!!c.offTrack;}
 if(crossed>c.lap&&!c.finished){const lapTime=time-c.lapStart,valid=!c.lapInvalid;c.lapTimes.push(lapTime);c.validLapTimes.push(valid);c.lastLap=lapTime;c.lastLapValid=valid;
  if(valid)c.bestLap=c.bestLap===null?lapTime:Math.min(c.bestLap,lapTime);c.lapStart=time;c.lap=crossed;c.lapInvalid=!!c.offTrack;
 }
 if(!c.finished&&c.progress>=track.length*laps){c.finished=true;c.finishTime=time;}
}
function classification(cars){return [...cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);}
function parseLapTime(text){if(typeof text==='number'){if(!Number.isFinite(text)||text<=0||text>7200)throw Error('Lap time must be greater than zero and at most 120 minutes.');return text;}const t=String(text).trim();if(!t)return null;let value;if(/^\d{1,3}:[0-5]\d(?:\.\d{1,3})?$/.test(t)){const [m,s]=t.split(':');value=Number(m)*60+Number(s);}else if(/^\d+(?:\.\d{1,3})?$/.test(t))value=Number(t);else throw Error('Use seconds (92.50) or minutes:seconds (1:32.50).');if(value<=0||value>7200)throw Error('Lap time must be greater than zero and at most 120 minutes.');return value;}
const api={validateKerbs,DAMAGE_KEYS,IMPACT_THRESHOLDS,damageFactor,damagedSpec,impactDamage,impactZone,netImpactDamage,applyDamage,TUNE_FIELDS,AI_PRESETS,tuneValues,tunedSpec,scaledSpec,specKey,PI,TAU,DEG,clamp,lerp,wrap,angle,smooth,CAR,CARS,SURFACES,specOf,gripAt,steeringLimit,DIFFICULTY,preset,validateConfig,segmentLength,buildTrack,sample,nearest,createCar,stepCar,aiControl,collideCars,collisionFault,resetCar,updateTiming,classification,speedPlan,parseLapTime,LIMIT_RULES,limitRules,wheelStatus,updateTrackLimits,enforceSpeedLimit,configureGrid,hash32,profileSample,drivingVariation};
root.AFCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
