import {documentBatchLimit, documentBatchOperations} from '../../../../shared/documentBatch.mjs';
import {filters, pendingCash, readyToPost} from '../workdesk/workdesk.mjs';
import {btn, esc, link, notice, num, table} from '../../ui/render.js';
import './documentBatch.css';

const batches = {
  submit: {cap:'doc.submit', route:'documents', rows:view=>(view.documents??[]).filter(row=>filters.documents.mine[1](row))},
  approve: {cap:'approve', route:'approvals', rows:view=>(view.approvals??[]).filter(row=>filters.approvals.vouchers[1](row,view))},
  verify: {cap:'cash.confirm', route:'cash', rows:view=>(view.cash?.requests??[]).filter(row=>pendingCash(row)&&!row.mine)},
  post: {cap:'doc.post', route:'documents', rows:view=>(view.documents??[]).filter(readyToPost)}
};

export function batchSource(view,operation){
  if(!Object.hasOwn(batches,operation)||view.locked)return null;
  const batch=batches[operation];
  if(!view.nav.includes(batch.route)||!view.caps.includes(batch.cap))return null;
  return batch.rows(view);
}

export function batchButton(view,operation){
  if(batchSource(view,operation)===null)return '';
  return btn(documentBatchOperations[operation].title,'doc-batch:'+operation,{style:'soft',glyph:'check'});
}

const normalize=value=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');
const textDate=value=>value?.split('-').reverse().join('/')??'—';
const currency=new Intl.NumberFormat('vi-VN');
const money=value=>currency.format(value)+' ₫';

