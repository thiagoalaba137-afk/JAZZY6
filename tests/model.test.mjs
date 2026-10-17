import {test} from 'node:test';
import assert from 'node:assert/strict';
import {derive,validatePayload} from '../app/src/main/assets/model.mjs';
import {randomToken} from '../app/src/main/assets/crypto.mjs';
const event=(author,data,age=0,seq=1)=>({author,data,id:randomToken(16),created:new Date(Date.now()-age).toISOString(),seq});
test('stories expire after 24 hours; only the author can hide a moment',()=>{
  const recent=event('hyu',{kind:'story'},3600000),expired=event('jasmin',{kind:'story'},25*3600000);
  const post=event('hyu',{kind:'post'});
  const hostile=event('jasmin',{kind:'delete',target:post.id},0,2);
  const own=event('hyu',{kind:'delete',target:post.id},0,3);
  assert.equal(derive([recent,expired,post,hostile]).stories.length,1);
  assert.equal(derive([post,hostile]).posts.length,1);
  assert.equal(derive([post,hostile,own]).posts.length,0);
});
test('likes are idempotent per identity and can be removed',()=>{
  const post=event('hyu',{kind:'post'}),like=event('jasmin',{kind:'like',target:post.id,active:true},0,2),again=event('jasmin',{kind:'like',target:post.id,active:true},0,3),unlike=event('jasmin',{kind:'like',target:post.id,active:false},0,4);
  assert.equal(derive([post,like,again]).likes.get(post.id).size,1);
  assert.equal(derive([post,like,again,unlike]).likes.get(post.id).size,0);
});
test('received media must be a supported data URL, never executable HTML or remote tracking',()=>{
  for(const media of ['https://evil.test/track','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)'])assert.equal(validatePayload({kind:'post',media}),false);
  assert.equal(validatePayload({kind:'message',media:'data:image/jpeg;base64,aGVsbG8='}),true);
  assert.equal(validatePayload({kind:'profile',bio:'hey',city:'Azul',timezone:'UTC'}),true);
  assert.equal(validatePayload({kind:'reel',url:'https://evil.test/reel/ABC/'}),false);
  assert.equal(validatePayload({kind:'message',text:'x'.repeat(5001)}),false);
  assert.equal(validatePayload({kind:'message',file:{name:'notes.pdf',body:'data:application/octet-stream;base64,aGVsbG8='}}),true);
  assert.equal(validatePayload({kind:'message',file:{name:'bad.html',body:'https://evil.test/track'}}),false);
});
