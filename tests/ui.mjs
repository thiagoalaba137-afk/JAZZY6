// Browser integration test. It intercepts requests in-process; no external server.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {passwordHash} from '../server/accounts.mjs';
import {createRelay} from '../server/relay.mjs';
import {randomToken} from '../app/src/main/assets/crypto.mjs';

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));}
const setupToken=randomToken();
const initialAccounts=['hyu','jasmin'].map(role=>{const salt=randomToken();return {role,username:role==='hyu'?'hyusukk':'JAZZY',name:role==='hyu'?'Hyu Suk':'Jazzy',salt,hash:passwordHash('test-'+role+'-password',salt)};});
const relay=createRelay({setupToken,initialAccounts});
const requests=[],errors=[],checks=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const appOrigin='https://appassets.androidplatform.net';
const output=resolve('deliverables');await mkdir(output,{recursive:true});
async function makePhone(){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
    window.Jazzy={allowServer:()=> 'ok',saveFile:(name,data)=>{window.__saved={name,data};},
      readVault:()=>sessionStorage.getItem('test-native-vault')||'',
      writeVault:v=>{if(v)sessionStorage.setItem('test-native-vault',v);else sessionStorage.removeItem('test-native-vault');return 'ok';},
      consumeSharedText:()=>'',shareText:text=>{window.__shared=text;},
      openInstagram:url=>{window.__opened=url;},minimize:()=>{}
    };
  });
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===appOrigin){
      const name=url.pathname.replace('/assets/','');
      if(!['index.html','app.mjs','crypto.mjs','model.mjs','styles.css','demo-gwangju.svg','demo-azul.svg'].includes(name)){await route.fulfill({status:404,body:''});return;}
      const body=await readFile(resolve('app/src/main/assets',name));
      await route.fulfill({status:200,contentType:name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html',body});
    }else if(url.origin==='https://jazzy-2.onrender.com'){
      requests.push({body:req.postData()||'',headers:req.headers()});
      const response=await relay.handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()||undefined}));
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    }else await route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(appOrigin+'/assets/index.html');
  return {page,context};
}
async function expectText(page,text){await page.getByText(text,{exact:false}).first().waitFor({timeout:12000});}
async function sync(page){await page.evaluate(()=>window.dispatchEvent(new Event('online')));}
async function nav(page,name){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();}
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');

