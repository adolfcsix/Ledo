import {validPostingDate} from './ledger.mjs';

export const openingAccounts=['111','112','334','411'];

export function openingEditable(state,branch){
  return !state.locked[branch]&&!state.closed[branch]&&
    ![state.docs,state.orders,state.bank,state.counts,state.cashCounts,state.payroll]
      .some(rows=>rows.some(row=>row.branch===branch));
}
export function openingProfile(ledger){
  return {
    period:ledger.period,
    accounts:Object.fromEntries(openingAccounts.map(code=>[code,ledger.initialAccounts[code]])),
    stock:ledger.stockOpening,
    debts:ledger.debtOpening
  };
}
export function openingTotals(accounts,stock,debts){
  return {
    debit:accounts['111']+accounts['112']+stock.reduce((sum,row)=>sum+row.value,0)+debts.filter(row=>row.kind==='sell').reduce((sum,row)=>sum+(row.amount??row.price),0),
    credit:accounts['334']+accounts['411']+debts.filter(row=>row.kind==='buy').reduce((sum,row)=>sum+(row.amount??row.price),0)
  };
}
export function normalizeOpening(state,branch,input,ensure,diagnostics){
  function validateRows(rows,group,validate){
    return rows.flatMap((row,index)=>{
      if(!diagnostics) return [validate(row)];
      try {return [validate(row)];}
      catch(error){diagnostics.push({group,index,message:error.message});return [];}
    });
  }
  const date=state.period+'-01';
  function whole(value,min=0,max=1e12){
    ensure(Number.isSafeInteger(value)&&value>=min&&value<=max,'Số dư và số lượng phải là số nguyên hợp lệ.');
    return value;
  }
  function openingDate(value){
    return typeof value==='string'&&validPostingDate(value,value.slice(0,7));
  }
  ensure(input.accounts&&Object.keys(input.accounts).length===openingAccounts.length&&
    openingAccounts.every(code=>Object.hasOwn(input.accounts,code)),'Nhập đủ số dư các tài khoản được hỗ trợ.');
  ensure(Array.isArray(input.stock)&&Array.isArray(input.debts)&&input.stock.length+input.debts.length<=40,
    'Một bộ số dư hỗ trợ tối đa 40 dòng chi tiết.');
  const accounts=Object.fromEntries(openingAccounts.map(code=>[code,whole(input.accounts[code])]));
  const items=new Set();
  const stock=validateRows(input.stock,'stock',inputRow=>{
    ensure(inputRow&&typeof inputRow==='object','Dòng tồn kho không hợp lệ.');
    const item=state.catalog.items.find(item=>item.id===inputRow.itemId);
    ensure(item&&item.from<=date,'Mặt hàng tồn phải có hiệu lực từ đầu kỳ hoặc trước đó.');
    ensure(!items.has(item.id),'Mỗi mã hàng chỉ có một dòng tồn đầu kỳ tại chi nhánh.');
    const quantity=whole(inputRow.quantity,1,1e6),value=whole(inputRow.value);
    items.add(item.id);
    return {itemId:item.id,itemCode:item.code,itemName:item.name,unit:item.unit,quantity,value};
  });
  const references=new Set();
  const debts=validateRows(input.debts,'debts',inputRow=>{
    ensure(inputRow&&typeof inputRow==='object','Dòng công nợ không hợp lệ.');
    const {kind,partyId,dueDate}=inputRow;
    ensure(kind==='sell'||kind==='buy','Chọn khoản phải thu hoặc phải trả.');
    const party=state.catalog.parties.find(row=>row.id===partyId);
    ensure(party&&party.from<=date&&(party.kind==='both'||party.kind===(kind==='sell'?'customer':'supplier')),
      'Đối tác phải đúng nhóm và có hiệu lực từ đầu kỳ hoặc trước đó.');
    const ref=typeof inputRow.ref==='string'?inputRow.ref.trim():'';
    ensure(ref&&ref.length<=40&&!/[\u0000-\u001f]/.test(ref),'Nhập số chứng từ gốc từ 1 đến 40 ký tự.');
    const key=JSON.stringify([kind,partyId,ref.toUpperCase()]);
    ensure(!references.has(key),'Số chứng từ gốc bị trùng cho cùng đối tác và loại công nợ.');
    ensure(openingDate(inputRow.date)&&inputRow.date<date,'Ngày chứng từ công nợ đầu kỳ phải trước ngày mở sổ.');
    ensure(!dueDate||(openingDate(dueDate)&&dueDate>=inputRow.date),'Hạn thanh toán phải từ ngày chứng từ trở đi.');
    const price=whole(inputRow.amount??inputRow.price,1);
    references.add(key);
    return {id:'DK-'+references.size,opening:true,status:'posted',quantity:1,price,
      kind,partyId,party:party.name,partyCode:party.code,branch,ref,date:inputRow.date,dueDate:dueDate||null};
  });
  const totals=openingTotals(accounts,stock,debts);
  if(!diagnostics) ensure(totals.debit===totals.credit,'Số dư chưa cân. Nợ '+totals.debit+' đ, Có '+totals.credit+' đ.');
  return {accounts,stock,debts,totals};
}
