import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';
import {localDatabase} from './local-d1.mjs';
import {reportExample} from './demo-reports.mjs';

const {DB}=localDatabase();
if(process.argv.includes('--reports')){
  DB.prepare('INSERT INTO ledo_workspaces (owner_id,revision,payload) VALUES (?,0,?)')
    .bind('ledo-local-owner',JSON.stringify(reportExample())).run();
}
const port=Number(process.env.PORT??4173);
const server=createServer(async(incoming,outgoing)=>{
  try{
    const url=new URL(incoming.url,'http://'+(incoming.headers.host??'localhost:'+port));
    const headers=new Headers(incoming.headers);
    // This fixed test identity is injected only by the development process.
    headers.set('oai-authenticated-user-id','ledo-local-owner');
    headers.set('oai-authenticated-user-email','owner@ledo.example');
    const body=incoming.method==='GET'||incoming.method==='HEAD'?undefined:Readable.toWeb(incoming);
    const result=await worker.fetch(new Request(url,{method:incoming.method,headers,body,duplex:body?'half':undefined}),{DB});
    outgoing.writeHead(result.status,Object.fromEntries(result.headers));
    if(result.body)Readable.fromWeb(result.body).pipe(outgoing);
    else outgoing.end();
  }catch{
    outgoing.writeHead(500);outgoing.end();
  }
});
server.listen(port,'127.0.0.1',()=>console.log('Ledo minh họa tại http://127.0.0.1:'+server.address().port));
