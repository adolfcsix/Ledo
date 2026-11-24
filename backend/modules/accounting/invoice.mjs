// A closed sample schema keeps the original source checkable in the demo.
const statement=String.raw`<HoaDon>\s*<NhaCungCap>([A-Z0-9]{1,20})</NhaCungCap>\s*<KyHieu>([A-Z0-9-]{1,20})</KyHieu>\s*<So>([0-9]{1,16})</So>\s*<Ngay>(2026-11-(?:0[1-9]|[12][0-9]|30))</Ngay>\s*<Dong>\s*<MaHang>([A-Z0-9-]{1,20})</MaHang>\s*<SoLuong>([0-9]{1,7})</SoLuong>\s*<DonGia>([0-9]{1,13})</DonGia>\s*<ThanhTien>([0-9]{1,13})</ThanhTien>\s*</Dong>\s*</HoaDon>`;
const schema=new RegExp('^'+statement+'$');

export function parsePurchaseInvoice(xml){
  if(typeof xml!=='string'||xml.length>2500)return null;
  const input=xml.trim().replace(/^<\?xml version="1\.0"(?: encoding="UTF-8")?\?>\s*/,'');
  const match=schema.exec(input);
  if(!match)return null;
  const [,supplier,series,number,date,item,qty,unitPrice,value]=match;
  const quantity=Number(qty),price=Number(unitPrice),total=Number(value);
  if(quantity<1||quantity>1000000||price<1||total>1e12||quantity*price!==total)return null;
  return {supplier,series,number:number.replace(/^0+(?=\d)/,''),date,item,quantity,price,total};
}
