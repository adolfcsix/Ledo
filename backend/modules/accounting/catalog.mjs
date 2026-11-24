import {validPostingDate} from './ledger.mjs';

const masterKinds=['customer','supplier','both'];
const legacyItemId='legacy-item';
const codePattern=/^[A-Z0-9][A-Z0-9._-]{0,31}$/;

export function initializeCatalog(state){
  if(!state.period||state.catalog)return;
  const legacy=state.inventoryItem||state.counts.length||[...state.orders,...state.docs].some(row=>row.kind==='buy'||row.kind==='sell')?
    {id:legacyItemId,code:'VT001',name:state.inventoryItem??'Mặt hàng từ dữ liệu cũ',unit:'cái',from:state.period+'-01',inactiveFrom:null}:null;
  const items=legacy?[legacy]:[];
  const parties=[];
  const names=new Map();
  for(const record of [...state.orders,...state.docs,...state.bank]){
    if(record.kind==='payroll')continue;
    if(record.kind==='buy'||record.kind==='sell'){
      record.itemId=legacyItemId;
      record.itemCode=legacy.code;
      record.itemName=legacy.name;
      record.unit=legacy.unit;
    }
    if(!record.party)continue;
    if(!names.has(record.party)){
      const id='legacy-party-'+(parties.length+1);
      const party={id,code:'DT'+String(parties.length+1).padStart(3,'0'),name:record.party,kind:'both',from:state.period+'-01',inactiveFrom:null};
      parties.push(party);
      names.set(record.party,party);
    }
    const party=names.get(record.party);
    record.partyId=party.id;
    record.partyCode=party.code;
  }
  for(const count of state.counts)Object.assign(count,{itemId:legacyItemId,itemCode:legacy.code,itemName:legacy.name,unit:legacy.unit});
  state.catalog={items,parties};
}

export function isCatalogActive(record,date){
  return Boolean(record&&record.from<=date&&(!record.inactiveFrom||date<record.inactiveFrom));
}
export function usableCatalogRecord(records,id,date,kind){
  const record=records.find(row=>row.id===id);
  return isCatalogActive(record,date)&&(!kind||record.kind===kind||record.kind==='both')?record:null;
}
export function catalogChange(catalog,action,input,ensure,short){
  ensure(input.type==='items'||input.type==='parties','Nhóm danh mục không hợp lệ.');
  const records=catalog[input.type];
  const existing=records.find(row=>row.id===input.id);
  if(action==='catalog.status'){
    ensure(existing,'Mã danh mục không tồn tại.',404);
    const until=input.inactiveFrom;
    ensure(until===null||(typeof until==='string'&&validPostingDate(until,until.slice(0,7))&&until>=existing.from),
      'Ngày ngừng phải từ ngày bắt đầu sử dụng.');
    existing.inactiveFrom=until;
    return existing;
  }
  const name=short(input.name,100);
  if(input.id){
    ensure(existing,'Mã danh mục không tồn tại.',404);
    existing.name=name;
    return existing;
  }
  const code=short(input.code,32).toUpperCase();
  ensure(codePattern.test(code),'Mã chỉ dùng chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  ensure(!records.some(row=>row.code===code),'Mã đã được sử dụng trong danh mục.',409);
  const from=input.from;
  ensure(typeof from==='string'&&validPostingDate(from,from.slice(0,7)),'Ngày bắt đầu không hợp lệ.');
  const record={id:crypto.randomUUID(),code,name,from,inactiveFrom:null};
  if(input.type==='items')record.unit=short(input.unit,18);
  else{
    ensure(masterKinds.includes(input.kind),'Chọn nhóm đối tác phù hợp.');
    record.kind=input.kind;
  }
  records.push(record);
  return record;
}
export function sameParty(left,right){
  return left.partyId||right.partyId?Boolean(left.partyId&&left.partyId===right.partyId):left.party===right.party;
}
