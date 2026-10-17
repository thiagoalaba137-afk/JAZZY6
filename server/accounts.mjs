import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password,salt){return scryptSync(password,Buffer.from(salt,'base64url'),64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64url');}
export function passwordMatches(password,record){
  if(typeof password!=='string'||password.length>256)return false;
  const actual=Buffer.from(passwordHash(password,record.salt),'base64url'),expected=Buffer.from(record.hash,'base64url');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function createAccounts(db,seeds,now=()=>Date.now()){
  db.exec('CREATE TABLE IF NOT EXISTS accounts(role TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,session_hash TEXT,expires INTEGER)');
  const add=db.prepare('INSERT OR IGNORE INTO accounts(role,username,name,salt,hash) VALUES(?,?,?,?,?)');
  for(const seed of seeds)add.run(seed.role,seed.username,seed.name,seed.salt,seed.hash);
  function issue(account){const session=randomBytes(32).toString('base64url'),expires=now()+30*86400000;db.prepare('UPDATE accounts SET session_hash=?,expires=? WHERE role=?').run(digest(session),expires,account.role);return {session,expires,role:account.role,username:account.username,name:account.name};}
  return {
    login(username,password){const account=db.prepare('SELECT * FROM accounts WHERE username=? COLLATE NOCASE').get(String(username||''));if(!account||!passwordMatches(password,account))return null;return issue(account);},
    session(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))return null;return db.prepare('SELECT role,username,name,expires FROM accounts WHERE session_hash=? AND expires>?').get(digest(value),now())||null;},
    change(role,{currentPassword,username,name,newPassword}){
      const account=db.prepare('SELECT * FROM accounts WHERE role=?').get(role);
      if(!passwordMatches(currentPassword,account))return {error:'Your current password is incorrect.',status:401};
      if(typeof username!=='string'||!/^[A-Za-z0-9_.]{3,30}$/.test(username)||typeof name!=='string'||!name.trim()||name.length>50)return {error:'Use a name up to 50 characters and a username with 3–30 letters, numbers, dots, or underscores.',status:400};
      if(newPassword && (typeof newPassword!=='string'||newPassword.length<8||newPassword.length>128))return {error:'Choose a new password with 8–128 characters.',status:400};
      const duplicate=db.prepare('SELECT role FROM accounts WHERE username=? COLLATE NOCASE').get(username);
      if(duplicate&&duplicate.role!==role)return {error:'That username belongs to the other account.',status:409};
      const salt=newPassword?randomBytes(32).toString('base64url'):account.salt,hash=newPassword?passwordHash(newPassword,salt):account.hash;
      db.prepare('UPDATE accounts SET username=?,name=?,salt=?,hash=? WHERE role=?').run(username,name.trim(),salt,hash,role);
      return issue({...account,username,name:name.trim()});
    },
    logout(session){db.prepare('UPDATE accounts SET session_hash=NULL,expires=NULL WHERE session_hash=?').run(digest(session||''));}
  };
}
