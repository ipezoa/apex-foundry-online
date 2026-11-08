/* Apex Foundry — offline application, editor, race loop, HUD and persistence. */
(function(){
'use strict';
const C=AFCore, K=AFControls, $=id=>document.getElementById(id), pad=n=>String(n).padStart(2,'0');
const clone=o=>JSON.parse(JSON.stringify(o));
const colors=['#2866c9','#61b4e5','#f29b6b','#b899ec','#e96e83','#68d3bc','#f2d77c','#c7d7de','#467cc9','#d781ba','#accc80','#dd6649','#55a4a2','#ff3030','#f48a12','#ffd326','#eaf61b','#3dcb31','#10f0b2','#05a7f4','#5351fd','#992bde','#ed39bd','#ff6eac','#7e4242','#424a55','#d4bfa3','#fbffff','#141414','#843dc3','#a6f8ff','#e7e33d'];
const names=['Vega','Kestrel','Atlas','Nova','Ghost','Rook','Sol','Echo','Flux','Rift','Juno','Pace'];
const state={config:C.preset(),track:null,selected:0,mode:'track',blueprint:false,carClass:'sedan',benchmarkTime:null,benchmarkEnabled:false,benchmarkKey:null,hardRatio:.98,calibration:null,calibrationKey:null,calibrationBusy:false,calibrationToken:0,penaltySeconds:0,trackLimitRules:{grace:1,speedKmh:80,returnSeconds:2},gridSpacing:15,launchStagger:.12,raceSeed:1907,lapReference:null,referenceRevision:0,referenceStored:true,opponents:5,difficulties:Array.from({length:12},(_,i)=>['medium','hard','easy','medium','medium'][i%5]),laps:3,color:colors[0],camera:1,quality:'balanced',cameraSettings:{...AFRenderer.CAMERA_DEFAULTS},audioSettings:{...AFAudio.DEFAULTS},audioPreview:null,tunings:{},worldSettings:{detail:'full',theme:'auto',time:'auto',markers:true},aiPercents:Array.from({length:12},(_,i)=>C.AI_PRESETS[['medium','hard','easy','medium','medium'][i%5]]),tuningClass:'sedan',acceptedLayoutKey:null,layoutReview:null,race:null,keys:new Set(),touchActions:new Set(),bindings:K.defaults(),capture:null,plan:{scale:null,cx:null,cz:null,mode:'fit'},inspecting:false,previewCars:[],previewPlayer:null,fps:0,sound:false};
let renderer, toastTimer, lastFrame=0, accumulator=0, audioCounter=0, hudCounter=0, fpsFrames=0,fpsStart=0, audio=null;
let onlineClient=null,onlineTick=0,onlineSeq=0,onlineFirstSnapshot=false;
const remoteInputs=new Map();
function tunedSpecFor(id=state.carClass){return C.tunedSpec(id,state.tunings[id]||{});}
function aiGroupKey(difficulty,percent){return difficulty+'@'+percent;}
function currentAIGroups(){const map=new Map();for(let i=0;i<state.opponents;i++){const difficulty=state.difficulties[i],percent=state.aiPercents[i];map.set(aiGroupKey(difficulty,percent),{difficulty,percent});}if(!map.size)map.set('hard@120',{difficulty:'hard',percent:120});return [...map.values()];}
function invalidatePace(){state.calibration=null;state.calibrationKey=null;state.calibrationToken++;syncBenchmarkUI();}
function setAIPercent(index,value){if(state.race)return;const n=Number(value);if(!Number.isFinite(n)||n<50||n>200)throw Error('AI performance must be 50–200%.');state.aiPercents[index]=Math.round(n);invalidatePace();saveRaceSettings();saveGarage();renderRoster();rebuildPreview();}
function garageData(){return {format:'apex-foundry-garage',version:1,tunings:state.tunings,aiPercents:state.aiPercents,difficulties:state.difficulties,worldSettings:state.worldSettings,cameraSettings:state.cameraSettings,audioSettings:state.audioSettings,quality:state.quality,sound:state.sound,color:state.color};}
function validateGarage(data){
 if(!data||data.format!=='apex-foundry-garage'||data.version!==1)throw Error('This is not an Apex Foundry garage settings file.');
 const tunings={};for(const id of Object.keys(C.CARS))tunings[id]=C.tuneValues(C.tunedSpec(id,data.tunings?.[id]||{}));
 const aiPercents=data.aiPercents||state.aiPercents,difficulties=data.difficulties||state.difficulties;
 if(!Array.isArray(aiPercents)||aiPercents.length!==12||aiPercents.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<50||x>200))throw Error('The AI roster must have 12 percentages from 50 to 200.');
 if(!Array.isArray(difficulties)||difficulties.length!==12||difficulties.some(x=>!['easy','medium','hard'].includes(x)))throw Error('Invalid AI difficulty roster.');
 const w=data.worldSettings||state.worldSettings;
 if(!['full','minimal'].includes(w.detail)||!['auto','day','cloud','haze','dusk','night'].includes(w.time)||(w.theme!=='auto'&&!Object.hasOwn(AFScenery.themes,w.theme))||typeof w.markers!=='boolean')throw Error('Invalid scenic settings.');
 return {tunings,aiPercents:aiPercents.map(Math.round),difficulties:difficulties.slice(),worldSettings:{detail:w.detail,theme:w.theme,time:w.time,markers:w.markers},cameraSettings:AFRenderer.cameraSettings(data.cameraSettings||state.cameraSettings),audioSettings:AFAudio.settings(data.audioSettings||state.audioSettings),quality:['balanced','quality','performance'].includes(data.quality)?data.quality:state.quality,sound:typeof data.sound==='boolean'?data.sound:state.sound,color:/^#[a-f0-9]{6}$/i.test(data.color||'')?data.color.toLowerCase():state.color};
}
function saveGarage(){try{localStorage.setItem('apex-foundry.garage.v7',JSON.stringify(garageData()));return true;}catch(e){return false;}}
function showGarageStatus(message,error=false){$('garageStatus').textContent=message;$('garageStatus').classList.toggle('error',error);}
function renderTuneFields(){
 const id=state.tuningClass,v=tunedSpecFor(id),values=C.tuneValues(v),list=$('tuneFields');list.textContent='';$('tuneClass').value=id;
 for(const field of C.TUNE_FIELDS){const row=document.createElement('div');row.className='field';const label=document.createElement('label');label.htmlFor='tune-'+field.key;label.textContent=field.label;const input=document.createElement('input');input.id='tune-'+field.key;input.type='number';input.min=field.min;input.max=field.max;input.step=field.step;input.value=field.key==='steerAngle'?Number(values[field.key].toFixed(3)):values[field.key];input.dataset.original=values[field.key];input.dataset.display=input.value;input.disabled=!!state.race;const unit=document.createElement('small');unit.textContent=field.unit;row.append(label,input,unit);list.appendChild(row);}
 $('tuneSummary').textContent='PLAYER: '+(v.maxSpeed*3.6).toFixed(0)+' km/h · HARD AT 120%: '+(v.maxSpeed*3.6*1.2).toFixed(0)+' km/h';
 $('tuneRaceLock').classList.toggle('hidden',!state.race);for(const id of ['applyTune','resetTune','resetAllTunes','importGarage'])$(id).disabled=!!state.race;
}
function garagePane(which){for(const key of ['tune','world','camera','audio','kerbs']){const name=key[0].toUpperCase()+key.slice(1),on=which===key;$('garage'+name+'Pane').classList.toggle('hidden',!on);const tab=$('garage'+name+'Tab');tab.classList.toggle('lime',on);tab.setAttribute('aria-pressed',String(on));}if(which==='kerbs')renderKerbEditor();}
const cameraLabels={distance:['Chase distance','m behind chassis'],pullback:['Extra distance at top speed','m · 0 = fixed distance'],height:['Chase height','m above chassis'],fov:['Chase field of view','degrees'],fovBoost:['Extra FOV at top speed','degrees · 0 = fixed FOV'],follow:['Orbit response','higher = faster follow'],hoodFov:['Hood field of view','degrees']};
function renderCameraSettings(){const box=$('cameraFields');box.textContent='';for(const [key,[label,unit]]of Object.entries(cameraLabels)){const d=document.createElement('div');d.className='field';const l=document.createElement('label');l.htmlFor='cam-'+key;l.textContent=label;const i=document.createElement('input');i.id='cam-'+key;i.type='number';[i.min,i.max]=AFRenderer.CAMERA_LIMITS[key];i.step=['distance','pullback','height'].includes(key)?'.1':'1';i.value=state.cameraSettings[key];const small=document.createElement('small');small.textContent=unit;d.append(l,i,small);box.appendChild(d);}$('cameraQuality').value=state.quality;const aa=renderer.getAntialiasing();$('antialiasStatus').textContent='MSAA: '+(aa.msaa?'ACTIVE':'not supported by this browser context; use High for supersampling')+'. Camera distance is now relative to the moving car, without unintended speed-dependent lag.';}
function applyCamera(){try{const values={};for(const [k,b]of Object.entries(AFRenderer.CAMERA_LIMITS))values[k]=safeNum('cam-'+k,b[0],b[1]);state.cameraSettings=AFRenderer.cameraSettings(values);renderer.setCameraSettings(state.cameraSettings);setQuality($('cameraQuality').value);const saved=saveGarage();showGarageStatus('Camera applied. '+(saved?'Saved on this device.':'Export settings to keep it.'));}catch(e){showGarageStatus(e.message,true);}}
function renderAudioSettings(){const box=$('audioFields');box.textContent='';for(const [key,label]of Object.entries({master:'Master volume',engine:'Engine / intake',turbo:'Turbo / blow-off',tyres:'Tyres / brakes / road',wheelspin:'Wheelspin (50% default)',exhaust:'Exhaust / overrun',impacts:'Collision impacts'})){const d=document.createElement('div');d.className='field';const l=document.createElement('label');l.htmlFor='audio-'+key;l.textContent=label;const out=document.createElement('span');out.className='audioValue';out.textContent=Math.round(state.audioSettings[key]*100)+'%';l.appendChild(out);const i=document.createElement('input');i.type='range';i.min=0;i.max=100;i.step=1;i.id='audio-'+key;i.value=state.audioSettings[key]*100;i.oninput=()=>out.textContent=i.value+'%';d.append(l,i);box.appendChild(d);}$('audioRecordings').checked=state.audioSettings.recordings;$('audioEnabled').checked=state.sound;$('sampleSlot').value='engine-'+state.carClass;renderSampleStatus();}
function applyAudio(){try{const v={recordings:$('audioRecordings').checked};for(const key of ['master','engine','turbo','tyres','wheelspin','exhaust','impacts'])v[key]=safeNum('audio-'+key,0,100)/100;state.audioSettings=AFAudio.settings(v);state.sound=$('audioEnabled').checked;if(state.sound)initAudio();audio?.setOptions(state.audioSettings);saveGarage();syncBindingLabels();showGarageStatus('Sound settings applied. Recordings stay local and are not part of settings JSON.');updateAudio();}catch(e){showGarageStatus(e.message,true);}}
function renderSampleStatus(message){const list=audio?.sampleNames?[...audio.sampleNames.entries()].map(([key,name])=>key+': '+name):[];$('audioSampleStatus').textContent=(message?message+' ':'')+(list.length?'Loaded: '+list.join(' · '):'Offline synthesized audio active. No recording loaded.');}
function previewAudio(){applyAudio();initAudio();if(!audio)return;state.audioPreview={start:performance.now(),end:performance.now()+6000,carClass:state.carClass};audio.resume().catch(()=>{});showGarageStatus('Six-second local sound preview. Stop to end it immediately.');}
function stopAudioPreview(){state.audioPreview=null;updateAudio();}
function renderKerbEditor(selected=0){if(!state.track)return;const map=AFKerbs.prepare(state.track),sel=$('kerbZone');sel.textContent='';for(let i=0;i<map.zones.length;i++){const z=map.zones[i],o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+(z.side<0?'L':'R')+' · '+Math.round(z.start*state.track.length)+'–'+Math.round(z.end*state.track.length)+' m · '+z.label;sel.appendChild(o);}if(!map.zones.length){const o=document.createElement('option');o.value=-1;o.textContent='No kerbs — add an interval';sel.appendChild(o);}sel.value=String(Math.min(selected,map.zones.length-1));$('kerbMapStatus').textContent=map.status+' · '+map.zones.length+' intervals · '+(AFKerbs.coverage(state.track)*100).toFixed(1)+'% of combined track edges';for(const id of ['kerbZone','kerbStart','kerbEnd','kerbSide','kerbWidth','kerbColor','kerbLabel','applyKerb','addKerb','removeKerb','resetKerbs','focusKerb'])$(id).disabled=!!state.race;readKerbForm();}
function readKerbForm(){const z=AFKerbs.prepare(state.track).zones[Number($('kerbZone').value)],L=state.track.length;$('kerbStart').max=L;$('kerbEnd').max=L;if(!z)return;$('kerbStart').value=+(z.start*L).toFixed(2);$('kerbEnd').value=+(z.end*L).toFixed(2);$('kerbSide').value=z.side;$('kerbWidth').value=z.width;$('kerbColor').value=z.color;$('kerbLabel').value=z.label;}
function saveKerb(){if(state.race)return;try{const map=clone(AFKerbs.prepare(state.track)),L=state.track.length,start=safeNum('kerbStart',0,L),end=safeNum('kerbEnd',0,L);if(end<=start)throw Error('End distance must be larger than start. Split a seam-crossing kerb into two intervals.');const z={start:start/L,end:end/L,side:Number($('kerbSide').value),width:safeNum('kerbWidth',.2,3),color:$('kerbColor').value,label:$('kerbLabel').value.slice(0,80),evidence:'user-edited; reference accuracy not verified'};let i=Number($('kerbZone').value);if(i<0){i=map.zones.length;map.zones.push(z);}else map.zones[i]=z;map.status='USER-EDITED · '+state.config.name;state.config.kerbs=C.validateKerbs(map);rebuild();renderKerbEditor(i);showGarageStatus('Kerb interval saved. Export the track JSON to carry this map to another device.');}catch(e){showGarageStatus(e.message,true);}}
function addKerb(){if(state.race)return;const map=clone(AFKerbs.prepare(state.track)),point=state.track.points.find(p=>p.seg===state.selected)||state.track.points[0],start=point.kerbU,end=Math.min(1,start+30/state.track.length);if(end-start<.00001)return;map.zones.push({start,end,side:1,width:.95,color:'redwhite',label:'Custom interval',evidence:'user-edited'});map.status='USER-EDITED · '+state.config.name;state.config.kerbs=C.validateKerbs(map);rebuild();renderKerbEditor(map.zones.length-1);}
function removeKerb(){if(state.race)return;const map=clone(AFKerbs.prepare(state.track)),i=Number($('kerbZone').value);if(i<0)return;map.zones.splice(i,1);map.status='USER-EDITED · '+state.config.name;state.config.kerbs=C.validateKerbs(map);rebuild();renderKerbEditor(Math.max(0,i-1));}
function focusKerb(){const z=AFKerbs.prepare(state.track).zones[Number($('kerbZone').value)];if(!z)return;const u=(z.start+z.end)/2,p=state.track.points.reduce((a,b)=>Math.abs(a.kerbU-u)<Math.abs(b.kerbU-u)?a:b);closeSettings();setMode('track');setBlueprint(false);state.inspecting=true;renderer.editorTarget=[p.x,p.y,p.z];renderer.editorDistance=Math.max(35,Math.min(110,(z.end-z.start)*state.track.length*1.3));renderer.editorMode='free';drawMaps();updateNavigationUI();}

function describeWorld(){const t=AFScenery.themeFor(state.track,$('worldTheme').value),box=$('worldThemeInfo');box.textContent='';const title=document.createElement('strong'),note=document.createElement('p');title.textContent=t.title;note.textContent=t.note+' Landmark sizes and placements are illustrative.';box.append(title,note);if(t.source){const link=document.createElement('a');link.textContent='Scenery reference ↗';link.href=t.source;link.target='_blank';link.rel='noopener noreferrer';box.appendChild(link);}}
function openSettings(pane='tune'){
 pause();clearInputs();state.tuningClass=state.carClass;renderTuneFields();
 const select=$('worldTheme');if(select.options.length===1)for(const [id,t]of Object.entries(AFScenery.themes)){const o=document.createElement('option');o.value=id;o.textContent=t.title;select.appendChild(o);}
 $('worldTheme').value=state.worldSettings.theme;$('worldTime').value=state.worldSettings.time;$('worldDetail').value=state.worldSettings.detail;$('worldMarkers').checked=state.worldSettings.markers;describeWorld();renderCameraSettings();renderAudioSettings();garagePane(pane);showGarageStatus('Camera, sound, car tuning and scenery settings stay on this device.');$('settingsModal').classList.remove('hidden');$('closeSettings').focus();
}
function closeSettings(){stopAudioPreview();clearInputs();$('settingsModal').classList.add('hidden');(state.race?$('resumeBtn'):$('settingsBtn')).focus();}
function applyTune(){if(state.race)return;try{const values={};for(const f of C.TUNE_FIELDS){const input=$('tune-'+f.key);values[f.key]=input.value===input.dataset.display?Number(input.dataset.original):safeNum('tune-'+f.key,f.min,f.max);}const v=C.tunedSpec(state.tuningClass,values);state.tunings[state.tuningClass]=C.tuneValues(v);invalidateBenchmark();const saved=saveGarage();saveRaceSettings();renderTuneFields();renderCarSelection();renderRoster();rebuildPreview();if(!state.race)setMode(state.mode);showGarageStatus(v.name+' tune applied. '+(saved?'Saved on this device.':'Storage unavailable: export settings to keep it.'));}catch(e){showGarageStatus(e.message,true);}}
function restoreTune(all=false){if(state.race)return;if(all)state.tunings={};else delete state.tunings[state.tuningClass];invalidateBenchmark();saveGarage();saveRaceSettings();renderTuneFields();renderCarSelection();renderRoster();rebuildPreview();setMode(state.mode);showGarageStatus(all?'All three car classes restored to factory parameters.':'Selected car restored to factory parameters.');}
function applyWorld(){try{const data=validateGarage({...garageData(),worldSettings:{theme:$('worldTheme').value,time:$('worldTime').value,detail:$('worldDetail').value,markers:$('worldMarkers').checked}});state.worldSettings=data.worldSettings;renderer.setWorldSettings(state.worldSettings);const saved=saveGarage();describeWorld();showGarageStatus('Scenery applied. '+(saved?'Saved on this device.':'Session only; export to keep.'));}catch(e){showGarageStatus(e.message,true);}}
function exportGarage(){const blob=new Blob([JSON.stringify(garageData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Apex-Foundry-v7-Garage.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importGarage(file){if(state.race)throw Error('Return to the editor before importing vehicle settings.');if(!file)return;if(file.size>100000)throw Error('Garage settings file is too large.');const data=validateGarage(JSON.parse(await file.text()));Object.assign(state,data);invalidateBenchmark();invalidatePace();saveGarage();saveRaceSettings();renderer.setWorldSettings(state.worldSettings);renderer.setCameraSettings(state.cameraSettings);renderer.setQuality(state.quality);audio?.setOptions(state.audioSettings);renderCarSelection();renderRoster();rebuildPreview();openSettings();showGarageStatus('Imported all car tunes, AI performance settings and scenery.');}
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.remove('hidden');$('toast').classList.toggle('error',error);clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200);}
function formatTime(t){if(t===null||t===undefined||!Number.isFinite(t))return '—';const h=Math.floor(Math.max(0,t)*100);return pad(Math.floor(h/6000))+':'+pad(Math.floor(h/100)%60)+'.'+pad(h%100);}
function safeNum(id,min,max){const raw=$(id).value,v=Number(raw);if(raw.trim()===''||!Number.isFinite(v)||v<min||v>max)throw Error('Please enter a number between '+min+' and '+max+'.');return v;}
function markDirty(){$('saveStatus').textContent='UNSAVED CHANGES · EXPORT TO KEEP A PORTABLE COPY';}
function saveLocal(){AFKerbs.materialize(state.track);try{localStorage.setItem('apex-foundry.track.v1',JSON.stringify(state.config));$('saveStatus').textContent='SAVED ON THIS DEVICE · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});toast('Track saved in this browser.');}catch(e){toast('Browser storage is unavailable. Use Export JSON to keep your track.',true);}}
function updateStats(){const t=state.track;$('statLength').textContent=(t.length/1000).toFixed(2);$('statCorners').textContent=pad(state.config.geometry==='mapped'?(state.config.source?.corners||0):state.config.segments.filter(s=>s.type!=='straight').length);$('statElevation').textContent=(t.bounds.maxY-t.bounds.minY).toFixed(1);$('targetLength').value=Math.round(t.length);$('sectionCount').textContent=pad(state.config.segments.length);$('mapDirection').textContent=state.config.direction===1?'FWD ↗':'REV ↙';updateLayoutWarnings();$('mainAction').disabled=false;}
// Geometry warnings are reviewable, not permanent race locks. Approval is scoped
// to the exact current layout and is never stored in exported track files.
function layoutKey(){return JSON.stringify({direction:state.config.direction,segments:state.config.segments,path:state.config.path||null});}
function layoutNeedsReview(){return !!(state.track.closure||state.track.invalid);}
function layoutAccepted(){return state.acceptedLayoutKey===layoutKey();}
function layoutAcceptLabel(){return state.track.closure?'Accept connector and continue':'Accept layout and continue';}
function updateLayoutWarnings(){
 const t=state.track,needsReview=layoutNeedsReview(),accepted=needsReview&&layoutAccepted();
 $('trackWarnings').classList.toggle('hidden',!t.warnings.length);
 $('trackWarnings').classList.toggle('error',t.invalid&&!accepted);
 $('trackWarningText').textContent=t.warnings.join(' ');
 $('trackWarningStatus').textContent=accepted?'Accepted for this layout. Geometry warnings remain advisory; editing the layout requires a new confirmation.':needsReview?'You can accept this layout and race without changing it. Tight or overlapping sections may affect handling, collisions and AI progress.':'These notes do not prevent racing.';
 $('acceptTrackWarnings').classList.toggle('hidden',!needsReview||accepted);
 $('acceptTrackWarnings').textContent=layoutAcceptLabel();
 $('gridTrackWarnings').classList.toggle('hidden',!needsReview);
 $('gridWarningStatus').textContent=accepted?(t.closure?'Automatic connector accepted ('+Math.round(t.closureLength)+' m).':'Layout warnings accepted.'):'This layout needs your confirmation before racing.';
 $('gridWarningDetail').textContent=t.invalid?'Experimental layout: folded or crossing sections may cause unstable handling, unusual collisions or AI stalls. Approval does not repair the geometry.':'The automatic connector is part of your race circuit. Review its shape in Track Lab at any time.';
}
function requestLayoutApproval(next){
 if(!layoutNeedsReview()||layoutAccepted())return true;
 state.layoutReview={next,key:layoutKey(),returnFocus:document.activeElement};
 clearInputs();
 $('layoutReviewTitle').textContent=state.track.closure?'Use this automatic connector?':'Race this layout as it is?';
 $('layoutReviewIntro').textContent=state.track.closure?'A '+Math.round(state.track.closureLength)+' m automatic connector closes your circuit. You can accept it and continue without changing your sections.':'You can accept these geometry warnings and continue without changing your sections.';
 $('layoutReviewWarnings').textContent='';
 for(const warning of state.track.warnings){const p=document.createElement('p');p.textContent=warning;$('layoutReviewWarnings').appendChild(p);}
 $('layoutReviewAccept').textContent=layoutAcceptLabel();
 $('layoutReviewModal').classList.remove('hidden');$('layoutReviewCancel').focus();
 return false;
}
function cancelLayoutReview(){
 const review=state.layoutReview;state.layoutReview=null;$('layoutReviewModal').classList.add('hidden');
 if(!state.race&&state.mode!=='track')setMode('track');
 const target=review?.returnFocus;
 if(target?.isConnected&&target.getClientRects().length)target.focus();else $('trackTab').focus();
}
function acceptLayoutAndContinue(next){
 const review=state.layoutReview,destination=next||review?.next||'grid';
 // Do not approve unseen geometry if a rebuild occurred while review was open.
 if(review&&review.key!==layoutKey()){state.layoutReview=null;$('layoutReviewModal').classList.add('hidden');if(!requestLayoutApproval(destination))return;}
 state.acceptedLayoutKey=layoutKey();state.layoutReview=null;$('layoutReviewModal').classList.add('hidden');
 updateLayoutWarnings();
 if(destination==='race'||destination==='qualifying')startRace(destination);else {setMode('grid');$('mainAction').focus();}
}
function renderSegments(){const list=$('segments');list.textContent='';state.config.segments.forEach((s,i)=>{const b=document.createElement('button');b.className='segment'+(i===state.selected?' selected':'');b.setAttribute('aria-label','Select section '+(i+1)+', '+s.type);b.setAttribute('aria-pressed',i===state.selected?'true':'false');const index=document.createElement('span');index.className='segIndex';index.textContent=pad(i+1);const icon=document.createElement('span');icon.className='segIcon';icon.textContent=s.type==='mapped'?'⌁':s.type==='straight'?'↑':s.type==='right'?'↱':'↰';const label=document.createElement('span');label.className='segName';label.textContent=s.type==='mapped'?'Surface zone':s.type==='straight'?'Straight':s.type==='right'?'Right corner':'Left corner';const value=document.createElement('span');value.className='segValue';value.textContent=(s.type==='straight'||s.type==='mapped')?Math.round(s.length)+' m':s.angle+'° · R'+Math.round(s.radius);b.append(index,icon,label,value);b.onclick=()=>selectSegment(i);list.appendChild(b);});}
function updateInspector(){const s=state.config.segments[state.selected];$('inspectorTitle').textContent='SECTION '+pad(state.selected+1);$('segmentType').value=s.type;$('segmentLength').value=Math.round(s.length||200);$('segmentAngle').value=s.angle;$('segmentRadius').value=Number(s.radius.toFixed(2));$('segmentWidth').value=s.width;$('segmentRunoffLeft').value=s.runoffLeft??20;$('segmentRunoffRight').value=s.runoffRight??20;$('segmentRunoffSurface').value=s.runoffSurface||'grass';$('segmentBank').value=s.bank;$('segmentGrade').value=Number(s.grade.toFixed(2));$('segmentRise').value=Number((C.segmentLength(s)*s.grade/100).toFixed(2));const straight=s.type==='straight';$('lengthField').classList.toggle('hidden',!straight);$('angleField').classList.toggle('hidden',straight);$('radiusField').classList.toggle('hidden',straight);$('moveUp').disabled=state.selected===0;$('moveDown').disabled=state.selected===state.config.segments.length-1;$('deleteSegment').disabled=state.config.segments.length<=2;updateMappedInspector();}
function makeGrid(qualifying=false){
 const cars=[],aiColors=colors.filter(c=>c!==state.color),count=qualifying?0:state.opponents;
 const guests=!qualifying&&onlineClient?.role==='host'&&onlineClient.connected?onlineClient.players.filter(p=>p.id!==onlineClient.id):[];
 for(let i=0;i<count;i++){const cal=state.benchmarkEnabled?state.calibration?.[aiGroupKey(state.difficulties[i],state.aiPercents[i])]:null;
  cars.push(C.createCar(state.track,{id:i+1,name:names[i],color:aiColors[i%aiColors.length],difficulty:state.difficulties[i],grid:i,carClass:state.carClass,carSpec:tunedSpecFor(),performancePercent:state.aiPercents[i],penaltySeconds:state.penaltySeconds,paceFactor:cal?.factor||1,aiProfile:cal?.profile||null,lookScale:cal?.lookScale||1,variation:true,trackLimitRules:state.trackLimitRules}));
 }
 for(let i=0;i<guests.length;i++){
  const person=guests[i],c=C.createCar(state.track,{id:100+i,name:person.name,color:/^#[0-9a-f]{6}$/i.test(person.color||'')?person.color:colors[(i+4)%colors.length],grid:count+i,isPlayer:true,carClass:state.carClass,carSpec:tunedSpecFor(),trackLimitRules:state.trackLimitRules});
  c.isPlayer=false;c.isHuman=true;c.ownerId=person.id;c.remotePlayerId=person.id;cars.push(c);
 }
 const player=C.createCar(state.track,{id:0,name:onlineClient?.role==='host'?onlineClient.players.find(p=>p.id===onlineClient.id)?.name||'HOST':'YOU',color:state.color,grid:count+guests.length,isPlayer:true,carClass:state.carClass,carSpec:tunedSpecFor(),penaltySeconds:state.penaltySeconds,trackLimitRules:state.trackLimitRules});
 if(guests.length){player.isHuman=true;player.ownerId=onlineClient.id;}cars.push(player);
 const layout=C.configureGrid(state.track,cars,{spacing:state.gridSpacing,stagger:state.launchStagger,seed:state.raceSeed});return {cars,player,layout};
}
function rebuildPreview(){const grid=makeGrid();state.previewCars=grid.cars;state.previewPlayer=grid.player;renderer.resetCamera();}
function rebuild(dirty=true){state.track=C.buildTrack(state.config);invalidateBenchmark();if(state.acceptedLayoutKey!==layoutKey())state.acceptedLayoutKey=null;state.selected=C.clamp(state.selected,0,state.config.segments.length-1);renderer.setTrack(state.track,state.mode==='track'?state.selected:-1);updateStats();renderSegments();updateInspector();rebuildPreview();if(state.plan.mode==='section'){const p=renderer.sectionPoint(state.selected);state.plan.cx=p.x;state.plan.cz=p.z;}drawMaps();updateNavigationUI();updateCircuitContext();if(dirty)markDirty();}
function selectSegment(i,follow=true){state.selected=i;if(!follow){renderer.editorMode='free';state.plan.mode='free';}renderSegments();updateInspector();renderer.setTrack(state.track,i);if(follow&&state.inspecting)focusSelected(false);drawMaps();updateNavigationUI();}
function syncConfigUI(){const opt=$('mappedPresetOption');if(state.config.geometry==='mapped'){opt.textContent=state.config.name+' · mapped';opt.hidden=false;$('preset').value='mapped-active';}else{opt.hidden=true;if($('preset').value==='mapped-active')$('preset').value='dockside';}$('trackName').value=state.config.name;$('direction').value=String(state.config.direction);$('globalWidth').value=state.config.segments[0].width;$('globalRunoffLeft').value=state.config.segments[0].runoffLeft??20;$('globalRunoffRight').value=state.config.segments[0].runoffRight??20;$('globalRunoffSurface').value=state.config.segments[0].runoffSurface||'grass';}
function mutate(fn){try{const cfg=clone(state.config);fn(cfg);if(cfg.source)cfg.source.modified=true;state.config=C.validateConfig(cfg);rebuild();}catch(e){toast(e.message,true);updateInspector();}}
function renderRoster(){
 const list=$('roster');list.textContent='';const aiColors=colors.filter(c=>c!==state.color);
 if(!state.opponents){const p=document.createElement('p');p.className='subtext';p.textContent='Solo time trial. Just you, the circuit and the clock.';list.appendChild(p);}
 for(let i=0;i<state.opponents;i++){
  const percent=state.aiPercents[i],row=document.createElement('div');row.className='opponent'+(percent>100?' boosted':'');
  const dot=document.createElement('span');dot.className='colorDot';dot.style.background=aiColors[i%aiColors.length];const name=document.createElement('span');name.className='opponentName';name.textContent=pad(i+1)+' / '+names[i];
  const sel=document.createElement('select');sel.setAttribute('aria-label','Difficulty for '+names[i]);for(const d of ['easy','medium','hard']){const o=document.createElement('option');o.value=d;o.textContent=d[0].toUpperCase()+d.slice(1);sel.appendChild(o);}sel.value=state.difficulties[i];
  sel.onchange=()=>{state.difficulties[i]=sel.value;state.aiPercents[i]=C.AI_PRESETS[sel.value];invalidatePace();saveRaceSettings();saveGarage();renderRoster();rebuildPreview();};
  const label=document.createElement('label');label.className='aiBoostField';const input=document.createElement('input');input.id='aiPercent-'+i;input.type='number';input.min=50;input.max=200;input.step=1;input.value=percent;input.setAttribute('aria-label','Performance percentage for '+names[i]);input.onchange=()=>{try{setAIPercent(i,input.value);}catch(e){toast(e.message,true);input.value=state.aiPercents[i];}};label.append(input,document.createTextNode('%'));
  const hint=document.createElement('span');hint.className='aiBoostHint';hint.textContent=(tunedSpecFor().maxSpeed*3.6*percent/100).toFixed(0)+' km/h limit · '+(percent===100?'equal base stats':(percent>100?'+':'')+(percent-100)+'% speed / acceleration / braking / grip');
  row.append(dot,name,sel,label,hint);list.appendChild(row);
 }
 $('opponentValue').textContent=pad(state.opponents);$('ctaMeta').textContent=state.mode==='track'?'BUILD IT. THEN BEAT IT.':state.opponents+' OPPONENTS / '+state.laps+' LAPS / EXPLICIT AI HANDICAPS';
}
const VALID_PAINT=/^#[0-9a-fA-F]{6}$/;
let paintPreviousFocus=null;
function choosePaint(value,close=false){
 if(state.race||!VALID_PAINT.test(String(value)))return false;
 state.color=value.toLowerCase();
 saveGarage();saveRaceSettings();renderColors();renderRoster();rebuildPreview();
 if(onlineClient?.connected&&onlineClient.phase==='lobby')onlineClient.send({type:'paint',color:state.color});
 if(close)closePaintPalette();return true;
}
function renderColors(){
 const list=$('colorChoices');list.textContent='';
 for(const col of colors){const b=document.createElement('button');b.className='colorChoice'+(col.toLowerCase()===state.color.toLowerCase()?' active':'');b.style.background=col;b.setAttribute('aria-label','Choose car paint '+col);b.title='Paint '+col.toUpperCase();b.setAttribute('aria-pressed',String(col.toLowerCase()===state.color.toLowerCase()));b.onclick=()=>choosePaint(col);list.appendChild(b);}
 if($('paintPreview'))$('paintPreview').style.background=state.color;
 if($('paintHexInput'))$('paintHexInput').value=state.color.toUpperCase();
 if($('paintNativeInput'))$('paintNativeInput').value=state.color;
}
function hueColor(h,s,l){
 h=((h%360)+360)%360;s=C.clamp(s,0,1);l=C.clamp(l,0,1);
 const chroma=(1-Math.abs(2*l-1))*s,x=chroma*(1-Math.abs((h/60)%2-1)),m=l-chroma/2;
 const sector=Math.floor(h/60),c=[[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]][sector];
 return '#'+c.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
function hexPaletteColor(q,r,size){
 const x=Math.sqrt(3)*(q+r/2),y=1.5*r,theta=Math.atan2(y,x)*180/Math.PI,radius=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))/size;
 // Similar to the reference image: warm orange at the top, pink to the right,
 // blue below, green to the left; neutral near the middle, no printed codes.
 if(Math.abs(q)<=1&&r>=0&&r<=2){const shades=['#ffffff','#d7d7d7','#989898','#383838','#080808'];return shades[(Math.abs(q)*2+r*3)%shades.length];}
 const h=330-theta*1.1,s=C.clamp(.16+radius*.95,0,1);
 const variation=(((q*13+r*17+181)%7+7)%7-3)*.022;
 const light=C.clamp(.91-radius*.41+variation,.22,.95);
 return hueColor(h,s,light);
}
function createHoneycomb(){
 const svg=$('paintHoneycomb');if(svg.childNodes.length)return;
 const ns='http://www.w3.org/2000/svg',radius=9,rad=15.65;
 for(let r=-radius;r<=radius;r++)for(let q=-radius;q<=radius;q++){
  if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))>radius)continue;
  const x=275+Math.sqrt(3)*rad*(q+r/2),y=275+1.5*rad*r;
  const points=Array.from({length:6},(_,i)=>{const a=(i*60-90)*Math.PI/180;return (x+rad*Math.cos(a)).toFixed(2)+','+(y+rad*Math.sin(a)).toFixed(2);}).join(' ');
  const fill=hexPaletteColor(q,r,radius),p=document.createElementNS(ns,'polygon');
  p.setAttribute('points',points);p.setAttribute('fill',fill);p.setAttribute('aria-label','Choose '+fill);p.dataset.color=fill;
  p.addEventListener('click',()=>choosePaint(fill,true));svg.appendChild(p);
 }
}
function openPaintPalette(){
 if(state.race)return;
 paintPreviousFocus=document.activeElement;createHoneycomb();renderColors();$('paintStatus').textContent='Choose a colored hexagon or enter a custom value.';
 $('paintPaletteModal').classList.remove('hidden');$('closePaintPalette').focus();
}
function closePaintPalette(){
 $('paintPaletteModal').classList.add('hidden');paintPreviousFocus?.focus?.();
}
function submitPaintHex(){
 const v=$('paintHexInput').value.trim();if(choosePaint(v,true))return;
 $('paintStatus').textContent='Invalid color. Use # followed by six hexadecimal characters (0–9, A–F).';
}

function setMode(mode){if(state.race)return;if(mode==='grid'&&!requestLayoutApproval('grid'))return;state.mode=mode;
 for(const key of ['track','car','grid']){$(key+'Panel').classList.toggle('hidden',mode!==key);$(key+'Tab').classList.toggle('active',mode===key);}
 $('mainAction').innerHTML=mode==='track'?'CHOOSE CAR <span class="arrow">→</span>':mode==='car'?'SET UP RACE <span class="arrow">→</span>':'START RACE <span class="arrow">→</span>';
 $('previewKicker').textContent=mode==='track'?'NOT THE SAME OLD CIRCUIT.':mode==='car'?'FIND YOUR KIND OF FAST.':'YOUR TUNE. YOUR CHALLENGE.';
 $('previewTitle').innerHTML=mode==='track'?'Your circuit.<br><strong>Your rules.</strong>':mode==='car'?'Three machines.<br><strong>One starting line.</strong>':'Built by you.<br><strong>Won on the track.</strong>';
 $('viewBadge').textContent=mode==='track'?'● LIVE CIRCUIT PREVIEW':'● '+tunedSpecFor().name.toUpperCase()+' / '+Math.round(tunedSpecFor().maxSpeed*3.6)+' KM/H';
 $('viewHint').textContent=mode==='track'?'Scroll to zoom · Drag to orbit · Shift-drag to pan':'Drag to inspect car · Scroll to zoom · Explicit AI handicaps';
 $('ctaMeta').textContent=mode==='track'?'BUILD IT. THEN BEAT IT.':mode==='car'?'THE ENTIRE GRID USES YOUR SELECTED CLASS':state.opponents+' OPPONENTS / '+state.laps+' LAPS / EXPLICIT AI HANDICAPS';
 renderer.setTrack(state.track,mode==='track'?state.selected:-1);renderer.resetCamera();if(mode!=='track')setBlueprint(false);$('viewPlan').classList.toggle('hidden',mode!=='track');$('stage').classList.toggle('gridPreview',mode!=='track');updateNavigationUI();drawMaps();}
function setBlueprint(on){state.blueprint=on;$('blueprint').classList.toggle('show',on);$('viewPlan').classList.toggle('active',on);$('view3d').classList.toggle('active',!on);$('viewHint').textContent=on?'Scroll to zoom · Drag to pan · Double-click for a close-up':state.mode==='track'?'Scroll to zoom · Drag to orbit · Shift-drag to pan':'Drag to inspect car · Scroll to zoom · Explicit AI handicaps';drawMaps();updateNavigationUI();}
function drawMap(canvas,{large=false,racing=false}={}){
 const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const dpr=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(large){ctx.fillStyle='#142126';ctx.fillRect(0,0,w,h);}
 const b=state.track.viewBounds||state.track.bounds,margin=large?55:15,availableH=large?h-(state.inspecting?115:190):h,baseScale=Math.max(.001,Math.min((w-margin*2)/Math.max(1,b.maxX-b.minX),(availableH-margin*2)/Math.max(1,b.maxZ-b.minZ)));
 let scale=baseScale,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;const ox=w/2,oy=large?availableH/2+55:h/2;
 if(large&&state.plan.mode!=='fit'){scale=state.plan.scale||baseScale;cx=state.plan.cx??cx;cz=state.plan.cz??cz;}
 const project=p=>[ox+(p.x-cx)*scale,oy-(p.z-cz)*scale];canvas._projection={scale,baseScale,cx,cz,ox,oy};
 const pts=state.track.points;ctx.lineCap='round';ctx.lineJoin='round';
 if(large){
  // World-aligned metric grid, with spacing that remains legible at any zoom.
  const desired=55/scale,power=Math.pow(10,Math.floor(Math.log10(desired))),grid=[1,2,5,10].find(n=>n*power>=desired)*power;
  ctx.strokeStyle='#25393e';ctx.lineWidth=.7;const xmin=cx-ox/scale,xmax=cx+(w-ox)/scale,zmin=cz-(h-oy)/scale,zmax=cz+oy/scale;
  for(let x=Math.floor(xmin/grid)*grid;x<=xmax;x+=grid){const px=ox+(x-cx)*scale;ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,h);ctx.stroke();}
  for(let z=Math.floor(zmin/grid)*grid;z<=zmax;z+=grid){const py=oy-(z-cz)*scale;ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(w,py);ctx.stroke();}
 }
 ctx.beginPath();pts.forEach((p,i)=>{const [x,y]=project(p);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.lineWidth=large?state.config.segments[0].width*scale+5:6;ctx.strokeStyle=large?'#0c171a':'#344c4e';ctx.stroke();
 const roadStroke=(p,q,width,color)=>{const [x,y]=project(p),[u,v]=project(q),pad=width*.6+5;if(Math.max(x,u)<-pad||Math.min(x,u)>w+pad||Math.max(y,v)<-pad||Math.min(y,v)>h+pad)return;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(u,v);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();};
 if(large){for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];for(const side of [-1,1]){const w=p.width/2,v=q.width/2,r=side>0?p.runoffRight:p.runoffLeft,t=side>0?q.runoffRight:q.runoffLeft;if(!r&&!t)continue;const at=(a,o)=>project({x:a.x+Math.cos(a.h)*o,z:a.z-Math.sin(a.h)*o});const corners=[at(p,side*w),at(q,side*v),at(q,side*(v+t+1.5)),at(p,side*(w+r+1.5))];ctx.beginPath();corners.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=p.runoffSurface==='gravel'?'#66583e':p.runoffSurface==='grass'?'#354c30':'#364c4d';ctx.fill();}}}
 // Border and pavement are separate passes so dense samples never draw green disks.
 for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],color=p.seg===-1?'#dbaa76':p.seg===state.selected&&!racing?'#c4f16b':'#789a99';roadStroke(p,q,large?Math.max(3,p.width*scale+2):3,color);}
 if(large){for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];if(p.width*scale>5)roadStroke(p,q,p.width*scale-2,p.seg===state.selected?'#2d423a':p.seg===-1?'#4d4132':'#2a3b40');}
  if(scale>.6){for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];if(Math.floor(p.s/5)%2===0)roadStroke(p,q,Math.max(1,.10*scale),'#82978b');}}
 }
 if(large&&scale>.3){for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];for(const side of [-1,1]){const z=AFKerbs.atPoint(state.track,p,side);if(!z)continue;const off=side*(p.width/2+z.width*.5),O=side*(q.width/2+z.width*.5),a={x:p.x+Math.cos(p.h)*off,z:p.z-Math.sin(p.h)*off},b={x:q.x+Math.cos(q.h)*O,z:q.z-Math.sin(q.h)*O},rgb=AFKerbs.color(z,p.kerbU*state.track.length).map(v=>Math.round(v*255));roadStroke(a,b,Math.max(1,z.width*scale),'rgb('+rgb.join(',')+')');}}}
 for(let i=0;i<pts.length;i+=Math.max(1,Math.floor(pts.length/(large?16:7)))){const p=pts[i],[x,y]=project(p),a=-p.h+Math.PI/2;ctx.save();ctx.translate(x,y);ctx.rotate(-p.h);ctx.strokeStyle=large?'#d7dfb6':'#182b2c';ctx.lineWidth=large?1.7:1.2;ctx.beginPath();ctx.moveTo(-2.7,3);ctx.lineTo(0,-2);ctx.lineTo(2.7,3);ctx.stroke();ctx.restore();}
 const sp=state.track.sample(state.track.startS),[sx,sy]=project(sp);ctx.save();ctx.translate(sx,sy);ctx.rotate(-sp.h);ctx.fillStyle='#f3f4db';ctx.fillRect(-6,-2,12,4);ctx.restore();
 if(large){ctx.fillStyle='#c4f16b';ctx.font='10px Consolas,monospace';ctx.fillText('START / FINISH',sx+12,sy+4);for(let i=0;i<state.config.segments.length;i++){const p=pts.find(p=>p.seg===i);if(!p)continue;const [x,y]=project(p);ctx.fillStyle='#152529';ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle=i===state.selected?'#c4f16b':'#bbcbbd';ctx.font='9px Consolas,monospace';ctx.textAlign='center';ctx.fillText(pad(i+1),x,y+3);ctx.textAlign='left';}}
 if(racing&&state.race){for(const c of state.race.cars){const [x,y]=project(c);ctx.beginPath();ctx.arc(x,y,c.isPlayer?4.4:3.1,0,Math.PI*2);ctx.fillStyle=c.color;ctx.fill();if(c.isPlayer){ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.stroke();}}}
 if(large){const desired=100/scale,power=Math.pow(10,Math.floor(Math.log10(desired))),unit=[1,2,5,10].find(v=>v*power>=desired*.65)*power,len=unit*scale;ctx.strokeStyle='#d0dec7';ctx.lineWidth=2;const x=24,y=h-205;ctx.beginPath();ctx.moveTo(x,y-4);ctx.lineTo(x,y);ctx.lineTo(x+len,y);ctx.lineTo(x+len,y-4);ctx.stroke();ctx.fillStyle='#d0dec7';ctx.font='10px Consolas,monospace';ctx.fillText(unit>=1000?(unit/1000)+' km':unit+' m',x,y-11);}
 if(canvas.id==='minimap'&&state.inspecting&&state.mode==='track'){
  const target=state.blueprint?{x:state.plan.cx??cx,z:state.plan.cz??cz}:{x:renderer.editorTarget[0],z:renderer.editorTarget[2]},[x,y]=project(target),span=state.blueprint?Math.min(w,100/Math.max(state.plan.scale,.001)*scale):renderer.editorDistance*.45*scale;
  ctx.strokeStyle='#e5ecc3';ctx.lineWidth=1;ctx.strokeRect(x-Math.max(4,span),y-Math.max(3,span*.7),Math.max(8,span*2),Math.max(6,span*1.4));ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fillStyle='#e5ecc3';ctx.fill();
 }

}
function drawMaps(){if(!state.track)return;if(state.race)drawMap($('raceMap'),{racing:true});else{drawMap($('minimap'));if(state.blueprint)drawMap($('blueprint'),{large:true});}}
function setQuality(q){state.quality=['performance','balanced','quality'].includes(q)?q:'balanced';renderer.setQuality(state.quality);$('quality').value=state.quality;$('pauseQuality').value=state.quality;saveGarage();}
function clearInputs(){state.keys.clear();state.touchActions.clear();}
function playerInput(player){const pressed=action=>K.active(state.bindings,action,state.keys,state.touchActions),gas=pressed('throttle'),stop=pressed('brake'),left=pressed('left'),right=pressed('right');let throttle=0,brake=0;if(gas){if(player.speed<-.6)brake=1;else throttle=1;}if(stop){if(player.speed>.6)brake=1;else if(!gas)throttle=-.65;}if(gas&&stop){throttle=0;brake=1;}return {throttle,brake,steer:(right?1:0)-(left?1:0)};}
function updateNavigationUI(){
 const editing=state.mode==='track';$('editorTools').classList.toggle('hidden',!editing);$('stage').classList.toggle('inspecting',state.inspecting&&editing);
 const p=$('blueprint')._projection,zoom=state.blueprint?(p?p.scale/p.baseScale:1):renderer.editorFitDistance/renderer.editorDistance;$('zoomReadout').textContent=(zoom>=100?Math.round(zoom):zoom.toFixed(1))+'×';
 $('inspectionBadge').classList.toggle('hidden',!state.inspecting||!editing);$('inspectionBadge').textContent='SECTION '+pad(state.selected+1)+' SELECTED · '+(state.blueprint?'BLUEPRINT · DRAG TO PAN':'3D VIEW · CAMERA DISTANCE '+Math.round(renderer.editorDistance)+' m');
}
function fitViews(){renderer.fitEditor();state.plan={scale:null,cx:null,cz:null,mode:'fit'};state.inspecting=false;updateNavigationUI();drawMaps();updateNavigationUI();}
function focusSelected(close=true){const p=renderer.sectionPoint(state.selected);renderer.focusSection(state.selected,close);state.plan.cx=p.x;state.plan.cz=p.z;if(close||!state.plan.scale)state.plan.scale=Math.min(25,Math.max(1,$('stage').clientHeight/(p.width*6)));state.plan.mode='section';state.inspecting=true;updateNavigationUI();drawMaps();updateNavigationUI();}
function navigatePoint(p,close=true){if(p.seg>=0)selectSegment(p.seg,false);renderer.focusPoint(p,close);state.plan.cx=p.x;state.plan.cz=p.z;if(close||!state.plan.scale)state.plan.scale=Math.min(25,Math.max(1,$('stage').clientHeight/(p.width*6)));state.plan.mode='free';state.inspecting=true;updateNavigationUI();drawMaps();updateNavigationUI();}
function zoomView(factor,x=null,y=null){
 const previous=state.blueprint?$('blueprint')._projection:null;
 state.inspecting=true;updateNavigationUI();
 if(state.blueprint){drawMap($('blueprint'),{large:true});const now=$('blueprint')._projection,p=previous||now;if(!p||!now)return;const r=$('blueprint').getBoundingClientRect(),px=x===null?p.ox:x-r.left,py=y===null?p.oy:y-r.top,wx=(px-p.ox)/p.scale+p.cx,wz=-(py-p.oy)/p.scale+p.cz,scale=C.clamp(p.scale/factor,now.baseScale*.40,25);state.plan={scale,cx:wx-(px-now.ox)/scale,cz:wz+(py-now.oy)/scale,mode:'free'};
 }else renderer.zoomEditor(factor,x,y);
 drawMaps();updateNavigationUI();
}

