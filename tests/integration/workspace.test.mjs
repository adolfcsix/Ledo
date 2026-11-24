import {reportExample} from '../../scripts/demo-reports.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../../scripts/local-d1.mjs';
import worker from '../../dist/server/index.js';

const origin='https://ledger.test';
function fixture(){
  const env=localDatabase();
  function visitor(owner='test-01',email=owner+'@ledo.example'){
    const jar=new Map();
    let view;
    async function call(path,body,extra={}){
      const cookie=[...jar.values()].join('; ');
      const headers={cookie,'oai-authenticated-user-id':owner,'oai-authenticated-user-email':email,...extra};
      if(body!==undefined)Object.assign(headers,{origin,'content-type':'application/json'});
      const response=await worker.fetch(new Request(origin+path,{headers,method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body)}),env);
      const replacement=response.headers.get('set-cookie');
      if(replacement){
        const pair=replacement.split(';')[0];
        jar.set(pair.split('=')[0],pair);
      }
      const payload=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();
      if(response.ok&&typeof payload==='object'&&payload.actor)view=payload;
      return {status:response.status,payload};
    }
    const ok=async(path,data)=>{
      const response=await call(path,data);
      assert.equal(response.status,200,JSON.stringify(response.payload));
      return response.payload;
    };
    return {call,ok,role:code=>ok('/api/demo-role',{code}),boot:()=>ok('/api/workspace'),act:(action,data={})=>ok('/api/actions',{action,data,revision:view.revision}),
      deny:async(status,action,data={})=>assert.equal((await call('/api/actions',{action,data,revision:view.revision,role:'KTT'})).status,status),get view(){return view;}};
  }
  return {visitor,env,sqlite:env.sqlite};
}

test('11 roles expose distinct routes and projections. Scope and action are enforced',async()=>{
  const {visitor,env}=fixture();
  const v=visitor();
  assert.equal((await worker.fetch(new Request(origin+'/api/workspace'),env)).status,401);
  await v.boot();
  assert.equal(v.view.actor.code,'KT');
  assert.equal(v.view.roles.length,11);
  const routes={KT:'orders',TK:'warehouse',TQ:'cash',PD:'approvals',KTT:'closing',LD:'management',KS:'evidence',QT:'administration',TL:'payroll',DT:'portal',HT:'integration'};
  for(const [code,route] of Object.entries(routes)){
    await v.role(code);assert.ok(v.view.nav.includes(route),code);
    const forbidden=code==='KTT'||code==='QT'?'payroll.save':'doc.post';
    await v.deny(403,forbidden,{id:'BH-001'});
    assert.equal((await v.call('/api/audit.csv')).status,code==='KS'?200:403,code);
  }
  assert.equal(v.view.documents,undefined);
  await v.deny(403,'doc.post',{id:'BH-001'});
  await v.role('QT');
  await v.act('role.update',{role:'KT',branch:'CN02',active:true,bankLink:false});
  await v.role('KT');assert.equal(v.view.documents.length,0);
  await v.deny(404,'doc.submit',{id:'BH-001'});
  await v.deny(403,'bank.sample');
  const other=visitor('test-02');await other.boot();
  assert.equal(other.view.actor.branch,'CN01');assert.equal(other.view.documents.length,2);
});

test('Purchase and sale pass stock handoff, discrepancy, independent approval and journal',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.act('order.create',{kind:'buy',date:'2026-11-24',quantity:10,price:100000});
  const order=v.view.orders[0].id;
  await v.role('TK');assert.equal(v.view.orders.length,0);
  await v.deny(409,'warehouse.confirm',{id:order,warehouse:'K01',quantity:6});
  await v.role('PD');
  await v.act('order.return',{id:order,reason:'Kiểm lại đơn giá'});
  await v.role('KT');
  assert.equal(v.view.orders[0].status,'returned');
  await v.act('order.revise',{id:order,date:'2026-11-24',quantity:10,price:100000});
  await v.act('order.submit',{id:order});
  await v.role('PD');
  await v.act('order.approve',{id:order});
  await v.role('TK');assert.equal(v.view.orders[0].price,undefined);
  await v.deny(403,'warehouse.confirm',{id:order,warehouse:'K02',quantity:6});
  await v.act('warehouse.confirm',{id:order,warehouse:'K01',quantity:6});
  const receipt=v.view.orders[0].receipts[0].id;
  await v.role('KT');
  await v.act('order.invoice',{id:order,receipt,quantity:10});
  await v.deny(409,'order.draft',{id:order,receipt});
  await v.act('order.invoice',{id:order,receipt,quantity:6});
  const doc=(await v.act('order.draft',{id:order,receipt})).result.target;
  await v.deny(409,'order.draft',{id:order,receipt});
  await v.act('doc.submit',{id:doc});
  await v.deny(403,'doc.approve',{id:doc});
  await v.role('PD');await v.act('doc.return',{id:doc,reason:'Rà lại phiếu nhận'});
  await v.role('KT');
  await v.act('doc.revise',{id:doc,description:'Xác nhận đủ căn cứ 6 bình'});
  await v.act('doc.submit',{id:doc});
  await v.role('PD');await v.act('doc.approve',{id:doc});
  await v.role('KTT');await v.act('doc.post',{id:doc});
  assert.equal(v.view.report.summary.units,12);
  assert.equal(v.view.report.summary.stock,1200000);
  const sale=(await v.act('order.create',{kind:'sell',date:'2026-11-24',quantity:2,price:150000})).result.target;
  await v.deny(403,'order.approve',{id:sale});
  await v.role('PD');await v.act('order.approve',{id:sale});
  await v.role('TK');
  await v.act('warehouse.confirm',{id:sale,warehouse:'K01',quantity:2});
  const slip=v.view.orders.find(x=>x.id===sale).receipts[0].id;
  await v.role('KT');
  const sold=(await v.act('order.draft',{id:sale,receipt:slip})).result.target;
  await v.act('doc.submit',{id:sold});
  await v.role('PD');await v.act('doc.approve',{id:sold});
  await v.role('KTT');await v.act('doc.post',{id:sold});
  assert.equal(v.view.report.summary.units,10);
  assert.equal(v.view.report.summary.profit,300000);
});

