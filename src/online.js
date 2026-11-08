/* Apex Foundry Online — browser client for player-hosted rooms.
 * Uses the WebSocket relay shipped in server.js; physics runs in the host browser.
 */
(function(root){
'use strict';
class Client {
 constructor(callback) {this.callback=callback;this.socket=null;this.room=null;this.id=null;this.hostId=null;this.role=null;this.phase=null;this.players=[];this.intentional=false;this.connected=false;this.lastSnapshot=0;}
 async connect(mode,name,code='',color='#2866c9') {
  if(this.socket)throw Error('Leave the existing room before creating another.');
  if(!/^https?:$/.test(location.protocol))throw Error('Online mode needs the included Node.js server. Open the server URL instead of a file.');
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
  this.intentional=false;
  return new Promise((resolve,reject)=>{
   let resolved=false;
   const socket=new WebSocket(url);this.socket=socket;
   const fail=e=>{if(resolved){this.callback('lost',e);return;}resolved=true;reject(e);};
   socket.onopen=()=>this.send({type:mode,name,code,color});
   socket.onmessage=e=>{
    let msg;try{msg=JSON.parse(e.data);}catch{return;}
    if(msg.type==='room'){
     this.room=msg.code;this.id=msg.youId;
     this.hostId=msg.hostId;this.role=this.id===msg.hostId?'host':'guest';this.phase=msg.phase;this.players=msg.players;this.connected=true;
     if(!resolved){resolved=true;resolve(this);}
    }
    if(msg.type==='error'&&!resolved){this.intentional=true;fail(Error(msg.message));socket.close();return;}
    this.callback('message',msg);
   };
   socket.onerror=()=>{if(!resolved){this.intentional=true;fail(Error('Cannot reach online server. Check the URL and whether the server is running.'));}};
   socket.onclose=()=>{
    const normal=this.intentional;this.socket=null;this.connected=false;this.room=null;this.phase=null;
    if(!resolved)fail(Error('The online server closed the connection.'));
    else if(!normal)this.callback('lost',Error('Connection to the room was lost.'));
   };
  });
 }
 send(msg){if(this.socket?.readyState!==WebSocket.OPEN)return false;this.socket.send(JSON.stringify(msg));return true;}
 leave(){this.intentional=true;if(this.socket){this.send({type:'leave'});this.socket.close();this.socket=null;}this.connected=false;this.room=null;this.role=null;this.phase=null;this.players=[];this.id=null;this.hostId=null;}
}
root.AFOnline={Client};
})(globalThis);