function panPlan(dx,dy){const p=$('blueprint')._projection;if(!p)return;state.plan={scale:p.scale,cx:p.cx-dx/p.scale,cz:p.cz+dy/p.scale,mode:'free'};state.inspecting=true;updateNavigationUI();drawMaps();}
function planPoint(event,canvas=$('blueprint')){const p=canvas._projection;if(!p)return null;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left-p.ox)/p.scale+p.cx,z=-(event.clientY-r.top-p.oy)/p.scale+p.cz,q=state.track.nearest(x,z);if(canvas.id==='blueprint'&&q.distance*p.scale>Math.max(15,q.width*p.scale*.65))return null;return state.track.sample(q.s);}
function syncBindingLabels(){
 const key=a=>K.label(state.bindings[a].find(Boolean));$('driveKeys').textContent=['throttle','left','brake','right'].map(key).join(' ');$('cameraKey').textContent=key('camera');$('resetKey').textContent=key('reset');$('pauseBtn').textContent='ESC / '+key('pause')+' / PAUSE';$('soundBtn').textContent=key('sound')+' / SOUND '+(state.sound?'ON':'OFF');
 $('helpKeys').textContent='';for(const a of K.ACTIONS){const k=document.createElement('strong'),v=document.createElement('span');k.textContent=(a.id==='pause'?'Esc / ':'')+state.bindings[a.id].filter(Boolean).map(K.label).join(' / ');v.textContent=a.label;$('helpKeys').append(k,v);}
}
function persistBindings(){syncBindingLabels();try{localStorage.setItem('apex-foundry.controls.v2',JSON.stringify({version:2,bindings:state.bindings}));$('controlsSaved').textContent='SAVED ON THIS DEVICE.';}catch(e){$('controlsSaved').textContent='BROWSER STORAGE UNAVAILABLE · APPLIED FOR THIS SESSION ONLY.';}}
function renderBindings(){
 const list=$('bindingRows');list.textContent='';let group='';for(const a of K.ACTIONS){if(group!==a.group){const h=document.createElement('div');h.className='bindingGroup';h.textContent=a.group;list.appendChild(h);group=a.group;}
  const row=document.createElement('div');row.className='bindingRow';const label=document.createElement('label');label.textContent=a.label;row.appendChild(label);
  for(let slot=0;slot<2;slot++){const wrap=document.createElement('div');wrap.className='bindingSlot';const button=document.createElement('button'),code=state.bindings[a.id][slot];button.id='binding-'+a.id+'-'+slot;button.className='bindKey'+(!code?' empty':'');button.dataset.action=a.id;button.dataset.slot=slot;button.textContent=K.label(code);button.setAttribute('aria-label',a.label+', '+(slot?'alternate':'primary')+', '+K.label(code));
   if(state.capture?.action===a.id&&state.capture.slot===slot){button.classList.add('capturing');button.textContent='Press key…';}
   button.onclick=()=>{clearInputs();state.capture={action:a.id,slot};renderBindings();$('captureStatus').classList.remove('error');$('captureStatus').textContent='Press a key for '+a.label+'. Esc cancels.';$('binding-'+a.id+'-'+slot).focus();};wrap.appendChild(button);
   const clear=document.createElement('button');clear.className='clearBinding';clear.textContent='×';clear.setAttribute('aria-label','Clear '+a.label+' '+(slot?'alternate':'primary'));clear.disabled=!code||!state.bindings[a.id][1-slot];clear.onclick=()=>{state.capture=null;try{state.bindings=K.clear(state.bindings,a.id,slot);persistBindings();renderBindings();$('captureStatus').textContent='Key removed.';$('captureStatus').classList.remove('error');}catch(e){$('captureStatus').textContent=e.message;}};wrap.appendChild(clear);row.appendChild(wrap);
  }list.appendChild(row);
 }
}
function openControls(){pause();clearInputs();state.capture=null;renderBindings();$('controlsModal').classList.remove('hidden');$('captureStatus').textContent='Select a key to change it.';$('captureStatus').classList.remove('error');$('closeControls').focus();}
function closeControls(){state.capture=null;clearInputs();$('controlsModal').classList.add('hidden');(state.race?$('resumeBtn'):$('controlsBtn')).focus();}
function captureKey(e){e.preventDefault();e.stopPropagation();if(e.repeat)return;if(e.code==='Escape'){state.capture=null;renderBindings();$('captureStatus').textContent='Key capture cancelled.';return;}const {action,slot}=state.capture;try{const result=K.assign(state.bindings,action,slot,e.code);state.bindings=result.bindings;state.capture=null;persistBindings();renderBindings();$('captureStatus').classList.remove('error');$('captureStatus').textContent=K.ACTIONS.find(a=>a.id===action).label+' → '+K.label(e.code)+(result.swapped?' · Swapped with '+result.swapped+'.':'.');$('binding-'+action+'-'+slot).focus();}catch(error){$('captureStatus').classList.add('error');$('captureStatus').textContent=error.message;}}

