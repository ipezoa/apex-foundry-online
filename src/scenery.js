/* Apex Foundry v6 — original, deterministic, reference-inspired environments.
 * Procedural mesh/sky artwork (NOT diffusion-generated images or surveyed scenery).
 * No downloaded photographs, licensed brand models, or runtime network requests.
 * Landmark positions, scale, lighting and vegetation are artistic approximations.
 */
(function(root){
'use strict';
const C=root.AFCore||(typeof require!=='undefined'?require('./core.js'):null),{TAU,clamp,wrap}=C;
const themes={
 albert_park:{title:'Melbourne · lakeside park',kind:'park',water:'lake',trees:'broad',city:1,hills:25,landmark:'city',accent:[.37,.70,.69],time:'day',note:'Lakeside lawns, eucalyptus-like canopies and a distant city skyline.',source:'https://www.formula1.com/en/racing/2026/australia'},
 shanghai:{title:'Shanghai · garden paddock',kind:'park',trees:'broad',city:.5,hills:18,landmark:'canopy',accent:[.81,.24,.19],time:'haze',note:'Low garden buildings, broad grandstand canopies and an urban horizon.',source:'https://www.formula1.com/en/racing/2026/china'},
 suzuka:{title:'Suzuka · wheel in the sky',kind:'park',trees:'broad',city:.35,hills:65,landmark:'ferris',accent:[.85,.19,.17],time:'day',note:'A stylized Ferris wheel above green parkland and circuit grandstands.',source:'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-suzuka-circuit.2BbgsRdkeux78UBGbmYiZV'},
 miami:{title:'Miami · palms & stadium',kind:'tropical',trees:'palm',city:.7,hills:8,landmark:'stadium',accent:[.10,.77,.78],time:'day',note:'Sunlit palms, cyan stadium seating and a low urban horizon.',source:'https://www.formula1.com/en/racing/2026/miami'},
 villeneuve:{title:'Montréal · island park',kind:'park',trees:'broad',city:.6,hills:32,water:'river',landmark:'dome',accent:[.85,.24,.21],time:'day',note:'Leafy island scenery, broad water and a geometric dome motif.',source:'https://www.formula1.com/en/racing/2026/canada'},
 monaco:{title:'Monte-Carlo · Riviera harbor',kind:'mediterranean',trees:'palm',city:1.5,hills:250,water:'harbor',landmark:'yachts',accent:[.83,.59,.37],time:'day',note:'Cream terraces, terracotta roofs, hillside silhouettes and yacht-like harbor forms.',source:'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-monaco.vFsmfGHr6RWyLFtxi58wi'},
 catalunya:{title:'Barcelona · Mediterranean hills',kind:'dry',trees:'broad',city:.15,hills:110,landmark:'grandstand',accent:[.86,.24,.20],time:'day',note:'Warm, low hills, scattered trees and red grandstand seats.',source:'https://www.formula1.com/en/racing/2026/barcelona-catalunya'},
 red_bull_ring:{title:'Spielberg · alpine amphitheater',kind:'alpine',trees:'pine',city:.1,hills:350,landmark:'grandstand',accent:[.80,.83,.85],time:'day',note:'Layered mountain silhouettes, conifers and green hillside scenery.',source:'https://www.formula1.com/en/racing/2026/austria'},
 silverstone:{title:'Silverstone · open countryside',kind:'country',trees:'broad',city:.15,hills:25,landmark:'wing',accent:[.64,.69,.73],time:'cloud',note:'Wide open grassland, low hedges and an angular pit-wing silhouette.',source:'https://www.formula1.com/en/racing/2026/great-britain'},
 spa:{title:'Spa · Ardennes forest',kind:'forest',trees:'pine',city:.05,hills:240,landmark:'grandstand',accent:[.84,.69,.16],time:'cloud',note:'Dense conifers and layered wooded hills inspired by the Ardennes.',source:'https://www.formula1.com/en/information/belgium-circuit-de-spa-francorchamps.3LltuYaAXVRU8iezEsjzGw'},
 hungaroring:{title:'Budapest · rolling summer hills',kind:'country',trees:'broad',city:.1,hills:125,landmark:'grandstand',accent:[.53,.66,.81],time:'haze',note:'A warm, dry-green bowl of low hills and leafy grandstands.',source:'https://www.formula1.com/en/racing/2026/hungary'},
 zandvoort:{title:'Zandvoort · North Sea dunes',kind:'dunes',trees:'shrub',city:.12,hills:48,water:'sea',landmark:'grandstand',accent:[.96,.43,.12],time:'day',note:'Pale sand ridges, low scrub, a coastal horizon and orange seating.',source:'https://dutchgp.com/en/explore-the-track/'},
 monza:{title:'Monza · historic parkland',kind:'forest',trees:'broad',city:.12,hills:18,landmark:'grandstand',accent:[.86,.20,.18],time:'day',note:'Tall park trees, low classical buildings and red grandstands.',source:'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-autodromo-nazionale-monza.51PKqBRlxNs0fzLWQzsnd0'},
 madrid:{title:'Madrid · exhibition district',kind:'dry',trees:'broad',city:.85,hills:60,landmark:'expo',accent:[.79,.21,.22],time:'day',note:'A stylized exhibition complex, geometric roofs and warm plateau light.',source:'https://www.madring.com/en/circuit'},
 baku:{title:'Baku · old stone & glass',kind:'urban',trees:'broad',city:1.2,hills:25,water:'sea',landmark:'flames',accent:[.38,.69,.86],time:'day',note:'Warm stone blocks, a waterfront and three tapered skyline towers.',source:'https://www.formula1.com/en/racing/2026/azerbaijan'},
 sepang:{title:'Sepang · tropical canopies',kind:'tropical',trees:'palm',city:.08,hills:80,landmark:'canopy',accent:[.85,.86,.81],time:'haze',note:'Palm-lined grounds, lush hills and wide parasol-like roof forms.',source:'https://www.sepangcircuit.com/'},
 marina_bay:{title:'Singapore · illuminated bay',kind:'urban',trees:'palm',city:1.6,hills:12,water:'harbor',landmark:'skypark',accent:[.38,.78,.85],time:'night',note:'A luminous skyline, a three-tower skypark motif, observation wheel and waterfront.',source:'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-marina-bay-street-circuit.3d9yfiqIKoQhcMnRLESWbz'},
 americas:{title:'Austin · tower & Texas hills',kind:'dry',trees:'broad',city:.18,hills:95,landmark:'tower',accent:[.88,.15,.13],time:'day',note:'An observation-tower silhouette above low rolling Texas-inspired terrain.',source:'https://www.formula1.com/en/racing/2026/united-states'},
 rodriguez:{title:'Mexico City · stadium circuit',kind:'urban',trees:'broad',city:.95,hills:70,landmark:'stadium',accent:[.28,.63,.34],time:'haze',note:'Dense city blocks, mature trees and a colorful stadium bowl.',source:'https://www.formula1.com/en/racing/2026/mexico'},
 interlagos:{title:'São Paulo · urban hillside',kind:'urban',trees:'broad',city:1.4,hills:120,landmark:'city',accent:[.84,.71,.20],time:'cloud',note:'Apartment clusters around a rolling, green urban circuit setting.',source:'https://www.formula1.com/en/racing/2026/brazil'},
 vegas:{title:'Las Vegas · neon desert',kind:'desert',trees:'palm',city:1.5,hills:230,landmark:'sphere',accent:[.94,.29,.65],time:'night',note:'Neon hotel slabs, a luminous sphere motif and a dark mountain backdrop.',source:'https://www.formula1.com/en/racing/2026/las-vegas'},
 losail:{title:'Lusail · floodlit desert',kind:'desert',trees:'palm',city:.28,hills:24,landmark:'grandstand',accent:[.44,.33,.72],time:'night',note:'Low sand ridges, sparse palms and rows of bright floodlight poles.',source:'https://www.formula1.com/en/racing/2026/qatar'},
 yas_marina:{title:'Abu Dhabi · marina twilight',kind:'desert',trees:'palm',city:.6,hills:18,water:'harbor',landmark:'hotel',accent:[.31,.75,.79],time:'dusk',note:'Turquoise waterside accents, a glowing hotel canopy and palm-lined marina motifs.',source:'https://www.formula1.com/en/racing/2026/united-arab-emirates'},
 bahrain:{title:'Sakhir · desert sunset',kind:'desert',trees:'palm',city:.1,hills:55,landmark:'roundtower',accent:[.83,.28,.19],time:'dusk',note:'Sandy horizons, floodlights and a circular paddock-tower silhouette.',source:'https://www.formula1.com/en/racing/2025/bahrain'},
 jeddah:{title:'Jeddah · Red Sea lights',kind:'urban',trees:'palm',city:.9,hills:35,water:'sea',landmark:'city',accent:[.30,.77,.78],time:'night',note:'A luminous coastal skyline with palms and a broad waterside horizon.',source:'https://www.formula1.com/en/racing/2026/saudi-arabia'},
 custom:{title:'Foundry · club circuit',kind:'country',trees:'broad',city:.25,hills:65,landmark:'grandstand',accent:[.72,.88,.38],time:'day',note:'Original fictional club-circuit setting.',source:null}
};
function themeFor(track,override='auto'){
 const id=override!=='auto'&&themes[override]?override:track.config.source?.id||'custom';return {id,...(themes[id]||themes.custom)};
}
function lighting(t,time='auto'){
 const mode=time==='auto'?t.time:time;
 const palettes={day:{zenith:[.20,.45,.72],horizon:[.74,.85,.91],night:0,clouds:.33},cloud:{zenith:[.36,.46,.57],horizon:[.76,.80,.81],night:0,clouds:.83},haze:{zenith:[.40,.57,.70],horizon:[.85,.84,.75],night:0,clouds:.40},dusk:{zenith:[.18,.20,.39],horizon:[.86,.54,.37],night:.45,clouds:.25},night:{zenith:[.018,.035,.08],horizon:[.12,.18,.28],night:1,clouds:.08}};
 return {...palettes[mode]||palettes.day,mode};
}
// Entry cues are derived from geometry in the CURRENT direction. Distances are
// measured along the centerline to the detected turn-in, not to an official apex.
function turnCues(track){
 const step=3,N=Math.max(60,Math.ceil(track.length/step)),ds=track.length/N,k=[];
 for(let i=0;i<N;i++){let v=0;for(let j=-2;j<=2;j++)v+=track.sample((i+j)*ds).k;k.push(v/5);}
 const sign=k.map(x=>Math.abs(x)>.0023?Math.sign(x):0);
 // Fill tiny gaps inside a continuous bend, while retaining chicanes.
 for(let i=0;i<N;i++)if(!sign[i]){let a=0,b=0;for(let n=1;n<=4&&!a;n++)a=sign[(i+N-n)%N];for(let n=1;n<=4&&!b;n++)b=sign[(i+n)%N];if(a&&a===b)sign[i]=a;}
 let origin=sign.findIndex((s,i)=>s!==sign[(i+N-1)%N]);if(origin<0)origin=0;
 const groups=[];let group=null;
 for(let j=0;j<N;j++){const i=(origin+j)%N,s=sign[i];if(!s){group=null;continue;}if(!group||group.sign!==s){group={sign:s,start:i*ds,distance:0,angle:0,peak:0};groups.push(group);}group.distance+=ds;group.angle+=Math.abs(k[i])*ds;group.peak=Math.max(group.peak,Math.abs(k[i]));}
 const bends=groups.filter(g=>g.angle>10*C.DEG&&g.distance>=9).slice(0,100);
 return bends.map((g,index)=>({...g,index,entry:wrap(g.start,track.length),outside:-g.sign,markers:[100,50,25].map(distance=>({distance,s:wrap(g.start-distance,track.length),side:-g.sign})),chevrons:Array.from({length:Math.min(5,Math.max(2,Math.floor(g.distance/18)))},(_,j)=>wrap(g.start+Math.min(g.distance*.65,8+j*15),track.length))}));
}
const FONT={
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],
 '5':['111','100','111','001','111'],'m':['00000','00000','11010','10101','10101']
};
function drawCues(mesh,track,cues){
 const dark=[.025,.035,.04],yellow=[1,.77,.035],white=[.95,.96,.89];let boards=0,arrows=0;
 const board=(p,offset,width,height,h)=>{
  const rx=Math.cos(h),rz=-Math.sin(h),fx=Math.sin(h),fz=Math.cos(h),base=[p.x+Math.cos(p.h)*offset,p.y-offset*Math.tan(p.bank)+1.15,p.z-Math.sin(p.h)*offset];
  return (x,y,front=0)=>[base[0]+rx*x-fx*front,base[1]+y,base[2]+rz*x-fz*front];
 };
 for(const cue of cues){
  for(const mk of cue.markers){const p=track.sample(mk.s),run=mk.side>0?p.runoffRight:p.runoffLeft,off=mk.side*(p.width/2+Math.min(run*.22,3.5)+1.6),pt=board(p,off,3.6,1.8,p.h);
   mesh.finish=-.30;mesh.quad(pt(-1.90,0),pt(1.90,0),pt(1.90,1.85),pt(-1.90,1.85),dark);
   mesh.finish=-.55;mesh.quad(pt(-1.77,.10,.014),pt(1.77,.10,.014),pt(1.77,1.75,.014),pt(-1.77,1.75,.014),white);
   const text=String(mk.distance)+'m',cols=[...text].reduce((n,ch)=>n+FONT[ch][0].length+1,0)-1,pixel=Math.min(.24,3.12/cols),ox=-cols*pixel/2,oy=.43;
   let x=ox;mesh.finish=-.18;
   for(const ch of text){const glyph=FONT[ch];for(let y=0;y<glyph.length;y++)for(let i=0;i<glyph[y].length;i++)if(glyph[y][i]==='1'){const l=x+i*pixel,r=l+pixel*.94,b=oy+(4-y)*pixel,t=b+pixel*.94;mesh.quad(pt(l,b,.023),pt(r,b,.023),pt(r,t,.023),pt(l,t,.023),dark);}x+=(glyph[0].length+1)*pixel;}
   mesh.finish=0;for(const s of [-1,1]){const a=pt(s*1.20,-1.15);mesh.box(a[0],a[1],a[2],.10,1.3,.10,[.35,.39,.38]);}boards++;
  }
  for(const s of cue.chevrons){const p=track.sample(s),side=cue.outside,run=side>0?p.runoffRight:p.runoffLeft,off=side*(p.width/2+run+1.23),pt=board(p,off,3.8,1.8,p.h+cue.sign*.22);
   mesh.finish=-.30;mesh.quad(pt(-2.0,-.05),pt(2.0,-.05),pt(2.0,1.7),pt(-2.0,1.7),yellow);
   mesh.finish=-.12;mesh.quad(pt(-1.88,.07,.018),pt(1.88,.07,.018),pt(1.88,1.58,.018),pt(-1.88,1.58,.018),dark);
   mesh.finish=-.70;
   for(const cx of [-1.12,0,1.12]){const d=cue.sign,points=[[cx-d*.46,.22],[cx+d*.22,.82],[cx-d*.46,1.43],[cx-d*.02,1.43],[cx+d*.65,.82],[cx-d*.02,.22]].map(q=>pt(q[0],q[1],.034));for(let j=1;j<points.length-1;j++)mesh.tri(points[0],points[j],points[j+1],yellow);}
   mesh.finish=0;const a=pt(0,-1.15);mesh.box(a[0],a[1],a[2],.13,1.4,.13,[.34,.37,.38]);arrows++;
  }
 }
 mesh.finish=0;return {boards,arrows};
}
function buildWorld(mesh,track,theme,options={}){
 const b=track.viewBounds||track.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ,300),ground=b.minY-3,size=span+2300,light=lighting(theme,options.time),night=light.night;
 let seed=C.hash32([...theme.id].reduce((n,c)=>n*31+c.charCodeAt(0),47));const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const arid=['desert','dunes','dry'].includes(theme.kind),grass=arid?(theme.kind==='dunes'?[.63,.59,.41]:[.62,.49,.32]):[.26,.37,.23],water=[.12,.40,.48];
 mesh.quad([cx-size,ground,cz-size],[cx-size,ground,cz+size],[cx+size,ground,cz+size],[cx+size,ground,cz-size],grass);
 const stats={theme:theme.id,trees:0,buildings:0,landmarks:0,decorations:0};
 if(options.detail==='minimal')return {stats,light};
 const tint=(c,t)=>c.map(x=>clamp(x*t,0,1));
 const cylinder=(x,y,z,r,h,col,n=10,r2=r)=>{for(let i=0;i<n;i++){const a=i/n*TAU,d=(i+1)/n*TAU,A=[x+Math.sin(a)*r,y,z+Math.cos(a)*r],B=[x+Math.sin(d)*r,y,z+Math.cos(d)*r],D=[x+Math.sin(d)*r2,y+h,z+Math.cos(d)*r2],E=[x+Math.sin(a)*r2,y+h,z+Math.cos(a)*r2];mesh.quad(A,B,D,E,col);mesh.tri([x,y+h,z],E,D,tint(col,1.08));}};
 const hill=(x,z,r,h,col,base=ground)=>{const n=16;for(let i=0;i<n;i++){const a=i/n*TAU,c=(i+1)/n*TAU;mesh.tri([x+Math.sin(a)*r,base,z+Math.cos(a)*r],[x,base+h,z],[x+Math.sin(c)*r,base,z+Math.cos(c)*r],tint(col,.88+.14*(i%3)));}};
 const clear=(x,z,r)=>{const q=track.nearest(x,z);return q.distance>q.width/2+Math.max(q.runoffLeft,q.runoffRight)+r+7;};
 // Two uninterrupted rings of hill silhouettes lie beyond the circuit bounds.
 for(let layer=1;layer>=0;layer--)for(let i=0;i<48;i++){const a=i/48*TAU,r=span*.73+420+layer*500,x=cx+Math.sin(a)*r,z=cz+Math.cos(a)*r,h=theme.hills*(.35+rand()*.65)*(layer?1.30:1),w=span*.12+140;
  if(clear(x,z,w))hill(x,z,w,h,tint(arid?[.56,.49,.36]:[.22,.35,.31],layer?1.24:1));}
 if(theme.water){const x=b.maxX+120,z=cz,r=theme.water==='lake'?Math.min(span*.34,480):span*.65;
  mesh.finish=.62;mesh.quad([x,ground+.12,z-r],[x,ground+.12,z+r],[x+r*2.4,ground+.12,z+r],[x+r*2.4,ground+.12,z-r],water);
  mesh.finish=0;for(let i=0;i<15;i++){const xx=x+35+rand()*r*2,zz=z-r+rand()*r*2;mesh.quad([xx,ground+.14,zz],[xx+15+rand()*55,ground+.14,zz],[xx+15+rand()*55,ground+.14,zz+.4],[xx,ground+.14,zz+.4],tint(water,1.25));}
 }
 const tree=(x,y,z,h)=>{
  const col=arid?[.27,.37,.19]:[.14+rand()*.09,.29+rand()*.09,.17+rand()*.06];
  if(theme.trees==='palm'){
   cylinder(x,y,z,.30,h,[.46,.37,.24],5,.20);
   for(let j=0;j<6;j++){const a=j/6*TAU,A=[x,y+h,z],E=[x+Math.sin(a)*h*.58,y+h-.9,z+Math.cos(a)*h*.58],B=[x+Math.sin(a-.34)*h*.32,y+h+.4,z+Math.cos(a-.34)*h*.32],D=[x+Math.sin(a+.34)*h*.32,y+h+.4,z+Math.cos(a+.34)*h*.32];mesh.tri(A,B,E,col);mesh.tri(A,E,D,tint(col,1.13));}
  }else if(theme.trees==='pine'){
   cylinder(x,y,z,.34,h*.48,[.33,.27,.19],5);
   cylinder(x,y+h*.23,z,h*.25,h*.62,col,7,0);cylinder(x,y+h*.49,z,h*.18,h*.48,tint(col,1.1),7,0);
  }else{
   if(theme.trees==='shrub')h*=.27;
   cylinder(x,y,z,.32,h*.58,[.34,.29,.20],5);
   cylinder(x,y+h*.38,z,h*.29,h*.32,col,7,h*.35);cylinder(x,y+h*.70,z,h*.35,h*.30,tint(col,1.1),7,0);
  }stats.trees++;
 };
 // Sample the circuit, not a giant square: trees stay close enough to be seen.
 const forest=['forest','alpine','park','tropical'].includes(theme.kind),spacing=forest?25:55,rows=forest?2:1;
 for(let s=0;s<track.length;s+=spacing){const p=track.sample(s);for(const side of [-1,1])for(let row=0;row<rows;row++){
  if(rand()>(arid?.55:.92))continue;const r=side*(p.width/2+(side>0?p.runoffRight:p.runoffLeft)+10+row*20+rand()*20),x=p.x+Math.cos(p.h)*r,z=p.z-Math.sin(p.h)*r,h=8+rand()*12;
  if(clear(x,z,h*.35)){const base=Math.max(ground,p.y-3);if(base>ground+5)hill(x,z,h*.7,base-ground,tint(grass,.92));tree(x,base,z,h);}
 }}
 const building=(x,y,z,w,d,h,col)=>{
  mesh.finish=.22;mesh.box(x,y,z,w,h,d,col);mesh.finish=.34;mesh.box(x,y+h,z,w*1.06,1,d*1.06,tint(col,.75));
  if(theme.kind==='mediterranean'){mesh.finish=0;const a=[x-w*.53,y+h+1,z-d*.53],b=[x+w*.53,y+h+1,z-d*.53],c=[x+w*.53,y+h+1,z+d*.53],e=[x-w*.53,y+h+1,z+d*.53],m=[x,y+h+5,z];mesh.tri(a,b,m,[.63,.31,.21]);mesh.tri(b,c,m,[.69,.35,.23]);mesh.tri(c,e,m,[.56,.26,.19]);mesh.tri(e,a,m,[.61,.29,.20]);}
  else if(night>.4){mesh.finish=-.65;mesh.box(x,y+h+1,z,w*1.08,.35,d*1.08,theme.accent);}
  const count=Math.min(14,Math.floor(h/5));for(let j=1;j<count;j++){
   mesh.finish=night>.4?-.60:.65;const lit=night>.4?[.76,.78,.52]:[.24,.39,.47];
   for(let k=0;k<3;k++){const dx=(k-1)*w*.29;mesh.box(x+dx,y+j*4.5,z-d/2-.025,w*.14,1.25,.05,lit);mesh.box(x+dx,y+j*4.5,z+d/2+.025,w*.14,1.25,.05,lit);}
  }mesh.finish=0;stats.buildings++;
 };
 const count=Math.round(theme.city*65)+8;
 for(let i=0;i<count;i++){
  const a=rand()*TAU,r=span*.55+70+rand()*220,x=cx+Math.sin(a)*r,z=cz+Math.cos(a)*r,w=18+rand()*25,d=18+rand()*28,h=(theme.kind==='mediterranean'?18:20)+rand()*(theme.city>1?110:45);
  if(!clear(x,z,Math.max(w,d)*.75))continue;
  const col=theme.kind==='mediterranean'?[.71+rand()*.12,.65+rand()*.08,.51+rand()*.08]:[.33+rand()*.12,.39+rand()*.12,.44+rand()*.12];building(x,ground,z,w,d,h,col);
 }
 // Place the main scenic landmark beyond the start/finish runoff, with clearance.
 const sp=track.sample(track.startS+120);let loc=null;
 for(const side of [1,-1])for(let distance=95;distance<500&&!loc;distance+=35){const x=sp.x+Math.cos(sp.h)*side*distance,z=sp.z-Math.sin(sp.h)*side*distance;if(clear(x,z,65))loc={x,y:Math.max(ground,sp.y-3),z};}
 if(!loc)loc={x:b.maxX+200,y:ground,z:cz};
 let {x,y,z}=loc;const accent=theme.accent;
 if(y>ground+5)hill(x,z,90,y-ground,grass);
 const ferris=(X,Y,Z,r)=>{
  mesh.finish=.45;for(const side of [-1,1]){mesh.quad([X+side*3,Y+r*2+5,Z],[X+side*22,Y,Z-4],[X+side*26,Y,Z-4],[X+side*5,Y+r*2+5,Z],[.76,.80,.82]);}
  const centerY=Y+r+7;
  for(let i=0;i<32;i++){const a=i/32*TAU,b=(i+1)/32*TAU,pt=(R,t,zz)=>[X+Math.sin(t)*R,centerY+Math.cos(t)*R,Z+zz];
   for(const zz of [-1.5,1.5]){mesh.finish=night>.4?-.7:.3;mesh.quad(pt(r-1,a,zz),pt(r-1,b,zz),pt(r+1,b,zz),pt(r+1,a,zz),accent);mesh.finish=.3;mesh.tri([X,centerY,Z+zz],pt(r,a-.008,zz),pt(r,a+.008,zz),[.73,.78,.78]);}
   if(i%2===0){const xx=X+Math.sin(a)*r,yy=centerY+Math.cos(a)*r;mesh.finish=night>.4?-.4:.2;mesh.box(xx,yy-2,Z,3.6,3.8,4.5,[.65,.77,.80]);}
  }mesh.finish=0;
 };
 const stand=(X,Y,Z,w=95)=>{
  for(let j=0;j<7;j++){mesh.box(X,Y+j*1.55,Z+j*2.4,w,1.4,2.4,j%2?accent:tint(accent,.8));}
  mesh.finish=.25;mesh.quad([X-w*.56,Y+15,Z-2],[X+w*.56,Y+15,Z-2],[X+w*.56,Y+20,Z+22],[X-w*.56,Y+20,Z+22],[.78,.81,.80]);mesh.finish=0;
  for(const side of [-1,1])mesh.box(X+side*w*.44,Y,Z+18,.6,19,.6,[.43,.48,.48]);
 };
 switch(theme.landmark){
 case 'ferris':ferris(x,y,z,32);break;
 case 'skypark':
  for(const dx of [-42,0,42])building(x+dx,y,z,23,25,102,[.45,.54,.60]);mesh.finish=-.2;mesh.box(x,y+103,z,136,7,31,[.65,.75,.80]);mesh.finish=0;mesh.box(x,y+110,z,119,1.5,24,[.21,.42,.37]);ferris(x+190,y,z+60,42);break;
 case 'sphere':{
  const r=43,cy=y+r;
  for(let j=0;j<12;j++)for(let i=0;i<24;i++){const a=i/24*TAU,b=(i+1)/24*TAU,u=-Math.PI/2+j/12*Math.PI,v=-Math.PI/2+(j+1)/12*Math.PI,pt=(t,q)=>[x+Math.cos(q)*Math.sin(t)*r,cy+Math.sin(q)*r,z+Math.cos(q)*Math.cos(t)*r];mesh.finish=-.75;mesh.quad(pt(a,u),pt(b,u),pt(b,v),pt(a,v),(i+j)%4===0?[.96,.55,.10]:[(.19+j*.025),.23+i*.007,.63+j*.02]);}mesh.finish=0;break;}
 case 'tower':
  cylinder(x,y,z,5,65,[.86,.16,.12],10,3);mesh.quad([x-4,y+65,z],[x+4,y+65,z],[x+35,y+14,z+18],[x+25,y+14,z+18],[.88,.20,.14]);mesh.box(x,y+65,z,24,3,15,[.80,.84,.83]);break;
 case 'roundtower':
  cylinder(x,y,z,21,40,[.57,.56,.50],16,17);for(let j=1;j<8;j++)cylinder(x,y+j*5,z,21-j*.5,1.1,[.83,.82,.74],16);break;
 case 'flames':
  for(let j=0;j<3;j++){const xx=x+(j-1)*32;for(let i=0;i<7;i++){mesh.finish=.65;mesh.box(xx+Math.sin(i*.33)*9,y+i*14,z+(j===1?20:0),26-i*2.5,14,24-i*2,[.26,.44,.55]);}}mesh.finish=0;break;
 case 'stadium':
  for(let side=-1;side<=1;side+=2){stand(x+side*58,y,z,75);stand(x,y,z+side*60,95);}break;
 case 'canopy':
  stand(x,y,z,115);for(let j=-2;j<=2;j++){const xx=x+j*27;mesh.box(xx,y,z+16,.8,24,.8,[.72,.73,.66]);const peak=[xx,y+28,z+16];for(let k=0;k<8;k++){const a=k/8*TAU,b=(k+1)/8*TAU;mesh.tri([xx+Math.sin(a)*19,y+21,z+16+Math.cos(a)*19],peak,[xx+Math.sin(b)*19,y+21,z+16+Math.cos(b)*19],[.85,.86,.80]);}}break;
 case 'wing':case 'expo':
  building(x,y,z,120,32,17,[.57,.64,.67]);for(let j=0;j<5;j++){const xx=x-60+j*24;mesh.quad([xx,y+18,z-19],[xx+24,y+18,z-19],[xx+20,y+31,z+19],[xx-4,y+21,z+19],j%2?[.79,.83,.85]:[.44,.50,.54]);}break;
 case 'hotel':
  building(x,y,z,110,32,23,[.41,.47,.56]);for(let j=-4;j<=4;j++){mesh.finish=-.5;mesh.box(x+j*12,y+24+Math.cos(j*.2)*5,z,8,.6,45,accent);}mesh.finish=0;break;
 case 'dome':
  for(let j=0;j<6;j++)for(let i=0;i<16;i++){const a=i/16*TAU,b=(i+1)/16*TAU,u=j/6*Math.PI/2,v=(j+1)/6*Math.PI/2,pt=(t,q)=>[x+Math.cos(q)*Math.sin(t)*32,y+Math.sin(q)*32,z+Math.cos(q)*Math.cos(t)*32];mesh.quad(pt(a,u),pt(b,u),pt(b,v),pt(a,v),(i+j)%2?[.48,.66,.65]:[.73,.81,.76]);}break;
 case 'yachts':
  // A separate scenic harbor pool never covers the drivable road/runoff.
  mesh.finish=.6;mesh.quad([x-70,y+.05,z-65],[x+80,y+.05,z-65],[x+80,y+.05,z+55],[x-70,y+.05,z+55],water);mesh.finish=0;
  for(let j=0;j<6;j++){const xx=x+(j%3-1)*40,zz=z+Math.floor(j/3)*45-25;mesh.box(xx,y+.45,zz,12,3,29,[.84,.87,.85]);mesh.box(xx,y+3.45,zz,9,4,16,[.93,.94,.89]);mesh.box(xx,y+7.45,zz,7,1.5,10,[.24,.38,.44]);mesh.box(xx,y+7.45,zz,.17,9,.17,[.70,.74,.74]);}break;
 default:stand(x,y,z);break;
 }
 stats.landmarks++;stats.landmark=theme.landmark;
 // Additional simple stands and night lights are baked into the same mesh.
 for(let s=200;s<track.length;s+=850){const p=track.sample(s),off=p.width/2+p.runoffLeft+42,X=p.x-Math.cos(p.h)*off,Z=p.z+Math.sin(p.h)*off;if(clear(X,Z,35)){stand(X,Math.max(ground,p.y-2),Z,55);stats.decorations++;}}
 mesh.finish=0;return {stats,light};
}
const api={themes,themeFor,lighting,turnCues,drawCues,buildWorld};root.AFScenery=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
