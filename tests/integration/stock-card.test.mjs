import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockForItem} from '../../backend/modules/accounting/ledger.mjs';
import {stockCardModel} from '../../backend/modules/accounting/stockCard.mjs';
import {stockCsv,stockHistory} from '../../frontend/src/features/stock/stockHistory.mjs';

const catalog={items:[{id:'pump',code:'VT001',name:'Máy bơm',unit:'cái'},{id:'wire',code:'VT002',name:'Dây nối',unit:'cuộn'}]};
const docs=[
  {id:'BH-2',date:'2026-11-07',kind:'sell',quantity:2,cost:180,price:800,itemId:'pump',warehouse:'K01',status:'posted',stockPostingOrder:3,party:'Cửa hàng A'},
  {id:'MH-1',date:'2026-11-03',kind:'buy',quantity:2,price:100,itemId:'pump',warehouse:'K01',status:'posted',stockPostingOrder:1,party:'NCC'},
  {id:'MH-2',date:'2026-11-07',kind:'buy',quantity:1,price:150,itemId:'pump',warehouse:'K01',status:'posted',stockPostingOrder:2,party:'NCC'},
  {id:'MH-3',date:'2026-11-08',kind:'buy',quantity:5,price:200,itemId:'pump',warehouse:'K01',status:'draft',party:'NCC'}
];
const ledger={stockOpening:[{itemId:'pump',quantity:3,value:210}],docs};

test('Stock card uses opening stock, dated carry-in, committed costs and posting order',()=>{
  const model=stockCardModel(ledger,catalog,'K01',true);
  assert.deepEqual(model.rows.map(row=>row.id),['MH-1','MH-2','BH-2']);
  const [item,empty]=stockHistory(model,'2026-11-07','2026-11-30');
  assert.deepEqual(item.opening,{units:5,value:410});
  assert.deepEqual(item.received,{units:1,value:150});
  assert.deepEqual(item.issued,{units:2,value:180});
  assert.deepEqual(item.rows.map(row=>row.after),[{units:6,value:560},{units:4,value:380}]);
  assert.deepEqual(item.closing,stockForItem(ledger,'pump'));
  assert.deepEqual(empty.closing,{units:0,value:0});
  const before=stockHistory(model,'2026-11-01','2026-11-06')[0];
  assert.equal(before.issued.units,0);
  assert.equal(before.closing.units,5);
});

test('Stock card and CSV expose quantity only for warehouse role and only its warehouse',()=>{
  const other={...docs[1],id:'MH-X',warehouse:'K02'};
  const model=stockCardModel({...ledger,docs:[...docs,other]},catalog,'K01',false);
  assert.equal(model.rows.length,3);
  assert.ok(model.rows.every(row=>!Object.hasOwn(row,'value')));
  assert.ok(model.items.every(row=>!Object.hasOwn(row.opening,'value')));
  const reports=stockHistory(model,'2026-11-01','2026-11-30');
  const detail=stockCsv(model,reports.slice(0,1),'2026-11-01','2026-11-30',true);
  assert.match(detail,/Tồn sau giao dịch \(SL\)/);
  assert.doesNotMatch(detail,/VND|800|MH-X/);
  const values=stockCardModel(ledger,catalog,'K01',true);
  const detailValues=stockCsv(values,stockHistory(values,'2026-11-01','2026-11-30').slice(0,1),'2026-11-01','2026-11-30',true);
  assert.match(detailValues,/Giá vốn xuất \(VND\)/);
  assert.match(detailValues,/0,2,4,0,180,380/);
});

test('For legacy data the stock card uses recorded audit order within the same day when available',()=>{
  const old=docs.slice(0,3).map(({stockPostingOrder,...row})=>row);
  const audit=[{target:'MH-2',message:'Đã ghi sổ chứng từ'},{target:'BH-2',message:'Đã ghi sổ chứng từ'}];
  const model=stockCardModel({...ledger,docs:old},catalog,'K01',true,audit);
  assert.deepEqual(model.rows.map(row=>row.id),['MH-1','MH-2','BH-2']);
});
