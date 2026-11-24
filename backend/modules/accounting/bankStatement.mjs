import {validPostingDate} from './ledger.mjs';
import {isCatalogActive,sameParty} from './catalog.mjs';

export const statementLimit=25;
export const statementColumns=['Mã giao dịch','Ngày giao dịch','Tiền vào','Tiền ra','Mã đối tác','Nội dung'];
export const statementSampleParties={receive:'Cà phê Mộc',pay:'Nhà cung cấp Minh Long'};
const control=/[\u0000-\u001f\u007f]/u;
const statementText=value=>typeof value==='string'?value.trim():'';
const statementRef=value=>statementText(value).toUpperCase();

export function statementPartners(parties,kind,date){
  const expected=kind==='receive'?'customer':'supplier';
  return parties.filter(row=>isCatalogActive(row,date)&&(row.kind==='both'||row.kind===expected));
}

export function inspectBankBatch(input,{period,catalog,existing}){
  const seen=new Set(), registered=new Map(existing.map(row=>[statementRef(row.ref),row]));
  return input.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))return {status:'invalid',message:'Dòng sao kê không hợp lệ.'};
    const ref=statementRef(row.ref), note=statementText(row.note), {kind,date,amount}=row;
    const invalid=message=>({status:'invalid',message});
    if(!ref||ref.length>42||control.test(ref))return invalid('Mã giao dịch cần từ 1 đến 42 ký tự và nằm trên một dòng.');
    if(seen.has(ref))return invalid('Mã giao dịch trùng trong tệp.');
    seen.add(ref);
    if(!validPostingDate(date,period))return invalid('Ngày giao dịch phải hợp lệ và thuộc kỳ '+period+'.');
    if(kind!=='receive'&&kind!=='pay')return invalid('Chỉ điền một cột Tiền vào hoặc Tiền ra có số tiền lớn hơn 0.');
    if(!Number.isSafeInteger(amount)||amount<1||amount>1e12)return invalid('Số tiền phải là số nguyên VND từ 1 đến 1.000 tỷ.');
    if((row.note!=null&&typeof row.note!=='string')||note.length>80||control.test(note))return invalid('Nội dung tối đa 80 ký tự trên một dòng.');
    const old=registered.get(ref);
    const sameDetails=old&&old.date===date&&old.kind===kind&&old.amount===amount&&(old.note??'')===note;
    if(old&&!sameDetails) return {status:'conflict',message:'Mã này đã có trong sổ sao kê với ngày, chiều tiền, số tiền hoặc nội dung khác.'};
    const partner=catalog?statementPartners(catalog.parties,kind,date).find(entry=>entry.id===row.partyId):null;
    if(old&&sameDetails&&(!catalog||old.partyId===row.partyId))return {status:'duplicate',message:'Giao dịch đã có, sẽ bỏ qua.'};
    if(catalog&&!partner)return {status:'partner',message:'Chọn đối tác đúng nhóm, đang sử dụng vào ngày giao dịch.'};
    const resolved={ref,kind,date,amount,note,party:partner?.name??statementSampleParties[kind],
      ...(partner?{partyId:partner.id,partyCode:partner.code}:{})};
    if(old){
      return sameParty(old,resolved)?{status:'duplicate',message:'Giao dịch đã có, sẽ bỏ qua.'}:
        {status:'conflict',message:'Mã này đã được ghi với đối tác khác.'};
    }
    return {status:'ready',row:resolved};
  });
}
