import {useState} from 'react';
import {Action, Card} from '../../ui/components.jsx';
import {OpeningWorkbook} from './OpeningWorkbook.jsx';
import {openingAccountLabels as names} from './openingWorkbook.mjs';
const amounts=new Intl.NumberFormat('vi-VN');
const vnd=value=>amounts.format(value)+' ₫';
const num=value=>Number(value)||0;
const focusImportedNotice=node=>node?.focus();
const emptyStock={itemId:'',quantity:'',value:''};
const emptyDebt={kind:'sell',partyId:'',ref:'',date:'',dueDate:'',amount:''};

function Input({label,value,onChange,type='number',...props}){
  return <label className="field">{label}<input type={type} value={value??''} onChange={event=>onChange(event.target.value)} {...props}/></label>;
}
function Select({label,value,onChange,options}){
  return <label className="field">{label}<select value={value} onChange={event=>onChange(event.target.value)} required>
    <option value="">Chọn mã</option>
    {options.map(option=><option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}
  </select></label>;
}

export function OpeningBalances({model,catalog,branch,canApply,save}){
  const {current,pending,editable}=model;
  const initial=pending??current;
  const [showImport,setShowImport]=useState(false);
  const [imported,setImported]=useState(0);
  const [accounts,setAccounts]=useState(initial.accounts);
  const [stock,setStock]=useState(()=>initial.stock.map((row,key)=>({...row,key})));
  const [debts,setDebts]=useState(()=>initial.debts.map((row,key)=>({...row,amount:row.price,key:key+initial.stock.length})));
  const [serial,setSerial]=useState(initial.stock.length+initial.debts.length);
  const change=(list,set,index,values)=>set(list.map((row,i)=>i===index?{...row,...values}:row));
  const add=(list,set,blank)=>{set([...list,{...blank,key:serial}]);setSerial(serial+1);};
  const drop=(list,set,index)=>set(list.filter((_,i)=>i!==index));
  const start=current.period+'-01';
  const lastBeforeOpening=new Date(Date.parse(start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const items=catalog.items.filter(row=>row.from<=start);
  const parties=catalog.parties.filter(row=>row.from<=start);
  const debit=num(accounts['111'])+num(accounts['112'])+stock.reduce((n,row)=>n+num(row.value),0)+
    debts.filter(row=>row.kind==='sell').reduce((n,row)=>n+num(row.amount),0);
  const credit=num(accounts['334'])+num(accounts['411'])+debts.filter(row=>row.kind==='buy').reduce((n,row)=>n+num(row.amount),0);
  const adjust=stock.length+debts.length<40;
  function importIntoForm(data){
    setAccounts(data.accounts);
    setStock(data.stock.map((row,key)=>({...row,key})));
    setDebts(data.debts.map((row,key)=>({...row,amount:row.price,key:key+data.stock.length})));
    setSerial(data.stock.length+data.debts.length);
    setImported(count=>count+1);
    setShowImport(false);
  }
  function submit(event){
    event.preventDefault();
    save({
      accounts:Object.fromEntries(Object.entries(accounts).map(([code,value])=>[code,num(value)])),
      stock:stock.map(({itemId,quantity,value})=>({itemId,quantity:num(quantity),value:num(value)})),
      debts:debts.map(({kind,partyId,ref,date,dueDate,amount})=>({kind,partyId,ref,date,dueDate,amount:num(amount)}))
    },event.nativeEvent.submitter);
  }
  return <div className="stack">
    <div className="page-head"><div><h1>Số dư đầu kỳ</h1><p>{branch} · Kỳ {current.period.split('-').reverse().join('/')}</p></div>
      {editable&&<button type="button" className="btn soft" aria-expanded={showImport} onClick={()=>setShowImport(!showImport)}>
        {showImport?'Đóng nhập Excel':'Nhập từ Excel'}</button>}
    </div>
    {pending?<section className="card padded stack"><strong>Chờ Kế toán trưởng áp dụng</strong>
      <p>Người lập {pending.preparedBy}. Nợ {vnd(pending.totals.debit)} · Có {vnd(pending.totals.credit)}. Sổ đang dùng số đã áp dụng gần nhất.</p>
      <div className="row-actions">
        {canApply&&editable&&<Action action="form:confirm" args={{action:'opening.apply',title:'Áp dụng bản số dư đầu kỳ đã lưu'}} style="primary">Áp dụng bản đã lưu</Action>}
        <Action action="form:confirm" args={{action:'opening.discard',title:'Bỏ bản số dư đang chờ'}} style="soft">Bỏ bản đang chờ</Action>
      </div>
    </section>:null}
    {!editable&&<p className="notice">Chi nhánh đã phát sinh nghiệp vụ hoặc đã chốt kỳ. Có thể xem số đầu kỳ đã ghi nhận.</p>}
    {model.appliedAt&&<p className="subtle">Áp dụng gần nhất {new Date(model.appliedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p>}
    {editable&&showImport&&<OpeningWorkbook catalog={catalog} period={current.period} branch={branch} applyToForm={importIntoForm}/>}
    {imported>0&&<p key={imported} className="notice" tabIndex={-1} ref={focusImportedNotice} role="status">Đã đưa số liệu Excel vào biểu mẫu. Rà lại các dòng bên dưới rồi chọn Lưu bản chờ áp dụng.</p>}
    <div className="account-summary" aria-live="polite">
      <span>Tổng Nợ <strong>{vnd(debit)}</strong></span>
      <span>Tổng Có <strong>{vnd(credit)}</strong></span>
      <span>{debit===credit?'Cân Nợ/Có':'Chênh lệch '+vnd(Math.abs(debit-credit))}</span>
    </div>
    <form className="stack" onSubmit={submit}>
      <fieldset disabled={!editable} className="stack border-0 m-0 p-0 min-w-0">
        <Card title="Số dư tài khoản">
          <div className="padded form-grid">
            {Object.entries(names).map(([key,label])=><Input key={key} label={key+' · '+label} value={accounts[key]}
              min="0" max="1000000000000" required onChange={value=>setAccounts({...accounts,[key]:value})}/>)}
          </div>
        </Card>
        <Card title="Tồn kho đầu kỳ">
          <div className="padded stack">
            {stock.map((row,i)=><div className="form-grid" key={row.key}>
              <Select label={'Mặt hàng '+(i+1)} value={row.itemId} options={items}
                onChange={itemId=>change(stock,setStock,i,{itemId})}/>
              <Input label="Số lượng" value={row.quantity} min="1" max="1000000" required onChange={quantity=>change(stock,setStock,i,{quantity})}/>
              <Input label="Trị giá tồn (₫)" value={row.value} min="0" max="1000000000000" required onChange={value=>change(stock,setStock,i,{value})}/>
              {editable&&<button className="btn soft" type="button" onClick={()=>drop(stock,setStock,i)}>Bỏ dòng tồn {i+1}</button>}
            </div>)}
            {editable&&<div className="row-actions"><button className="btn soft" type="button" disabled={!adjust||!items.length} onClick={()=>add(stock,setStock,emptyStock)}>Thêm dòng tồn kho</button></div>}
            {editable&&!items.length&&<p className="subtle">Khai báo mặt hàng có hiệu lực từ đầu kỳ trong Danh mục.</p>}
          </div>
        </Card>
        <Card title="Công nợ đầu kỳ">
          <div className="padded stack">
            {debts.map((row,i)=><div className="form-grid" key={row.key}>
              <label className="field">Loại công nợ {i+1}<select value={row.kind} onChange={event=>change(debts,setDebts,i,{kind:event.target.value,partyId:''})}>
                <option value="sell">Phải thu khách hàng</option><option value="buy">Phải trả nhà cung cấp</option>
              </select></label>
              <Select label="Đối tác" value={row.partyId} options={parties.filter(party=>party.kind==='both'||party.kind===(row.kind==='sell'?'customer':'supplier'))}
                onChange={partyId=>change(debts,setDebts,i,{partyId})}/>
              <Input label="Số chứng từ gốc" type="text" maxLength="40" required value={row.ref} onChange={ref=>change(debts,setDebts,i,{ref})}/>
              <Input label="Ngày chứng từ gốc" type="date" max={lastBeforeOpening} required value={row.date} onChange={date=>change(debts,setDebts,i,{date})}/>
              <Input label="Hạn thanh toán" type="date" min={row.date||undefined} value={row.dueDate} onChange={dueDate=>change(debts,setDebts,i,{dueDate})}/>
              <Input label="Số dư (₫)" min="1" max="1000000000000" required value={row.amount} onChange={amount=>change(debts,setDebts,i,{amount})}/>
              {editable&&<button className="btn soft" type="button" onClick={()=>drop(debts,setDebts,i)}>Bỏ dòng công nợ {i+1}</button>}
            </div>)}
            {editable&&<div className="row-actions"><button className="btn soft" type="button" disabled={!adjust||!parties.length} onClick={()=>add(debts,setDebts,emptyDebt)}>Thêm dòng công nợ</button></div>}
            {editable&&!parties.length&&<p className="subtle">Khai báo đối tác có hiệu lực từ đầu kỳ trong Danh mục.</p>}
          </div>
        </Card>
      </fieldset>
      {editable&&<div className="row-actions"><button className="btn primary" type="submit" disabled={debit!==credit}>Lưu bản chờ áp dụng</button></div>}
    </form>
  </div>;
}
