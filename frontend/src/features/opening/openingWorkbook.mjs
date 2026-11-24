import {normalizeOpening,openingAccounts} from '../../../../backend/modules/accounting/opening.mjs';

export const workbookLimit=2*1024*1024;
export const workbookColumns={
  accounts:{name:'Tài khoản',headers:['Mã tài khoản','Số dư (VND)']},
  stock:{name:'Tồn kho',headers:['Mã hàng','Số lượng','Trị giá (VND)']},
  debts:{name:'Công nợ',headers:['Loại công nợ','Mã đối tác','Số chứng từ gốc','Ngày chứng từ','Hạn thanh toán','Số dư (VND)']}
};
const labels={'111':'Tiền mặt','112':'Tiền gửi ngân hàng','334':'Phải trả người lao động','411':'Vốn đầu kỳ'};
export const openingAccountLabels=labels;
const maxAmount=1e12;
const ensure=(condition,message)=>{if(!condition) throw new Error(message);};
const clean=value=>typeof value==='string'?value.trim():value;
const blank=value=>value==null||clean(value)==='';
const code=value=>typeof value==='string'||typeof value==='number'?String(value).trim().toUpperCase():'';
const formatDate=value=>{
  if(value instanceof Date) return Number.isFinite(+value)?value.toISOString().slice(0,10):'';
  if(typeof value!=='string') return '';
  const text=value.trim(), vn=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return vn? [vn[3],vn[2],vn[1]].join('-'):text;
};
function integer(value,field,min,max){
  value=clean(value);
  const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
  ensure(Number.isSafeInteger(n)&&n>=min&&n<=max,field+' phải là số nguyên từ '+min.toLocaleString('vi-VN')+' đến '+max.toLocaleString('vi-VN')+'.');
  return n;
}
function dataRows(book,group,issues){
  const {name,headers}=workbookColumns[group], sheet=book.getWorksheet(name);
  const report=(row,message)=>issues.push({sheet:name,row,message});
  if(!sheet){report(null,'Thiếu trang tính. Hãy dùng đúng tệp mẫu Ledo.');return [];}
  const titles=sheet.getRow(1);
  if(!headers.every((name,i)=>clean(titles.getCell(i+1).value)===name)){
    report(1,'Tên và thứ tự cột phải đúng tệp mẫu.');return [];
  }
  if(sheet.rowCount>500||sheet.columnCount>30){
    report(null,'Trang tính vượt vùng đọc 500 dòng hoặc 30 cột. Hãy chép dữ liệu sang tệp mẫu mới.');return [];
  }
  const rows=[];
  for(let number=1;number<=sheet.rowCount;number++){
    const row=sheet.getRow(number);
    const values=Array.from({length:row.cellCount},(_,i)=>row.getCell(i+1).value);
    if(values.slice(headers.length).some(value=>!blank(value))){
      report(number,'Có dữ liệu ngoài các cột mẫu. Kiểm tra lại vị trí các cột.');continue;
    }
    if(number===1||values.every(blank)) continue;
    if(values.some(value=>value!=null&&typeof value==='object'&&!(value instanceof Date))){
      report(number,'Ô dữ liệu phải là giá trị tĩnh. Hãy dán theo chế độ Chỉ giá trị, bỏ công thức và liên kết.');continue;
    }
    rows.push({number,values});
  }
  return rows;
}
export function inspectOpeningWorkbook(book,catalog,period,branch){
  const issues=[], accounts={}, accountRows={}, stock=[], debts=[], source={stock:[],debts:[]};
  const raw=Object.fromEntries(Object.keys(workbookColumns).map(group=>[group,dataRows(book,group,issues)]));
  function read(group,handler){
    for(const {number,values} of raw[group]){
      try {handler(values,number);}
      catch(error){issues.push({sheet:workbookColumns[group].name,row:number,message:error.message});}
    }
  }
  read('accounts',([account,balance],row)=>{
    const key=code(account);
    ensure(openingAccounts.includes(key),'Chỉ nhập 111, 112, 334 hoặc 411. Khai chi tiết 131, 331 và 156 ở Công nợ, Tồn kho.');
    ensure(!Object.hasOwn(accounts,key),'Mã tài khoản '+key+' đã có ở dòng '+accountRows[key]+'.');
    accounts[key]=integer(balance,'Số dư',0,maxAmount);
    accountRows[key]=row;
  });
  for(const key of openingAccounts){
    if(!Object.hasOwn(accounts,key)) issues.push({sheet:workbookColumns.accounts.name,row:null,message:'Thiếu số dư tài khoản '+key+' · '+labels[key]+'. Nhập 0 nếu không có số dư.'});
  }
  read('stock',([item,quantity,value],row)=>{
    const match=catalog.items.find(entry=>code(entry.code)===code(item));
    ensure(match,'Mã hàng '+(code(item)||'bỏ trống')+' không có trong Danh mục.');
    stock.push({itemId:match.id,quantity:integer(quantity,'Số lượng',1,1e6),value:integer(value,'Trị giá',0,maxAmount)});
    source.stock.push(row);
  });
  read('debts',([type,party,ref,date,dueDate,amount],row)=>{
    const kind={131:'sell',331:'buy'}[code(type)];
    ensure(kind==='sell'||kind==='buy','Nhập 131 cho phải thu hoặc 331 cho phải trả.');
    const match=catalog.parties.find(entry=>code(entry.code)===code(party));
    ensure(match,'Mã đối tác '+(code(party)||'bỏ trống')+' không có trong Danh mục.');
    ensure(typeof ref==='string'&&ref.trim(),'Nhập số chứng từ gốc bằng văn bản để giữ nguyên số 0 ở đầu.');
    debts.push({kind,partyId:match.id,ref,date:formatDate(date),dueDate:blank(dueDate)?'':formatDate(dueDate)||'?',amount:integer(amount,'Số dư',1,maxAmount)});
    source.debts.push(row);
  });
  const limitExceeded=raw.stock.length+raw.debts.length>40;
  if(limitExceeded) issues.push({sheet:'Tồn kho / Công nợ',row:null,message:'Giới hạn 40 dòng chi tiết trong một bộ số dư.'});
  const diagnostics=[];
  const normalized=limitExceeded?null:normalizeOpening({catalog,period},branch,{
    accounts:Object.fromEntries(openingAccounts.map(key=>[key,accounts[key]??0])),stock,debts
  },ensure,diagnostics);
  for(const {group,index,message} of diagnostics){
    issues.push({sheet:workbookColumns[group].name,row:source[group][index],message});
  }
  const totals=issues.length===0?normalized.totals:null;
  const canLoad=totals!==null&&totals.debit===totals.credit;
  return {issues,totals,canLoad,preview:normalized,accountRows,
    data:canLoad?{accounts:normalized.accounts,stock:normalized.stock,debts:normalized.debts}:null};
}
export async function readOpeningWorkbook(bytes,catalog,period,branch){
  ensure(bytes.byteLength<=workbookLimit,'Tệp Excel tối đa 2 MB.');
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  try {await book.xlsx.load(bytes);}
  catch {throw new Error('Không đọc được sổ Excel. Hãy lưu lại dưới dạng .xlsx, bỏ mật khẩu và thử lại.');}
  return inspectOpeningWorkbook(book,catalog,period,branch);
}
