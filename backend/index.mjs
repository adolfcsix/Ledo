import {api} from './api/workspace.mjs';
import {json} from './api/http.mjs';
import {WorkspaceError} from './modules/accounting/domain.mjs';

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith('/api/'))return await api(request,env,url);
      const path=url.pathname==='/'?'/index.html':url.pathname;
      const asset=Object.hasOwn(assets,path)?assets[path]:null;
      if(!asset)return new Response('Không tìm thấy trang.',{status:404});
      return new Response(asset.data,{headers:{
        'content-type':asset.type,
        'cache-control':'no-cache',
        'x-content-type-options':'nosniff',
        'referrer-policy':'same-origin',
        'content-security-policy':"default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; img-src 'self' data:"
      }});
    }catch(error){
      if(error instanceof WorkspaceError)return json({error:error.message},error.status);
      console.error('ledo request failed:',error?.message);
      return json({error:'Không tải được không gian làm việc. Vui lòng thử lại.'},500);
    }
  }
};
