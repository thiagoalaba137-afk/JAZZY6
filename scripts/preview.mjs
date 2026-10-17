// Optional browser preview for development. The APK is the production client.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('app/src/main/assets');
const allowed=new Set(['index.html','app.mjs','crypto.mjs','model.mjs','styles.css','demo-gwangju.svg','demo-azul.svg']);
http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html';
  if(!allowed.has(name)){res.writeHead(404);res.end();return;}
  try{res.writeHead(200,{'content-type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html','cache-control':'no-store'});res.end(await readFile(resolve(root,name)));}catch{res.writeHead(404);res.end();}
}).listen(5173,'127.0.0.1',()=>console.log('JAZZY development preview: http://localhost:5173'));
