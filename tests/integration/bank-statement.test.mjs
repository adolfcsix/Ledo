import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {inspectBankBatch,statementColumns} from '../../backend/modules/accounting/bankStatement.mjs';
import {readStatementFile} from '../../frontend/src/features/bank/statementFile.mjs';

const context={period:'2026-11',catalog:{parties:[
  {id:'abc',code:'KH001',name:'Cửa hàng Mộc',kind:'customer',from:'2026-01-01',inactiveFrom:null},
  {id:'xyz',code:'NCC001',name:'Công ty An',kind:'supplier',from:'2026-01-01',inactiveFrom:null},
  {id:'old',code:'NCC002',name:'Công ty cũ',kind:'supplier',from:'2026-01-01',inactiveFrom:'2026-11-21'}
]},existing:[]};
const bytes=text=>new TextEncoder().encode(text);

test('CSV recognizes UTF-8 headers, quoted fields, date forms and real row numbers',async()=>{
  const table='\uFEFF'+statementColumns.join(';')+'\r\n001;20/11/2026;250000;;kh001;"Tiền; đối chiếu ""A"""\r\n\r\n002;2026-11-21;;120000;;Chi\r\n';
  const rows=await readStatementFile(bytes(table),'SAO_KE.csv');
  assert.deepEqual(rows.map(row=>row.line),[2,4]);
  assert.deepEqual(rows[0],{line:2,partyCode:'KH001',data:{ref:'001',date:'2026-11-20',kind:'receive',amount:250000,note:'Tiền; đối chiếu "A"'}});
  assert.equal(rows[1].data.kind,'pay');
  const checked=inspectBankBatch(rows.map(row=>row.data),context);
  assert.deepEqual(checked.map(row=>row.status),['partner','partner']);
  const selected=inspectBankBatch(rows.map((row,i)=>({...row.data,partyId:i?'xyz':'abc'})),context);
  assert.deepEqual(selected.map(row=>row.status),['ready','ready']);
  assert.equal(selected[1].row.party,'Công ty An');
});

test('Bundled Excel template keeps text refs and rejects swapped columns, formulas and mixed directions',async()=>{
  const path=new URL('../../frontend/src/features/bank/LEDO_MAU_SAO_KE.xlsx',import.meta.url);
  const template=await readFile(path);
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet=workbook.getWorksheet('Sao kê');
  sheet.getRow(2).values=['00002',new Date('2026-11-20'),150,null,'KH001','Đợt A'];
  sheet.getRow(4).values=['00004','2026-11-20',100,200,null,null];
  sheet.getRow(6).values=['00006','2026-11-20',100,null,null,{formula:'1+2',result:3}];
  const rows=await readStatementFile(await workbook.xlsx.writeBuffer(),'SAO_KE.xlsx');
  assert.deepEqual(rows.map(row=>row.line),[2,4,6]);
  assert.equal(rows[0].data.ref,'00002');
  assert.equal(rows[0].data.date,'2026-11-20');
  assert.match(rows[1].error,/một cột/);
  assert.match(rows[2].error,/giá trị tĩnh/);
  sheet.getCell('A1').value='Mã sai';
  await assert.rejects(readStatementFile(await workbook.xlsx.writeBuffer(),'SAO_KE.xlsx'),/thứ tự cột/);
  const prefix=statementColumns.join(',')+'\n';
  await assert.rejects(readStatementFile(bytes(prefix+'001,2026-11-01,10,,,"không đóng'),'test.csv'),/ngoặc kép/);
  await assert.rejects(readStatementFile(bytes(prefix+'001,2026-11-01,10,,,\n'.repeat(26)),'test.csv'),/25 giao dịch/);
});

test('Idempotency skips identical refs and flags data changes, double refs and inactive partners',()=>{
  const check=(input,existing=[])=>inspectBankBatch(input,{...context,existing});
  const payment={ref:'  nh-C01 ',date:'2026-11-21',kind:'pay',amount:250000,partyId:'xyz',note:'Đợt A'};
  const [first]=check([payment]);
  assert.equal(first.row.ref,'NH-C01');
  const duplicates=check([payment,{...payment,ref:'nh-c01'}],[first.row]);
  assert.deepEqual(duplicates.map(row=>row.status),['duplicate','invalid']);
  assert.equal(check([{...payment,amount:100}],[first.row])[0].status,'conflict');
  assert.equal(check([{...payment,date:'2026-12-01'}])[0].status,'invalid');
  assert.equal(check([{...payment,partyId:'old'}])[0].status,'partner');
});