test('An Phat balance, independent period reopen and anti-repeat bank check',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.act('bank.propose',{ref:'NH-2411-01',source:'BH-001',mode:'new'});
  await v.deny(403,'bank.post',{ref:'NH-2411-01',source:'BH-001'});
  await v.role('KTT');
  await v.deny(409,'period.lock');
  await v.act('bank.post',{ref:'NH-2411-01',source:'BH-001'});
  await v.deny(409,'bank.post',{ref:'NH-2411-01',source:'BH-001'});
  await v.act('bank.post',{ref:'NH-2411-02',source:'MH-001'});
  assert.deepEqual(['cash','ar','ap','units','profit'].map(key=>v.view.report.summary[key]),[4250000,350000,0,6,200000]);
  await v.act('period.lock');
  await v.deny(409,'doc.save',{kind:'receive',source:'BH-001',price:1});
  const reopen=(await v.act('period.request',{reason:'Kiểm lại bộ mẫu'})).result.target;
  await v.deny(403,'period.approve',{id:reopen});
  await v.deny(409,'period.apply',{id:reopen});
  await v.role('PD');await v.act('period.approve',{id:reopen});
  await v.role('KTT');await v.act('period.apply',{id:reopen});
  assert.equal(v.view.locked,false);
  assert.equal(v.view.closing.snapshot.sums.cash,4250000);
});

test('Separate approval and cash confirmation, document reuse, administration grants and stale revision',async()=>{
  const v=fixture().visitor();await v.boot();
  const cash=(await v.act('doc.save',{kind:'receive',source:'BH-001',price:100000,channel:'cash'})).result.target;
  await v.act('doc.submit',{id:cash});
  await v.role('QT');await v.act('role.update',{role:'PD',branch:'CN01',active:true,limit:99000});
  await v.role('PD');await v.deny(403,'doc.approve',{id:cash});
  await v.role('KTT');await v.act('doc.approve',{id:cash});
  await v.deny(409,'doc.post',{id:cash});
  await v.role('TQ');await v.act('cash.verify',{id:cash,actual:100000});
  await v.role('KTT');await v.act('doc.post',{id:cash});
  assert.equal(v.view.report.summary.fund,100000);
  await v.role('KT');
  const receipt=(await v.act('doc.save',{kind:'receive',source:'BH-001',price:250000})).result.target;
  await v.act('doc.submit',{id:receipt});
  await v.role('KTT');await v.act('doc.approve',{id:receipt});
  await v.act('doc.post',{id:receipt});
  await v.deny(409,'bank.post',{ref:'NH-2411-01',source:'BH-001'});
  await v.role('QT');await v.act('role.update',{role:'KT',branch:'CN01',active:true,bankLink:true});
  await v.role('KT');await v.act('bank.confirm',{ref:'NH-2411-01',source:receipt});
  await v.deny(403,'bank.post',{ref:'NH-2411-02',source:'MH-001'});
  const stale=await v.call('/api/actions',{revision:v.view.revision-1,action:'bank.sample',data:{}});
  assert.equal(stale.status,409);
  await v.role('KTT');assert.equal(v.view.report.summary.cash,5250000);
});

test('Partner, payroll, auditing, management and integrations share only intended data',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.role('TL');
  const batch=(await v.act('payroll.save',{member:'NHAN-SU-RIENG',total:500000})).result.target;
  await v.act('payroll.submit',{id:batch});
  await v.role('KTT');assert.equal(JSON.stringify(v.view).includes('NHAN-SU-RIENG'),false);
  const journal=(await v.act('payroll.prepare',{id:batch})).result.target;
  await v.act('doc.post',{id:journal});
  assert.equal(v.view.report.summary.wages,500000);
  await v.role('LD');assert.equal(v.view.documents,undefined);assert.equal(v.view.report.summary.balances,undefined);
  const inquiry=(await v.act('evidence.ask.management',{question:'Nguồn khoản phải thu?'})).result.target;
  await v.role('KTT');await v.act('evidence.resolve',{id:inquiry,answer:'Kiểm tra BH-001'});
  await v.role('LD');assert.equal(v.view.evidence[0].answer,'Kiểm tra BH-001');
  await v.role('KS');assert.equal(v.view.evidence.length,0);
  assert.equal(JSON.stringify(v.view).includes('NHAN-SU-RIENG'),false);
  await v.role('DT');assert.equal(v.view.portal.id,'BH-001');assert.equal(v.view.report,undefined);
  await v.act('portal.reply',{status:'disputed',note:'Rà soát số dư'});await v.role('KT');
  assert.equal(v.view.portalReplies.length,1);
  await v.role('HT');
  await v.act('integration.event',{kind:'invoice',ref:'HD-01'});
  await v.act('integration.event',{kind:'invoice',ref:'HD-01'});
  assert.equal(v.view.events.length,1);
  assert.equal(v.view.events[0].duplicates,1);
  await v.deny(409,'integration.event',{kind:'statement',ref:'HD-01'});
});