export function showDocumentBatch({view,operation,open,dialog,kinds,preview,commit}){
  const available=batchSource(view,operation);
  if(available===null)return;
  const {title}=documentBatchOperations[operation];
  const needsActual=operation==='verify';
  const selected=new Set();
  const actual=new Map();
  const types=[...new Set(available.map(row=>row.kind))];
  const helper=needsActual?'Nhập số tiền thực đếm riêng cho từng phiếu. Lô chỉ được lưu khi tất cả số tiền khớp và quỹ đủ chi.':
    operation==='post'?'Máy chủ kiểm tra theo ngày hạch toán. Khi một chứng từ có lỗi, toàn bộ lô được giữ nguyên.':
    'Máy chủ kiểm tra từng chứng từ theo phạm vi và quyền của bạn trước khi lưu cả lô.';
  open(title,'<div class="batch-root stack">'+notice(helper)+
    '<div class="batch-filters"><label class="field">Tìm phiếu<input type="search" name="query" placeholder="Mã phiếu hoặc đối tác"></label>'+
    '<label class="field">Nghiệp vụ<select name="kind"><option value="">Tất cả</option>'+types.map(type=>'<option value="'+esc(type)+'">'+esc(kinds[type]??type)+'</option>').join('')+'</select></label>'+
    '<label class="field">Từ ngày<input type="date" name="from"></label><label class="field">Đến ngày<input type="date" name="to"></label></div>'+
    '<p data-batch-count class="subtle" aria-live="polite"></p><div class="row-actions"><button type="button" class="btn soft" data-batch-select>Chọn phiếu đang hiển thị</button>'+
    '<button type="button" class="btn" data-batch-clear>Bỏ chọn tất cả</button></div><div data-batch-table></div>'+
    '<div data-batch-review class="stack" aria-live="polite"></div><div class="dialog-actions">'+btn('Đóng','dismiss')+
    '<button type="button" class="btn soft" data-batch-preview>Kiểm tra lô</button>'+
    '<button type="button" class="btn primary" data-batch-commit hidden>'+esc(title)+'</button></div></div>','batch');

  const root=dialog.querySelector('.batch-root');
  const target=root.querySelector('[data-batch-table]');
  const summary=root.querySelector('[data-batch-count]');
  const review=root.querySelector('[data-batch-review]');
  const selectButton=root.querySelector('[data-batch-select]');
  const clearButton=root.querySelector('[data-batch-clear]');
  const previewButton=root.querySelector('[data-batch-preview]');
  const commitButton=root.querySelector('[data-batch-commit]');
  let checked=null;
  let visible=[];
  let checking=false;

  function status(){
    summary.textContent='Đang xem '+visible.length+'/'+available.length+' phiếu · Đã chọn '+selected.size+'/'+documentBatchLimit;
    previewButton.disabled=checking||!selected.size;
    selectButton.disabled=!visible.length||selected.size>=documentBatchLimit;
    clearButton.disabled=!selected.size;
  }
  function invalidate(){
    checked=null;
    review.innerHTML='';
    commitButton.hidden=true;
  }
  function draw(){
    const {value:kind}=root.querySelector('[name=kind]');
    const from=root.querySelector('[name=from]').value;
    const to=root.querySelector('[name=to]').value;
    const query=normalize(root.querySelector('[name=query]').value.trim());
    const invalidRange=from&&to&&from>to;
    visible=invalidRange?[]:available.filter(row=>(!kind||row.kind===kind)&&(!from||row.date>=from)&&(!to||row.date<=to)&&
      normalize([row.id,row.party].filter(Boolean).join(' ')).includes(query));
    target.innerHTML=table(['Chọn','Mã phiếu','Nghiệp vụ','Đối tác','Ngày hạch toán','Giá trị',...(needsActual?['Thực tế']:[])],visible.map(row=>{
      const isSelected=selected.has(row.id);
      const date=textDate(row.date);
      return [
        '<input type="checkbox" data-batch-id="'+esc(row.id)+'" aria-label="Chọn '+esc(row.id)+'"'+(isSelected?' checked':'')+'>',
        needsActual?esc(row.id):link(row.id,'doc:'+row.id),esc(kinds[row.kind]??row.kind),esc(row.party),esc(date),num(money(row.total)),
        ...(needsActual?['<input class="batch-actual" type="number" min="1" max="1000000000000" step="1" inputmode="numeric" data-batch-actual="'+esc(row.id)+
          '" value="'+esc(actual.get(row.id)??'')+'" aria-label="Số tiền thực tế của '+esc(row.id)+'"'+(isSelected?'':' disabled')+'>']:[])
      ];
    }),invalidRange?'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.':'Không có phiếu phù hợp.');
    status();
  }
  root.querySelector('.batch-filters').addEventListener('input',draw);
  target.addEventListener('change',event=>{
    const id=event.target.dataset.batchId;
    if(!id)return;
    if(event.target.checked&&selected.size>=documentBatchLimit){event.target.checked=false;return;}
    if(event.target.checked)selected.add(id);
    else selected.delete(id);
    const field=event.target.closest('tr').querySelector('[data-batch-actual]');
    if(field)field.disabled=!event.target.checked;
    invalidate();status();
  });
  target.addEventListener('input',event=>{
    const id=event.target.dataset.batchActual;
    if(!id)return;
    actual.set(id,event.target.value);
    invalidate();
  });
  selectButton.addEventListener('click',()=>{
    for(const row of visible){
      if(selected.size>=documentBatchLimit)break;
      selected.add(row.id);
    }
    invalidate();draw();
  });
  clearButton.addEventListener('click',()=>{
    selected.clear();invalidate();draw();
  });
  previewButton.addEventListener('click',async()=>{
    invalidate();
    const entries=Array.from(selected,id=>needsActual?{id,actual:Number(actual.get(id))}:{id});
    if(needsActual&&entries.some(entry=>!Number.isSafeInteger(entry.actual)||entry.actual<1||entry.actual>1e12)){
      review.innerHTML=notice('Nhập số tiền thực tế hợp lệ cho tất cả phiếu đã chọn, kể cả phiếu ngoài bộ lọc.',true);
      return;
    }
    const signature=JSON.stringify(entries);
    checking=true;status();
    try{
      const data={operation,entries};
      const result=await preview(data,view.revision);
      if(!root.isConnected||!dialog.open||signature!==JSON.stringify(Array.from(selected,id=>needsActual?{id,actual:Number(actual.get(id))}:{id})))return;
      if(!result.ok){
        review.innerHTML=notice(result.failure.id+' · '+result.failure.message+' Chưa lưu chứng từ nào.',true);
        return;
      }
      checked=data;
      review.innerHTML=notice('Đã kiểm tra '+result.items.length+' phiếu. Xem lại danh sách rồi xác nhận.')+batchResultTable(result.items,kinds);
      commitButton.hidden=false;
    }catch(error){review.innerHTML=notice(error.message,true);}
    finally{checking=false;status();}
  });
  commitButton.addEventListener('click',async()=>{
    if(!checked)return;
    const result=await commit(checked,view.revision,commitButton);
    if(!result&&root.isConnected){checked=null;commitButton.hidden=true;}
  });
  draw();
}

export function batchResultTable(items,kinds){
  return table(['Mã phiếu','Ngày hạch toán','Nghiệp vụ','Giá trị'],items.map(row=>
    [esc(row.id),esc(textDate(row.date)),esc(kinds[row.kind]??row.kind),num(money(row.total))]));
}
