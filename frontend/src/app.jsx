import {DocumentRegister} from './features/documents/DocumentRegister.jsx';
import {LedgerReview} from './features/ledger-review/LedgerReview.jsx';
import {maySetPostingDate, postingDateInPeriod, postingDateKey, preferredPostingDate} from './features/workspace-settings/postingDate.mjs';
import {documentBatchOperations} from '../../shared/documentBatch.mjs';
import {batchSource, batchButton, batchResultTable, showDocumentBatch} from './features/document-batch/DocumentBatch.js';
import {showUtilities} from './features/utilities/UtilitiesPanel.js';
import {Workdesk} from './features/workdesk/Workdesk.jsx';
import {desks, filters, pendingDelivery} from './features/workdesk/workdesk.mjs';
import {varianceMethods} from '../../backend/modules/accounting/varianceSettlement.mjs';
import {StockWorkspace} from './features/stock/StockWorkspace.jsx';
import {BankWorkspace} from './features/bank/BankWorkspace.jsx';
import {DebtWorkspace} from './features/debts/DebtWorkspace.jsx';
import {agingRow,debtReference as debtLabel,typeLabel} from './features/debts/debtAging.mjs';
import {OpeningBalances} from './features/opening/OpeningBalances.jsx';
import {Catalog} from './features/catalog/Catalog.jsx';
import {FinancialOverview} from './features/reports/FinancialOverview.jsx';
import {Action} from './ui/components.jsx';
import {createRoot} from 'react-dom/client';
import {Brand, Sidebar, TopBar} from './layout/WorkspaceChrome.jsx';
import {SignIn} from './features/accounts/SignIn.jsx';
import {AccountDirectory} from './features/accounts/AccountDirectory.jsx';
import '../assets/style.css';
import './tailwind.css';
import {request} from './api/client.js';
import {icon} from './ui/icons.js';
import {esc, num, btn, link, section, heading, table, metrics, notice, operate} from './ui/render.js';

const navigation={
  home:['Bàn làm việc','home'],catalog:['Danh mục','stock'],opening:['Số dư đầu kỳ','reports'],orders:['Mua hàng và bán hàng','stock'],documents:['Chứng từ','doc'],invoices:['Hóa đơn đầu vào','doc'],bank:['Đối chiếu ngân hàng','bank'],
  debts:['Công nợ','people'],warehouse:['Giao nhận và kiểm kê','stock'],stock:['Thẻ kho và nhập xuất tồn','stock'],cash:['Quỹ tiền mặt','wallet'],approvals:['Hồ sơ phê duyệt','check'],
  reports:['Sổ và báo cáo','reports'],'ledger-review':['Kiểm tra sổ sách','check'],closing:['Chốt kỳ','lock'],management:['Tổng quan tài chính','trend'],evidence:['Bằng chứng và giải trình','doc'],
  administration:['Tài khoản và phạm vi','settings'],payroll:['Bảng lương mẫu','people'],'payroll-summary':['Lương tổng hợp','doc'],
  portal:['Hồ sơ được chia sẻ','link'],integration:['Sự kiện tích hợp mẫu','history']
};
const kinds={buy:'Mua chịu',sell:'Bán chịu',receive:'Phiếu thu',pay:'Phiếu chi',payroll:'Lương tổng hợp',adjustIn:'Nhập thừa kiểm kê',adjustOut:'Xuất thiếu kiểm kê',varianceClear:'Xử lý chênh lệch kiểm kê'};
const statuses={draft:'Bản nháp',returned:'Đã trả lại',review:'Chờ duyệt',approved:'Đã duyệt',posted:'Đã ghi sổ',void:'Đã hủy',applied:'Đã áp dụng',submitted:'Đã chuyển',prepared:'Chờ ghi sổ',verified:'Đã xác minh'};
const accountLabels={'111':'Tiền mặt','112':'Tiền gửi ngân hàng','131':'Phải thu khách hàng','1381':'Tài sản thiếu chờ xử lý','1388':'Phải thu khác','156':'Hàng hóa','331':'Phải trả nhà cung cấp','3381':'Tài sản thừa chờ xử lý','3388':'Phải trả khác','711':'Thu nhập khác','411':'Vốn đầu kỳ','511':'Doanh thu bán hàng','632':'Giá vốn hàng bán','334':'Phải trả người lao động','642':'Chi phí quản lý'};
const side=document.querySelector('#side'),top=document.querySelector('#top'),main=document.querySelector('#main'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const sideRoot=createRoot(side), topRoot=createRoot(top);
let accountRoot;
let standalone=false;
const nf=new Intl.NumberFormat('vi-VN');
const df=new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'});
const fmt=value=>nf.format(value??0);
const periodLabel=()=>view?.period?.split('-').reverse().join('/')??'11/2026';
const itemLabel=()=>view?.inventoryItem??'Bình giữ nhiệt';
const localMonth=()=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const money=value=>fmt(value)+' ₫';
const when=value=>value?df.format(new Date(value)):'—';
const date=value=>value?.split('-').reverse().join('/')??'—';
const chip=(label,type='')=>'<span class="chip '+type+'">'+esc(label)+'</span>';
const status=value=>chip(statuses[value]??value,['review','returned'].includes(value)?'wait':value==='draft'?'neutral':'');
let view=null;
let page='home';
let filter='all';
let activeForm=null;
let busy=false;
let toastTimer;
const has=cap=>view.caps.includes(cap);
const can=cap=>has(cap)&&!view.locked;
const rows=key=>view[key]??[];

function notify(message){
  toast.textContent=message;
  toast.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.hidden=true,3800);
}
function accessible(next){return next==='home'||view.nav.includes(next);}
const extraFilters = {administration:['roles'],warehouse:['counts'],cash:['counts'],bank:['unlinked'],documents:['draft','review','approved','posted','returned','void']};
function routeFilter(route,value){
  return Object.hasOwn(filters[route]??{},value)||(Object.hasOwn(extraFilters,route)&&extraFilters[route].includes(value))?value:'all';
}
function readRoute(hash){
  const [route,value]=hash.split('/');
  return [route,routeFilter(route,value)];
}
function go(next,nextFilter='all'){
  if(!accessible(next)){notify('Vai trò này không mở được màn hình đã chọn.');return;}
  if(dialog.open)dialog.close();
  filter=routeFilter(next,nextFilter);page=next;
  side.classList.remove('open');
  history.replaceState(null,'','#'+next+(filter==='all'?'':'/'+filter));
  render();main.focus({preventScroll:true});window.scrollTo(0,0);
}
function hideModal(){if(dialog.open)dialog.close();activeForm=null;}
async function mutate(action,data={},control,revision=view.revision){
  if(busy)return;
  busy=true;if(control)control.disabled=true;
  try{
    const next=await request('/api/actions',{action,data,revision});
    view=next;hideModal();render();
    notify(next.result?.message??'Đã cập nhật');
    return next.result;
  }catch(error){
    if(dialog.open&&dialog.querySelector('.error'))dialog.querySelector('.error').textContent=error.message;
    else if(dialog.open&&dialog.querySelector('[data-batch-review]')){
      dialog.querySelector('[data-batch-review]').innerHTML=notice(error.message,true);
    }else notify(error.message);
    if(standalone&&error.status===401){hideModal();await init();}
    else if(error.status===409||error.status===401){
      try{view=await request('/api/workspace');render();}catch{}
    }
  }finally{
    busy=false;if(control?.isConnected)control.disabled=false;
  }
}
async function selectRole(code,control){
  if(busy||view.actor.code===code)return;
  busy=true;control.disabled=true;
  try{
    if(companyMode()){
      directoryModel=await request('/api/account');
      await request('/api/account/select',{orgId:directoryModel.selection.orgId,code});
      view=await request('/api/workspace');
      teamModel=null;
    }else view=await request('/api/demo-role',{code});
    go('home');notify('Đang làm việc với vai trò '+view.actor.name);
  }
  catch(error){notify(error.message);control.disabled=false;}
  finally{busy=false;}
}
const navGroups=[
  ['Tổng quan',['home']],
  ['Nghiệp vụ',['orders','warehouse','stock','documents','invoices','bank','debts','cash','payroll','payroll-summary','portal']],
  ['Kiểm soát',['approvals','closing','ledger-review','reports','management','evidence']],
  ['Thiết lập',['catalog','opening']],
  ['Hệ thống',['administration','integration']]
];
const sidebarKey='ledo.sidebar-compact';
function shell(){
  let compact=false;
  try{compact=localStorage.getItem(sidebarKey)==='1';}catch{}
  side.classList.toggle('is-compact',compact);
  const {actor}=view;
  const organization=view.organization??'An Phát';
  const company=companyMode();
  const routes=new Set(['home',...view.nav]);
  const label=key=>company&&key==='administration'?'Người dùng và phân quyền':navigation[key][0];
  const priority=(desks[actor.code]?.modules??[]).filter(key=>routes.has(key));
  const groups=[navGroups[0],['Công việc chính',priority],
    ...navGroups.slice(1).map(([name,keys])=>[name,keys.filter(key=>!priority.includes(key))])].map(([name,keys])=>[
    name, keys.filter(key=>routes.has(key)).map(key=>[key,label(key),navigation[key][1]])
  ]).filter(([,items])=>items.length);
  sideRoot.render(<Sidebar actor={actor} company={company} organization={organization} page={page} groups={groups} period={periodLabel()} />);
  topRoot.render(<TopBar actor={actor} company={company} organization={organization} pageLabel={label(page)} standalone={standalone}
    mobileOpen={side.classList.contains('open')} compact={compact} />);
}
function processCards(){
  const count=(list,pred)=>list.filter(pred).length;
  const cards={
    KT:[['Chứng từ đang xử lý',count(rows('documents'),x=>['draft','review','approved'].includes(x.status)),'documents'],['Sao kê chưa ghép',count(rows('bank'),x=>!x.linked),'bank'],['Phản hồi đối tác',rows('portalReplies').length,'debts']],
    TK:[['Đơn chờ giao nhận',count(rows('orders'),pendingDelivery),'warehouse'],['Phiếu giao nhận',rows('orders').reduce((n,x)=>n+x.receipts.length,0),'warehouse'],['Biên bản kiểm kê',rows('counts').length,'warehouse']],
    TQ:[['Phiếu chờ xác nhận',count(view.cash?.requests??[],x=>!x.verified&&x.status==='approved'),'cash'],['Số dư quỹ',money(view.cash?.fund),'cash'],['Biên bản quỹ',view.cash?.counts.length??0,'cash']],
    PD:[['Hồ sơ chờ duyệt',rows('approvals').length+rows('orderApprovals').length,'approvals'],['Hạn mức mỗi phiếu',money(view.actor.limit),'approvals'],['Yêu cầu mở kỳ',count(rows('reopen'),x=>x.status==='review'),'approvals']],
    KTT:[['Chứng từ đã duyệt',count(rows('documents'),x=>x.status==='approved'),'documents'],['Sao kê chưa ghép',count(rows('bank'),x=>!x.linked),'bank'],['Nhóm chốt còn vướng',count(view.closing?.checks??[],x=>x.count>0),'closing']],
    LD:[['Doanh thu',money(view.report?.summary.revenue),'management'],['Lãi gộp',money(view.report?.summary.profit),'management'],['Phải thu',money(view.report?.summary.ar),'management']],
    KS:[['Chứng từ đã ghi',rows('documents').length,'reports'],['Yêu cầu bằng chứng',rows('evidence').length,'evidence'],['Sự kiện đang xem',rows('audit').length,'evidence']],
    QT:[['Vai trò được cấu hình',view.administration?.grants.length??0,'administration'],['Vai trò đang hoạt động',count(view.administration?.grants??[],x=>x.active),'administration'],['Sự kiện cấp quyền',view.administration?.audit.length??0,'administration']],
    TL:[['Bảng nháp',count(rows('payroll'),x=>x.status==='draft'),'payroll'],['Đã chuyển tổng',count(rows('payroll'),x=>x.status!=='draft'),'payroll'],['Kỳ lương',periodLabel(),'payroll']],
    DT:[['Giá trị chứng từ',money(view.portal?.original),'portal'],['Số dư được chia sẻ',money(view.portal?.open),'portal'],['Phản hồi đã gửi',view.portal?.replies.length??0,'portal']],
    HT:[['Sự kiện duy nhất',rows('events').length,'integration'],['Đã xác minh',count(rows('events'),x=>x.status==='verified'),'integration'],['Lần nhận lặp',rows('events').reduce((n,x)=>n+x.duplicates,0),'integration']]
  };
  return companyMode()&&view.actor.code==='QT'?[]:cards[view.actor.code]??[];
}
function pickRows(route,items,key=filter){
  const predicate=filters[route]?.[key]?.[1];
  return predicate?items.filter(row=>predicate(row,view)):items;
}
function filterBar(route,options){
  return '<div class="workdesk-filters" role="group" aria-label="Lọc danh sách">'+options.map(([key,label])=>
    '<button type="button" class="btn soft" data-act="focus:'+route+':'+encodeURIComponent(JSON.stringify({filter:key}))+
    '" aria-pressed="'+(filter===key)+'">'+esc(label)+'</button>').join('')+'</div>';
}

