import {useRef,useState} from 'react';
import {Action,Card,DataTable} from '../../ui/components.jsx';
import {BankReconciliation} from './BankReconciliation.jsx';
import {displayDate} from '../debts/debtAging.mjs';
import {inspectBankBatch,statementColumns,statementLimit,statementPartners} from '../../../../backend/modules/accounting/bankStatement.mjs';
import {bankFileLimit,readStatementFile} from './statementFile.mjs';
import template from './LEDO_MAU_SAO_KE.xlsx?url&inline';
import './bank.css';

const nameExcel='LEDO_MAU_SAO_KE.xlsx';
const nameCsv='LEDO_MAU_SAO_KE.csv';
const csv='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF'+statementColumns.join(',')+'\r\n');
const money=value=>new Intl.NumberFormat('vi-VN').format(value)+' ₫';
const paymentKind={receive:'Tiền vào',pay:'Tiền ra'};
const stateLabels={linked:'Đã ghép',proposed:'Có đề xuất',waiting:'Chờ ghép'};
const rowStatus=row=>row.linked?'linked':row.proposal?'proposed':'waiting';
const normalize=value=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');

function StatementImport({period,branch,catalog,existing,save,onSaved}){
  const [file,setFile]=useState('');
  const [records,setRecords]=useState([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [assigned,setAssigned]=useState({});
  const generation=useRef(0);
  async function read(event){
    const picked=event.currentTarget.files[0];
    event.currentTarget.value='';
    if(!picked) return;
    const request=++generation.current;
    setFile(picked.name);setError('');setRecords([]);setAssigned({});
    if(picked.name.length>80||!(/\.(csv|xlsx)$/i.test(picked.name))||picked.size>bankFileLimit){
      setLoading(false);
      setError('Chọn tệp CSV hoặc Excel .xlsx, tối đa 2 MB và tên tệp tối đa 80 ký tự.');return;
    }
    setLoading(true);
    try{
      const data=await readStatementFile(await picked.arrayBuffer(),picked.name);
      if(request===generation.current)setRecords(data);
    }catch(error){
      if(request===generation.current)setError(error.message);
    }finally{
      if(request===generation.current)setLoading(false);
    }
  }
  const candidates=records.filter(entry=>entry.data).map(entry=>{
    const available=catalog?statementPartners(catalog.parties,entry.data.kind,entry.data.date):[];
    const defaultId=available.find(party=>party.code===entry.partyCode)?.id;
    return {...entry,available,data:{...entry.data,partyId:assigned[entry.line]??defaultId}};
  });
  const inspection=inspectBankBatch(candidates.map(entry=>entry.data),{period,catalog,existing});
  const parsed=new Map(candidates.map((entry,index)=>[entry.line,{...entry,...inspection[index]}]));
  const preview=records.map(entry=>parsed.get(entry.line)??{...entry,status:'invalid',message:entry.error});
  const ready=preview.filter(entry=>entry.status==='ready');
  const duplicates=preview.filter(entry=>entry.status==='duplicate').length;
  const errors=preview.length-ready.length-duplicates;
  const incoming=ready.filter(entry=>entry.data.kind==='receive').reduce((sum,entry)=>sum+entry.data.amount,0);
  const outgoing=ready.filter(entry=>entry.data.kind==='pay').reduce((sum,entry)=>sum+entry.data.amount,0);
  async function submit(event){
    setSaving(true);setError('');
    try{
      const result=await save({file,rows:candidates.map(entry=>entry.data)},event.currentTarget);
      if(result)onSaved(result);
    }finally{setSaving(false);}
  }
  return <section className="card stack padded bank-import" aria-labelledby="import-bank-title">
    <div className="bank-split">
      <div><h2 id="import-bank-title">Nhập và kiểm tra tệp sao kê</h2><p>{branch} · Kỳ {period.split('-').reverse().join('/')}</p></div>
      <div className="row-actions"><a download={nameExcel} className="btn soft" href={template}>Mẫu Excel</a><a download={nameCsv} className="btn soft" href={csv}>Mẫu CSV</a></div>
    </div>
    <ol className="bank-steps">
      <li><strong>Điền tệp mẫu</strong><span>Có thể để tiền vào và tiền ra trong cùng tệp, mỗi giao dịch một dòng.</span></li>
      <li><strong>Rà giao dịch và đối tác</strong><span>Bổ sung đối tác ngay trên bảng nếu mã trong tệp còn thiếu hoặc chưa đúng.</span></li>
      <li><strong>Đưa vào danh sách chờ ghép</strong><span>Nhập tệp chỉ tạo dòng sao kê. Kiểm tra và ghi sổ ở bước đối chiếu.</span></li>
    </ol>
    <label className="field">Tệp sao kê<input type="file" accept=".xlsx,.csv" onChange={read} disabled={saving} aria-describedby="bank-file-help"/></label>
    <p id="bank-file-help" className="subtle">Tối đa {statementLimit} giao dịch một tệp và 2 MB. Tệp CSV dùng UTF-8.</p>
    {file&&<p className="bank-file-name">Tệp đã chọn <strong>{file}</strong></p>}
    {loading&&<p className="notice" role="status">Đang đọc tệp và đối chiếu mã giao dịch…</p>}
    {error&&<p className="notice warn" role="alert">{error}</p>}
    {preview.length>0&&<>
      <div className="bank-scores" aria-live="polite">
        <div><span>Dòng mới hợp lệ</span><strong>{ready.length}</strong></div>
        <div><span>Trùng nguyên vẹn</span><strong>{duplicates}</strong></div>
        <div><span>Cần xử lý</span><strong>{errors}</strong></div>
        <div><span>Tiền vào mới</span><strong>{money(incoming)}</strong></div>
        <div><span>Tiền ra mới</span><strong>{money(outgoing)}</strong></div>
      </div>
      <DataTable columns={['Dòng tệp','Giao dịch','Ngày','Số tiền','Đối tác','Kết quả kiểm tra']} rows={preview.map(entry=>({
        key:entry.line,cells:[
          entry.line,entry.data?.ref||'—',displayDate(entry.data?.date),
          entry.data?.kind?<span>{paymentKind[entry.data.kind]}<strong className="bank-cell-detail">{money(entry.data.amount)}</strong></span>:'—',
          entry.available&&!entry.available.length?<span className="subtle">{catalog?'Không có đối tác phù hợp':'Đối tác theo dữ liệu thực hành'}</span>:
            entry.available?<select aria-label={'Đối tác dòng '+entry.line} disabled={saving} value={entry.data.partyId??''}
              onChange={event=>setAssigned({...assigned,[entry.line]:event.target.value})}>
              <option value="">{entry.partyCode?'Rà mã '+entry.partyCode:'Chọn đối tác'}</option>
              {entry.available.map(party=><option key={party.id} value={party.id}>{party.code} · {party.name}</option>)}
            </select>:'—',
          <span className="bank-result"><span className={'chip '+(entry.status==='ready'?'':entry.status==='duplicate'?'neutral':'wait')}>
            {entry.status==='ready'?'Sẵn sàng':entry.status==='duplicate'?'Bỏ qua':entry.status==='conflict'?'Xung đột':'Cần xử lý'}
          </span>{entry.message&&<small>{entry.message}</small>}</span>
        ]
      }))}/>
      {errors>0&&<p className="notice warn">Xử lý các dòng được đánh dấu trước khi lưu. Có thể sửa Excel hoặc CSV và chọn lại tệp.</p>}
      {errors===0&&ready.length===0&&<p className="notice">Tệp này chỉ có các giao dịch đã tồn tại.</p>}
      <div className="row-actions"><button type="button" className="btn primary" onClick={submit} disabled={saving||errors>0||ready.length===0}>
        {saving?'Đang nhập…':'Nhập '+ready.length+' giao dịch chờ ghép'}
      </button></div>
    </>}
  </section>;
}
export function BankWorkspace({rows,period,branch,prepare,catalog,locked,blocked,showDemo,save,reconciliation,saveBalance,initialStatus=''}){
  const canImport=prepare&&!blocked;
  const [showImport,setShowImport]=useState(false);
  const [mode,setMode]=useState('statement');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState(initialStatus);
  const [kind,setKind]=useState('');
  const [batch,setBatch]=useState('');
  const [page,setPage]=useState(1);
  const [latest,setLatest]=useState('');
  const query=normalize(search.trim());
  const totals=rows.reduce((total,row)=>{total[row.kind]+=row.amount;total[rowStatus(row)]++;return total;},
    {receive:0,pay:0,linked:0,waiting:0,proposed:0});
  const batches=new Map();
  for(const row of rows)if(row.importBatch)batches.set(row.importBatch,row.importFile);
  const filtered=rows.filter(row=>(!status||(status==='unlinked'?!row.linked:rowStatus(row)===status))&&(!kind||row.kind===kind)&&
    (!batch||row.importBatch===batch)&&normalize([row.ref,row.party,row.partyCode,row.note].filter(Boolean).join(' ')).includes(query))
    .sort((a,b)=>b.date.localeCompare(a.date)||a.ref.localeCompare(b.ref));
  const size=20,max=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,max);
  const change=(setter,value)=>{setter(value);setPage(1);};
  function saved(result){
    setLatest(result.message);setShowImport(false);setStatus('');setKind('');setSearch('');change(setBatch,result.target??'');
  }
  return <div className="stack bank-workspace">
    <header className="page-head"><div><h1>Đối chiếu ngân hàng</h1><p>NH01 · {branch} · Kỳ {period.split('-').reverse().join('/')}</p></div>
      <div className="row-actions">
        {showDemo&&<Action action="send:bank.sample" style="soft" disabled={!prepare||branch!=='CN01'}>Nạp sao kê mẫu</Action>}
        {prepare&&mode==='statement'&&<Action action="form:bank-add" style="soft" disabled={blocked}>Thêm dòng</Action>}
        {prepare&&mode==='statement'&&<button type="button" className="btn primary" disabled={!canImport} aria-expanded={showImport&&canImport}
          onClick={()=>setShowImport(!showImport)}>{showImport&&canImport?'Đóng nhập sao kê':'Nhập sao kê'}</button>}
      </div>
    </header>
    <div className="row-actions" role="group" aria-label="Chế độ đối chiếu ngân hàng">
      <button type="button" className={'btn '+(mode==='statement'?'primary':'soft')} aria-pressed={mode==='statement'} onClick={()=>setMode('statement')}>Sao kê và ghép phiếu</button>
      <button type="button" className={'btn '+(mode==='balance'?'primary':'soft')} aria-pressed={mode==='balance'} onClick={()=>setMode('balance')}>Đối chiếu số dư</button>
    </div>
    {blocked&&<p className="notice warn">Cần áp dụng hoặc bỏ bản số dư đầu kỳ đang chờ trước khi nhập sao kê.</p>}
    {locked&&<p className="notice">Kỳ đã khóa. Có thể xem lại sao kê và chứng từ đã ghép.</p>}
    {mode==='balance'?<BankReconciliation period={period} report={reconciliation} statement={rows} canSave={prepare} save={saveBalance}/>:<>
    {latest&&<p className="notice" role="status">{latest}</p>}
    {showImport&&canImport&&<StatementImport {...{period,branch,existing:rows,save,onSaved:saved,catalog}}/>}
    <div className="bank-scores">
      <div><span>Tiền vào theo sao kê</span><strong>{money(totals.receive)}</strong></div>
      <div><span>Tiền ra theo sao kê</span><strong>{money(totals.pay)}</strong></div>
      {Object.entries(stateLabels).map(([value,label])=><button type="button" key={value} aria-pressed={status===value} onClick={()=>change(setStatus,status===value?'':value)}>
        <span>{label}</span><strong>{totals[value]}</strong>
      </button>)}
    </div>
    <Card title="Sao kê trong kỳ">
      <div className="padded bank-filters">
        <label className="field">Tìm giao dịch<input type="search" value={search} onChange={event=>change(setSearch,event.target.value)}/></label>
        <label className="field">Trạng thái<select value={status} onChange={event=>change(setStatus,event.target.value)}>
          <option value="">Tất cả</option><option value="unlinked">Chưa ghép (mọi trạng thái)</option>{Object.entries(stateLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="field">Chiều tiền<select value={kind} onChange={event=>change(setKind,event.target.value)}>
          <option value="">Tất cả</option>{Object.entries(paymentKind).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="field">Đợt nhập<select value={batch} onChange={event=>change(setBatch,event.target.value)}>
          <option value="">Tất cả</option>{[...batches].reverse().map(([id,file])=><option key={id} value={id}>{id} · {file}</option>)}
        </select></label>
      </div>
      <DataTable columns={['Giao dịch','Ngày','Đối tác','Chiều tiền','Số tiền','Trạng thái','Thao tác']} empty="Không có giao dịch khớp bộ lọc."
        rows={filtered.slice((current-1)*size,current*size).map(row=>({key:row.ref,cells:[
          <span><strong>{row.ref}</strong>{row.note&&<small className="bank-cell-detail bank-note">{row.note}</small>}
            {row.importBatch&&<small className="bank-cell-detail">{row.importBatch}</small>}</span>,
          displayDate(row.date),row.partyCode?row.partyCode+' · '+row.party:row.party,paymentKind[row.kind],money(row.amount),
          <span className={'chip '+(row.linked?'':row.proposal?'wait':'neutral')}>{stateLabels[rowStatus(row)]}</span>,
          row.linked?<button type="button" data-act={'doc:'+row.linked} className="text-btn">{row.linked}</button>:
            <Action action="match:row" args={{ref:row.ref}} style="soft">Xem đối chiếu</Action>
        ]}))}/>
      <div className="bank-split padded">
        <span aria-live="polite">{filtered.length} giao dịch{max>1?' · Trang '+current+'/'+max:''}</span>
        {max>1&&<div className="row-actions"><button type="button" className="btn soft" disabled={current===1} onClick={()=>setPage(current-1)}>Trang trước</button>
          <button type="button" className="btn soft" disabled={current===max} onClick={()=>setPage(current+1)}>Trang sau</button></div>}
      </div>
    </Card>
    </>}
  </div>;
}
