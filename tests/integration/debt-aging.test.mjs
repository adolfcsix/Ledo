import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agingRow,agingTotals,debtPartners,debtCsv} from '../../frontend/src/features/debts/debtAging.mjs';

const source={id:'DK-1',kind:'sell',opening:true,ref:'0017',partyId:'p1',party:'Công ty A',partyCode:'KH001',date:'2026-01-01',
  original:100000,open:0,dueDate:'2026-06-01',settlements:[
    {id:'PT-2',date:'2026-06-25',amount:70000},{id:'PT-1',date:'2026-06-10',amount:30000}
  ]};
test('Debt aging includes opening balances and cuts off each posted allocation by accounting day',()=>{
  assert.equal(agingRow(source,'2025-12-31'),null);
  const first=agingRow(source,'2026-06-09');
  assert.equal(first.balance,100000);
  const partial=agingRow(source,'2026-06-10');
  assert.equal(partial.balance,70000);
  assert.equal(partial.paid,30000);
  assert.equal(partial.timing,'Quá 9 ngày');
  const complete=agingRow(source,'2026-06-25');
  assert.equal(complete.balance,0);
  assert.equal(complete.status,'settled');
  assert.deepEqual(complete.payments.map(row=>row.id),['PT-1','PT-2']);
});

test('Aging bands include exact cutoffs, due today and debts without a due date',()=>{
  const row={...source,settlements:[]};
  for(const [day,band] of Object.entries({
    '2026-05-24':'later','2026-05-25':'soon','2026-06-01':'soon','2026-06-02':'overdue30','2026-07-01':'overdue30',
    '2026-07-02':'overdue60','2026-07-31':'overdue60','2026-08-01':'overdue90','2026-08-30':'overdue90',
    '2026-08-31':'overdue120','2026-09-29':'overdue120','2026-09-30':'overdueLong'
  })) assert.equal(agingRow(row,day).band,band,day);
  assert.equal(agingRow({...row,dueDate:null},'2026-06-01').status,'undated');
  assert.equal(agingRow(row,'2026-06-01').timing,'Đến hạn hôm nay');
});

test('Party totals separate payables and receivables and CSV keeps numeric amounts and neutralizes formulas',()=>{
  const at='2026-06-12';
  const rows=[
    agingRow(source,at),
    agingRow({...source,id:'DK-2',party:'Tên đã cập nhật',kind:'buy',original:45000,dueDate:null,settlements:[]},at),
    agingRow({...source,id:'DK-3',partyId:'p2',party:' =SUM(A1)',kind:'buy',original:9000,dueDate:'2026-06-19',settlements:[]},at)
  ];
  assert.deepEqual(agingTotals(rows),{balance:124000,overdue:70000,soon:9000,later:0,undated:45000,settled:0});
  const group=debtPartners(rows)[0];
  assert.equal(group.documents,2);
  assert.equal(group.receive,70000);
  assert.equal(group.pay,45000);
  const csv=debtCsv(rows,'CN01',at);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\' =SUM(A1)"'));
  assert.ok(csv.includes('100000,30000,70000'));
  assert.ok(csv.includes('"CN01","2026-06-12","Đầu kỳ · 0017"'));
});
