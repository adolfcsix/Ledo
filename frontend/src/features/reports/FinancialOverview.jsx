import {useState} from 'react';
import {csvDocument, downloadCsv} from '../../ui/csv.mjs';
import {Action, Icon} from '../../ui/components.jsx';
import './overview.css';

const number = new Intl.NumberFormat('vi-VN');
const decimal = new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const money = value => number.format(value)+' ₫';
const fields = ['revenue','cogs','expense','inflow','outflow','posted'];
const kinds={buy:'Mua hàng',sell:'Bán hàng',receive:'Phiếu thu',pay:'Phiếu chi',payroll:'Lương tổng hợp',adjustIn:'Nhập thừa kiểm kê',adjustOut:'Xuất thiếu kiểm kê',varianceClear:'Xử lý chênh lệch kiểm kê'};
const date = value => value.split('-').reverse().join('/');
const metrics = {
  performance:{ title:'Doanh thu và giá vốn', keys:['revenue','cogs'], labels:['Doanh thu','Giá vốn'] },
  money:{ title:'Dòng tiền thu và chi', keys:['inflow','outflow'], labels:['Tiền vào','Tiền ra'] }
};

function combine(rows) {
  return Object.fromEntries(fields.map(key=>[key,rows.reduce((total,row)=>total+row[key],0)]));
}
function groupDays(days, span) {
  const groups=[];
  for(let index=0;index<days.length;index+=span){
    const subset=days.slice(index,index+span);
    const start=subset[0].date;
    const end=subset.at(-1).date;
    groups.push({start,end,label:span===1?start.slice(-2):start.slice(-2)+'–'+end.slice(-2),...combine(subset)});
  }
  return groups;
}
function upperTick(value) {
  if(value<=0)return 4;
  const power=10**Math.floor(Math.log10(value/4));
  return Math.ceil(value/(power*4))*power*4;
}

function MetricCard({label,value,detail,glyph,tone,unit}) {
  return (
    <div className="overview-metric">
      <div className="overview-metric-top"><span>{label}</span><span className={'overview-icon '+tone}><Icon name={glyph} /></span></div>
      <div><strong>{unit==='m'?decimal.format(value/1e6):number.format(value)}</strong><small>{unit==='m'?'triệu ₫':'₫'}</small></div>
      <p>{detail}</p>
    </div>
  );
}

