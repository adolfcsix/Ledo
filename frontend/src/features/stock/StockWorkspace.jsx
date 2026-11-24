import {useState} from 'react';
import {Card,DataTable} from '../../ui/components.jsx';
import {downloadCsv} from '../../ui/csv.mjs';
import {displayDate} from '../debts/debtAging.mjs';
import {stockCsv,stockHistory} from './stockHistory.mjs';
import './stock.css';

const number=new Intl.NumberFormat('vi-VN');
const money=value=>number.format(value)+' ₫';
const quantities=['Tồn đầu','Nhập','Xuất','Tồn cuối'];
const fold=value=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');
const breaks=report=>[report.opening,report.received,report.issued,report.closing];

function Quantity({balance,unit,withValue}){
  return <span className="stock-number"><strong>{number.format(balance.units)}{unit?' '+unit:''}</strong>
    {withValue&&<small>{money(balance.value)}</small>}</span>;
}

export function StockWorkspace({period,branch,model}){
  const start=period+'-01';
  const last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
  const [range,setRange]=useState({from:start,to:last});
  const [search,setSearch]=useState('');
  const [item,setItem]=useState('');
  const [page,setPage]=useState(1);
  const [error,setError]=useState('');
  const reports=stockHistory(model,range.from,range.to);
  const selected=reports.find(report=>report.item.id===item);
  const query=fold(search.trim());
  const visible=reports.filter(row=>fold(row.item.code+' '+row.item.name).includes(query));
  const size=20;
  const right=Math.max(1,Math.ceil((selected?selected.rows.length:visible.length)/size));
  const current=Math.min(page,right);
  const slice=rows=>rows.slice((current-1)*size,current*size);
  const shown=selected?[selected]:visible;
  function choose(value){setItem(value);setPage(1);}
  function apply(event){
    event.preventDefault();
    const form=new FormData(event.currentTarget),from=form.get('from'),to=form.get('to');
    if(from>to){setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');return;}
    setError('');setRange({from,to});setPage(1);
  }
  function exportCurrent(){
    const type=selected?'THE_KHO_'+selected.item.code:'NHAP_XUAT_TON';
    downloadCsv('LEDO_'+type+'_'+branch+'_'+range.to+'.csv',
      stockCsv(model,shown,range.from,range.to,Boolean(selected)));
  }
  return <div className="stack stock-workspace">
    <header className="page-head">
      <div><h1>Thẻ kho và nhập xuất tồn</h1><p>{model.warehouse} · {branch} · Kỳ {period.split('-').reverse().join('/')}</p></div>
      <button type="button" className="btn soft" onClick={exportCurrent} disabled={shown.length===0}>Xuất CSV</button>
    </header>
    <section className="card padded stack">
      <form className="stock-date-form" onSubmit={apply}>
        <label className="field">Từ ngày<input type="date" min={start} max={last} defaultValue={start} name="from" required/></label>
        <label className="field">Đến ngày<input type="date" min={start} max={last} defaultValue={last} name="to" required/></label>
        <button type="submit" className="btn primary">Xem số liệu</button>
      </form>
      {error&&<p className="notice warn" role="alert">{error}</p>}
      <div className="stock-filters">
        <label className="field">Mặt hàng<select value={item} onChange={event=>choose(event.target.value)}>
          <option value="">Tổng hợp theo mặt hàng</option>
          {model.items.map(entry=><option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}
        </select></label>
        {!selected&&<label className="field">Tìm mã hoặc tên hàng<input type="search" value={search} onChange={event=>{
          setSearch(event.target.value);setPage(1);
        }}/></label>}
      </div>
      <p className="subtle" aria-live="polite">Đang xem {displayDate(range.from)} – {displayDate(range.to)}. Số liệu lấy từ chứng từ đã ghi sổ.</p>
    </section>
    {selected?<>
      <div className="stock-metrics">
        {breaks(selected).map((balance,i)=><div className="card padded" key={quantities[i]}>
          <span>{quantities[i]}</span><Quantity {...{balance,unit:selected.item.unit,withValue:model.withValue}}/>
        </div>)}
      </div>
      <Card title={selected.item.code+' · '+selected.item.name}>
        <div className="stock-summary padded">
          <p className="subtle">{selected.rows.length} chứng từ · Đơn vị {selected.item.unit}{model.withValue?' · Trị giá xuất theo giá vốn đã ghi':''}</p>
          <button type="button" className="btn soft" onClick={()=>choose('')}>Về bảng tổng hợp</button>
        </div>
        <DataTable columns={['Ngày hạch toán','Chứng từ','Đối tác','Nhập','Xuất','Tồn sau giao dịch']}
          empty="Mặt hàng không có phát sinh trong khoảng đã chọn." rows={slice(selected.rows).map(row=>({
            key:row.id,cells:[
              displayDate(row.date),<span>{model.withValue?<button type="button" data-act={'doc:'+row.id} className="text-btn">{row.id}</button>:row.id}
                {row.kind.startsWith('adjust')&&<small className="stock-movement-label">{row.incoming?'Nhập thừa kiểm kê':'Xuất thiếu kiểm kê'}</small>}</span>,
              row.party,
              row.incoming?<Quantity balance={{units:row.quantity,value:row.value}} withValue={model.withValue}/>:'—',
              !row.incoming?<Quantity balance={{units:row.quantity,value:row.value}} withValue={model.withValue}/>:'—',
              <Quantity balance={row.after} withValue={model.withValue}/>
            ]
          }))}/>
      </Card>
    </>:<Card title="Tổng hợp nhập xuất tồn">
      <div className="padded stock-summary"><p className="subtle" aria-live="polite">{visible.length} mặt hàng · Chọn mã hàng để mở thẻ kho.</p></div>
      <DataTable columns={['Mã hàng','Tên hàng','Đơn vị',...quantities]} empty="Không có mặt hàng phù hợp."
        rows={slice(visible).map(report=>({key:report.item.id,cells:[
          <button type="button" className="text-btn" onClick={()=>choose(report.item.id)}>{report.item.code}</button>,
          report.item.name,report.item.unit,...breaks(report).map((balance,i)=><Quantity key={i} balance={balance} withValue={model.withValue}/>)
        ]}))}/>
      {model.withValue&&visible.length>0&&<div className="stock-total padded">
        <span>Tổng trị giá của {visible.length} mặt hàng đang lọc</span>
        {quantities.map((label,i)=><span key={label}>{label} <strong>{money(visible.reduce((sum,row)=>sum+breaks(row)[i].value,0))}</strong></span>)}
      </div>}
    </Card>}
    {right>1&&<div className="row-actions stock-pages">
      <button type="button" className="btn soft" disabled={current===1} onClick={()=>setPage(current-1)}>Trang trước</button><span>Trang {current}/{right}</span>
      <button type="button" className="btn soft" disabled={current===right} onClick={()=>setPage(current+1)}>Trang sau</button>
    </div>}
  </div>;
}
