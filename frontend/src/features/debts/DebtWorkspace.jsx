import {useState} from 'react';
import {downloadCsv} from '../../ui/csv.mjs';
import {Action,Card,DataTable} from '../../ui/components.jsx';
import {ageBands,agingRow,agingTotals,debtCsv,debtPartners,debtReference,displayDate,partyKey,statuses,typeLabel} from './debtAging.mjs';
import './debts.css';

const nf=new Intl.NumberFormat('vi-VN');
const money=value=>nf.format(value)+' ₫';
const numberCell=value=><span className="debt-number">{money(value)}</span>;
const rowLimit=15;
const normalize=value=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');

export function DebtWorkspace({rows,replies,period,branch,locked,canPayment}){
  const first=period+'-01';
  const last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
  const [at,setAt]=useState(last);
  const [type,setType]=useState('all');
  const [group,setGroup]=useState('open');
  const [partner,setPartner]=useState('');
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState('due');
  const [page,setPage]=useState(1);
  const [mode,setMode]=useState('docs');

  const aged=rows.map(row=>agingRow(row,at)).filter(Boolean);
  const typed=aged.filter(row=>type==='all'||row.kind===type);
  const match=normalize(query.trim());
  const groups=debtPartners(typed);
  const matching=typed.filter(row=>(!partner||partner===partyKey(row))&&
    normalize([row.id,row.ref,row.party,row.partyCode].filter(Boolean).join(' ')).includes(match)&&
    (group==='all'||(group==='open'?row.balance!==0:row.status===group||row.band===group)));
  const ordered=matching.slice().sort((a,b)=>sort==='balance'?b.balance-a.balance||a.id.localeCompare(b.id):
    sort==='recent'?b.date.localeCompare(a.date)||a.id.localeCompare(b.id):
      (a.dueDate??'9999').localeCompare(b.dueDate??'9999')||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const totals=agingTotals(typed),filteredTotals=agingTotals(matching);
  const amountByBand=new Map();
  for(const row of typed)amountByBand.set(row.band,(amountByBand.get(row.band)??0)+row.balance);
  const peak=Math.max(1,...amountByBand.values());
  const maxPage=Math.max(1,Math.ceil(ordered.length/rowLimit));
  const shownPage=Math.min(maxPage,page);
  const visible=ordered.slice((shownPage-1)*rowLimit,shownPage*rowLimit);
  const partners=debtPartners(matching);
  const partnerMax=Math.max(1,Math.ceil(partners.length/rowLimit));
  const partnerPage=Math.min(partnerMax,page);
  const visiblePartners=partners.slice((partnerPage-1)*rowLimit,partnerPage*rowLimit);
  const go=(setter,value)=>{setter(value);setPage(1);};
  function changeType(value){setType(value);setPartner('');setPage(1);}
  function openPartner(key){setMode('docs');go(setPartner,key);}
  function reset(){setGroup('open');setQuery('');setPartner('');setSort('due');setPage(1);}
  const count=mode==='docs'?ordered.length:partners.length;
  const pageCount=mode==='docs'?maxPage:partnerMax;
  const currentPage=mode==='docs'?shownPage:partnerPage;
  const cards=[
    {label:'Còn phải thu',value:agingTotals(aged.filter(row=>row.kind==='sell')).balance,kind:'sell',marker:'131'},
    {label:'Còn phải trả',value:agingTotals(aged.filter(row=>row.kind==='buy')).balance,kind:'buy',marker:'331'},
    {label:'Đã quá hạn',value:totals.overdue,group:'overdue',marker:'Quá hạn'},
    {label:'Đến hạn trong 7 ngày',value:totals.soon,group:'soon',marker:'0–7 ngày'}
  ];
  return <div className="stack debt-workspace">
    <header className="page-head"><div><h1>Công nợ</h1><p>{branch} · Kỳ {period.split('-').reverse().join('/')}</p></div>
      <button type="button" className="btn soft" disabled={matching.length===0} onClick={()=>downloadCsv('LEDO_CONG_NO_'+branch+'_'+at+'.csv',debtCsv(ordered,branch,at))}>Xuất chi tiết CSV</button>
    </header>
    <div className="card padded debt-scope">
      <div className="debt-switch" role="group" aria-label="Chiều công nợ">
        {[['all','Tất cả'],['sell','Phải thu'],['buy','Phải trả']].map(([value,label])=><button key={value} type="button"
          className={'btn '+(value===type?'primary':'soft')} aria-pressed={type===value} onClick={()=>changeType(value)}>{label}</button>)}
      </div>
      <form className="debt-date-form" onSubmit={event=>{
        event.preventDefault();
        go(setAt,new FormData(event.currentTarget).get('at'));
      }}>
        <label className="field debt-at">Ngày đối chiếu<input type="date" name="at" min={first} max={last} defaultValue={last} required/></label>
        <button type="submit" className="btn soft">Xem số dư</button>
      </form>
      <p className="subtle" aria-live="polite">Đang xem đến hết <strong>{displayDate(at)}</strong>. Chỉ tính chứng từ và thanh toán đã ghi sổ. Chọn một nhóm trên biểu đồ để lọc bảng.</p>
    </div>
    {locked&&<p className="notice">Kỳ đang khóa. Bạn có thể xem báo cáo và xuất dữ liệu.</p>}
    <div className="debt-cards">
      {cards.map(card=><button key={card.label} className="card debt-kpi" type="button"
        aria-pressed={card.kind?type===card.kind:group===card.group} onClick={()=>card.kind?changeType(card.kind):go(setGroup,group===card.group?'open':card.group)}>
        <span className={'chip '+(card.group==='overdue'?'wait':'neutral')}>{card.marker}</span>
        <span>{card.label}</span><strong>{money(card.value)}</strong>
      </button>)}
    </div>
    <Card title="Phân bố số dư theo hạn thanh toán">
      <div className="debt-bands padded">
        {ageBands.map(([band,label])=>{
          const value=amountByBand.get(band)??0;
          return <button className="debt-band" type="button" key={band} aria-pressed={group===band}
            onClick={()=>go(setGroup,group===band?'open':band)}>
            <span>{label}</span><span className="debt-band-track" aria-hidden="true">
              <span className={band.startsWith('overdue')?'debt-band-late':''} style={{width:Math.max(0,100*value/peak)+'%'}}/>
            </span><strong>{money(value)}</strong>
          </button>;
        })}
      </div>
    </Card>
    <Card title="Đối chiếu chi tiết">
      <div className="padded stack debt-controls">
        <div className="debt-switch" role="group" aria-label="Cách xem công nợ">
          {[['docs','Theo chứng từ'],['partners','Theo đối tác']].map(([value,label])=><button key={value} type="button"
            className={'btn '+(value===mode?'primary':'soft')} aria-pressed={mode===value} onClick={()=>go(setMode,value)}>{label}</button>)}
        </div>
        <div className="debt-filter">
          <label className="field">Tìm đối tác hoặc chứng từ<input type="search" value={query} onChange={event=>go(setQuery,event.target.value)} /></label>
          <label className="field">Đối tác<select value={partner} onChange={event=>go(setPartner,event.target.value)}>
            <option value="">Tất cả đối tác</option>
            {groups.map(row=><option key={row.key} value={row.key}>{row.code?row.code+' · ':''}{row.name}</option>)}
          </select></label>
          <label className="field">Tình trạng<select value={group} onChange={event=>go(setGroup,event.target.value)}>
            <option value="open">Còn số dư</option><option value="all">Tất cả chứng từ</option>
            <option value="overdue">Quá hạn mọi nhóm</option>
            {ageBands.map(([key,label])=><option key={key} value={key}>{label}</option>)}
            <option value="settled">{statuses.settled}</option>
          </select></label>
          {mode==='docs'&&<label className="field">Sắp xếp<select value={sort} onChange={event=>go(setSort,event.target.value)}>
            <option value="due">Hạn gần nhất trước</option><option value="balance">Số còn lại lớn nhất</option><option value="recent">Chứng từ mới nhất</option>
          </select></label>}
        </div>
        <div className="debt-result">
          <p aria-live="polite">{count} {mode==='docs'?'chứng từ':'đối tác'} · Còn lại <strong>{money(filteredTotals.balance)}</strong></p>
          <button type="button" className="btn soft" onClick={reset}>Đặt lại bộ lọc</button>
        </div>
      </div>
      {mode==='docs'?<DataTable columns={['Chứng từ','Đối tác','Loại','Ngày ghi','Hạn thanh toán','Tình trạng','Giá trị gốc','Đã phân bổ','Còn lại']}
        empty="Không có chứng từ phù hợp với ngày đối chiếu và bộ lọc." rows={visible.map(row=>({key:row.id,cells:[
          <button type="button" className="text-btn" data-act={'debt:row:'+encodeURIComponent(JSON.stringify({id:row.id,at}))}>{debtReference(row)}</button>,
          <span>{row.partyCode&&<small className="debt-code">{row.partyCode}</small>}{row.party}</span>,typeLabel(row.kind),displayDate(row.date),displayDate(row.dueDate),
          <span className={'chip '+(row.status==='overdue'||row.status==='soon'?'wait':row.status==='undated'?'neutral':'')}>{row.timing}</span>,
          numberCell(row.original),numberCell(row.paid),numberCell(row.balance)
        ]}))}/>:
        <DataTable columns={['Đối tác','Chứng từ còn số dư','Còn phải thu','Còn phải trả','Đã quá hạn']} empty="Không có đối tác phù hợp." rows={visiblePartners.map(row=>({key:row.key,cells:[
          <button type="button" className="text-btn" onClick={()=>openPartner(row.key)}>{row.code?row.code+' · ':''}{row.name}</button>,
          row.documents,numberCell(row.receive),numberCell(row.pay),numberCell(row.overdue)
        ]}))}/>}
      {pageCount>1&&<div className="debt-pagination padded"><button type="button" className="btn soft" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Trang trước</button>
        <span>Trang {currentPage} / {pageCount}</span><button type="button" className="btn soft" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>Trang sau</button></div>}
      {canPayment&&<div className="padded debt-action"><Action action="form:payment" style="soft" glyph="plus">Lập phiếu thu hoặc chi</Action></div>}
    </Card>
    {replies.length>0&&<Card title="Phản hồi từ đối tác">
      <DataTable columns={['Mã phản hồi','Hồ sơ','Số tại lúc phản hồi','Ý kiến']} rows={replies.map(row=>({key:row.id,cells:[
        row.id,row.ref,numberCell(row.balance),row.note
      ]}))}/>
    </Card>}
  </div>;
}