function FinanceTable({headers,children}) {
  return <div className="overview-table"><table><thead><tr>{headers.map(header=><th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Trend({days,mode,setMode,span,setSpan,selected,setSelected,unit}) {
  const current=metrics[mode];
  const groups=groupDays(days,span);
  const max=upperTick(Math.max(0,...groups.flatMap(group=>current.keys.map(key=>group[key]))));
  const ticks=Array.from({length:5},(_,index)=>max*(4-index)/4);
  const scale=value=>unit==='m'?decimal.format(value/1e6):number.format(value);
  const barHeight=value=>Number((100*value/max).toFixed(1));
  return (
    <section className="overview-panel overview-trend" aria-labelledby="overview-trend">
      <div className="overview-panel-head">
        <div><h2 id="overview-trend">{current.title}</h2><p>Phát sinh đã ghi sổ · {unit==='m'?'triệu đồng':'đồng'}</p></div>
        <div className="overview-switch" role="group" aria-label="Nội dung biểu đồ">
          <button type="button" aria-pressed={mode==='performance'} onClick={()=>setMode('performance')}>Kinh doanh</button>
          <button type="button" aria-pressed={mode==='money'} onClick={()=>setMode('money')}>Dòng tiền</button>
        </div>
      </div>
      <div className="overview-legend">
        {current.labels.map((label,i)=><span key={label}><i className={i?'secondary':'primary'} />{label}</span>)}
        <label>Nhóm theo <select value={span} onChange={event=>{setSpan(Number(event.target.value));setSelected(null);}}><option value={7}>7 ngày</option><option value={1}>Ngày</option></select></label>
      </div>
      <div className="overview-graph-scroll">
        <div className={'overview-graph '+(span===1?'daily':'')}>
          <div className="overview-ticks" aria-hidden="true">{ticks.map(tick=><span key={tick}>{scale(tick)}</span>)}</div>
          <div className="overview-plot">
            <div aria-hidden="true" className="overview-gridlines">{ticks.map(tick=><i key={tick} />)}</div>
            <div className="overview-bars">
              {groups.map(group=>(
                <button type="button" className="overview-bar-group" key={group.start}
                  aria-pressed={selected?.start===group.start}
                  onClick={()=>setSelected(selected?.start===group.start?null:group)}
                  aria-label={group.label+' | '+current.labels.map((label,i)=>label+' '+money(group[current.keys[i]])).join(' | ')}
                  title={current.labels.map((label,i)=>label+': '+money(group[current.keys[i]])).join(' · ')}>
                  <span className="overview-columns" aria-hidden="true">
                    {current.keys.map((key,i)=><i key={key} className={i?'secondary':'primary'} style={{height:barHeight(group[key])+'%'}} />)}
                  </span>
                  <span className="overview-axis-label" aria-hidden="true">{group.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <details className="overview-data">
        <summary>Xem bảng số liệu biểu đồ</summary>
        <FinanceTable headers={['Khoảng ngày',...current.labels]}>
          {groups.map(group=><tr key={group.start}><td>{group.label}</td>{current.keys.map(key=><td key={key}>{money(group[key])}</td>)}</tr>)}
        </FinanceTable>
      </details>
    </section>
  );
}

function Debts({debt,canOpenDebts}) {
  return (
    <section className="overview-panel overview-debt">
      <div className="overview-panel-head"><div><h2>Công nợ</h2><p>Đối trừ trên chứng từ đã ghi sổ</p></div></div>
      {[[debt.receivable,'Phải thu','Đã thu'],[debt.payable,'Phải trả','Đã trả']].map(([row,title,settledLabel])=>{
        const percent=row.original?Math.min(100,Math.max(0,row.settled/row.original*100)):0;
        return (
          <div className="overview-debt-item" key={title}>
            <div><b>{title}</b><strong>{money(row.open)}</strong></div>
            <div className="overview-progress" aria-hidden="true"><span style={{width:percent+'%'}} /></div>
            <p>{settledLabel} {money(row.settled)} / {money(row.original)}</p>
            <p>{row.count} chứng từ còn số dư</p>
          </div>
        );
      })}
      {canOpenDebts&&<Action action="go:debts" style="soft">Mở phân tích tuổi nợ</Action>}
    </section>
  );
}

const overviewSections={trend:'Biểu đồ',debts:'Công nợ',reconcile:'Đối chiếu phát sinh',balances:'Số dư và tồn kho'};
const defaultSections=Object.keys(overviewSections);
function readSections(key){
  try{
    const value=JSON.parse(window.localStorage.getItem(key));
    if(Array.isArray(value))return defaultSections.filter(section=>value.includes(section));
  }catch{}
  return defaultSections;
}

export function FinancialOverview({report,period,branch,preferenceScope,company,documents,canOpenDocuments,canOpenDebts,children}) {
  const [mode,setMode]=useState('performance');
  const [span,setSpan]=useState(7);
  const [selected,setSelected]=useState(null);
  const [unit,setUnit]=useState('m');
  const storageKey='ledo.overview-sections:'+preferenceScope;
  const [sections,setSections]=useState(()=>readSections(storageKey));
  const showing=section=>sections.includes(section);
  function saveSections(next){
    setSections(next);
    try{window.localStorage.setItem(storageKey,JSON.stringify(next));}catch{}
  }
  const {overview,summary}=report;
  const selectedDays=selected?overview.days.filter(day=>day.date>=selected.start&&day.date<=selected.end):overview.days;
  const totals=combine(selectedDays);
  const postedDocs=canOpenDocuments?documents.filter(doc=>doc.status==='posted'&&doc.date.startsWith(period)&&
    (!selected||doc.date>=selected.start&&doc.date<=selected.end)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)):[];
  const periodName=period.split('-').reverse().join('/');
  function exportTrend(){
    const from=selected?.start??overview.days[0]?.date;
    const to=selected?.end??overview.days.at(-1)?.date;
    const {keys,labels}=metrics[mode];
    downloadCsv('LEDO_Tong_quan_'+from+'_'+to+'.csv',csvDocument(
      ['Chi nhánh','Ngày',...labels.map(label=>label+' (VND)')],
      selectedDays.map(day=>[branch,day.date,...keys.map(key=>day[key])])));
  }
  return (
    <div className="financial-overview">
      <header className="overview-title">
        <div><h1>Tổng quan tài chính</h1><p>{branch} · Kỳ {periodName} · {report.locked?'Đã khóa sổ':'Đang mở'}</p></div>
        <div className="overview-tools">
          {!company&&<span className="overview-sample">Dữ liệu minh họa</span>}
          <label>Đơn vị <select value={unit} onChange={event=>setUnit(event.target.value)}><option value="m">Triệu ₫</option><option value="vnd">VNĐ</option></select></label>
        </div>
      </header>
      <details className="overview-customize">
        <summary>Tùy chỉnh tổng quan</summary>
        <fieldset><legend>Hiển thị trên bàn làm việc tài chính</legend>
          {Object.entries(overviewSections).map(([id,label])=><label key={id}>
            <input type="checkbox" checked={showing(id)} onChange={event=>saveSections(event.target.checked?
              [...sections,id]:sections.filter(section=>section!==id))}/>{label}
          </label>)}
        </fieldset>
        <button type="button" className="btn quiet" onClick={()=>saveSections(defaultSections)}>Khôi phục bố cục</button>
      </details>
      <div className="overview-metrics">
        <MetricCard label="Doanh thu" value={summary.revenue} detail={summary.otherIncome?'Thu nhập khác '+money(summary.otherIncome):'Phát sinh tài khoản 511'} glyph="trend" tone="green" unit={unit} />
        <MetricCard label="Lãi gộp" value={summary.profit} detail="Doanh thu trừ giá vốn" glyph="reports" tone="sage" unit={unit} />
        <MetricCard label="Tiền cuối kỳ" value={overview.cash.closing} detail="Tiền mặt và tiền gửi" glyph="wallet" tone="gold" unit={unit} />
        <MetricCard label="Công nợ phải thu" value={summary.ar} detail={overview.debt.receivable.count+' chứng từ còn số dư'} glyph="people" tone="blue" unit={unit} />
      </div>
      {(showing('trend')||showing('debts'))&&<div className={'overview-grid'+(showing('trend')&&showing('debts')?'':' overview-single')}>
        {showing('trend')&&<Trend {...{days:overview.days,mode,setMode,span,setSpan,selected,setSelected,unit}} />}
        {showing('debts')&&<Debts debt={overview.debt} canOpenDebts={canOpenDebts} />}
      </div>}
      {(showing('reconcile')||showing('balances'))&&<div className={'overview-grid overview-bottom'+(showing('reconcile')&&showing('balances')?'':' overview-single')}>
        {showing('reconcile')&&<section className="overview-panel">
          <div className="overview-panel-head"><div><h2>Đối chiếu phát sinh</h2><p>{selected?date(selected.start)+' – '+date(selected.end):'Toàn kỳ '+periodName}</p></div>
            <div className="row-actions">
              {selected&&<button type="button" className="btn soft" onClick={()=>setSelected(null)}>Xem toàn kỳ</button>}
              <button type="button" className="btn" onClick={exportTrend} disabled={!selectedDays.length}>Xuất CSV {mode==='money'?'dòng tiền':'kinh doanh'}</button>
            </div>
          </div>
          <dl className="overview-reconcile">
            {[
              ['Doanh thu',money(totals.revenue)],['Giá vốn',money(totals.cogs)],['Lãi gộp',money(totals.revenue-totals.cogs)],
              ['Chi phí quản lý',money(totals.expense)],['Tiền vào',money(totals.inflow)],['Tiền ra',money(totals.outflow)],
              ['Lưu chuyển tiền thuần',money(totals.inflow-totals.outflow)],['Chứng từ đã ghi',number.format(totals.posted)]
            ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>}
        {showing('balances')&&<section className="overview-panel">
          <div className="overview-panel-head"><div><h2>Số dư và tồn kho</h2><p>Số cuối kỳ theo phạm vi đang mở</p></div></div>
          <dl className="overview-reconcile">
            {[
              ['Tiền đầu kỳ',money(overview.cash.opening)],['Tiền mặt',money(overview.cash.fund)],['Tiền gửi',money(overview.cash.bank)],
              ['Trị giá tồn kho',money(overview.inventory.value)],[overview.inventory.itemCount==null?'Số lượng còn trong kho':'Số mã hàng còn tồn',number.format(overview.inventory.itemCount??overview.inventory.units)]
            ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>}
      </div>}
      {children}
      {canOpenDocuments&&(
        <section className="overview-panel">
          <div className="overview-panel-head"><div><h2>Chứng từ đã ghi sổ</h2><p>{postedDocs.length} kết quả · Hiển thị tối đa 10 chứng từ gần nhất</p></div></div>
          <FinanceTable headers={['Ngày hạch toán','Chứng từ','Nghiệp vụ','Đối tác','Giá trị']}>
            {postedDocs.slice(0,10).map(doc=><tr key={doc.id}><td>{date(doc.date)}</td><td><Action style="soft" action={'doc:'+doc.id}>{doc.id}</Action></td>
              <td>{kinds[doc.kind]}</td><td>{doc.party}</td><td>{money(doc.total)}</td></tr>)}
            {!postedDocs.length&&<tr><td colSpan={5}>Chưa có chứng từ trong khoảng đang chọn.</td></tr>}
          </FinanceTable>
        </section>
      )}
    </div>
  );
}
