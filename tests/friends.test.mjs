import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRelay} from '../server/relay.mjs';
import {passwordHash} from '../server/accounts.mjs';
import {randomToken,createIdentity,sealRequest,openRequest,makeInvite,parseInvite,eventKey,seal,open} from '../app/src/main/assets/crypto.mjs';
test('direct login, device-bound username requests, acceptance and encrypted messages',async()=>{
 const setupToken=randomToken(),initialAccounts=['hyu','jasmin'].map(role=>{const salt=randomToken();return {role,username:role,name:role,salt,hash:passwordHash('test-password',salt)};});
 const relay=createRelay({setupToken,initialAccounts});
 const a={role:'hyu',token:randomToken(),identity:await createIdentity()},b={role:'jasmin',token:randomToken(),identity:await createIdentity()};
 async function req(user,path,method='GET',body,token=user.token){const r=await relay.handle(new Request('https://relay.test'+path,{method,headers:{'content-type':'application/json','X-Jazzy-Session':user.session||'',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined}));return {status:r.status,...await r.json()};}
 try{
  for(const u of [a,b]){Object.assign(u,await req(u,'/v1/auth/login','POST',{username:u.role,password:'test-password'}));
   assert.equal((await req(u,'/v2/bootstrap','POST',{token:u.token,publicKey:u.identity.publicKey},randomToken())).status,401);
   assert.equal((await req(u,'/v2/bootstrap','POST',{token:u.token,publicKey:u.identity.publicKey},setupToken)).status,200);
   assert.equal((await req(u,'/v2/bootstrap','POST',{token:u.token,publicKey:u.identity.publicKey})).status,200);
  }
  const intruder=await createIdentity();assert.equal((await req(a,'/v2/bootstrap','POST',{token:randomToken(),publicKey:intruder.publicKey},setupToken)).status,409);
  const found=await req(a,'/v2/users?username=JASMIN');assert.equal(found.user.publicKey,b.identity.publicKey);
  assert.equal((await req(a,'/v2/users?username=unknown')).status,404);
  assert.equal((await req({...a,session:b.session},'/v2/friends')).status,401);
  Object.assign(a,{room:randomToken(16),key:randomToken(),join:randomToken(),server:'https://relay.test'});
  assert.equal((await req(a,'/v2/rooms','POST',{room:a.room,role:a.role,token:a.token,join:a.join})).status,201);
  const context=JSON.stringify({v:2,server:a.server,sender:a.role,recipient:b.role,room:a.room});
  const encrypted=await sealRequest(a.identity,b.identity.publicKey,context,{invite:makeInvite(a,a.join)});
  assert.ok(!JSON.stringify(encrypted).includes(a.key));
  await assert.rejects(openRequest(b.identity,a.identity.publicKey,context+'changed',encrypted));
  await assert.rejects(openRequest(intruder,a.identity.publicKey,context,encrypted));
  assert.equal((await req(a,'/v2/friends','POST',{to:b.role,room:a.room,...encrypted})).status,200);
  const incoming=(await req(b,'/v2/friends')).incoming;assert.equal(incoming.length,1);
  assert.equal((await req(a,'/v2/friends')).incoming.length,0);
  const data=parseInvite((await openRequest(b.identity,incoming[0].publicKey,context,incoming[0])).invite);
  assert.equal(data.key,a.key);
  assert.equal((await req(b,'/v1/rooms/'+a.room+'/join','POST',{token:b.token,invite:data.join})).status,201);
  assert.equal((await req(b,'/v2/friends')).incoming.length,0);
  assert.equal((await req(a,'/v2/friends')).outgoing.accepted,1);
  const envelope=await seal(await eventKey(a.key,a.room),a.room,a.role,{kind:'message',text:'private hello'});
  assert.equal((await req(a,'/v1/rooms/'+a.room+'/events','POST',envelope)).status,201);
  const received=(await req(b,'/v1/rooms/'+a.room+'/events')).events[0];
  assert.equal((await open(await eventKey(data.key,a.room),a.room,received)).text,'private hello');
 }finally{relay.close();}
});
