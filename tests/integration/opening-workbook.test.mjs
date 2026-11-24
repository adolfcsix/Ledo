import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {readOpeningWorkbook,inspectOpeningWorkbook} from '../../frontend/src/features/opening/openingWorkbook.mjs';
import {normalizeOpening} from '../../backend/modules/accounting/opening.mjs';

const period='2026-11',branch='CN01';
const template=await readFile(new URL('../../frontend/src/features/opening/LEDO_MAU_SO_DU_DAU_KY.xlsx',import.meta.url));
const catalog={
  items:[{id:'item',code:'VT001',name:'Bình giữ nhiệt',unit:'cái',from:'2026-11-01'},
    {id:'later',code:'VT002',name:'Bình inox',unit:'cái',from:'2026-11-02'}],
  parties:[{id:'customer',code:'KH001',name:'Cửa hàng Mộc',kind:'customer',from:'2026-10-01'},
    {id:'supplier',code:'NCC001',name:'Công ty Bình An',kind:'supplier',from:'2026-10-01'}]
};
const inspect=book=>inspectOpeningWorkbook(book,catalog,period,branch);
async function fromTemplate(){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  return workbook;
}
function put(sheet,row,values){
  sheet.getRow(row).values=values;
}

test('Opening workbooks use the delivered template, preview joint totals and match backend normalization', async()=>{
  const initial=await readOpeningWorkbook(template,catalog,period,branch);
  assert.deepEqual(initial.totals,{debit:0,credit:0});
  assert.equal(initial.canLoad,true);

  const book=await fromTemplate();
  book.getWorksheet('Tài khoản').getCell('B2').value=100000;
  book.getWorksheet('Tài khoản').getCell('B5').value=184000;
  put(book.getWorksheet('Tồn kho'),4,[' vt001 ',2,40000]);
  put(book.getWorksheet('Công nợ'),3,['131','KH001','00017','20/10/2026',new Date('2026-11-20'),50000]);
  put(book.getWorksheet('Công nợ'),5,[331,'NCC001','00021','2026-10-21',null,6000]);
  const result=await readOpeningWorkbook(await book.xlsx.writeBuffer(),catalog,period,branch);
  assert.equal(result.canLoad,true);
  assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.totals,{debit:190000,credit:190000});
  assert.equal(result.data.debts[0].ref,'00017');
  assert.equal(result.data.debts[0].dueDate,'2026-11-20');
  assert.equal(result.data.debts[1].dueDate,null);

  const confirmed=normalizeOpening({catalog,period},branch,result.data,(ok,message)=>assert.ok(ok,message));
  assert.deepEqual(confirmed.stock,result.preview.stock);
  assert.deepEqual(confirmed.debts,result.preview.debts);
  assert.deepEqual(confirmed.totals,result.totals);

  book.getWorksheet('Tài khoản').getCell('B5').value=180000;
  const mismatch=inspect(book);
  assert.equal(mismatch.canLoad,false);
  assert.equal(mismatch.data,null);
  assert.deepEqual(mismatch.totals,{debit:190000,credit:186000});
});

test('Opening workbook diagnostic preserves original row numbers and blocks malformed rows', async()=>{
  const book=await fromTemplate();
  const accounts=book.getWorksheet('Tài khoản'),stock=book.getWorksheet('Tồn kho'),debt=book.getWorksheet('Công nợ');
  put(accounts,9,['111',2000]);
  put(accounts,10,['131',2000]);
  put(stock,3,['VT001',1,200]);
  put(stock,5,['VT001',1,200]);
  put(stock,7,['VT002',1,200]);
  put(stock,8,['UNKNOWN',1,200]);
  put(stock,10,['VT001',1,{formula:'100+100',result:200}]);
  put(stock,12,['VT001',1,50,'Bên ngoài mẫu']);
  put(debt,4,[131,'NCC001','A1','2026-10-20',null,20]);
  put(debt,6,[131,'KH001','A1','2026-11-01',null,20]);
  put(debt,8,[131,'KH001',123,'2026-10-30',null,20]);
  put(debt,10,[131,'KH001','A1','2026-10-29','2026-10-28',20]);
  put(debt,12,[131,'KH001','A1','2026-10-29',null,20]);
  put(debt,14,[131,'KH001','a1','2026-10-30',null,20]);
  const result=inspect(book);
  assert.equal(result.data,null);
  for(const [sheet,row,reason] of [
    ['Tài khoản',9,/đã có/],['Tài khoản',10,/Chỉ nhập/],
    ['Tồn kho',5,/chỉ có một dòng/],['Tồn kho',7,/hiệu lực/],['Tồn kho',8,/không có/],
    ['Tồn kho',10,/giá trị tĩnh/],['Tồn kho',12,/ngoài các cột/],
    ['Công nợ',4,/đúng nhóm/],['Công nợ',6,/trước ngày mở sổ/],['Công nợ',8,/văn bản/],
    ['Công nợ',10,/Hạn thanh toán/],['Công nợ',14,/bị trùng/]
  ]){
    assert.match(result.issues.find(issue=>issue.sheet===sheet&&issue.row===row)?.message??'',reason);
  }
  assert.equal(result.issues.length,12);
});

test('Opening import rejects invalid files, modified column headers and oversized detail counts', async()=>{
  await assert.rejects(readOpeningWorkbook(new Uint8Array([1,2,3]),catalog,period,branch),/Không đọc được/);
  await assert.rejects(readOpeningWorkbook(new Uint8Array(2*1024*1024+1),catalog,period,branch),/tối đa 2 MB/);
  const book=await fromTemplate();
  book.getWorksheet('Tồn kho').getCell('A1').value='Tên mặt hàng';
  book.removeWorksheet(book.getWorksheet('Công nợ').id);
  assert.deepEqual(inspect(book).issues.map(({sheet,row})=>[sheet,row]),[['Tồn kho',1],['Công nợ',null]]);
  const larger=await fromTemplate();
  for(let row=2;row<=42;row++) put(larger.getWorksheet('Công nợ'),row,[131,'KH001','A-'+row,'2026-10-20',null,20]);
  assert.match(inspect(larger).issues[0].message,/40 dòng/);
});