function orderPage(isWarehouse=false){
  const route=isWarehouse?'warehouse':'orders';
  const items=pickRows(route,rows('orders'));
  const title=isWarehouse?'Giao nhận và kiểm kê':'Mua hàng và bán hàng';
  const actions=(isWarehouse?btn('Ghi kiểm kê','form:stock-count',{style:'primary',glyph:'plus',disabled:!can('stock.count')}):
    btn('Tạo đơn','form:order',{style:'primary',glyph:'plus',disabled:!can('order.write')}))+
    (view.nav.includes('stock')?btn('Mở thẻ kho','go:stock',{style:'soft'}):'');
  const orderCards=items.slice().reverse().map(order=>{
    const confirmed=order.receipts.reduce((sum,row)=>sum+row.quantity,0);
    const buy=order.kind==='buy';
    const kind=buy?'Đơn mua':'Đơn bán';
    const rowsData=order.receipts.map(row=>{
      const invoice=rows('invoices').find(item=>item.id===row.invoiceId);
      const mismatch=buy&&(row.invoice!==row.quantity||(invoice&&invoice.price!==order.price));
      const operation= isWarehouse?esc(row.remark||'—'):row.docId?
        link(row.docId,'doc:'+row.docId):'<div class="row-actions">'+
        (buy&&!invoice?operate('Nhập số hóa đơn','form:invoice',{id:order.id,receipt:row.id,initial:row.invoice??order.quantity},{disabled:!can('order.write')}):'')+
        (buy&&has('invoice.import')?operate(invoice?'Thay XML':'Gắn XML','form:invoice-link',{id:order.id,receipt:row.id},{disabled:!can('invoice.import')}):'')+
        operate('Lập nháp','send:order.draft',{id:order.id,receipt:row.id},{style:'soft',disabled:mismatch||!can('doc.write')})+'</div>';
      const columns=[esc(row.id),num(fmt(row.quantity))];
      const unit=order.unit??'cái';
      if(!isWarehouse&&buy){
        columns.push(invoice?link(invoice.series+' / '+invoice.number,'invoice:'+invoice.id)+
          '<small class="cell-note">'+fmt(invoice.quantity)+' '+esc(unit)+' · '+esc(money(invoice.price))+'</small>':row.invoice===null?'—':num(fmt(row.invoice)),
          row.invoice===null?chip('Chờ hóa đơn','wait'):row.invoice!==row.quantity?chip('Lệch '+fmt(row.invoice-row.quantity)+' '+unit,'wait'):
          invoice&&invoice.price!==order.price?chip('Lệch đơn giá','wait'):chip('Đã khớp'));
      }
      return [...columns,operation];
    });
    const heads=['Phiếu',buy?'Thực nhận':'Thực giao',...(!isWarehouse&&buy?['Hóa đơn','Đối chiếu']:[]),isWarehouse?'Ghi chú':'Thao tác'];
    const actions=isWarehouse&&pendingDelivery(order)?operate(buy?'Xác nhận nhận':'Xác nhận giao','form:receive',
      {id:order.id,warehouse:order.warehouse,remaining:order.quantity-confirmed,kind:order.kind,unit:order.unit},{style:'soft',disabled:!can('stock.confirm')}):
      !isWarehouse?link('Xem đơn','order:'+order.id):'';
    const totals=isWarehouse?[]:[['Đặt',fmt(order.quantity)+' '+(order.unit??'cái')],[buy?'Thực nhận':'Thực giao',fmt(confirmed)+' '+(order.unit??'cái')],['Còn lại',fmt(order.quantity-confirmed)+' '+(order.unit??'cái')]];
    const bar='<div class="order-strip">'+status(order.status)+totals.map(([label,value])=>'<span>'+esc(label)+' <strong>'+esc(value)+'</strong></span>').join('')+'</div>';
    return section(kind+' '+order.id,bar+table(heads,rowsData,order.status==='review'?'Đang chờ duyệt.':order.status==='returned'?'Đã trả về người lập.':'Chưa có phiếu giao nhận.'),
      actions,[codedName(order.partyCode,order.party),codedName(order.itemCode,order.itemName),order.warehouse,date(order.date)].filter(Boolean).join(' · '));
  }).join('');
  const inventory=rows('counts');
  const countSection=section('Biên bản kiểm kê kho',table(['Biên bản','Ngày kiểm kê','Kho','Mặt hàng','Theo sổ','Đếm thực','Chênh lệch','Xử lý'],inventory.slice().reverse().map(row=>[
    link(row.id,'count:'+row.id),esc(date(row.date)),esc(row.warehouse),esc(codedName(row.itemCode,row.itemName)||itemLabel()),
    num(fmt(row.expected)),num(fmt(row.quantity)),num(fmt(row.delta)),
    row.delta===0?chip('Khớp'):row.resolved?chip(row.adjustmentId?'Đã ghi điều chỉnh':'Đã giải trình'):
      row.adjustmentId?status(row.adjustmentStatus):chip(row.current===false?'Cần kiểm đếm lại':'Chờ xử lý','wait')
  ]),'Chưa có biên bản kiểm kê trong kho này.'));
  const cases=rows('varianceCases');
  const varianceSection=!isWarehouse&&cases.length?section('Theo dõi quyết định xử lý kiểm kê',
    table(['Điều chỉnh gốc','Mặt hàng','Tài khoản chờ','Giá trị gốc','Đã ghi xử lý','Đang chờ ghi','Còn có thể lập'],cases.map(row=>[
      link(row.id,'doc:'+row.id),esc(codedName(row.itemCode,row.itemName)||itemLabel()),esc(row.kind==='adjustOut'?'1381':'3381'),
      ...[row.original,row.processed,row.reserved,row.available].map(value=>num(money(value)))
    ]))):'';
  const stock=view.catalog?.items;
  const stockSection=stock&&(isWarehouse||view.actor.code==='KTT')?section('Tồn kho theo mã hàng',
    table(['Mã hàng','Tên hàng','Đơn vị','Tồn theo sổ',...(isWarehouse?[]:['Trị giá'])],stock.map(item=>[
      esc(item.code),esc(item.name),esc(item.unit),num(fmt(item.units)),...(isWarehouse?[]:[num(money(item.value))])
    ]))):'';
  const toggles=isWarehouse?[['pending','Chờ giao nhận'],['all','Tất cả giao nhận'],['counts','Kiểm kê kho']]:
    [['all','Tất cả đơn'],['returned','Đơn của tôi bị trả']];
  const list=orderCards||section('Danh sách đơn','<p class="padded subtle">Không có đơn phù hợp trong phạm vi này.</p>');
  return heading(title,isWarehouse?'Số lượng theo kho được cấp':'Từ đơn, số thực nhận hoặc thực giao đến chứng từ.',actions)+
    '<div class="stack">'+filterBar(route,toggles)+(isWarehouse?(filter==='counts'?countSection+stockSection:list):
    (filter==='returned'?list:stockSection+countSection+varianceSection+varianceCashTable(rows('varianceCashCases'))+list))+'</div>';
}
function varianceCashPanel(source){
  if(!source)return '';
  const receipt=source.account==='1388';
  const title=receipt?'Thu bồi thường · TK 1388':'Chi khoản phải trả khác · TK 3388';
  const action=source.available>0&&can('doc.write')&&can('cash.request')?
    operate(receipt?'Lập phiếu thu bồi thường':'Lập phiếu chi khoản phải trả','form:variance-cash',{id:source.id},{style:'primary'}):'';
  return section(title,metrics([
    ['Đối tượng',source.party],['Giá trị phải '+(receipt?'thu':'trả'),money(source.original)],
    ['Đã ghi sổ',money(source.paid)],['Còn trên sổ',money(source.remaining)],
    ['Phiếu chưa ghi sổ',money(source.reserved)],['Còn có thể lập',money(source.available)]
  ])+table(['Phiếu','Tham chiếu','Ngày','Số tiền','Trạng thái'],source.history.map(row=>[
    link(row.id,'doc:'+row.id),esc(row.receiptRef),esc(date(row.date)),num(money(row.total)),
    row.verified&&row.status==='approved'?chip('Đã xác nhận tiền mặt'):status(row.status)
  ]),'Chưa lập phiếu thu hoặc chi cho quyết định này.')+(action?'<div class="padded">'+action+'</div>':''));
}
function varianceCashTable(cases){
  if(!cases.length)return '';
  return section('Thu chi theo quyết định kiểm kê',table(['Quyết định','Đối tượng','Tài khoản','Đã ghi sổ','Còn trên sổ','Chờ ghi sổ'],cases.map(row=>[
    link(row.decision,'doc:'+row.id),esc(row.party),esc(row.account),...[row.paid,row.remaining,row.reserved].map(value=>num(money(value)))
  ])));
}
function variancePanel(source){
  if(!source)return '';
  const action=source.available>0&&can('doc.write')?
    operate('Lập quyết định xử lý','form:variance-settlement',{id:source.id},{style:'primary'}):'';
  return section('Theo dõi xử lý chênh lệch',metrics([
    ['Giá trị ghi nhận',money(source.original)],['Đã ghi xử lý',money(source.processed)],
    ['Còn trên tài khoản chờ',money(source.remaining)],['Đang chờ ghi',money(source.reserved)],['Còn có thể lập',money(source.available)]
  ])+table(['Chứng từ xử lý','Số quyết định','Ngày','Giá trị','Trạng thái'],source.history.map(row=>[
    link(row.id,'doc:'+row.id),esc(row.decision),esc(date(row.date)),num(money(row.total)),status(row.status)
  ]),'Chưa có quyết định xử lý.')+(action?'<div class="padded">'+action+'</div>':''));
}
function countDetail(id){
  const row=rows('counts').find(item=>item.id===id);
  if(!row)return;
  const actions=[];
  if(row.adjustmentId&&view.nav.includes('documents'))actions.push(link('Mở '+row.adjustmentId,'doc:'+row.adjustmentId));
  if(row.delta!==0&&!row.resolved&&!row.adjustmentId){
    if(row.current&&can('doc.write'))actions.push(operate('Lập nháp điều chỉnh','form:stock-adjust',{id},{style:'primary'}));
    if(can('period.lock'))actions.push(operate('Đóng có giải trình','form:reason',{id,action:'warehouse.resolve'}));
  }
  open('Biên bản kiểm kê '+row.id,metrics([
    ['Kho',row.warehouse],['Mặt hàng',codedName(row.itemCode,row.itemName)||itemLabel()],['Ngày kiểm kê',date(row.date)],
    ['Theo sổ',fmt(row.expected)],['Đếm thực',fmt(row.quantity)],['Chênh lệch',fmt(row.delta)],
    ...(row.adjustmentId?[['Chứng từ điều chỉnh',row.adjustmentId+' · '+statuses[row.adjustmentStatus]]]:[])
  ])+(row.reason?notice(row.reason):'')+variancePanel(rows('varianceCases').find(source=>source.id===row.adjustmentId))+
    (row.delta&&!row.resolved&&row.current===false?notice('Biên bản đã cũ hoặc sổ kho đã thay đổi. Kiểm đếm lại trước khi lập hoặc ghi điều chỉnh.',true):'')+
    '<div class="dialog-actions">'+actions.join('')+'</div>','detail');
}
function orderDetail(id){
  const order=[...rows('orders'),...rows('orderApprovals')].find(item=>item.id===id);
  if(!order){notify('Không thấy đơn trong phạm vi hiện tại.');return;}
  const hasPrice=Number.isFinite(order.price);
  const confirmed=order.receipts.reduce((n,row)=>n+row.quantity,0);
  const amount=hasPrice?order.price*order.quantity:null;
  const eligible=view.actor.limit===null||view.actor.limit>=amount;
  const review=order.status==='review'&&!order.mine&&can('approve');
  const revise=order.status==='returned'&&order.mine&&can('order.write');
  const actions=review?
    operate('Trả đơn','form:reason',{id,action:'order.return'},{disabled:!eligible})+
    operate('Duyệt và bàn giao','send:order.approve',{id},{style:'primary',disabled:!eligible}):
    revise?link('Bổ sung','form:order-revise:'+encodeURIComponent(JSON.stringify({id})))+
    operate('Gửi duyệt lại','send:order.submit',{id},{style:'primary'}):'';
  open(id+' · '+(order.kind==='buy'?'Đơn mua':'Đơn bán'),'<div class="detail-grid">'+[
    ['Đối tác',codedName(order.partyCode,order.party)],...(order.itemId?[['Mặt hàng',codedName(order.itemCode,order.itemName)]]:[]),['Kho',order.warehouse],['Ngày ghi',date(order.date)],...(hasPrice?[['Hạn thanh toán',date(order.dueDate)]]:[]),['Trạng thái',statuses[order.status]],
    ['Số lượng đặt',fmt(order.quantity)],['Đã giao hoặc nhận',fmt(confirmed)],...(hasPrice?[['Đơn giá',money(order.price)],['Giá trị đơn',money(amount)]]:[])
  ].map(([name,value])=>'<div><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div>'+
    (order.returnReason?notice('Lý do trả đơn · '+order.returnReason,true):'')+
    (review&&!eligible?notice('Giá trị đơn vượt hạn mức duyệt đã cấp.',true):'')+
    (order.status==='approved'&&order.approvedBy?notice('Người duyệt · '+order.approvedBy):'')+
    (actions?'<div class="dialog-actions">'+actions+'</div>':''),'detail');
}
function invoicePage(){
  const list=rows('invoices').slice().reverse();
  return heading('Hóa đơn đầu vào','Lưu XML mẫu, kiểm trùng và đối chiếu với phiếu nhận.',
    btn('Nhập XML','form:invoice-import',{glyph:'plus',style:'primary',disabled:!can('invoice.import')}))+
    section('Hồ sơ hóa đơn',table(['Hóa đơn','Ngày lập','Mặt hàng','Số lượng','Thành tiền','Đối chiếu'],list.map(row=>[
      link(row.series+' / '+row.number,'invoice:'+row.id),esc(date(row.date)),esc(row.item),num(fmt(row.quantity)),num(money(row.total)),
      row.link?link('Đơn '+row.link.order,'order:'+row.link.order):chip('Chưa gắn','neutral')
    ]),'Chưa có hóa đơn đầu vào. Nhập XML mẫu để bắt đầu.'));
}
function invoiceDetail(id){
  const row=rows('invoices').find(item=>item.id===id);
  if(!row){notify('Không thấy hóa đơn trong phạm vi hiện tại.');return;}
  open('Hóa đơn '+row.series+' / '+row.number,metrics([
    ['Mã hồ sơ',row.id],['Nhà cung cấp',row.supplier],['Ngày lập',date(row.date)],['Mặt hàng',row.item],
    ['Số lượng',fmt(row.quantity)],['Đơn giá',money(row.price)],['Thành tiền',money(row.total)],
    ['Phiếu nhận',row.link?.receipt??'Chưa gắn']
  ])+(row.digest?'<p class="code-note">SHA-256 <code>'+esc(row.digest)+'</code></p>':'')+
  '<div class="dialog-actions"><a class="download-link" href="/api/invoice.xml?id='+encodeURIComponent(id)+'">Tải XML gốc</a></div>','detail');
}
function search(){
  const choices=[
    ...['home',...view.nav].map(key=>({label:navigation[key][0],detail:'Màn hình',action:'go:'+key})),
    ...rows('documents').map(row=>({label:row.id,detail:row.party,action:'doc:'+row.id})),
    ...rows('orders').map(row=>({label:row.id,detail:row.party,action:'order:'+row.id})),
    ...rows('orderApprovals').map(row=>({label:row.id,detail:row.party,action:'order:'+row.id})),
    ...rows('invoices').map(row=>({label:row.series+' / '+row.number,detail:row.id,action:'invoice:'+row.id}))
  ];
  const normalize=value=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');
  open('Tìm trong phạm vi được cấp',field('Màn hình hoặc hồ sơ','query','search',{required:false})+
    '<div id="search-results" class="search-results" aria-live="polite"></div>');
  const unique=[...new Map(choices.map(item=>[item.action,item])).values()];
  const input=dialog.querySelector('input');
  const result=dialog.querySelector('#search-results');
  const update=()=>{
    const text=normalize(input.value.trim());
    const matches=unique.filter(item=>normalize(item.label+' '+item.detail).includes(text)).slice(0,12);
    result.innerHTML=matches.length?matches.map(item=>'<button type="button" class="search-result" data-act="'+esc(item.action)+'"><strong>'+
      esc(item.label)+'</strong><small>'+esc(item.detail)+'</small></button>').join(''):'<p class="subtle">Không tìm thấy kết quả.</p>';
  };
  input.addEventListener('input',update);update();input.focus();
}
const invoiceTemplate=[
  '<HoaDon>',
  '  <NhaCungCap>NCC01</NhaCungCap>',
  '  <KyHieu>AP-26</KyHieu>',
  '  <So>01</So>',
  '  <Ngay>2026-11-24</Ngay>',
  '  <Dong>',
  '    <MaHang>BINH01</MaHang>',
  '    <SoLuong>6</SoLuong>',
  '    <DonGia>100000</DonGia>',
  '    <ThanhTien>600000</ThanhTien>',
  '  </Dong>',
  '</HoaDon>'
].join('\n');
function fillInvoice(){
  const field=dialog.querySelector('[name=xml]');
  if(field){field.value=invoiceTemplate;field.focus();}
}

function docRows(items){
  return table(['Mã phiếu','Nghiệp vụ','Đối tác','Ngày ghi','Giá trị','Trạng thái'],items.map(row=>[
    link(row.id,'doc:'+row.id),esc(kinds[row.kind]),esc(codedName(row.partyCode,row.party)),esc(date(row.date)),num(money(row.total)),status(row.status)
  ]));
}
function docDetail(key){
  const row=[...rows('documents'),...rows('approvals')].find(doc=>doc.id===key);
  if(!row){notify('Không thấy chứng từ trong phạm vi hiện tại.');return;}
  const order=rows('orders').find(item=>item.receipts.some(receipt=>receipt.docId===key));
  const receipt=order?.receipts.find(item=>item.docId===key);
  const invoice=rows('invoices').find(item=>item.id===receipt?.invoiceId);
  const trace=order?'<div class="order-strip"><span>Nguồn đối chiếu</span>'+link(order.id,'order:'+order.id)+
    '<strong>'+esc(receipt.id)+'</strong>'+(invoice?link(invoice.series+' / '+invoice.number,'invoice:'+invoice.id):'')+'</div>':'';
  const actions=[];
  if(row.status==='draft'&&row.mine&&can('doc.submit')){
    actions.push(operate('Sửa nháp','form:revise',{id:row.id},{disabled:!can('doc.write')}),
      operate('Hủy nháp','form:confirm',{id:row.id,action:'doc.cancel',title:'Hủy bản nháp '+row.id}),
      operate('Gửi duyệt','send:doc.submit',{id:row.id},{style:'primary'}));
  }
  if(row.status==='void'&&row.mine&&row.cancelledDraftAt&&can('doc.write')){
    actions.push(operate('Phục hồi bản nháp','form:confirm',{id:row.id,action:'doc.restore',title:'Phục hồi '+row.id},{style:'primary'}));
  }
  if(row.status==='review'&&!row.mine&&can('approve')){
    const eligible=view.actor.limit===null||row.total<=view.actor.limit;
    actions.push(operate('Trả hồ sơ','form:reason',{id:row.id,action:'doc.return'},{disabled:!eligible}),
      operate('Duyệt','send:doc.approve',{id:row.id},{style:'primary',disabled:!eligible}));
  }
  if((row.countId||row.varianceSource||row.varianceDecision)&&!row.verified&&['draft','review','approved'].includes(row.status)&&can('period.lock'))
    actions.push(operate('Hủy chứng từ kiểm kê','form:reason',{id:row.id,action:'warehouse.void-adjustment'}));
  if(row.status==='approved'&&can('doc.post'))actions.push(operate('Ghi sổ','send:doc.post',{id:row.id},{style:'primary',disabled:row.channel==='cash'&&!row.verified}));
  open(row.id+' · '+kinds[row.kind],metrics([['Đối tác',codedName(row.partyCode,row.party)],...(row.itemId?[['Mặt hàng',codedName(row.itemCode,row.itemName)]]:[]),['Ngày hạch toán',date(row.date)],['Trạng thái',statuses[row.status]],['Giá trị',money(row.total)],['Nguồn',row.countId??row.varianceSource??row.varianceDecision??row.origin??row.link??'—'],...(row.decision?[['Số quyết định',row.decision]]:[]),...(row.receiptRef?[['Số phiếu tham chiếu',row.receiptRef]]:[]),...(['buy','sell'].includes(row.kind)?[['Hạn thanh toán',date(row.dueDate)]]:[])])+
    trace+(row.countId&&rows('counts').some(count=>count.id===row.countId)?'<div class="order-strip">'+link('Mở biên bản '+row.countId,'count:'+row.countId)+'</div>':'')+
    (row.varianceSource?'<div class="order-strip">'+
      ((rows('documents').some(doc=>doc.id===row.varianceSource))?link('Mở điều chỉnh '+row.varianceSource,'doc:'+row.varianceSource):esc(row.varianceSource))+'</div>':'')+
    (row.varianceDecision&&rows('documents').some(doc=>doc.id===row.varianceDecision)?
      '<div class="order-strip">'+link('Mở quyết định '+row.varianceDecision,'doc:'+row.varianceDecision)+'</div>':'')+
    varianceCashPanel(rows('varianceCashCases').find(source=>source.id===row.id))+
    (row.allocations?.some(line=>line.party)?table(['Tài khoản','Đối tượng','Giá trị'],row.allocations.filter(line=>line.party).map(line=>[
      esc(line.account),esc(line.party),num(money(line.value))
    ])):'')+variancePanel(rows('varianceCases').find(source=>source.id===row.id))+
    (row.voidReason?notice('Lý do hủy · '+row.voidReason,true):'')+(row.description?'<p>'+esc(row.description)+'</p>':'')+(row.returnReason?notice('Lý do trả lại · '+row.returnReason,true):'')+
    (row.channel==='cash'&&!row.verified&&row.status==='approved'?notice('Đang chờ thủ quỹ xác nhận số tiền thực tế.',true):'')+
    table(['Ghi Nợ','Ghi Có','Số tiền'],row.lines.map(line=>[esc(line.debit+' · '+(accountLabels[line.debit]??'')),esc(line.credit+' · '+(accountLabels[line.credit]??'')),num(money(line.value))]))+
    (row.history?.length?section('Lịch sử chứng từ',table(['Thời điểm','Vai trò','Thao tác'],row.history.map(event=>[
      esc(when(event.time)),esc(event.actor),esc(event.message)
    ]))):'')+
    '<div class="dialog-actions">'+actions.join('')+'</div>','detail');
}

function match(ref){
  const row=rows('bank').find(item=>item.ref===ref);
  if(!row)return;
  const existing=row.existing.map(doc=>[doc.id,'Ghép phiếu đã ghi '+doc.id]);
  const next=row.sources.map(doc=>[doc.id,'Ghi khoản mới cho '+debtLabel(doc)]);
  const choices=[...existing,...(existing.length?[]:next)];
  const summary=metrics([['Mã sao kê',row.ref],['Đối tác',codedName(row.partyCode,row.party)],['Ngày',date(row.date)],
    ['Chiều tiền',row.kind==='receive'?'Tiền vào':'Tiền ra'],['Số tiền',money(row.amount)],
    ...(row.importBatch?[['Đợt nhập',row.importBatch],['Tệp nguồn',row.importFile]]:[])])+
    (row.note?'<p>'+esc(row.note)+'</p>':'');
  if(!choices.length){open('Đối chiếu '+ref,summary+notice('Chưa có chứng từ đúng ngày, đối tác hoặc công nợ phù hợp.',true));return;}
  const saved=choices.some(([key])=>key===row.proposal?.source)?row.proposal.source:choices[0][0];
  openForm('Đối chiếu '+ref,summary+field('Phương án','source','select',{options:choices,value:saved})+
    '<div id="bank-impact" aria-live="polite"></div>','Xác nhận',null);
  const canPost=source=>can('bank.post')&&(!companyMode()||
    (row.proposal?.mode==='new'&&row.proposal.source===source&&!row.proposal.mine));
  activeForm={
    action:values=>{
      const matchExisting=existing.some(([key])=>key===values.source);
      if(matchExisting&&can('bank.link'))return 'bank.confirm';
      if(!matchExisting&&canPost(values.source))return 'bank.post';
      return 'bank.propose';
    },
    data:values=>({ref,source:values.source,mode:existing.some(([key])=>key===values.source)?'existing':'new'})
  };
  const update=()=>{
    const source=dialog.querySelector('select').value;
    const doc=row.sources.find(item=>item.id===source);
    const matching=existing.some(([key])=>key===source);
    const description=matching?'Chỉ tạo liên kết. Số dư và công nợ giữ nguyên.':
      'Công nợ '+money(doc.open)+' → '+money(doc.open-row.amount)+'. '+(row.kind==='receive'?'Tiền gửi tăng ':'Tiền gửi giảm ')+money(row.amount)+'.';
    const post=canPost(source), linkExisting=matching&&can('bank.link');
    const review=companyMode()&&!matching&&!post?' Cần một người khác đề xuất trước khi Kế toán trưởng ghi sổ.':'';
    dialog.querySelector('#bank-impact').innerHTML=notice(description+review);
    dialog.querySelector('button[type=submit]').textContent=linkExisting?'Ghép phiếu đã ghi':!matching&&post?'Ghi sổ và ghép':'Gửi phương án';
  };
  dialog.querySelector('select').addEventListener('change',update);
  dialog.querySelector('button[type=submit]').disabled=!can('bank.prepare');
  update();
}
function debtDetail(id,at){
  const row=rows('debts').find(item=>item.id===id);
  if(!row)return;
  const snapshots=at?agingRow(row,at):null;
  const balance=snapshots?.balance??row.open;
  const payments=snapshots?.payments??row.settlements;
  const canPay=can('doc.write')&&row.open>0;
  open('Công nợ '+debtLabel(row),metrics([
    ['Đối tác',codedName(row.partyCode,row.party)],['Loại',typeLabel(row.kind)],
    ['Ngày chứng từ',date(row.date)],['Hạn thanh toán',date(row.dueDate)],
    ['Giá trị gốc',money(row.original)],['Đã phân bổ',money(row.original-balance)],['Còn lại',money(balance)],
    ...(snapshots?[['Ngày đối chiếu',date(at)],['Tình trạng',snapshots.timing]]:[])
  ])+(row.open!==balance?notice('Số còn lại theo sổ hiện tại '+money(row.open)+'. Phiếu mới căn cứ theo số còn lại hiện tại.'): '')+
    section('Chứng từ nguồn và thanh toán',table(['Chứng từ','Ngày hạch toán','Nguồn tiền','Số tiền'],[
      [row.opening?esc(debtLabel(row)):link(row.id,'doc:'+row.id),esc(date(row.date)),'—',num(money(row.original))],
      ...payments.map(item=>[link(item.id,'doc:'+item.id),esc(date(item.date)),item.channel==='cash'?'Tiền mặt':'Ngân hàng',num('−'+money(item.amount))])
    ]))+
    (canPay?'<div class="dialog-actions">'+operate(row.kind==='sell'?'Lập phiếu thu':'Lập phiếu chi','form:payment',{id:row.id},{style:'primary'})+'</div>':''),'detail');
}
function cashPage(){
  const data=view.cash;
  const list=pickRows('cash',data.requests);
  const toggles=[['all','Tất cả phiếu'],...Object.entries(filters.cash).map(([key,[label]])=>[key,label]),['counts','Kiểm kê quỹ']];
  const vouchers=section('Phiếu tiền mặt',table(['Phiếu','Nghiệp vụ','Đối tác','Số duyệt','Trạng thái','Xác nhận'],list.map(row=>[
    view.actor.code==='KTT'?link(row.id,'doc:'+row.id):esc(row.id),
    esc(row.varianceAccount?(row.kind==='receive'?'Thu bồi thường':'Chi phải trả khác')+' · '+row.receiptRef:kinds[row.kind]),
    esc(row.party),num(money(row.total)),status(row.status),
    row.verified?chip('Đã xác nhận'):row.status==='approved'&&can('cash.confirm')?
      operate('Xác nhận','form:cash-verify',{id:row.id,total:row.total},{style:'soft'}):(row.status==='void'?'—':chip('Chờ xử lý','neutral'))
  ]),'Không có phiếu phù hợp.'));
  const counts=section('Kiểm kê quỹ',table(['Biên bản','Theo sổ','Thực đếm','Chênh','Kết quả'],data.counts.slice().reverse().map(row=>[
    esc(row.id),num(money(row.expected)),num(money(row.actual)),num(money(row.delta)),
    row.delta===0?chip('Khớp'):row.resolved?esc(row.reason):can('period.lock')?operate('Giải trình','form:reason',{id:row.id,action:'cash.resolve'}):chip('Chờ rà','wait')
  ])));
  return heading('Quỹ tiền mặt','Xác nhận thực tế và đối chiếu kiểm kê với sổ quỹ.',
    (can('cash.count')?btn('Ghi kiểm kê','form:cash-count',{style:'primary',glyph:'plus'}):
    can('cash.request')?btn('Lập phiếu quỹ','form:cash-payment',{style:'primary',glyph:'plus'}):'')+batchButton(view,'verify'))+
    '<div class="stack">'+notice('Số dư quỹ theo sổ '+money(data.fund)+(data.reservedOut?
      ' · Phiếu chi đã xác nhận, chờ ghi sổ '+money(data.reservedOut):''))+filterBar('cash',toggles)+
    (filter==='counts'?counts:vouchers+(filter==='all'?varianceCashTable(rows('varianceCashCases')):''))+'</div>';
}
function approvalPage(){
  const limit=view.actor.limit;
  const toggles=[['all','Tất cả hồ sơ'],...Object.entries(filters.approvals).map(([key,[label]])=>[key,label])];
  const orders=filter==='all'||filter==='orders'?section('Đơn mua và bán chờ duyệt',table(['Đơn','Đối tác','Người lập','Số lượng','Giá trị'],pickRows('approvals',rows('orderApprovals'),filter).map(row=>[
    link(row.id,'order:'+row.id),esc(row.party),esc(row.owner),num(fmt(row.quantity)),num(money(row.quantity*row.price))
  ]))):'';
  const vouchers=filter==='all'||filter==='vouchers'?section('Chứng từ chờ duyệt',docRows(pickRows('approvals',rows('approvals'),filter))):'';
  const reopen=filter==='all'||filter==='reopen'?section('Yêu cầu mở lại kỳ',table(['Yêu cầu','Lý do','Người yêu cầu','Trạng thái','Thao tác'],
    pickRows('approvals',rows('reopen'),filter).slice().reverse().map(row=>[
      esc(row.id),esc(row.reason),esc(row.owner),status(row.status),
      row.status==='review'&&!row.mine&&has('approve')?operate('Duyệt mở kỳ','send:period.approve',{id:row.id},{style:'soft'}):'—'
    ]))):'';
  return heading('Hồ sơ phê duyệt',limit===null?'Duyệt theo tuyến và tách người lập.':'Hạn mức mỗi phiếu '+money(limit)+' · '+view.actor.branch,batchButton(view,'approve'))+
    '<div class="stack">'+filterBar('approvals',toggles)+orders+vouchers+reopen+'</div>';
}
function reportRows(summary){
  return [['Tiền gửi ngân hàng',money(summary.cash)],['Tiền mặt',money(summary.fund)],['Phải thu khách hàng',money(summary.ar)],
    ['Phải trả nhà cung cấp',money(summary.ap)],['Hàng tồn kho',money(summary.stock)],['Doanh thu',money(summary.revenue)],['Thu nhập khác',money(summary.otherIncome)],
    ['Giá vốn',money(summary.cogs)],['Lãi gộp',money(summary.profit)],['Chi phí quản lý',money(summary.expense)],['Phải trả người lao động',money(summary.wages)]];
}
function reports(isManagement=false){
  const summary=view.report.summary;
  const action=isManagement?btn('Yêu cầu giải trình','form:evidence-management',{style:'primary',glyph:'plus'}):'';
  const details=!isManagement?section('Bảng phát sinh',table(['Tài khoản','Tên tài khoản','Dư đầu Nợ','Dư đầu Có','Phát sinh Nợ','Phát sinh Có','Dư cuối Nợ','Dư cuối Có'],
    Object.entries(summary.balances).map(([code,total])=>{
      const begin=view.report.openingBalances?.[code]??{debit:0,credit:0};
      const net=total.debit-total.credit;
      return [link(code,'account:'+code),esc(accountLabels[code]),...
        [begin.debit,begin.credit,total.debit-begin.debit,total.credit-begin.credit,Math.max(0,net),Math.max(0,-net)].map(value=>num(money(value)))];
    }))):section('Theo dõi giải trình',evidenceTable());
  return heading(isManagement?'Báo cáo quản trị':'Sổ và báo cáo',view.actor.branch+' · Tháng '+periodLabel()+' · Dữ liệu đã ghi sổ',action)+
    '<div class="stack">'+section('Tổng hợp kỳ','<div class="padded">'+metrics(reportRows(summary))+'</div>')+details+'</div>';
}
function account(code){
  const balances=view.report?.summary.balances;
  if(!balances||!Object.hasOwn(balances,code))return;
  const summary=balances[code];
  const opening=view.report.openingBalances?.[code];
  const list=rows('documents').filter(doc=>doc.status==='posted').flatMap(doc=>doc.lines.filter(line=>line.debit===code||line.credit===code).map(line=>[
    link(doc.id,'doc:'+doc.id),esc(doc.party),line.debit===code?num(money(line.value)):'—',line.credit===code?num(money(line.value)):'—'
  ]));
  if(opening&&(opening.debit||opening.credit))list.unshift(['Đầu kỳ',esc(view.organization??'An Phát'),
    opening.debit?num(money(opening.debit)):'—',opening.credit?num(money(opening.credit)):'—']);
  open(code+' · '+accountLabels[code],metrics([['Dư thuần Nợ − Có',money(summary.debit-summary.credit)]])+
    table(['Nguồn','Đối tác','Nợ','Có'],list,'Không có phát sinh trong phạm vi hiện tại.'));
}
function closing(){
  const model=view.closing;
  const blockers=model.checks.some(row=>row.count!==0);
  const pending=model.reopen.some(row=>['review','approved'].includes(row.status));
  const actions=view.locked?btn('Yêu cầu mở lại','form:reason:'+encodeURIComponent(JSON.stringify({action:'period.request'})),{style:'primary',glyph:'lock',disabled:pending}):
    operate('Khóa kỳ','form:confirm',{action:'period.lock',title:'Khóa kỳ tháng '+periodLabel()},{style:'primary',glyph:'lock',disabled:blockers});
  return heading('Chốt kỳ',view.actor.branch+' · '+(view.locked?'Đang khóa':'Đang mở'),btn('Kiểm tra sổ sách','go:ledger-review',{style:'soft'})+actions)+
   '<div class="stack">'+section('Điều kiện trước khi khóa',table(['Nhóm kiểm','Kết quả','Mở nơi xử lý'],model.checks.map(row=>[
    esc(row.name),row.count===0?chip('Đạt'):chip(row.count+' mục cần xử lý','wait'),link('Mở màn hình','go:'+row.to)
   ])))+section('Mốc đã chốt','<div class="padded">'+(model.snapshot?
    metrics([['Thời điểm',when(model.snapshot.when)],['Tiền gửi tại mốc',money(model.snapshot.sums.cash)],['Phải thu tại mốc',money(model.snapshot.sums.ar)]]):'Chưa có bản chốt kỳ.')+'</div>')+
    section('Luồng mở lại kỳ',table(['Yêu cầu','Lý do','Người duyệt','Trạng thái','Thao tác'],model.reopen.slice().reverse().map(row=>[
     esc(row.id),esc(row.reason),esc(row.approver||'—'),status(row.status),row.status==='approved'&&view.locked?operate('Áp dụng mở kỳ','send:period.apply',{id:row.id},{style:'primary'}):'—'
    ])))+'</div>';
}
function auditTable(data){
  return table(['Thời điểm','Vai trò','Hồ sơ','Thao tác','Mã lô'],data.map(row=>[esc(when(row.time)),esc(row.actor),esc(row.target),esc(row.message),esc(row.batch??'—')]));
}
function evidenceTable(){
  return table(['Yêu cầu','Bên gửi','Nội dung','Phản hồi'],rows('evidence').slice().reverse().map(row=>[
    esc(row.id),esc(row.owner),esc(row.question),row.answer?esc(row.answer):has('evidence.resolve')?
    operate('Trả lời','form:answer',{id:row.id},{style:'soft'}):chip('Chờ phản hồi','wait')
  ]));
}
function evidence(){
  const actions=has('evidence.ask.audit')?btn('Yêu cầu bằng chứng','form:evidence-audit',{style:'primary',glyph:'plus'}):'';
  const auditScope=view.actor.code==='KS'?'Tra dấu vết chứng từ đã ghi sổ và yêu cầu bằng chứng của bạn.':'Theo dõi yêu cầu và dấu vết hồ sơ theo phạm vi.';
  return heading('Bằng chứng và giải trình',auditScope,actions)+
    '<div class="stack">'+section('Yêu cầu trong kỳ',evidenceTable())+section('Nhật ký nghiệp vụ',auditTable(rows('audit')),
    has('evidence.export')?btn('Tải nhật ký CSV','export',{glyph:'download'}):'')+'</div>';
}
function administration(){
  const data=view.administration;
  return heading('Tài khoản và phạm vi','Cấu hình quyền cho các tài khoản thực hành trong bộ mẫu.')+
    '<div class="stack">'+section('Danh sách vai trò',table(['Vai trò','Chi nhánh','Hạn mức','Trạng thái','Cấu hình'],data.grants.map(item=>[
       esc(item.role),esc(item.branch),item.limit===null?'—':num(money(item.limit)),item.active?chip('Hoạt động'):chip('Tạm ngưng','neutral'),
       item.code==='QT'?'—':operate('Chỉnh phạm vi','form:grant',{code:item.code},{style:'soft'})
    ])))+section('Nhật ký quản trị',auditTable(data.audit))+
    section('Dữ liệu thực hành','<div class="padded stack">'+notice('Đặt lại bộ mẫu sẽ thay chứng từ và nhật ký nghiệp vụ của không gian này.',true)+
    '<div class="row-actions">'+operate('Khôi phục bộ mẫu','form:confirm',{action:'demo.reset',mode:'sample',title:'Khôi phục bộ mẫu An Phát'})+
    operate('Bắt đầu từ đầu kỳ','form:confirm',{action:'demo.reset',mode:'start',title:'Bắt đầu từ số dư đầu kỳ'})+'</div></div>')+'</div>';
}
function payroll(aggregate=false){
  return heading(aggregate?'Lương tổng hợp':'Bảng lương',aggregate?'Chỉ số tổng theo kỳ đi vào sổ.':'Kỳ '+periodLabel(),
    !aggregate?btn('Lập bảng lương','form:payroll',{style:'primary',glyph:'plus',disabled:!can('payroll.write')}):'')+
    section(aggregate?'Hồ sơ bàn giao':'Danh sách bảng lương',table(['Mã bảng','Kỳ',...(!aggregate?['Mã nhân sự']:[]),'Tổng','Trạng thái','Thao tác'],rows('payroll').slice().reverse().map(row=>[
      esc(row.id),esc(row.month),...(!aggregate?[esc(row.member)]:[]),num(money(row.total)),status(row.status),
      aggregate?(row.status==='submitted'?operate('Duyệt và lập phiếu','send:payroll.prepare',{id:row.id},{style:'soft',disabled:!can('payroll.post')}):
       row.docId?link(row.docId,'doc:'+row.docId):'—'):
       row.status==='draft'?operate('Chuyển số tổng','send:payroll.submit',{id:row.id},{style:'soft',disabled:!can('payroll.submit')}):'—'
    ])));
}
function portal(){
  const row=view.portal;
  if(!row)return heading('Hồ sơ được chia sẻ','Không có hồ sơ được chia sẻ trong phạm vi này.');
  return heading('Hồ sơ được chia sẻ',row.party+' · '+row.id)+
    '<div class="stack">'+section('Xác nhận công nợ','<div class="padded stack">'+metrics([['Giá trị chứng từ',money(row.original)],['Số còn phải trả',money(row.open)]])+
    '<div class="row-actions">'+btn('Gửi xác nhận hoặc báo chênh','form:portal',{style:'primary',glyph:'doc'})+'</div></div>')+
    section('Lịch sử phản hồi',table(['Mã','Thời điểm','Ý kiến','Nội dung'],row.replies.slice().reverse().map(item=>[
      esc(item.id),esc(when(item.time)),chip(item.status==='confirmed'?'Xác nhận':'Báo chênh',item.status==='disputed'?'wait':''),esc(item.note)
    ])))+'</div>';
}
function integration(){
  return heading('Sự kiện tích hợp mẫu','Mô phỏng tiếp nhận phản hồi hóa đơn và sao kê.',(has('event.simulate')?btn('Gửi sự kiện mẫu','form:event',{style:'primary',glyph:'plus'}):''))+
    section('Hộp nhận sự kiện',table(['Mã tham chiếu','Nguồn','Trạng thái','Số lần gửi lặp','Tiếp nhận'],rows('events').slice().reverse().map(row=>[
      esc(row.ref),esc(row.kind==='invoice'?'Phản hồi hóa đơn':'Thông báo sao kê'),status(row.status),num(fmt(row.duplicates)),esc(when(row.time))
    ])));
}
const screens={orders:()=>orderPage(false),warehouse:()=>orderPage(true),invoices:invoicePage,cash:cashPage,
 approvals:approvalPage,reports:()=>reports(false),management:()=>reports(true),closing,evidence,administration,payroll:()=>payroll(false),
 'payroll-summary':()=>payroll(true),portal,integration};
function render(){
  if(!accessible(page)){page='home';filter='all';}
  shell();
  if(page==='home'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<Workdesk view={view} navigation={navigation} cards={processCards()} period={periodLabel()} company={companyMode()}/>);
    return;
  }
  if(companyMode()&&page==='administration'){
    renderDirectory();
    updateTeam();
    return;
  }
  if(page==='documents'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<DocumentRegister key={[view.preferenceScope??'demo',view.actor.code,view.actor.branch,view.period].join(':')}
      view={view} filter={filter} kinds={kinds} statuses={statuses}
      setFilter={value=>{filter=routeFilter('documents',value);history.replaceState(null,'','#documents'+(filter==='all'?'':'/'+filter));render();}}
      actions={<>
        {can('doc.write')&&<Action action="form:payment" style="primary" glyph="plus">Lập phiếu thu hoặc chi</Action>}
        {['submit','post'].filter(operation=>batchSource(view,operation)!==null).map(operation=>
          <Action key={operation} action={'doc-batch:'+operation} style="soft">{documentBatchOperations[operation].title}</Action>)}
      </>}/>);
    return;
  }
  if(page==='ledger-review'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<LedgerReview key={[view.preferenceScope??'demo',view.actor.code,view.actor.branch,view.period,view.revision].join(':')} view={view}/>);
    return;
  }
  if(page==='stock'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<StockWorkspace key={(view.organization??'demo')+'-'+view.actor.code+'-'+view.actor.branch+'-'+view.period}
      period={view.period} branch={view.actor.branch} model={view.stockCard}/>);
    return;
  }
  if(page==='bank'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<BankWorkspace key={(view.organization??'demo')+'-'+view.actor.code+'-'+view.actor.branch+'-'+view.period+'-'+filter}
      initialStatus={filter==='unlinked'?'unlinked':''} rows={rows('bank')} period={view.period} branch={view.actor.branch} catalog={view.catalog} prepare={can('bank.prepare')}
      locked={view.locked} blocked={view.bankImportBlocked} showDemo={!companyMode()}
      reconciliation={view.bankReconciliation} saveBalance={(data,control)=>mutate('bank.checkpoint',data,control)}
      save={(data,control)=>mutate('bank.import',data,control)}/>);
    return;
  }
  if(page==='debts'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<DebtWorkspace key={(view.organization??'demo')+'-'+view.actor.code+'-'+view.actor.branch+'-'+view.period}
      rows={rows('debts')} replies={rows('portalReplies')} period={view.period} branch={view.actor.branch}
      locked={view.locked} canPayment={can('doc.write')}/>);
    return;
  }
  if(page==='opening'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<OpeningBalances key={view.actor.branch+'-'+view.revision} model={view.opening} catalog={view.catalog}
      branch={view.actor.branch} canApply={has('opening.apply')} save={(data,control)=>mutate('opening.stage',data,control)}/>);
    return;
  }
  if(page==='catalog'){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(<Catalog catalog={view.catalog} date={view.defaultDate} branch={view.actor.branch} />);
    return;
  }
  if(page==='management'&&view.report?.overview){
    if(!accountRoot)accountRoot=createRoot(main);
    accountRoot.render(
      <FinancialOverview key={[view.preferenceScope??'demo',view.actor.code,view.actor.branch,view.period].join(':')}
        preferenceScope={[view.preferenceScope??'demo',view.actor.code,view.actor.branch].join(':')} report={view.report} branch={view.actor.branchName} period={view.period}
        company={companyMode()} documents={view.documents??[]} canOpenDocuments={view.nav.includes('documents')} canOpenDebts={view.nav.includes('debts')}>
        {has('evidence.ask.management')&&(
          <div className="overview-actions">
            <Action action="form:evidence-management" style="soft" glyph="doc">Yêu cầu giải trình</Action>
            <Action action="management-followup">Theo dõi giải trình</Action>
          </div>
        )}
        {view.nav.includes('reports')&&<Action action="go:reports" style="soft">Mở sổ và báo cáo</Action>}
      </FinancialOverview>
    );
    return;
  }
  clearDirectory();
  main.innerHTML=screens[page]();
}

