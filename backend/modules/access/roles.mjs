export const roles = {
  KT: {name:'Kế toán nghiệp vụ', person:'Nguyễn An', initial:'NA', lead:'Lập chứng từ và đối chiếu các khoản cần xử lý.', pages:['orders','stock','documents','invoices','bank','debts'], caps:['order.write','invoice.import','invoice.read','doc.write','doc.submit','bank.prepare','debt.read','cash.request']},
  TK: {name:'Thủ kho', person:'Phạm Bình', initial:'PB', lead:'Xác nhận hàng thực nhận và thực giao tại kho được giao.', pages:['warehouse','stock'], caps:['stock.confirm','stock.count']},
  TQ: {name:'Thủ quỹ', person:'Trần Mai', initial:'TM', lead:'Xác nhận thực thu, thực chi và kiểm kê quỹ tiền mặt.', pages:['cash'], caps:['cash.confirm','cash.count']},
  PD: {name:'Người phê duyệt', person:'Lê Minh', initial:'LM', lead:'Duyệt hoặc trả hồ sơ cùng lý do và đúng hạn mức.', pages:['approvals'], caps:['approve']},
  KTT:{name:'Kế toán trưởng', person:'Vũ Hương', initial:'VH', lead:'Kiểm soát bút toán, đối chiếu và chốt kỳ.', pages:['documents','orders','stock','invoices','bank','debts','management','reports','ledger-review','closing','cash','approvals','evidence','payroll-summary','integration'], caps:['order.write','invoice.import','invoice.read','doc.write','doc.submit','doc.post','bank.prepare','bank.link','bank.post','debt.read','cash.request','report.full','period.lock','period.request','period.apply','evidence.resolve','payroll.post','approve']},
  LD: {name:'Lãnh đạo', person:'Đỗ Hà', initial:'ĐH', lead:'Đọc tình hình tài chính và gửi yêu cầu giải trình số liệu.', pages:['management'], caps:['report.summary','evidence.ask.management']},
  KS: {name:'Kiểm toán / Kiểm soát', person:'Ngô Phúc', initial:'NP', lead:'Rà chứng từ nguồn, nhật ký và yêu cầu bằng chứng.', pages:['evidence','reports','ledger-review','stock'], caps:['audit.read','report.full','evidence.ask.audit','evidence.export']},
  QT: {name:'Quản trị tổ chức', person:'Bùi Linh', initial:'BL', lead:'Thiết lập phạm vi và quyền của các tài khoản thực hành.', pages:['administration'], caps:['role.manage','demo.reset']},
  TL: {name:'Chuyên viên tiền lương', person:'Hoàng Yến', initial:'HY', lead:'Lập bảng lương mẫu và chuyển số tổng cho kế toán trưởng.', pages:['payroll'], caps:['payroll.write','payroll.submit']},
  DT: {name:'Đối tác bên ngoài', person:'Cà phê Mộc', initial:'CM', lead:'Xác nhận hoặc gửi phản hồi về hồ sơ công nợ được chia sẻ.', pages:['portal'], caps:['portal.reply']},
  HT: {name:'Tài khoản dịch vụ', person:'Trình mô phỏng kết nối', initial:'HT', lead:'Theo dõi tiếp nhận sự kiện, kết quả và lần gửi lặp.', pages:['integration'], caps:['event.simulate']},
};
export const branches={CN01:'Chi nhánh An Phát',CN02:'Chi nhánh Hải Phòng'};
export const warehouses={K01:'Kho chính',K02:'Kho Hải Phòng'};
export function grants(){return Object.fromEntries(Object.keys(roles).map(code=>[code,{active:true,branch:'CN01',limit:code==='PD'?100000000:null,bankLink:false}]));}

export function rolePages(code,{company=false,period=false}={}){
  return roles[code].pages.filter(page=>
    !(company&&page==='integration')&&!(period&&page==='invoices')
  );
}

export function roleCapabilities(code,{company=false,period=false,catalog=false,bankLink=false}={}){
  const caps=new Set(roles[code].caps);
  if(code==='KT'&&bankLink)caps.add('bank.link');
  if(period)caps.delete('invoice.import');
  if(catalog&&['KT','KTT'].includes(code)){caps.add('catalog.write');caps.add('opening.write');}
  if(catalog&&code==='KTT')caps.add('opening.apply');
  if(company)for(const capability of ['role.manage','demo.reset','event.simulate'])caps.delete(capability);
  return caps;
}
