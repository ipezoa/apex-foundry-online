/* Keyboard bindings are independent of physics, renderer, and touch controls. */
(function(root){
'use strict';
const ACTIONS=Object.freeze([
 {id:'throttle',label:'Accelerate',keys:['KeyW','ArrowUp'],group:'Drive'},
 {id:'brake',label:'Brake / reverse',keys:['KeyS','ArrowDown'],group:'Drive'},
 {id:'left',label:'Steer left',keys:['KeyA','ArrowLeft'],group:'Drive'},
 {id:'right',label:'Steer right',keys:['KeyD','ArrowRight'],group:'Drive'},
 {id:'camera',label:'Cycle camera',keys:['KeyC',null],group:'Camera & race'},
 {id:'chase',label:'Chase camera',keys:['Digit1',null],group:'Camera & race'},
 {id:'hood',label:'Hood camera',keys:['Digit3',null],group:'Camera & race'},
 {id:'reset',label:'Reset car',keys:['KeyR',null],group:'Camera & race'},
 {id:'pause',label:'Pause / resume',keys:['KeyP',null],group:'Camera & race'},
 {id:'sound',label:'Engine sound',keys:['KeyM',null],group:'Camera & race'},
 {id:'fullscreen',label:'Fullscreen',keys:['KeyF',null],group:'Camera & race'}
]);
const defaults=()=>Object.fromEntries(ACTIONS.map(a=>[a.id,[...a.keys]]));
const valid=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter)|F([1-4]|[6-9]|10)|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/.test(code);
function normalize(value){
 const out=defaults(),seen=new Set();
 if(!value||typeof value!=='object')return out;
 // Legacy drift entries are ignored; all surviving assignments are preserved.
 for(const a of ACTIONS){if(!Array.isArray(value[a.id])||value[a.id].length!==2)throw Error('Invalid key binding for '+a.label);out[a.id]=value[a.id].map(code=>{if(code===null)return null;if(!valid(code)||seen.has(code))throw Error('Invalid or repeated keyboard binding.');seen.add(code);return code;});}
 for(const a of ACTIONS)if(!out[a.id].some(Boolean))throw Error(a.label+' needs at least one key.');
 return out;
}
function assign(bindings,action,slot,code){
 if(!ACTIONS.some(a=>a.id===action)||![0,1].includes(slot)||!valid(code))throw Error('That key is reserved by the browser or the pause menu. Choose another key.');
 const out=JSON.parse(JSON.stringify(bindings)),previous=out[action][slot];let swapped=null;
 for(const a of ACTIONS)for(let i=0;i<2;i++)if(out[a.id][i]===code&&(a.id!==action||i!==slot)){
  if(previous===null&&!out[a.id][1-i]&&a.id!==action)throw Error(a.label+' needs a key. Assign into a filled slot to swap keys.');
  out[a.id][i]=previous;swapped=a.label;
 }
 out[action][slot]=code;return {bindings:normalize(out),swapped};
}
function clear(bindings,action,slot){const out=JSON.parse(JSON.stringify(bindings));if(!out[action][1-slot])throw Error('Keep at least one key assigned to this action.');out[action][slot]=null;return normalize(out);}
function label(code){if(!code)return 'Unassigned';const names={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Space',ShiftLeft:'L Shift',ShiftRight:'R Shift',ControlLeft:'L Ctrl',ControlRight:'R Ctrl',AltLeft:'L Alt',AltRight:'R Alt',Escape:'Esc',Backquote:'`',Minus:'−',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};return names[code]||code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ');}
const matches=(bindings,action,code)=>bindings[action]?.includes(code)||false;
const active=(bindings,action,keys,touch)=>!!touch?.has(action)||bindings[action].some(k=>k&&keys.has(k));
root.AFControls={ACTIONS,defaults,valid,normalize,assign,clear,label,matches,active};
if(typeof module!=='undefined'&&module.exports)module.exports=root.AFControls;
})(globalThis);
