import {createHash, randomBytes, randomUUID, scrypt as derive, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {promisify} from 'node:util';
import {json} from '../api/http.mjs';

const scrypt=promisify(derive);
const sessionAge=12*60*60;
const windowMs=15*60*1000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const sessionName='ledo_local_session';
const expired=name=>name+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const invitationPattern=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const failed=()=>json({error:'Email hoặc mật khẩu không đúng.'},401);
const dummySalt=randomBytes(16).toString('hex');

async function passwordHash(password,salt=randomBytes(16).toString('hex')){
  const key=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return salt+':'+key.toString('hex');
}
function cookieValue(request){
  return request.headers.get('cookie')?.match(/(?:^|;\s*)ledo_local_session=([a-f0-9]{64})(?:;|$)/)?.[1]??null;
}

export function standaloneAuth(db){
  db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const hasOwner=()=>Boolean(db.prepare('SELECT 1 FROM local_users LIMIT 1').get());
  const bootstrap=hasOwner()?null:randomBytes(16).toString('hex');
  const byEmail=db.prepare('SELECT * FROM local_users WHERE email=?');
  const deleteSession=db.prepare('DELETE FROM local_sessions WHERE digest=?');
  const startSession=db.prepare('INSERT INTO local_sessions VALUES (?,?,?)');
  const cleanSessions=db.prepare('DELETE FROM local_sessions WHERE expires_at<=?');
  const lookup=db.prepare('SELECT u.id,u.email FROM local_sessions s JOIN local_users u ON u.id=s.user_id WHERE s.digest=? AND s.expires_at>?');
  const validInvite=db.prepare("SELECT 1 FROM ledo_members WHERE email=? AND invite_hash=? AND status='pending' AND invite_until>? AND (valid_until IS NULL OR valid_until>?)");
  const addUser=db.prepare('INSERT INTO local_users VALUES (?,?,?)');
  const bootstrapUser=db.prepare('INSERT INTO local_users SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM local_users)');
  const expireLimits=db.prepare('DELETE FROM local_auth_attempts WHERE expires_at<=?');
  const limit=db.prepare('INSERT INTO local_auth_attempts VALUES (?,1,?) ON CONFLICT(subject) DO UPDATE SET count=count+1 RETURNING count');
  const resetLimit=db.prepare('DELETE FROM local_auth_attempts WHERE subject=?');

  function identity(request){
    const raw=cookieValue(request);
    return raw?lookup.get(digest(raw),Date.now())??null:null;
  }

  async function authApi(request,url){
    const route=url.pathname;
    if(request.method==='GET'&&route==='/api/auth/session'){
      return json({standalone:true,signedIn:Boolean(identity(request)),needsSetup:!hasOwner()});
    }
    if(request.method!=='POST'||request.headers.get('origin')!==url.origin||
      request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){
      return json({error:'Yêu cầu đăng nhập không hợp lệ.'},403);
    }
    if(route==='/api/auth/logout'){
      const raw=cookieValue(request);
      if(raw)deleteSession.run(digest(raw));
      return new Response(JSON.stringify({signedIn:false}),{headers:[
        ['Content-Type','application/json'],['Cache-Control','no-store'],
        ['Set-Cookie',expired(sessionName)],['Set-Cookie',expired('ledo_company')],['Set-Cookie',expired('ledo_demo_session')]
      ]});
    }
    if(!['/api/auth/setup','/api/auth/register','/api/auth/login'].includes(route))return json({error:'Không tìm thấy chức năng.'},404);
    const body=await request.text();
    if(body.length>4096)return json({error:'Yêu cầu quá dài.'},413);
    let input;
    try{input=JSON.parse(body);}catch{return json({error:'Dữ liệu không hợp lệ.'},400);}
    const email=normalizeEmail(input?.email);
    const password=input?.password;
    if(!emailPattern.test(email)||email.length>200||typeof password!=='string'||password.length<12||password.length>128){
      return json({error:'Nhập email và mật khẩu từ 12 đến 128 ký tự.'},422);
    }
    const now=Date.now();
    expireLimits.run(now);
    const subject=route+':'+digest(email);
    if(limit.get(route,now+windowMs).count>120||limit.get(subject,now+windowMs).count>8){
      return json({error:'Thử quá nhiều lần. Hãy đợi rồi đăng nhập lại.'},429);
    }
    let user=byEmail.get(email);
    if(route==='/api/auth/login'){
      const saved=user?.password_hash;
      const candidate=await passwordHash(password,saved?.split(':')[0]??dummySalt);
      if(!saved||!timingSafeEqual(Buffer.from(saved),Buffer.from(candidate)))return failed();
    }else{
      const isSetup=route==='/api/auth/setup';
      const code=typeof input.code==='string'?input.code.trim().toLowerCase():'';
      if(isSetup){
        if(!bootstrap||hasOwner())return json({error:'Ledo đã được thiết lập.'},409);
        if(!timingSafeEqual(Buffer.from(digest(code)),Buffer.from(digest(bootstrap))))return json({error:'Mã thiết lập không hợp lệ.'},403);
      }else{
        if(!hasOwner()||!invitationPattern.test(code)||!validInvite.get(email,digest(code),now,now)){
          return json({error:'Lời mời không hợp lệ hoặc đã hết hạn.'},403);
        }
        if(user)return json({error:'Email này đã có tài khoản. Hãy đăng nhập để nhận lời mời.'},409);
      }
      user={id:randomUUID()};
      const hashed=await passwordHash(password);
      if(isSetup){
        if(!bootstrapUser.run(user.id,email,hashed).changes)return json({error:'Ledo đã được thiết lập.'},409);
      }else{
        const checked=Date.now();
        if(!validInvite.get(email,digest(code),checked,checked))return json({error:'Lời mời đã hết hiệu lực.'},403);
        if(byEmail.get(email))return json({error:'Email này đã có tài khoản. Hãy đăng nhập.'},409);
        addUser.run(user.id,email,hashed);
      }
    }
    resetLimit.run(subject);
    const old=cookieValue(request);
    if(old)deleteSession.run(digest(old));
    const token=randomBytes(32).toString('hex');
    cleanSessions.run(Date.now());
    startSession.run(digest(token),user.id,Date.now()+sessionAge*1000);
    return json({signedIn:true},200,{'Set-Cookie':sessionName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+sessionAge});
  }
  return {bootstrap,identity,authApi};
}
