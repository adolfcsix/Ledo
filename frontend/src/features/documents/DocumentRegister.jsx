import {useState} from 'react';
import {Action, DataTable} from '../../ui/components.jsx';
import {csvDocument,downloadCsv} from '../../ui/csv.mjs';
import {filters} from '../workdesk/workdesk.mjs';
import './register.css';

const format=new Intl.NumberFormat('vi-VN');
const money=value=>format.format(value)+' ₫';
const date=value=>value?.split('-').reverse().join('/')??'—';
const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Mark}/gu,'').toLowerCase().replaceAll('đ','d');
const pageSize=25;

export function DocumentRegister({view,filter,setFilter,statuses,kinds,actions}){
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [sort,setSort]=useState('newest');
  const [page,setPage]=useState(1);
  const records=view.documents??[];
  const statusesToShow=[['all','Tất cả'],['draft','Nháp'],['review','Chờ duyệt'],['approved','Đã duyệt'],['posted','Đã ghi sổ'],['void','Đã hủy']];
  const preset=filters.documents[filter];
  const kindOptions=[...new Set(records.map(row=>row.kind))];
  const invalid=from&&to&&from>to;
  const words=normalize(query).trim().split(/\s+/u).filter(Boolean);
  const matching=invalid?[]:records.filter(row=>(preset?preset[1](row,view):filter==='all'||row.status===filter)&&
    (!kind||row.kind===kind)&&(!from||row.date>=from)&&(!to||row.date<=to)&&
    words.every(word=>normalize([row.id,row.partyCode,row.party,row.description].join(' ')).includes(word)));
  matching.sort((a,b)=>{
    const byDate=b.date.localeCompare(a.date)||b.id.localeCompare(a.id,'vi',{numeric:true});
    return sort==='amount'?b.total-a.total||byDate:sort==='oldest'?-byDate:byDate;
  });
  const pages=Math.max(1,Math.ceil(matching.length/pageSize));
  const current=Math.min(page,pages);
  const visible=matching.slice((current-1)*pageSize,current*pageSize);
  const change=setter=>event=>{setter(event.target.value);setPage(1);};
  function clear(){
    setQuery('');setKind('');setFrom('');setTo('');setSort('newest');setPage(1);setFilter('all');
  }
  function exportRows(){
    downloadCsv('LEDO_Chung_tu_'+view.actor.branch+'_'+view.period+'.csv',csvDocument(
      ['Mã phiếu','Ngày hạch toán','Nghiệp vụ','Đối tác','Giá trị (VND)','Trạng thái'],
      matching.map(row=>[row.id,row.date,kinds[row.kind],row.party,row.total,statuses[row.status]])));
  }
  return <div className="document-register">
    <header className="register-header">
      <div><h1>Chứng từ</h1><p>{view.actor.branchName} · Kỳ {view.period.split('-').reverse().join('/')}</p></div>
      <div className="row-actions">{actions}</div>
    </header>
    <section className="register-sheet" aria-label="Sổ chứng từ">
      <div className="register-tabs" aria-label="Trạng thái chứng từ">
        {statusesToShow.map(([id,label])=><button type="button" key={id} aria-pressed={filter===id}
          onClick={()=>{setFilter(id);setPage(1);}}>{label}<span>{id==='all'?records.length:records.filter(row=>row.status===id).length}</span></button>)}
      </div>
      {preset&&<p className="register-preset">Đang xem: <strong>{preset[0]}</strong></p>}
      <div className="register-tools">
        <label className="field">Tìm chứng từ<input type="search" placeholder="Mã phiếu, đối tác, diễn giải" value={query} onChange={change(setQuery)}/></label>
        <label className="field">Nghiệp vụ<select value={kind} onChange={change(setKind)}><option value="">Tất cả</option>
          {kindOptions.map(id=><option key={id} value={id}>{kinds[id]}</option>)}</select></label>
        <label className="field">Từ ngày<input type="date" min={view.period+'-01'} value={from} onChange={change(setFrom)}/></label>
        <label className="field">Đến ngày<input type="date" min={view.period+'-01'} value={to} onChange={change(setTo)}/></label>
        <label className="field">Sắp xếp<select value={sort} onChange={change(setSort)}>
          <option value="newest">Ngày mới nhất</option><option value="oldest">Ngày cũ nhất</option><option value="amount">Giá trị cao nhất</option>
        </select></label>
      </div>
      <div className="register-summary"><span role="status">{format.format(matching.length)} chứng từ</span>
        <div className="row-actions"><button type="button" className="btn quiet" onClick={clear}>Xóa bộ lọc</button>
          <button type="button" className="btn" disabled={!matching.length} onClick={exportRows}>Xuất CSV</button></div></div>
      <DataTable columns={['Mã phiếu','Ngày hạch toán','Nghiệp vụ','Đối tác','Giá trị','Trạng thái']}
        empty={invalid?'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.':'Không có chứng từ phù hợp.'}
        rows={visible.map(row=>({key:row.id,cells:[
          <Action action={'doc:'+row.id} style="quiet register-reference">{row.id}</Action>,date(row.date),kinds[row.kind],row.party,
          <span className="register-amount">{money(row.total)}</span>,
          <span className={'register-state state-'+row.status}>{statuses[row.status]}</span>
        ]}))}/>
      <nav className="register-summary" aria-label="Phân trang chứng từ">
        <button type="button" className="btn" disabled={current===1} onClick={()=>setPage(current-1)}>Trước</button>
        <span>Trang {current} / {pages}</span>
        <button type="button" className="btn" disabled={current===pages} onClick={()=>setPage(current+1)}>Sau</button>
      </nav>
    </section>
  </div>;
}
