/* Apex Foundry v6 — local lap telemetry, procedural driver profiles and measured
 * pace fitting. All runs use the normal car physics. No teleporting. Explicit AI stat multipliers are measured, never hidden. */
(function(root){
'use strict';
const C=root.AFCore||(typeof require!=='undefined'?require('./core.js'):null);
const FIELDS=['distance','time','x','y','z','speed','offset','headingError','throttle','brake','steer','acceleration','yawRate','bank','slope','wheelsOutside'];
function createRecorder(track,carClass){return {version:1,carClass,length:track.length,rate:20,fields:FIELDS.slice(),rows:[],startTime:null,lastTime:-1,lastSpeed:0,ticks:0,complete:false};}
function recordStep(r,c,track,time,dt){
 if(r.complete)return;
 const acceleration=(c.speed-r.lastSpeed)/dt;r.lastSpeed=c.speed;r.ticks++;
 if(c.progress<track.length)return;
 if(r.startTime===null)r.startTime=c.lapStart;
 const finished=c.progress>=2*track.length;
 if(!finished&&r.rows.length&&time-r.lastTime<1/r.rate-1e-7)return;
 const distance=C.clamp(c.progress-track.length,0,track.length),elapsed=Math.max(0,time-r.startTime),p=c.road,u=c.control;
 const row=[distance,elapsed,c.x,c.y,c.z,c.speed,p.offset,C.angle(c.heading-p.h),u.throttle||0,u.brake||0,u.steer||0,acceleration,c.yaw,p.bank,p.slope,c.wheelsOutside||0].map(n=>Math.round(n*10000)/10000);
 if(!r.rows.length){row[0]=0;row[1]=0;}
 if(!r.rows.length||distance>r.rows.at(-1)[0])r.rows.push(row);
 if(r.rows.length>24000){r.rows=r.rows.filter((_,i)=>i%2===0);r.rate=Math.max(1,r.rate/2);}
 r.lastTime=time;
 if(finished){r.complete=true;r.seconds=c.lastLap;r.clean=c.lastLapValid;}
}
function finalizeRecorder(r){
 if(!r||!r.complete||!r.clean||r.rows.length<20)return null;
 return {version:1,carClass:r.carClass,length:r.length,seconds:r.seconds,rate:r.rate,fields:FIELDS.slice(),rows:r.rows,summary:referenceSummary(r)};
}
function referenceSummary(ref){
 let zones=0,braking=false,peak=0,throttle=0;
 for(const a of ref.rows){const b=a[9]>.15;if(b&&!braking)zones++;braking=b;peak=Math.max(peak,a[5]*3.6);throttle+=a[8];}
 return {samples:ref.rows.length,brakingZones:zones,peakKmh:peak,meanThrottle:throttle/Math.max(1,ref.rows.length)};
}
function validateReference(value,track,carClass,referenceSpec=C.specOf(carClass)){
 if(!value||value.version!==1||value.carClass!==carClass||Math.abs(value.length-track.length)>.2||!Number.isFinite(value.seconds)||value.seconds<=0||value.seconds>7200||!Array.isArray(value.rows)||value.rows.length<20||value.rows.length>24000)throw Error('This telemetry does not match the selected car and layout.');
 let last=-1,lastTime=-1;
 for(const row of value.rows){if(!Array.isArray(row)||row.length!==FIELDS.length||row.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('Invalid telemetry sample.');
  if(row[0]<last||row[0]<0||row[0]>track.length+.2||row[1]<lastTime||row[1]>value.seconds+.1||row[5]<-1||row[5]>referenceSpec.maxSpeed+.1||Math.abs(row[6])>120||row[15]>=4)throw Error('Telemetry contains invalid distances, speed or track limits.');
  const p=track.sample(track.startS+row[0]);if(Math.hypot(row[2]-p.x,row[4]-p.z)>p.width/2+120)throw Error('Telemetry positions do not match this circuit.');last=row[0];lastTime=row[1];
 }
 if(value.rows[0][0]>2||last<track.length-2)throw Error('A complete clean flying lap is required.');
 return {version:1,carClass,length:value.length,seconds:value.seconds,rate:Number(value.rate)||20,fields:FIELDS.slice(),rows:value.rows.map(r=>r.slice()),summary:referenceSummary(value)};
}
function buildProfile(track,carClass,reference=null,options={}){
 const spec=options.spec||C.specOf(carClass),N=Math.max(80,Math.ceil(track.length/3.5)),ds=track.length/N,baseline=C.speedPlan(track,spec,'hard'),nodes=[];
 let cursor=0;
 for(let i=0;i<N;i++){
  const rel=i*ds,p=track.sample(track.startS+rel);let offset=0,speed=baseline[p.idx],throttle=0,brake=0,steer=0,headingError=0;
  if(reference){const rows=reference.rows;while(cursor<rows.length-2&&rows[cursor+1][0]<rel)cursor++;
   const a=rows[cursor],b=rows[Math.min(cursor+1,rows.length-1)],t=C.clamp((rel-a[0])/Math.max(.0001,b[0]-a[0]),0,1);
   offset=C.lerp(a[6],b[6],t);speed=C.lerp(a[5],b[5],t)*(options.referenceSpeedScale||1);throttle=C.lerp(a[8],b[8],t);brake=C.lerp(a[9],b[9],t);steer=C.lerp(a[10],b[10],t);headingError=C.lerp(a[7],b[7],t);
  }
  const margin=Math.max(0,p.width/2-spec.wheelHalfTrack-spec.tyreHalfWidth-.65);
  nodes.push({offset:C.clamp(offset,-margin,margin),speed:C.clamp(speed,2,spec.maxSpeed),throttle,brake,steer,headingError,acceleration:0});
 }
 // Smooth the learned lateral trace locally; do not copy sample jitter or physics
 // integration noise. The closed seam is treated exactly like any other section.
 for(let pass=0;pass<(reference?2:0);pass++){const copy=nodes.map(n=>n.offset);for(let i=0;i<N;i++)nodes[i].offset=.2*copy[(i+N-1)%N]+.6*copy[i]+.2*copy[(i+1)%N];}
 for(let i=0;i<N;i++){
  const a=nodes[(i+N-1)%N],b=nodes[(i+1)%N];nodes[i].acceleration=C.clamp((b.speed*b.speed-a.speed*a.speed)/(4*ds),-spec.braking,spec.acceleration);
 }
 return {version:1,carClass,length:track.length,startS:track.startS,source:reference?'qualifying telemetry':'geometry speed envelope',referenceSeconds:reference?.seconds||null,nodes};
}
async function measure(track,carClass,difficulty='hard',factor=1,{yieldFrame=async()=>{},cancelled=()=>false,profile=null,lookScale=1,seed=0,variation=false,record=false,trackLimitRules=C.LIMIT_RULES,spec=C.specOf(carClass)}={}){
 const car=C.createCar(track,{carClass,carSpec:spec,difficulty,paceFactor:factor,penaltySeconds:0,aiProfile:profile,lookScale,aiSeed:seed,variation,trackLimitRules}),dt=1/60,rec=record?createRecorder(track,carClass):null;
 const limit=Math.min(2400,Math.max(240,track.length/Math.max(4,spec.maxSpeed*factor*.18)*2.8));
 let lastProgress=car.progress,stall=0,wall=0;
 for(let frame=0;frame<limit/dt;frame++){
  C.stepCar(car,C.aiControl(car,track,[car],dt),track,dt);C.updateTiming(car,track,(frame+1)*dt,2);if(rec)recordStep(rec,car,track,(frame+1)*dt,dt);
  if(car.colliding>0)wall++;
  if(car.finished)return {seconds:car.lastLap,valid:car.lastLapValid&&car.wallContacts===0,wallFrames:wall,runoffIncidents:car.limitIncidents,reference:rec?finalizeRecorder(rec):undefined};
  if(frame%1200===1199){if(cancelled())throw Error('Calibration cancelled.');if(car.progress-lastProgress<1)stall++;else stall=0;lastProgress=car.progress;if(stall>=3)throw Error('AI could not complete this layout. Revise the connector or disable benchmark matching.');await yieldFrame();}
 }
 throw Error('The calibration car could not complete two laps. Revise the layout or disable benchmark matching.');
}
async function calibrate(track,carClass,benchmark,hardRatio=.98,options={}){
 const results={},reference=options.reference?validateReference(options.reference,track,carClass,options.referenceSpec||C.specOf(carClass)):null;
 const profiles=reference?[buildProfile(track,carClass,reference,options),buildProfile(track,carClass,null,options)]:[buildProfile(track,carClass,null,options)];
 const candidates=[];let trial=0;
 async function run(profile,factor,lookScale){
  options.onProgress?.('Optimizing '+(profile?.source||'baseline')+' · trial '+(++trial));
  const m=await measure(track,carClass,'hard',factor,{...options,profile,lookScale});
  const value={profile,factor,lookScale,...m};candidates.push(value);return value;
 }
 // Optimize legal controller settings instead of only slowing the previous AI.
 // Fast settings are accepted only after an actually completed, clean flying lap.
 for(const profile of profiles){
  const base=await run(profile,1,1);
  if(base.valid){
   const faster=await run(profile,1.055,.90);
   if(faster.valid)await run(profile,1.11,.86);
   else await run(profile,1.025,.95);
  }else{await run(profile,.96,.88);}
 }
 let clean=candidates.filter(c=>c.valid);
 if(!clean.length){await run(null,1,1);clean=candidates.filter(c=>c.valid);}
 if(!clean.length)throw Error('No clean benchmark simulation was found. Adjust this layout or race without benchmark matching.');
 clean.sort((a,b)=>a.seconds-b.seconds);const fastest=clean[0];
 for(const difficulty of (options.difficulties||['hard','medium','easy'])){
  const target=benchmark*(difficulty==='hard'?hardRatio:C.DIFFICULTY[difficulty].benchmark);
  let factor=fastest.factor,measurement=fastest;
  if(target>fastest.seconds*1.004){
   let lo=.10,hi=fastest.factor;factor=C.clamp(fastest.factor*fastest.seconds/target,lo,hi);
   for(let i=0;i<5;i++){
    options.onProgress?.('Matching '+difficulty+' · '+target.toFixed(2)+' s target');
    measurement=await measure(track,carClass,'hard',factor,{...options,profile:fastest.profile,lookScale:fastest.lookScale});
    if(!measurement.valid){hi=factor;factor=(lo+hi)/2;continue;}
    if(Math.abs(measurement.seconds-target)<Math.max(.18,target*.004))break;
    if(measurement.seconds>target)lo=factor;else hi=factor;
    const next=C.clamp(factor*measurement.seconds/target,lo+.00001,hi-.00001);
    factor=Number.isFinite(next)?next:(lo+hi)/2;
   }
   // Ensure the reported measurement corresponds to the exact factor used.
   measurement=await measure(track,carClass,'hard',factor,{...options,profile:fastest.profile,lookScale:fastest.lookScale});
  }
  if(!measurement.valid)throw Error('The fitted '+difficulty+' pace did not reproduce a clean lap. Adjust the reference or disable benchmark matching.');
  results[difficulty]={factor,target,estimated:measurement.seconds,fastest:fastest.seconds,valid:measurement.valid,limited:fastest.seconds>target*1.006,rangeLimited:factor<=.1001&&measurement.seconds<target*.985,profile:fastest.profile,lookScale:fastest.lookScale,source:fastest.profile?.source||'baseline',controller:'optimized',trials:trial};
 }
 return results;
}
root.AFPace={measure,calibrate,createRecorder,recordStep,finalizeRecorder,referenceSummary,validateReference,buildProfile,FIELDS};if(typeof module!=='undefined'&&module.exports)module.exports=root.AFPace;
})(globalThis);
