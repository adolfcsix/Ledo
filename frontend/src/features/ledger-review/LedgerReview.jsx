import {useEffect, useRef, useState} from 'react';
import {Action, Card, DataTable} from '../../ui/components.jsx';
import {request} from '../../api/client.js';
import {csvDocument, downloadCsv} from '../../ui/csv.mjs';
import './ledgerReview.css';

const fmt=new Intl.NumberFormat('vi-VN');
const money=value=>fmt.format(value)+' ₫';
const dateLabel=value=>value?.split('-').reverse().join('/')??'—';
const perPage=20;
const columns=['Nguồn','Mã tham chiếu','Ngày','Diễn giải','Nợ','Có'];
const endOfMonth=period=>{
  const [year,month]=period.split('-').map(Number);
  return period+'-'+new Date(Date.UTC(year,month,0)).getUTCDate();
};

export function LedgerReview({view}){
  const max=endOfMonth(view.period);
  const [asOf,setAsOf]=useState(max);
  const [group,setGroup]=useState('');
  const [onlyFlagged,setOnlyFlagged]=useState(false);
  const [source,setSource]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [retry,setRetry]=useState(0);
  const [loaded,setLoaded]=useState(null);
  const [lastReport,setLastReport]=useState(null);
  const detailPanel=useRef(null);
  const key=asOf+'/'+group+'/'+retry;

  useEffect(()=>{
    if(!asOf)return;
    let current=true;
    const params=new URLSearchParams({date:asOf,group});
    request('/api/ledger-review?'+params).then(model=>{
      if(!current)return;
      if(model.branch!==view.actor.branch||model.revision!==view.revision){
        setLoaded({key,error:'Phiên hoặc dữ liệu đã thay đổi. Làm mới không gian làm việc để xem lại.'});
      }else{setLoaded({key,model});setLastReport(model);}
    },error=>{if(current)setLoaded({key,error:error.message});});
    return ()=>{current=false;};
  },[asOf,group,retry,key,view.actor.branch,view.revision]);

  const current=loaded?.key===key?loaded:null;
  const model=current?.model??(lastReport?.date===asOf?lastReport:asOf===max?view.ledgerReview:null);
  const evidence=current?.model?.evidence??[];
  const counts=model?.comparisons.filter(row=>row.difference!==0).length??0;
  const signals=model?.signals.filter(row=>row.count>0).length??0;
  const detail=model&&[...model.comparisons,...model.signals].find(row=>row.id===group);
  useEffect(()=>{
    if(group)detailPanel.current?.focus();
  },[group]);
  function choose(id){
    setGroup(id);setQuery('');setSource('');setPage(1);
  }
  const filtered=evidence.filter(row=>(!source||row.source===source)&&
    [row.reference,row.note].join(' ').toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')));
  const pages=Math.max(1,Math.ceil(filtered.length/perPage));
  const currentPage=Math.min(page,pages);
  const showDetails=(row,label)=><button type="button" className="btn soft" aria-pressed={group===row.id}
    onClick={()=>choose(row.id)}>{label}</button>;
  function exportEvidence(){
    downloadCsv('LEDO_Doi_chieu_'+view.actor.branch+'_'+asOf+'_'+group+'.csv',
      csvDocument(['Chi nhánh','Ngày đối chiếu',...columns,'Trong tổng đối chiếu'],filtered.map(row=>
        [view.actor.branch,asOf,row.source,row.reference,row.date,row.note,row.debit,row.credit,row.excluded?'Không':'Có'])));
  }
  return <div className="ledger-review stack">
    <header className="review-head">
      <div><h1>Kiểm tra chứng từ và sổ sách</h1><p>{view.actor.branchName} · Kỳ {view.period.split('-').reverse().join('/')}</p></div>
      {view.nav.includes('closing')&&<Action action="go:closing" style="soft" glyph="lock">Mở chốt kỳ</Action>}
    </header>
    <section className="review-toolbar" aria-label="Phạm vi đối chiếu">
      <label className="field">Đối chiếu đến hết ngày<input type="date" min={view.period+'-01'} max={max}
        value={asOf} onChange={event=>{setAsOf(event.target.value);setPage(1);}} /></label>
      <label className="review-check"><input type="checkbox" checked={onlyFlagged}
        onChange={event=>setOnlyFlagged(event.target.checked)} /> Chỉ hiện mục cần rà</label>
      <p>Gồm số dư đầu kỳ và phát sinh đã ghi sổ đến hết ngày đã chọn.</p>
    </section>
    {!asOf&&<p className="notice">Chọn ngày đối chiếu trong kỳ.</p>}
    {asOf&&!current&&<p className="subtle" role="status">Đang tải số liệu…</p>}
    {current?.error&&<div className="notice warn review-error" role="alert">{current.error}
      <button type="button" className="btn" onClick={()=>setRetry(retry+1)}>Thử lại</button></div>}
    {model&&!current?.error&&<>
      <div className="review-results" aria-label="Kết quả đối chiếu">
        <div><span>Ngày đối chiếu</span><strong>{dateLabel(asOf)}</strong></div>
        <div><span>Phép kiểm có chênh lệch</span><strong>{counts} / {model.comparisons.length}</strong></div>
        <div><span>Nhóm cảnh báo có phát sinh</span><strong>{signals} / {model.signals.length}</strong></div>
      </div>
      <Card title="Đối chiếu sổ cái và sổ chi tiết">
        <DataTable columns={['Phép đối chiếu','Nguồn thứ nhất','Nguồn thứ hai','Chênh lệch','Tra cứu']}
          empty="Không có phép đối chiếu nào vướng trong phạm vi đã chọn."
          rows={model.comparisons.filter(row=>!onlyFlagged||row.difference!==0).map(row=>({key:row.id,cells:[
            row.title,<span>{row.leftLabel}<strong className="cell-note">{money(row.left)}</strong></span>,
            <span>{row.rightLabel}<strong className="cell-note">{money(row.right)}</strong></span>,
            <span className={'chip '+(row.difference?'wait':'')}>{row.difference?money(row.difference):'Khớp'}</span>,
            showDetails(row,'Xem số liệu')
          ]}))}/>
      </Card>
      <Card title="Dấu hiệu cần rà">
        <DataTable columns={['Dấu hiệu','Số mục','Tra cứu']} empty="Không có dấu hiệu cần rà trong phạm vi đã chọn."
          rows={model.signals.filter(row=>!onlyFlagged||row.count>0).map(row=>({key:row.id,cells:[
            row.label,fmt.format(row.count),showDetails(row,'Xem nguồn')
          ]}))}/>
      </Card>
      {detail&&<section ref={detailPanel} tabIndex={-1} aria-label={detail.title??detail.label}><Card title={detail.title??detail.label}>
        <div className="padded review-evidence">
          <div className="row-actions">
            {detail.route&&view.nav.includes(detail.route)&&<Action action={detail.focus?'account:'+detail.focus:'go:'+detail.route}>Mở sổ nguồn</Action>}
            <button type="button" className="btn soft" onClick={exportEvidence} disabled={!filtered.length}>Xuất CSV</button>
            <button type="button" className="btn quiet" onClick={()=>choose('')}>Đóng chi tiết</button>
          </div>
          {!current?.model?<p className="subtle">Đang tải chi tiết…</p>:<>
            {evidence.some(row=>row.excluded)&&<p className="notice warn">Dòng thiếu mã danh mục được ghi rõ và loại khỏi tổng thẻ kho theo mã.</p>}
            <div className="review-evidence-filters">
              <label className="field">Tìm mã hoặc diễn giải<input type="search" value={query}
                onChange={event=>{setQuery(event.target.value);setPage(1);}} /></label>
              <label className="field">Nguồn<select value={source} onChange={event=>{setSource(event.target.value);setPage(1);}}>
                <option value="">Tất cả nguồn</option>
                {[...new Set(evidence.map(row=>row.source))].map(name=><option key={name}>{name}</option>)}
              </select></label>
            </div>
            <DataTable columns={columns} empty="Không có dòng nguồn phù hợp."
              rows={filtered.slice((currentPage-1)*perPage,currentPage*perPage).map((row,index)=>({key:currentPage+'-'+index,cells:[
                row.source,row.document?<Action action={'doc:'+row.document} style="quiet">{row.reference}</Action>:row.reference,
                dateLabel(row.date),row.note,money(row.debit),money(row.credit)
              ]}))}/>
            <nav className="row-actions" aria-label="Trang chi tiết">
              <button className="btn" type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Trước</button>
              <span className="subtle">{fmt.format(filtered.length)} dòng · Trang {currentPage}/{pages}</span>
              <button className="btn" type="button" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Sau</button>
            </nav>
          </>}
        </div>
      </Card></section>}
    </>}
    {view.closing&&<Card title="Việc còn vướng trước chốt kỳ (toàn kỳ hiện tại)">
      <DataTable columns={['Nhóm','Số mục','Nơi xử lý']} rows={view.closing.checks.map(row=>({key:row.name,cells:[
        row.name,fmt.format(row.count),view.nav.includes(row.to)?<Action action={'go:'+row.to}>Mở nơi xử lý</Action>:'—'
      ]}))}/>
    </Card>}
  </div>;
}
