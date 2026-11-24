import test from 'node:test';
import assert from 'node:assert/strict';
import {utilityGroups,searchUtilities} from '../../frontend/src/features/utilities/utilityIndex.mjs';

const routes=groups=>groups.flatMap(group=>group.items.map(item=>item.route).filter(Boolean));
const items=groups=>groups.flatMap(group=>group.items);

test('Utilities only link to available routes and real-mode administration is distinct',()=>{
  const treasurer={nav:['cash'],roles:[{code:'TQ'}],workMode:'company'};
  const treasury=utilityGroups(treasurer,{standalone:true});
  assert.deepEqual(routes(treasury),['cash']);
  assert.ok(items(treasury).some(item=>item.action==='auth-logout'));
  assert.ok(!items(treasury).some(item=>item.action==='roles'));

  const organization={nav:['administration'],roles:[{code:'QT'},{code:'KTT'}],workMode:'company'};
  const admin=utilityGroups(organization,{standalone:true});
  assert.ok(items(admin).some(item=>item.route==='administration'&&item.filter==='roles'));
  assert.ok(items(admin).some(item=>item.action==='roles'));
  assert.ok(!items(admin).some(item=>item.company===false));

  const demo=utilityGroups({...organization,workMode:undefined});
  assert.deepEqual(routes(demo),['administration']);
  assert.ok(!items(demo).some(item=>item.filter==='roles'||item.action==='auth-logout'));
});

test('Accent-insensitive utility search preserves the assigned scope',()=>{
  const groups=utilityGroups({nav:['catalog','opening','bank'],roles:[{code:'KT'}]});
  assert.deepEqual(routes(searchUtilities(groups,'quan ly danh muc')),['catalog']);
  assert.deepEqual(routes(searchUtilities(groups,'doi chieu ngan hang')),['bank']);
  assert.deepEqual(routes(searchUtilities(groups,'ma tran quyen')),[]);
  assert.deepEqual(searchUtilities(groups,'  '),groups);
});

test('Posting-date preferences are calendar-valid, isolated by context and hidden when locked', async()=>{
  const {postingDateKey,postingDateInPeriod,preferredPostingDate}=await import('../../frontend/src/features/workspace-settings/postingDate.mjs');
  const view={caps:['doc.write'],preferenceScope:'member-a',locked:false,nav:[],roles:[],actor:{branch:'CN01',code:'KT'},
    period:'2026-11',defaultDate:'2026-11-24'};
  assert.equal(postingDateInPeriod('2026-11-30',view.period),true);
  assert.equal(postingDateInPeriod('2026-11-31',view.period),false);
  assert.equal(postingDateInPeriod('2026-12-01',view.period),false);
  const data=new Map([[postingDateKey(view),'2026-11-03']]);
  const browser=()=>({getItem:key=>data.get(key)});
  assert.equal(preferredPostingDate(view,browser),'2026-11-03');
  for(const change of [{preferenceScope:'member-b'},{locked:true},{actor:{...view.actor,branch:'CN02'}},{actor:{...view.actor,code:'KTT'}}]){
    assert.equal(preferredPostingDate({...view,...change},browser),view.defaultDate);
  }
  assert.ok(items(utilityGroups(view)).some(item=>item.action==='posting-date'));
  assert.ok(!items(utilityGroups({...view,locked:true})).some(item=>item.action==='posting-date'));
});
