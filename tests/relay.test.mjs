import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash} from '../server/accounts.mjs';
import {createRelay} from '../server/relay.mjs';
import {randomToken,eventKey,seal,open} from '../app/src/main/assets/crypto.mjs';

function fixture(options={}){
  const setup=randomToken(),room=randomToken(16),owner=randomToken(),guest=randomToken(),join=randomToken();
  const initialAccounts=['hyu','jasmin'].map(role=>{const salt=randomToken();return {role,username:role,name:role,salt,hash:passwordHash('test-'+role+'-password',salt)};});
  const relay=createRelay({setupToken:setup,initialAccounts,...options});
  const sessions={};
  async function session(role){if(!sessions[role]){const response=await relay.handle(new Request('https://relay.test/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:role,password:'test-'+role+'-password'})}));sessions[role]=(await response.json()).session;}return sessions[role];}
  async function req(path,method='GET',credential=owner,body,origin='https://appassets.androidplatform.net'){
    const request=new Request('https://relay.test'+path,{method,headers:{Origin:origin,'X-Jazzy-Session':await session(path.endsWith('/join')||credential===guest?'jasmin':'hyu'),Authorization:'Bearer '+credential,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const response=await relay.handle(request);return {status:response.status,data:await response.json(),headers:response.headers};
  }
  const base='/v1/rooms/'+room;
  const create=()=>req('/v1/rooms','POST',setup,{room,token:owner,join,role:'hyu'});
  const pair=()=>req(base+'/join','POST',undefined,{invite:join,token:guest});
  return {relay,setup,room,owner,guest,join,req,base,create,pair};
}
test('pairing requires server setup key, supports retries, and allows only two devices',async()=>{
  const f=fixture();try{
    assert.equal((await f.req('/v1/rooms','POST',randomToken(),{room:f.room,token:f.owner,join:f.join,role:'hyu'})).status,401);
    assert.equal((await f.create()).status,201);assert.equal((await f.create()).status,200);
    assert.equal((await f.req(f.base+'/status')).data.paired,false);
    assert.equal((await f.pair()).data.role,'jasmin');assert.equal((await f.pair()).status,200);
    assert.equal((await f.req(f.base+'/join','POST',undefined,{invite:f.join,token:randomToken()})).status,409);
    assert.equal((await f.req(f.base+'/status','GET',f.guest)).data.paired,true);
    assert.equal((await f.req(f.base+'/status','GET',randomToken())).status,401);
    assert.equal((await f.req('/v1/rooms','POST',f.setup,{room:randomToken(16),token:randomToken(),join:randomToken(),role:'hyu'})).status,409);
  }finally{f.relay.close();}
});
test('two clients exchange ciphertext, pagination is monotonic, retries do not duplicate',async()=>{
  const f=fixture();try{
    await f.create();await f.pair();const secret=randomToken(),key=await eventKey(secret,f.room);
    const a=await seal(key,f.room,'hyu',{kind:'message',text:'Only Jasmin should read this.'});
    const first=await f.req(f.base+'/events','POST',f.owner,a);assert.equal(first.status,201);
    assert.equal((await f.req(f.base+'/events','POST',f.owner,a)).data.seq,first.data.seq);
    const b=await seal(key,f.room,'jasmin',{kind:'message',text:'I can!'});
    assert.equal((await f.req(f.base+'/events','POST',f.owner,b)).status,400);
    const second=await f.req(f.base+'/events','POST',f.guest,b);assert.equal(second.status,201);
    const read=await f.req(f.base+'/events?after=0','GET',f.guest);assert.equal(read.data.events.length,2);
    assert.ok(!JSON.stringify(read.data).includes('Only Jasmin'));
    assert.equal((await open(await eventKey(secret,f.room),f.room,read.data.events[0])).text,'Only Jasmin should read this.');
    const next=await f.req(f.base+'/events?after='+first.data.seq);assert.equal(next.data.events.length,1);assert.equal(next.data.events[0].id,b.id);
    assert.equal((await f.req(f.base+'/events?after=-1')).status,400);
    assert.equal((await f.req(f.base+'/events','POST',f.owner,{...a,iv:randomToken(12)})).status,409);
    assert.equal((await f.req(f.base+'/events','GET',randomToken())).status,401);
  }finally{f.relay.close();}
});
test('expired invites, hostile origins, and oversized storage are rejected',async()=>{
  let now=Date.now();const f=fixture({now:()=>now,maxRoomBytes:50});try{
    await f.create();now+=73*3600000;
    assert.equal((await f.pair()).status,401);
    const fresh=randomToken();assert.equal((await f.req(f.base+'/invite','POST',f.owner,{join:fresh})).status,200);
    assert.equal((await f.req(f.base+'/join','POST',undefined,{invite:fresh,token:f.guest})).status,201);
    assert.equal((await f.req(f.base+'/events','GET',f.owner,undefined,'https://evil.test')).status,403);
    const e=await seal(await eventKey(randomToken(),f.room),f.room,'hyu',{kind:'message',text:'x'.repeat(100)});
    assert.equal((await f.req(f.base+'/events','POST',f.owner,e)).status,413);
    assert.equal((await f.req(f.base+'/events')).data.events.length,0);
  }finally{f.relay.close();}
});
test('pair erasure requires creator authorization and explicit matching confirmation',async()=>{
  const f=fixture();try{
    await f.create();await f.pair();
    assert.equal((await f.req(f.base,'DELETE',f.guest,{confirm:f.room})).status,403);
    assert.equal((await f.req(f.base,'DELETE',f.owner,{confirm:'no'})).status,400);
    assert.equal((await f.req(f.base,'DELETE',f.owner,{confirm:f.room})).status,200);
    assert.equal((await f.req(f.base+'/status')).status,404);
  }finally{f.relay.close();}
});
