export const maySetPostingDate=view=>!view.locked&&
  (view.caps?.includes('order.write')||view.caps?.includes('doc.write')||view.caps?.includes('bank.prepare'));

export function postingDateInPeriod(value,period){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||value.slice(0,7)!==period)return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

export function postingDateKey(view){
  return ['ledo.posting-date',view.preferenceScope??'demo',view.actor.branch,view.actor.code,view.period].join(':');
}

export function preferredPostingDate(view,storage){
  if(maySetPostingDate(view)){
    try{
      const value=storage().getItem(postingDateKey(view));
      if(postingDateInPeriod(value,view.period))return value;
    }catch{}
  }
  return view.defaultDate;
}
