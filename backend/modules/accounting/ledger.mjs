import {varianceAmount,varianceEntries,varianceCashIssue} from './varianceSettlement.mjs';
export const accounts = {
  '111':'Tiền mặt','112':'Tiền gửi ngân hàng','131':'Phải thu khách hàng','1381':'Tài sản thiếu chờ xử lý','1388':'Phải thu khác','156':'Hàng hóa',
  '331':'Phải trả nhà cung cấp','3381':'Tài sản thừa chờ xử lý','3388':'Phải trả khác','711':'Thu nhập khác','411':'Vốn đầu kỳ','511':'Doanh thu bán hàng','632':'Giá vốn hàng bán','334':'Phải trả người lao động','642':'Chi phí quản lý'
};
export const kinds = {buy:'Mua chịu', sell:'Bán chịu', receive:'Thu khách hàng', pay:'Trả nhà cung cấp', payroll:'Lương tổng hợp',adjustIn:'Nhập thừa kiểm kê',adjustOut:'Xuất thiếu kiểm kê',varianceClear:'Xử lý chênh lệch kiểm kê'};
export const bankSample = [
  {ref:'NH-2411-01',date:'2026-11-24',party:'Cà phê Mộc',kind:'receive',amount:250000},
  {ref:'NH-2411-02',date:'2026-11-24',party:'Nhà cung cấp Minh Long',kind:'pay',amount:1000000}
];
export const sampleDocs = [
  {id:'MH-001',date:'2026-11-18',kind:'buy',party:'Nhà cung cấp Minh Long',quantity:10,price:100000,status:'posted',description:'Nhập 10 bình giữ nhiệt vào K01'},
  {id:'BH-001',date:'2026-11-21',kind:'sell',party:'Cà phê Mộc',quantity:4,price:150000,status:'posted',cost:400000,description:'Giao 4 bình giữ nhiệt từ K01'}
];