test('Auditor workspace, document history and CSV respect posted status, ownership and branch',async()=>{
  const {visitor,sqlite}=fixture();
  const v=visitor();
  await v.boot();
  const create=async price=>(await v.act('doc.save',{
    kind:'receive',source:'BH-001',date:'2026-11-24',price,description:'Chứng từ kiểm thử'
  })).result.target;
  const approved=await create(10000);
  const draft=await create(12000);
  await v.act('doc.submit',{id:approved});
  assert.equal((await v.call('/api/audit.csv')).status,403);
  await v.role('PD');
  await v.act('doc.approve',{id:approved});
  await v.role('LD');
  const otherEvidence=(await v.act('evidence.ask.management',{question:'Tra soát của lãnh đạo'})).result.target;
  await v.role('KS');
  const owned=(await v.act('evidence.ask.audit',{question:'Bằng chứng của kiểm soát'})).result.target;
  assert.deepEqual(v.view.audit.map(row=>row.target),[owned]);
  const before=await v.ok('/api/audit.csv');
  assert.ok(before.includes(owned));
  for(const hidden of [approved,draft,otherEvidence])assert.ok(!before.includes(hidden),hidden);
  await v.role('KTT');
  assert.ok(v.view.audit.some(row=>row.target===draft));
  await v.act('evidence.resolve',{id:owned,answer:'Đã gửi bằng chứng'});
  const posted=await v.act('documents.batch',{operation:'post',entries:[{id:approved}]});
  const batch=posted.result.target;
  await v.role('HT');
  await v.act('integration.event',{kind:'invoice',ref:approved});
  await v.role('KS');
  assert.ok(v.view.audit.some(row=>row.target===approved&&row.batch===batch));
  assert.ok(v.view.audit.some(row=>row.target===owned&&row.action==='evidence.resolve'));
  assert.ok(v.view.audit.every(row=>[approved,owned].includes(row.target)));
  const history=v.view.documents.find(row=>row.id===approved).history;
  assert.ok(history.some(row=>row.message==='Đã ghi sổ chứng từ'));
  assert.ok(history.every(row=>row.actor!=='HT'));
  const exported=await v.ok('/api/audit.csv');
  assert.ok(exported.includes(batch));
  assert.ok(!exported.includes('Đã tiếp nhận và xác minh sự kiện mẫu'));
  assert.ok(!exported.includes(draft));

  // An existing database can still have log records written before action metadata was introduced.
  const saved=sqlite.prepare('SELECT payload FROM ledo_workspaces WHERE owner_id=?').get('test-01');
  const state=JSON.parse(saved.payload);
  state.audit=state.audit.map(({action,documentId,...row})=>row);
  sqlite.prepare('UPDATE ledo_workspaces SET payload=? WHERE owner_id=?').run(JSON.stringify(state),'test-01');
  await v.boot();
  assert.ok(v.view.audit.some(row=>row.target===approved&&row.batch===batch));
  assert.ok(v.view.audit.every(row=>[approved,owned].includes(row.target)&&row.actor!=='HT'));

  await v.role('QT');
  await v.act('role.update',{role:'KS',branch:'CN02',active:true});
  await v.role('KS');
  assert.deepEqual(v.view.audit,[]);
  assert.ok(!(await v.ok('/api/audit.csv')).includes(approved));
  await v.deny(403,'evidence.resolve',{id:owned,answer:'Ngoài quyền'});
});

test('XML intake preserves source, rejects duplicates and prevents number and price mismatches',async()=>{
  const v=fixture().visitor();await v.boot();
  const xml=(n,q,p)=>'<HoaDon><NhaCungCap>NCC01</NhaCungCap><KyHieu>AP-26</KyHieu><So>'+n+'</So>'+
    '<Ngay>2026-11-24</Ngay><Dong><MaHang>BINH01</MaHang><SoLuong>'+q+'</SoLuong><DonGia>'+p+'</DonGia><ThanhTien>'+q*p+
    '</ThanhTien></Dong></HoaDon>';
  const order=(await v.act('order.create',{kind:'buy',date:'2026-11-24',quantity:10,price:100000})).result.target;
  await v.deny(422,'invoice.import',{xml:xml(1,6,100000).replace('600000','123')});
  await v.deny(422,'invoice.import',{xml:'<!DOCTYPE HoaDon>'+xml(1,6,100000)});
  const original=xml('01',10,100000);
  const head=(await v.act('invoice.import',{xml:original})).result.target;
  assert.match(v.view.invoices[0].digest,/^[a-f0-9]{64}$/);
  assert.equal(v.view.invoices[0].xml,undefined);
  await v.deny(409,'invoice.import',{xml:xml(1,10,100000)});
  assert.equal((await v.ok('/api/invoice.xml?id='+head)),original);
  await v.role('PD');await v.act('order.approve',{id:order});
  await v.role('TK');
  assert.equal(v.view.invoices,undefined);
  assert.equal((await v.call('/api/invoice.xml?id='+head)).status,403);
  await v.act('warehouse.confirm',{id:order,warehouse:'K01',quantity:6});
  const receipt=v.view.orders.find(item=>item.id===order).receipts[0].id;
  await v.role('KT');
  await v.act('order.link-invoice',{id:order,receipt,invoice:head});
  assert.equal(v.view.orders[0].receipts[0].invoice,10);
  await v.deny(409,'order.draft',{id:order,receipt});
  await v.deny(409,'order.invoice',{id:order,receipt,quantity:6});
  const badPrice=(await v.act('invoice.import',{xml:xml('02',6,120000)})).result.target;
  await v.act('order.link-invoice',{id:order,receipt,invoice:badPrice});
  await v.deny(409,'order.draft',{id:order,receipt});
  const ok=(await v.act('invoice.import',{xml:xml('03',6,100000)})).result.target;
  await v.act('order.link-invoice',{id:order,receipt,invoice:ok});
  const doc=(await v.act('order.draft',{id:order,receipt})).result.target;
  assert.equal(v.view.documents.find(row=>row.id===doc).total,600000);
  assert.equal(v.view.invoices.find(row=>row.id===head).link,null);
  await v.deny(409,'order.link-invoice',{id:order,receipt,invoice:head});
  await v.role('QT');await v.act('role.update',{role:'KT',branch:'CN02',active:true});
  await v.role('KT');assert.equal(v.view.invoices.length,0);
  assert.equal((await v.call('/api/invoice.xml?id='+ok)).status,404);
});

