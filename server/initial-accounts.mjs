import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {passwordHash} from './accounts.mjs';
export function initialAccountsFor(db,env=process.env){
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get();
 if(table&&db.prepare('SELECT count(*) AS n FROM accounts').get().n===2)return [];
 const file=new URL('./accounts.seed.json',import.meta.url);
 if(existsSync(file))return JSON.parse(readFileSync(file,'utf8'));
 return [['hyu','hyusukk','Hyu Suk','JAZZY_HYU_PASSWORD'],['jasmin','JAZZY','Jazzy','JAZZY_JAZZY_PASSWORD']].map(([role,username,name,variable])=>{
  const password=env[variable];
  if(typeof password!=='string'||password.length<6||password.length>128)throw new Error('For a new database, set '+variable+' in Render Environment (6–128 characters). Existing accounts are never overwritten.');
  const salt=randomBytes(32).toString('base64url');return {role,username,name,salt,hash:passwordHash(password,salt)};
 });
}
