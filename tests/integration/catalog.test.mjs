import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWorkspace} from '../../backend/modules/accounting/domain.mjs';
import {initializeCatalog,sameParty} from '../../backend/modules/accounting/catalog.mjs';
import {summary,stockForItem} from '../../backend/modules/accounting/ledger.mjs';

test('Legacy catalog conversion preserves posted amounts and assigns stable references to historical records',()=>{
  const state=newWorkspace('start');
  state.period='2027-02';
  state.inventoryItem='Máy bơm';
  state.opening=0;
  state.docs=[
    {id:'M1',kind:'buy',status:'posted',quantity:3,price:80000,party:'Nhà cung cấp A',date:'2027-02-04'},
    {id:'B1',kind:'sell',status:'posted',quantity:2,price:150000,cost:160000,party:'Khách B',date:'2027-02-05'},
    {id:'C1',kind:'pay',status:'posted',quantity:1,price:20000,party:'Nhà cung cấp A',link:'M1',date:'2027-02-06'}
  ];
  state.orders=[{kind:'sell',party:'Khách B'}];
  state.bank=[{kind:'pay',party:'Nhà cung cấp A'}];
  state.counts=[{quantity:1,delta:0}];
  const old=summary(state);
  initializeCatalog(state);
  assert.deepEqual(summary(state),old);
  assert.deepEqual(stockForItem(state,state.catalog.items[0].id),{units:1,value:80000});
  assert.equal(state.docs[0].itemCode,'VT001');
  assert.equal(state.counts[0].itemId,state.docs[0].itemId);
  assert.equal(state.orders[0].partyId,state.docs[1].partyId);
  assert.ok(sameParty(state.docs[0],state.bank[0]));
  assert.ok(sameParty(state.docs[0],state.docs[2]));
  const converted=structuredClone(state);
  initializeCatalog(state);
  assert.deepEqual(converted,state);
  const fresh={...newWorkspace('start'),period:'2027-02'};
  initializeCatalog(fresh);
  assert.deepEqual(fresh.catalog,{items:[],parties:[]});
});