test('Organizations isolate actual identities, onboarding, scope and reciprocal approval',async()=>{
  const {visitor,sqlite}=fixture();
  const owner=visitor('owner'),colleague=visitor('colleague'),other=visitor('stranger');
  const create={organization:'Ledo Test',name:'Chủ đơn vị'};
  await owner.ok('/api/account/create',create);
  await owner.boot();
  assert.equal(owner.view.actor.code,'QT');
  assert.equal(owner.view.organization,'Ledo Test');
  const initial=await owner.ok('/api/account/members');
  assert.equal(initial.members.length,1);
  const org=(await owner.ok('/api/account')).selection.orgId;
  const input={name:'Người được mời',email:'COLLEAGUE@ledo.example',roles:['KT','PD'],branch:'CN01',limit:100000000,validUntil:'',bankLink:false};
  assert.equal((await owner.call('/api/account/invite',{...input,limit:null})).status,422);
  const first=await owner.ok('/api/account/invite',input);
  assert.equal((await owner.call('/api/account/invite',input)).status,409);
  const dir=await owner.ok('/api/account/members');
  const pending=dir.members.find(row=>row.email==='colleague@ledo.example');
  assert.equal(pending.status,'pending');
  assert.equal(JSON.stringify(dir).includes(first.invite),false);
  assert.equal((await other.call('/api/account/accept',{code:first.invite})).status,403);
  assert.equal((await other.call('/api/account/select',{orgId:org,code:'QT'})).status,403);
  const fresh=await owner.ok('/api/account/reissue',{id:pending.id,revision:pending.revision});
  assert.equal((await colleague.call('/api/account/accept',{code:first.invite})).status,403);
  await colleague.ok('/api/account/accept',{code:fresh.invite});
  assert.equal((await colleague.call('/api/account/accept',{code:fresh.invite})).status,403);
  await colleague.boot();
  assert.equal(colleague.view.actor.person,'Người được mời');
  assert.equal(colleague.view.documents.length,0);
  assert.equal((await colleague.call('/api/account/members')).status,403);
  assert.equal((await colleague.call('/api/account/select',{orgId:org,code:'KTT'})).status,403);
  await colleague.deny(403,'bank.sample');
  const shared=(await colleague.act('order.create',{kind:'buy',date:'2026-11-24',quantity:2,price:100000})).result.target;
  await colleague.ok('/api/account/select',{orgId:org,code:'PD'});
  await colleague.boot();
  assert.equal(colleague.view.orderApprovals[0].mine,true);
  await colleague.deny(403,'order.approve',{id:shared});
  await owner.ok('/api/account/select',{orgId:org,code:'KTT'});
  await owner.boot();
  assert.equal(owner.view.report.summary.cash,0);
  await owner.act('order.approve',{id:shared});
  assert.equal(owner.view.orders[0].status,'approved');
  await other.ok('/api/account/create',{organization:'Đơn vị độc lập',name:'Chủ đơn vị thứ hai'});
  const otherOrg=(await other.ok('/api/account')).selection.orgId;
  await other.ok('/api/account/select',{orgId:otherOrg,code:'KT'});
  await other.boot();
  assert.deepEqual(other.view.orders,[]);
  await other.deny(404,'order.revise',{id:shared,date:'2026-11-24',quantity:1,price:1});
  const otherOrder=await other.act('order.create',{kind:'buy',date:'2026-11-24',quantity:3,price:200000});
  assert.equal(otherOrder.result.target,shared);
  assert.equal(other.view.orders[0].quantity,3);
  await owner.boot();
  assert.equal(owner.view.orders[0].quantity,2);
  assert.equal((await colleague.call('/api/demo-role',{code:'KTT'})).status,403);
  await owner.ok('/api/account/select',{orgId:org,code:'QT'});
  const active=(await owner.ok('/api/account/members')).members.find(row=>row.id===pending.id);
  await owner.ok('/api/account/update',{...input,id:active.id,revision:active.revision,branch:'CN02'});
  await colleague.ok('/api/account/select',{orgId:org,code:'KT'});
  await colleague.boot();
  assert.equal(colleague.view.orders.length,0);
  await colleague.deny(404,'order.revise',{id:shared,date:'2026-11-24',quantity:1,price:1});
  const latest=(await owner.ok('/api/account/members')).members.find(row=>row.id===pending.id);
  await owner.ok('/api/account/status',{id:latest.id,revision:latest.revision,status:'suspended'});
  assert.equal((await colleague.call('/api/workspace')).status,403);
  const stopped=(await owner.ok('/api/account/members')).members.find(row=>row.id===pending.id);
  await owner.ok('/api/account/status',{id:stopped.id,revision:stopped.revision,status:'active'});
  await colleague.boot();
  sqlite.prepare('UPDATE ledo_members SET valid_until=? WHERE id=?').run(Date.now()-1000,pending.id);
  assert.equal((await colleague.call('/api/workspace')).status,403);
  await colleague.ok('/api/account/select',{mode:'demo'});
  await colleague.boot();
  assert.equal(colleague.view.documents.length,2);
  const history=(await owner.ok('/api/account/members')).history;
  assert.ok(history.some(row=>row.action==='Kích hoạt tài khoản'));
  assert.ok(history.some(row=>row.action==='Ngừng truy cập'));
});


test('Integration simulation appears only in demo navigation, workspace data and role documentation',async()=>{
  const {visitor}=fixture();
  const v=visitor('integration-review');
  await v.boot();
  await v.role('HT');
  await v.act('integration.event',{kind:'invoice',ref:'QA-DEMO-01'});
  await v.role('KTT');
  assert.ok(v.view.nav.includes('integration'));
  assert.equal(v.view.events[0].ref,'QA-DEMO-01');

  await v.ok('/api/account/create',{organization:'Đơn vị kiểm thử',name:'Chủ đơn vị'});
  const directory=await v.ok('/api/account');
  assert.ok(!directory.roleOptions.find(role=>role.code==='KTT').pages.includes('integration'));
  await v.ok('/api/account/select',{orgId:directory.selection.orgId,code:'KTT'});
  await v.boot();
  assert.ok(!v.view.nav.includes('integration'));
  assert.equal(v.view.events,undefined);
  assert.ok(!v.view.caps.includes('event.simulate'));
  await v.deny(403,'integration.event',{kind:'invoice',ref:'QA-COMPANY-01'});

  await v.ok('/api/account/select',{mode:'demo'});
  await v.boot();
  assert.ok(v.view.nav.includes('integration'));
  assert.deepEqual(v.view.events.map(event=>event.ref),['QA-DEMO-01']);
});

