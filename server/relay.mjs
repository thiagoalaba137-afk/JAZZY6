import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import {initialAccountsFor} from './initial-accounts.mjs';
import {createAccounts} from './accounts.mjs';
import {createFriends} from './friends.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const same = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const token = s => typeof s==='string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const roomId = s => typeof s==='string' && /^[A-Za-z0-9_-]{22}$/.test(s);
const MAX_BODY = 18000000;
class Failure extends Error { constructor(status,message){super(message);this.status=status;} }
function requireThat(ok,status,message){if(!ok)throw new Failure(status,message);}

export function createRelay({database=':memory:',setupToken,allowDevelopment=false,maxRoomBytes=512*1024*1024,now=()=>Date.now(),initialAccounts}={}) {
  if(!token(setupToken)) throw new Error('JAZZY_SETUP_TOKEN must be a 32-byte base64url secret (43 characters).');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,owner TEXT NOT NULL,owner_hash TEXT NOT NULL,guest_hash TEXT,join_hash TEXT NOT NULL,join_expires INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,id TEXT NOT NULL,author TEXT NOT NULL,created TEXT NOT NULL,iv TEXT NOT NULL,ciphertext TEXT NOT NULL,bytes INTEGER NOT NULL,UNIQUE(room,id));
    CREATE INDEX IF NOT EXISTS event_room ON events(room,seq);`);
  const accounts=createAccounts(db,initialAccounts??initialAccountsFor(db),now);
  const friends=createFriends({db,accounts,setupToken,now,requireThat});
  const buckets = new Map();
  function rate(key,max=180) {
    const minute=Math.floor(now()/60000);
    let entry=buckets.get(key);
    if(!entry||entry.minute!==minute){entry={minute,count:0};buckets.set(key,entry);}
    requireThat(++entry.count<=max,429,'Please wait a minute before trying again.');
    if(buckets.size>5000) for(const [key,value] of buckets) if(value.minute<minute) buckets.delete(key);
    if(buckets.size>10000) buckets.clear();
  }
  async function body(request,max=MAX_BODY) {
    requireThat((request.headers.get('content-type')||'').split(';')[0]==='application/json',415,'Use application/json.');
    const declared=Number(request.headers.get('content-length')||0);
    requireThat(declared<=max,413,'This upload is too large.');
    const reader=request.body?.getReader();
    requireThat(reader,400,'Missing request body.');
    let size=0;const parts=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Failure(413,'This upload is too large.');}parts.push(value);}
    try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Failure(400,'Invalid JSON.');}
  }
  function authorized(request,room) {
    const account=accounts.session(request.headers.get('x-jazzy-session'));
    requireThat(account,401,'Please log in again.');
    const credential=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
    requireThat(token(credential),401,'Your device is not authorized.');
    const candidate=hash(credential);
    if(same(candidate,room.owner_hash)&&account.role===room.owner)return room.owner;
    const guest=room.owner==='hyu'?'jasmin':'hyu';
    if(room.guest_hash && same(candidate,room.guest_hash)&&account.role===guest)return guest;
    throw new Failure(401,'Your device is not authorized.');
  }
  async function handle(request,remoteAddress='local') {
    const origin=request.headers.get('origin');
    const allowed=origin==='https://appassets.androidplatform.net' || (allowDevelopment && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin||''));
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
    if(allowed){headers['access-control-allow-origin']=origin;headers['access-control-allow-headers']='Authorization, Content-Type, X-Jazzy-Session';headers['access-control-allow-methods']='GET, POST, DELETE, OPTIONS';headers['access-control-max-age']='600';}
    const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    try {
      requireThat(!origin||allowed,403,'Origin not allowed.');
      if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
      const url=new URL(request.url);
      if(request.method==='GET' && url.pathname==='/health') return response({ok:true,app:'JAZZY',protocol:2,features:['username-friends']});
      rate(remoteAddress);
      if(request.method==='POST'&&url.pathname==='/v1/auth/login'){
        rate(remoteAddress+':login',10);
        const b=await body(request,4096),result=accounts.login(b.username,b.password);
        requireThat(result,401,'The username or password is incorrect.');
        return response(result);
      }
      if(request.method==='POST'&&url.pathname==='/v1/auth/change'){
        rate(remoteAddress+':change',8);
        const account=accounts.session(request.headers.get('x-jazzy-session'));
        requireThat(account,401,'Please log in again.');
        const result=accounts.change(account.role,await body(request,4096));
        if(result.error)throw new Failure(result.status,result.error);
        return response(result);
      }
      if(request.method==='POST'&&url.pathname==='/v1/auth/logout'){
        accounts.logout(request.headers.get('x-jazzy-session'));
        return response({ok:true});
      }
      const friendResponse=await friends.handle(request,url,body,response);if(friendResponse)return friendResponse;
      if(request.method==='POST' && ['/v1/rooms','/v2/rooms'].includes(url.pathname)) {
        rate(remoteAddress+':setup',8);
        if(url.pathname==='/v2/rooms')friends.device(request);
        else requireThat(same(request.headers.get('authorization')||'','Bearer '+setupToken),401,'The server setup key is incorrect.');
        const b=await body(request,4096);
        const account=accounts.session(request.headers.get('x-jazzy-session'));
        requireThat(account&&account.role===b.role,401,'Log in to your own account before creating your space.');
        requireThat(roomId(b.room)&&token(b.token)&&token(b.join)&&['hyu','jasmin'].includes(b.role),400,'Invalid pairing request.');
        const existing=db.prepare('SELECT * FROM rooms WHERE id=?').get(b.room);
        if(existing){requireThat(same(existing.owner_hash,hash(b.token)),409,'Pair already exists.');return response({room:b.room,role:existing.owner});}
        requireThat(db.prepare('SELECT count(*) AS n FROM rooms').get().n===0,409,'Your partner already created the space. Open Friends and accept their request.');
        db.prepare('INSERT INTO rooms(id,owner,owner_hash,join_hash,join_expires,created) VALUES (?,?,?,?,?,?)').run(b.room,b.role,hash(b.token),hash(b.join),now()+72*3600000,now());
        return response({room:b.room,role:b.role},201);
      }
      const match=url.pathname.match(/^\/v1\/rooms\/([A-Za-z0-9_-]{22})(?:\/(join|status|events|invite))?$/);
      requireThat(match,404,'Not found.');
      const [,id,action]=match;
      const room=db.prepare('SELECT * FROM rooms WHERE id=?').get(id);
      requireThat(room,404,'This pair was not found.');
      if(action==='join'&&request.method==='POST') {
        rate(remoteAddress+':join',12);
        const b=await body(request,4096);
        requireThat(token(b.invite)&&token(b.token),400,'Invalid invite.');
        const role=room.owner==='hyu'?'jasmin':'hyu';
        const account=accounts.session(request.headers.get('x-jazzy-session'));
        requireThat(account&&account.role===role,401,'Log in to the account this invite is for.');
        if(room.guest_hash && same(room.guest_hash,hash(b.token)))return response({role,paired:true});
        requireThat(!room.guest_hash,409,'Both places in this pair are taken.');
        requireThat(now()<=room.join_expires&&same(hash(b.invite),room.join_hash),401,'This invite is expired or incorrect.');
        db.prepare('UPDATE rooms SET guest_hash=? WHERE id=? AND guest_hash IS NULL').run(hash(b.token),id);
        return response({role,paired:true},201);
      }
      const actor=authorized(request,room);
      if(action==='status'&&request.method==='GET')return response({paired:!!room.guest_hash,role:actor,protocol:1,maxBody:MAX_BODY});
      if(action==='invite'&&request.method==='POST') {
        requireThat(actor===room.owner,403,'Only the person who created the pair can refresh an invite.');
        requireThat(!room.guest_hash,409,'Your partner has already joined.');
        const b=await body(request,1024);requireThat(token(b.join),400,'Invalid invite.');
        db.prepare('UPDATE rooms SET join_hash=?,join_expires=? WHERE id=?').run(hash(b.join),now()+72*3600000,id);
        return response({ok:true});
      }
      if(action==='events'&&request.method==='GET') {
        const after=Number(url.searchParams.get('after')||0);
        requireThat(Number.isSafeInteger(after)&&after>=0,400,'Invalid cursor.');
        const rows=db.prepare('SELECT seq,id,author,created,iv,ciphertext FROM events WHERE room=? AND seq>? ORDER BY seq LIMIT 50').all(id,after);
        let size=0;const events=[];
        for(const row of rows){if(events.length && size+row.ciphertext.length>22000000)break;size+=row.ciphertext.length;events.push({v:1,room:id,...row});}
        return response({events,cursor:events.at(-1)?.seq||after,more:events.length<rows.length||rows.length===50});
      }
      if(action==='events'&&request.method==='POST') {
        const b=await body(request);
        requireThat(b.v===1&&b.room===id&&roomId(b.id)&&b.author===actor,400,'Invalid event identity.');
        requireThat(typeof b.created==='string'&&Number.isFinite(Date.parse(b.created))&&new Date(b.created).toISOString()===b.created&&Date.parse(b.created)<now()+300000,400,'Invalid event date. Check your phone’s clock.');
        requireThat(typeof b.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(b.iv)&&typeof b.ciphertext==='string'&&b.ciphertext.length>=23&&b.ciphertext.length<MAX_BODY-1024&&/^[A-Za-z0-9_-]+$/.test(b.ciphertext),400,'Invalid encrypted event.');
        const prior=db.prepare('SELECT seq,author,created,iv,ciphertext FROM events WHERE room=? AND id=?').get(id,b.id);
        if(prior){requireThat(['author','created','iv','ciphertext'].every(k=>prior[k]===b[k]),409,'An event with this ID already exists.');return response({seq:prior.seq});}
        const used=db.prepare('SELECT coalesce(sum(bytes),0) AS size,count(*) AS n FROM events WHERE room=?').get(id);
        requireThat(used.size+b.ciphertext.length<=maxRoomBytes&&used.n<50000,413,'Your pair’s storage is full. Ask the server owner to increase the quota.');
        const result=db.prepare('INSERT INTO events(room,id,author,created,iv,ciphertext,bytes) VALUES(?,?,?,?,?,?,?)').run(id,b.id,actor,b.created,b.iv,b.ciphertext,b.ciphertext.length);
        return response({seq:Number(result.lastInsertRowid)},201);
      }
      if(!action&&request.method==='DELETE') {
        requireThat(actor===room.owner,403,'Only the pair creator can erase the server.');
        requireThat((await body(request,1024)).confirm===id,400,'Explicit confirmation required.');
        db.prepare('DELETE FROM rooms WHERE id=?').run(id);
        db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
        return response({deleted:true});
      }
      throw new Failure(404,'Not found.');
    } catch(error) {
      if(!(error instanceof Failure)) console.error('Relay request failed:',error.name);
      return response({error:error instanceof Failure?error.message:'The server could not complete this request.'},error.status||500);
    }
  }
  return {handle,close:()=>db.close()};
}
