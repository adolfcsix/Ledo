export const varianceMethods={
  adjustOut:[
    {account:'1388',label:'Ghi nhận phải thu bồi thường',requiresParty:true},
    {account:'632',label:'Phần thiếu doanh nghiệp chịu',requiresParty:false}
  ],
  adjustIn:[
    {account:'3388',label:'Ghi nhận phải trả khác',requiresParty:true},
    {account:'711',label:'Ghi nhận thu nhập khác',requiresParty:false}
  ]
};
export function varianceAmount(doc){
  return doc.allocations.reduce((total,line)=>total+line.value,0);
}
export function varianceEntries(doc){
  return doc.allocations.map(({account,value})=>doc.varianceKind==='adjustOut'?
    [account,'1381',value]:['3381',account,value]);
}
export function varianceProgress(docs,source){
  const history=docs.filter(doc=>doc.kind==='varianceClear'&&doc.varianceSource===source.id);
  let processed=0,reserved=0;
  for(const doc of history){
    if(doc.status==='posted')processed+=varianceAmount(doc);
    else if(doc.status!=='void')reserved+=varianceAmount(doc);
  }
  return {original:source.adjustmentValue,processed,reserved,remaining:source.adjustmentValue-processed,
    available:source.adjustmentValue-processed-reserved,history};
}

export function varianceCashLine(decision){
  if(decision?.kind!=='varianceClear'||decision.status!=='posted')return null;
  return decision.allocations.find(line=>line.account==='1388'||line.account==='3388')??null;
}
export function varianceCashProgress(docs,decision,line){
  const history=docs.filter(doc=>doc.varianceDecision===decision.id);
  let paid=0,reserved=0;
  for(const doc of history){
    if(doc.status==='posted')paid+=doc.price;
    else if(doc.status!=='void')reserved+=doc.price;
  }
  return {original:line.value,paid,reserved,remaining:line.value-paid,available:line.value-paid-reserved,history};
}
export function varianceCashIssue(docs,doc){
  const decision=docs.find(row=>row.id===doc.varianceDecision);
  const line=varianceCashLine(decision);
  if(!line||doc.varianceAccount!==line.account||doc.party!==line.party||doc.channel!=='cash'||
    doc.kind!==(line.account==='1388'?'receive':'pay'))return 'Quyết định gốc hoặc đối tượng thu chi không phù hợp.';
  if(doc.date<decision.date)return 'Ngày thu chi phải từ ngày ghi sổ quyết định trở đi.';
  const others=docs.filter(row=>row.id!==doc.id);
  const progress=varianceCashProgress(others,decision,line);
  if(doc.price>progress.available)return 'Số tiền vượt phần còn có thể lập sau khi tính các phiếu đang chờ.';
  if(progress.history.some(row=>row.status!=='void'&&row.receiptRef===doc.receiptRef))
    return 'Số phiếu tham chiếu đã dùng cho khoản này.';
  return '';
}