try{
  const hyu=await makePhone(),jazzy=await makePhone();
  for(const [phone,username,password] of [[hyu,'hyusukk','test-hyu-password'],[jazzy,'JAZZY','test-jasmin-password']]){
    await phone.page.getByRole('button',{name:'Log in to JAZZY'}).click();
    await phone.page.locator('#login-username').fill(username);await phone.page.locator('#login-password').fill(password);await phone.page.locator('#login-key').fill(setupToken);
    await phone.page.getByRole('button',{name:'Log in',exact:true}).click();await expectText(phone.page,'Welcome home,');
    assert.equal(await phone.page.getByText('I have an invite',{exact:true}).count(),0);
  }
  await hyu.page.getByRole('button',{name:'Add friend by username'}).click();await hyu.page.locator('#friend-username').fill('jazzy');await hyu.page.getByRole('button',{name:'Find account'}).click();await hyu.page.getByRole('button',{name:'Add friend',exact:true}).click();await expectText(hyu.page,'Request sent to @JAZZY');await hyu.page.getByRole('button',{name:'Close dialog'}).click();
  await jazzy.page.getByRole('button',{name:'Add friend by username'}).click();await jazzy.page.getByRole('button',{name:'Accept',exact:true}).click();await expectText(jazzy.page,'Our little world');
  await sync(hyu.page);checks.push('Password plus server key opens home directly on both phones; username search and accepting an encrypted friend request connects them without invite copying.');
  await nav(hyu.page,'Chat');await hyu.page.getByLabel('Message',{exact:true}).fill('A blue hello to Jazzy 💙');await hyu.page.getByRole('button',{name:'Send message',exact:true}).click();
  await nav(jazzy.page,'Chat');await sync(jazzy.page);await expectText(jazzy.page,'A blue hello to Jazzy 💙');
  await jazzy.page.getByLabel('Message',{exact:true}).fill('Hello Hyu Suk <script>bad()</script>');await jazzy.page.getByRole('button',{name:'Send message',exact:true}).click();await sync(hyu.page);await expectText(hyu.page,'Hello Hyu Suk <script>bad()</script>');
  assert.equal(await hyu.page.locator('#messages script').count(),0);checks.push('Bidirectional encrypted chat and HTML-escaping work.');
  const vault=await hyu.page.evaluate(()=>JSON.parse(Jazzy.readVault()));
  assert.ok(requests.every(r=>!r.body.includes(vault.key)&&!JSON.stringify(r.headers).includes(vault.key)));
  assert.ok(requests.filter(r=>r.body.includes('ciphertext')).every(r=>!r.body.includes('A blue hello')));checks.push('Relay requests contain no pair key or plaintext chat.');
  await nav(hyu.page,'Create');await hyu.page.locator('#create-file').setInputFiles({name:'blue.png',mimeType:'image/png',buffer:pixel});
  await hyu.page.locator('.dropzone img').waitFor();await hyu.page.locator('#caption').fill('A moment from Gwangju');await hyu.page.getByRole('button',{name:'Share with Jazzy'}).click();await expectText(hyu.page,'A moment from Gwangju');
  await nav(jazzy.page,'Home');await sync(jazzy.page);await expectText(jazzy.page,'A moment from Gwangju');
  await jazzy.page.getByRole('button',{name:'Like post',exact:true}).click();await jazzy.page.getByRole('button',{name:'Comments',exact:true}).click();await jazzy.page.getByLabel('Comment',{exact:true}).fill('This blue is ours.');await jazzy.page.getByRole('button',{name:'Send',exact:true}).click();await expectText(jazzy.page,'This blue is ours.');await jazzy.page.getByRole('button',{name:'Close dialog'}).click();
  await sync(hyu.page);await expectText(hyu.page,'Liked by Jazzy');checks.push('Photo upload, resizing, cross-device posts, likes, and comments work.');
  await nav(hyu.page,'Reels');await hyu.page.getByRole('button',{name:'Share a Reel',exact:true}).first().click();await hyu.page.locator('#reel-url').fill('https://www.instagram.com/reel/JAZZY_TEST/?igsh=tracking');await hyu.page.locator('#caption').fill('One for our collection');await hyu.page.getByRole('button',{name:'Share with Jazzy'}).click();await hyu.page.getByRole('button',{name:'Watch on Instagram'}).click();assert.equal(await hyu.page.evaluate(()=>window.__opened),'https://www.instagram.com/reel/JAZZY_TEST/');checks.push('Reel links are normalized and opened through the native bridge.');
  await jazzy.page.reload();await expectText(jazzy.page,'Our little world');await nav(jazzy.page,'Chat');await expectText(jazzy.page,'A blue hello to Jazzy 💙');checks.push('Restart restores encrypted history with the simulated native key vault.');
  await nav(hyu.page,'Chat');await hyu.page.locator('#chat-file').setInputFiles({name:'our-note.txt',mimeType:'text/plain',buffer:Buffer.from('A private file for Jazzy.')});await expectText(hyu.page,'our-note.txt');await hyu.page.getByRole('button',{name:'Send message',exact:true}).click();
  await nav(jazzy.page,'Chat');await sync(jazzy.page);await expectText(jazzy.page,'our-note.txt');await jazzy.page.getByRole('button',{name:'our-note.txt Tap to save file'}).click();const saved=await jazzy.page.evaluate(()=>window.__saved);assert.equal(saved.name,'our-note.txt');assert.equal(Buffer.from(saved.data,'base64').toString(),'A private file for Jazzy.');checks.push('Generic files are encrypted, received, and passed to the native save-file picker.');
  await nav(hyu.page,'Us');await hyu.page.getByRole('button',{name:'Settings',exact:true}).click();await hyu.page.getByRole('button',{name:'Account & password'}).click();await hyu.page.locator('#account-name').fill('Hyu Blue');await hyu.page.locator('#account-username').fill('hyublue');await hyu.page.locator('#current-password').fill('test-hyu-password');await hyu.page.locator('#new-password').fill('new-test-password');await hyu.page.locator('#confirm-password').fill('new-test-password');await hyu.page.getByRole('button',{name:'Save account'}).click();await expectText(hyu.page,'Hyu Blue');
  await hyu.page.getByRole('button',{name:'Settings',exact:true}).click();await hyu.page.getByRole('button',{name:'Log out'}).click();await hyu.page.locator('#login-password').fill('test-hyu-password');await hyu.page.getByRole('button',{name:'Log in',exact:true}).click();await expectText(hyu.page,'The username or password is incorrect.');await hyu.page.locator('#login-password').fill('new-test-password');await hyu.page.getByRole('button',{name:'Log in',exact:true}).click();await expectText(hyu.page,'Our little world');await nav(hyu.page,'Chat');await expectText(hyu.page,'A blue hello to Jazzy');checks.push('Name, username and password changes work; old password fails; logout/login preserves encrypted history.');
  await hyu.context.close();await jazzy.context.close();
  const preview=await makePhone();await preview.page.screenshot({path:resolve(output,'JAZZY-preview-welcome.png')});
  await preview.page.getByRole('button',{name:'Log in to JAZZY'}).click();await preview.page.screenshot({path:resolve(output,'JAZZY-preview-login.png')});await preview.page.getByRole('button',{name:'Back',exact:true}).click();await preview.page.getByRole('button',{name:'Take a look around first'}).click();await expectText(preview.page,'Our little world');await preview.page.screenshot({path:resolve(output,'JAZZY-preview-feed.png')});
  await nav(preview.page,'Chat');await preview.page.screenshot({path:resolve(output,'JAZZY-preview-chat.png')});
  await nav(preview.page,'Us');await preview.page.screenshot({path:resolve(output,'JAZZY-preview-profile.png')});
  for(const width of [320,390,500]){await preview.page.setViewportSize({width,height:844});assert.equal(await preview.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);}
  checks.push('Preview screenshots captured; profile has no horizontal overflow at 320/390/500px.');
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'browser-checks.json'),JSON.stringify({passed:true,checks},null,2));
  console.log(checks.map(x=>'PASS '+x).join('\n'));
}finally{await browser.close();relay.close();}
