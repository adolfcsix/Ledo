import {stockMovement} from './ledger.mjs';

export function stockCardModel(ledger,catalog,warehouse,withValue,audit=[]){
  const fallback='sample-item';
  const legacyOrder=new Map();
  for(const [index,record] of audit.entries()){
    if(record.message==='Đã ghi sổ chứng từ')legacyOrder.set(record.target,index-audit.length);
  }
  const rows=ledger.docs.flatMap(doc=>{
    if(doc.status!=='posted'||(doc.warehouse??warehouse)!==warehouse)return [];
    const movement=stockMovement(doc);
    if(!movement)return [];
    return [{id:doc.id,itemId:doc.itemId??fallback,kind:doc.kind,incoming:movement.units>0,date:doc.date,sequence:doc.stockPostingOrder??legacyOrder.get(doc.id)??-audit.length-1,
      party:doc.party,quantity:Math.abs(movement.units),...(withValue?{value:Math.abs(movement.value)}:{})}];
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.sequence-b.sequence);
  const master=catalog?.items??[{id:fallback,code:'VT001',name:'Bình giữ nhiệt',unit:'cái',inactiveFrom:null}];
  const opening=new Map((ledger.stockOpening??[]).map(row=>[row.itemId,row]));
  return {
    warehouse,withValue,
    items:master.map(({id,code,name,unit,inactiveFrom})=>({
      id,code,name,unit,inactiveFrom,
      opening:{units:opening.get(id)?.quantity??0,...(withValue?{value:opening.get(id)?.value??0}:{})}
    })),rows
  };
}
