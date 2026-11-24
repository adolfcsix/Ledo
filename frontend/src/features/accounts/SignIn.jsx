import {useState} from 'react';
import {request} from '../../api/client.js';

export function SignIn({needsSetup, invitation, onSignIn}) {
  const [register,setRegister]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const mode=needsSetup?'setup':register?'register':'login';
  const title={setup:'Thiết lập tài khoản quản trị',register:'Tạo tài khoản từ lời mời',login:'Đăng nhập Ledo'}[mode];

  async function submit(event){
    event.preventDefault();
    if(busy)return;
    const values=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError('');
    try{
      await request('/api/auth/'+mode,{...values,code:mode==='register'?invitation:values.code});
      onSignIn();
    }catch(problem){
      setError(problem.message);
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg">
      <div className="page-head"><div><h1>{title}</h1></div></div>
      <form className="card padded stack" onSubmit={submit}>
        {needsSetup && <p>Nhập mã thiết lập hiển thị trong terminal đang chạy Ledo.</p>}
        {mode==='login' && invitation && <p>Đăng nhập bằng email được mời để tham gia đơn vị.</p>}
        {needsSetup && <label className="field">Mã thiết lập<input name="code" required maxLength={32} autoComplete="off" /></label>}
        <label className="field">Email<input type="email" name="email" required maxLength={200} autoComplete="username" /></label>
        <label className="field">Mật khẩu<input type="password" name="password" required minLength={12} maxLength={128}
          autoComplete={mode==='login'?'current-password':'new-password'} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy?'Đang xử lý…':mode==='login'?'Đăng nhập':'Tạo tài khoản'}
        </button>
        {!needsSetup && invitation && (
          <button className="btn soft" type="button" disabled={busy} onClick={()=>{setRegister(!register);setError('');}}>
            {register?'Tôi đã có tài khoản':'Tôi chưa có tài khoản'}
          </button>
        )}
      </form>
    </section>
  );
}
