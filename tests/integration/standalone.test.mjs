import {stockHistory} from '../../frontend/src/features/stock/stockHistory.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createLedoServer} from '../../scripts/start.mjs';
import {bankReconciliation} from '../../frontend/src/features/bank/reconciliation.mjs';
import {agingRow} from '../../frontend/src/features/debts/debtAging.mjs';

async function launch(file){
  const {server,setupCode}=createLedoServer(file);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {server,setupCode,origin:'http://127.0.0.1:'+server.address().port};
}
function browser(){
  const cookies=new Map();
  return async(origin,path,input,expected=200,extra={})=>{
    const headers={cookie:[...cookies.values()].join('; '),...extra};
    if(input!==undefined){
      headers['content-type']='application/json';
      if(!headers.origin)headers.origin=origin;
    }
    const response=await fetch(origin+path,{method:input===undefined?'GET':'POST',headers,body:input===undefined?undefined:JSON.stringify(input)});
    for(const set of response.headers.getSetCookie()){
      const pair=set.split(';')[0];
      cookies.set(pair.split('=')[0],pair);
    }
    const body=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();
    assert.equal(response.status,expected,path+' '+JSON.stringify(body));
    return body;
  };
}

test('Independent sign-in, scoped invitations, period rules, restart and logout work through HTTP',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ledo-integration-'));
  const filename=join(dir,'ledger.sqlite');
  let runtime=await launch(filename);
  const {origin,setupCode}=runtime;
  const owner=browser(), peer=browser(), anonymous=browser();
  const password='a synthetic test passphrase!';
  const credentials={email:'owner@standalone.example',password};
  const colleague={email:'accounting@standalone.example',password};
  const stranger={email:'other@standalone.example',password};
  try{
    const initial=await owner(origin,'/api/auth/session');
    assert.deepEqual(initial,{standalone:true,signedIn:false,needsSetup:true});
    await anonymous(origin,'/api/workspace',undefined,401,{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':credentials.email});
    await owner(origin,'/api/auth/setup',{...credentials,code:setupCode},403,{origin:'https://unrelated.example'});
    await owner(origin,'/api/auth/setup',{...credentials,code:setupCode});
    await anonymous(origin,'/api/auth/setup',{...stranger,code:setupCode},409);
    await owner(origin,'/api/workspace',undefined,409);
    await owner(origin,'/api/account/select',{mode:'demo'},403);
    await owner(origin,'/api/account/create',{name:'Người quản trị',organization:'Công ty thật',period:'2027-02',inventoryItem:'Máy bơm',openingBank:250000,openingCash:30000});
    let workspace=await owner(origin,'/api/workspace');
    assert.equal(workspace.period,'2027-02');
    assert.equal(workspace.inventoryItem,'Máy bơm');
    const org=(await owner(origin,'/api/account')).selection.orgId;
    const invitation=await owner(origin,'/api/account/invite',{email:colleague.email,name:'Kế toán A',roles:['KTT','TK','KS'],branch:'CN01'});
    await anonymous(origin,'/api/auth/register',{...stranger,code:invitation.invite},403);
    await peer(origin,'/api/auth/register',{...colleague,code:invitation.invite});
    await peer(origin,'/api/account/select',{orgId:org,code:'KTT'},403);
    await peer(origin,'/api/account/accept',{code:invitation.invite});
    await peer(origin,'/api/account/accept',{code:invitation.invite},403);
    await peer(origin,'/api/account/members',undefined,403);
    await owner(origin,'/api/account/select',{orgId:org,code:'KT'});
    workspace=await owner(origin,'/api/workspace');
    assert.ok(!workspace.nav.includes('invoices'));
    const act=(client,url,revision,action,data,expected=200)=>client(url,'/api/actions',{revision,action,data},expected);
    assert.ok(workspace.nav.includes('catalog'));
    const start='2027-02-01';
    const party={type:'parties',code:'NCC01',name:'Nhà cung cấp thật',kind:'supplier',from:start};
    workspace=await act(owner,origin,workspace.revision,'catalog.save',party);
    await act(owner,origin,workspace.revision,'catalog.save',{...party,code:'ncc01'},409);
    workspace=await act(owner,origin,workspace.revision,'catalog.save',{...party,code:'NCC02'});
    workspace=await act(owner,origin,workspace.revision,'catalog.save',{...party,code:'KH01',name:'Khách A',kind:'customer'});
    workspace=await act(owner,origin,workspace.revision,'catalog.save',{type:'items',code:'VT002',name:'Dây nối',unit:'cuộn',from:start});
    const [supplier,otherSupplier,customer]=workspace.catalog.parties;
    const [pump,wire]=workspace.catalog.items;
    const data={kind:'buy',itemId:pump.id,partyId:supplier.id,date:'2027-02-12',dueDate:'2027-03-10',quantity:2,price:45000};
    await act(owner,origin,workspace.revision,'order.create',{...data,date:'2027-02-29'},422);
    await act(owner,origin,workspace.revision,'order.create',{...data,date:'2027-03-01'},422);
    await act(owner,origin,workspace.revision,'order.create',{...data,partyId:customer.id},422);
    await act(owner,origin,workspace.revision,'order.create',{...data,dueDate:'2027-02-11'},422);
    await act(owner,origin,workspace.revision,'order.create',{...data,dueDate:'2027-02-29'},422);
    workspace=await act(owner,origin,workspace.revision,'order.create',data);
    const order=workspace.orders[0];
    assert.equal(order.party,party.name);
    assert.equal(order.itemCode,pump.code);
    await owner(origin,'/api/account/select',{orgId:org,code:'KTT'});
    const chief=await owner(origin,'/api/workspace');
    await act(owner,origin,chief.revision,'order.approve',{id:order.id},403);
    assert.equal(chief.report.summary.cash,250000);
    assert.equal(chief.report.summary.fund,30000);
    assert.equal(chief.report.summary.balances['411'].credit,280000);
    let independent=await peer(origin,'/api/workspace');
    independent=await act(peer,origin,independent.revision,'order.approve',{id:order.id});
    assert.equal(independent.orders.find(row=>row.id===order.id).status,'approved');
    await peer(origin,'/api/account/select',{orgId:org,code:'TK'});
    const storekeeper=await peer(origin,'/api/workspace');
    const received=await act(peer,origin,storekeeper.revision,'warehouse.confirm',{id:order.id,warehouse:'K01',quantity:2});
    const receipt=received.orders.find(row=>row.id===order.id).receipts[0].id;
    await owner(origin,'/api/account/select',{orgId:org,code:'KT'});
    workspace=await owner(origin,'/api/workspace');
    workspace=await act(owner,origin,workspace.revision,'order.invoice',{id:order.id,receipt,quantity:2});
    workspace=await act(owner,origin,workspace.revision,'order.draft',{id:order.id,receipt});
    const doc=workspace.result.target;
    await act(owner,origin,workspace.revision,'doc.submit',{id:doc});
    await peer(origin,'/api/account/select',{orgId:org,code:'KTT'});
    independent=await peer(origin,'/api/workspace');
    independent=await act(peer,origin,independent.revision,'doc.approve',{id:doc});
    independent=await act(peer,origin,independent.revision,'doc.post',{id:doc});
    assert.equal(independent.report.summary.stock,90000);
    assert.equal(independent.report.summary.ap,90000);
    assert.equal(independent.debts.find(row=>row.id===doc).dueDate,'2027-03-10');

    async function apply(client,code,action,data,expected=200){
      await client(origin,'/api/account/select',{orgId:org,code});
      const current=await client(origin,'/api/workspace');
      return act(client,origin,current.revision,action,data,expected);
    }
    const wireBuy=(await apply(owner,'KT','order.create',{...data,itemId:wire.id,date:'2027-02-13',quantity:5,price:90000})).result.target;
    await apply(peer,'KTT','order.approve',{id:wireBuy});
    let warehouse=await apply(peer,'TK','warehouse.confirm',{id:wireBuy,warehouse:'K01',quantity:5});
    assert.equal(warehouse.catalog.parties,undefined);
    assert.equal(warehouse.catalog.items[0].value,undefined);
    await apply(peer,'TK','catalog.save',party,403);
    const wireReceipt=warehouse.orders.find(row=>row.id===wireBuy).receipts[0].id;
    await apply(owner,'KT','order.invoice',{id:wireBuy,receipt:wireReceipt,quantity:5});
    const wireDoc=(await apply(owner,'KT','order.draft',{id:wireBuy,receipt:wireReceipt})).result.target;
    await apply(owner,'KT','doc.submit',{id:wireDoc});
    await apply(peer,'KTT','doc.approve',{id:wireDoc});
    await apply(peer,'KTT','doc.post',{id:wireDoc});

    const sale={...data,kind:'sell',partyId:customer.id,date:'2027-02-14',quantity:3,price:100000};
    const tooMany=(await apply(owner,'KT','order.create',sale)).result.target;
    await apply(peer,'KTT','order.approve',{id:tooMany});
    await apply(peer,'TK','warehouse.confirm',{id:tooMany,warehouse:'K01',quantity:3},409);
    const sell=(await apply(owner,'KT','order.create',{...sale,quantity:1})).result.target;
    await apply(peer,'KTT','order.approve',{id:sell});
    warehouse=await apply(peer,'TK','warehouse.confirm',{id:sell,warehouse:'K01',quantity:1});
    const ship=warehouse.orders.find(row=>row.id===sell).receipts[0].id;
    const sold=(await apply(owner,'KT','order.draft',{id:sell,receipt:ship})).result.target;
    await peer(origin,'/api/account/select',{orgId:org,code:'KS'});
    const auditBefore=await peer(origin,'/api/workspace');
    assert.ok(auditBefore.audit.some(row=>row.target===doc));
    assert.ok(!auditBefore.audit.some(row=>row.target===sold));
    assert.ok(!(await peer(origin,'/api/audit.csv')).includes(sold));
    await apply(owner,'KT','doc.submit',{id:sold});
    await apply(peer,'KTT','doc.approve',{id:sold});
    independent=await apply(peer,'KTT','doc.post',{id:sold});
    assert.equal(independent.report.summary.cogs,45000);
    assert.equal(independent.report.summary.stock,495000);
    assert.equal(independent.report.overview.inventory.itemCount,2);
    assert.equal(independent.catalog.items.find(item=>item.id===pump.id).units,1);
    assert.equal(independent.catalog.items.find(item=>item.id===wire.id).value,450000);
    const count=await apply(peer,'TK','warehouse.count',{warehouse:'K01',itemId:wire.id,quantity:4});
    assert.equal(count.counts.at(-1).delta,-1);
    assert.equal(count.counts.at(-1).itemId,wire.id);

    await apply(owner,'KT','bank.add',{ref:'NG-001',kind:'pay',date:'2027-02-16',partyId:otherSupplier.id,amount:10000});
    await apply(owner,'KT','bank.propose',{ref:'NG-001',mode:'new',source:doc},422);
    await apply(owner,'KT','catalog.save',{type:'parties',id:supplier.id,name:'Tên mới'});
    let renamed=await apply(owner,'KT','bank.add',{ref:'NG-002',kind:'pay',date:'2027-02-16',partyId:supplier.id,amount:10000});
    assert.equal(renamed.bank.find(row=>row.ref==='NG-002').party,'Tên mới');
    assert.ok(renamed.bank.find(row=>row.ref==='NG-002').sources.some(row=>row.id===doc));
    await apply(owner,'KT','catalog.status',{type:'parties',id:supplier.id,inactiveFrom:'2027-02-17'});
    await apply(owner,'KT','order.create',{...data,date:'2027-02-17'},422);
    await apply(owner,'KT','order.create',{...data,date:'2027-02-16'});
    await apply(owner,'KT','catalog.status',{type:'items',id:pump.id,inactiveFrom:'2027-02-19'});
    await apply(owner,'KT','order.create',{...sale,date:'2027-02-19',quantity:1},422);

    await owner(origin,'/api/account/select',{orgId:org,code:'KTT'});
    runtime.server.close();
    await once(runtime.server,'close');
    runtime=await launch(filename);
    assert.equal(runtime.setupCode,null);
    const restarted=runtime.origin;
    const recovered=await owner(restarted,'/api/workspace');
    assert.equal(recovered.orders[0].id,order.id);
    assert.equal(recovered.orders[0].status,'approved');
    assert.equal(recovered.report.summary.cash,250000);
    assert.ok(recovered.documents.some(row=>row.id===doc&&row.status==='posted'));
    assert.equal(recovered.debts.find(row=>row.id===doc).dueDate,'2027-03-10');
    assert.equal(recovered.report.summary.ap,540000);
    assert.equal(recovered.documents.find(row=>row.id===doc).party,party.name);
    assert.equal(recovered.catalog.parties.find(row=>row.id===supplier.id).name,'Tên mới');
    await peer(restarted,'/api/account/select',{orgId:org,code:'KS'});
    assert.ok((await peer(restarted,'/api/audit.csv')).includes(sold));
    await owner(restarted,'/api/auth/logout',{});
    await owner(restarted,'/api/workspace',undefined,401);
    await owner(restarted,'/api/auth/login',{...credentials,password:'incorrect password data'},401);
    await owner(restarted,'/api/auth/login',credentials);
    await owner(restarted,'/api/account/select',{orgId:org,code:'QT'});
    const directory=await owner(restarted,'/api/account/members');
    const row=directory.members.find(member=>member.email===colleague.email);
    await owner(restarted,'/api/account/status',{id:row.id,revision:row.revision,status:'suspended'});
    await peer(restarted,'/api/workspace',undefined,403);
    await peer(restarted,'/api/audit.csv',undefined,403);
  }finally{
    if(runtime.server.listening){runtime.server.close();await once(runtime.server,'close');}
    await rm(dir,{recursive:true,force:true});
  }
});

test('Opening balances are staged, balanced, branch-scoped and usable for inventory and debt settlement',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ledo-opening-'));
  const filename=join(dir,'ledger.sqlite');
  let runtime=await launch(filename);
  const {origin,setupCode}=runtime;
  const owner=browser(), peer=browser();
  const password='a synthetic test passphrase!';
  const ownerLogin={email:'owner@opening.example',password};
  const peerLogin={email:'chief@opening.example',password};
  try{
    await owner(origin,'/api/auth/setup',{...ownerLogin,code:setupCode});
    await owner(origin,'/api/account/create',{name:'Chủ đơn vị',organization:'Công ty thử số dư',period:'2027-02',inventoryItem:'Máy bơm',openingBank:300000,openingCash:20000});
    const org=(await owner(origin,'/api/account')).selection.orgId;
    const invitation=await owner(origin,'/api/account/invite',{email:peerLogin.email,name:'Kế toán trưởng thử',roles:['KTT','TK'],branch:'CN01'});
    await peer(origin,'/api/auth/register',{...peerLogin,code:invitation.invite});
    await peer(origin,'/api/account/accept',{code:invitation.invite});
    const select=(client,code,url=origin)=>client(url,'/api/account/select',{orgId:org,code});
    const workspace=(client,url=origin)=>client(url,'/api/workspace');
    const act=async(client,action,data={},status=200)=>{
      const {revision}=await workspace(client);
      return client(origin,'/api/actions',{revision,action,data},status);
    };
    await select(owner,'KT');
    let view=await workspace(owner);
    assert.equal(view.opening.current.accounts['112'],300000);
    assert.equal(view.opening.current.accounts['411'],320000);
    const start='2027-02-01';
    await act(owner,'catalog.save',{type:'parties',code:'KH01',name:'Khách đầu kỳ',kind:'customer',from:start});
    view=await act(owner,'catalog.save',{type:'parties',code:'NCC01',name:'Nhà cung cấp đầu kỳ',kind:'supplier',from:start});
    const [customer,supplier]=view.catalog.parties;
    const item=view.catalog.items[0];
    const data={
      accounts:{111:20000,112:300000,334:15000,411:425000},
      stock:[{itemId:item.id,quantity:3,value:150000}],
      debts:[
        {kind:'sell',partyId:customer.id,ref:'HD-130',date:'2027-01-20',dueDate:'2027-02-20',amount:90000},
        {kind:'buy',partyId:supplier.id,ref:'HD-211',date:'2027-01-22',amount:120000}
      ]
    };
    await act(owner,'opening.stage',{...data,accounts:{...data.accounts,411:424999}},422);
    await act(owner,'opening.stage',{...data,stock:[data.stock[0],data.stock[0]]},422);
    await act(owner,'opening.stage',{...data,debts:[{...data.debts[0],date:start},data.debts[1]]},422);
    await act(owner,'opening.stage',{...data,debts:[{...data.debts[0],partyId:supplier.id},data.debts[1]]},422);
    view=await act(owner,'opening.stage',data);
    assert.equal(view.opening.pending.totals.debit,560000);
    assert.equal(view.opening.current.stock.length,0);
    assert.equal(view.debts.length,0);
    await act(owner,'opening.apply',{},403);
    await act(owner,'bank.add',{ref:'NG-PENDING',kind:'receive',date:start,partyId:customer.id,amount:1000},409);
    await act(owner,'bank.import',{file:'SAO_KE.csv',rows:[{ref:'NG-PENDING',kind:'receive',date:start,partyId:customer.id,amount:1000}]},409);
    await select(peer,'KTT');
    const published=await act(peer,'opening.apply');
    assert.equal(published.opening.pending,null);
    assert.equal(published.report.openingBalances['156'].debit,150000);
    assert.equal(published.report.openingBalances['131'].debit,90000);
    assert.equal(published.report.summary.ap,120000);
    assert.equal(published.report.summary.revenue,0);
    assert.equal(published.report.summary.cogs,0);
    assert.equal(published.report.overview.debt.receivable.open,90000);
    assert.ok(published.report.overview.days.every(day=>day.posted===0));
    assert.deepEqual(published.documents,[]);
    assert.equal(published.catalog.items[0].units,3);
    await act(peer,'opening.apply',{},409);

    const [receivable,payable]=published.debts;
    const receive={kind:'receive',source:receivable.id,date:'2027-02-02',channel:'bank',price:30000};
    await act(owner,'doc.save',{...receive,price:90001},422);
    const receipt=(await act(owner,'doc.save',receive)).result.target;
    await act(owner,'doc.submit',{id:receipt});
    await act(peer,'doc.approve',{id:receipt});
    let settled=await act(peer,'doc.post',{id:receipt});
    assert.equal(settled.report.summary.cash,330000);
    assert.equal(settled.report.summary.ar,60000);
    assert.equal(settled.report.overview.debt.receivable.settled,30000);
    assert.equal(settled.report.overview.days[1].inflow,30000);
    const publishedDebt=settled.debts.find(row=>row.id===receivable.id);
    assert.equal(publishedDebt.dueDate,'2027-02-20');
    assert.equal(agingRow(publishedDebt,'2027-02-01').balance,90000);
    assert.equal(agingRow(publishedDebt,'2027-02-02').balance,60000);
    assert.deepEqual(publishedDebt.settlements,[{id:receipt,date:'2027-02-02',amount:30000,channel:'bank'}]);
    const batch={file:'SAO_KE.xlsx',rows:[
      {ref:'nh-002',kind:'pay',date:'2027-02-03',partyId:supplier.id,amount:50000,note:'Trả một phần'},
      {ref:'NH-003',kind:'receive',date:'2027-02-03',partyId:customer.id,amount:15000,note:'Thu một phần'}
    ]};
    await select(peer,'TK');
    await act(peer,'bank.import',batch,403);
    await select(peer,'KTT');
    const bad={...batch,rows:[batch.rows[0],{...batch.rows[1],date:'2027-03-01'}]};
    await act(owner,'bank.import',bad,422);
    assert.deepEqual((await workspace(owner)).bank,[]);
    let loaded=await act(owner,'bank.import',batch);
    assert.match(loaded.result.target,/^SK-/);
    assert.equal(loaded.bank.length,2);
    assert.ok(loaded.bank.every(row=>row.importBatch===loaded.result.target&&row.importFile===batch.file&&!row.linked));
    assert.equal((await workspace(peer)).report.summary.cash,330000);
    assert.equal((await workspace(peer)).report.summary.ap,120000);
    loaded=await act(owner,'bank.import',batch);
    assert.equal(loaded.result.target,null);
    assert.equal(loaded.bank.length,2);
    const conflict={...batch,rows:[{...batch.rows[0],amount:10},{...batch.rows[1],ref:'MUST-NOT-ADD'}]};
    await act(owner,'bank.import',conflict,409);
    assert.equal((await workspace(owner)).bank.length,2);
    await act(owner,'bank.propose',{ref:'NH-002',source:payable.id,mode:'new'});
    settled=await act(peer,'bank.post',{ref:'NH-002',source:payable.id});
    assert.equal(settled.report.summary.ap,70000);
    const payableAfter=settled.debts.find(row=>row.id===payable.id);
    assert.equal(agingRow(payableAfter,'2027-02-02').balance,120000);
    assert.equal(agingRow(payableAfter,'2027-02-03').balance,70000);
    assert.equal(settled.report.summary.cash,280000);
    assert.ok(settled.bank.find(row=>row.ref==='NH-002').linked);
    const checkpoint={date:'2027-02-03',balance:325000,reference:'Sổ phụ thử'};
    await act(owner,'bank.checkpoint',{...checkpoint,date:'2027-03-01'},422);
    await act(owner,'bank.checkpoint',{...checkpoint,balance:0.5},422);
    const reconciled=await act(owner,'bank.checkpoint',checkpoint);
    const saved=reconciled.bankReconciliation.checkpoints[0];
    assert.equal(saved.date,checkpoint.date);
    assert.equal(saved.balance,325000);
    assert.equal(saved.reference,checkpoint.reference);
    const comparison=bankReconciliation(reconciled.bankReconciliation,reconciled.bank,saved);
    assert.equal(comparison.closing,280000);
    assert.equal(comparison.linked,1);
    assert.equal(comparison.statementOnly,15000);
    assert.equal(comparison.bookOnly,30000);
    assert.equal(comparison.residual,60000);
    assert.equal((await workspace(peer)).report.summary.cash,280000);
    const replay=await act(owner,'bank.import',batch);
    assert.equal(replay.bank.length,2);
    assert.equal(replay.result.target,null);
    assert.equal(settled.report.overview.days[2].outflow,50000);
    await act(peer,'opening.stage',data,409);

    const sale=(await act(owner,'order.create',{kind:'sell',partyId:customer.id,itemId:item.id,date:'2027-02-05',quantity:2,price:80000})).result.target;
    await act(peer,'order.approve',{id:sale});
    await select(peer,'TK');
    const stock=await act(peer,'warehouse.confirm',{id:sale,warehouse:'K01',quantity:2});
    assert.equal(stock.opening,undefined);
    const ship=stock.orders.find(order=>order.id===sale).receipts[0].id;
    const sold=(await act(owner,'order.draft',{id:sale,receipt:ship})).result.target;
    await act(owner,'doc.submit',{id:sold});
    await select(peer,'KTT');
    await act(peer,'doc.approve',{id:sold});
    const final=await act(peer,'doc.post',{id:sold});
    assert.equal(final.report.summary.cogs,100000);
    assert.equal(final.report.summary.stock,50000);
    const [report]=stockHistory(final.stockCard,'2027-02-01','2027-02-28');
    assert.deepEqual(report.opening,{units:3,value:150000});
    assert.deepEqual(report.issued,{units:2,value:100000});
    assert.deepEqual(report.closing,{units:1,value:50000});
    await select(peer,'TK');
    const warehouseView=await workspace(peer);
    assert.equal(warehouseView.stockCard.withValue,false);
    assert.ok(warehouseView.stockCard.rows.every(row=>!Object.hasOwn(row,'value')));
    assert.equal(warehouseView.stockCard.items[0].opening.value,undefined);

    await select(owner,'QT');
    const directory=await owner(origin,'/api/account/members');
    const member=directory.members.find(row=>row.email===peerLogin.email);
    await owner(origin,'/api/account/update',{id:member.id,revision:member.revision,name:member.display_name,branch:'CN02',roles:member.roles});
    await select(peer,'KTT');
    const other=await workspace(peer);
    assert.equal(other.report.summary.ar,0);
    assert.deepEqual(other.debts,[]);
    assert.equal(other.stockCard.warehouse,'K02');
    assert.deepEqual(other.stockCard.rows,[]);
    assert.equal(other.stockCard.items[0].opening.units,0);
    assert.deepEqual(other.bank,[]);
    assert.deepEqual(other.bankReconciliation.checkpoints,[]);
    assert.equal(other.report.summary.stock,0);
    assert.equal(other.opening.current.stock.length,0);
    await select(owner,'KTT');
    runtime.server.close();
    await once(runtime.server,'close');
    runtime=await launch(filename);
    const reloaded=await workspace(owner,runtime.origin);
    assert.equal(reloaded.report.openingBalances['156'].debit,150000);
    assert.equal(reloaded.report.summary.stock,50000);
    assert.equal(reloaded.opening.editable,false);
    assert.equal(reloaded.bankReconciliation.checkpoints[0].balance,325000);
  }finally{
    if(runtime.server.listening){runtime.server.close();await once(runtime.server,'close');}
    await rm(dir,{recursive:true,force:true});
  }
});
