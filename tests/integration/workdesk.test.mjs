import test from 'node:test';
import assert from 'node:assert/strict';
import {roles, roleCapabilities} from '../../backend/modules/access/roles.mjs';
import {desks, filters, queueFor, quickAction} from '../../frontend/src/features/workdesk/workdesk.mjs';

test('All Ledo roles have a desk and work shortcuts stay within available routes and capabilities', () => {
  for (const [code, role] of Object.entries(roles)) {
    const caps = [...roleCapabilities(code)];
    assert.ok(role.pages.includes(desks[code].primary), code);
    assert.ok(desks[code].modules.every(page => role.pages.includes(page)), code);
    const view = {actor:{code,limit:null}, nav:[], caps, locked:false};
    assert.deepEqual(queueFor(view), [], code);
    assert.equal(quickAction(view), null, code);
  }
  const treasurer = {actor:{code:'TQ',limit:null},nav:['cash'],caps:['cash.confirm'],locked:true};
  assert.equal(quickAction(treasurer).action, 'focus:cash');
  const warehouse = {actor:{code:'TK',limit:null},nav:['warehouse'],caps:['stock.count'],locked:true};
  assert.equal(quickAction(warehouse), null);
});

test('Approval and posting queues match the filters and distinguish locked-period reopening', () => {
  const orderApprovals = [
    {status:'review', mine:true, quantity:1, price:100},
    {status:'review', mine:false, quantity:2, price:100},
    {status:'review', mine:false, quantity:1, price:100}
  ];
  const approvals = [
    {status:'review', mine:false, total:100}, {status:'review', mine:false, total:101}
  ];
  const reopen = [{status:'review', mine:false}, {status:'review', mine:true}];
  const view = {actor:{code:'PD',limit:100}, nav:['approvals'], caps:['approve'],locked:true,orderApprovals,approvals,reopen};
  assert.deepEqual(queueFor(view).map(item=>[item.key,item.value,item.blocked]),
    [['orders',1,true],['vouchers',1,true],['reopen',1,false]]);
  assert.equal(orderApprovals.filter(row=>filters.approvals.orders[1](row,view)).length, 1);
  const documents = [
    {status:'draft',mine:true}, {status:'approved',channel:'cash',verified:false},
    {status:'approved',channel:'cash',verified:true}, {status:'approved',channel:'bank'}
  ];
  const chief = {...view,actor:{code:'KTT',limit:null}, nav:['documents'],documents,locked:false};
  assert.equal(queueFor(chief)[0].value, 2);
});

test('Standard company roles use the same rights as runtime, with bank linking granted separately', () => {
  const context = {company:true,period:true,catalog:true};
  assert.equal(roleCapabilities('KT',context).has('invoice.import'), false);
  assert.equal(roleCapabilities('KT',context).has('bank.link'), false);
  assert.equal(roleCapabilities('KT',{...context,bankLink:true}).has('bank.link'), true);
  assert.equal(roleCapabilities('KTT',context).has('opening.apply'), true);
  assert.equal(roleCapabilities('TQ',context).has('doc.post'), false);
  assert.equal(roleCapabilities('TK',context).has('stock.confirm'), true);
});
