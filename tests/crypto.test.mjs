import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomToken,eventKey,seal,open,safetyCode,makeInvite,parseInvite,validateServer,normalizeReel,decode64,encode64} from '../app/src/main/assets/crypto.mjs';
const room=randomToken(16),secret=randomToken();
test('independent phones derive the same key and exchange text and media',async()=>{
  const sender=await eventKey(secret,room),receiver=await eventKey(secret,room);
  const payload={kind:'message',text:'안녕 Jasmin 💙',media:'data:image/jpeg;base64,aGVsbG8='};
  const envelope=await seal(sender,room,'hyu',payload);
  assert.deepEqual(await open(receiver,room,envelope),payload);
  assert.ok(!JSON.stringify(envelope).includes('Jasmin'));
  assert.ok(!JSON.stringify(envelope).includes(secret));
  assert.equal(await safetyCode(secret,room),await safetyCode(secret,room));
});
test('tampered ciphertext, nonce, authenticated metadata and wrong keys fail closed',async()=>{
  const key=await eventKey(secret,room),e=await seal(key,room,'hyu',{kind:'message',text:'Private'});
  for(const change of [{author:'jasmin'},{id:randomToken(16)},{created:new Date(Date.now()-1000).toISOString()},{iv:randomToken(12)},{ciphertext:encode64(Uint8Array.from(decode64(e.ciphertext),(b,i)=>i===1?b^1:b))}]){
    await assert.rejects(open(key,room,{...e,...change}));
  }
  await assert.rejects(open(await eventKey(randomToken(),room),room,e));
  await assert.rejects(open(key,randomToken(16),e));
});
test('messages use unique nonces and independently encrypt identical plaintext',async()=>{
  const key=await eventKey(secret,room),a=await seal(key,room,'hyu',{kind:'message',text:'hi'}),b=await seal(key,room,'hyu',{kind:'message',text:'hi'});
  assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);assert.notEqual(a.id,b.id);
});
test('invite round trip never includes the creator device credential',()=>{
  const config={server:'https://jazzy.example.com',room,key:secret,token:randomToken(),role:'hyu'};const join=randomToken();
  const invite=makeInvite(config,join),decoded=parseInvite('A private invite\n'+invite);
  assert.equal(decoded.key,secret);assert.equal(decoded.join,join);assert.equal(decoded.role,'jasmin');assert.equal(decoded.token,undefined);assert.ok(!invite.includes(config.token));
  assert.throws(()=>parseInvite('not an invite'));
});
test('server addresses and Reel links reject credential leakage and unsafe origins',()=>{
  for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?key=bad','file:///etc/passwd','javascript:alert(1)'])assert.throws(()=>validateServer(url));
  assert.equal(validateServer('https://example.com/'),'https://example.com');
  assert.equal(validateServer('http://127.0.0.1:8787',true),'http://127.0.0.1:8787');
  assert.throws(()=>validateServer('http://127.0.0.1:8787'));
  assert.equal(normalizeReel('Look! https://www.instagram.com/reel/ABC_123/?igsh=secret'),'https://www.instagram.com/reel/ABC_123/');
  for(const link of ['https://instagram.com.evil.test/reel/ABC/','https://instagram.com@evil.test/reel/ABC/','https://www.instagram.com/p/ABC/','javascript:alert(1)'])assert.throws(()=>normalizeReel(link));
});
