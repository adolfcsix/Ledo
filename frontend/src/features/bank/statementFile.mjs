import {statementColumns,statementLimit} from '../../../../backend/modules/accounting/bankStatement.mjs';

export const bankFileLimit=2*1024*1024;
const clean=value=>typeof value==='string'?value.trim():value;
const empty=value=>value==null||clean(value)==='';
const headerMatches=cells=>statementColumns.every((column,i)=>clean(cells[i])===column)&&cells.slice(statementColumns.length).every(empty);
function parseCsv(text,delimiter){
  const records=[];
  let cells=[], value='', quoted=false, closed=false, line=1, start=1;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'){
        if(text[i+1]==='"'){value+='"';i++;}
        else {quoted=false;closed=true;}
      }else{
        if(char==='\n'||(char==='\r'&&text[i+1]!=='\n'))line++;
        value+=char;
      }
      continue;
    }
    if(char===delimiter){cells.push(value);value='';closed=false;continue;}
    if(char==='\n'||char==='\r'){
      records.push({line:start,cells:[...cells,value]});
      if(char==='\r'&&text[i+1]==='\n')i++;
      line++;start=line;cells=[];value='';closed=false;
      continue;
    }
    if(closed||(char==='"'&&value))throw new Error('Dòng '+start+' có dấu ngoặc kép sai định dạng CSV.');
    if(char==='"')quoted=true;
    else value+=char;
  }
  if(quoted)throw new Error('Dòng '+start+' có ô chưa đóng ngoặc kép.');
  if(cells.length||value||closed)records.push({line:start,cells:[...cells,value]});
  return records;
}
function csvRows(bytes){
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}
  catch{throw new Error('Tệp CSV phải dùng mã hóa UTF-8.');}
  const header=text.split(/\r\n|\r|\n/,1)[0];
  const delimiter=[',',';','\t'].find(candidate=>{
    try{return headerMatches(parseCsv(header,candidate)[0]?.cells??[]);}
    catch{return false;}
  });
  if(!delimiter)throw new Error('Tên hoặc thứ tự cột CSV khác mẫu của Ledo.');
  return parseCsv(text,delimiter);
}
async function excelRows(bytes){
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  try{await book.xlsx.load(bytes);}catch{throw new Error('Không đọc được Excel. Hãy lưu tệp .xlsx không có mật khẩu.');}
  const sheet=book.getWorksheet('Sao kê');
  if(!sheet)throw new Error('Thiếu trang tính Sao kê. Hãy dùng đúng tệp mẫu Ledo.');
  if(sheet.rowCount>500||sheet.columnCount>30)throw new Error('Trang tính vượt vùng đọc 500 dòng hoặc 30 cột.');
  return Array.from({length:sheet.rowCount},(_,index)=>{
    const row=sheet.getRow(index+1);
    return {line:index+1,cells:Array.from({length:row.cellCount},(_,i)=>row.getCell(i+1).value)};
  });
}
function readDate(value){
  if(value instanceof Date)return Number.isFinite(+value)?value.toISOString().slice(0,10):'';
  if(typeof value!=='string')return '';
  const date=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return date?date[3]+'-'+date[2]+'-'+date[1]:value;
}
function readAmount(value){
  if(empty(value))return 0;
  if(typeof value==='number')return value;
  if(typeof value==='string'&&/^\d+$/.test(value))return Number(value);
  return NaN;
}
function interpret({line,cells}){
  if(cells.slice(6).some(value=>!empty(value)))return {line,error:'Có dữ liệu ngoài sáu cột của mẫu.'};
  if(cells.some((value,i)=>value!=null&&typeof value==='object'&&!(i===1&&value instanceof Date)))
    return {line,error:'Chỉ dùng giá trị tĩnh. Bỏ công thức và liên kết trong ô.'};
  const [ref,date,incoming,outgoing,partyCode,note]=cells.map(clean);
  if((!empty(ref)&&typeof ref!=='string')||(!empty(partyCode)&&typeof partyCode!=='string'))
    return {line,error:'Mã giao dịch và mã đối tác cần ở dạng văn bản để giữ số 0 đầu.'};
  const credit=readAmount(incoming), debit=readAmount(outgoing);
  const validAmounts=[credit,debit].every(value=>Number.isSafeInteger(value)&&value>=0);
  if(!validAmounts)return {line,error:'Tiền vào và Tiền ra dùng số nguyên VND, không gõ dấu phân cách vào ô văn bản.'};
  if((credit>0)===(debit>0))return {line,error:'Chỉ điền một cột Tiền vào hoặc Tiền ra có số tiền lớn hơn 0.'};
  return {line,partyCode:(partyCode??'').toUpperCase(),data:{ref:ref??'',date:readDate(date),
    kind:credit?'receive':'pay',amount:credit||debit,note:note==null?'':String(note)}};
}
export async function readStatementFile(bytes,name){
  if(bytes.byteLength>bankFileLimit)throw new Error('Tệp sao kê tối đa 2 MB.');
  const records=/\.csv$/i.test(name)?csvRows(bytes):/\.xlsx$/i.test(name)?await excelRows(bytes):null;
  if(!records)throw new Error('Chọn tệp .csv hoặc .xlsx.');
  if(!headerMatches(records[0]?.cells??[]))throw new Error('Tên hoặc thứ tự cột khác mẫu của Ledo.');
  const lines=records.slice(1).filter(row=>!row.cells.every(empty));
  if(!lines.length||lines.length>statementLimit)throw new Error('Tệp cần từ 1 đến '+statementLimit+' giao dịch.');
  return lines.map(interpret);
}
