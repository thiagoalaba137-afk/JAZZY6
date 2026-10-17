import http from 'node:http';
import {Readable} from 'node:stream';
import {mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRelay} from './relay.mjs';

const directory=resolve(process.env.JAZZY_DATA_DIR||'server/data');
mkdirSync(directory,{recursive:true,mode:0o700});
const database=resolve(directory,'jazzy.sqlite');
const relay=createRelay({database,setupToken:process.env.JAZZY_SETUP_TOKEN,allowDevelopment:process.env.JAZZY_DEV==='1',maxRoomBytes:Number(process.env.JAZZY_MAX_ROOM_MB||512)*1024*1024});
chmodSync(database,0o600);
const server=http.createServer(async(req,res)=>{
  try {
    const options={method:req.method,headers:req.headers};
    if(!['GET','HEAD'].includes(req.method)){options.body=Readable.toWeb(req);options.duplex='half';}
    const request=new Request('http://relay'+req.url,options);
    const result=await relay.handle(request,req.socket.remoteAddress||'unknown');
    res.writeHead(result.status,Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {if(!res.headersSent)res.writeHead(400,{'content-type':'application/json'});res.end('{"error":"Invalid request."}');}
});
server.requestTimeout=45000;
server.headersTimeout=15000;
server.maxHeadersCount=30;
const port=Number(process.env.PORT||8787);
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`JAZZY relay listening on port ${port}. TLS must be provided by the reverse proxy.`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{relay.close();process.exit(0);}));
