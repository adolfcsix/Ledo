import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import worker from '../dist/server/index.js';
import {json} from '../backend/api/http.mjs';
import {standaloneAuth} from '../backend/standalone/auth.mjs';
import {localDatabase} from './local-d1.mjs';

export function createLedoServer(filename){
  mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  const {DB,sqlite}=localDatabase(filename);
  const auth=standaloneAuth(sqlite);
  const env={DB,standalone:true};
  const server=createServer(async(incoming,outgoing)=>{
    try{
      const port=server.address().port;
      if(!['127.0.0.1:'+port,'localhost:'+port].includes(incoming.headers.host)){
        outgoing.writeHead(400);outgoing.end();return;
      }
      const base='http://'+incoming.headers.host;
      const url=new URL(incoming.url,base);
      if(url.origin!==base){outgoing.writeHead(400);outgoing.end();return;}
      const headers=new Headers(incoming.headers);
      headers.delete('oai-authenticated-user-id');
      headers.delete('oai-authenticated-user-email');
      const length=Number(headers.get('content-length'));
      if(length>16384){outgoing.writeHead(413);outgoing.end();return;}
      const method=incoming.method;
      let result;
      if(method!=='GET'&&method!=='HEAD'&&method!=='POST'){
        result=json({error:'Phương thức không được hỗ trợ.'},405);
      }else{
        // Bound chunked requests too, before passing them to the authentication and workspace handlers.
        let body;
        if(method==='POST'){
          const chunks=[];
          let size=0;
          for await(const chunk of Readable.from(incoming)){
            size+=chunk.length;
            if(size>16384){outgoing.writeHead(413);outgoing.end();return;}
            chunks.push(chunk);
          }
          body=Buffer.concat(chunks);
        }
        let request=new Request(url,{method,headers,body});
        if(url.pathname.startsWith('/api/auth/')){
          result=await auth.authApi(request,url);
        }else{
          const identity=auth.identity(request);
          if(identity){
            headers.set('oai-authenticated-user-id',identity.id);
            headers.set('oai-authenticated-user-email',identity.email);
            request=new Request(url,{method,headers,body});
          }
          result=await worker.fetch(request,env);
        }
      }
      const responseHeaders=Object.fromEntries(result.headers);
      const cookies=result.headers.getSetCookie();
      if(cookies.length)responseHeaders['set-cookie']=cookies;
      responseHeaders['x-content-type-options']='nosniff';
      outgoing.writeHead(result.status,responseHeaders);
      if(result.body&&method!=='HEAD')Readable.fromWeb(result.body).pipe(outgoing);
      else outgoing.end();
    }catch(error){
      console.error('Ledo:',error.message);
      if(!outgoing.headersSent)outgoing.writeHead(500,{'Content-Type':'application/json'});
      outgoing.end(JSON.stringify({error:'Không xử lý được yêu cầu. Hãy kiểm tra nhật ký máy chủ.'}));
    }
  });
  server.on('close',()=>sqlite.close());
  return {server,setupCode:auth.bootstrap};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT??4173);
  const filename=process.env.LEDO_DB?resolve(process.env.LEDO_DB):fileURLToPath(new URL('../data/ledo.sqlite',import.meta.url));
  const {server,setupCode}=createLedoServer(filename);
  server.listen(port,'127.0.0.1',()=>{
    console.log('Ledo đang chạy tại http://127.0.0.1:'+server.address().port);
    if(setupCode)console.log('Mã thiết lập quản trị lần đầu: '+setupCode);
  });
}