test('Worker serves the React bundle, Tailwind styles and brand from the HTML entry point',async()=>{
  const {env}=fixture();
  const get=path=>worker.fetch(new Request(origin+path),env);
  const home=await get('/');
  assert.equal(home.status,200);
  const html=await home.text();
  const script=html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const stylesheet=html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(script,'Vite script in the HTML');
  assert.ok(stylesheet,'Vite stylesheet in the HTML');
  assert.match(html,/href="\/assets\/mark\.svg"/);

  const entry=await get(script);
  assert.equal(entry.status,200);
  assert.match(entry.headers.get('content-type'),/^text\/javascript/);
  assert.match(await entry.text(),/Danh sách tài khoản/);

  const css=await get(stylesheet);
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type'),/^text\/css/);
  const rules=await css.text();
  assert.match(rules,/\.sidebar\{/);
  assert.match(rules,/\.gap-4\{/);
  const brand=await get('/assets/mark.svg');
  assert.equal(brand.status,200);
  assert.match(brand.headers.get('content-type'),/^image\/svg\+xml/);
  assert.equal((await get('/backend/modules/access/accounts.mjs')).status,404);
});


test('Financial overview reconciles posted journals and shows no document IDs to leadership',async()=>{
  const {visitor,env}=fixture();
  const sample=reportExample();
  sample.docs.push({id:'BH-NHAP',date:'2026-11-10',kind:'sell',party:'Nháp',quantity:1,price:20000000,
    branch:'CN01',status:'draft',owner:'KT'});
  env.DB.prepare('INSERT INTO ledo_workspaces (owner_id,revision,payload) VALUES (?,0,?)')
    .bind('visual-qa',JSON.stringify(sample)).run();
  const v=visitor('visual-qa');
  await v.boot();
  assert.equal(v.view.report,undefined);
  await v.role('LD');
  const {overview,summary}=v.view.report;
  const sum=key=>overview.days.reduce((total,day)=>total+day[key],0);
  assert.equal(overview.days.length,30);
  assert.equal(sum('revenue'),summary.revenue);
  assert.equal(sum('cogs'),summary.cogs);
  assert.equal(sum('revenue')-sum('cogs'),summary.profit);
  assert.equal(sum('expense'),summary.expense);
  assert.equal(sum('posted'),23);
  assert.equal(overview.cash.opening+sum('inflow')-sum('outflow'),overview.cash.closing);
  for(const key of ['receivable','payable']){
    const row=overview.debt[key];
    assert.equal(row.original-row.settled,row.open);
  }
  assert.equal(v.view.documents,undefined);
  assert.doesNotMatch(JSON.stringify(v.view.report),/BH-001|Cà phê Mộc/);
  await v.role('KTT');
  assert.deepEqual(v.view.report.overview,overview);
  assert.equal(v.view.documents.find(doc=>doc.id==='BH-001').party,'Cà phê Mộc');
  await v.role('QT');
  await v.act('role.update',{role:'LD',branch:'CN02',active:true,bankLink:false});
  await v.role('LD');
  assert.equal(v.view.report.summary.revenue,0);
  assert.ok(v.view.report.overview.days.every(day=>day.posted===0));
  assert.equal(v.view.report.overview.cash.closing,0);
});

test('Stocktake corrections require independent approval and carry pending variance accounts into the stock card',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.role('TK');
  const shortage=(await v.act('warehouse.count',{warehouse:'K01',quantity:4,date:'2026-11-23'})).result.target;
  await v.deny(403,'warehouse.adjust',{id:shortage,reason:'Thiếu khi kiểm kê'});
  assert.equal(v.view.counts[0].estimatedValue,undefined);
  await v.role('KT');
  const loss=(await v.act('warehouse.adjust',{id:shortage,date:'2026-11-23',reason:'Chưa rõ nguyên nhân thiếu'})).result.target;
  assert.deepEqual(v.view.documents.find(row=>row.id===loss).lines,[{debit:'1381',credit:'156',value:200000}]);
  await v.deny(409,'warehouse.adjust',{id:shortage,reason:'Thử tạo lại'});
  assert.equal(v.view.stockCard.rows.length,2);
  await v.act('doc.submit',{id:loss});
  await v.role('KTT');
  assert.equal(v.view.report.summary.units,6);
  await v.deny(409,'doc.post',{id:loss});
  await v.act('doc.approve',{id:loss});
  await v.act('doc.post',{id:loss});
  assert.equal(v.view.report.summary.units,4);
  assert.equal(v.view.report.summary.stock,400000);
  assert.equal(v.view.report.summary.balances['1381'].debit,200000);
  assert.equal(v.view.report.summary.cogs,400000);
  assert.equal(v.view.counts.find(row=>row.id===shortage).resolved,true);
  await v.deny(409,'doc.post',{id:loss});
  await v.deny(409,'warehouse.void-adjustment',{id:loss,reason:'Đã ghi'});
  await v.role('TK');
  const surplus=(await v.act('warehouse.count',{warehouse:'K01',quantity:7,date:'2026-11-24'})).result.target;
  await v.role('KT');
  await v.deny(422,'warehouse.adjust',{id:surplus,value:0,reason:'Chưa rõ nguyên nhân thừa'});
  const gain=(await v.act('warehouse.adjust',{id:surplus,value:220001,reason:'Chưa rõ nguyên nhân thừa'})).result.target;
  await v.act('doc.submit',{id:gain});
  await v.role('PD');await v.act('doc.approve',{id:gain});
  await v.role('KTT');await v.act('doc.post',{id:gain});
  assert.equal(v.view.report.summary.units,7);
  assert.equal(v.view.report.summary.stock,620001);
  assert.equal(v.view.report.summary.balances['3381'].credit,220001);
  assert.equal(v.view.report.summary.revenue,600000);
  assert.equal(v.view.report.summary.ar,600000);
  assert.equal(v.view.report.summary.ap,1000000);
  assert.equal(v.view.report.summary.cash,5000000);
  assert.deepEqual(v.view.stockCard.rows.slice(-2).map(({id,incoming,value})=>[id,incoming,value]),[[loss,false,200000],[gain,true,220001]]);
  await v.role('TK');
  assert.ok(v.view.stockCard.rows.every(row=>!Object.hasOwn(row,'value')));
  assert.ok(v.view.counts.every(row=>!Object.hasOwn(row,'estimatedValue')));
});

test('New counts invalidate already approved adjustments and void preserves the record',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.role('TK');
  const old=(await v.act('warehouse.count',{warehouse:'K01',quantity:4,date:'2026-11-24'})).result.target;
  await v.role('KT');
  const draft=(await v.act('warehouse.adjust',{id:old,reason:'Phát hiện thiếu khi kiểm kê'})).result.target;
  await v.act('doc.submit',{id:draft});
  await v.role('KTT');
  await v.act('doc.approve',{id:draft});
  await v.role('TK');
  await v.act('warehouse.count',{warehouse:'K01',quantity:6,date:'2026-11-24'});
  await v.role('KTT');
  await v.deny(409,'doc.post',{id:draft});
  await v.deny(422,'warehouse.resolve',{id:old,reason:'Số đếm ban đầu sai'});
  await v.act('warehouse.void-adjustment',{id:draft,reason:'Có biên bản kiểm kê mới'});
  assert.equal(v.view.documents.find(row=>row.id===draft).status,'void');
  assert.equal(v.view.closing.checks.find(row=>row.name==='Chứng từ').count,0);
  await v.act('warehouse.resolve',{id:old,reason:'Số đếm ban đầu sai'});
  assert.equal(v.view.report.summary.units,6);
  assert.equal(v.view.counts.find(row=>row.id===old).adjustmentId,null);
  assert.equal(v.view.counts.find(row=>row.id===old).resolved,true);
});

