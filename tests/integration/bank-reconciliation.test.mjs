import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bankReconciliation} from '../../frontend/src/features/bank/reconciliation.mjs';

test('Reconciliation derives dated balances from TK 112 and keeps unlinked cash directions signed',()=>{
  const book={opening:300000,movements:[
    {id:'PT-1',date:'2026-11-12',move:50000},
    {id:'PC-1',date:'2026-11-13',move:-30000},
    {id:'PT-2',date:'2026-11-15',move:20000}
  ]};
  const rows=[
    {ref:'NH-1',date:'2026-11-12',linked:'PT-1',kind:'receive',amount:50000},
    {ref:'NH-2',date:'2026-11-14',linked:null,kind:'pay',amount:10000},
    {ref:'NH-3',date:'2026-11-15',linked:null,kind:'receive',amount:5000}
  ];
  const before=bankReconciliation(book,rows,{date:'2026-11-11',balance:null});
  assert.equal(before.closing,300000);
  assert.equal(before.difference,null);
  assert.equal(before.residual,null);
  assert.deepEqual(before.unlinkedBank,[]);
  const dated=bankReconciliation(book,rows,{date:'2026-11-14',balance:340000});
  assert.equal(dated.closing,320000);
  assert.equal(dated.incoming,50000);
  assert.equal(dated.outgoing,30000);
  assert.equal(dated.linked,1);
  assert.equal(dated.difference,20000);
  assert.equal(dated.statementOnly,-10000);
  assert.equal(dated.bookOnly,-30000);
  assert.equal(dated.explained,20000);
  assert.equal(dated.residual,0);
  assert.equal(dated.unlinkedBook[0].id,'PC-1');
  assert.equal(dated.unlinkedBank[0].ref,'NH-2');
});

test('Only complete valid links offset and zero balance is an explicit checkpoint',()=>{
  const book={opening:0,movements:[{id:'PT-1',date:'2026-11-12',move:50000}]};
  const rows=[
    {ref:'NH-1',date:'2026-11-12',linked:'PT-1',kind:'receive',amount:50000},
    {ref:'NH-2',date:'2026-11-12',linked:'PT-1',kind:'receive',amount:50000},
    {ref:'NH-3',date:'2026-11-11',linked:'PT-1',kind:'receive',amount:50000},
    {ref:'NH-4',date:'2026-11-12',linked:'PT-1',kind:'receive',amount:30000}
  ];
  const result=bankReconciliation(book,rows,{date:'2026-11-12',balance:0});
  assert.equal(result.linked,1);
  assert.equal(result.difference,-50000);
  assert.equal(result.bookOnly,0);
  assert.equal(result.statementOnly,130000);
  assert.equal(result.residual,-180000);
});