export function seed(mode='partial'){
  return {
    docs: mode==='start' ? [] : structuredClone(sampleDocs),
    bank: mode==='start' ? [] : structuredClone(bankSample),
    logs: mode==='start' ? [] : [{message:'Đã ghi sổ MH-001 · Mua chịu'},{message:'Đã ghi sổ BH-001 · Bán chịu'},{message:'Đã nạp 2 dòng sao kê mẫu'}],
    locked:false,counter:2,profile:'chief'
  };
}
export const isStockAdjustment=kind=>kind==='adjustIn'||kind==='adjustOut';
export function amount(doc){if(doc.kind==='varianceClear')return varianceAmount(doc);return isStockAdjustment(doc.kind)?doc.adjustmentValue:doc.quantity*doc.price;}
export function posted(state){return state.docs.filter(doc=>doc.status==='posted');}
export function debtSources(ledger){
  return [...(ledger.debtOpening??[]),...posted(ledger).filter(row=>row.kind==='sell'||row.kind==='buy')];
}
export function openingBalances(ledger){
  const bank=ledger.opening??5000000;
  const cash=ledger.openingFund??0;
  const accounts=ledger.initialAccounts??{'111':cash,'112':bank,'334':0,'411':bank+cash};
  const stock=(ledger.stockOpening??[]).reduce((value,item)=>value+item.value,0);
  const debts=ledger.debtOpening??[];
  const ar=debts.filter(row=>row.kind==='sell').reduce((value,row)=>value+amount(row),0);
  const ap=debts.filter(row=>row.kind==='buy').reduce((value,row)=>value+amount(row),0);
  return {
    '111':{debit:accounts['111'],credit:0},'112':{debit:accounts['112'],credit:0},
    '131':{debit:ar,credit:0},'156':{debit:stock,credit:0},
    '331':{debit:0,credit:ap},'334':{debit:0,credit:accounts['334']},
    '411':{debit:0,credit:accounts['411']}
  };
}
export function openAmount(state,doc){
  return amount(doc)-posted(state).filter(payment=>payment.link===doc.id).reduce((sum,payment)=>sum+amount(payment),0);
}
export function entries(doc){
  const total=amount(doc);
  switch(doc.kind){
    case 'buy': return [['156','331',total]];
    case 'sell': return [['131','511',total],['632','156',doc.cost??0]];
    case 'receive': return [[doc.channel==='cash'?'111':'112',doc.varianceDecision?'1388':'131',total]];
    case 'pay': return [[doc.varianceDecision?'3388':'331',doc.channel==='cash'?'111':'112',total]];
    case 'payroll': return [['642','334',total]];
    case 'adjustIn': return [['156','3381',total]];
    case 'adjustOut': return [['1381','156',total]];
    case 'varianceClear': return varianceEntries(doc);
  }
}
export function summary(state){
  const balances=Object.fromEntries(Object.keys(accounts).map(code=>[code,{debit:0,credit:0}]));
  Object.assign(balances,openingBalances(state));
  let units=(state.stockOpening??[]).reduce((sum,item)=>sum+item.quantity,0);
  for(const doc of posted(state)){
    for(const [debit,credit,value] of entries(doc)){
      balances[debit].debit+=value;
      balances[credit].credit+=value;
    }
    units+=stockMovement(doc)?.units??0;
  }
  const net=code=>balances[code].debit-balances[code].credit;
  const creditNet=code=>balances[code].credit-balances[code].debit;
  return {balances,units,cash:net('112'),fund:net('111'),expense:net('642'),wages:creditNet('334'),ar:net('131'),ap:creditNet('331'),stock:net('156'),revenue:creditNet('511'),otherIncome:creditNet('711'),cogs:net('632'),profit:creditNet('511')-net('632')};
}
export function stockMovement(doc){
  if(doc.kind==='buy'||doc.kind==='adjustIn')return {units:doc.quantity,value:amount(doc)};
  if(doc.kind==='adjustOut')return {units:-doc.quantity,value:-amount(doc)};
  if(doc.kind==='sell')return {units:-doc.quantity,value:-(doc.cost??0)};
  return null;
}
export function stockForItem(ledger,itemId){
  const initial=ledger.stockOpening?.find(row=>row.itemId===itemId);
  let units=initial?.quantity??0,value=initial?.value??0;
  for(const row of ledger.docs){
    if(row.status!=='posted'||row.itemId!==itemId)continue;
    const movement=stockMovement(row);
    if(!movement)continue;
    units+=movement.units;
    value+=movement.value;
  }
  return {units,value};
}
export function stockActivity(ledger,itemId){
  let version=0,lastDate='';
  for(const row of ledger.docs){
    if(row.status!=='posted'||row.itemId!==itemId||!stockMovement(row))continue;
    version++;
    if(row.date>lastDate)lastDate=row.date;
  }
  return {version,lastDate};
}
export function averageStockValue(stock,quantity){
  return stock.units>0&&stock.value>=0&&Number.isSafeInteger(quantity)&&quantity>0&&quantity<=stock.units?
    Number((BigInt(stock.value)*BigInt(quantity)+BigInt(Math.floor(stock.units/2)))/BigInt(stock.units)):null;
}
export function preview(state,doc){
  if(doc.kind==='sell'&&doc.status!=='posted'){
    const s=stockForItem(state,doc.itemId);
    return {...doc,cost:averageStockValue(s,doc.quantity)};
  }
  return {...doc};
}
export function validPostingDate(date,period){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==period)return false;
  const timestamp=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===date;
}
export function issue(state,doc){
  if(state.locked) return 'Kỳ kế toán đã khóa.';
  if(!kinds[doc.kind]||!validPostingDate(doc.date,state.period??'2026-11')) return 'Chọn ngày hạch toán thuộc kỳ đã mở.';
  const total=amount(doc);
  const validPrice=doc.kind==='varianceClear'?total>0:isStockAdjustment(doc.kind)?total>=(doc.kind==='adjustIn'?1:0):Number.isSafeInteger(doc.price)&&doc.price>=1;
  if(!doc.party.trim()||!Number.isSafeInteger(doc.quantity)||doc.quantity<1||!validPrice||!Number.isSafeInteger(total)||total>1000000000000) return 'Kiểm tra đối tác, số lượng và đơn giá nguyên dương. Giá trị tối đa là 1.000 tỷ đồng.';
  const s=summary(state);
  if((doc.kind==='sell'||doc.kind==='adjustOut')&&doc.quantity>stockForItem(state,doc.itemId).units) return 'Không đủ tồn kho để ghi sổ.';
  if(doc.kind==='receive'||doc.kind==='pay'){
    if(doc.varianceDecision){
      const failure=varianceCashIssue(state.docs,doc);
      if(failure)return failure;
    }else{
      const source=debtSources(state).find(row=>row.id===doc.link&&(row.partyId||doc.partyId?row.partyId===doc.partyId:row.party===doc.party)&&row.kind===(doc.kind==='receive'?'sell':'buy'));
      if(!source||amount(doc)>openAmount(state,source)) return 'Số tiền vượt công nợ còn lại hoặc chứng từ gốc không phù hợp.';
      if(doc.date<source.date) return 'Ngày thanh toán phải từ ngày chứng từ gốc trở đi.';
    }
    if(doc.kind==='pay'&&amount(doc)>(doc.channel==='cash'?s.fund:s.cash)) return 'Nguồn tiền không đủ để thanh toán.';
  }
  if(stockMovement(doc)){
    const latest=stockActivity(state,doc.itemId).lastDate;
    if(latest&&doc.date<latest) return 'Ghi nhận nhập và xuất theo thứ tự ngày để bảo toàn giá vốn bình quân.';
  }
  if(doc.bankRef&&posted(state).some(row=>row.bankRef===doc.bankRef)) return 'Dòng sao kê đã được ghép.';
  return '';
}
export function record(state,doc){
  const error=issue(state,doc);
  if(error) return error;
  const value={...preview(state,doc),status:'posted'};
  const index=state.docs.findIndex(row=>row.id===doc.id);
  if(index<0) state.docs.push(value);
  else state.docs[index]=value;
  state.logs.push({message:'Đã ghi sổ '+doc.id+' · '+kinds[doc.kind]});
  return '';
}
export function unmatched(state){return state.bank.filter(row=>!posted(state).some(doc=>doc.bankRef===row.ref));}
export function closeChecks(state){
  const s=summary(state);
  const totals=Object.values(s.balances).reduce((acc,row)=>[acc[0]+row.debit,acc[1]+row.credit],[0,0]);
  const pending=state.docs.filter(doc=>doc.status!=='posted'&&doc.status!=='void').length;
  return [
    {label:'Hoàn thành chứng từ',detail:pending?pending+' chứng từ đang xử lý':'Tất cả chứng từ đã ghi sổ',ok:!pending,route:'docs'},
    {label:'Đối chiếu sao kê ngân hàng',detail:unmatched(state).length?unmatched(state).length+' dòng chờ ghép':'Đã xử lý các dòng sao kê hiện có',ok:!unmatched(state).length,route:'bank'},
    {label:'Kiểm tồn kho và công nợ',detail:'Kiểm tra số dư và tồn âm trên sổ',ok:s.units>=0&&s.stock>=0&&s.ar>=0&&s.ap>=0,route:'stock'},
    {label:'Cân đối phát sinh Nợ và Có',detail:'Bao gồm số dư đầu kỳ',ok:totals[0]===totals[1],route:'reports'}
  ];
}