test('Count variances can be split and cleared partially with reservations, duplicate decisions and traceable GL',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.role('TK');
  const count=(await v.act('warehouse.count',{warehouse:'K01',quantity:4,date:'2026-11-23'})).result.target;
  await v.role('KT');
  const source=(await v.act('warehouse.adjust',{id:count,reason:'Chưa rõ nguyên nhân'})).result.target;
  await v.act('doc.submit',{id:source});
  await v.role('KTT');
  await v.act('doc.approve',{id:source});
  await v.act('doc.post',{id:source});
  const afterStock=v.view.report.summary.stock;
  const afterCash=v.view.report.summary.cash;
  await v.role('KT');
  const form={id:source,date:'2026-11-24',decision:'QD-17',reason:'Hồ sơ xác định trách nhiệm',
    allocations:[{account:'1388',value:60000,party:'Đơn vị bồi thường'},{account:'632',value:40000}]};
  await v.deny(422,'warehouse.settle',{...form,date:'2026-11-22'});
  await v.deny(422,'warehouse.settle',{...form,allocations:[{account:'1388',value:50000}]});
  await v.deny(422,'warehouse.settle',{...form,allocations:[{account:'711',value:50000}]});
  const first=(await v.act('warehouse.settle',form)).result.target;
  await v.deny(409,'warehouse.settle',{...form,decision:'qd-17'});
  await v.deny(409,'warehouse.settle',{...form,decision:'QD-18',allocations:[{account:'632',value:100001}]});
  assert.equal(v.view.varianceCases[0].reserved,100000);
  assert.equal(v.view.varianceCases[0].remaining,200000);
  assert.equal(v.view.varianceCases[0].available,100000);
  await v.act('doc.submit',{id:first});
  const secondForm={...form,decision:'QD-18',allocations:[{account:'632',value:100000}]};
  const reserved=(await v.act('warehouse.settle',secondForm)).result.target;
  assert.equal(v.view.varianceCases[0].available,0);
  await v.act('doc.cancel',{id:reserved});
  assert.equal(v.view.varianceCases[0].available,100000);
  const second=(await v.act('warehouse.settle',secondForm)).result.target;
  await v.act('doc.submit',{id:second});
  await v.role('KTT');
  await v.act('doc.approve',{id:first});
  await v.act('doc.post',{id:first});
  assert.equal(v.view.report.summary.balances['1381'].debit-v.view.report.summary.balances['1381'].credit,100000);
  assert.equal(v.view.report.summary.balances['1388'].debit,60000);
  assert.equal(v.view.varianceCases[0].processed,100000);
  await v.act('doc.approve',{id:second});
  await v.act('doc.post',{id:second});
  assert.equal(v.view.varianceCases[0].remaining,0);
  assert.equal(v.view.varianceCases[0].history.length,3);
  assert.equal(v.view.report.summary.stock,afterStock);
  assert.equal(v.view.report.summary.cash,afterCash);
  assert.equal(v.view.report.summary.cogs,540000);
  assert.deepEqual(v.view.documents.find(doc=>doc.id===first).lines,[{debit:'1388',credit:'1381',value:60000},{debit:'632',credit:'1381',value:40000}]);
  await v.role('TK');
  assert.equal(v.view.varianceCases,undefined);
});

test('Surplus settlement separates other payable and income from sales and inventory',async()=>{
  const v=fixture().visitor();await v.boot();
  await v.role('TK');
  const count=(await v.act('warehouse.count',{warehouse:'K01',quantity:7,date:'2026-11-23'})).result.target;
  await v.role('KT');
  const source=(await v.act('warehouse.adjust',{id:count,value:120000,reason:'Chưa rõ nguồn gốc'})).result.target;
  await v.act('doc.submit',{id:source});
  await v.role('KTT');
  await v.act('doc.approve',{id:source});
  await v.act('doc.post',{id:source});
  await v.role('KT');
  const settlement=(await v.act('warehouse.settle',{id:source,date:'2026-11-24',decision:'BB-001',reason:'Xác minh tài sản',
    allocations:[{account:'3388',value:70000,party:'Bên có quyền nhận'},{account:'711',value:50000}]})).result.target;
  await v.act('doc.submit',{id:settlement});
  await v.role('KTT');await v.act('doc.approve',{id:settlement});
  await v.act('doc.post',{id:settlement});
  assert.equal(v.view.report.summary.otherIncome,50000);
  assert.equal(v.view.report.summary.revenue,600000);
  assert.equal(v.view.report.summary.ap,1000000);
  assert.equal(v.view.report.summary.stock,720000);
  assert.equal(v.view.report.summary.balances['3388'].credit,70000);
  assert.equal(v.view.report.summary.balances['3381'].debit,120000);
  assert.equal(v.view.varianceCases[0].remaining,0);
});

