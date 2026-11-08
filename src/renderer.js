/* Native WebGL: cached geometry, lightweight material lighting, animated spec coupes,
 * distance-based vehicle detail, and an independent close-up editor camera. */
(function(root){
'use strict';
const C=root.AFCore, {clamp,lerp}=C;
const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
// Simulation coordinates are left-handed: +X is right, +Y is up, +Z is forward.
// OpenGL projection expects a negative viewing Z. Convert handedness HERE, not in
// keyboard input: the old cross(up,z) reflected left/right in every driving view.
function lookAt(eye,target,up){const z=norm(sub(eye,target)),x=norm(cross(z,up)),y=cross(x,z);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}

function carMatrix(car){
 const pitch=Math.atan(car.road.slope*Math.cos(C.angle(car.heading-car.road.h))),bank=car.road.bank*Math.cos(C.angle(car.heading-car.road.h)),h=car.heading;
 const f=[Math.sin(h)*Math.cos(pitch),Math.sin(pitch),Math.cos(h)*Math.cos(pitch)],r=[Math.cos(h),0,-Math.sin(h)],u=cross(f,r);
 const rb=r.map((v,i)=>v*Math.cos(bank)-u[i]*Math.sin(bank)),ub=r.map((v,i)=>v*Math.sin(bank)+u[i]*Math.cos(bank));
 return new Float32Array([...rb,0,...ub,0,...f,0,car.x,car.y+.07,car.z,1]);
}
const hex=s=>{const n=parseInt(s.replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
class Builder {
 constructor(){this.v=[];this.finish=0;this.part=0;}
 // Angle-weighted vertex-normal smoothing, restricted by color/material/part and
 // a 42-degree crease. Hard wing edges and glass/body boundaries stay sharp.
 smoothNormals(){const v=this.v,groups=new Map(),cos=Math.cos(42*Math.PI/180);for(let i=0;i<v.length;i+=11){const k=[...v.slice(i,i+3).map(x=>Math.round(x*100000)),...v.slice(i+6,i+11).map(x=>Math.round(x*1000))].join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
 const normals=new Float32Array(v.length/11*3);for(const list of groups.values())for(const i of list){const a=v.slice(i+3,i+6),sum=[0,0,0];for(const j of list){const b=v.slice(j+3,j+6);if(dot(a,b)>cos)for(let k=0;k<3;k++)sum[k]+=b[k];}normals.set(norm(sum),(i/11)*3);}for(let i=0;i<v.length;i+=11)for(let k=0;k<3;k++)v[i+3+k]=normals[i/11*3+k];return this;}
 roundedTire(x,y,z,width,color,n=48){const half=width/2,profile=[[-half,.29],[-half*.99,.35],[-half*.91,.389],[-half*.72,.405],[half*.72,.405],[half*.91,.389],[half*.99,.35],[half,.29]];for(let j=0;j<profile.length-1;j++)for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,at=(u,t)=>[x+u[0],y+Math.sin(t)*u[1],z+Math.cos(t)*u[1]];this.quad(at(profile[j],a),at(profile[j],b),at(profile[j+1],b),at(profile[j+1],a),color);}return this;}

 vertex(p,n,color){this.v.push(...p,...n,...color,this.finish,this.part);}
 tri(a,b,c,color){const n=norm(cross(sub(b,a),sub(c,a)));for(const p of [a,b,c])this.vertex(p,n,color);return this;}
 quad(a,b,c,d,color){this.tri(a,b,c,color);this.tri(a,c,d,color);return this;}
 box(x,y,z,w,h,d,color){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2],A=[a[0],y+h,a[2]],B=[b[0],y+h,b[2]],D=[c[0],y+h,c[2]],E=[e[0],y+h,e[2]];this.quad(A,E,D,B,color);this.quad(a,A,B,b,color);this.quad(b,B,D,c,color);this.quad(c,D,E,e,color);this.quad(e,E,A,a,color);return this;}
 cylinderX(x,y,z,r,w,color,n=16){for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,A=[x-w/2,y+Math.sin(a)*r,z+Math.cos(a)*r],B=[x-w/2,y+Math.sin(b)*r,z+Math.cos(b)*r],D=[x+w/2,B[1],B[2]],E=[x+w/2,A[1],A[2]];this.quad(A,B,D,E,color);this.tri([x-w/2,y,z],B,A,color);this.tri([x+w/2,y,z],E,D,color);}return this;}
 // Closed bevel-profile tires: geometry is cached; rotation is done in one shader draw.
 tire(x,y,z,side,color,n=20){const profile=[[-.16,.30],[-.15,.365],[-.105,.405],[.105,.405],[.15,.365],[.16,.30]];for(let j=0;j<profile.length-1;j++)for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,p=profile[j],q=profile[j+1],at=(u,t)=>[x+u[0],y+Math.sin(t)*u[1],z+Math.cos(t)*u[1]];this.quad(at(p,a),at(p,b),at(q,b),at(q,a),color);}return this;}
}
const CAMERA_DEFAULTS=Object.freeze({distance:6.4,pullback:.5,height:2.45,fov:61,fovBoost:2,follow:12,hoodFov:77});
const CAMERA_LIMITS={distance:[4.2,20],pullback:[0,15],height:[1.2,8],fov:[40,95],fovBoost:[0,20],follow:[3,30],hoodFov:[45,110]};
function cameraSettings(v={}){const o={...CAMERA_DEFAULTS};for(const [k,b]of Object.entries(CAMERA_LIMITS))if(v[k]!==undefined){if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<b[0]||v[k]>b[1])throw Error('Invalid camera setting: '+k);o[k]=v[k];}return o;}
class Renderer {
 constructor(canvas){
  this.cameraSettings=cameraSettings();this.lastBase=null;this.canvas=canvas;const gl=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)throw Error('WebGL is unavailable. Enable hardware acceleration in your browser, then reload.');this.gl=gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aFinish;attribute float aPart;
  uniform mat4 uVP;uniform mat4 uModel;uniform vec3 uEye;uniform mediump vec2 uFog;uniform vec3 uMotion;uniform vec3 uWheelProfile;
  varying vec3 vColor;varying vec3 vNormal;varying vec3 vDistance;varying float vFinish;
  void main(){vec3 p=aPosition,n=aNormal;vFinish=aFinish;
   if(aPart>0.5&&aPart<4.5){float side=mod(aPart,2.0)<0.5?1.0:-1.0;bool front=aPart>2.5;vec3 pivot=vec3(side*uWheelProfile.x,uWheelProfile.y,front?uWheelProfile.z:-uWheelProfile.z);p-=pivot;
    float co=cos(uMotion.x),si=sin(uMotion.x);p.yz=mat2(co,si,-si,co)*p.yz;n.yz=mat2(co,si,-si,co)*n.yz;
    if(front){co=cos(uMotion.y);si=sin(uMotion.y);p.xz=mat2(co,-si,si,co)*p.xz;n.xz=mat2(co,-si,si,co)*n.xz;}p+=pivot;
   }
   if(aPart>4.5)vFinish=-mix(0.18,1.0,uMotion.z);
   vec4 world=uModel*vec4(p,1.0);vNormal=mat3(uModel)*n;vColor=aColor;vDistance=(world.xyz-uEye)/uFog.y;gl_Position=uVP*world;
  }`;
  const fs=`precision mediump float;varying vec3 vColor;varying vec3 vNormal;varying vec3 vDistance;varying float vFinish;
  uniform vec3 uFogColor;uniform mediump vec2 uFog;
  void main(){vec3 n=normalize(vNormal),view=normalize(-vDistance);if(dot(n,view)<0.0)n=-n;
   vec3 light=normalize(vec3(-0.45,0.85,0.3));float d=max(0.0,dot(n,light)),gloss=max(vFinish,0.0),glow=max(-vFinish,0.0);
   vec3 base=vColor*(0.43+0.57*d);
   if(gloss>0.01){vec3 reflected=reflect(-view,n);vec3 environment=mix(vec3(0.14,0.19,0.21),vec3(0.73,0.84,0.91),smoothstep(-0.2,0.8,reflected.y));float fresnel=pow(1.0-max(0.0,dot(n,view)),4.0);
    base=mix(base,environment,gloss*(0.08+0.28*fresnel));float shine=pow(max(0.0,dot(n,normalize(light+view))),mix(18.0,96.0,gloss));base+=vec3(0.80,0.86,0.89)*shine*gloss*0.50;
   }
   base=mix(base,min(vec3(1.0),vColor*1.45),glow);
   float fog=clamp((length(vDistance)-uFog.x/uFog.y)/(1.0-uFog.x/uFog.y),0.0,1.0);gl_FragColor=vec4(mix(base,uFogColor,fog*fog),1.0);
  }`;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);this.program=p;
  this.attrs=['aPosition','aNormal','aColor','aFinish','aPart'].map(n=>gl.getAttribLocation(p,n));this.u={};for(const n of ['uVP','uModel','uEye','uFogColor','uFog','uMotion','uWheelProfile'])this.u[n]=gl.getUniformLocation(p,n);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);this.sky=[.57,.69,.77];gl.clearColor(...this.sky,1);this.meshes=[];this.carMeshes=new Map();this.damageMeshes=new Map();this.quality='balanced';this.eye=null;this.camera=1;this.orbit=.7;this.orbitHeight=.68;this.drawCalls=0;this.triangles=0;this.editorTarget=null;this.editorDistance=500;this.editorFitDistance=500;this.editorMode='fit';this.showroomOrbit=.64;this.showroomDistance=7.4;this.viewProjection=null;this.worldSettings={detail:'full',theme:'auto',time:'auto',markers:true};this.initSky();
 }
 initSky(){
  const gl=this.gl,vs=`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition;gl_Position=vec4(aPosition,0.999,1.0);}`;
  const fs=`precision mediump float;varying vec2 vUV;uniform vec3 uZenith,uHorizon,uForward,uRight,uUp;uniform vec2 uView;uniform float uNight,uCloud;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*4375.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
  void main(){vec3 ray=normalize(uForward+uRight*vUV.x*uView.x+uUp*vUV.y*uView.y);float height=clamp(ray.y,0.0,1.0);vec3 color=mix(uHorizon,uZenith,pow(height,0.6));
   vec3 sun=normalize(vec3(-.52,uNight>0.1?.12:.48,.56));float s=max(dot(ray,sun),0.0);color+=vec3(1.0,.76,.42)*pow(s,160.0)*(.35-.2*uNight);color+=vec3(1.0,.87,.62)*smoothstep(.99935,.99965,s)*(.75-.45*uNight);
   if(ray.y>.02){vec2 p=ray.xz/(ray.y+.25)*3.0;float cloud=noise(p)*.55+noise(p*2.1)*.28+noise(p*4.3)*.17;float a=smoothstep(.52,.79,cloud)*uCloud*smoothstep(.02,.22,height);color=mix(color,vec3(.91,.93,.93),a*(1.0-uNight));
    vec2 starUV=vec2(atan(ray.z,ray.x),asin(ray.y))*210.0;float star=step(.996,hash(floor(starUV)))*(1.0-smoothstep(.04,.18,length(fract(starUV)-.5)));color+=vec3(star*uNight*.65);
   }gl_FragColor=vec4(color,1.0);}`;
  const compile=(type,source)=>{const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
  this.skyProgram=gl.createProgram();gl.attachShader(this.skyProgram,compile(gl.VERTEX_SHADER,vs));gl.attachShader(this.skyProgram,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.skyProgram);if(!gl.getProgramParameter(this.skyProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.skyProgram));
  this.skyU={};for(const n of ['uZenith','uHorizon','uForward','uRight','uUp','uView','uNight','uCloud'])this.skyU[n]=gl.getUniformLocation(this.skyProgram,n);this.skyAttr=gl.getAttribLocation(this.skyProgram,'aPosition');this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 }
 drawSky(eye,target,up,fov){
  const gl=this.gl,L=this.light||{zenith:[.2,.45,.72],horizon:this.sky,night:0,clouds:.3},f=norm(sub(target,eye)),r=norm(cross(up,f)),u=cross(f,r);
  gl.useProgram(this.skyProgram);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
  for(const a of this.attrs)gl.disableVertexAttribArray(a);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.enableVertexAttribArray(this.skyAttr);gl.vertexAttribPointer(this.skyAttr,2,gl.FLOAT,false,0,0);
  gl.uniform3fv(this.skyU.uZenith,L.zenith);gl.uniform3fv(this.skyU.uHorizon,L.horizon);gl.uniform3fv(this.skyU.uForward,f);gl.uniform3fv(this.skyU.uRight,r);gl.uniform3fv(this.skyU.uUp,u);gl.uniform2f(this.skyU.uView,Math.tan(fov/2)*this.aspect,Math.tan(fov/2));gl.uniform1f(this.skyU.uNight,L.night);gl.uniform1f(this.skyU.uCloud,L.clouds);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.disableVertexAttribArray(this.skyAttr);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);
 }
 setWorldSettings(settings){this.worldSettings={...this.worldSettings,...settings};if(this.track)this.setTrack(this.track);}
 upload(builder){const gl=this.gl,buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(builder.v),gl.STATIC_DRAW);return {buffer,count:builder.v.length/11};}
 dispose(mesh){if(mesh)this.gl.deleteBuffer(mesh.buffer);}
 setTrack(track,selected=-1){
  const changed=this.track!==track,worldKey=JSON.stringify(this.worldSettings),reuseWorld=!changed&&worldKey===this.worldKey&&this.meshes[0],oldWorld=reuseWorld?this.meshes[0]:null;for(const m of this.meshes)if(m!==oldWorld)this.dispose(m);this.meshes=[];this.track=track;root.AFKerbs?.prepare(track);this.worldKey=worldKey;
  const road=new Builder(),detail=new Builder(),world=new Builder(),points=track.points,b=track.viewBounds||track.bounds;
  const at=(p,o,dy=0)=>[p.x+Math.cos(p.h)*o,p.y-o*Math.tan(p.bank)+dy,p.z-Math.sin(p.h)*o];
  const strip=(mesh,p,q,l0,r0,l1,r1,color,dy=.02)=>mesh.quad(at(p,l0,dy),at(q,l1,dy),at(q,r1,dy),at(p,r0,dy),color);
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length],w=p.width/2,v=q.width/2;
   strip(road,p,q,-w,w,-v,v,p.seg===selected?[.26,.30,.27]:[.205,.235,.245],0);
   for(const side of [-1,1]){
    const r0=side>0?p.runoffRight:p.runoffLeft,r1=side>0?q.runoffRight:q.runoffLeft;
    const surface=p.runoffSurface||'asphalt',runoffColor=surface==='gravel'?[.55,.48,.34]:surface==='grass'?(Math.floor(p.s/18)%2?[.31,.43,.23]:[.28,.40,.21]):[.245,.30,.30];
    strip(road,p,q,side*w,side*(w+r0+1.5),side*v,side*(v+r1+1.5),runoffColor,-.015);
    if(r0>1.5){
     if(Math.floor(p.s/12)%4===0)strip(detail,p,q,side*(w+r0+.65),side*(w+r0+.83),side*(v+r1+.65),side*(v+r1+.83),[.65,.71,.65],.018);
    }
    strip(detail,p,q,side*(w-.22),side*(w-.38),side*(v-.22),side*(v-.38),[.82,.86,.80],.025);
    const kz=root.AFKerbs?.atPoint(track,p,side);if(kz){const width=Math.min(kz.width,Math.max(.3,r0)),color=root.AFKerbs.color(kz,p.kerbU*track.length);strip(detail,p,q,side*w,side*(w+width),side*v,side*(v+Math.min(kz.width,Math.max(.3,r1))),color,.036);if(r0>width+.5)strip(detail,p,q,side*(w+width+.02),side*(w+width+.28),side*(v+width+.02),side*(v+width+.28),[.23,.45,.30],.019);}
    const o0=side*(w+r0+1.5),o1=side*(v+r1+1.5),bend=Math.abs(p.k)>.0023&&side===-Math.sign(p.k),alternate=Math.floor(p.s/3)%2;
    // Tecpro-style modular outer barriers: decorative blocks over the existing
    // continuous collision boundary, not a deformable safety-system simulation.
    const color=bend?(alternate?[.96,.72,.06]:[.075,.085,.085]):(alternate?[.82,.84,.79]:[.65,.22,.15]);
    detail.quad(at(p,o0,.05),at(p,o0,1.05),at(q,o1,1.05),at(q,o1,.05),color);
    strip(detail,p,q,o0,o0+side*.55,o1,o1+side*.55,[.47,.49,.45],1.05);
    detail.quad(at(p,o0+side*.55,.05),at(p,o0+side*.55,1.05),at(q,o1+side*.55,1.05),at(q,o1+side*.55,.05),color);
    strip(detail,p,q,o0,o0+side*.013,o1,o1+side*.013,[.17,.18,.17],.52);
   }
   if(Math.floor(p.s/7)%2===0)strip(detail,p,q,-.055,.055,-.055,.055,[.57,.62,.59],.025);
  }
  // Checkerboard start line and start gantry.
  const sp=track.sample(track.startS),sw=sp.width,step=sw/12;
  for(let row=0;row<2;row++)for(let col=0;col<12;col++){
   const p=track.sample(track.startS+row*.72),q=track.sample(track.startS+(row+1)*.72),l=-sw/2+col*step;
   strip(detail,p,q,l,l+step,l,l+step,(row+col)%2?[.10,.14,.16]:[.90,.93,.84],.05);
  }
  for(const side of [-1,1]){const p=at(sp,side*(sw/2+(side>0?sp.runoffRight:sp.runoffLeft)+2));world.box(p[0],p[1],p[2],.55,6.7,.55,[.25,.31,.31]);}
  const a=at(sp,-sw/2-sp.runoffLeft-2,5.8),e=at(sp,sw/2+sp.runoffRight+2,5.8),f=[e[0],e[1]+1,e[2]],g=[a[0],a[1]+1,a[2]];
  detail.quad(a,e,f,g,[.75,.92,.35]);
  // Original circuit-specific, offline scenic worlds. Detailed references and
  // approximations are documented in SCENERY.md; no online imagery is embedded.
  const theme=AFScenery.themeFor(track,this.worldSettings.theme),groundY=b.minY-3.0,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,extent=Math.max(b.maxX-b.minX,b.maxZ-b.minZ,300);
  if(!reuseWorld){this.worldData=AFScenery.buildWorld(world,track,theme,this.worldSettings);this.sceneStats=this.worldData.stats;}
  this.activeTheme=theme;this.light=AFScenery.lighting(theme,this.worldSettings.time);this.sky=this.light.horizon;this.gl.clearColor(...this.sky,1);
  this.turnCues=AFScenery.turnCues(track);this.cueStats=this.worldSettings.markers?AFScenery.drawCues(detail,track,this.turnCues):{boards:0,arrows:0};
  if(!reuseWorld)for(let i=0;i<points.length;i+=16){const p=points[i];if(p.y>groundY+5)world.box(p.x,groundY,p.z,2.1,p.y-groundY-.3,2.1,[.38,.41,.38]);}
  if(!reuseWorld)for(let i=0;i<points.length;i+=36){const p=points[i],t=at(p,p.width/2+p.runoffRight+5);world.box(t[0],t[1]-1,t[2],.2,8,.2,[.28,.34,.34]);world.box(t[0],t[1]+7,t[2],2.2,.18,.6,[.85,.86,.65]);}
  this.meshes=[oldWorld||this.upload(world),this.upload(road),this.upload(detail)];this.bounds={cx,cz,extent,y:(b.minY+b.maxY)/2};this.editorFitDistance=this.calculateFitDistance();if(!this.editorTarget||(changed&&this.editorMode==='fit'))this.fitEditor();else if(this.editorMode==='section'&&selected>=0)this.focusSection(selected,false);
 }
 makeCar(color,detail=true,carClass='sedan'){
  if(carClass!=='sedan')return this.makeSportCar(color,detail,carClass);
  const key=color+(detail?':near':':far');if(this.carMeshes.has(key))return this.carMeshes.get(key);
  const m=new Builder(),paint=hex(color),silver=[.70,.75,.80],bright=[.83,.88,.91],dark=[.028,.040,.052],rubber=[.026,.031,.038],glass=[.060,.12,.17],alloy=[.62,.69,.76];
  const tint=(a,k)=>a.map(v=>v*k),TAU=Math.PI*2;
  // A tapered, wide-body touring coupe. All liveries share this exact mesh.
  const sections=[[-2.30,.88,.70],[-2.14,1.02,.88],[-1.77,1.065,.94],[-1.36,1.09,.98],[-.82,.99,.93],[.45,.98,.91],[1.0,1.05,.94],[1.36,1.09,.97],[1.82,1.035,.92],[2.12,.99,.86],[2.30,.94,.80]];
  function section(z){let i=0;while(i<sections.length-2&&sections[i+1][0]<z)i++;const a=sections[i],b=sections[i+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1);if(!detail)return {w:lerp(a[1],b[1],t),y:lerp(a[2],b[2],t)};const p=sections[Math.max(0,i-1)],q=sections[Math.min(sections.length-1,i+2)],t2=t*t,t3=t2*t,value=k=>{const m=(b[k]-p[k])/(b[0]-p[0])*(b[0]-a[0]),n=(q[k]-a[k])/(q[0]-a[0])*(b[0]-a[0]);return clamp((2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*m+(-2*t3+3*t2)*b[k]+(t3-t2)*n,Math.min(a[k],b[k]),Math.max(a[k],b[k]));};return {w:value(1),y:value(2)};}
  const arch=z=>{let low=.26;for(const axle of [-1.36,1.36]){const dz=Math.abs(z-axle);if(dz<.465)low=Math.max(low,.42+Math.sqrt(.465*.465-dz*dz));}return low;};
  const zs=[...sections.map(a=>a[0])];for(let z=-2.3;z<2.30;z+=detail?.045:.23)zs.push(z);for(const axle of [-1.36,1.36])for(let i=0;i<=(detail?32:12);i++)zs.push(axle-.465+i*.93/(detail?32:12));zs.push(2.30);zs.sort((a,b)=>a-b);
  m.finish=.78;
  for(let i=0;i<zs.length-1;i++){
   const z=zs[i],v=zs[i+1];if(v-z<.001)continue;const a=section(z),b=section(v),lo=arch(z),hi=arch(v);
   // Four top strips give the hood and rear quarters a bevel instead of a box.
   const top=(q,s,k)=>[s.w*k,s.y+(.035*(1-k*k)),q];
   for(const [l,r] of (detail?[[-1,-.96],[-.96,-.88],[-.88,-.72],[-.72,-.48],[-.48,0],[0,.48],[.48,.72],[.72,.88],[.88,.96],[.96,1]]:[[-1,-.82],[-.82,0],[0,.82],[.82,1]]))m.quad(top(z,a,l),top(v,b,l),top(v,b,r),top(z,a,r),silver);
   for(const side of [-1,1]){
    m.quad([side*a.w,lo,z],[side*b.w,hi,v],[side*b.w,b.y,v],[side*a.w,a.y,z],tint(silver,.94));
    m.finish=.08;m.quad([side*a.w,lo,z],[side*(a.w-.065),lo+.018,z],[side*(b.w-.065),hi+.018,v],[side*b.w,hi,v],dark);m.finish=.78;
   }
  }
  // Angular two-tone door graphics, shaped to the shell, with silver breaks.
  const sidePoint=(side,z,y,offset=.006)=>[side*(section(z).w+offset),y,z];
  for(const side of [-1,1]){
   const patch=arr=>{for(let i=1;i<arr.length-1;i++)m.tri(sidePoint(side,...arr[0]),sidePoint(side,...arr[i]),sidePoint(side,...arr[i+1]),paint);};
   patch([[-.87,.85],[.88,.85],[.88,.62],[-.63,.32],[-.87,.32]]);
   patch([[-.45,.28],[.87,.28],[.87,.51]]);
   m.finish=.2;m.box(side*.985,.22,0,.09,.105,1.70,dark);m.finish=.8;
   // Door handles, belt line, and front-quarter extraction vent.
   if(detail){m.box(side*1.001,.80,-.51,.021,.033,.15,bright);m.finish=.1;for(let j=0;j<3;j++)m.box(side*1.026,.69+j*.045,.85,.026,.022,.20,dark);m.finish=.8;}
  }
  // Hood chevron panel and a raised center line; no licensed branding or textures.
  // Conformal livery follows the curved skin, rather than intersecting it.
  const paintedStrip=(from,to,width)=>{const n=detail?Math.ceil((to-from)/.045):Math.ceil((to-from)/.15),cols=detail?8:4,pt=(z,u)=>{const q=section(z),x=width(z)*u;return [x,q.y+.035*(1-(x/q.w)**2)+.008,z];};for(let i=0;i<n;i++){const z=lerp(from,to,i/n),v=lerp(from,to,(i+1)/n);for(let j=0;j<cols;j++){const l=-1+2*j/cols,r=-1+2*(j+1)/cols;m.quad(pt(z,l),pt(v,l),pt(v,r),pt(z,r),paint);}}};
  paintedStrip(.94,2.12,z=>.59-(z-.94)*.13);
  paintedStrip(-2.14,-1.12,z=>.32+(z+2.14)*.16);
  m.finish=.2;
  for(const side of [-1,1]){for(let j=0;j<(detail?4:2);j++){const z=1.21+j*.10,y=section(z).y+.043;m.box(side*.71,y,z,.20,.007,.038,dark);}}
  // Glazed cabin, sloping A/C pillars and gently crowned metallic roof.
  m.finish=.96;
  const rearL=[-.82,.945,-1.12],rearR=[.82,.945,-1.12],roofRL=[-.69,1.38,-.62],roofRR=[.69,1.38,-.62],roofFL=[-.67,1.38,.36],roofFR=[.67,1.38,.36],frontL=[-.83,.955,1.02],frontR=[.83,.955,1.02];
  m.quad(rearL,rearR,roofRR,roofRL,glass);m.quad(roofFL,roofFR,frontR,frontL,glass);
  m.quad(rearL,roofRL,roofFL,frontL,glass);m.quad(rearR,frontR,roofFR,roofRR,glass);
  m.finish=.82;
  if(detail){for(let i=0;i<20;i++){const a=-1+i/10,b=-1+(i+1)/10,at=(x,z)=>[x*(z<0?.69:.67),1.38+.07*(1-x*x),z];m.quad(at(a,-.62),at(a,.36),at(b,.36),at(b,-.62),silver);}}else{m.quad(roofRL,roofFL,[0,1.45,.36],[0,1.45,-.62],silver);m.quad([0,1.45,-.62],[0,1.45,.36],roofFR,roofRR,silver);}
  // Pillar strips sit on the glass instead of using chunky boxes.
  const ribbon=(a,b,w,color)=>{m.quad([a[0]-w,a[1]+.008,a[2]],[b[0]-w,b[1]+.008,b[2]],[b[0]+w,b[1]+.008,b[2]],[a[0]+w,a[1]+.008,a[2]],color);};
  for(const side of [-1,1]){
   ribbon([side*.83,.958,1.02],[side*.67,1.385,.36],.035,silver);
   ribbon([side*.82,.95,-1.12],[side*.69,1.385,-.62],.060,silver);
   const sx=side*.779;m.finish=.15;m.quad([sx,.96,-.19],[side*.707,1.385,-.19],[side*.707,1.385,-.27],[sx,.96,-.27],dark);m.finish=.8;
   // Small, sculpted racing mirror with contrasting glass.
   m.box(side*.98,.97,.59,.15,.06,.08,dark);m.box(side*1.105,.99,.57,.21,.12,.24,silver);m.finish=.95;m.box(side*1.11,1.005,.444,.18,.08,.015,glass);m.finish=.8;
  }
  // A subtle windshield reflection, roof livery and wiper.
  m.finish=.96;m.quad([-.69,1.01,.927],[-.60,1.29,.512],[-.51,1.29,.512],[-.59,1.01,.927],[.14,.23,.29]);
  m.finish=.83;m.quad([-.19,1.452,-.61],[-.19,1.452,.35],[.19,1.452,.35],[.19,1.452,-.61],paint);
  m.finish=.1;m.box(0,.971,.995,.80,.014,.018,dark);
  // Front and rear bumpers: split intake, sculpted splitter, diffuser and lights.
  m.finish=.78;m.quad([-.94,.53,2.301],[.94,.53,2.301],[.94,.80,2.301],[-.94,.80,2.301],silver);
  m.quad([-.88,.59,-2.301],[-.88,.70,-2.301],[.88,.70,-2.301],[.88,.59,-2.301],silver);
  m.finish=.7;m.box(0,.26,2.255,1.85,.28,.13,silver);m.box(0,.30,-2.255,1.86,.32,.13,silver);m.box(0,.485,-2.329,1.12,.12,.014,paint);
  m.finish=.12;m.box(0,.19,2.29,2.02,.065,.24,dark);m.box(0,.24,-2.31,1.68,.17,.13,dark);
  m.box(0,.325,2.327,.91,.19,.015,dark);for(const side of [-1,1]){m.box(side*.155,.642,2.315,.25,.132,.018,dark);if(detail){m.finish=.35;for(let j=0;j<4;j++)m.box(side*.155-.078+j*.052,.651,2.327,.012,.112,.007,alloy);m.finish=.12;}}
  for(const side of [-1,1]){
   m.box(side*.72,.35,2.327,.29,.145,.018,dark);
   const cx=side*.635,z=2.319;
   m.finish=.94;m.quad([cx-.26,.672,z],[cx+.26,.672,z],[cx+.225,.799,z],[cx-.225,.799,z],[.095,.145,.18]);
   m.finish=-.65;
   for(const offset of [-.13,.12]){const x=side*.625+offset;if(detail){for(let j=0;j<16;j++){const a=j/16*TAU,b=(j+1)/16*TAU;m.quad([x+Math.cos(a)*.061,.735+Math.sin(a)*.052,2.328],[x+Math.cos(b)*.061,.735+Math.sin(b)*.052,2.328],[x+Math.cos(b)*.044,.735+Math.sin(b)*.035,2.329],[x+Math.cos(a)*.044,.735+Math.sin(a)*.035,2.329],[.86,.93,1]);}}else m.box(x,.70,2.316,.095,.065,.008,[.86,.93,1]);}
   m.finish=.1;m.box(side*.65,.66,-2.326,.54,.15,.022,dark);m.part=5;m.finish=-.2;m.box(side*.65,.70,-2.342,.49,.075,.012,[.88,.035,.022]);m.part=0;
   m.finish=.65;m.box(side*.32,.31,-2.39,.13,.105,.18,alloy);m.finish=.12;m.box(side*.32,.325,-2.485,.094,.071,.006,dark);
   if(detail)for(let i=0;i<3;i++)m.box(side*(.36+i*.18),.21,-2.38,.025,.16,.25,dark);
   // Raised rear wing and small endplates.
   m.box(side*.65,.87,-1.98,.065,.43,.13,dark);m.box(side*1.015,1.25,-2.02,.045,.20,.44,dark);
  }
  m.finish=.35;m.box(0,1.28,-2.02,2.10,.065,.40,dark);m.finish=.75;m.box(0,1.347,-2.015,2.09,.012,.18,paint);
  // Four rounded tires and split-spoke wheels. Part IDs animate them in the same draw call.
  for(const axle of [-1.36,1.36])for(const side of [-1,1]){
   const x=side*1.01,y=.42,n=detail?48:12;m.part=(axle>0?2:0)+(side<0?1:2);m.finish=.04;if(detail)m.roundedTire(x,y,axle,.32,rubber,n);else m.tire(x,y,axle,side,rubber,n);
   const outer=x+side*.162;m.finish=.62;m.cylinderX(outer,y,axle,.297,.014,alloy,n);m.finish=.13;m.cylinderX(outer+side*.010,y,axle,.253,.014,[.065,.075,.083],n);
   if(detail){m.finish=.48;m.cylinderX(outer+side*.018,y,axle,.205,.01,[.27,.30,.31],16);m.finish=.65;
    for(let k=0;k<10;k++)for(const split of [-1,1]){const a=k/10*TAU+split*.035,b=a+split*.12;const p=(r,t)=>[outer+side*.030,y+Math.sin(t)*r,axle+Math.cos(t)*r];m.quad(p(.075,a-.08),p(.269,b-.035),p(.269,b+.035),p(.075,a+.08),bright);}
   }else {m.finish=.6;for(let k=0;k<5;k++){const a=k/5*TAU,p=(r,t)=>[outer+side*.030,y+Math.sin(t)*r,axle+Math.cos(t)*r];m.quad(p(.065,a-.20),p(.27,a-.08),p(.27,a+.08),p(.065,a+.20),bright);}}
   m.finish=.65;m.cylinderX(outer+side*.035,y,axle,.071,.018,alloy,detail?12:8);m.finish=.15;m.cylinderX(outer+side*.049,y,axle,.034,.006,dark,8);
  }
  // Inexpensive contact decal, not a real-time shadow map.
  m.part=0;m.finish=0;
  for(let i=0;i<20;i++){const a=i/20*TAU,b=(i+1)/20*TAU;m.tri([0,.012,0],[Math.sin(a)*1.20,.012,Math.cos(a)*2.42],[Math.sin(b)*1.20,.012,Math.cos(b)*2.42],[.12,.15,.16]);}
  if(detail)m.smoothNormals();const mesh=this.upload(m);mesh.detail=detail;mesh.smoothed=!!detail;this.carMeshes.set(key,mesh);return mesh;
 }
 makeSportCar(color,detail,carClass){
  const key=carClass+color+(detail?':near':':far');if(this.carMeshes.has(key))return this.carMeshes.get(key);
  const m=new Builder(),paint=hex(color),light=[.85,.89,.88],carbon=[.035,.046,.054],glass=[.045,.105,.135],silver=[.64,.7,.73],tire=[.024,.03,.036];
  const f1=carClass==='f1',wheel=f1?[1.06,.42,1.66]:[1.01,.44,1.27],n=detail?48:12;
  const loft=(sections,col,glazing=false)=>{
   let rings=sections;if(detail){rings=[];for(let j=0;j<sections.length-1;j++){const a=sections[j],b=sections[j+1],prev=sections[Math.max(0,j-1)],next=sections[Math.min(sections.length-1,j+2)],n=Math.max(2,Math.ceil(Math.abs(b[0]-a[0])/.075));for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t;const r=[lerp(a[0],b[0],t)];for(let c=1;c<4;c++){const m0=(b[c]-prev[c])/(b[0]-prev[0]||1)*(b[0]-a[0]),m1=(next[c]-a[c])/(next[0]-a[0]||1)*(b[0]-a[0]);r[c]=clamp((2*t3-3*t2+1)*a[c]+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b[c]+(t3-t2)*m1,Math.min(a[c],b[c]),Math.max(a[c],b[c]));}rings.push(r);}}rings.push(sections.at(-1));}
   const at=(r,k)=>{const[z,w,lo,hi]=r,bevel=Math.min(.055,(hi-lo)*.16);return [w*k,hi-bevel*Math.pow(Math.abs(k),6),z];},ks=detail?[-1,-.97,-.90,-.73,-.4,0,.4,.73,.90,.97,1]:[-1,0,1];
   for(let j=0;j<rings.length-1;j++){const a=rings[j],b=rings[j+1],z=(a[0]+b[0])/2;
    for(let k=0;k<ks.length-1;k++){const window=glazing&&((z>.43&&z<.98)||(z>-1.60&&z<-1.22))&&Math.abs((ks[k]+ks[k+1])/2)<.90;m.finish=window?.96:.78;m.quad(at(a,ks[k]),at(b,ks[k]),at(b,ks[k+1]),at(a,ks[k+1]),window?glass:col);}
    for(const side of [-1,1]){const A=at(a,side),B=at(b,side);if(glazing&&z>-1.35&&z<.80&&Math.min(A[1],B[1])>1.10){const aLow=[A[0],1.02,A[2]],bLow=[B[0],1.02,B[2]],aHigh=[A[0],A[1]-.055,A[2]],bHigh=[B[0],B[1]-.055,B[2]];m.finish=.78;m.quad([side*a[1],a[2],a[0]],[side*b[1],b[2],b[0]],bLow,aLow,col);m.finish=.96;m.quad(aLow,bLow,bHigh,aHigh,glass);m.finish=.78;m.quad(aHigh,bHigh,B,A,col);}else {m.finish=.78;m.quad([side*a[1],a[2],a[0]],[side*b[1],b[2],b[0]],B,A,col);}}
   }
   for(const[z,w,lo,hi]of[sections[0],sections.at(-1)])m.quad([-w,lo,z],[w,lo,z],[w,hi-.04,z],[-w,hi-.04,z],col);
  };
  const beam=(a,b,width,col)=>{const axis=norm(sub(b,a)),r=norm(cross(axis,[0,1,0])),u=cross(axis,r),pt=(p,x,y)=>p.map((v,i)=>v+(r[i]*x+u[i]*y)*width);
   m.quad(pt(a,-1,-1),pt(b,-1,-1),pt(b,1,-1),pt(a,1,-1),col);m.quad(pt(a,-1,1),pt(b,-1,1),pt(b,1,1),pt(a,1,1),col);m.quad(pt(a,-1,-1),pt(b,-1,-1),pt(b,-1,1),pt(a,-1,1),col);m.quad(pt(a,1,-1),pt(b,1,-1),pt(b,1,1),pt(a,1,1),col);};
  if(f1){
   m.finish=.15;m.box(0,.12,-.13,1.75,.075,4.30,carbon); // floor
   m.finish=.83;loft([[-2.35,.18,.25,.52],[-1.45,.36,.24,.91],[-.60,.43,.25,.82],[.38,.42,.22,.71],[1.1,.26,.26,.55],[2.52,.17,.24,.36],[2.73,.12,.26,.32]],paint);
   // Sculpted sidepods and contrasting intake mouths.
   for(const side of [-1,1]){
    m.finish=.80;m.quad([side*.39,.27,-1.6],[side*.87,.27,-1.25],[side*.92,.61,.42],[side*.39,.71,.35],paint);
    m.quad([side*.39,.27,-1.6],[side*.87,.27,-1.25],[side*.87,.58,-.35],[side*.39,.77,-.65],paint);
    m.quad([side*.87,.27,-1.25],[side*.93,.28,.45],[side*.92,.61,.42],[side*.87,.58,-.35],paint);
    m.finish=.08;m.quad([side*.46,.38,.46],[side*.88,.34,.46],[side*.88,.59,.46],[side*.46,.64,.46],carbon);
    m.finish=.65;m.quad([side*.88,.59,-.9],[side*.94,.59,.05],[side*.944,.64,.05],[side*.884,.64,-.9],light);
    m.finish=.14;beam([side*.25,.35,1.15],[side*1.06,.40,1.66],.028,carbon);beam([side*.31,.33,2.02],[side*1.06,.40,1.66],.028,carbon);beam([side*.29,.45,-1.3],[side*1.06,.42,-1.66],.035,carbon);
    m.box(side*.21,.31,2.35,.045,.22,.16,carbon);m.box(side*.98,.18,2.60,.055,.28,.62,paint);
    m.box(side*.73,.23,-2.38,.055,.81,.18,carbon);m.box(side*.98,.78,-2.45,.06,.48,.65,paint);
    beam([side*.33,.70,.42],[side*.49,.83,.47],.025,carbon);m.finish=.8;m.box(side*.52,.79,.45,.18,.10,.20,paint);
   }
   m.finish=.18;m.box(0,.19,2.57,2.04,.065,.62,carbon);m.finish=.78;m.box(0,.27,2.53,1.90,.048,.17,paint);m.box(0,.35,2.46,1.80,.035,.13,light);
   m.finish=.1;m.box(0,.83,-2.46,2.02,.06,.60,carbon);m.finish=.85;m.box(0,1.02,-2.43,1.98,.09,.39,paint);m.finish=.65;m.box(0,1.11,-2.40,1.97,.015,.14,light);
   // Open cockpit, visible driver helmet, halo and engine airbox.
   m.finish=.05;m.box(0,.70,-.18,.59,.07,.80,carbon);
   m.finish=.7;loft([[-1.40,.12,.72,.84],[-.90,.19,.76,1.20],[-.55,.15,.78,1.13]],paint);
   m.finish=.09;m.box(0,.98,-.538,.20,.13,.015,carbon);
   m.finish=.14;beam([-.36,.78,-.55],[-.35,1.04,.16],.034,carbon);beam([.36,.78,-.55],[.35,1.04,.16],.034,carbon);beam([-.35,1.04,.16],[0,.96,.57],.035,carbon);beam([.35,1.04,.16],[0,.96,.57],.035,carbon);beam([0,.96,.57],[0,.68,.64],.032,carbon);
   m.finish=.7;const lat=detail?12:5,lon=detail?32:12;for(let j=0;j<lat;j++)for(let i=0;i<lon;i++){const a=i/lon*C.TAU,b=(i+1)/lon*C.TAU,u=-Math.PI/2+j/lat*Math.PI,v=-Math.PI/2+(j+1)/lat*Math.PI,at=(t,h)=>[Math.cos(t)*Math.cos(h)*.18,.91+Math.sin(h)*.19,-.21+Math.sin(t)*Math.cos(h)*.18];m.quad(at(a,u),at(b,u),at(b,v),at(a,v),[.94,.68,.16]);}
   m.finish=.95;m.box(0,.91,-.032,.27,.07,.014,glass);m.finish=.8;m.quad([-.08,.56,1.08],[-.06,.365,2.49],[.06,.365,2.49],[.08,.56,1.08],light);
   m.part=5;m.box(0,.37,-2.45,.14,.09,.02,[.95,.09,.025]);m.part=0;
  }else{
   m.finish=.78;loft([[-2.06,.84,.34,.82],[-1.48,1.02,.33,.93],[.92,1.02,.33,.92],[1.75,.93,.32,.77],[2.04,.87,.31,.66]],paint);
   // Wide arch surrounds, hatchback cabin and large glass surfaces.
   m.finish=.78;loft([[-1.65,.80,.85,.92],[-1.17,.70,.88,1.56],[.38,.69,.88,1.53],[1.02,.83,.88,.97]],paint,true);
   for(const side of [-1,1]){
    m.finish=.55;m.box(side*.787,1.03,-.35,.045,.44,.09,paint);
    m.finish=.8;m.quad([side*1.023,.42,-1.65],[side*1.023,.78,-.8],[side*1.023,.78,.5],[side*1.023,.48,-.26],light);
    m.finish=.12;m.box(side*1.023,.25,-.05,.09,.12,2.8,carbon);
    m.box(side*.67,.98,-1.75,.075,.43,.11,carbon);m.box(side*1.02,1.37,-1.75,.055,.20,.51,paint);
    m.finish=.85;m.box(side*1.06,1.03,.51,.22,.12,.28,light);
    m.finish=.03;m.box(side*.89,.15,-1.7,.28,.30,.035,carbon); // mudflaps
    m.finish=.92;m.box(side*.59,.58,2.049,.49,.16,.026,glass);m.finish=-.55;m.box(side*.59,.63,2.068,.41,.068,.016,light);
    m.part=5;m.box(side*.69,.63,-2.074,.30,.18,.026,[.88,.035,.025]);m.part=0;
   }
   m.finish=.2;m.box(0,.23,2.02,1.94,.07,.27,carbon);m.box(0,.33,2.055,1.23,.19,.025,carbon);m.box(0,.27,-2.05,1.7,.16,.13,carbon);
   m.finish=.8;m.box(0,1.43,-1.76,2.06,.07,.45,paint);m.box(0,1.60,-.40,.48,.09,.49,paint);
   m.finish=.04;m.box(0,1.61,-.142,.39,.06,.012,carbon);m.box(0,.947,1.02,.49,.04,.39,carbon);
   // Bonnet stripes and rally lamps.
   m.finish=.78;m.quad([-.22,.963,1.02],[-.18,.783,1.76],[.18,.783,1.76],[.22,.963,1.02],light);
   m.finish=-.5;for(const x of [-.31,-.1,.1,.31])m.box(x,.53,2.115,.145,.15,.07,[.96,.92,.70]);
  }
  // Wheels use the same single-draw animation system, with class-specific pivots.
  for(const axle of [-wheel[2],wheel[2]])for(const side of [-1,1]){
   const x=side*wheel[0],y=wheel[1],outer=x+side*(f1?.235:.165),width=f1?.46:.32;m.part=(axle>0?2:0)+(side<0?1:2);m.finish=.04;
   if(f1){if(detail)m.roundedTire(x,y,axle,width,tire,n);else m.cylinderX(x,y,axle,.405,width,tire,n);m.finish=.15;m.cylinderX(outer,y,axle,.32,.012,tire,n);}else if(detail)m.roundedTire(x,y,axle,width,tire,n);else m.tire(x,y,axle,side,tire,n);
   m.finish=.58;m.cylinderX(outer+side*.012,y,axle,.273,.016,silver,n);m.finish=.1;m.cylinderX(outer+side*.023,y,axle,.235,.014,carbon,n);
   m.finish=.7;for(let i=0;i<(detail?10:5);i++){const a=i/(detail?10:5)*C.TAU,at=(r,t)=>[outer+side*.038,y+Math.sin(t)*r,axle+Math.cos(t)*r];m.quad(at(.06,a-.16),at(.258,a-.06),at(.258,a+.06),at(.06,a+.16),light);}
   m.cylinderX(outer+side*.046,y,axle,.066,.018,f1?[.95,.68,.17]:silver,8);
  }
  m.part=0;m.finish=0;for(let i=0;i<20;i++){const a=i/20*C.TAU,b=(i+1)/20*C.TAU;m.tri([0,.012,0],[Math.sin(a)*1.27,.012,Math.cos(a)*(f1?2.9:2.2)],[Math.sin(b)*1.27,.012,Math.cos(b)*(f1?2.9:2.2)],[.12,.15,.16]);}
  if(detail)m.smoothNormals();const mesh=this.upload(m);mesh.detail=detail;mesh.smoothed=!!detail;this.carMeshes.set(key,mesh);return mesh;
 }
 // Damage overlays are quantized per body zone and cached. A scratch, dent,
 // chipped paint and stressed glass appear progressively, independently of paint.
 // They are cosmetic panels, not a deformable crash chassis.
 makeDamageMesh(car,detail=true){
  const zones=car.damageZones||{},fallback=car.damage&&!Object.values(zones).some(x=>x>0)?car.damage:0;
  const tier=n=>n<=0?0:n<3?1:n<8?2:n<18?3:n<35?4:5;
  const levels=['front','left','right','rear'].map(z=>tier((zones[z]||0)+(z==='front'?fallback:0)));
  if(!levels.some(Boolean))return null;
  const key=car.carClass+':' + (detail?'near':'far') + ':'+levels.join('');
  if(this.damageMeshes.has(key))return this.damageMeshes.get(key);
  const m=new Builder(),f1=car.carClass==='f1',rally=car.carClass==='rally';
  const scar=[.075,.085,.092],metal=[.52,.55,.58],crease=[.16,.18,.20],shadow=[.025,.030,.036],broken=[.14,.10,.09];
  const frontZ=f1?2.10:rally?1.62:1.75,frontY=f1?.46:rally?.81:.92;
  const rearZ=f1?-1.68:rally?-1.85:-1.89,rearY=f1?.89:rally?.86:.84;
  // Small surface ribbons: unlike a flat opaque sticker, irregular geometry
  // creates a raised fold and thin varied scratches in the panel finish.
  const ribbon=(a,b,width,col)=>{
   const dx=b[0]-a[0],dz=b[2]-a[2],mag=Math.hypot(dx,dz)||1,ex=dz/mag*width*.5,ez=-dx/mag*width*.5;
   m.quad([a[0]-ex,a[1],a[2]-ez],[b[0]-ex,b[1],b[2]-ez],[b[0]+ex,b[1],b[2]+ez],[a[0]+ex,a[1],a[2]+ez],col);
  };
  const cap=(which,level)=>{
   const front=which==='front',z=front?frontZ:rearZ,y=front?frontY:rearY,sgn=front?1:-1;
   const spread=f1?.20:.52;
   for(let i=0;i<(detail?level+1:Math.min(2,level));i++){
    const x=((i*7)%9-4)/4*spread*.73;
    const zz=z+sgn*(.11*(i%3-1)),yy=y+(i%3)*.006+.04;
    ribbon([x-.19,yy,zz-.10],[x+.13,yy+.009,zz+.07],.013+(i%3)*.008,i%4===0?metal:scar);
   }
   if(level>=2){
    const spread2=spread*(level>=4?1.65:1.04),yp=y+.044;
    m.finish=.12;m.quad([-spread2*.78,yp,z-.10],[spread2*.52,yp-.015,z-.17],[spread2*.95,yp+.002,z+.12],[-spread2*.55,yp+.02,z+.08],level>=4?broken:crease);
    m.finish=.48;ribbon([-spread2*.6,yp+.01,z-.04],[spread2*.76,yp,z+.10],.029,metal);
   }
   if(level>=3){
    // Broken paint lip and stressed bumper piece (location depends on class).
    const bumperZ=front?(f1?2.62:rally?2.08:2.34):(f1?-2.49:rally?-2.08:-2.36);
    const by=f1?(front?.29:1.06):(front?.46:.34);
    m.finish=.12;m.box(0,by,bumperZ,Math.min(1.2,spread*2),.055,.04,shadow);
    m.finish=.55;m.quad([-.39,by+.069,bumperZ],[.07,by+.08,bumperZ+.04],[.39,by+.04,bumperZ],[-.12,by+.038,bumperZ-.018],metal);
   }
   if(level>=4&&front&&!f1){
    // Thin branching cracks at the lower windshield edge.
    const yy=rally?1.025:1.015,zz=rally?.89:1.015;
    m.finish=-.25;ribbon([-.36,yy,zz],[.14,yy+.16,zz-.23],.014,[.75,.83,.85]);
    ribbon([.14,yy+.16,zz-.23],[.30,yy+.26,zz-.38],.01,[.54,.64,.68]);
   }
   if(level>=5){
    const zz=z-sgn*.035;m.finish=.03;
    ribbon([-spread*.65,y+.08,zz],[spread*.55,y+.075,zz+.08],.08,shadow);
   }
  };
  const side=(sgn,level)=>{
   // Each vehicle has a different sidepod/door footprint.
   const x=sgn*(f1?.937:rally?1.043:1.091),y=f1?.55:rally?.64:.66,z=f1?-.10:rally?-.16:-.10;
   m.finish=.10;
   for(let i=0;i<(detail?level+1:Math.min(2,level));i++){
    const zz=z+(i-(level/2))*.17,dy=.09*(i%3-1);
    m.quad([x+sgn*.025,y+dy-.02,zz-.20],[x+sgn*.025,y+dy+.008,zz+.19],[x+sgn*.024,y+dy+.024,zz+.21],[x+sgn*.024,y+dy-.011,zz-.16],i%3===0?metal:scar);
   }
   if(level>=2){m.finish=.08;m.quad([x+sgn*.034,y-.18,z-.45],[x+sgn*.039,y+.19,z-.30],[x+sgn*.048,y+.10,z+.38],[x+sgn*.030,y-.12,z+.43],level>=4?broken:crease);}
   if(level>=3){m.finish=.56;m.box(x+sgn*.057,y-.11,z,.022,.065,.60,metal);}
   if(level>=5){m.finish=.08;m.box(x+sgn*.065,y-.19,z,.049,.10,.85,shadow);}
  };
  if(levels[0])cap('front',levels[0]);
  if(levels[3])cap('rear',levels[3]);
  if(levels[1])side(-1,levels[1]);
  if(levels[2])side(1,levels[2]);
  const mesh=this.upload(m);
  // Cosmetic damage can create many combinations; cap GPU memory.
  if(this.damageMeshes.size>=180){const first=this.damageMeshes.keys().next().value;const old=this.damageMeshes.get(first);this.gl.deleteBuffer(old.buffer);this.damageMeshes.delete(first);}
  this.damageMeshes.set(key,mesh);return mesh;
 }
 calculateFitDistance(){this.resize();const b=this.track.viewBounds||this.track.bounds,radius=Math.hypot(b.maxX-b.minX+35,b.maxZ-b.minZ+35,b.maxY-b.minY)*.5,angle=Math.min(27.5*C.DEG,Math.atan(Math.tan(27.5*C.DEG)*this.aspect));return Math.max(90,radius/Math.sin(angle)*1.12);}
 fitEditor(){if(!this.bounds)return;this.editorFitDistance=this.calculateFitDistance();this.editorDistance=this.editorFitDistance;this.editorTarget=[this.bounds.cx,this.bounds.y,this.bounds.cz];this.editorMode='fit';}

 sectionPoint(index){const p=this.track.points.filter(p=>p.seg===index);return p[Math.floor(p.length/2)]||this.track.points[0];}
 focusSection(index,resetDistance=true){this.focusPoint(this.sectionPoint(index),resetDistance);this.editorMode='section';}
 focusPoint(p,resetDistance=true){this.editorTarget=[p.x,p.y,p.z];if(resetDistance)this.editorDistance=clamp(p.width*5.4,45,150);this.editorMode='free';}
 editorCamera(){const t=this.editorTarget||[0,0,0],d=this.editorDistance,e=this.orbitHeight;return {eye:[t[0]+Math.sin(this.orbit)*Math.cos(e)*d,t[1]+Math.sin(e)*d,t[2]+Math.cos(this.orbit)*Math.cos(e)*d],target:t,up:[0,1,0]};}
 groundAt(clientX,clientY){const rect=this.canvas.getBoundingClientRect(),cam=this.editorCamera(),f=norm(sub(cam.target,cam.eye)),r=norm(cross([0,1,0],f)),u=cross(f,r),k=Math.tan(27.5*C.DEG),px=((clientX-rect.left)/rect.width*2-1)*k*rect.width/rect.height,py=(1-(clientY-rect.top)/rect.height*2)*k,ray=norm(f.map((v,i)=>v+r[i]*px+u[i]*py));if(Math.abs(ray[1])<.01)return null;const d=(cam.target[1]-cam.eye[1])/ray[1];return d>0&&d<100000?cam.eye.map((v,i)=>v+ray[i]*d):null;}
 zoomEditor(factor,clientX=null,clientY=null){const before=clientX===null?null:this.groundAt(clientX,clientY);this.editorDistance=clamp(this.editorDistance*factor,9,Math.max(4000,this.editorFitDistance*3));this.editorMode='free';if(before){const after=this.groundAt(clientX,clientY);if(after){this.editorTarget[0]+=before[0]-after[0];this.editorTarget[2]+=before[2]-after[2];}}}
 panEditor(dx,dy){const r=this.canvas.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,a=this.groundAt(x,y),b=this.groundAt(x-dx,y-dy);if(a&&b){this.editorTarget[0]+=b[0]-a[0];this.editorTarget[2]+=b[2]-a[2];}this.editorMode='free';}
 projectPoint(p){if(!this.viewProjection)return null;const v=this.viewProjection,x=p.x,y=p.y,z=p.z,w=v[3]*x+v[7]*y+v[11]*z+v[15];if(w<=0)return null;const r=this.canvas.getBoundingClientRect();return {x:((v[0]*x+v[4]*y+v[8]*z+v[12])/w+1)*r.width/2,y:(1-(v[1]*x+v[5]*y+v[9]*z+v[13])/w)*r.height/2,w};}
 pickPoint(clientX,clientY){const r=this.canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;let best=Infinity,result=null;for(const p of this.track.points){const q=this.projectPoint(p);if(!q)continue;const d=(q.x-x)**2+(q.y-y)**2;if(d<best){best=d;result=p;}}return best<90*90?result:null;}
 setQuality(q){this.quality=q;}
 setCameraSettings(v){this.cameraSettings=cameraSettings(v);this.resetCamera();}
 getAntialiasing(){return {msaa:!!this.gl.getContextAttributes().antialias,resolution:this.quality};}
 resetCamera(){this.eye=null;this.lastBase=null;}
 resize(){const r=this.canvas.getBoundingClientRect(),scale=this.quality==='performance'?.75:this.quality==='quality'?Math.min(Math.max(devicePixelRatio||1,1.5),2):Math.min(Math.max(devicePixelRatio||1,1),1.35),w=Math.max(2,Math.round(r.width*scale)),h=Math.max(2,Math.round(r.height*scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}this.aspect=w/h;}
 render({cars=[],player=null,racing=false,showroom=false,dt=.016,hood=false}={}){
  if(!this.track)return;this.resize();const gl=this.gl,b=this.bounds;let eye,target,up=[0,1,0],fov=55*C.DEG;
  if((racing||showroom)&&player){
   const model=carMatrix(player),r=[model[0],model[1],model[2]],u=[model[4],model[5],model[6]],f=[model[8],model[9],model[10]],base=[player.x,player.y,player.z];
   if(showroom){const d=this.showroomDistance*Math.max(1,1.10/this.aspect),a=this.showroomOrbit;eye=base.map((v,i)=>v+f[i]*Math.cos(a)*d+r[i]*Math.sin(a)*d+u[i]*d*.32);target=base.map((v,i)=>v+u[i]*.73);up=u;fov=45*C.DEG;}
   else if(hood){const height=player.carClass==='f1'?.94:player.carClass==='rally'?1.48:1.38;eye=base.map((v,i)=>v+u[i]*height+f[i]*(player.carClass==='f1'?.78:1.48));target=base.map((v,i)=>v+u[i]*(height+.02)+f[i]*70);up=u;fov=this.cameraSettings.hoodFov*C.DEG;this.eye=null;this.lastBase=null;}
   else{
    const cs=this.cameraSettings,speedRatio=clamp(Math.abs(player.speed)/Math.max(1,player.spec?.maxSpeed||60),0,1),behind=cs.distance+cs.pullback*speedRatio,wanted=base.map((v,i)=>v-f[i]*behind+u[i]*cs.height);
    // Translate the previous camera with the chassis before smoothing its orbit.
    // World-space smoothing otherwise adds speed/follow metres of unintended lag.
    if(!this.eye)this.eye=wanted.slice();else if(this.lastBase)this.eye=this.eye.map((v,i)=>v+base[i]-this.lastBase[i]);this.eye=this.eye.map((v,i)=>lerp(v,wanted[i],1-Math.exp(-dt*cs.follow)));this.lastBase=base.slice();eye=this.eye;target=base.map((v,i)=>v+f[i]*8+u[i]*.72);up=norm([u[0]*.3,1,u[2]*.3]);fov=(cs.fov+cs.fovBoost*speedRatio)*C.DEG;

   }
   gl.uniform2f(this.u.uFog,Math.max(420,b.extent*.25),Math.max(3200,b.extent*1.8+1200));
  }else{
   ({eye,target,up}=this.editorCamera());const far=Math.max(1800,this.editorDistance*4);gl.uniform2f(this.u.uFog,Math.max(300,this.editorDistance*1.05),far);
  }
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.drawSky(eye,target,up,fov);gl.uniform3fv(this.u.uEye,eye);gl.uniform3fv(this.u.uFogColor,this.sky);
  const far=Math.max(5000,this.editorDistance*3+b.extent*2);const vp=multiply(perspective(fov,this.aspect,.12,far),lookAt(eye,target,up));this.viewProjection=vp;this.lastEye=eye;this.lastTarget=target;gl.uniformMatrix4fv(this.u.uVP,false,vp);this.drawCalls=1;this.triangles=1;
  for(const m of this.meshes)this.draw(m,identity());
  for(const c of cars){const distance=Math.hypot(c.x-eye[0],c.y-eye[1],c.z-eye[2]);if((racing||showroom)&&distance>1000)continue;const detail=c.isPlayer||distance<(this.quality==='performance'?55:110);const wheel=c.carClass==='f1'?[1.06,.42,1.66]:c.carClass==='rally'?[1.01,.44,1.27]:[1.01,.42,1.36],model=carMatrix(c);this.draw(this.makeCar(c.color,detail,c.carClass),model,[(c.wheelTravel||0)/.405,c.steer*C.steeringLimit(c.speed,c),c.control?.brake||0],wheel);const damage=this.makeDamageMesh(c,detail);if(damage)this.draw(damage,model);}
 }
 draw(mesh,model,motion=[0,0,0],wheel=[1.01,.42,1.36]){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);const sizes=[3,3,3,1,1],offsets=[0,12,24,36,40];for(let i=0;i<5;i++){gl.enableVertexAttribArray(this.attrs[i]);gl.vertexAttribPointer(this.attrs[i],sizes[i],gl.FLOAT,false,44,offsets[i]);}gl.uniformMatrix4fv(this.u.uModel,false,model);gl.uniform3fv(this.u.uMotion,motion);gl.uniform3fv(this.u.uWheelProfile,wheel);gl.drawArrays(gl.TRIANGLES,0,mesh.count);this.drawCalls++;this.triangles+=mesh.count/3;}

}
root.AFRenderer={Renderer,Builder,carMatrix,lookAt,perspective,multiply,CAMERA_DEFAULTS,CAMERA_LIMITS,cameraSettings};
})(globalThis);
