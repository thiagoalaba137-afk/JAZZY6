import {createHash,timingSafeEqual,webcrypto} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const token=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
export function createFriends({db,accounts,setupToken,now,requireThat}){
  db.exec(`CREATE TABLE IF NOT EXISTS devices(role TEXT PRIMARY KEY REFERENCES accounts(role),public_key TEXT NOT NULL,token_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS friend_requests(sender TEXT PRIMARY KEY REFERENCES accounts(role),recipient TEXT NOT NULL REFERENCES accounts(role),room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,iv TEXT NOT NULL,ciphertext TEXT NOT NULL);`);
  function account(request){const a=accounts.session(request.headers.get('x-jazzy-session'));requireThat(a,401,'Please log in again.');return a;}
  function device(request){const a=account(request),d=db.prepare('SELECT * FROM devices WHERE role=?').get(a.role);requireThat(d&&same(d.token_hash,hash((request.headers.get('authorization')||'').replace(/^Bearer /,''))),401,'This phone is not registered. Log in with your server key.');return a;}
  async function handle(request,url,body,response){
    if(!url.pathname.startsWith('/v2/')||url.pathname==='/v2/rooms')return null;
    if(url.pathname==='/v2/bootstrap'&&request.method==='POST'){
      const a=account(request),b=await body(request,4096),d=db.prepare('SELECT * FROM devices WHERE role=?').get(a.role);
      const credential=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
      requireThat(same(credential,setupToken)||(d&&same(d.token_hash,hash(credential))),401,'The server setup key is incorrect.');
      requireThat(token(b.token)&&typeof b.publicKey==='string'&&/^[A-Za-z0-9_-]{87}$/.test(b.publicKey),400,'Invalid device registration.');
      try{await webcrypto.subtle.importKey('raw',Buffer.from(b.publicKey,'base64url'),{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{requireThat(false,400,'Invalid encryption public key.');}
      requireThat(!d||(d.public_key===b.publicKey&&same(d.token_hash,hash(b.token))),409,'This account is registered on another installation. Keep its app data; a password cannot restore its encryption keys.');
      db.prepare('INSERT OR IGNORE INTO devices(role,public_key,token_hash) VALUES(?,?,?)').run(a.role,b.publicKey,hash(b.token));
      return response({ok:true,protocol:2});
    }
    const a=device(request);
    if(url.pathname==='/v2/users'&&request.method==='GET'){
      const name=url.searchParams.get('username')||'';requireThat(/^[A-Za-z0-9_.]{3,30}$/.test(name),400,'Enter a full username.');
      const u=db.prepare('SELECT a.role,a.username,a.name,d.public_key AS publicKey FROM accounts a LEFT JOIN devices d ON d.role=a.role WHERE a.username=? COLLATE NOCASE').get(name);
      requireThat(u&&u.role!==a.role,404,'No other account has that username.');
      return response({user:u});
    }
    if(url.pathname==='/v2/friends'&&request.method==='GET'){
      const incoming=db.prepare('SELECT f.*,a.username,a.name,d.public_key AS publicKey FROM friend_requests f JOIN accounts a ON a.role=f.sender JOIN devices d ON d.role=f.sender JOIN rooms r ON r.id=f.room WHERE f.recipient=? AND r.guest_hash IS NULL').all(a.role);
      const outgoing=db.prepare('SELECT a.username,a.name,r.guest_hash IS NOT NULL AS accepted FROM friend_requests f JOIN accounts a ON a.role=f.recipient JOIN rooms r ON r.id=f.room WHERE f.sender=?').get(a.role)||null;
      return response({incoming,outgoing});
    }
    if(url.pathname==='/v2/friends'&&request.method==='POST'){
      const b=await body(request,10000),room=db.prepare('SELECT * FROM rooms WHERE id=?').get(String(b.room||''));
      requireThat(room&&room.owner===a.role&&!room.guest_hash,409,'Your space is already connected, or the other person has sent the first request.');
      requireThat(same(room.owner_hash,hash((request.headers.get('authorization')||'').replace(/^Bearer /,''))),401,'Wrong room credential.');
      const target=db.prepare('SELECT role FROM devices WHERE role=?').get(String(b.to||''));requireThat(target&&target.role!==a.role,400,'Your partner must log in on their phone first.');
      requireThat(typeof b.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(b.iv)&&typeof b.ciphertext==='string'&&/^[A-Za-z0-9_-]{23,8000}$/.test(b.ciphertext),400,'Invalid encrypted request.');
      db.prepare('INSERT INTO friend_requests(sender,recipient,room,iv,ciphertext) VALUES(?,?,?,?,?) ON CONFLICT(sender) DO UPDATE SET recipient=excluded.recipient,room=excluded.room,iv=excluded.iv,ciphertext=excluded.ciphertext').run(a.role,b.to,b.room,b.iv,b.ciphertext);
      return response({ok:true});
    }
    if(url.pathname==='/v2/friends/decline'&&request.method==='POST'){
      const b=await body(request,1024);db.prepare('DELETE FROM friend_requests WHERE sender=? AND recipient=?').run(String(b.sender||''),a.role);return response({ok:true});
    }
    requireThat(false,404,'Not found.');
  }
  return {handle,device};
}
