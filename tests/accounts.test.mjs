import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAccounts,passwordHash} from '../server/accounts.mjs';
import {randomToken} from '../app/src/main/assets/crypto.mjs';
test('password login, name/username/password changes, session rotation and logout',()=>{
  const db=new DatabaseSync(':memory:');let now=Date.now();
  const seeds=['hyu','jasmin'].map(role=>{const salt=randomToken();return {role,username:role==='hyu'?'hyusukk':'JAZZY',name:role,salt,hash:passwordHash('test-'+role+'-password',salt)};});
  const accounts=createAccounts(db,seeds,()=>now);
  try{
    assert.equal(accounts.login('hyusukk','wrong'),null);
    const first=accounts.login('HYUSUKK','test-hyu-password');assert.equal(first.role,'hyu');assert.equal(accounts.session(first.session).role,'hyu');
    assert.equal(accounts.change('hyu',{currentPassword:'wrong',username:'newhyu',name:'Hyu',newPassword:'new-safe-password'}).status,401);
    assert.equal(accounts.change('hyu',{currentPassword:'test-hyu-password',username:'JAZZY',name:'Hyu'}).status,409);
    const next=accounts.change('hyu',{currentPassword:'test-hyu-password',username:'newhyu',name:'Hyu Updated',newPassword:'new-safe-password'});
    assert.equal(next.username,'newhyu');assert.equal(next.name,'Hyu Updated');assert.equal(accounts.session(first.session),null);assert.equal(accounts.session(next.session).role,'hyu');
    assert.equal(accounts.login('hyusukk','test-hyu-password'),null);assert.equal(accounts.login('newhyu','test-hyu-password'),null);
    const login=accounts.login('newhyu','new-safe-password');assert.equal(login.name,'Hyu Updated');assert.equal(accounts.session(next.session),null);
    accounts.logout(login.session);assert.equal(accounts.session(login.session),null);
    const last=accounts.login('newhyu','new-safe-password');now+=31*86400000;assert.equal(accounts.session(last.session),null);
    const stored=db.prepare('SELECT * FROM accounts WHERE role=?').get('hyu');assert.ok(!JSON.stringify(stored).includes('new-safe-password'));
  }finally{db.close();}
});