test('Cash payments from variance decisions are scoped, reserved, approved, verified and settled through 1388 or 3388',async()=>{
  const v=fixture().visitor();await v.boot();
  async function decision(counted,value,account,ref){
    await v.role('TK');
    const count=(await v.act('warehouse.count',{warehouse:'K01',quantity:counted,date:'2026-11-23'})).result.target;
    await v.role('KT');
    const source=(await v.act('warehouse.adjust',{id:count,value,reason:'Chênh kiểm kê mẫu'})).result.target;
    await v.act('doc.submit',{id:source});
    await v.role('KTT');await v.act('doc.approve',{id:source});await v.act('doc.post',{id:source});
    await v.role('KT');
    const id=(await v.act('warehouse.settle',{id:source,date:'2026-11-24',decision:ref,reason:'Quyết định mẫu',
      allocations:[{account,value,party:'Bên đối ứng mẫu'}]})).result.target;
    await v.deny(409,'warehouse.cash',{id,date:'2026-11-24',amount:1,receiptRef:'REF-Z',reason:'Chưa ghi quyết định'});
    await v.act('doc.submit',{id});
    await v.role('KTT');await v.act('doc.approve',{id});await v.act('doc.post',{id});
    return id;
  }
  const claim=await decision(4,120000,'1388','QD-01');
  const liability=await decision(5,100000,'3388','QD-02');
  const payment={date:'2026-11-25',receiptRef:'REF-01',reason:'Thanh toán mẫu'};
  await v.role('KT');
  const receipt=(await v.act('warehouse.cash',{...payment,id:claim,amount:70000})).result.target;
  await v.deny(409,'warehouse.cash',{...payment,id:claim,amount:1,receiptRef:'ref-01'});
  await v.deny(409,'warehouse.cash',{...payment,id:claim,amount:50001,receiptRef:'REF-02'});
  assert.equal(v.view.varianceCashCases.find(row=>row.id===claim).reserved,70000);
  await v.act('doc.revise',{id:receipt,amount:80000,description:'Sửa số thu'});
  await v.act('doc.submit',{id:receipt});
  const expense=(await v.act('warehouse.cash',{...payment,id:liability,amount:75000})).result.target;
  await v.act('doc.submit',{id:expense});
  await v.role('KTT');
  await v.act('doc.approve',{id:receipt});await v.act('doc.approve',{id:expense});
  await v.deny(409,'doc.post',{id:receipt});
  await v.role('TQ');
  assert.equal(v.view.varianceCashCases,undefined);
  await v.deny(422,'cash.verify',{id:receipt,actual:79999});
  await v.deny(409,'cash.verify',{id:expense,actual:75000});
  await v.act('cash.verify',{id:receipt,actual:80000});
  await v.role('KTT');
  assert.equal(v.view.report.summary.fund,0);
  await v.deny(409,'warehouse.void-adjustment',{id:receipt,reason:'Tiền đã xác nhận'});
  await v.act('doc.post',{id:receipt});
  assert.equal(v.view.report.summary.fund,80000);
  assert.equal(v.view.varianceCashCases.find(row=>row.id===claim).remaining,40000);
  await v.role('TQ');await v.act('cash.verify',{id:expense,actual:75000});
  assert.equal(v.view.cash.reservedOut,75000);
  await v.role('KTT');await v.act('doc.post',{id:expense});
  const {summary}=v.view.report;
  assert.equal(summary.fund,5000);
  assert.equal(summary.balances['1388'].credit,80000);
  assert.equal(summary.balances['3388'].debit,75000);
  assert.equal(summary.ar,600000);
  assert.equal(summary.ap,1000000);
  assert.equal(v.view.varianceCashCases.find(row=>row.id===liability).remaining,25000);
  await v.deny(409,'doc.post',{id:expense});
  await v.role('KS');
  assert.equal(v.view.varianceCashCases.find(row=>row.id===claim).history[0].receiptRef,'REF-01');
});

test('Batch vouchers dry-run, verify cash per item and post atomically with a stale revision guard',async()=>{
  const {visitor}=fixture();
  const v=visitor();
  await v.boot();
  const create=async(price,date)=>(await v.act('doc.save',{kind:'receive',source:'BH-001',date,price,channel:'cash',description:'Thu tại quỹ'})).result.target;
  const first=await create(10000,'2026-11-24');
  const second=await create(15000,'2026-11-25');
  const entries=[{id:second},{id:first}];
  const run=(operation,entries)=>v.act('documents.batch',{operation,entries});
  const preview=(operation,entries)=>v.ok('/api/actions/preview',{action:'documents.batch',data:{operation,entries},revision:v.view.revision});
  const revision=v.view.revision;

  assert.equal((await preview('submit',entries)).ok,true);
  await v.boot();
  assert.equal(v.view.revision,revision);
  assert.ok(v.view.documents.find(row=>row.id===first).status==='draft');
  await run('submit',entries);
  await v.deny(403,'documents.batch',{operation:'approve',entries});
  await v.role('PD');
  await run('approve',entries);

  await v.role('KTT');
  const beforePost=v.view.revision;
  const early=await preview('post',entries);
  assert.equal(early.failure.id,first);
  assert.match(early.failure.message,/Thủ quỹ/);
  await v.deny(409,'documents.batch',{operation:'post',entries});
  assert.equal((await v.boot()).revision,beforePost);

  await v.role('TQ');
  assert.ok(v.view.cash.requests.some(row=>row.id===first&&row.date==='2026-11-24'));
  const wrong=[{id:first,actual:10000},{id:second,actual:14999}];
  const checked=await preview('verify',wrong);
  assert.equal(checked.ok,false);
  assert.equal(checked.failure.id,second);
  assert.deepEqual(checked.items.map(row=>row.id),[first]);
  await v.deny(422,'documents.batch',{operation:'verify',entries:wrong});
  await v.boot();
  assert.ok(v.view.cash.requests.filter(row=>[first,second].includes(row.id)).every(row=>!row.verified));

  const actual=[{id:first,actual:10000},{id:second,actual:15000}];
  assert.equal((await preview('verify',actual)).ok,true);
  await run('verify',actual);
  await v.role('KTT');
  const posting=await preview('post',entries);
  assert.deepEqual(posting.items.map(row=>row.id),[first,second]);
  const underReview=v.view.revision;
  const beforeFund=v.view.report.summary.fund;
  const posted=await run('post',entries);
  assert.deepEqual(posted.result.items.map(row=>row.id),[first,second]);
  assert.equal(posted.report.summary.fund,beforeFund+25000);
  assert.ok(posted.audit.some(row=>row.target===posted.result.target));
  assert.deepEqual(posted.audit.filter(row=>row.batch===posted.result.target).map(row=>row.target).sort(),[first,second].sort());
  const stale=await v.call('/api/actions',{action:'documents.batch',data:{operation:'post',entries},revision:underReview});
  assert.equal(stale.status,409);
  await v.deny(409,'documents.batch',{operation:'post',entries});
});

test('Batch approval does not advance an eligible document when another exceeds the limit',async()=>{
  const {visitor}=fixture();
  const v=visitor();
  await v.boot();
  const make=async price=>{
    const id=(await v.act('doc.save',{kind:'receive',source:'BH-001',date:'2026-11-24',price,description:'Chờ duyệt'})).result.target;
    await v.act('doc.submit',{id});
    return id;
  };
  const eligible=await make(50);
  const high=await make(101);
  await v.role('QT');
  await v.act('role.update',{role:'PD',branch:'CN01',limit:100,active:true,bankLink:false});
  await v.role('PD');
  const data={operation:'approve',entries:[{id:eligible},{id:high}]};
  const before=v.view.revision;
  const preview=await v.ok('/api/actions/preview',{action:'documents.batch',data,revision:before});
  assert.equal(preview.failure.id,high);
  assert.match(preview.failure.message,/hạn mức/);
  await v.deny(403,'documents.batch',data);
  assert.equal((await v.boot()).revision,before);
  assert.deepEqual(v.view.approvals.map(row=>row.id),[eligible,high]);
  await v.deny(422,'documents.batch',{operation:'approve',entries:[{id:eligible},{id:eligible}]});
  await v.deny(404,'documents.batch',{operation:'approve',entries:[{id:eligible},{id:'KHONG-TON-TAI'}]});
});

