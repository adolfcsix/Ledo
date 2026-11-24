import {csvDocument} from '../../ui/csv.mjs';
export const statuses={
  overdue:'Quá hạn',soon:'Đến hạn trong 7 ngày',later:'Còn trong hạn',
  undated:'Chưa có hạn',settled:'Đã tất toán'
};
export const ageBands=[
  ['overdue30','Quá hạn 1–30 ngày'],['overdue60','Quá hạn 31–60 ngày'],
  ['overdue90','Quá hạn 61–90 ngày'],['overdue120','Quá hạn 91–120 ngày'],
  ['overdueLong','Quá hạn trên 120 ngày'],['soon',statuses.soon],
  ['later',statuses.later],['undated',statuses.undated]
];
export const debtReference=row=>row.opening?'Đầu kỳ · '+row.ref:row.id;
export const typeLabel=kind=>kind==='sell'?'Phải thu':'Phải trả';
export const displayDate=value=>value?value.split('-').reverse().join('/'):'—';
const timestamp=value=>Date.parse(value+'T00:00:00Z');

export function agingRow(row,at){
  if(row.date>at) return null;
  const payments=row.settlements.filter(payment=>payment.date<=at)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const paid=payments.reduce((total,payment)=>total+payment.amount,0);
  const balance=row.original-paid;
  const days=row.dueDate?(timestamp(at)-timestamp(row.dueDate))/86400000:null;
  let status='settled',band='settled',timing=statuses.settled;
  if(balance!==0){
    if(days===null){
      status=band='undated';
      timing=statuses.undated;
    }else if(days>0){
      status='overdue';
      band=days<=30?'overdue30':days<=60?'overdue60':days<=90?'overdue90':days<=120?'overdue120':'overdueLong';
      timing='Quá '+days+' ngày';
    }else{
      status=band=days>=-7?'soon':'later';
      timing=days===0?'Đến hạn hôm nay':'Còn '+(-days)+' ngày';
    }
  }
  return {...row,payments,paid,balance,band,status,timing};
}
export function agingTotals(rows){
  return rows.reduce((totals,row)=>{
    totals.balance+=row.balance;
    totals[row.status]+=row.balance;
    return totals;
  },{balance:0,overdue:0,soon:0,later:0,undated:0,settled:0});
}
export const partyKey=row=>row.partyId??row.party;
export function debtPartners(rows){
  const partners=new Map();
  for(const row of rows){
    const key=partyKey(row);
    if(!partners.has(key)) partners.set(key,{key,name:row.party,code:row.partyCode,documents:0,receive:0,pay:0,overdue:0});
    const group=partners.get(key);
    if(row.balance!==0) group.documents++;
    group[row.kind==='sell'?'receive':'pay']+=row.balance;
    if(row.status==='overdue') group.overdue+=row.balance;
  }
  return [...partners.values()].sort((a,b)=>b.overdue-a.overdue||a.name.localeCompare(b.name,'vi'));
}

export function debtCsv(rows,branch,at){
  const header=['Chi nhánh','Ngày đối chiếu','Chứng từ','Mã đối tác','Đối tác','Loại','Ngày chứng từ','Hạn thanh toán',
    'Trạng thái','Giá trị gốc (VND)','Đã phân bổ (VND)','Còn lại (VND)'];
  const records=rows.map(row=>[branch,at,debtReference(row),row.partyCode,row.party,typeLabel(row.kind),row.date,
    row.dueDate,statuses[row.status],row.original,row.paid,row.balance]);
  return csvDocument(header,records);
}