const carDescriptions={
 sedan:'The original street coupe: predictable handling and moderate acceleration. Factory top speed: 216 km/h. Settings can change its base tune.',
 rally:'A compact wide-body rally hatch with strong acceleration, powerful brakes and responsive grip driving. Drift, charge and boost mechanics have been removed.',
 f1:'A low, open-wheel single-seater with front and rear wings, exposed suspension and an open cockpit. Exceptional grip and responsive steering. Factory braking: 42 m/s²; all base performance parameters are editable.'};
function renderCarSelection(){
 const list=$('carChoices');list.textContent='';
 for(const id of Object.keys(C.CARS)){const v=tunedSpecFor(id);const button=document.createElement('button');button.className='carChoice'+(id===state.carClass?' active':'');button.dataset.car=id;button.setAttribute('aria-pressed',id===state.carClass?'true':'false');
  const body=id==='f1'?'<path d="M8 24h52v4H8z M16 21l11-7h16l5 7z M8 20h7v11H8z M51 20h8v11h-8z M24 13h14v3H24z"/>':id==='rally'?'<path d="M7 25V14h7l4-7h25l8 12 8 4v7H7z M5 12h18v3H5z"/>':'<path d="M5 23l12-3 9-10h19l9 11 8 3v7H5z"/>';
  button.innerHTML='<svg viewBox="0 0 68 40" aria-hidden="true" fill="currentColor">'+body+'<circle cx="18" cy="30" r="7" fill="#102027"/><circle cx="50" cy="30" r="7" fill="#102027"/><circle cx="18" cy="30" r="3"/><circle cx="50" cy="30" r="3"/></svg><div><strong>'+v.name+'</strong><small>'+Math.round(v.maxSpeed*3.6)+' KM/H · '+(id==='sedan'?'STREET':id==='rally'?'GRIP / RALLY':'MAXIMUM GRIP')+'</small></div>';
  button.onclick=()=>selectCar(id);list.appendChild(button);
 }
 const v=tunedSpecFor();$('carClassTag').textContent=state.carClass.toUpperCase();$('carTopSpeed').textContent=Math.round(v.maxSpeed*3.6);$('carBraking').textContent=Number(v.braking.toFixed(2));$('carDescription').textContent=carDescriptions[v.id];$('rallyInstruction').classList.toggle('hidden',v.id!=='rally');$('gridCarName').textContent=v.name;
 $('gridSpecSpeed').innerHTML=Math.round(v.maxSpeed*3.6)+'<span>KM/H LIMIT</span>';$('gridSpecBrake').innerHTML=v.braking.toFixed(1)+'<span>M/S² BRAKING</span>';
 const stats=[['Acceleration',v.acceleration,22,'m/s²'],['Base grip',v.grip,62,'m/s²'],['Steering',v.steerResponse,26,'/ s']];$('carHandling').textContent='';
 for(const [label,value,max,unit] of stats){const row=document.createElement('div');row.className='handlingRow';row.innerHTML='<span>'+label+'</span><div class="handlingBar"><i style="width:'+Math.round(C.clamp(value/max,0,1)*100)+'%"></i></div><b>'+value+'</b>';row.title=value+' '+unit;$('carHandling').appendChild(row);}
}
function selectCar(id){if(!C.CARS[id]||state.race)return;state.carClass=id;invalidateBenchmark();renderCarSelection();rebuildPreview();saveRaceSettings();if(state.mode!=='track')setMode(state.mode);}
function referenceKey(){return layoutKey()+'|'+state.carClass+'|'+C.specKey(tunedSpecFor());}
function paceKey(){return referenceKey()+'|'+state.benchmarkTime+'|'+state.hardRatio+'|'+state.referenceRevision+'|'+JSON.stringify(state.trackLimitRules)+'|'+JSON.stringify(currentAIGroups());}
function invalidateBenchmark(){
 if(state.benchmarkKey&&state.benchmarkKey!==referenceKey()){state.benchmarkEnabled=false;state.benchmarkTime=null;state.benchmarkKey=null;state.lapReference=null;state.referenceRevision++;$('benchmarkTime').value='';}
 if(state.calibrationKey!==paceKey()){state.calibration=null;state.calibrationKey=null;state.calibrationToken++;}
 syncBenchmarkUI();
}
function saveRaceSettings(){
 try{localStorage.setItem('apex-foundry.race.v6',JSON.stringify({carClass:state.carClass,aiPercents:state.aiPercents,difficulties:state.difficulties,opponents:state.opponents,benchmarkTime:state.benchmarkTime,benchmarkEnabled:state.benchmarkEnabled,benchmarkKey:state.benchmarkKey,hardRatio:state.hardRatio,penaltySeconds:state.penaltySeconds,trackLimitRules:state.trackLimitRules,gridSpacing:state.gridSpacing,launchStagger:state.launchStagger,color:state.color,reference:state.lapReference}));state.referenceStored=true;}
 catch(e){state.referenceStored=false;if(state.lapReference)toast('Browser storage is full or unavailable. Export your qualifying telemetry to keep it.',true);}
}
function setBenchmark(value,source='Manual reference',reference=undefined){
 const parsed=C.parseLapTime(value);if(!parsed)throw Error('Enter a lap time first.');
 if(reference!==undefined){state.lapReference=reference?AFPace.validateReference(reference,state.track,state.carClass,tunedSpecFor()):null;state.referenceRevision++;}
 state.benchmarkTime=parsed;state.benchmarkEnabled=true;state.benchmarkKey=referenceKey();state.calibration=null;state.calibrationKey=null;state.calibrationToken++;$('benchmarkTime').value=formatTime(state.benchmarkTime);saveRaceSettings();syncBenchmarkUI();toast(source+' set: '+formatTime(state.benchmarkTime)+'. Calibrate AI or start the race.');
}
function exportReference(){
 if(!state.lapReference)return;const data={format:'apex-foundry-qualifying',version:1,key:referenceKey(),benchmarkTime:state.benchmarkTime,telemetry:state.lapReference},blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Apex-qualifying-'+state.carClass+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importReference(file){
 if(!file)return;if(file.size>12*1024*1024)throw Error('Telemetry file is too large.');
 const data=JSON.parse(await file.text());if(data.format!=='apex-foundry-qualifying'||data.version!==1||data.key!==referenceKey())throw Error('Load the same circuit, dimensions, direction and car before importing this lap.');
 setBenchmark(data.benchmarkTime,'Imported clean lap',AFPace.validateReference(data.telemetry,state.track,state.carClass,tunedSpecFor()));
}
function syncBenchmarkUI(){
 $('benchmarkEnabled').checked=state.benchmarkEnabled;$('hardTarget').value=Math.round(state.hardRatio*100);for(const [id,key]of [['runoffGrace','grace'],['runoffSpeed','speedKmh'],['runoffReturn','returnSeconds']])$(id).value=state.trackLimitRules[key];$('gridSpacing').value=state.gridSpacing;$('launchStagger').value=state.launchStagger;
 const ref=state.lapReference,summary=ref?.summary; $('referenceSummary').textContent=ref?summary.samples.toLocaleString()+' local samples · '+summary.brakingZones+' braking zones · '+Math.round(summary.peakKmh)+' km/h peak. '+(state.referenceStored?'Saved on this device.':'Session only: export to keep.'):'No recorded lap. A typed time optimizes a geometry-based driving profile; it cannot reveal your line or inputs.';$('exportReference').disabled=!ref;
 $('referenceMode').textContent=ref?'RECORDED LINE + INPUTS':'TIME-ONLY BENCHMARK';
 if(state.calibrationBusy)return;
 const status=$('benchmarkStatus');status.classList.remove('error');status.textContent=state.benchmarkTime?(state.benchmarkEnabled?'Reference '+formatTime(state.benchmarkTime)+' · '+tunedSpecFor().name+'. '+(state.calibration?'Legal solo pace measured; each AI generates new variations per lap. Traffic can change actual times.':'AI will be calibrated before the race.'):'Benchmark disabled. Standard difficulty settings apply.'):'No benchmark set. Record a flying lap to teach the AI your line, acceleration and braking zones.';
 const list=$('paceResults');list.textContent='';
 if(state.benchmarkEnabled&&state.calibration){const caption=document.createElement('p');caption.className='paceLegend';caption.textContent='LEVEL / REQUESTED / MEASURED CLEAN SOLO';list.appendChild(caption);
  for(const [name,p] of Object.entries(state.calibration)){const row=document.createElement('div');row.className='paceRow';row.innerHTML='<strong>'+name.replace('@',' · ').toUpperCase()+'%'+'</strong><span>'+formatTime(p.target)+'</span><span>'+formatTime(p.estimated)+'</span>';list.appendChild(row);
   const source=document.createElement('p');source.className='paceLegend';source.textContent='Profile: '+p.source+' · '+p.trials+' optimization trials';list.appendChild(source);
   if(p.limited||p.rangeLimited||!p.valid){const note=document.createElement('p');note.className='paceLegend';note.textContent=name.toUpperCase()+': '+(p.limited?'requested lap is faster than the clean runs this optimizer found. Fastest measured clean pace used; your explicitly boosted vehicle limits still apply.':p.rangeLimited?'requested lap is outside the supported pace range. Slowest supported pace used.':'calibration lap exceeded track limits; treat this estimate cautiously.');list.appendChild(note);}
  }
 }
}
async function calibrateAI(){
 if(state.calibrationBusy)return false;
 if(!state.benchmarkEnabled||!state.benchmarkTime){toast('Set or record a benchmark first.',true);return false;}
 if(state.calibration&&state.calibrationKey===paceKey())return true;
 const key=paceKey(),token=++state.calibrationToken;state.calibrationBusy=true;$('calibrateAI').disabled=true;$('mainAction').disabled=true;$('benchmarkStatus').classList.remove('error');
 try{
  const result={},groups=currentAIGroups(),baseSpec=tunedSpecFor(),percentages=[...new Set(groups.map(g=>g.percent))];
  for(const percent of percentages){
   const difficulties=[...new Set(groups.filter(g=>g.percent===percent).map(g=>g.difficulty))],boost=percent/100;
   const batch=await AFPace.calibrate(state.track,state.carClass,state.benchmarkTime/boost,state.hardRatio,{spec:C.scaledSpec(baseSpec,percent),referenceSpec:baseSpec,referenceSpeedScale:boost,difficulties,reference:state.lapReference,trackLimitRules:state.trackLimitRules,yieldFrame:()=>new Promise(resolve=>setTimeout(resolve,0)),cancelled:()=>token!==state.calibrationToken,onProgress:message=>{$('benchmarkStatus').textContent=percent+'% performance · '+message+' Measuring the actual boosted car.';}});
   for(const [difficulty,cal]of Object.entries(batch))result[aiGroupKey(difficulty,percent)]={...cal,percent,difficulty};
  }
  if(token!==state.calibrationToken||key!==paceKey())return false;state.calibration=result;state.calibrationKey=key;rebuildPreview();return true;
 }catch(e){$('benchmarkStatus').textContent=e.message;$('benchmarkStatus').classList.add('error');toast(e.message,true);return false;}
 finally{state.calibrationBusy=false;$('calibrateAI').disabled=false;$('mainAction').disabled=false;if(state.calibration)syncBenchmarkUI();}
}
async function startRace(kind='race'){
 if(typeof kind!=='string')kind='race';const qualifying=kind==='qualifying';if(state.calibrationBusy)return;
 if(!qualifying&&onlineClient?.role==='guest'){toast('Only the host can start or restart the online race.',true);return;}
 if(!qualifying&&onlineClient?.role==='host'&&(!onlineClient.connected||onlineClient.players.length<2)){toast('Invite at least one other driver before starting online.',true);openOnlineMenu();return;}
 if(!requestLayoutApproval(qualifying?'qualifying':'race'))return;
 if(!qualifying&&state.benchmarkEnabled&&!(await calibrateAI()))return;
 state.laps=C.clamp(Math.round(Number($('laps').value)||3),1,10);$('laps').value=state.laps;state.camera=Number($('startCamera').value)||1;
 state.raceSeed=C.hash32(state.raceSeed+1);const grid=makeGrid(qualifying);state.race={cars:grid.cars,player:grid.player,time:0,countdown:3,paused:false,finished:false,laps:qualifying?2:state.laps,kind:qualifying?'qualifying':'race',resultsOpen:false,gridLayout:grid.layout,recorder:qualifying?AFPace.createRecorder(state.track,state.carClass):null,onlineRole:!qualifying&&onlineClient?.role==='host'?'host':null};
 clearInputs();accumulator=0;renderer.setTrack(state.track,-1);renderer.resetCamera();document.body.classList.add('racing');$('pauseModal').classList.add('hidden');$('resultsModal').classList.add('hidden');$('blueprint').classList.remove('show');$('countdown').classList.remove('hidden');$('countdown').classList.remove('small');$('hudField').textContent=state.race.cars.length;$('hudLaps').textContent=pad(state.race.laps);$('cameraLabel').textContent=state.camera===1?'01 / CHASE CAMERA':'03 / HOOD CAMERA';if(state.sound)initAudio();updateHud();window.scrollTo(0,0);
 if(state.race.onlineRole==='host'){
  remoteInputs.clear();onlineTick=0;onlineSeq=0;
  state.race.waitingForDrivers=true;state.race.paused=true;state.race.readyIds=new Set();
  const settings={version:1,track:state.config,carClass:state.carClass,tune:C.tuneValues(tunedSpecFor()),laps:state.race.laps,gridSpacing:state.gridSpacing,launchStagger:state.launchStagger,seed:state.raceSeed,trackLimitRules:state.trackLimitRules,
   cars:state.race.cars.map(c=>({id:c.id,name:c.name,color:c.color,grid:c.grid,difficulty:c.difficulty,performancePercent:c.performancePercent,isHuman:!!c.isHuman,ownerId:c.ownerId||null}))};
  onlineClient.send({type:'start',settings});$('onlineModal').classList.add('hidden');
  const pendingRace=state.race;
  setTimeout(()=>{
   if(state.race!==pendingRace||!pendingRace.waitingForDrivers)return;
   for(const person of onlineClient?.players.filter(p=>p.id!==onlineClient.id)||[]){
    if(!pendingRace.readyIds.has(person.id)){const car=pendingRace.cars.find(c=>c.ownerId===person.id);if(car)car.disconnected=true;}
   }
   pendingRace.waitingForDrivers=false;pendingRace.paused=false;toast('Race started. Drivers who did not load in time are DNF.',true);updateOnlineUI();
  },20000);
 }
 updateOnlineUI();
}
function pause(){if(state.race?.onlineRole==='guest'){toast('Only the host can pause an online race. Use LEAVE ROOM to exit.',true);return;}if(!state.race||state.race.finished||state.race.paused||state.race.resultsOpen)return;state.race.paused=true;clearInputs();accumulator=0;$('pauseDescription').textContent=state.config.name+' · '+formatTime(state.race.time)+' elapsed.';$('pauseModal').classList.remove('hidden');updateAudio();}
function resume(){if(state.race?.onlineRole==='guest'||state.race?.waitingForDrivers)return;if(!state.race||state.race.finished)return;state.race.paused=false;clearInputs();accumulator=0;$('pauseModal').classList.add('hidden');}
function exitRace(skipNetwork=false){if(!skipNetwork&&state.race?.onlineRole){leaveOnline(true);return;}state.race=null;clearInputs();accumulator=0;document.body.classList.remove('racing');$('pauseModal').classList.add('hidden');$('resultsModal').classList.add('hidden');$('wrongWay').classList.add('hidden');renderer.resetCamera();setMode('track');setBlueprint(state.blueprint);updateAudio();}
function switchCamera(camera){state.camera=camera|| (state.camera===1?3:1);renderer.resetCamera();$('cameraLabel').textContent=state.camera===1?'01 / CHASE CAMERA':'03 / HOOD CAMERA';}
function raceOrder(){const cars=state.race.cars;return [...C.classification(cars.filter(c=>!c.disconnected)),...cars.filter(c=>c.disconnected)];}
function renderResults(){
 const r=state.race,qual=r.kind==='qualifying',order=raceOrder(),pos=order.indexOf(r.player)+1;
 $('resultsTitle').textContent=qual?(r.player.lastLapValid?'Qualifying lap saved.':'Qualifying lap invalid.'):!r.finished?'Provisional results.':pos===1?'The circuit is yours.':'Across the line.';
 $('resultsSubtitle').textContent=state.config.name+' · '+tunedSpecFor().name+' · '+(qual?'Out-lap + flying lap':r.laps+' laps · '+pos+' / '+r.cars.length);
 $('resultTimeLabel').textContent=qual?'FLYING LAP':'RACE TIME';$('resultTimingHeading').textContent=qual?'FLYING LAP':'TIME / STATUS';$('resultTime').textContent=formatTime(qual?r.player.lastLap:r.player.finishTime);$('resultBest').textContent=formatTime(r.player.bestLap);
 const body=$('resultsBody');body.textContent='';order.forEach((c,i)=>{const tr=document.createElement('tr');if(c.isPlayer)tr.className='player';for(const txt of [pad(i+1),c.isPlayer?'YOU':c.isHuman?c.name+' / ONLINE':c.name+' / '+c.difficulty+' '+c.performancePercent+'%',c.disconnected?'DNF · LOST CONNECTION':c.finished?formatTime(qual?c.lastLap:c.finishTime):(r.finished?'DNF · ':'Racing · ')+Math.max(0,Math.min(99.9,c.progress/(state.track.length*r.laps)*100)).toFixed(1)+'%',(c.damage||0).toFixed(1)+'%']){const td=document.createElement('td');td.textContent=txt;tr.appendChild(td);}body.appendChild(tr);});
 $('resultsNote').textContent=qual?(r.player.lastLapValid?'Your clean flying lap and driving telemetry are now the benchmark. Race Setup shows its sample count and braking zones. Calibrate or start racing to generate AI driving variants.':'A reset, collision, or track-limit excursion invalidated the flying lap. Your previous benchmark was not replaced. Retry for a clean reference.'):
 r.finished?'Classification uses elapsed finish time. Crash damage slows cars during the race; no crash time penalty is added. Runoff restrictions are served while driving. DNF drivers are ranked by progress.':'Opponents are still finishing. Provisional positions can change as cars finish. '+Math.max(0,Math.ceil(60-(r.time-r.waitStart)))+' simulated seconds remaining.';
 $('finalizeResults').classList.toggle('hidden',r.finished||qual||r.onlineRole==='guest');$('raceAgain').textContent=r.onlineRole==='guest'?'WAITING FOR HOST…':qual?'RETRY QUALIFYING →':r.onlineRole==='host'?'RESTART ONLINE RACE →':'RACE AGAIN →';$('raceAgain').disabled=r.onlineRole==='guest';$('resultsEditor').textContent=r.onlineRole?'Leave multiplayer':qual?'Back to Race Setup':'Edit circuit';
 if(r.onlineRole)$('resultsNote').textContent=r.onlineRole==='guest'?'Results come from the host. Only the host can start the next race.':'The host simulates every car. Restart starts a new race with the same connected players; leaving closes this room.';
}
function finishRace(final=true){const r=state.race;if(!r)return;
 if(!r.resultsOpen){r.resultsOpen=true;r.waitStart=r.time;clearInputs();
  if(r.kind==='qualifying'&&r.player.lastLapValid){const reference=AFPace.finalizeRecorder(r.recorder);setBenchmark(r.player.lastLap,reference?'Clean lap + driving telemetry':'Clean flying lap',reference);r.benchmarkSaved=true;}
 }
 r.finished=final;renderResults();$('resultsModal').classList.remove('hidden');updateAudio();
}
function stepRace(dt){
 const r=state.race;if(!r||r.paused||r.finished)return;if(r.countdown>0){r.countdown=Math.max(0,r.countdown-dt);return;}r.time+=dt;
 for(const c of r.cars){if(c.finished||c.disconnected)continue;
  let input;
  if(c.isPlayer)input=playerInput(c);
  else if(c.remotePlayerId){const remote=remoteInputs.get(c.remotePlayerId);input=remote&&performance.now()-remote.t<850?remote.control:{throttle:0,brake:1,steer:0};}
  else input=C.aiControl(c,state.track,r.cars.filter(v=>!v.disconnected),dt);
  C.stepCar(c,input,state.track,dt);
 }
 C.collideCars(r.cars.filter(c=>!c.disconnected));
 for(const c of r.cars){if(c.finished||c.disconnected)continue;const w=C.wheelStatus(c,state.track);if(w.allOutside)c.lapInvalid=true;C.updateTiming(c,state.track,r.time,r.laps);if(c.isPlayer&&r.recorder)AFPace.recordStep(r.recorder,c,state.track,r.time,dt);}
 if(r.player.finished){if(!r.resultsOpen)finishRace(r.kind==='qualifying'||r.cars.every(c=>c.finished));else if(!r.finished&&(r.cars.every(c=>c.finished)||r.time-r.waitStart>=60))finishRace(true);}
}
function updateHud(){const r=state.race;if(!r)return;const player=r.player,order=raceOrder(),rank=order.indexOf(player)+1,v=Math.abs(player.speed)*3.6;$('hudPosition').textContent=rank;$('hudLap').textContent=pad(Math.min(r.laps,player.lap+1));$('hudTime').textContent=formatTime(r.time);$('hudLapTime').textContent=formatTime(player.finished?player.lastLap:player.started?r.time-player.lapStart:0);$('hudBest').textContent=formatTime(player.bestLap);$('speed').textContent=String(Math.round(v)).padStart(3,'0');const engine=AFAudio.engineState(player);$('gear').textContent=engine.gear;$('rpmFill').style.width=String(100*engine.rpm/engine.redline)+'%';const control=playerInput(player);$('pedalLabel').textContent=r.countdown>0?'READY TO RACE':r.time<player.launchDelay?'YOUR START IN '+(player.launchDelay-r.time).toFixed(1)+'s':control.brake?'BRAKING':control.throttle<0?'REVERSE':control.throttle?'THROTTLE':'COASTING';$('telemetry').textContent=Math.round(state.fps)+' FPS · '+(r.onlineRole==='guest'?'HOST-SYNCED PHYSICS':'60 HZ PHYSICS')+' · '+renderer.drawCalls+' DRAW CALLS';$('wrongWay').classList.toggle('hidden',!(r.countdown<=0&&Math.abs(C.angle(player.heading-player.road.h))>Math.PI*.59&&Math.abs(player.speed)>3));
 if(r.countdown>0){$('countdown').textContent=Math.ceil(r.countdown);$('countdown').classList.remove('hidden');}else if(r.time<player.launchDelay){$('countdown').textContent='HOLD';$('countdown').classList.remove('hidden');}else if(r.time<player.launchDelay+.8){$('countdown').textContent='GO';$('countdown').classList.remove('hidden');}else $('countdown').classList.add('hidden');
 updateRaceExtras();if(r.resultsOpen)renderResults();
 const board=$('leaderboard');board.textContent='';let shown=order.slice(0,6);if(rank>6)shown=[...order.slice(0,5),player];for(const c of shown){const row=document.createElement('div');row.className='leaderRow'+(c.isPlayer?' you':'');const place=document.createElement('span');place.className='place';place.textContent=String(order.indexOf(c)+1);const dot=document.createElement('span');dot.className='colorDot';dot.style.background=c.color;const name=document.createElement('span');name.className='driver';name.textContent=(c.isPlayer?'YOU':c.name)+(!c.isPlayer&&!c.isHuman?' '+c.performancePercent+'%':'')+((c.runoffLatched||c.limitRemaining>0)?' [CAP]':'')+(c.damage>=.1?' ['+Math.round(c.damage)+'% DMG]':'');const gap=document.createElement('span');gap.className='gap';gap.textContent=c.finished?'FIN':c===order[0]?'LEAD':Math.round(Math.max(0,order[0].progress-c.progress))+' m';row.append(place,dot,name,gap);board.appendChild(row);}drawMaps();
}
function updateRaceExtras(){
 const r=state.race,p=r.player,v=tunedSpecFor();
 $('raceContext').textContent=v.name.toUpperCase()+' · '+(r.kind==='qualifying'?(p.lap===0?'OUT-LAP · NEXT LAP IS RECORDED':p.lapInvalid?'FLYING LAP · INVALID':'FLYING LAP · RECORDING INPUTS'):state.benchmarkEnabled?'REFERENCE '+formatTime(state.benchmarkTime):r.cars.length>1?'AI '+Math.min(...r.cars.filter(c=>!c.isPlayer).map(c=>c.performancePercent))+'–'+Math.max(...r.cars.filter(c=>!c.isPlayer).map(c=>c.performancePercent))+'%':'SOLO TIME TRIAL');
 if(r.onlineRole)$('raceContext').textContent='ONLINE · ROOM '+onlineClient?.room+' · '+onlineClient?.players.length+' HUMAN DRIVERS'+(r.waitingForDrivers?' · WAITING FOR GUESTS':r.paused?' · HOST PAUSED':'');
 const active=p.runoffLatched||p.limitRemaining>0,lim=$('limitHud');lim.classList.toggle('hidden',!(p.offTrack||active));lim.classList.toggle('restricted',active);
 $('limitTitle').textContent=active?'SPEED LIMIT · '+p.trackLimitRules.speedKmh+' KM/H':'ALL 4 TYRES OUTSIDE';
 $('limitDetail').textContent=active?(p.offTrack?'RETURN TO TRACK · TIMER PAUSED':p.limitRemaining.toFixed(1)+' s LEFT ON TRACK'):p.offTrack?Math.max(0,p.trackLimitRules.grace-p.offTrackTime).toFixed(2)+' s TO SPEED CAP'+(r.kind==='qualifying'?' · LAP INVALID':''):'';
 $('limitFill').style.width=(active?(p.offTrack?100:100*p.limitRemaining/Math.max(.01,p.trackLimitRules.returnSeconds)):100*p.offTrackTime/p.trackLimitRules.grace)+'%';
 let event=null,driver=null;for(const c of r.cars){const e=c.incidents.at(-1);if(e&&c.simTime-e.time<4&&(!event||e.time>event.time)){event=e;driver=c;}}
 const notice=$('raceNotice');notice.classList.toggle('hidden',!event);
 notice.textContent=event?driver.name+' +'+event.damage.toFixed(1)+'% DAMAGE · '+event.reason:'';
 $('damageLabel').textContent='DAMAGE '+(p.damage||0).toFixed(1)+'%';$('conditionLabel').textContent=(C.damageFactor(p.damage)*100).toFixed(1)+'% PERFORMANCE';$('damageFill').style.width=(p.damage||0)+'%';$('damageHud').classList.toggle('damaged',p.damage>.1);
}
function initAudio(){if(audio){audio.resume().catch(()=>{});return;}try{audio=new AFAudio.Engine(state.audioSettings);audio.resume().catch(()=>{});}catch(e){state.sound=false;toast('Audio unavailable: '+e.message,true);}}
function toggleSound(){state.sound=!state.sound;if(state.sound)initAudio();saveGarage();syncBindingLabels();updateAudio();}
function updateAudio(dt=.03){if(!audio)return;const preview=state.audioPreview,now=performance.now();if(preview&&now<preview.end){const t=(now-preview.start)/1000,v=t<4?t/4:(6-t)/2,spec=tunedSpecFor(preview.carClass),dummy={carClass:preview.carClass,spec,speed:Math.max(0,v)*spec.maxSpeed*.85,control:{throttle:t<4?1:0,brake:t>4?1:0},wheelspin:t<1?.35:0,tyreScrub:t>2&&t<3?.25:0,damageRevision:0};audio.update(dummy,true,dt);return;}if(preview){state.audioPreview=null;showGarageStatus('Sound preview finished.');}const r=state.race,active=state.sound&&r&&!r.paused&&!r.finished&&r.countdown<=0;audio.update(r?.player,active,dt);}
function fullscreen(){try{if(!document.fullscreenElement){const p=document.documentElement.requestFullscreen?.();if(p?.catch)p.catch(()=>toast('Fullscreen is unavailable in this browser.',true));}else document.exitFullscreen?.();}catch(e){toast('Fullscreen is unavailable.',true);}}
let librarySelected='albert_park',libraryPrevious=null;
function updateMappedInspector(){
 const mapped=state.config.geometry==='mapped',seg=state.config.segments[state.selected];
 for(const id of ['segmentType','addStraight','addCorner','duplicate'])$(id).disabled=mapped;
 $('mappedTypeOption').hidden=!mapped;
 if(mapped){
  $('segmentType').value='mapped';$('lengthField').classList.remove('hidden');$('angleField').classList.add('hidden');$('radiusField').classList.add('hidden');
  $('segmentLength').value=Number(C.segmentLength(seg).toFixed(1));
  for(const id of ['moveUp','moveDown','deleteSegment'])$(id).disabled=true;
  $('inspectorTitle').textContent='SURFACE ZONE '+pad(state.selected+1);
  const prev=state.config.segments[(state.selected+state.config.segments.length-1)%state.config.segments.length],rise=seg.elevation-prev.elevation;
  $('segmentGrade').value=Number((100*rise/C.segmentLength(seg)).toFixed(3));$('segmentRise').value=Number(rise.toFixed(3));
 }
 $('segmentLength').readOnly=mapped;
 $('lengthLabel').textContent=mapped?'Mapped zone length':'Straight length';
 $('bankLabel').textContent=mapped?'Extra banking':'Camber / banking';
 $('gradeLabel').textContent=mapped?'Extra incline':'Average incline';
 $('riseLabel').textContent=mapped?'Extra height change':'Elevation change';
 $('sectionHint').textContent=mapped?'Mapped shape is preserved. Zones are editing intervals, not numbered corners. Width and runoff are absolute; banking and height changes are added to the reconstructed profile. Changing one height endpoint also changes the neighboring zone slope.':'Positive banking lowers the right edge. Elevation transitions are smoothed; incline is the section average.';
}
function updateCircuitContext(){
 const mapped=state.config.geometry==='mapped',box=$('circuitContext');box.classList.toggle('hidden',!mapped);
 if(!mapped)return;
 const m=state.config.source||{},min=Math.min(...state.config.segments.map(s=>s.width)),max=Math.max(...state.config.segments.map(s=>s.width));
 $('circuitContextTitle').textContent=m.modified?'MAPPED CIRCUIT · CUSTOMIZED':'MAPPED CIRCUIT · REFERENCE DIMENSIONS';
 $('circuitContextText').textContent=(m.corners||'—')+' source corners · '+(m.length/1000).toFixed(3)+' km catalog · '+min.toFixed(1)+(max-min>.05?'–'+max.toFixed(1):'')+' m modeled width. '+(m.widthEvidence||'Estimated')+'.';
 $('circuitContextInfo').onclick=()=>openCircuitLibrary(m.id);
}
function openCircuitLibrary(id){if(state.race)return;if(AFCircuits.byId.has(id))librarySelected=id;$('circuitLibraryModal').classList.remove('hidden');clearInputs();renderCircuitCards();showCircuitDetail(librarySelected);$('circuitSearch').focus();}
function closeCircuitLibrary(){$('circuitLibraryModal').classList.add('hidden');$('libraryReferenceImage').removeAttribute('src');$('libraryReferenceBox').classList.add('hidden');$('libraryButton').focus();}
function trapLibraryFocus(e){const nodes=[...$('circuitLibraryModal').querySelectorAll('button:not(:disabled),input,select,a[href]')].filter(x=>x.offsetParent!==null),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
function renderCircuitCards(){
 const q=$('circuitSearch').value.trim().toLowerCase(),type=$('circuitTypeFilter').value,list=$('circuitCards');list.textContent='';
 const matches=AFCircuits.list.filter(m=>(type==='all'||m.type===type)&&[m.name,m.city,m.country,m.id].some(v=>v.toLowerCase().includes(q)));
 $('circuitResultCount').textContent=matches.length+' / '+AFCircuits.list.length+' CIRCUITS';$('circuitEmpty').classList.toggle('hidden',matches.length>0);
 for(const m of matches){const b=document.createElement('button');b.className='circuitCard'+(m.id===librarySelected?' active':'');b.dataset.circuit=m.id;b.setAttribute('aria-pressed',m.id===librarySelected?'true':'false');
  const art=document.createElement('div');art.className='circuitCardMap';art.innerHTML=AFCircuits.diagram(m.id);
  const where=document.createElement('span');where.className='circuitCountry';where.textContent=m.country+' / '+m.city;
  const name=document.createElement('strong');name.textContent=m.name;
  const stats=document.createElement('span');stats.className='circuitCardStats';stats.textContent=(m.length/1000).toFixed(3)+' km  ·  '+m.corners+' corners';
  b.append(art,where,name,stats);b.onclick=()=>{librarySelected=m.id;renderCircuitCards();showCircuitDetail(m.id);if(innerWidth<=690)$('libraryTitle').scrollIntoView({block:'start',behavior:'smooth'});};list.appendChild(b);
 }
}
function libraryFact(label,value){const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;d.append(dt,dd);return d;}
function sourceLink(label,url){const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function showCircuitDetail(id){
 const m=AFCircuits.byId.get(id);if(!m)return;librarySelected=id;
 $('libraryTitle').textContent=m.name;$('libraryLocation').textContent=m.city+' / '+m.country+' · '+m.type.toUpperCase();$('libraryLargeMap').innerHTML=AFCircuits.diagram(id,true);
 const facts=$('libraryFacts');facts.textContent='';for(const [l,v]of[['Catalog length',(m.length/1000).toFixed(3)+' km'],['Source corners',m.corners],['Forward direction',m.raceDirection],['First GP',m.firstGP],['Modeled width',m.nominalWidth+' m nominal'],['Width evidence',m.widthEvidence]])facts.appendChild(libraryFact(l,v));
 const more=$('librarySourceFacts');more.textContent='';if(m.record)more.appendChild(libraryFact('Source race-lap record',m.record.time+' · '+m.record.driver+' ('+m.record.year+')'));
 if(m.capacity)more.appendChild(libraryFact('Source capacity',m.capacity.toLocaleString()));if(m.weather)more.appendChild(libraryFact('Source climate label',m.weather));if(m.racesHeld)more.appendChild(libraryFact('Races held (source snapshot)',m.racesHeld));
 $('libraryLayoutNote').textContent=m.layoutNote;
 $('libraryWidthNote').textContent=(m.publishedWidth?'Published: '+m.publishedWidth+'. ':'')+m.widthNote;
 $('libraryElevationNote').textContent=m.elevationNote+(m.bankingNote?' '+m.bankingNote:'');
 $('libraryRunoffNote').textContent=m.runoffNote+' Loaded defaults: '+m.runoff+' m each side, grass. Scenery is a stylized approximation.';
 const links=$('librarySourceLinks');links.textContent='';links.append(sourceLink('Circuit page',m.source),sourceLink('Geographic data / MIT',m.geometrySource));if(m.widthSource)links.append(sourceLink('Width source',m.widthSource));if(m.elevationSource)links.append(sourceLink('Elevation source',m.elevationSource));if(m.bankingSource)links.append(sourceLink('Banking source',m.bankingSource));
 $('libraryReferenceBox').classList.add('hidden');$('libraryReferenceImage').removeAttribute('src');$('libraryMapStatus').textContent='';$('openOriginalMap').href=m.mapUrl;
 $('loadLibraryCircuit').textContent='LOAD INTO TRACK LAB →';
}
function loadLibraryCircuit(id){
 try{const cfg=C.validateConfig(AFCircuits.create(id));libraryPrevious=clone(state.config);try{localStorage.setItem('apex-foundry.previous.v4',JSON.stringify(libraryPrevious));}catch(e){}
  state.config=cfg;state.selected=0;renderer.editorMode='fit';state.plan.mode='fit';state.inspecting=false;syncConfigUI();setMode('track');rebuild();fitViews();closeCircuitLibrary();$('undoLibraryLoad').classList.remove('hidden');toast(cfg.name+' loaded. Previous layout is available with Undo circuit load.');
 }catch(e){toast('Could not load circuit: '+e.message,true);}
}
function initCircuitLibrary(){
 const group=document.createElement('optgroup');group.label='WORLD CIRCUITS · 25 MAPPED LAYOUTS';for(const m of AFCircuits.list){const o=document.createElement('option');o.value='circuit:'+m.id;o.textContent=m.name+' · '+(m.length/1000).toFixed(3)+' km';group.appendChild(o);}$('preset').appendChild(group);
 $('libraryButton').onclick=()=>openCircuitLibrary();$('closeCircuitLibrary').onclick=closeCircuitLibrary;$('circuitSearch').oninput=renderCircuitCards;$('circuitTypeFilter').onchange=renderCircuitCards;
 $('loadLibraryCircuit').onclick=()=>loadLibraryCircuit(librarySelected);
 $('loadOriginalMap').onclick=()=>{const m=AFCircuits.byId.get(librarySelected),img=$('libraryReferenceImage');$('libraryReferenceBox').classList.remove('hidden');$('libraryMapStatus').textContent='Loading the source image online…';img.onload=()=>{$('libraryMapStatus').textContent='Reference image from Formula Timer. This is not bundled in the offline game.';};img.onerror=()=>{$('libraryMapStatus').textContent='The source image is unavailable or you are offline. The generated map above remains available.';};img.src=m.mapUrl;};
 $('undoLibraryLoad').onclick=()=>{if(!libraryPrevious)return;const previous=clone(state.config);state.config=C.validateConfig(libraryPrevious);libraryPrevious=previous;state.selected=0;renderer.editorMode='fit';state.plan.mode='fit';state.inspecting=false;syncConfigUI();rebuild();fitViews();toast('Previous layout restored.');};
 try{const previous=localStorage.getItem('apex-foundry.previous.v4');if(previous){libraryPrevious=C.validateConfig(JSON.parse(previous));$('undoLibraryLoad').classList.remove('hidden');}}catch(e){}
}


/* Multiplayer integration. The host is authoritative: guests send input only. */
function onlineStatus(message,error=false){$('onlineStatus').textContent=message;$('onlineStatus').classList.toggle('onlineError',error);}
function openOnlineMenu(){
 clearInputs();$('onlineModal').classList.remove('hidden');updateOnlineUI();
 if(!onlineClient?.connected&&!/^https?:$/.test(location.protocol))onlineStatus('Open the game through the included Node.js server to play online. file:// cannot create internet rooms.',true);
}
function closeOnlineMenu(){$('onlineModal').classList.add('hidden');}
function updateOnlineUI(){
 const c=onlineClient,active=!!c?.connected,host=active&&c.role==='host',r=state.race;
 $('onlineConnect').classList.toggle('hidden',active);$('onlineLobby').classList.toggle('hidden',!active);
 $('onlineRoomCode').textContent=c?.room||'—— ———';$('onlineRoleTag').textContent=host?'YOU ARE THE HOST':'YOU ARE A GUEST';
 $('onlineInvite').value=active?location.origin+location.pathname+'?room='+encodeURIComponent(c.room):'';
 $('onlinePlayerCount').textContent=(c?.players.length||0)+' / 8';
 const list=$('onlinePlayers');list.textContent='';
 for(const person of c?.players||[]){const row=document.createElement('div');row.className='onlinePlayer';const star=document.createElement('span');star.className='hostStar';star.style.color=person.color||'#c8e991';star.textContent=person.id===c.hostId?'★':'●';const label=document.createElement('strong');label.textContent=person.name;const tag=document.createElement('em');tag.textContent=person.id===c.id?'YOU':person.id===c.hostId?'HOST':'DRIVER';row.append(star,label,tag);list.appendChild(row);}
 $('onlineStartBtn').classList.toggle('hidden',!host||c.phase==='race');$('onlineStartBtn').disabled=!host||c.players.length<2;
 $('onlineLobbyHint').textContent=!active?'':c.phase==='race'?'Match in progress. The host can restart after the results.':host?c.players.length<2?'Waiting for at least one guest. Share the code or link.':'Ready! Your track, vehicle tuning, laps and AI settings will be shared when you start.':'Waiting for the host. You will join automatically when the race begins.';
 if(host&&['localhost','127.0.0.1','[::1]'].includes(location.hostname))$('onlineLobbyHint').textContent+=' Players on other devices must replace localhost in the invite link with the host computer’s LAN IP or public domain/address.';
 $('connectionLabel').textContent=active?'● ONLINE · '+c.room:'● LOCAL / OFFLINE';
 const raceActive=!!r?.onlineRole;$('onlineRaceStatus').classList.toggle('hidden',!raceActive);$('onlineRaceLeave').classList.toggle('hidden',!raceActive);
 if(raceActive)$('onlineRaceStatus').textContent='ROOM '+(c?.room||'—')+' · '+(r.waitingForDrivers?'SYNCING DRIVERS':r.paused?'HOST PAUSED':r.onlineRole==='host'?'HOST':'GUEST');
 if(raceActive){$('pauseBtn').textContent=r.onlineRole==='guest'?'HOST CONTROLS PAUSE':'ESC / PAUSE';$('restartBtn').disabled=r.onlineRole==='guest';$('resumeBtn').disabled=r.onlineRole==='guest';}
 else $('pauseBtn').textContent='ESC / PAUSE';
}
async function connectOnline(mode){
 if(onlineClient?.connected)return;
 const name=$('onlineNickname').value.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,22)||'Driver';
 const code=$('onlineCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(mode==='join'&&code.length!==6){onlineStatus('Enter a valid six-character room code.',true);return;}
 if(state.race){onlineStatus('Leave the current race before creating or joining a room.',true);return;}
 const client=new AFOnline.Client((event,data)=>{
  if(client!==onlineClient)return;
  if(event==='lost'){leaveOnline(true);toast(data.message,true);return;}
  if(event==='message')onOnlineMessage(data);
 });
 onlineClient=client;
 $('onlineCreateBtn').disabled=$('onlineJoinBtn').disabled=true;onlineStatus('Connecting to the online game server…');
 try{await client.connect(mode,name,code,state.color);onlineStatus(mode==='create'?'Room created. Share its code or invitation link.':'Connected! Waiting for the host to start.');updateOnlineUI();}
 catch(e){if(onlineClient===client){client.leave();onlineClient=null;}onlineStatus(e.message,true);updateOnlineUI();}
 finally{$('onlineCreateBtn').disabled=$('onlineJoinBtn').disabled=false;}
}
function leaveOnline(silent=false){
 const client=onlineClient;onlineClient=null;remoteInputs.clear();onlineTick=0;onlineFirstSnapshot=false;
 if(client)client.leave();if(state.race?.onlineRole)exitRace(true);
 updateOnlineUI();if(!silent)toast('You left the online room.');
}
function maybeBeginOnlineRace(){
 const r=state.race,c=onlineClient;
 if(!r?.waitingForDrivers||c?.role!=='host')return;
 const guests=c.players.filter(p=>p.id!==c.id);
 if(guests.every(p=>r.readyIds.has(p.id))){r.waitingForDrivers=false;r.paused=false;onlineTick=0;toast('All drivers ready. Starting countdown.');updateOnlineUI();}
}
function onOnlineMessage(msg){
 if(msg.type==='room'){updateOnlineUI();return;}
 if(msg.type==='error'){onlineStatus(msg.message,true);toast(msg.message,true);return;}
 if(msg.type==='hostLeft'){leaveOnline(true);toast('The host disconnected. The room has closed.',true);return;}
 if(msg.type==='playerLeft'){
  remoteInputs.delete(msg.playerId);
  const remote=state.race?.cars.find(c=>c.ownerId===msg.playerId);
  if(remote){remote.disconnected=true;remote.speed=0;toast(remote.name+' disconnected. Driver marked DNF.',true);}
  updateOnlineUI();maybeBeginOnlineRace();return;
 }
 if(msg.type==='ready'&&onlineClient?.role==='host'&&state.race?.waitingForDrivers){state.race.readyIds.add(msg.playerId);maybeBeginOnlineRace();return;}
 if(msg.type==='input'&&onlineClient?.role==='host'&&state.race?.onlineRole==='host'){
  const remote=state.race.cars.find(c=>c.remotePlayerId===msg.playerId&&!c.disconnected);
  if(remote&&Array.isArray(msg.axes)&&msg.axes.length===3)remoteInputs.set(msg.playerId,{control:{throttle:C.clamp(msg.axes[0],-1,1),brake:C.clamp(msg.axes[1],0,1),steer:C.clamp(msg.axes[2],-1,1)},t:performance.now()});
  return;
 }
 if(msg.type==='reset'&&onlineClient?.role==='host'&&state.race?.onlineRole==='host'){
  const remote=state.race.cars.find(c=>c.remotePlayerId===msg.playerId&&!c.disconnected);
  if(remote&&state.race.countdown<=0&&!remote.finished)C.resetCar(remote,state.track);
  return;
 }
 if(msg.type==='start'&&onlineClient?.role==='guest'){try{startOnlineGuest(msg.settings);}catch(e){onlineStatus('Cannot join race: '+e.message,true);toast('Unable to load the host track or race settings.',true);}return;}
 if(msg.type==='snapshot'&&onlineClient?.role==='guest')applyOnlineSnapshot(msg.data);
}
function startOnlineGuest(settings){
 if(!settings||settings.version!==1||!Array.isArray(settings.cars)||settings.cars.length<2||settings.cars.length>24)throw Error('Incompatible multiplayer race format.');
 if(!C.CARS[settings.carClass])throw Error('Unknown car class.');
 const myId=onlineClient.id;
 if(settings.cars.filter(c=>c.ownerId===myId).length!==1)throw Error('You are not part of this starting grid.');
 const savedConfig=C.validateConfig(settings.track),tuned=C.tunedSpec(settings.carClass,settings.tune),tune=C.tuneValues(tuned);
 const rules=C.limitRules(settings.trackLimitRules);
 const laps=Math.round(Number(settings.laps));if(laps<1||laps>10)throw Error('Invalid lap count.');
 const spacing=Number(settings.gridSpacing),stagger=Number(settings.launchStagger),seed=Number(settings.seed);
 if(!Number.isFinite(spacing)||!Number.isFinite(stagger)||!Number.isFinite(seed))throw Error('Invalid grid setup.');
 state.config=savedConfig;state.carClass=settings.carClass;state.tunings[settings.carClass]=tune;state.laps=laps;state.trackLimitRules=rules;
 state.gridSpacing=C.clamp(spacing,10,30);state.launchStagger=C.clamp(stagger,0,.5);state.raceSeed=seed;
 syncConfigUI();renderCarSelection();rebuild(false);
 const cars=settings.cars.map((v,i)=>{
  if(!Number.isInteger(v.id)||!Number.isInteger(v.grid)||v.grid!==i||typeof v.name!=='string'||v.name.length>22)throw Error('Invalid starting roster.');
  const mine=v.ownerId===myId,percent=v.isHuman?100:Math.round(v.performancePercent);
  if(!v.isHuman&&(!Number.isFinite(percent)||percent<50||percent>200))throw Error('Invalid AI tune.');
  const c=C.createCar(state.track,{id:v.id,name:v.name,color:/^#[0-9a-fA-F]{6}$/.test(v.color)?v.color:'#bce594',grid:v.grid,isPlayer:mine,carClass:state.carClass,carSpec:tuned,performancePercent:percent,difficulty:['easy','medium','hard'].includes(v.difficulty)?v.difficulty:'medium',trackLimitRules:rules});
  c.isHuman=!!v.isHuman;c.ownerId=v.ownerId||null;return c;
 });
 const player=cars.find(c=>c.isPlayer),gridLayout=C.configureGrid(state.track,cars,{spacing:state.gridSpacing,stagger:state.launchStagger,seed:state.raceSeed});
 state.race={cars,player,time:0,countdown:3,paused:false,finished:false,laps,kind:'race',resultsOpen:false,gridLayout,recorder:null,onlineRole:'guest',waitStart:0};
 clearInputs();onlineTick=0;onlineFirstSnapshot=false;accumulator=0;renderer.setTrack(state.track,-1);renderer.resetCamera();document.body.classList.add('racing');$('pauseModal').classList.add('hidden');$('resultsModal').classList.add('hidden');$('onlineModal').classList.add('hidden');$('blueprint').classList.remove('show');
 state.camera=Number($('startCamera').value)||1;$('hudField').textContent=cars.length;$('hudLaps').textContent=pad(laps);$('cameraLabel').textContent=state.camera===1?'01 / CHASE CAMERA':'03 / HOOD CAMERA';
 if(state.sound)initAudio();updateOnlineUI();updateHud();window.scrollTo(0,0);
 onlineClient.send({type:'ready'});
}
const SNAP_FIELDS=['x','y','z','heading','speed','steer','yaw','bounceVX','bounceVZ','impactYaw','damageZones','collisionRevision','lastImpactSpeed','progress','previousS','idx','lap','lapStart','lastLap','bestLap','finishTime','launchDelay','simTime','damage','damageRevision','runoffLatched','limitRemaining','offTrack','offTrackTime','wheelsOutside','lapInvalid','finished','started','lastLapValid','wheelTravel','wheelspin','tyreScrub','disconnected'];
function onlineCarSnapshot(c){const value={id:c.id};for(const key of SNAP_FIELDS)value[key]=c[key]??null;value.control=c.control;value.incident=c.incidents.at(-1)||null;return value;}
function applyOnlineSnapshot(data){
 const r=state.race;if(!r||r.onlineRole!=='guest'||!data||!Array.isArray(data.cars)||data.cars.length!==r.cars.length||!Number.isInteger(data.seq)||data.seq<=(r._lastSeq||0))return;
 if(!Number.isFinite(data.time)||!Number.isFinite(data.countdown))return;
 r._lastSeq=data.seq;r.time=data.time;r.countdown=data.countdown;r.paused=!!data.paused;r.waitingForDrivers=!!data.waitingForDrivers;r.finished=!!data.finished;r.waitStart=Number(data.waitStart)||0;
 const byId=new Map(r.cars.map(c=>[c.id,c]));
 for(const source of data.cars){const c=byId.get(source.id);if(!c||!Number.isFinite(source.x)||!Number.isFinite(source.y)||!Number.isFinite(source.z)||!Number.isFinite(source.heading))continue;
  if(!onlineFirstSnapshot){c.x=source.x;c.y=source.y;c.z=source.z;c.heading=source.heading;}
  c._onlineTarget={x:source.x,y:source.y,z:source.z,heading:source.heading};
  for(const key of SNAP_FIELDS)if(!['x','y','z','heading'].includes(key)&&Object.hasOwn(source,key)&&source[key]!==null)c[key]=source[key];
  if(source.control)c.control=source.control;
  c.incidents=source.incident?[source.incident]:[];
  c.spec=C.damagedSpec(c.intactSpec,c.damage||0);
 }
 onlineFirstSnapshot=true;
 if((r.player.finished||r.finished)&&!r.resultsOpen){r.resultsOpen=true;renderResults();$('resultsModal').classList.remove('hidden');clearInputs();}
 if(r.resultsOpen){renderResults();$('resultsModal').classList.remove('hidden');}
 updateOnlineUI();
}
function interpolateOnline(dt){
 const r=state.race;if(!r||r.onlineRole!=='guest')return;
 const factor=1-Math.exp(-dt*24);
 for(const c of r.cars){const p=c._onlineTarget;if(!p)continue;
  if(Math.hypot(p.x-c.x,p.z-c.z)>18){c.x=p.x;c.y=p.y;c.z=p.z;c.heading=p.heading;}
  else {c.x=C.lerp(c.x,p.x,factor);c.y=C.lerp(c.y,p.y,factor);c.z=C.lerp(c.z,p.z,factor);c.heading+=C.angle(p.heading-c.heading)*factor;}
  c.road=C.nearest(state.track,c.x,c.z,c.idx);c.idx=c.road.idx;
 }
}
function pulseOnline(dt){
 const r=state.race,c=onlineClient;if(!r?.onlineRole||!c?.connected)return;
 onlineTick+=dt;if(onlineTick<.05)return;onlineTick=0;
 if(r.onlineRole==='guest'){
  const input=r.resultsOpen?{throttle:0,brake:1,steer:0}:playerInput(r.player);
  c.send({type:'input',axes:[input.throttle,input.brake,input.steer]});
 }else{
  const data={seq:++onlineSeq,time:r.time,countdown:r.countdown,paused:r.paused,waitingForDrivers:!!r.waitingForDrivers,finished:r.finished,waitStart:r.waitStart||0,cars:r.cars.map(onlineCarSnapshot)};
  c.send({type:'snapshot',data});
 }
}
function startOnlineRace(){if(!onlineClient?.connected||onlineClient.role!=='host'){toast('Create a room to host a multiplayer race.',true);return;}startRace('race');}
function bindOnlineUI(){
 $('onlineBtn').onclick=openOnlineMenu;$('onlineClose').onclick=closeOnlineMenu;
 $('onlineCreateBtn').onclick=()=>connectOnline('create');$('onlineJoinBtn').onclick=()=>connectOnline('join');
 $('onlineStartBtn').onclick=startOnlineRace;$('onlineLeaveBtn').onclick=()=>leaveOnline();
 $('onlineRaceLeave').onclick=()=>leaveOnline();
 $('onlineCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('onlineInvite').value);onlineStatus(['localhost','127.0.0.1','[::1]'].includes(location.hostname)?'Copied. For other devices replace localhost with the host computer’s reachable IP or domain.':'Invitation link copied. Share it with friends.');}catch(e){$('onlineInvite').select();onlineStatus('Select the invitation URL and copy it manually.');}};
 const initialCode=new URLSearchParams(location.search).get('room');if(initialCode&&/^[a-z0-9]{6}$/i.test(initialCode)){$('onlineCode').value=initialCode.toUpperCase();openOnlineMenu();}
 updateOnlineUI();
}
function bind(){
 $('openPaintPaletteCar').onclick=openPaintPalette;$('openPaintPaletteGrid').onclick=openPaintPalette;
 $('closePaintPalette').onclick=closePaintPalette;
 $('paintPaletteModal').addEventListener('click',e=>{if(e.target===$('paintPaletteModal'))closePaintPalette();});
 $('applyPaintHex').onclick=submitPaintHex;
 $('paintHexInput').addEventListener('keydown',e=>{if(e.code==='Enter'){e.preventDefault();submitPaintHex();}});
 $('paintNativeInput').addEventListener('input',e=>{if(VALID_PAINT.test(e.target.value)){$('paintHexInput').value=e.target.value.toUpperCase();$('paintPreview').style.background=e.target.value;}});
 $('paintNativeInput').addEventListener('change',e=>choosePaint(e.target.value,true));
 bindOnlineUI();
 $('settingsBtn').onclick=()=>openSettings();$('tuneCarButton').onclick=()=>openSettings();$('pauseSettings').onclick=()=>openSettings();$('closeSettings').onclick=closeSettings;
 for(const k of ['tune','world','camera','audio','kerbs'])$('garage'+k[0].toUpperCase()+k.slice(1)+'Tab').onclick=()=>garagePane(k);
 $('applyCamera').onclick=applyCamera;$('resetCameraSettings').onclick=()=>{state.cameraSettings={...AFRenderer.CAMERA_DEFAULTS};renderer.setCameraSettings(state.cameraSettings);saveGarage();renderCameraSettings();showGarageStatus('Close-up camera defaults restored.');};
 $('applyAudio').onclick=applyAudio;$('previewAudio').onclick=previewAudio;$('stopPreviewAudio').onclick=stopAudioPreview;$('importAudio').onclick=()=>{initAudio();$('audioFile').click();};$('audioFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error('Use a file smaller than 16 MB.');initAudio();const result=await audio.install($('sampleSlot').value,await file.arrayBuffer(),{rpm:safeNum('sampleRPM',500,20000),name:file.name});renderSampleStatus(result.saved?'Imported and cached locally.':'Imported for this session; browser storage unavailable.');}catch(error){renderSampleStatus('Import failed: '+error.message);}finally{e.target.value='';}};
 $('loadRecordedEngine').onclick=async()=>{initAudio();const b=$('loadRecordedEngine');b.disabled=true;renderSampleStatus('Downloading the CC0 generic engine loop…');try{const result=await audio.loadCC0(state.carClass);renderSampleStatus(result.saved?'Recording downloaded and cached.':'Recording loaded for this session.');}catch(e){renderSampleStatus('Download unavailable. Offline synthesis still works. You can import a local recording instead.');}finally{b.disabled=false;}};
 $('clearAudio').onclick=async()=>{initAudio();try{await audio.clearSamples();renderSampleStatus('All recordings removed.');}catch(e){renderSampleStatus('Session recordings removed; storage unavailable.');}};
 $('kerbZone').onchange=readKerbForm;$('applyKerb').onclick=saveKerb;$('addKerb').onclick=addKerb;$('removeKerb').onclick=removeKerb;$('focusKerb').onclick=focusKerb;$('resetKerbs').onclick=()=>{if(state.race)return;delete state.config.kerbs;rebuild();renderKerbEditor();showGarageStatus('Built-in inferred map restored.');};
 $('tuneClass').onchange=()=>{state.tuningClass=$('tuneClass').value;renderTuneFields();showGarageStatus('Editing '+C.CARS[state.tuningClass].name+'. Apply to save changes.');};
 $('applyTune').onclick=applyTune;$('resetTune').onclick=()=>restoreTune();$('resetAllTunes').onclick=()=>restoreTune(true);$('applyWorld').onclick=applyWorld;$('worldTheme').onchange=describeWorld;
 $('exportGarage').onclick=exportGarage;$('importGarage').onclick=()=>$('garageFile').click();$('garageFile').onchange=async e=>{try{await importGarage(e.target.files[0]);}catch(error){showGarageStatus(error.message,true);}finally{e.target.value='';}};
 $('applyAIPercent').onclick=()=>{try{const value=Math.round(safeNum('globalAIPercent',50,200));state.aiPercents.fill(value);invalidatePace();saveGarage();saveRaceSettings();renderRoster();rebuildPreview();}catch(e){toast(e.message,true);}};

 initCircuitLibrary();
 $('acceptTrackWarnings').onclick=()=>acceptLayoutAndContinue('grid');$('layoutReviewAccept').onclick=()=>acceptLayoutAndContinue();$('layoutReviewCancel').onclick=cancelLayoutReview;$('gridReviewLayout').onclick=()=>setMode('track');
 $('trackTab').onclick=()=>setMode('track');$('carTab').onclick=()=>setMode('car');$('carToGrid').onclick=()=>setMode('grid');$('changeCar').onclick=()=>setMode('car');$('gridTab').onclick=()=>setMode('grid');$('mainAction').onclick=()=>state.mode==='track'?setMode('car'):state.mode==='car'?setMode('grid'):startRace();$('view3d').onclick=()=>setBlueprint(false);$('viewPlan').onclick=()=>setBlueprint(true);
 $('quality').onchange=()=>setQuality($('quality').value);$('pauseQuality').onchange=()=>setQuality($('pauseQuality').value);
 $('controlsBtn').onclick=openControls;$('pauseControls').onclick=openControls;$('helpControls').onclick=()=>{$('helpModal').classList.add('hidden');openControls();};$('closeControls').onclick=closeControls;$('defaultControls').onclick=()=>{state.capture=null;state.bindings=K.defaults();persistBindings();renderBindings();$('captureStatus').textContent='Default controls restored.';$('captureStatus').classList.remove('error');};
 $('zoomIn').onclick=()=>zoomView(.75);$('zoomOut').onclick=()=>zoomView(1/.75);$('fitCircuit').onclick=fitViews;$('focusSection').onclick=()=>focusSelected();
 $('helpBtn').onclick=()=>$('helpModal').classList.remove('hidden');$('closeHelp').onclick=()=>$('helpModal').classList.add('hidden');
 $('trackName').onchange=()=>{state.config.name=$('trackName').value.trim()||'Untitled Circuit';$('trackName').value=state.config.name;markDirty();};
 $('preset').onchange=()=>{if($('preset').value.startsWith('circuit:')){loadLibraryCircuit($('preset').value.slice(8));return;}state.config=C.preset($('preset').value);state.selected=0;renderer.editorMode='fit';state.plan.mode='fit';state.inspecting=false;syncConfigUI();rebuild();fitViews();};
 $('direction').onchange=()=>mutate(cfg=>{cfg.direction=Number($('direction').value);});
 $('applyRunoff').onclick=()=>{try{const l=safeNum('globalRunoffLeft',0,100),r=safeNum('globalRunoffRight',0,100),surface=$('globalRunoffSurface').value;mutate(cfg=>{for(const s of cfg.segments){s.runoffLeft=l;s.runoffRight=r;s.runoffSurface=surface;}});}catch(e){toast(e.message,true);}};
 $('segmentRunoffSurface').onchange=()=>mutate(cfg=>{cfg.segments[state.selected].runoffSurface=$('segmentRunoffSurface').value;});
 $('applyWidth').onclick=()=>{try{const w=safeNum('globalWidth',6,30);mutate(cfg=>{cfg.width=w;for(const s of cfg.segments)s.width=w;});}catch(e){toast(e.message,true);}};
 $('rescale').onclick=()=>{try{const desired=safeNum('targetLength',300,20000),cfg=clone(state.config);let factor=desired/state.track.length;for(let i=0;i<4;i++){if(cfg.geometry==='mapped'){for(const p of cfg.path){p[0]*=factor;p[1]*=factor;p[2]*=factor;}for(const zone of cfg.segments){zone.elevation*=factor;}}else{for(const s of cfg.segments){s.length=(s.length||200)*factor;s.radius*=factor;}}const t=C.buildTrack(cfg);factor=desired/t.length;if(Math.abs(t.length-desired)<.1)break;}if(cfg.source)cfg.source.modified=true;state.config=C.validateConfig(cfg);rebuild();if(state.inspecting)focusSelected(false);toast('Circuit rescaled to '+Math.round(state.track.length)+' m. Road widths are unchanged.');}catch(e){toast('Cannot rescale: '+e.message,true);$('targetLength').value=Math.round(state.track.length);}};
 $('segmentType').onchange=()=>mutate(cfg=>{cfg.segments[state.selected].type=$('segmentType').value;if(!cfg.segments[state.selected].length)cfg.segments[state.selected].length=200;});
 const fields=[['segmentLength','length',15,3000],['segmentAngle','angle',5,180],['segmentRadius','radius',16,1500],['segmentWidth','width',6,30],['segmentRunoffLeft','runoffLeft',0,100],['segmentRunoffRight','runoffRight',0,100],['segmentBank','bank',-18,18],['segmentGrade','grade',-15,15]];
 for(const [id,key,min,max] of fields)$(id).onchange=()=>{try{const v=safeNum(id,min,max);mutate(cfg=>{if(cfg.geometry==='mapped'&&key==='grade'){const prev=cfg.segments[(state.selected+cfg.segments.length-1)%cfg.segments.length];cfg.segments[state.selected].elevation=prev.elevation+C.segmentLength(cfg.segments[state.selected])*v/100;}else cfg.segments[state.selected][key]=v;});}catch(e){toast(e.message,true);updateInspector();}};
 $('segmentRise').onchange=()=>{try{const rise=safeNum('segmentRise',-400,400),s=state.config.segments[state.selected],grade=rise/C.segmentLength(s)*100;if(Math.abs(grade)>15)throw Error('Elevation change exceeds ±15% average incline for this section.');mutate(cfg=>{if(cfg.geometry==='mapped'){const prev=cfg.segments[(state.selected+cfg.segments.length-1)%cfg.segments.length];cfg.segments[state.selected].elevation=prev.elevation+rise;}else cfg.segments[state.selected].grade=grade;});}catch(e){toast(e.message,true);updateInspector();}};
 function add(type){if(state.config.geometry==='mapped')return;if(state.config.segments.length>=64){toast('The editor supports up to 64 sections.',true);return;}const base={type,length:150,angle:90,radius:60,width:state.config.segments[state.selected].width,grade:0,bank:type==='right'?5:0,runoffLeft:state.config.segments[state.selected].runoffLeft??20,runoffRight:state.config.segments[state.selected].runoffRight??20,runoffSurface:state.config.segments[state.selected].runoffSurface||'grass'};state.config.segments.splice(state.selected+1,0,base);state.selected++;rebuild();}
 $('addStraight').onclick=()=>add('straight');$('addCorner').onclick=()=>add('right');$('duplicate').onclick=()=>{if(state.config.geometry==='mapped')return;if(state.config.segments.length>=64){toast('Maximum 64 sections.',true);return;}state.config.segments.splice(state.selected+1,0,clone(state.config.segments[state.selected]));state.selected++;rebuild();};
 $('deleteSegment').onclick=()=>{if(state.config.geometry==='mapped')return;if(state.config.segments.length<=2)return;state.config.segments.splice(state.selected,1);state.selected=Math.min(state.selected,state.config.segments.length-1);rebuild();};
 function move(delta){if(state.config.geometry==='mapped')return;const a=state.selected,b=a+delta;if(b<0||b>=state.config.segments.length)return;[state.config.segments[a],state.config.segments[b]]=[state.config.segments[b],state.config.segments[a]];state.selected=b;rebuild();}
 $('moveUp').onclick=()=>move(-1);$('moveDown').onclick=()=>move(1);
 $('saveTrack').onclick=saveLocal;$('exportTrack').onclick=()=>{AFKerbs.materialize(state.track);const blob=new Blob([JSON.stringify(state.config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(state.config.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'circuit')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Track exported. Import this JSON file to race it again.');};
 $('importTrack').onclick=()=>$('fileInput').click();$('fileInput').onchange=async()=>{const f=$('fileInput').files[0];if(!f)return;try{if(f.size>2000000)throw Error('Track files must be smaller than 2 MB.');const cfg=C.validateConfig(JSON.parse(await f.text()));state.config=cfg;state.selected=0;renderer.editorMode='fit';state.plan.mode='fit';state.inspecting=false;syncConfigUI();rebuild();fitViews();toast('Loaded '+cfg.name+'.');}catch(e){toast('Could not import track: '+e.message,true);}$('fileInput').value='';};
 $('opponentCount').oninput=()=>{state.opponents=Number($('opponentCount').value);invalidatePace();saveRaceSettings();renderRoster();rebuildPreview();};$('laps').onchange=()=>{state.laps=C.clamp(Math.round(Number($('laps').value)||3),1,10);$('laps').value=state.laps;renderRoster();};$('startCamera').onchange=()=>{state.camera=Number($('startCamera').value);renderer.resetCamera();};
 for(const [id,difficulty] of [['allEasy','easy'],['allMedium','medium'],['allHard','hard']])$(id).onclick=()=>{state.difficulties.fill(difficulty);state.aiPercents.fill(C.AI_PRESETS[difficulty]);invalidatePace();saveGarage();saveRaceSettings();renderRoster();rebuildPreview();};
 $('setBenchmark').onclick=()=>{try{setBenchmark($('benchmarkTime').value);}catch(e){toast(e.message,true);}};
 $('benchmarkEnabled').onchange=()=>{if($('benchmarkEnabled').checked&&!state.benchmarkTime){try{setBenchmark($('benchmarkTime').value);}catch(e){$('benchmarkEnabled').checked=false;toast(e.message,true);}return;}state.benchmarkEnabled=$('benchmarkEnabled').checked;syncBenchmarkUI();saveRaceSettings();};
 $('hardTarget').onchange=()=>{try{state.hardRatio=safeNum('hardTarget',85,105)/100;state.calibration=null;state.calibrationKey=null;state.calibrationToken++;syncBenchmarkUI();saveRaceSettings();}catch(e){toast(e.message,true);syncBenchmarkUI();}};

 for(const [id,key,min,max]of [['runoffGrace','grace',.1,10],['runoffSpeed','speedKmh',20,160],['runoffReturn','returnSeconds',0,20]])$(id).onchange=()=>{try{state.trackLimitRules={...state.trackLimitRules,[key]:safeNum(id,min,max)};state.calibration=null;state.calibrationKey=null;state.calibrationToken++;saveRaceSettings();syncBenchmarkUI();rebuildPreview();}catch(e){toast(e.message,true);syncBenchmarkUI();}};
 $('gridSpacing').onchange=()=>{try{state.gridSpacing=safeNum('gridSpacing',10,30);saveRaceSettings();rebuildPreview();}catch(e){toast(e.message,true);syncBenchmarkUI();}};
 $('launchStagger').onchange=()=>{try{state.launchStagger=safeNum('launchStagger',0,.5);saveRaceSettings();rebuildPreview();}catch(e){toast(e.message,true);syncBenchmarkUI();}};
 $('exportReference').onclick=exportReference;$('importReference').onclick=()=>$('referenceFile').click();$('referenceFile').onchange=async e=>{try{await importReference(e.target.files[0]);}catch(err){toast(err.message,true);}finally{e.target.value='';}};
 $('calibrateAI').onclick=calibrateAI;$('driveQualifying').onclick=()=>startRace('qualifying');$('finalizeResults').onclick=()=>{if(state.race?.onlineRole!=='guest')finishRace(true);};
 $('pauseBtn').onclick=pause;$('resumeBtn').onclick=resume;$('restartBtn').onclick=()=>startRace(state.race?.kind||'race');$('exitBtn').onclick=exitRace;$('raceAgain').onclick=()=>startRace(state.race?.kind||'race');$('resultsEditor').onclick=()=>{const qual=state.race?.kind==='qualifying';exitRace();if(qual)setMode('grid');};$('soundBtn').onclick=toggleSound;$('fullscreenBtn').onclick=fullscreen;
 document.addEventListener('keydown',e=>{
  if(!$('paintPaletteModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();closePaintPalette();}return;}
  if(!$('settingsModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();closeSettings();}if(e.code==='Tab'){const focus=[...$('settingsModal').querySelectorAll('button,input,select,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length),first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}

  if(!$('circuitLibraryModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();closeCircuitLibrary();}if(e.code==='Tab')trapLibraryFocus(e);return;}

  if(!$('layoutReviewModal').classList.contains('hidden')){
   if(e.code==='Escape'){e.preventDefault();cancelLayoutReview();return;}
   if(e.code==='Tab'){const first=$('layoutReviewAccept'),last=$('layoutReviewCancel');if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
   return;
  }
  if(!$('onlineModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();closeOnlineMenu();}return;}
  if(state.capture){captureKey(e);return;}
  if(!$('controlsModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();closeControls();}return;}
  if(!$('helpModal').classList.contains('hidden')){if(e.code==='Escape'){e.preventDefault();$('helpModal').classList.add('hidden');}return;}
  const form=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable;
  if(e.code==='Escape'){e.preventDefault();if(!e.repeat&&state.race&&!state.race.finished)state.race.paused?resume():pause();return;}
  if(form||!state.race)return;
  const match=a=>K.matches(state.bindings,a,e.code);
  if(['throttle','brake','left','right'].some(match)){e.preventDefault();if(!state.race.paused&&!state.race.finished)state.keys.add(e.code);return;}
  if(e.repeat)return;
  if(match('pause')){e.preventDefault();state.race.paused?resume():pause();return;}
  if(state.race.paused||state.race.finished)return;
  if(match('camera')){e.preventDefault();switchCamera();}else if(match('chase')){e.preventDefault();switchCamera(1);}else if(match('hood')){e.preventDefault();switchCamera(3);}else if(match('reset')&&state.race.countdown<=0){e.preventDefault();if(state.race.onlineRole==='guest')onlineClient?.send({type:'reset'});else C.resetCar(state.race.player,state.track);renderer.resetCamera();}else if(match('sound')){e.preventDefault();toggleSound();}else if(match('fullscreen')){e.preventDefault();fullscreen();}
 });
 document.addEventListener('keyup',e=>state.keys.delete(e.code));window.addEventListener('blur',()=>{clearInputs();if(state.race?.onlineRole!=='guest')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(state.race?.onlineRole!=='guest')pause();}});
 for(const button of document.querySelectorAll('[data-action].touchControls button,.touchControls [data-action]')){button.addEventListener('pointerdown',e=>{e.preventDefault();if(!state.race||state.race.paused||state.race.finished)return;button.setPointerCapture(e.pointerId);state.touchActions.add(button.dataset.action);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>state.touchActions.delete(button.dataset.action));}
 let drag=null;
 const view=$('viewport'),plan=$('blueprint');
 for(const canvas of [view,plan]){
  canvas.addEventListener('contextmenu',e=>{if(!state.race)e.preventDefault();});
  canvas.addEventListener('pointerdown',e=>{if(state.race)return;e.preventDefault();drag={canvas,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,pan:canvas===plan||e.shiftKey||e.button===1||e.button===2};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.canvas!==canvas||state.race)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=drag.moved||Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4;drag.x=e.clientX;drag.y=e.clientY;if(!drag.moved)return;
   if(state.mode!=='track'){renderer.showroomOrbit-=dx*.008;return;}
   if(canvas===plan)panPlan(dx,dy);else {if(drag.pan)renderer.panEditor(dx,dy);else {renderer.orbit-=dx*.006;renderer.orbitHeight=C.clamp(renderer.orbitHeight+dy*.004,.16,1.48);}state.inspecting=true;updateNavigationUI();drawMaps();}
  });
  canvas.addEventListener('pointerup',e=>{if(!drag||drag.canvas!==canvas)return;const moved=drag.moved;drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!moved&&canvas===plan&&state.mode==='track'){const p=planPoint(e);if(p?.seg>=0){selectSegment(p.seg,false);$('segments').children[p.seg]?.scrollIntoView({block:'nearest'});}else if(p)toast('Automatic connector. Edit authored sections to change its shape.');}});
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('wheel',e=>{if(state.race)return;e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1),factor=Math.exp(C.clamp(delta,-500,500)*.0015);if(state.mode!=='track'){renderer.showroomDistance=C.clamp(renderer.showroomDistance*factor,4.4,16);return;}zoomView(factor,e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('dblclick',e=>{if(state.race||state.mode!=='track')return;e.preventDefault();const p=canvas===plan?planPoint(e):renderer.pickPoint(e.clientX,e.clientY);if(p)navigatePoint(p);});
 }
 $('minimap').onclick=e=>{if(state.race||state.mode!=='track')return;const p=planPoint(e,$('minimap'));if(p)navigatePoint(p);};
 window.addEventListener('resize',()=>{if(renderer.editorMode==='fit')renderer.fitEditor();drawMaps();updateNavigationUI();});
}
function frame(now){const raw=lastFrame?Math.max(0,(now-lastFrame)/1000):1/60;lastFrame=now;const dt=Math.min(raw,.25);
 if(state.race?.onlineRole==='guest'){accumulator=0;interpolateOnline(dt);pulseOnline(dt);}
 else {if(state.race&&!state.race.paused&&!state.race.finished){accumulator+=dt;while(accumulator>=1/60){stepRace(1/60);accumulator-=1/60;}}else accumulator=0;if(state.race?.onlineRole==='host')pulseOnline(dt);}
 const r=state.race;if(!state.blueprint||r)renderer.render({cars:r?r.cars.filter(c=>!c.disconnected&&(!c.finished||c.isPlayer)):state.mode==='car'?[state.previewPlayer]:state.previewCars,player:r?r.player:state.previewPlayer,racing:!!r,showroom:!r&&state.mode!=='track',dt,hood:!!r&&state.camera===3});
 fpsFrames++;if(now-fpsStart>=650){state.fps=fpsFrames*1000/(now-fpsStart);fpsFrames=0;fpsStart=now;$('fps').textContent=Math.round(state.fps)+' FPS';}
 audioCounter+=dt;if(audioCounter>=1/30){updateAudio(audioCounter);audioCounter=0;}hudCounter+=dt;if(hudCounter>=.08){hudCounter=0;if(r)updateHud();}
 requestAnimationFrame(frame);
}
try{
 let restored=false;try{const saved=localStorage.getItem('apex-foundry.track.v1');if(saved){state.config=C.validateConfig(JSON.parse(saved));restored=true;}}catch(e){}
 try{const saved=JSON.parse(localStorage.getItem('apex-foundry.controls.v2')||'null');if(saved?.version===2)state.bindings=K.normalize(saved.bindings);}catch(e){}
 try{const raw=JSON.parse(localStorage.getItem('apex-foundry.garage.v7')||localStorage.getItem('apex-foundry.garage.v6')||'null');if(raw)Object.assign(state,validateGarage(raw));}catch(e){}
 try{const saved=JSON.parse(localStorage.getItem('apex-foundry.race.v6')||localStorage.getItem('apex-foundry.race.v5')||localStorage.getItem('apex-foundry.race.v3')||'null');if(saved){if(Array.isArray(saved.aiPercents)&&saved.aiPercents.length===12&&saved.aiPercents.every(x=>Number.isFinite(x)&&x>=50&&x<=200))state.aiPercents=saved.aiPercents;if(Array.isArray(saved.difficulties)&&saved.difficulties.length===12&&saved.difficulties.every(x=>['easy','medium','hard'].includes(x)))state.difficulties=saved.difficulties;if(Number.isInteger(saved.opponents)&&saved.opponents>=0&&saved.opponents<=12)state.opponents=saved.opponents;state.trackLimitRules=C.limitRules(saved.trackLimitRules);if(Number.isFinite(saved.gridSpacing))state.gridSpacing=C.clamp(saved.gridSpacing,10,30);if(Number.isFinite(saved.launchStagger))state.launchStagger=C.clamp(saved.launchStagger,0,.5);if(Object.hasOwn(C.CARS,saved.carClass))state.carClass=saved.carClass;if(VALID_PAINT.test(saved.color||''))state.color=saved.color.toLowerCase();if(Number.isFinite(saved.hardRatio))state.hardRatio=C.clamp(saved.hardRatio,.85,1.05);if(saved.benchmarkKey===referenceKey()&&Number.isFinite(saved.benchmarkTime)&&saved.benchmarkTime>0&&saved.benchmarkTime<=7200){state.benchmarkTime=saved.benchmarkTime;state.benchmarkKey=saved.benchmarkKey;state.benchmarkEnabled=!!saved.benchmarkEnabled;state.savedReferenceRaw=saved.reference||null;$('benchmarkTime').value=formatTime(state.benchmarkTime);}}}catch(e){}
 renderer=new AFRenderer.Renderer($('viewport'));renderer.worldSettings={...state.worldSettings};renderer.setCameraSettings(state.cameraSettings);renderer.setQuality(state.quality);$('quality').value=state.quality;$('pauseQuality').value=state.quality;$('opponentCount').value=state.opponents;bind();syncBindingLabels();syncConfigUI();renderRoster();renderColors();renderCarSelection();rebuild(false);if(state.savedReferenceRaw){try{state.lapReference=AFPace.validateReference(state.savedReferenceRaw,state.track,state.carClass,tunedSpecFor());state.referenceRevision++;}catch(e){}delete state.savedReferenceRaw;}syncBenchmarkUI();$('saveStatus').textContent=restored?'RESTORED FROM THIS DEVICE.':'TRACKS STAY ON YOUR DEVICE.';$('loading').classList.add('hidden');fpsStart=performance.now();requestAnimationFrame(frame);
 // Intentionally small development/test API. It never drives the human car.
 window.ApexFoundry={choosePaint,openPaintPalette,closePaintPalette,createHoneycomb,hexPaletteColor,openOnlineMenu,leaveOnline,startOnlineRace,pulseOnline,interpolateOnline,applyOnlineSnapshot,online:()=>onlineClient,applyCamera,applyAudio,previewAudio,stopAudioPreview,getAudio:()=>audio,initAudio,updateAudio,renderKerbEditor,saveKerb,addKerb,removeKerb,focusKerb,updateRaceExtras,openSettings,closeSettings,applyTune,restoreTune,tunedSpecFor,setAIPercent,applyWorld,exportGarage,importGarage,garageData,validateGarage,currentAIGroups,renderRoster,loadLibraryCircuit,openCircuitLibrary,closeCircuitLibrary,state,core:C,renderer,startRace,pause,resume,exitRace,setMode,rebuild,stepRace,formatTime,playerInput,fitViews,focusSelected,zoomView,openControls,closeControls,controls:K,selectCar,setBenchmark,calibrateAI,referenceKey,finishRace,raceOrder,makeGrid,exportReference,importReference,syncBenchmarkUI,updateHud};
}catch(e){$('loading').textContent='Unable to start: '+e.message;console.error(e);}
})();
