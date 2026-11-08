#!/usr/bin/env node
/* Apex Foundry Online: dependency-free static server and WebSocket room relay.
 * The HOST'S BROWSER runs all race physics; this process only forwards messages.
 * Requires Node.js >=18. Use a TLS reverse proxy for deployment on the public web.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const MAX_ROOMS = 200;
const MAX_MESSAGE = 1024 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png'};

function makeCode() { return Array.from({length: 6}, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); }
function makeId() { return crypto.randomBytes(9).toString('base64url'); }
function sanitizeColor(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'#2866c9';}
function sanitizeName(value) { return typeof value === 'string' ? value.trim().replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 22) : ''; }
function frame(payload, opcode=1) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  let head;
  if (buf.length < 126) { head = Buffer.alloc(2); head[1] = buf.length; }
  else if (buf.length < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(buf.length,2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(buf.length),2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head,buf]);
}
class Peer {
  constructor(socket, onJSON, onClose) {
    this.socket=socket; this.onJSON=onJSON; this.onClose=onClose;
    this.data=Buffer.alloc(0); this.open=true; this.fragment=null; this.lastPong=Date.now();
    socket.on('data', b=>this.read(b));
    socket.on('end',()=>this.end()); socket.on('close',()=>this.end());
    socket.on('error',()=>this.end());
  }
  send(value) { if (!this.open || !this.socket.writable || this.socket.writableLength>2*MAX_MESSAGE) {this.end();return false;} this.socket.write(frame(JSON.stringify(value)));return true; }
  close(code=1000) { if (!this.open)return; try { const b=Buffer.alloc(2);b.writeUInt16BE(code);this.socket.write(frame(b,8)); } catch {} this.socket.end();this.end(); }
  end() { if (!this.open)return;this.open=false;this.socket.destroy();this.onClose(this); }
  read(bytes) {
    this.data=Buffer.concat([this.data,bytes]);
    if (this.data.length>MAX_MESSAGE*2+128) return this.close(1009);
    while(this.data.length>=2 && this.open){
      const a=this.data[0],b=this.data[1],op=a&15,fin=!!(a&128),masked=!!(b&128);
      if(a&0x70 || !masked)return this.close(1002);
      let n=b&127,off=2;
      if(n===126){if(this.data.length<4)return;n=this.data.readUInt16BE(2);off=4;}
      if(n===127){if(this.data.length<10)return;const len=this.data.readBigUInt64BE(2);if(len>BigInt(MAX_MESSAGE))return this.close(1009);n=Number(len);off=10;}
      if(n>MAX_MESSAGE)return this.close(1009);
      if(this.data.length<off+4+n)return;
      const key=this.data.subarray(off,off+4),raw=this.data.subarray(off+4,off+4+n);
      const decoded=Buffer.allocUnsafe(n);for(let i=0;i<n;i++)decoded[i]=raw[i]^key[i&3];
      this.data=this.data.subarray(off+4+n);
      if(op>=8){if(!fin||n>125)return this.close(1002);if(op===8)return this.close();if(op===9)this.socket.write(frame(decoded,10));if(op===10)this.lastPong=Date.now();continue;}
      if(op!==0&&op!==1)return this.close(1003);
      if(op===1){if(this.fragment)return this.close(1002);this.fragment=decoded;}else{if(!this.fragment)return this.close(1002);this.fragment=Buffer.concat([this.fragment,decoded]);}
      if(this.fragment.length>MAX_MESSAGE)return this.close(1009);
      if(fin){let message;try{message=JSON.parse(this.fragment.toString('utf8'));}catch{this.close(1007);return;}this.fragment=null;if(!message||typeof message!=='object'||Array.isArray(message))continue;this.onJSON(this,message);}
    }
  }
}
function createServer(options={}) {
  const rooms = new Map(), peers = new Set();
  function players(room) {return [...room.members].map(p=>({id:p.id,name:p.name,color:p.color}));}
  function sendRoom(room) { const response={type:'room',code:room.code,hostId:room.host.id,phase:room.phase,players:players(room),limit:MAX_PLAYERS}; for(const p of room.members)p.send({...response,youId:p.id}); }
  function leave(peer) {
    const room=peer.room;if(!room)return;peer.room=null;room.members.delete(peer);
    if(room.host===peer){rooms.delete(room.code);for(const p of room.members){p.room=null;p.send({type:'hostLeft'});}room.members.clear();}
    else {for(const p of room.members)p.send({type:'playerLeft',playerId:peer.id});sendRoom(room);}
  }
  function signalError(peer,message){peer.send({type:'error',message});}
  function handle(peer,msg){
    switch(msg.type){
      case 'create':{
        if(peer.room)return signalError(peer,'Leave your current room first.');
        if(rooms.size>=MAX_ROOMS)return signalError(peer,'Server reached its room limit. Try again later.');
        peer.name=sanitizeName(msg.name)||'Host';peer.color=sanitizeColor(msg.color);peer.id=makeId();
        let code;do{code=makeCode();}while(rooms.has(code));
        const room={code,host:peer,members:new Set([peer]),phase:'lobby'};peer.room=room;rooms.set(code,room);sendRoom(room);break;
      }
      case 'join':{
        if(peer.room)return signalError(peer,'Leave your current room first.');
        const code=String(msg.code||'').replace(/[^a-z0-9]/gi,'').toUpperCase();const room=rooms.get(code);
        if(!room)return signalError(peer,'Room not found. Check the six-character code.');
        if(room.phase!=='lobby')return signalError(peer,'This race has already started. Wait for a new room.');
        if(room.members.size>=MAX_PLAYERS)return signalError(peer,'Room is full (maximum 8 human players).');
        peer.name=sanitizeName(msg.name)||'Driver';peer.color=sanitizeColor(msg.color);peer.id=makeId();peer.room=room;room.members.add(peer);sendRoom(room);break;
      }
      case 'leave':leave(peer);break;
      case 'paint':{
        const room=peer.room;if(!room||room.phase!=='lobby')return;
        if(typeof msg.color!=='string'||!/^#[0-9a-f]{6}$/i.test(msg.color))return;
        peer.color=sanitizeColor(msg.color);sendRoom(room);break;
      }
      case 'start':{
        const room=peer.room;if(!room||room.host!==peer)return signalError(peer,'Only the host can start.');
        if(room.members.size<2)return signalError(peer,'Invite at least one other player before starting.');
        if(!msg.settings||typeof msg.settings!=='object'||Array.isArray(msg.settings))return signalError(peer,'Missing race settings.');
        room.phase='race';for(const p of room.members)if(p!==peer)p.send({type:'start',settings:msg.settings});sendRoom(room);break;
      }
      case 'input':{
        const room=peer.room;if(!room||room.host===peer||room.phase!=='race')return;
        if(!Array.isArray(msg.axes)||msg.axes.length!==3||msg.axes.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<-1||x>1))return;
        const now=Date.now();if(now-(peer.lastInput||0)<24)return;peer.lastInput=now;
        room.host.send({type:'input',playerId:peer.id,axes:msg.axes});break;
      }
      case 'ready':{
        const room=peer.room;if(room&&room.host!==peer&&room.phase==='race')room.host.send({type:'ready',playerId:peer.id});break;
      }
      case 'reset':{
        const room=peer.room;if(room&&room.host!==peer&&room.phase==='race')room.host.send({type:'reset',playerId:peer.id});break;
      }
      case 'snapshot':{
        const room=peer.room;if(!room||room.host!==peer||room.phase!=='race')return;
        const now=Date.now();if(now-(peer.lastSnapshot||0)<28)return;peer.lastSnapshot=now;
        if(!msg.data||!Array.isArray(msg.data.cars))return;
        for(const p of room.members)if(p!==peer)p.send({type:'snapshot',data:msg.data});break;
      }
      default:signalError(peer,'Unknown message type.');
    }
  }
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
    let p;try{p=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end('Invalid URL');return;}if(p==='/')p='/index.html';
    const full=path.resolve(ROOT,'.'+p);
    if(!full.startsWith(ROOT+path.sep)||!/^\/(?:index\.html|Apex-Foundry(?:-Online)?\.html|src\/[\w-]+\.(?:js|css)|tracks\/[\w/-]+\.json|data\/[\w-]+\.json)$/.test(p)){
      res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;
    }
    fs.stat(full,(err,stat)=>{
      if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(full)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(full).pipe(res);
    });
  });
  server.on('upgrade',(req,socket,head)=>{
    let u;try{u=new URL(req.url,'http://localhost');}catch{socket.destroy();return;}
    const key=req.headers['sec-websocket-key'];
    const origin=req.headers.origin;
    if(u.pathname!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||typeof key!=='string'||Buffer.from(key,'base64').length!==16){socket.destroy();return;}
    if(origin){try{if(new URL(origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
    const peer=new Peer(socket,handle,p=>{leave(p);peers.delete(p);});peers.add(peer);if(head.length)peer.read(head);
  });
  const heartbeat=setInterval(()=>{for(const p of peers){if(Date.now()-p.lastPong>70_000){p.end();continue;}if(p.open)p.socket.write(frame(Buffer.alloc(0),9));}},25_000);heartbeat.unref();
  const stop=()=>{clearInterval(heartbeat);for(const p of [...peers])p.end();server.close();};
  return {server,rooms,peers,stop};
}
if(require.main===module){const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';const app=createServer();app.server.listen(port,host,()=>console.log(`Apex Foundry Online running at http://localhost:${port}/ (bind ${host})`));process.on('SIGINT',()=>{app.stop();process.exit(0);});}
module.exports={createServer,MAX_PLAYERS};
