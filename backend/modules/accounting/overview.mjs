import {amount,entries,posted,validPostingDate,debtSources} from './ledger.mjs';

export function financialOverview(ledger, totals){
  const {period}=ledger;
  const [year,month]=period.split('-').map(Number);
  const length=new Date(Date.UTC(year,month,0)).getUTCDate();
  const days=Array.from({length},(_,index)=>({
    date:period+'-'+String(index+1).padStart(2,'0'),
    revenue:0,cogs:0,expense:0,inflow:0,outflow:0,posted:0
  }));
  const payments=new Map();
  const documents=posted(ledger);
  for(const doc of documents){
    if(doc.link&&(doc.kind==='pay'||doc.kind==='receive')){
      payments.set(doc.link,(payments.get(doc.link)??0)+amount(doc));
    }
    if(!validPostingDate(doc.date,period))continue;
    const slot=days[Number(doc.date.slice(-2))-1];
    slot.posted++;
    for(const [debit,credit,value] of entries(doc)){
      if(credit==='511')slot.revenue+=value;
      if(debit==='632')slot.cogs+=value;
      if(debit==='642')slot.expense+=value;
      if(debit==='111'||debit==='112')slot.inflow+=value;
      if(credit==='111'||credit==='112')slot.outflow+=value;
    }
  }
  const debt={
    receivable:{original:0,settled:0,open:totals.ar,count:0},
    payable:{original:0,settled:0,open:totals.ap,count:0}
  };
  for(const doc of debtSources(ledger)){
    const bucket=doc.kind==='sell'?debt.receivable:doc.kind==='buy'?debt.payable:null;
    if(!bucket)continue;
    const original=amount(doc);
    const settled=payments.get(doc.id)??0;
    bucket.original+=original;
    bucket.settled+=settled;
    if(original>settled)bucket.count++;
  }
  return {
    days,debt,inventory:{units:totals.units,value:totals.stock},
    cash:{opening:ledger.opening+ledger.openingFund,closing:totals.cash+totals.fund,bank:totals.cash,fund:totals.fund}
  };
}
