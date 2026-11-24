import {hash,json} from '../../api/http.mjs';
import {roles,branches,roleCapabilities,rolePages} from './roles.mjs';
import {WorkspaceError} from '../accounting/domain.mjs';

const directoryRoles=['KT','TK','TQ','PD','KTT','LD','KS','TL'];
const inviteDuration=72*60*60*1000;
const companyCookie='ledo_company';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function accountAssert(condition,error,status=422){
  if(!condition)throw new WorkspaceError(error,status);
}
function accountName(value,limit=100){
  const result=typeof value==='string'?value.trim():'';
  accountAssert(result&&result.length<=limit&&!/[\u0000-\u001f]/.test(result),'Nhập tên hợp lệ.');
  return result;
}
function emailKey(value){
  if(typeof value!=='string')return '';
  const email=value.trim().toLowerCase();
  return email.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)?email:'';
}
function trustedEmail(request){return emailKey(request.headers.get('oai-authenticated-user-email'));}
function validateMember(input){
  const codes=input.roles;
  accountAssert(Array.isArray(codes)&&codes.length>0&&codes.length<=directoryRoles.length&&codes.every(code=>directoryRoles.includes(code)),'Chọn ít nhất một vai trò nghiệp vụ hợp lệ.');
  accountAssert(Object.hasOwn(branches,input.branch),'Chọn chi nhánh làm việc.');
  const set=[...new Set(codes)];
  const limit=set.includes('PD')?input.limit:null;
  if(set.includes('PD'))accountAssert(Number.isSafeInteger(limit)&&limit>=1&&limit<=1e12,'Hạn mức duyệt phải là số tiền hợp lệ.');
  let validUntil=null;
  if(input.validUntil){
    accountAssert(typeof input.validUntil==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil),'Ngày hết quyền không hợp lệ.');
    const localEnd=input.validUntil+'T23:59:59.999+07:00';
    validUntil=Date.parse(localEnd);
    const roundTrip=new Date(validUntil+7*3600000);
    accountAssert(Number.isFinite(validUntil)&&roundTrip.toISOString().slice(0,10)===input.validUntil&&validUntil>Date.now(),'Chọn ngày hết quyền hợp lệ từ hôm nay trở đi.');
  }
  return {name:accountName(input.name),roleJson:JSON.stringify(set),branch:input.branch,limit,bankLink:set.includes('KT')&&input.bankLink===true?1:0,validUntil};
}
function currentCompany(request){
  const val=request.headers.get('cookie')?.match(/(?:^|;\s*)ledo_company=([^;]+)/)?.[1];
  if(!val)return null;
  const [orgId,code,extra]=val.split('.');
  return !extra&&uuid.test(orgId)&&Object.hasOwn(roles,code)?{orgId,code}:null;
}
function companyHeader(url,orgId,code){
  const value=orgId?orgId+'.'+code:'';
  return companyCookie+'='+value+'; Path=/; Max-Age='+(value?86400*14:0)+'; HttpOnly; SameSite=Strict'+(url.protocol==='https:'?'; Secure':'');
}
function memberRoles(row){return JSON.parse(row.roles);}
function allowedMember(row){
  return row?.status==='active'&&(row.valid_until===null||row.valid_until>Date.now());
}
async function findMembership(db,user,orgId){
  return db.prepare('SELECT m.*, o.name AS org_name, o.owner_id AS org_owner, o.period, o.inventory_item, o.opening_bank, o.opening_cash FROM ledo_members m JOIN ledo_organizations o ON o.id=m.org_id WHERE m.user_id=? AND m.org_id=?')
    .bind(user,orgId).first();
}
export async function companyContext(db,request,user){
  const selection=currentCompany(request);
  if(!selection)return null;
  const row=await findMembership(db,user,selection.orgId);
  accountAssert(allowedMember(row),'Quyền vào đơn vị đã hết hạn hoặc bị ngừng.',403);
  const codes=memberRoles(row);
  accountAssert(codes.includes(selection.code),'Vai trò đã thay đổi. Chọn lại vai trò được cấp.',403);
  return {
    key:'org:'+row.org_id,code:selection.code,member:row,selection,
    access:{id:row.id,name:row.display_name,organization:row.org_name,period:row.period,inventoryItem:row.inventory_item,openingBank:row.opening_bank,openingCash:row.opening_cash,branch:row.branch,limit:selection.code==='PD'?row.approval_limit:null,bankLink:!!row.bank_link,roles:codes}
  };
}
function writeAccountAudit(db,orgId,memberId,name,action){
  return db.prepare('INSERT INTO ledo_access_log (id,org_id,member_id,actor_name,action,created_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),orgId,memberId,name,action,Date.now());
}
async function directory(db,user,request){
  const selection=currentCompany(request);
  const list=await db.prepare('SELECT m.*,o.name AS org_name,o.owner_id AS org_owner FROM ledo_members m JOIN ledo_organizations o ON o.id=m.org_id WHERE m.user_id=? ORDER BY o.name').bind(user).all();
  return {
    email:trustedEmail(request),
    selection:selection??null,
    hasOrganization:list.results.some(row=>row.org_owner===user),
    organizations:list.results.map(row=>({id:row.org_id,name:row.org_name,owner:row.org_owner===user,roles:memberRoles(row),branch:row.branch,active:allowedMember(row)})),
    roleOptions:directoryRoles.map(code=>({code,name:roles[code].name,lead:roles[code].lead,
      pages:rolePages(code,{company:true,period:true}),
      capabilities:[...roleCapabilities(code,{company:true,period:true,catalog:true})]}))
  };
}
async function normalizeMember(db,orgId,id){
  accountAssert(typeof id==='string'&&uuid.test(id),'Không tìm thấy thành viên.',404);
  const row=await db.prepare('SELECT * FROM ledo_members WHERE org_id=? AND id=?').bind(orgId,id).first();
  accountAssert(row,'Không tìm thấy thành viên.',404);
  return row;
}
function inviteResult(raw,row){return {invite:raw,expiresAt:row.invite_until,message:'Đã tạo mã kích hoạt.'};}
export async function accountApi(request,env,url,user,input){
  const db=env.DB;
  const route=url.pathname;
  if(route==='/api/account'&&request.method==='GET')return json(await directory(db,user,request));
  if(route==='/api/account/select'&&request.method==='POST'){
    if(input.mode==='demo'&&env.standalone)return json({error:'Bản vận hành sử dụng dữ liệu của đơn vị.'},403);
    if(input.mode==='demo')return json({message:'Đã chuyển sang thực hành.'},200,{'Set-Cookie':companyHeader(url)});
    accountAssert(typeof input.orgId==='string'&&uuid.test(input.orgId),'Đơn vị không hợp lệ.');
    const record=await findMembership(db,user,input.orgId);
    accountAssert(allowedMember(record),'Bạn chưa được cấp quyền vào đơn vị.',403);
    const codes=memberRoles(record);
    const role=input.code??codes[0];
    accountAssert(codes.includes(role),'Vai trò không thuộc quyền truy cập của bạn.',403);
    return json({message:'Đã mở '+record.org_name},200,{'Set-Cookie':companyHeader(url,input.orgId,role)});
  }
  if(route==='/api/account/create'&&request.method==='POST'){
    const email=trustedEmail(request);
    accountAssert(email,'Tài khoản hiện tại cần có email đăng nhập.',403);
    const name=accountName(input.organization);
    const ownerName=accountName(input.name);
    const period=env.standalone?input.period:null;
    accountAssert(!env.standalone||(typeof period==='string'&&/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(period)),'Chọn tháng bắt đầu hạch toán hợp lệ.');
    const inventoryItem=env.standalone&&input.inventoryItem?accountName(input.inventoryItem):null;
    const openingBank=env.standalone?(input.openingBank??0):0;
    const openingCash=env.standalone?(input.openingCash??0):0;
    accountAssert([openingBank,openingCash].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12),'Số dư đầu kỳ phải là số nguyên từ 0 đến 1.000 tỷ đồng.');
    const existing=await db.prepare('SELECT id FROM ledo_organizations WHERE owner_id=?').bind(user).first();
    accountAssert(!existing,'Tài khoản này đã sở hữu một đơn vị.',409);
    const orgId=crypto.randomUUID(),id=crypto.randomUUID();
    try{
      await db.batch([
        db.prepare('INSERT INTO ledo_organizations (id,name,owner_id,created_at,period,inventory_item,opening_bank,opening_cash) VALUES (?,?,?,?,?,?,?,?)').bind(orgId,name,user,Date.now(),period,inventoryItem,openingBank,openingCash),
        db.prepare("INSERT INTO ledo_members (id,org_id,user_id,email,display_name,roles,branch,status) VALUES (?,?,?,?,?,?,?,'active')")
          .bind(id,orgId,user,email,ownerName,JSON.stringify(['QT','KTT','KT']),'CN01'),
        writeAccountAudit(db,orgId,id,ownerName,'Tạo đơn vị')
      ]);
    }catch(error){
      if(/UNIQUE constraint failed/i.test(error.message))throw new WorkspaceError('Tài khoản này đã sở hữu một đơn vị.',409);
      throw error;
    }
    return json({message:'Đã tạo '+name},200,{'Set-Cookie':companyHeader(url,orgId,'QT')});
  }
  if(route==='/api/account/accept'&&request.method==='POST'){
    const email=trustedEmail(request);
    accountAssert(email&&typeof input.code==='string'&&uuid.test(input.code),'Kiểm tra email đăng nhập và mã kích hoạt.');
    const digest=await hash(input.code.toLowerCase());
    const row=await db.prepare("SELECT * FROM ledo_members WHERE invite_hash=? AND email=? AND status='pending' AND invite_until>? AND (valid_until IS NULL OR valid_until>?)")
      .bind(digest,email,Date.now(),Date.now()).first();
    accountAssert(row,'Mã không hợp lệ, đã hết hạn hoặc không dành cho email đang đăng nhập.',403);
    const existing=await findMembership(db,user,row.org_id);
    accountAssert(!existing,'Tài khoản đã có trong đơn vị.',409);
    let result;
    try{
      result=await db.batch([
        db.prepare("UPDATE ledo_members SET user_id=?, status='active', invite_hash=NULL, invite_until=NULL, revision=revision+1 WHERE id=? AND revision=? AND invite_hash=? AND status='pending' AND invite_until>? AND (valid_until IS NULL OR valid_until>?)")
          .bind(user,row.id,row.revision,digest,Date.now(),Date.now()),
        db.prepare("INSERT INTO ledo_access_log (id,org_id,member_id,actor_name,action,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1")
          .bind(crypto.randomUUID(),row.org_id,row.id,row.display_name,'Kích hoạt tài khoản',Date.now())
      ]);
    }catch(error){
      if(/UNIQUE constraint failed/i.test(error.message))throw new WorkspaceError('Tài khoản đã có trong đơn vị.',409);
      throw error;
    }
    accountAssert(result[0].meta.changes===1,'Mã đã được sử dụng hoặc hết hạn.',409);
    return json({message:'Đã kích hoạt tài khoản.'},200,{'Set-Cookie':companyHeader(url,row.org_id,memberRoles(row)[0])});
  }
  const context=await companyContext(db,request,user);
  accountAssert(context?.member.org_owner===user&&context.code==='QT','Chỉ chủ đơn vị ở vai trò quản trị có quyền quản lý người dùng.',403);
  const orgId=context.member.org_id;
  if(route==='/api/account/members'&&request.method==='GET'){
    const data=await db.prepare('SELECT id,user_id,email,display_name,roles,branch,approval_limit,bank_link,status,invite_until,valid_until,revision FROM ledo_members WHERE org_id=? ORDER BY display_name').bind(orgId).all();
    const history=await db.prepare('SELECT actor_name,action,created_at,member_id FROM ledo_access_log WHERE org_id=? ORDER BY created_at DESC LIMIT 50').bind(orgId).all();
    return json({
      members:data.results.map(({user_id,roles:codes,...row})=>({...row,roles:JSON.parse(codes),owner:user_id===user,activated:Boolean(user_id)})),
      history:history.results
    });
  }
  if(route==='/api/account/invite'&&request.method==='POST'){
    const settings=validateMember(input);
    const email=emailKey(input.email);
    accountAssert(email,'Nhập đúng email mà người được mời sẽ dùng để đăng nhập.');
    const raw=crypto.randomUUID(),digest=await hash(raw),id=crypto.randomUUID(),expires=Date.now()+inviteDuration;
    try{
      await db.batch([
        db.prepare("INSERT INTO ledo_members (id,org_id,email,display_name,roles,branch,approval_limit,bank_link,status,invite_hash,invite_until,valid_until) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)")
          .bind(id,orgId,email,settings.name,settings.roleJson,settings.branch,settings.limit,settings.bankLink,digest,expires,settings.validUntil),
        writeAccountAudit(db,orgId,id,context.member.display_name,'Thêm người dùng và cấp mã kích hoạt')
      ]);
    }catch(error){
      if(/UNIQUE constraint failed/i.test(error.message))throw new WorkspaceError('Email đã có trong đơn vị. Mở danh sách để quản lý hoặc cấp lại mã.',409);
      throw error;
    }
    return json(inviteResult(raw,{invite_until:expires}));
  }
  if(['/api/account/update','/api/account/status','/api/account/reissue'].includes(route)&&request.method==='POST'){
    const row=await normalizeMember(db,orgId,input.id);
    accountAssert(row.user_id!==user,'Tài khoản chủ đơn vị được giữ để quản trị.',403);
    accountAssert(row.revision===input.revision,'Tài khoản đã thay đổi. Tải lại trước khi tiếp tục.',409);
    let command,action,extra={};
    if(route.endsWith('/update')){
      const s=validateMember(input);
      command=db.prepare('UPDATE ledo_members SET display_name=?, roles=?, branch=?, approval_limit=?, bank_link=?, valid_until=?, revision=revision+1 WHERE org_id=? AND id=? AND revision=?')
        .bind(s.name,s.roleJson,s.branch,s.limit,s.bankLink,s.validUntil,orgId,row.id,row.revision);
      action='Cập nhật vai trò và phạm vi';
    }else if(route.endsWith('/reissue')){
      accountAssert(row.status!=='active'&&!row.user_id,'Chỉ cấp lại mã cho tài khoản chưa kích hoạt.',409);
      accountAssert(row.valid_until===null||row.valid_until>Date.now(),'Gia hạn phạm vi trước khi cấp mã mới.',409);
      const raw=crypto.randomUUID(),expires=Date.now()+inviteDuration;
      command=db.prepare("UPDATE ledo_members SET status='pending', invite_hash=?, invite_until=?, revision=revision+1 WHERE org_id=? AND id=? AND revision=?")
        .bind(await hash(raw),expires,orgId,row.id,row.revision);
      action='Cấp lại mã kích hoạt';extra=inviteResult(raw,{invite_until:expires});
    }else{
      accountAssert(input.status==='suspended'||(input.status==='active'&&row.status==='suspended'&&row.user_id),'Trạng thái không hợp lệ.');
      if(input.status==='active')accountAssert(row.valid_until===null||row.valid_until>Date.now(),'Gia hạn phạm vi trước khi mở lại quyền.',409);
      command=db.prepare('UPDATE ledo_members SET status=?, invite_hash=NULL, invite_until=NULL, revision=revision+1 WHERE org_id=? AND id=? AND revision=?')
        .bind(input.status,orgId,row.id,row.revision);
      action=input.status==='active'?'Mở lại truy cập':'Ngừng truy cập';
    }
    const result=await db.batch([command,
      db.prepare("INSERT INTO ledo_access_log (id,org_id,member_id,actor_name,action,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1")
        .bind(crypto.randomUUID(),orgId,row.id,context.member.display_name,action,Date.now())]);
    accountAssert(result[0].meta.changes===1,'Tài khoản vừa thay đổi. Tải lại và thử lại.',409);
    return json({message:action,...extra});
  }
  return json({error:'Không tìm thấy chức năng tài khoản.'},404);
}