test('Ledger review reconciles stock and debt within branch and limits detail by role',async()=>{
  const {visitor,sqlite}=fixture();
  const v=visitor('ledger-review-check');
  await v.boot();
  assert.equal(v.view.ledgerReview,undefined);
  await v.role('LD');
  assert.equal(v.view.ledgerReview,undefined);
  await v.role('KS');
  assert.ok(v.view.nav.includes('ledger-review'));
  assert.equal(v.view.closing,undefined);
  assert.deepEqual(v.view.ledgerReview.comparisons.map(row=>row.difference),[0,0,0,0]);

  const read=sqlite.prepare('SELECT payload FROM ledo_workspaces WHERE owner_id=?');
  const state=JSON.parse(read.get('ledger-review-check').payload);
  const purchase=state.docs.find(row=>row.kind==='buy');
  purchase.itemId='old-unmapped-item';
  const write=sqlite.prepare('UPDATE ledo_workspaces SET payload=? WHERE owner_id=?');
  write.run(JSON.stringify(state),'ledger-review-check');

  await v.role('KTT');
  assert.ok(v.view.closing.checks.length);
  const inventory=v.view.ledgerReview.comparisons.find(row=>row.id==='inventory');
  assert.notEqual(inventory.difference,0);
  assert.equal(v.view.ledgerReview.signals.find(row=>row.id==='unknownItems').count,1);
  await v.role('QT');
  await v.act('role.update',{role:'KS',branch:'CN02',active:true,bankLink:false});
  await v.role('KS');
  assert.deepEqual(v.view.ledgerReview.comparisons.map(row=>row.difference),[0,0,0,0]);
  assert.ok(v.view.ledgerReview.signals.every(row=>row.count===0));
});

test('Dated review excludes later postings and returns the underlying comparison rows',async()=>{
  const {visitor,sqlite}=fixture();
  const v=visitor('review-cutoff');
  await v.boot();
  await v.role('KTT');
  const full=await v.ok('/api/ledger-review?date=2026-11-30&group=inventory');
  assert.equal(full.branch,'CN01');
  assert.equal(full.revision,v.view.revision);
  assert.ok(full.evidence.some(row=>row.source==='Thẻ kho'&&row.document==='MH-001'));
  assert.ok(full.evidence.some(row=>row.source==='Sổ cái'&&row.document==='MH-001'));
  const opening=await v.ok('/api/ledger-review?date=2026-11-01&group=inventory');
  assert.ok(!opening.evidence.some(row=>row.date&&row.date>'2026-11-01'));
  assert.notEqual(opening.comparisons.find(row=>row.id==='inventory').left,full.comparisons.find(row=>row.id==='inventory').left);
  assert.equal((await v.call('/api/ledger-review?date=2026-12-01')).status,422);
  assert.equal((await v.call('/api/ledger-review?date=2026-11-30&group=anything')).status,422);
  await v.role('KS');
  const debt=await v.ok('/api/ledger-review?date=2026-11-30&group=receivable');
  assert.ok(debt.evidence.some(row=>row.source==='Công nợ chi tiết'&&row.document==='BH-001'));
  await v.role('LD');
  assert.equal((await v.call('/api/ledger-review?date=2026-11-30')).status,403);
  assert.equal(sqlite.prepare('SELECT revision FROM ledo_workspaces WHERE owner_id=?').get('review-cutoff').revision,full.revision);
});

test('Cancelled payment draft is recoverable by its author without changing the ledger',async()=>{
  const {visitor}=fixture();
  const v=visitor();
  await v.boot();
  const draft=(await v.act('doc.save',{kind:'receive',source:'BH-001',date:'2026-11-24',price:10000,channel:'cash'})).result.target;
  await v.act('doc.cancel',{id:draft});
  const cancelled=v.view.documents.find(row=>row.id===draft);
  assert.equal(cancelled.status,'void');
  assert.ok(cancelled.cancelledDraftAt);
  assert.ok(cancelled.history.some(row=>row.message.includes('Đã hủy bản nháp')));
  await v.role('KTT');
  const before=v.view.report.summary.fund;
  await v.deny(403,'doc.restore',{id:draft});
  await v.role('KT');
  await v.act('doc.restore',{id:draft});
  const restored=v.view.documents.find(row=>row.id===draft);
  assert.equal(restored.status,'draft');
  assert.equal(restored.cancelledDraftAt,undefined);
  assert.equal(restored.total,10000);
  assert.match(restored.history[0].message,/phục hồi/);
  await v.deny(409,'doc.restore',{id:draft});
  await v.role('KTT');
  assert.equal(v.view.report.summary.fund,before);
});

test('Recovery restores receipt linkage once and rejects a draft if its source has been reused',async()=>{
  const v=fixture().visitor();
  await v.boot();
  const id=(await v.act('order.create',{kind:'sell',date:'2026-11-24',quantity:1,price:150000})).result.target;
  await v.role('PD');
  await v.act('order.approve',{id});
  await v.role('TK');
  await v.act('warehouse.confirm',{id,warehouse:'K01',quantity:1});
  const receipt=v.view.orders.find(row=>row.id===id).receipts[0].id;
  await v.role('KT');
  const draft=(await v.act('order.draft',{id,receipt})).result.target;
  await v.act('doc.cancel',{id:draft});
  await v.act('doc.restore',{id:draft});
  assert.equal(v.view.orders.find(row=>row.id===id).receipts[0].docId,draft);
  await v.act('doc.cancel',{id:draft});
  const replacement=(await v.act('order.draft',{id,receipt})).result.target;
  await v.deny(409,'doc.restore',{id:draft});
  await v.boot();
  assert.equal(v.view.orders.find(row=>row.id===id).receipts[0].docId,replacement);
  assert.equal(v.view.documents.find(row=>row.id===draft).status,'void');
});
