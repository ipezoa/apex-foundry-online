/* Offline engine/exhaust/tyre synthesis plus optional user-provided recordings.
 * No proprietary recordings are embedded. Optional CC0 engine: domasx2 / OGA,
 * mirrored by yashimosh/border-run. Online loading is explicit and failure-safe. */
(function(root){'use strict';
const C=root.AFCore,clamp=C.clamp,DEFAULTS=Object.freeze({master:.65,engine:.8,turbo:.48,tyres:.55,wheelspin:.5,exhaust:.5,impacts:.55,recordings:true});
const classes={sedan:{idle:850,redline:7200,cyl:6,gears:6,tone:.65,turbo:.25},rally:{idle:1150,redline:8500,cyl:4,gears:6,tone:.9,turbo:1},f1:{idle:3200,redline:15000,cyl:6,gears:8,tone:1.25,turbo:.7}};
function settings(input={}){const o={...DEFAULTS};for(const k of Object.keys(o))if(input[k]!==undefined){if(k==='recordings'){if(typeof input[k]!=='boolean')throw Error('Invalid audio recording setting.');}else if(typeof input[k]!=='number'||!Number.isFinite(input[k])||input[k]<0||input[k]>1)throw Error('Invalid audio volume: '+k);o[k]=input[k];}return o;}
function engineState(car){const a=classes[car.carClass]||classes.sedan,v=Math.abs(car.speed),max=(car.spec?.maxSpeed||60),ratio=v/max;let gear=1;while(gear<a.gears&&ratio>Math.pow(gear/a.gears,.88))gear++;
 const end=max*Math.pow(gear/a.gears,.88),ratioGear=clamp(v/Math.max(1,end),0,1),throttle=Math.max(0,car.control?.throttle||0),rpm=clamp(a.idle+(a.redline-a.idle)*Math.max(ratioGear*.93,throttle*(v<2?.24:.12)),a.idle,a.redline);
 return {gear:car.speed<-.5?'R':v<.35&&!throttle?'N':gear,rpm,redline:a.redline,idle:a.idle,cyl:a.cyl,load:throttle,ratio};}
function noiseBuffer(ctx,seconds=2){const n=Math.round(ctx.sampleRate*seconds),b=ctx.createBuffer(1,n,ctx.sampleRate),a=b.getChannelData(0);let seed=17397;for(let i=0;i<n;i++){seed=(1664525*seed+1013904223)>>>0;a[i]=seed/2147483648-1;}return b;}
class Engine {
 constructor(options={},context=null){const A=root.AudioContext||root.webkitAudioContext;if(!A&&!context)throw Error('Web Audio is unavailable.');this.ctx=context||new A();this.settings=settings(options);this.samples=new Map();this.buffers=new Map();this.noise=noiseBuffer(this.ctx);this.lastGear=null;this.lastDamage=0;this.lastCollision=0;this.lastThrottle=0;this.cooldown=0;this.spool=0;this.rpm=1000;this.active=false;this.classId='';this.stats={updates:0,shifts:0,blowoffs:0,impacts:0};
 const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-12;this.limiter.knee.value=12;this.limiter.ratio.value=8;this.limiter.attack.value=.004;this.limiter.release.value=.14;this.master.connect(this.limiter);this.limiter.connect(c.destination);
 this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=1400;this.engineFilter.Q.value=.7;this.engineFilter.connect(this.master);
 this.voices=[];for(let i=0;i<4;i++){const o=c.createOscillator(),g=c.createGain();g.gain.value=0;o.connect(g);g.connect(this.engineFilter);o.start();this.voices.push({o,g});}
 this.intake=this.noiseLoop('bandpass',950,1.7,this.engineFilter);
 // Valve-train hiss and filtered combustion pulses broaden the engine texture.
 this.valves=this.noiseLoop('bandpass',1800,.9,this.engineFilter);
 this.turbo=this.tone('sine',1900);this.turboAir=this.noiseLoop('bandpass',3200,1.8);this.scrub=this.noiseLoop('bandpass',1600,.8);this.squeal=this.tone('sine',900);this.brakes=this.tone('sine',2200);this.road=this.noiseLoop('lowpass',700,.8);this.exhaust=this.noiseLoop('lowpass',250,1.2,this.engineFilter);
 // An asymmetric firing pulse amplitude-modulates the exhaust, rather than
 // relying exclusively on three static engine harmonics.
 this.pulse=c.createOscillator();this.pulse.type='sawtooth';this.pulseGain=c.createGain();this.pulseGain.gain.value=.006;
 this.pulse.connect(this.pulseGain);this.pulseGain.connect(this.exhaust.g.gain);this.pulse.start();
 this.restoreSamples().catch(()=>{});
 }
 tone(type,hz){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=hz;g.gain.value=0;o.connect(g);g.connect(this.master);o.start();return{o,g};}
 noiseLoop(type,hz,Q,dest){const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.loop=true;f.type=type;f.frequency.value=hz;f.Q.value=Q;g.gain.value=0;s.connect(f);f.connect(g);g.connect(dest||this.master);s.start();return{s,f,g};}
 setOptions(v){this.settings=settings(v);}
 resume(){return this.ctx.resume();}
 gain(node,value,tau=.045){node.g.gain.setTargetAtTime(Math.max(0,value),this.ctx.currentTime,tau);}
 profile(id){if(this.classId===id)return;this.classId=id;const c=this.ctx,a=classes[id]||classes.sedan;for(let j=0;j<this.voices.length;j++){const real=new Float32Array(48),imag=new Float32Array(48);for(let k=1;k<48;k++){const emphasis=(k%3===0?1.12:.82)*(j===1&&k%2===0?.42:1);imag[k]=emphasis*Math.exp(-k/(8+a.tone*6))/(k**.52)*(1+.19*Math.cos(k*1.71+j));real[k]=Math.sin(k*1.41+j*.8)*imag[k]*.26;}this.voices[j].o.setPeriodicWave(c.createPeriodicWave(real,imag,{disableNormalization:false}));}this.rpm=a.idle;this.lastGear=null;this.spool=0;this.revBlipUntil=0;}
 oneShot(kind,gain=1){if(!this.active||gain<.005)return;const c=this.ctx,now=c.currentTime,key=kind==='blowoff'?'turbo':kind==='pop'?'exhaust':kind,stored=this.settings.recordings?this.buffers.get(key):null,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=stored||this.noise;s.playbackRate.value=1;f.type=kind==='pop'||kind==='impact'?'lowpass':'bandpass';f.frequency.value=kind==='pop'?370:kind==='impact'?480:3200;f.Q.value=kind==='blowoff'?1.4:.7;s.connect(f);f.connect(g);g.connect(this.master);const duration=stored?Math.min(2,stored.duration):kind==='impact'?.28:kind==='pop'?.12:.38;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.001,gain),now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+duration);s.start(now);s.stop(now+duration+.03);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
 update(car,active,dt=.03){this.stats.updates++;this.active=!!active;this.master.gain.setTargetAtTime(active?this.settings.master:0,this.ctx.currentTime,.04);if(!car||!active){this.lastThrottle=0;this.lastDamage=car?.damageRevision||0;this.lastCollision=car?.collisionRevision||0;return;}
 const c=this.ctx,now=c.currentTime,a=classes[car.carClass]||classes.sedan;this.profile(car.carClass);const e=engineState(car),th=e.load,br=car.control?.brake||0,v=Math.abs(car.speed),shift=this.lastGear!==null&&this.lastGear!==e.gear;if(shift&&v>5){this.stats.shifts++;this.shiftUntil=now+.09;if(e.gear>this.lastGear)this.oneShot('pop',this.settings.exhaust*.035);else this.revBlipUntil=now+.14;}
 this.lastGear=e.gear;
 // Rev matching, engine load and short gear-change torque cuts. Engine RPM
 // is deliberately smoothed separately from chassis speed.
 const revTarget=e.rpm+(now<(this.revBlipUntil||0)?a.redline*.095:0);
 this.rpm+=(revTarget-this.rpm)*(1-Math.exp(-dt*(th>.5?12:8)));
 this.rpm=clamp(this.rpm,a.idle,a.redline*1.02);
 const fire=this.rpm*a.cyl/120,cut=now<(this.shiftUntil||0)?.40:1;
 const sample=this.settings.recordings?this.samples.get('engine-'+car.carClass):null,recordMix=sample?1:0;
 for(let j=0;j<this.voices.length;j++){
  const voice=this.voices[j],base=[1,.5004,2.002,1.009][j];
  voice.o.frequency.setTargetAtTime(fire*base*(1+.0008*Math.sin(now*(2.1+j)*3)),now,.028);
  this.gain(voice,([.155,.079,.046,.021][j])*(.27+th*.73)*cut*this.settings.engine*(1-recordMix*.85),.035);
 }
 this.pulse.frequency.setTargetAtTime(fire,now,.034);
 this.pulseGain.gain.setTargetAtTime((.004+.006*th)*this.settings.exhaust*(1-recordMix*.75),now,.04);
 this.engineFilter.frequency.setTargetAtTime((380+this.rpm*.21)*(1+th*.35)*a.tone,now,.045);
 const normRPM=this.rpm/a.redline;
 this.intake.f.frequency.setTargetAtTime(630+normRPM*1400+(th*540)*(a.tone),now,.07);
 this.valves.f.frequency.setTargetAtTime(1100+normRPM*4000*a.tone,now,.065);
 this.exhaust.f.frequency.setTargetAtTime(170+normRPM*450+(th*180),now,.06);
 this.gain(this.intake,(.018+.072*th)*Math.sqrt(normRPM)*this.settings.engine*(1-recordMix*.65));
 this.gain(this.valves,(.004+.017*th)*(normRPM**1.15)*this.settings.engine*(1-recordMix*.78));
 this.gain(this.exhaust,(.018+.035*th)*this.settings.exhaust*(1-recordMix*.38));
 this.spool+=((th*v>3?th:0)-this.spool)*(1-Math.exp(-dt*(th>this.spool?2.2:8)));this.turbo.o.frequency.setTargetAtTime(1300+this.spool*4200+this.rpm*.025,now,.08);this.gain(this.turbo,this.spool*.015*a.turbo*this.settings.turbo);this.gain(this.turboAir,this.spool*.026*a.turbo*this.settings.turbo);
 if(this.lastThrottle>.65&&th<.25&&this.spool>.2&&v>10&&now>this.cooldown){this.oneShot('blowoff',this.settings.turbo*this.spool*.22*a.turbo);this.stats.blowoffs++;this.cooldown=now+.55;if(car.carClass!=='sedan')this.oneShot('pop',this.settings.exhaust*.055);}
 const spin=clamp(car.wheelspin||0,0,1),scrub=clamp(car.tyreScrub||0,0,1)*clamp(v/10,0,1),brake=br*clamp(v/24,0,1),gravel=car.offTrack&&car.road?.runoffSurface!=='asphalt';
 this.gain(this.scrub,(spin*.10*this.settings.wheelspin+scrub*.13+brake*.018)*this.settings.tyres);this.scrub.f.frequency.setTargetAtTime(900+scrub*1100+spin*350,now,.08);this.squeal.o.frequency.setTargetAtTime(780+scrub*270+spin*140+Math.sin(now*17)*28,now,.04);this.gain(this.squeal,(spin*.022*this.settings.wheelspin+scrub*.028)*this.settings.tyres);this.brakes.o.frequency.setTargetAtTime(1700+v*17+Math.sin(now*9)*90,now,.04);this.gain(this.brakes,brake*.012*this.settings.tyres);this.gain(this.road,(gravel?.07:.013)*clamp(v/50,0,1)*this.settings.tyres);
 const hitRevision=car.collisionRevision||car.damageRevision||0;
 const lastRevision=car.collisionRevision?this.lastCollision:this.lastDamage;
 if(hitRevision>lastRevision){const hit=car.incidents?.at(-1);this.oneShot('impact',clamp((car.lastImpactSpeed||hit?.normalDeltaV||2)/22,.025,.38)*this.settings.impacts);this.stats.impacts++;}
 this.lastCollision=car.collisionRevision||0;this.lastDamage=car.damageRevision||0;
 for(const [key,item]of this.samples){let vol=0;if(this.settings.recordings){if(key==='engine-'+car.carClass){vol=this.settings.engine*(.18+.33*th)*cut;item.source.playbackRate.setTargetAtTime(clamp(this.rpm/item.rpm,.35,4),now,.045);}if(key==='brakes')vol=brake*this.settings.tyres*.18;if(key==='wheelspin')vol=(spin*this.settings.wheelspin+scrub)*this.settings.tyres*.20;}this.gain(item,vol);}
 this.lastThrottle=th;
 }
 async install(key,raw,{rpm=2500,persist=true,name='Imported sample'}={}){if(!['engine-sedan','engine-rally','engine-f1','turbo','exhaust','brakes','wheelspin'].includes(key))throw Error('Unknown sound slot.');if(!(raw instanceof ArrayBuffer)||raw.byteLength>16*1024*1024)throw Error('Use an audio file smaller than 16 MB.');if(!Number.isFinite(rpm)||rpm<500||rpm>20000)throw Error('Sample reference RPM must be 500–20,000.');const decoded=await this.ctx.decodeAudioData(raw.slice(0));if(decoded.duration<.03||decoded.duration>30)throw Error('Use a trimmed sample lasting 0.03–30 seconds.');
 const b=this.ctx.createBuffer(1,decoded.length,decoded.sampleRate),data=b.getChannelData(0);let peak=.001;for(let k=0;k<decoded.numberOfChannels;k++){const channel=decoded.getChannelData(k);for(let i=0;i<data.length;i++)data[i]+=channel[i]/decoded.numberOfChannels;}let mean=0;for(const x of data)mean+=x;mean/=data.length;for(let i=0;i<data.length;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}for(let i=0;i<data.length;i++)data[i]=data[i]/peak*.85;
 const loop=key.startsWith('engine-')||key==='brakes'||key==='wheelspin';if(loop){const n=Math.min(Math.round(b.sampleRate*.018),Math.floor(b.length/4));for(let i=0;i<n;i++){const t=i/n,mix=data[b.length-n+i]*(1-t)+data[i]*t;data[b.length-n+i]=mix;}}
 const old=this.samples.get(key);if(old){old.source.stop();old.source.disconnect();old.g.disconnect();this.samples.delete(key);}this.buffers.set(key,b);
 if(loop){const source=this.ctx.createBufferSource(),g=this.ctx.createGain();source.buffer=b;source.loop=true;source.loopStart=.018;g.gain.value=0;source.connect(g);g.connect(key.startsWith('engine-')?this.engineFilter:this.master);source.start();this.samples.set(key,{source,g,rpm,name});}
 this.sampleNames??=new Map();this.sampleNames.set(key,name);let saved=false;if(persist){try{await this.dbWrite(key,{raw,rpm,name});saved=true;}catch(e){}}return {key,name,duration:b.duration,saved};
 }
 async db(){if(!root.indexedDB)throw Error('Audio storage unavailable.');return new Promise((resolve,reject)=>{const req=indexedDB.open('apex-foundry.audio.v7',1);req.onupgradeneeded=()=>req.result.createObjectStore('samples');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async dbWrite(key,value){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite');if(value===null)tx.objectStore('samples').delete(key);else tx.objectStore('samples').put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
 async restoreSamples(){const db=await this.db(),values=await new Promise((resolve,reject)=>{const tx=db.transaction('samples'),s=tx.objectStore('samples'),r=s.getAll(),k=s.getAllKeys();tx.oncomplete=()=>resolve(k.result.map((key,i)=>[key,r.result[i]]));tx.onerror=()=>reject(tx.error);});db.close();for(const [key,v]of values){if(!this.buffers.has(key))await this.install(key,v.raw,{...v,persist:false});}}
 async clearSamples(){for(const item of this.samples.values()){item.source.stop();item.source.disconnect();item.g.disconnect();}this.samples.clear();this.buffers.clear();this.sampleNames?.clear();const db=await this.db();await new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite');tx.objectStore('samples').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
 async loadCC0(id){if(!Object.hasOwn(classes,id))throw Error('Choose a car class first.');const url='https://raw.githubusercontent.com/yashimosh/border-run/main/public/sfx/engine/loop_0.wav',controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const r=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('HTTP '+r.status);return await this.install('engine-'+id,await r.arrayBuffer(),{rpm:2500,name:'domasx2 · CC0 generic engine loop'});}finally{clearTimeout(timer);}}
}
const api={Engine,DEFAULTS,settings,engineState,classes};root.AFAudio=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
