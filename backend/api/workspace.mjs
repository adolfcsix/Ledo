import {initializeCatalog} from '../modules/accounting/catalog.mjs';
import {hash,json} from './http.mjs';
import {accountApi,companyContext} from '../modules/access/accounts.mjs';
import {roles} from '../modules/access/roles.mjs';
import {author, ledgerReviewAt, newWorkspace,perform,processDocumentBatch,workspaceView,WorkspaceError} from '../modules/accounting/domain.mjs';

const cookieName='ledo_demo_session';
const sessionAge=86400*14;

function cookie(request){
  return request.headers.get('cookie')?.match(/(?:^|;\s*)ledo_demo_session=([0-9a-f-]{36})(?:;|$)/i)?.[1]??null;
}
async function readWorkspace(db,owner,company=null){
  let row=await db.prepare('SELECT revision, payload FROM ledo_workspaces WHERE owner_id = ?').bind(owner).first();
  if(!row){
    const seed=newWorkspace(company?'start':'sample');
    if(company){
      seed.openingBank={CN01:0,CN02:0};
      seed.audit=[];
      if(company.period){
        seed.period=company.period;seed.inventoryItem=company.inventoryItem;
        seed.openingBank.CN01=company.openingBank;seed.openingCash={CN01:company.openingCash,CN02:0};
      }
    }
    await db.prepare('INSERT OR IGNORE INTO ledo_workspaces (owner_id, revision, payload) VALUES (?, 0, ?)').bind(owner,JSON.stringify(seed)).run();
    row=await db.prepare('SELECT revision, payload FROM ledo_workspaces WHERE owner_id = ?').bind(owner).first();
  }
  const state=JSON.parse(row.payload);
  initializeCatalog(state);
  return {revision:row.revision,state};
}
function cookieHeader(raw,url){
  return cookieName+'='+raw+'; Path=/; Max-Age='+sessionAge+'; SameSite=Strict; HttpOnly'+(url.protocol==='https:'?'; Secure':'');
}
async function readSession(db,request,owner){
  const raw=cookie(request);
  if(!raw)return null;
  const digest=await hash(raw);
  const session=await db.prepare('SELECT role_code FROM ledo_sessions WHERE token_hash = ? AND owner_id = ? AND updated_at >= ?')
    .bind(digest,owner,Date.now()-sessionAge*1000).first();
  return session?{code:session.role_code,digest}:null;
}
function safeOwner(request){return request.headers.get('oai-authenticated-user-id');}
function sameOrigin(request,url){
  return request.headers.get('origin')===url.origin&&request.headers.get('content-type')?.toLowerCase().startsWith('application/json');
}
async function readBody(request){
  const raw=await request.text();
  if(raw.length>12000)throw new WorkspaceError('Yêu cầu quá dài.',413);
  let input;
  try{input=JSON.parse(raw);}catch{throw new WorkspaceError('Nội dung yêu cầu không hợp lệ.',400);}
  if(!input||Array.isArray(input)||typeof input!=='object')throw new WorkspaceError('Nội dung yêu cầu không hợp lệ.',400);
  return input;
}

