import {useState} from 'react';
import {Action,Card,DataTable} from '../../ui/components.jsx';
import {displayDate} from '../debts/debtAging.mjs';
import {bankReconciliation} from './reconciliation.mjs';

const number=new Intl.NumberFormat('vi-VN');
const money=value=>value===null?'—':number.format(value)+' ₫';
function tableMoney(value){
  return <span className={'bank-reconcile-number '+(value<0?'bank-reconcile-negative':'')}>
    {value>0?'+':''}{money(value)}
  </span>;
}
function Metric({label,value,tone}){
  return <div className={tone?'bank-reconcile-'+tone:undefined}><span>{label}</span><strong>{money(value)}</strong></div>;
}
function LedgerTable({items,toggle}){
  const [expanded,setExpanded]=useState(false);
  return <Card title={toggle}>
    <DataTable empty="Không có dòng chưa ghép ở nhóm này." columns={['Phiếu ghi sổ','Ngày hạch toán','Đối tác','Biến động TK 112']}
      rows={(expanded?items:items.slice(0,15)).map(row=>({key:row.id,cells:[
        <button className="text-btn" type="button" data-act={'doc:'+row.id}>{row.id}</button>,displayDate(row.date),row.party,tableMoney(row.move)
      ]}))}/>
    {items.length>15&&<div className="padded"><button type="button" className="btn soft" onClick={()=>setExpanded(!expanded)}>
      {expanded?'Thu gọn':'Xem đủ '+items.length+' chứng từ'}</button></div>}
  </Card>;
}
function StatementTable({items}){
  const [expanded,setExpanded]=useState(false);
  return <Card title="Có trên sao kê, chưa ghép với sổ">
    <DataTable empty="Không có dòng sao kê chưa ghép đến ngày đã chọn." columns={['Mã giao dịch','Ngày giao dịch','Đối tác','Biến động sao kê','Đối chiếu']}
      rows={(expanded?items:items.slice(0,15)).map(row=>({key:row.ref,cells:[
        row.ref,displayDate(row.date),row.partyCode?row.partyCode+' · '+row.party:row.party,tableMoney(row.kind==='receive'?row.amount:-row.amount),
        row.linked?<button className="text-btn" type="button" data-act={'doc:'+row.linked}>{row.linked}</button>:
          <Action action="match:row" args={{ref:row.ref}} style="soft">Xem đối chiếu</Action>
      ]}))}/>
    {items.length>15&&<div className="padded"><button type="button" className="btn soft" onClick={()=>setExpanded(!expanded)}>
      {expanded?'Thu gọn':'Xem đủ '+items.length+' giao dịch'}</button></div>}
  </Card>;
}
export function BankReconciliation({period,report,statement,canSave,save}){
  const monthEnd=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
  const start=period+'-01';
  const [at,setAt]=useState(report.checkpoints[0]?.date??monthEnd);
  const [draft,setDraft]=useState({});
  const [saving,setSaving]=useState(false);
  const saved=report.checkpoints.find(row=>row.date===at);
  const balanceText=draft.balance??String(saved?.balance??'');
  const reference=draft.reference??saved?.reference??'';
  const parsed=balanceText.trim()===''?null:Number(balanceText);
  const valid=Number.isSafeInteger(parsed)&&Math.abs(parsed)<=1e15;
  const balance=valid?parsed:null;
  const result=bankReconciliation(report,statement,{date:at,balance});
  function showDate(date){
    setAt(date);setDraft({});
  }
  async function persist(event){
    event.preventDefault();
    if(!valid||saving)return;
    setSaving(true);
    try{
      const result=await save({date:at,balance,reference:reference.trim()},event.nativeEvent.submitter);
      if(result)setDraft({});
    }finally{setSaving(false);}
  }
  const changed=!saved||saved.balance!==balance||saved.reference!==reference.trim();
  const pending=result.unlinkedBank.length+result.unlinkedBook.length;
  const verdict=balance===null?'Chưa có số dư cuối ngày của ngân hàng.':
    result.difference===0&&pending===0?'Số dư khớp và các dòng đã được ghép.':
      result.difference===0?'Số dư bằng nhau, vẫn còn dòng chưa ghép.':
        result.residual===0?'Chênh lệch khớp với tác động ròng của các dòng chưa ghép.':
          'Còn chênh lệch chưa giải thích, cần kiểm tra lại sao kê và số dư ngân hàng.';
  return <div className="stack bank-reconcile">
    <section className="card padded stack">
      <div className="bank-split"><div><h2>Đối chiếu số dư cuối ngày</h2>
        <p>Từ {displayDate(start)} đến hết {displayDate(at)} · Tài khoản 112</p></div>
        {report.checkpoints.length>0&&<label className="field">Mốc đã lưu<select aria-label="Mốc đã lưu" value={saved?at:''} disabled={saving} onChange={event=>{
          if(event.target.value)showDate(event.target.value);
        }}><option value="">Chọn ngày đã lưu</option>{report.checkpoints.map(row=><option key={row.date} value={row.date}>{displayDate(row.date)} · {money(row.balance)}</option>)}</select></label>}
      </div>
      <form className="bank-date-form" key={at} onSubmit={event=>{
        event.preventDefault();
        showDate(new FormData(event.currentTarget).get('date'));
      }}>
        <label className="field">Ngày đối chiếu<input name="date" type="date" min={start} max={monthEnd} defaultValue={at} required disabled={saving}/></label>
        <button type="submit" className="btn soft" disabled={saving}>Xem đến ngày này</button>
      </form>
      <form className="stack bank-balance-form" onSubmit={persist}>
        <div className="bank-balance-fields">
          <label className="field">Số dư cuối ngày trên sổ phụ (₫)
            <input type="number" min="-1000000000000000" max="1000000000000000" step="1" value={balanceText}
              onChange={event=>setDraft({...draft,balance:event.target.value})} disabled={!canSave||saving} required/></label>
          <label className="field">Nguồn số dư
            <input maxLength={120} value={reference} placeholder="Mã hoặc tên sổ phụ" onChange={event=>setDraft({...draft,reference:event.target.value})}
              disabled={!canSave||saving}/></label>
        </div>
        <div className="bank-split">
          <p className="subtle">{saved?'Đã lưu bởi '+saved.by+'. Số liệu trên kế toán được tính lại theo sổ hiện tại.':
            'Lấy số dư đóng ngày từ sổ phụ hoặc ngân hàng. Lưu mốc chỉ lưu giá trị tham chiếu.'}</p>
          {canSave&&<button type="submit" className="btn primary" disabled={!valid||saving||!changed}>{saving?'Đang lưu…':'Lưu số dư ngân hàng'}</button>}
        </div>
        {saved&&changed&&<p className="subtle">Bạn đang xem thử với số dư hoặc nguồn khác mốc đã lưu.</p>}
      </form>
    </section>
    <div className="bank-scores bank-reconcile-metrics">
      <Metric label="Số dư theo sổ kế toán" value={result.closing}/>
      <Metric label="Số dư theo sổ phụ" value={balance}/>
      <Metric label="Chênh lệch sổ phụ trừ sổ kế toán" value={result.difference} tone={result.difference?'warn':undefined}/>
      <Metric label="Chênh lệch còn lại sau giải thích" value={result.residual} tone={result.residual?'warn':undefined}/>
    </div>
    <p className={'notice '+(result.residual||result.difference?'warn':'')} role="status">{verdict}</p>
    <Card title="Cách hình thành số dư và chênh lệch">
      <DataTable columns={['Khoản mục','Số tiền','Nguồn và cách tính']} rows={[
        {key:'opening',cells:['Số dư đầu kỳ TK 112',money(result.opening),'Số dư đầu kỳ đã áp dụng hoặc số thiết lập ban đầu.']},
        {key:'incoming',cells:['Tăng tiền gửi',tableMoney(result.incoming),'Bút toán ghi Nợ TK 112 đến hết ngày đối chiếu.']},
        {key:'outgoing',cells:['Giảm tiền gửi',tableMoney(-result.outgoing),'Bút toán ghi Có TK 112 đến hết ngày đối chiếu.']},
        {key:'bank-only',cells:['Sao kê chưa ghép',tableMoney(result.statementOnly),result.unlinkedBank.length+' dòng. Tiền vào cộng, tiền ra trừ.']},
        {key:'book-only',cells:['Phiếu đã ghi chưa ghép',tableMoney(result.bookOnly),result.unlinkedBook.length+' chứng từ. Tăng tiền gửi cộng, giảm trừ.']},
        {key:'explained',cells:['Chênh lệch giải thích được',tableMoney(result.explained),'Biến động sao kê chưa ghép trừ biến động phiếu chưa ghép.']},
        {key:'residual',cells:['Chênh lệch còn lại',tableMoney(result.residual),'Chênh lệch hai số dư trừ phần đã giải thích.']}
      ]}/>
      <p className="padded subtle">{result.linked} giao dịch đã ghép · {result.bankCount} dòng sao kê · {result.bookCount} phiếu đã ghi đến ngày xem.</p>
    </Card>
    <StatementTable key={'statement-'+at} items={result.unlinkedBank}/>
    <LedgerTable key={'ledger-'+at} items={result.unlinkedBook} toggle="Có trên sổ kế toán, chưa ghép với sao kê"/>
  </div>;
}
