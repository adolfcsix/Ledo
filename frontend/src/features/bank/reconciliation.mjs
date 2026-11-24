const sign=line=>line.kind==='receive'?line.amount:-line.amount;

export function bankReconciliation({opening,movements},statement,{date,balance}){
  const book=movements.filter(row=>row.date<=date);
  const rows=statement.filter(row=>row.date<=date);
  const entries=new Map(book.map(row=>[row.id,row]));
  const linked=new Set();
  const unlinkedBank=[];
  for(const row of rows){
    const entry=entries.get(row.linked);
    if(entry&&entry.date===row.date&&entry.move===sign(row)&&!linked.has(entry.id))linked.add(entry.id);
    else unlinkedBank.push(row);
  }
  const unlinkedBook=book.filter(row=>!linked.has(row.id));
  const incoming=book.reduce((total,row)=>total+Math.max(row.move,0),0);
  const outgoing=book.reduce((total,row)=>total+Math.max(-row.move,0),0);
  const closing=opening+incoming-outgoing;
  const statementOnly=unlinkedBank.reduce((total,row)=>total+sign(row),0);
  const bookOnly=unlinkedBook.reduce((total,row)=>total+row.move,0);
  const explained=statementOnly-bookOnly;
  const difference=balance===null?null:balance-closing;
  const residual=difference===null?null:difference-explained;
  return {opening,incoming,outgoing,closing,statementOnly,bookOnly,explained,difference,residual,
    unlinkedBank,unlinkedBook,linked:linked.size,bankCount:rows.length,bookCount:book.length};
}