export async function api(request,env,url){
  if(url.pathname==='/api/auth/session'&&request.method==='GET')return json({standalone:false});
  const db=env.DB;
  if(!db)return json({error:'Chưa kết nối kho dữ liệu.'},503);
  if(url.pathname==='/api/health'&&request.method==='GET'){
    await db.prepare('SELECT id FROM ledo_members LIMIT 1').first();
    await db.prepare('SELECT revision FROM ledo_workspaces LIMIT 1').first();
    return json({status:'ok'});
  }
  const owner=safeOwner(request);
  if(!owner)return json({error:'Bạn cần đăng nhập để sử dụng Ledo.'},401);
  const get=request.method==='GET';
  if(!get&&(request.method!=='POST'||!sameOrigin(request,url)))return json({error:'Yêu cầu không hợp lệ.'},403);
  const input=get?null:await readBody(request);
  if(url.pathname==='/api/account'||url.pathname.startsWith('/api/account/'))return accountApi(request,env,url,owner,input);

  const company=await companyContext(db,request,owner);
  if(env.standalone&&!company)return json({error:'Chọn đơn vị hoặc nhập lời mời để bắt đầu.'},409);
  const session=company?null:await readSession(db,request,owner);
  const workspace=company?.key??owner;
  const access=company?.access;
  if(get&&url.pathname==='/api/workspace'){
    const {state,revision}=await readWorkspace(db,workspace,access);
    if(company)return json(workspaceView(state,company.code,revision,access));
    const code=session?.code??'KT';
    const effective=state.grants[code]?.active?code:null;
    const view=effective?workspaceView(state,effective,revision):{
      actor:{code:'NONE',initial:'—',name:'Chọn vai trò',person:'Phiên thực hành',branch:'—'},
      roles:Object.entries(roles).filter(([key])=>state.grants[key].active).map(([key,role])=>({code:key,name:role.name,person:role.person})),
      nav:[],caps:[],revision,locked:false
    };
    if(session)return json(view);
    const raw=crypto.randomUUID();
    await db.prepare('INSERT INTO ledo_sessions (token_hash, owner_id, role_code, updated_at) VALUES (?, ?, ?, ?)')
      .bind(await hash(raw),owner,effective??'NONE',Date.now()).run();
    return json(view,200,{'Set-Cookie':cookieHeader(raw,url)});
  }
  const code=company?.code??session?.code;
  if(!code)return json({error:'Phiên làm việc đã hết hạn. Tải lại trang.'},401);
  const {state,revision}=await readWorkspace(db,workspace,access);
  if(get&&url.pathname==='/api/ledger-review'){
    return json({...ledgerReviewAt(state,code,url.searchParams.get('date'),url.searchParams.get('group'),access),revision});
  }
  if(get&&url.pathname==='/api/invoice.xml'){
    const actor=author(state,code,access);
    if(!actor.caps.has('invoice.read'))return json({error:'Vai trò không được đọc bản XML.'},403);
    const invoice=(state.invoices??[]).find(row=>row.branch===actor.branch&&row.id===url.searchParams.get('id'));
    if(!invoice)return json({error:'Không tìm thấy hóa đơn trong phạm vi.'},404);
    return new Response(invoice.xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':'attachment; filename="'+invoice.id+'.xml"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(get&&url.pathname==='/api/audit.csv'){
    const model=workspaceView(state,code,revision,access);
    if(!model.caps.includes('evidence.export'))return json({error:'Vai trò không được xuất nhật ký.'},403);
    const csvCell=value=>'"'+String(value).replace(/^[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
    const csv=[['Thời điểm','Vai trò','Mã hồ sơ','Thao tác','Mã lô'],...model.audit.map(row=>[row.time,row.actor,row.target,row.message,row.batch??''])]
      .map(row=>row.map(csvCell).join(',')).join('\r\n');
    return new Response('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Ledo_Nhat_ky.csv"','Cache-Control':'no-store'}});
  }
  if(!get&&url.pathname==='/api/demo-role'){
    if(company)return json({error:'Vai trò trong đơn vị do chủ đơn vị cấp.'},403);
    const selected=input.code;
    if(!Object.hasOwn(roles,selected)||!state.grants[selected]?.active)return json({error:'Vai trò thực hành không khả dụng.'},403);
    const raw=crypto.randomUUID();
    const updated=await db.prepare('UPDATE ledo_sessions SET token_hash = ?, role_code = ?, updated_at = ? WHERE token_hash = ? AND owner_id = ?')
      .bind(await hash(raw),selected,Date.now(),session.digest,owner).run();
    if(updated.meta.changes!==1)return json({error:'Phiên thực hành đã thay đổi. Tải lại trang.'},409);
    return json(workspaceView(state,selected,revision),200,{'Set-Cookie':cookieHeader(raw,url)});
  }
  const previewBatch=url.pathname==='/api/actions/preview'&&input?.action==='documents.batch';
  if(get||(url.pathname!=='/api/actions'&&!previewBatch))return json({error:'Không tìm thấy chức năng.'},404);
  if(input.revision!==revision)return json({error:'Dữ liệu đã thay đổi ở nơi khác. Tải lại trước khi tiếp tục.'},409);
  if(!input.data||Array.isArray(input.data)||typeof input.data!=='object')return json({error:'Thiếu dữ liệu thao tác.'},400);
  const data=input.data;
  if(input.action==='invoice.import'&&typeof data.xml==='string')data.digest=await hash(data.xml);
  if(previewBatch)return json(processDocumentBatch(state,code,data,access));
  const result=input.action==='documents.batch'?processDocumentBatch(state,code,data,access,{commit:true}):
    perform(state,code,input.action,data,access);
  const persisted=[revision+1,JSON.stringify(state),workspace,revision];
  const prefix='UPDATE ledo_workspaces SET revision = ?, payload = ? WHERE owner_id = ? AND revision = ?';
  const updated=company?
    await db.prepare(prefix+" AND EXISTS (SELECT 1 FROM ledo_members WHERE id=? AND user_id=? AND revision=? AND status='active' AND (valid_until IS NULL OR valid_until>?))")
      .bind(...persisted,company.member.id,owner,company.member.revision,Date.now()).run():
    await db.prepare(prefix+' AND EXISTS (SELECT 1 FROM ledo_sessions WHERE token_hash = ? AND owner_id = ? AND role_code = ?)')
      .bind(...persisted,session.digest,owner,code).run();
  if(updated.meta.changes!==1)return json({error:'Vai trò hoặc dữ liệu vừa đổi. Tải lại trước khi thử lại.'},409);
  return json({...workspaceView(state,code,revision+1,access),result});
}