function field(label,name,kind='text',{value='',min=1,max=1000000000000,options=[],maxlength=250,required=true}={}){
  let control;
  if(kind==='select'){
    control='<select name="'+esc(name)+'"'+(required?' required':'')+'>'+options.map(([key,label])=>'<option value="'+esc(key)+'"'+(value===key?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
  }else if(kind==='textarea'){
    control='<textarea name="'+esc(name)+'" rows="3" maxlength="'+maxlength+'"'+(required?' required':'')+'>'+esc(value)+'</textarea>';
  }else{
    const rules=kind==='number'?' min="'+min+'" max="'+max+'" step="1"':kind==='date'?' min="'+esc(view.period)+'-01" max="'+esc(new Date(Date.UTC(Number(view.period.slice(0,4)),Number(view.period.slice(5)),0)).toISOString().slice(0,10))+'"':' maxlength="'+maxlength+'"';
    control='<input type="'+(kind==='calendar'?'date':kind)+'" name="'+esc(name)+'" value="'+esc(value)+'"'+rules+(required?' required':'')+'>';
  }
  return '<label class="field">'+esc(label)+control+'</label>';
}
function open(title,content,mode='default'){
  activeForm=null;
  dialog.classList.toggle('detail-drawer',mode==='detail');
  dialog.classList.toggle('utilities-dialog',mode==='utilities');
  dialog.classList.toggle('document-batch-dialog',mode==='batch');
  dialog.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+esc(title)+'</h2><button type="button" class="btn icon-only" data-act="dismiss" aria-label="Đóng">'+icon('close')+'</button></div><div class="dialog-body">'+content+'</div>';
  if(!dialog.open)dialog.showModal();
}
function openForm(title,body,label,action,data=values=>values){
  open(title,'<form class="stack" id="workspace-form">'+body+'<p class="error" role="alert"></p><div class="dialog-actions">'+
    btn('Hủy','dismiss')+'<button class="btn primary" type="submit">'+esc(label)+'</button></div></form>');
  activeForm={action,data};
}

const codedName=(code,name)=>code?code+' · '+name:name;
const catalogOptions=records=>[['','Chọn mã'],...records.map(row=>[row.id,codedName(row.code,row.name)+(row.unit?' ('+row.unit+')':'')])];
function filterCatalogChoices(defaultKind){
  if(!view.catalog)return;
  const formNode=dialog.querySelector('form');
  const dates=formNode.elements.namedItem('date');
  const kinds=formNode.elements.namedItem('kind');
  const refresh=()=>{
    const day=dates.value;
    const kind=kinds?.value??defaultKind;
    const partner=kind==='buy'||kind==='pay'?'supplier':'customer';
    for(const [name,records] of [['itemId',view.catalog.items],['partyId',view.catalog.parties]]){
      const select=formNode.elements.namedItem(name);
      if(!select)continue;
      const selected=select.value;
      const eligible=records.filter(row=>row.from<=day&&(!row.inactiveFrom||day<row.inactiveFrom)&&
        (!row.kind||row.kind===partner||row.kind==='both'));
      select.replaceChildren(...catalogOptions(eligible).map(([value,text])=>new Option(text,value,false,value===selected)));
    }
  };
  dates.addEventListener('change',refresh);
  kinds?.addEventListener('change',refresh);
  refresh();
}
const cast=(values,...names)=>({...values,...Object.fromEntries(names.map(name=>[name,Number(values[name])]))});
function form(kind,args){
  const actionDate=()=>field('Ngày hạch toán','date','date',{value:postingDateDefault()});
  const masters=(row={})=>view.catalog?
    field('Đối tác','partyId','select',{value:row.partyId??'',options:catalogOptions(view.catalog.parties)})+
    (row.bank?'':field('Mặt hàng','itemId','select',{value:row.itemId??'',options:catalogOptions(view.catalog.items)})):'';

  const layout=(...fields)=>'<div class="form-grid">'+fields.join('')+'</div>';
  const selectedWarehouse=view.actor.branch==='CN01'?'K01':'K02';
  switch(kind){
    case 'catalog-edit':{
      if(!has('catalog.write')||!Object.hasOwn(view.catalog,args.type))break;
      const row=view.catalog[args.type].find(item=>item.id===args.id);
      const isItem=args.type==='items';
      openForm(row?'Sửa tên '+row.code:isItem?'Thêm mặt hàng':'Thêm đối tác',
        layout(
          row?'':field('Mã','code','text',{maxlength:32}),
          field('Tên','name','text',{value:row?.name??'',maxlength:100}),
          row?'':field('Ngày bắt đầu','from','calendar',{value:view.period+'-01'}),
          row?'':isItem?field('Đơn vị tính','unit','text',{maxlength:18}):
            field('Nhóm đối tác','kind','select',{options:[['customer','Khách hàng'],['supplier','Nhà cung cấp'],['both','Cả hai']]})
        ),'Lưu danh mục','catalog.save',v=>({...v,type:args.type,id:row?.id}));
      break;
    }
    case 'catalog-status':{
      if(!has('catalog.write')||!Object.hasOwn(view.catalog,args.type))break;
      const row=view.catalog[args.type].find(item=>item.id===args.id);
      if(!row)break;
      openForm('Ngày ngừng sử dụng · '+row.code,notice('Ledo giữ các chứng từ đã ghi nhận với mã này.')+
        field('Ngừng sử dụng từ','inactiveFrom','calendar',{value:row.inactiveFrom??view.defaultDate}),
        'Lưu ngày ngừng','catalog.status',v=>({type:args.type,id:row.id,inactiveFrom:v.inactiveFrom}));
      break;
    }
    case 'order':
      openForm('Tạo đơn mua hoặc bán',layout(
        field('Nghiệp vụ','kind','select',{options:[['buy','Mua hàng'],['sell','Bán hàng']]}),
        actionDate(),field('Hạn thanh toán','dueDate','calendar',{required:false}),masters(),field('Số lượng','quantity','number',{value:standalone?'':10,max:1000000}),
        field('Đơn giá','price','number',{value:standalone?'':100000})
       )+notice('Kho '+selectedWarehouse)+(view.catalog&&(!view.catalog.parties.length||!view.catalog.items.length)?
        notice('Cần có mặt hàng và đối tác để lập đơn.')+btn('Mở danh mục','go:catalog'):''),'Gửi duyệt','order.create',v=>cast(v,'quantity','price'));
      filterCatalogChoices('buy');
      break;
    case 'order-revise':{
      const row=rows('orders').find(item=>item.id===args.id);
      if(!row)break;
      openForm('Bổ sung đơn '+row.id,layout(
        field('Ngày hạch toán','date','date',{value:row.date}),
        field('Hạn thanh toán','dueDate','calendar',{value:row.dueDate??'',required:false}),masters(row),field('Số lượng','quantity','number',{value:row.quantity,max:1000000}),
        field('Đơn giá','price','number',{value:row.price})
      ),'Lưu đơn','order.revise',v=>({...cast(v,'quantity','price'),id:row.id}));
      filterCatalogChoices(row.kind);
      break;
    }
    case 'invoice-import':{
      openForm('Nhập hóa đơn XML',
        '<div class="row-actions"><label class="file-choice">Chọn tệp XML<input type="file" id="invoice-file" accept=".xml,application/xml,text/xml"></label>'+
        btn('Dùng XML mẫu','invoice-template',{style:'quiet'})+'</div>'+
        field('Nội dung XML','xml','textarea',{maxlength:2500})+
        '<p class="subtle">Hỗ trợ cấu trúc XML mẫu của Ledo cho NCC01 và BINH01 trong kỳ 11/2026.</p>',
        'Kiểm tra và lưu','invoice.import');
      dialog.querySelector('#invoice-file').addEventListener('change',async event=>{
        const input=event.currentTarget;
        const file=input.files[0];
        if(!file)return;
        const error=dialog.querySelector('.error');
        if(file.size>3000){error.textContent='Tệp XML mẫu phải nhỏ hơn 3 KB.';input.value='';return;}
        try{
          const xml=await file.text();
          if(!input.isConnected)return;
          if(xml.length>2500){error.textContent='XML vượt giới hạn 2.500 ký tự.';input.value='';return;}
          dialog.querySelector('[name=xml]').value=xml;
          error.textContent='';
        }catch{error.textContent='Không đọc được tệp đã chọn.';}
      });
      break;
    }
    case 'invoice-link':{
      const options=rows('invoices').filter(row=>!row.link||row.link.receipt===args.receipt)
        .map(row=>[row.id,row.series+' / '+row.number+' · '+fmt(row.quantity)+' cái · '+money(row.price)]);
      if(!options.length){
        open('Gắn hóa đơn với phiếu nhận',notice('Chưa có XML khả dụng cho phiếu nhận này.')+
          '<div class="dialog-actions">'+btn('Mở hóa đơn đầu vào','go:invoices',{style:'primary'})+'</div>');
        break;
      }
      openForm('Gắn hóa đơn với phiếu nhận',notice(args.id+' · '+args.receipt)+
        field('Hóa đơn XML','invoice','select',{options}),'Gắn hóa đơn','order.link-invoice',v=>({...v,id:args.id,receipt:args.receipt}));
      break;
    }
    case 'receive':
      openForm(args.kind==='buy'?'Xác nhận nhận hàng':'Xác nhận giao hàng',notice(args.id+' · '+args.warehouse+' · Còn '+fmt(args.remaining)+' '+(args.unit??'cái'))+
        field('Số lượng thực tế','quantity','number',{value:args.remaining,max:args.remaining})+
        field('Ghi chú giao nhận','remark','text',{required:false,maxlength:120}),
        'Bàn giao cho kế toán','warehouse.confirm',v=>({...cast(v,'quantity'),id:args.id,warehouse:args.warehouse}));
      break;
    case 'invoice':
      openForm('Nhập số lượng hóa đơn',notice(args.id+' · '+args.receipt)+field('Số trên hóa đơn','quantity','number',{value:args.initial,min:0,max:1000000}),
        'Lưu và đối chiếu','order.invoice',v=>({...cast(v,'quantity'),id:args.id,receipt:args.receipt}));
      break;
    case 'stock-count':
      openForm('Ghi kiểm kê kho',notice('Kho '+selectedWarehouse)+field('Ngày kiểm kê','date','date',{required:false})+(view.catalog?field('Mặt hàng','itemId','select',{options:catalogOptions(view.catalog.items)}):'')+field('Số lượng kiểm đếm','quantity','number',{value:0,min:0,max:1000000}),
        'Lưu biên bản','warehouse.count',v=>({...cast(v,'quantity'),date:v.date||undefined,warehouse:selectedWarehouse}));
      break;
    case 'variance-cash':{
      const source=rows('varianceCashCases').find(row=>row.id===args.id);
      if(!source||source.available<=0||!can('cash.request'))break;
      const receipt=source.account==='1388';
      const preferred=postingDateDefault();
      const initial=preferred>source.date?preferred:source.date;
      openForm(receipt?'Lập phiếu thu bồi thường':'Lập phiếu chi khoản phải trả',
        notice(source.decision+' · '+source.party+' · Còn có thể lập '+money(source.available))+
        notice(receipt?'Tiền mặt · Nợ 111 / Có 1388.':'Tiền mặt · Nợ 3388 / Có 111.')+
        layout(field('Ngày hạch toán','date','date',{value:initial}),
          field('Số phiếu tham chiếu','receiptRef','text',{maxlength:60}),
          field('Số tiền (₫)','amount','number',{max:source.available}))+
        field('Diễn giải','reason','textarea'),'Lưu bản nháp','warehouse.cash',
        v=>({...cast(v,'amount'),id:source.id}));
      dialog.querySelector('[name=date]').min=source.date;
      break;
    }
    case 'variance-settlement':{
      const source=rows('varianceCases').find(row=>row.id===args.id);
      if(!source||source.available<=0||!can('doc.write'))break;
      const methods=varianceMethods[source.kind];
      const maximum=source.available;
      const preferred=postingDateDefault();
      const initial=preferred>source.date?preferred:source.date;
      openForm('Lập quyết định xử lý kiểm kê',notice(source.id+' · Còn có thể lập '+money(maximum))+
        layout(field('Số quyết định','decision','text',{maxlength:60}),field('Ngày hạch toán','date','date',{value:initial}))+
        layout(...methods.map(method=>field(method.label+' · TK '+method.account,'amount'+method.account,'number',{min:0,max:maximum,required:false})))+
        field('Đối tượng phải thu hoặc phải trả','party','text',{required:false,maxlength:100})+
        field('Lý do và căn cứ','reason','textarea')+'<p id="variance-preview" class="notice" aria-live="polite"></p>',
        'Lưu bản nháp','warehouse.settle',v=>({id:source.id,date:v.date,decision:v.decision,reason:v.reason,
          allocations:methods.flatMap(method=>Number(v['amount'+method.account])>0?
            [{account:method.account,value:Number(v['amount'+method.account]),party:v.party}]:[])}));
      const formNode=dialog.querySelector('form');
      const update=()=>{
        let total=0,requiresParty=false;
        for(const method of methods){
          const value=Number(formNode.elements.namedItem('amount'+method.account).value);
          total+=value;
          requiresParty||=method.requiresParty&&value>0;
        }
        formNode.elements.namedItem('party').required=requiresParty;
        dialog.querySelector('#variance-preview').textContent=total>maximum?
          'Vượt phần còn có thể xử lý '+money(total-maximum):'Đang lập '+money(total)+' · Sau khi lưu còn có thể lập '+money(maximum-total);
        dialog.querySelector('button[type=submit]').disabled=total<=0||total>maximum;
      };
      formNode.addEventListener('input',update);
      update();
      break;
    }
    case 'stock-adjust':{
      const row=rows('counts').find(item=>item.id===args.id);
      if(!row||!row.current||row.resolved||row.adjustmentId)break;
      const excess=row.delta>0;
      const caption=excess?'Nợ 156 / Có 3381. Nhập tổng trị giá phần thừa.':'Nợ 1381 / Có 156. Trị giá lấy theo bình quân tồn tại thời điểm kiểm kê.';
      openForm(excess?'Lập điều chỉnh nhập thừa':'Lập điều chỉnh xuất thiếu',notice(row.id+' · '+Math.abs(row.delta)+' '+(row.unit??'cái'))+
        notice(caption)+field('Ngày hạch toán','date','date',{value:row.date})+
        (excess?field('Tổng trị giá phần thừa (₫)','value','number'):metrics([['Trị giá dự kiến',money(row.estimatedValue)]]))+
        field('Lý do và căn cứ','reason','textarea'),'Lưu bản nháp','warehouse.adjust',v=>({...v,id:row.id,value:excess?Number(v.value):undefined}));
      break;
    }
    case 'payment':case 'cash-payment':{
      const options=rows('debts').filter(row=>row.open>0);
      if(!options.length){open('Lập phiếu thu hoặc chi',notice('Chưa có công nợ trong phạm vi để lập phiếu.'));break;}
      const selected=options.find(row=>row.id===args.id);
      const links=options.map(row=>[row.id,(row.kind==='sell'?'Thu ':'Chi ')+debtLabel(row)+' · '+money(row.open)]);
      openForm('Lập phiếu thu hoặc chi',layout(field('Chứng từ công nợ','source','select',{options:links,value:selected?.id}),actionDate(),
        field('Nguồn tiền','channel','select',{value:kind==='cash-payment'?'cash':'bank',options:[['bank','Ngân hàng'],['cash','Tiền mặt']]}),field('Số tiền','price','number'))+
        '<p id="payment-balance" class="notice" aria-live="polite"></p>'+
        field('Diễn giải','description','textarea',{required:false}),'Lưu nháp','doc.save',
        v=>({...cast(v,'price'),kind:options.find(item=>item.id===v.source).kind==='sell'?'receive':'pay'}));
      const paymentFields=dialog.querySelector('form').elements;
      const sourceField=paymentFields.namedItem('source');
      const amountField=paymentFields.namedItem('price');
      const dateField=paymentFields.namedItem('date');
      const updateBalance=()=>{
        const item=options.find(row=>row.id===sourceField.value);
        dateField.min=item.date>view.period+'-01'?item.date:view.period+'-01';
        if(dateField.value<dateField.min)dateField.value=dateField.min;
        amountField.max=String(item.open);
        dialog.querySelector('#payment-balance').textContent=typeLabel(item.kind)+' · Còn lại theo sổ '+money(item.open);
      };
      sourceField.addEventListener('change',updateBalance);
      updateBalance();
      break;
    }
    case 'revise':{
      const doc=rows('documents').find(row=>row.id===args.id);
      if(!doc)break;
      openForm('Sửa nháp '+doc.id,(['receive','pay'].includes(doc.kind)?field('Số tiền','amount','number',{value:doc.total}):'')+
        field('Diễn giải bổ sung','description','textarea',{value:doc.description}),'Lưu nội dung','doc.revise',v=>({...cast(v,'amount'),id:doc.id}));
      break;
    }
    case 'bank-add':
      openForm('Thêm dòng sao kê',layout(field('Mã giao dịch','ref','text',{maxlength:42}),actionDate(),
        field('Chiều tiền','kind','select',{options:[['receive','Thu'],['pay','Chi']]}),masters({bank:true}),field('Số tiền','amount','number')),
        'Thêm dòng','bank.add',v=>cast(v,'amount'));
      filterCatalogChoices('receive');
      break;
    case 'cash-verify':
      openForm('Xác nhận tiền thực tế',notice(args.id+' · Đã duyệt '+money(args.total))+
        field('Số thực nhận hoặc chi','actual','number',{value:args.total}),
        'Xác nhận','cash.verify',v=>({...cast(v,'actual'),id:args.id}));
      break;
    case 'cash-count':
      openForm('Ghi kiểm kê quỹ',field('Tiền thực đếm','actual','number',{min:0})+
        field('Ghi chú','remarks','text',{required:false}),'Lưu biên bản','cash.count',v=>cast(v,'actual'));
      break;
    case 'grant':{
      const item=view.administration.grants.find(row=>row.code===args.code);
      if(!item)break;
      openForm('Phạm vi · '+item.role,layout(field('Chi nhánh','branch','select',{value:item.branch,options:[['CN01','CN01 · An Phát'],['CN02','CN02 · Hải Phòng']]}),
        field('Trạng thái','active','select',{value:String(item.active),options:[['true','Hoạt động'],['false','Tạm ngưng']]}),
        ...(item.code==='PD'?[field('Hạn mức mỗi phiếu','limit','number',{value:item.limit})]:[]),
        ...(item.code==='KT'?[field('Quyền ghép với phiếu đã ghi','bankLink','select',{value:String(item.bankLink),options:[['false','Chỉ đề xuất'],['true','Cho phép xác nhận ghép']]} )]:[])),
        'Lưu phạm vi','role.update',v=>({...v,limit:Number(v.limit),role:item.code,bankLink:v.bankLink==='true',active:v.active==='true'}));
      break;
    }
    case 'reason':{
      const titles={'period.request':'Yêu cầu mở lại kỳ','doc.return':'Trả chứng từ','cash.resolve':'Giải trình chênh lệch quỹ','warehouse.resolve':'Đóng kiểm kê có giải trình','warehouse.void-adjustment':'Hủy chứng từ kiểm kê','order.return':'Trả lại đơn'};
      openForm(titles[args.action]??'Nhập lý do',field('Lý do','reason','textarea'),'Xác nhận',args.action,v=>({...v,id:args.id}));
      break;
    }
    case 'confirm':{
      const explanation=args.action==='demo.reset'?'Thay toàn bộ chứng từ và dữ liệu nghiệp vụ thực hành. Cấu hình vai trò vẫn được giữ.':
        args.action==='period.lock'?'Sau khi khóa, chứng từ trong kỳ không thể ghi thêm. Mở lại cần người khác duyệt.':
        args.action==='opening.apply'?'Sổ, tồn kho và công nợ của chi nhánh sẽ dùng bản số dư đã lưu.':
        args.action==='doc.restore'?'Phiếu trở về bản nháp. Ledo sẽ kiểm tra lại chứng từ nguồn trước khi phục hồi.':
        args.action==='opening.discard'?'Bỏ bản chờ. Bộ số dư đang dùng trên sổ vẫn được giữ.':'Bản nháp sẽ được hủy. Phiếu giao nhận có thể được dùng để lập lại chứng từ.';
      openForm(args.title,notice(explanation,args.action==='demo.reset'),'Xác nhận',args.action,()=>({id:args.id,mode:args.mode}));
      break;
    }
    case 'evidence-audit':case 'evidence-management':
      openForm(kind==='evidence-audit'?'Yêu cầu bằng chứng':'Yêu cầu giải trình',field('Nội dung cần đối chiếu','question','textarea'),'Gửi yêu cầu',
        kind==='evidence-audit'?'evidence.ask.audit':'evidence.ask.management');
      break;
    case 'answer':
      openForm('Trả lời yêu cầu',field('Phản hồi','answer','textarea'),'Gửi phản hồi','evidence.resolve',v=>({...v,id:args.id}));
      break;
    case 'payroll':
      openForm('Lập bảng lương',notice('Chỉ số tổng được gửi sang kế toán.')+
        field('Mã nhân sự','member','text',{value:standalone?'':'NV-MAU-01',maxlength:60})+field('Số phải trả','total','number',{max:100000000}),
        'Lưu bảng nháp','payroll.save',v=>cast(v,'total'));
      break;
    case 'portal':
      openForm('Gửi phản hồi công nợ',field('Ý kiến','status','select',{options:[['confirmed','Xác nhận số dư'],['disputed','Báo số liệu chênh']]} )+
        field('Nội dung','note','textarea',{maxlength:240}),'Gửi phản hồi','portal.reply');
      break;
    case 'event':
      openForm('Gửi sự kiện thực hành',field('Mã tham chiếu','ref','text',{value:'HDREQ-01',maxlength:42})+
        field('Nguồn sự kiện','kind','select',{options:[['invoice','Phản hồi hóa đơn'],['statement','Thông báo sao kê']]}),'Gửi sự kiện','integration.event');
      break;
  }
}
const browserSession=()=>window.sessionStorage;
const postingDateDefault=()=>preferredPostingDate(view,browserSession);

function openPostingDate(){
  if(!maySetPostingDate(view))return;
  open('Ngày hạch toán mặc định',
    notice('Áp dụng cho đơn, phiếu thu chi, xử lý chênh lệch kiểm kê và dòng sao kê nhập tay mới trong tab này.')+
    '<form id="posting-date-preference" class="stack">'+field('Ngày trong kỳ '+periodLabel(),'date','date',{value:postingDateDefault()})+
    '<p class="subtle">Chứng từ đã lưu giữ nguyên ngày. Ngày điền sẵn vẫn có thể đổi khi lập phiếu.</p>'+
    '<p class="error" role="alert"></p><div class="dialog-actions">'+btn('Dùng ngày hệ thống','posting-date-reset')+
    '<button class="btn primary" type="submit">Lưu ngày mặc định</button></div></form>');
}

function savePostingDate(value){
  if(!dialog.querySelector('#posting-date-preference')||!maySetPostingDate(view))return;
  const error=dialog.querySelector('#posting-date-preference .error');
  if(value!==null&&!postingDateInPeriod(value,view.period)){
    error.textContent='Chọn ngày hợp lệ trong kỳ đang mở.';
    return;
  }
  try{
    if(value===null)browserSession().removeItem(postingDateKey(view));
    else browserSession().setItem(postingDateKey(view),value);
  }catch{
    error.textContent='Trình duyệt không cho lưu thiết lập của tab này.';
    return;
  }
  hideModal();
  notify(value===null?'Đã dùng lại ngày hệ thống':'Ngày hạch toán mặc định '+date(value));
}

function showOrganization(){
  open('Thông tin đơn vị đang mở',metrics([
    ['Đơn vị',view.organization??'An Phát'],
    ['Chi nhánh',view.actor.branchName+' · '+view.actor.branch],
    ['Vai trò làm việc',view.actor.name],
    ['Người dùng',view.actor.person],
    ['Kỳ hạch toán',periodLabel()],
    ['Trạng thái kỳ',view.locked?'Đã khóa':'Đang mở']
  ])+'<div class="dialog-actions">'+btn('Chọn đơn vị','workspace-picker',{style:'soft'})+
   (accessible('administration')?btn(companyMode()?'Người dùng và phân quyền':'Tài khoản và phạm vi','go:administration',{style:'soft'}):'')+'</div>');
}

function roleChooser(){
  const options=view.roles.map(role=>'<button type="button" class="role-option'+(role.code===view.actor.code?' active':'')+'" data-act="role:'+role.code+'" aria-pressed="'+(role.code===view.actor.code)+'">'+
    '<span class="initial">'+esc(role.code)+'</span><span><b>'+esc(role.name)+'</b><small>'+esc(desks[role.code]?.title??role.person)+'</small></span>'+ (role.code===view.actor.code?icon('check'):'')+'</button>').join('');
  open(companyMode()?'Vai trò được cấp':'Chuyển vai trò thực hành',
   notice(companyMode()?'Quyền của từng vai trò được kiểm tra tại đơn vị và chi nhánh đang mở.':'Các tài khoản mẫu cùng thử trên dữ liệu An Phát.')+
   '<div class="role-grid">'+options+'</div>');
}
async function exportEvidence(){
  if(!has('evidence.export'))return;
  try{
    const response=await fetch('/api/audit.csv');
    if(!response.ok)throw new Error((await response.json()).error);
    const url=URL.createObjectURL(await response.blob());
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='Ledo_Nhat_ky_'+view.actor.branch+'.csv';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){notify(error.message);}
}
async function refresh(control){
  if(control)control.disabled=true;
  try{view=await request('/api/workspace');render();if(control)notify('Đã cập nhật dữ liệu');}
  catch(error){if(standalone&&error.status===401)await init();else notify(error.message);}
  finally{if(control?.isConnected)control.disabled=false;}
}
function parseAction(raw){
  const [verb,key,...rest]=raw.split(':');
  const tail=rest.join(':');
  try{return [verb,key,tail?JSON.parse(decodeURIComponent(tail)):{ }];}
  catch{return [verb,key,{}];}
}
document.addEventListener('click',event=>{
  const control=event.target.closest('[data-act]');
  if(!control||control.disabled)return;
  const [verb,key,args]=parseAction(control.dataset.act);
  switch(verb){
    case 'go':go(key);break;
    case 'focus':go(key,args.filter);main.querySelector('.workdesk-filters [aria-pressed="true"]')?.focus({preventScroll:true});break;
    case 'sidebar-size':{
      const compact=side.classList.toggle('is-compact');
      try{localStorage.setItem(sidebarKey,compact?'1':'0');}catch{}
      const label=compact?'Mở rộng thanh bên':'Thu gọn thanh bên';
      control.setAttribute('aria-expanded',String(!compact));
      control.setAttribute('aria-label',label);
      control.title=label;
      break;
    }
    case 'menu':
      side.classList.toggle('open');
      control.setAttribute('aria-expanded',String(side.classList.contains('open')));
      break;
    case 'doc-batch':
      showDocumentBatch({view,operation:key,open,dialog,kinds,
        preview:(data,revision)=>request('/api/actions/preview',{action:'documents.batch',data,revision}),
        commit:async(data,revision,button)=>{
          const result=await mutate('documents.batch',data,button,revision);
          if(result)open('Kết quả xử lý theo lô',notice(result.message)+'<p class="subtle">Mã lô '+esc(result.target)+'</p>'+batchResultTable(result.items,kinds));
          return result;
        }});
      break;
    case 'organization-info':showOrganization();break;
    case 'posting-date':openPostingDate();break;
    case 'posting-date-reset':savePostingDate(null);break;
    case 'utilities':showUtilities({view,standalone,period:periodLabel(),open,dialog});break;
    case 'roles':roleChooser();break;
    case 'management-followup':open('Theo dõi giải trình',evidenceTable());break;
    case 'auth-logout':request('/api/auth/logout',{}).then(()=>location.replace('/'),error=>notify(error.message));break;
    case 'workspace-picker':workspacePicker();break;
    case 'account-form':accountDialog(key,args);break;
    case 'account-select':accountChange('select',args,control);break;
    case 'invite-copy':{
      const field=dialog.querySelector('#invite-copy');
      if(!navigator.clipboard){field.select();break;}
      navigator.clipboard.writeText(field.value).then(()=>notify('Đã sao chép'),()=>field.select());
      break;
    }
    case 'role':selectRole(key,control);break;
    case 'refresh':refresh(control);break;
    case 'dismiss':hideModal();break;
    case 'form':form(key,args);break;
    case 'send':mutate(key,args,control);break;
    case 'doc':docDetail(key);break;
    case 'count':countDetail(key);break;
    case 'order':orderDetail(key);break;
    case 'invoice':invoiceDetail(key);break;
    case 'search':search();break;
    case 'invoice-template':fillInvoice();break;
    case 'account':account(key);break;
    case 'debt':debtDetail(args.id??key,args.at);break;
    case 'match':match(args.ref??key);break;
    case 'export':exportEvidence();break;
  }
});
dialog.addEventListener('submit',event=>{
  if(event.target.id==='posting-date-preference'){
    event.preventDefault();
    savePostingDate(new FormData(event.target).get('date'));
    return;
  }
  if(event.target.id!=='workspace-form'||!activeForm)return;
  event.preventDefault();
  const pairs=Object.fromEntries(new FormData(event.target));
  const {action,data,service}=activeForm;
  if(service==='account'){
    accountChange(action,data(pairs),event.submitter);
    return;
  }
  mutate(typeof action==='function'?action(pairs):action,data(pairs),event.submitter);
});
window.addEventListener('hashchange',()=>{
  if(!view)return;
  const desired=location.hash.slice(1);
  if(desired.startsWith('invite=')){activatePrompt(desired.slice(7));return;}
  const [route,nextFilter]=readRoute(desired);
  if(accessible(route)){page=route;filter=nextFilter;render();}
});
let directoryModel;
let teamModel;
let teamLoad=0;
const branchOptions=[['CN01','CN01 · Chi nhánh chính'],['CN02','CN02 · Chi nhánh 02']];
const companyMode=()=>view?.workMode==='company';

function accountForm(title,content,label,action,data=values=>values){
  openForm(title,content,label,action,data);
  activeForm.service='account';
}
async function accountChange(action,data,control){
  if(busy)return;
  busy=true;if(control)control.disabled=true;
  try{
    const result=await request('/api/account/'+action,data);
    if(['select','create','accept'].includes(action)){
      hideModal();
      teamModel=null;
      history.replaceState(null,'','#home');
      await init();
    }else{
      hideModal();
      if(page==='administration'&&companyMode())await updateTeam();
    }
    if(result.invite){
      const url=location.origin+'/#invite='+result.invite;
      open('Mã kích hoạt tài khoản',
        notice('Mã dùng một lần và chỉ mở được với đúng email đã khai báo.')+
        '<label class="field">Liên kết kích hoạt<input id="invite-copy" type="text" readonly value="'+esc(url)+'"></label>'+
        '<label class="field">Mã kích hoạt<input id="invite-token" type="text" readonly value="'+esc(result.invite)+'"></label>'+
        '<p class="subtle">Có hiệu lực đến '+esc(when(result.expiresAt))+'. Gửi liên kết hoặc mã cho người dùng qua kênh nội bộ. '+(standalone?'Người nhận mở link trên máy đang chạy Ledo.':'Người đó cần được cấp quyền mở site.')+'</p>'+
        '<div class="dialog-actions">'+btn('Sao chép liên kết','invite-copy',{style:'primary'})+'</div>');
    }else notify(result.message);
  }catch(error){
    if(dialog.open&&dialog.querySelector('.error'))dialog.querySelector('.error').textContent=error.message;
    else notify(error.message);
  }finally{
    busy=false;if(control?.isConnected)control.disabled=false;
  }
}
async function workspacePicker(){
  try{
    directoryModel=await request('/api/account');
    const list=directoryModel.organizations;
    open('Chọn không gian làm việc',
     '<div class="workspaces-list">'+list.map(item=>
       '<div class="space-entry"><div><strong>'+esc(item.name)+'</strong><small>'+esc(item.branch)+' · '+esc(item.roles.join(', '))+'</small></div>'+
       (item.active?operate('Mở đơn vị','account-select:item',{orgId:item.id},{style:'soft'}):chip('Không còn quyền','neutral'))+'</div>'
     ).join('')+
     (standalone?'':'<div class="space-entry"><div><strong>An Phát</strong><small>Dữ liệu thực hành</small></div>'+
     operate('Mở thực hành','account-select:item',{mode:'demo'},{style:'soft'})+'</div>')+'</div>'+
     '<div class="dialog-actions">'+btn('Nhập mã kích hoạt','account-form:accept')+
     (!directoryModel.hasOrganization?btn('Tạo đơn vị','account-form:create',{style:'primary'}):'')+'</div>');
  }catch(error){notify(error.message);}
}
function activatePrompt(code=''){
  accountForm('Kích hoạt tài khoản',
    field('Mã kích hoạt','code','text',{value:code,maxlength:36})+
    '<p class="subtle">Dùng tài khoản có cùng email đã được mời để kích hoạt.</p>',
    'Kích hoạt','accept',v=>({code:v.code.trim()}));
}
function memberForm(member=null){
  const choices=directoryModel.roleOptions.map(role=>'<label class="role-check"><input type="checkbox" name="role-'+esc(role.code)+'" value="'+esc(role.code)+'"'+
    (member?.roles.includes(role.code)||(member===null&&role.code==='KT')?' checked':'')+
    '><span><strong>'+esc(role.name)+'</strong><small>'+esc(role.lead)+'</small></span></label>').join('');
  const dateValue=member?.valid_until?new Date(member.valid_until+7*3600000).toISOString().slice(0,10):'';
  const update=Boolean(member);
  accountForm(update?'Điều chỉnh tài khoản':'Thêm người dùng',
    '<div class="form-grid">'+field('Họ và tên','name','text',{value:member?.display_name??'',maxlength:100})+
    (update?'<div class="field"><strong>Email đăng nhập</strong><p>'+esc(member.email)+'</p></div>':field('Email đăng nhập','email','email',{maxlength:200}))+
    field('Chi nhánh','branch','select',{value:member?.branch??'CN01',options:branchOptions})+
    '<label class="field">Hết quyền vào cuối ngày<input type="date" name="validUntil" value="'+esc(dateValue)+'"></label></div>'+
    '<fieldset class="role-options"><legend>Vai trò được cấp</legend>'+choices+'</fieldset>'+
    '<div class="form-grid">'+field('Hạn mức nếu có vai trò phê duyệt','limit','number',{value:member?.approval_limit??100000000})+
    '<label class="role-check"><input type="checkbox" name="bankLink" value="1"'+(member?.bank_link?' checked':'')+'><span><strong>Cho phép kế toán ghép phiếu đã ghi</strong><small>Áp dụng với Kế toán nghiệp vụ khi được cấp vai trò.</small></span></label></div>',
    update?'Lưu quyền':'Tạo mã kích hoạt',update?'update':'invite',values=>({
      name:values.name,email:values.email,branch:values.branch,validUntil:values.validUntil,
      roles:Object.entries(values).filter(([key])=>key.startsWith('role-')).map(([,value])=>value),
      limit:Number(values.limit),bankLink:values.bankLink==='1',id:member?.id,revision:member?.revision
    }));
}
async function accountDialog(action,args){
  if(action==='accept'){activatePrompt();return;}
  if(action==='create'){
    accountForm('Tạo đơn vị',
      field('Tên đơn vị','organization','text',{maxlength:100})+
      field('Họ và tên người quản trị','name','text',{maxlength:100})+
      (standalone?field('Tháng bắt đầu hạch toán','period','month',{value:localMonth()})+
        field('Mặt hàng đầu tiên (tùy chọn)','inventoryItem','text',{maxlength:100,required:false})+
        field('Số dư ngân hàng đầu kỳ','openingBank','number',{value:0,min:0})+
        field('Số dư tiền mặt đầu kỳ','openingCash','number',{value:0,min:0}):'')+
      '<p class="subtle">Đơn vị mới có sổ riêng và chưa có chứng từ.</p>',
      'Tạo đơn vị','create',v=>standalone?cast(v,'openingBank','openingCash'):v);
    return;
  }
  if(action==='invite'||action==='update'){
    try{
      directoryModel=await request('/api/account');
      const row=teamModel?.members.find(item=>item.id===args.id);
      if(action==='update'&&!row)return;
      memberForm(row??null);
    }catch(error){notify(error.message);}
    return;
  }
  const member=teamModel?.members.find(item=>item.id===args.id);
  if(!member)return;
  const label=action==='reissue'?'Cấp mã mới':member.status==='suspended'?'Mở lại truy cập':'Ngừng truy cập';
  accountForm(label,
    notice(member.display_name+' · '+member.email)+
    '<p class="subtle">'+(action==='reissue'?'Mã đang có sẽ hết hiệu lực.':member.status==='suspended'?'Tài khoản được dùng lại quyền đang cấp.':'Yêu cầu mới của người dùng sẽ bị từ chối. Hồ sơ đã tạo vẫn được giữ.')+'</p>',
    label,action,()=>({id:member.id,revision:member.revision,status:member.status==='suspended'?'active':'suspended'}));
}
function renderDirectory(error=null){
  if(!accountRoot)accountRoot=createRoot(main);
  accountRoot.render(<AccountDirectory key={view.organization+'-'+filter} initialSection={filter==='roles'?'roles':'members'}
    organization={view.organization} team={teamModel} roleOptions={directoryModel?.roleOptions??[]} navigation={navigation} error={error} />);
}
function clearDirectory(){
  if(!accountRoot)return;
  accountRoot.unmount();
  accountRoot=null;
}
async function updateTeam(){
  const run=++teamLoad;
  try{
    const [team,model]=await Promise.all([request('/api/account/members'),request('/api/account')]);
    if(run!==teamLoad||!companyMode()||page!=='administration')return;
    [teamModel,directoryModel]=[team,model];
    renderDirectory();
  }catch(error){
    if(run===teamLoad&&companyMode()&&page==='administration')renderDirectory(error.message);
  }
}

async function init(){
  const desired=location.hash.slice(1);
  const invitation=desired.startsWith('invite=')?desired.slice(7):'';
  try{
    const session=await request('/api/auth/session');
    standalone=session.standalone;
    if(standalone&&!session.signedIn){
      view=null;
      sideRoot.render(<Brand />);topRoot.render(null);
      if(!accountRoot)accountRoot=createRoot(main);
      accountRoot.render(<SignIn needsSetup={session.needsSetup} invitation={invitation} onSignIn={()=>location.reload()} />);
      return;
    }
    view=await request('/api/workspace');
    const [route,nextFilter]=readRoute(desired);
    page=accessible(route)?route:'home';
    filter=page===route?nextFilter:'all';
    if(desired&&page!==route)history.replaceState(null,'','#home');
    render();
    if(invitation)activatePrompt(invitation);
  }catch(error){
    clearDirectory();
    sideRoot.render(<Brand />);
    topRoot.render(null);
    view=null;
    main.innerHTML=heading('Không gian kế toán',error.message)+'<div class="row-actions">'+btn('Chọn đơn vị','workspace-picker',{style:'primary'})+
      (standalone?btn('Đăng xuất','auth-logout'):'<button type="button" class="btn" id="try-again">Thử lại</button>')+'</div>';
    document.querySelector('#try-again')?.addEventListener('click',init);
    if(standalone&&invitation&&(error.status===409||error.status===403))activatePrompt(invitation);
  }
}
init();
