import {maySetPostingDate} from '../workspace-settings/postingDate.mjs';

const shortcutGroups = [
  {id:'setup', title:'Thiết lập nghiệp vụ', icon:'settings', items:[
    {label:'Quản lý danh mục', detail:'Mặt hàng, khách hàng và nhà cung cấp.', route:'catalog', icon:'stock'},
    {label:'Số dư đầu kỳ', detail:'Xem số dư đang áp dụng và bản chờ.', route:'opening', icon:'reports'}
  ]},
  {id:'transactions', title:'Nghiệp vụ hằng ngày', icon:'doc', items:[
    {label:'Mua hàng và bán hàng', detail:'Từ đơn hàng đến phiếu giao nhận và chứng từ.', route:'orders', icon:'stock'},
    {label:'Gửi duyệt theo lô', detail:'Chọn nhiều nháp thuộc quyền người lập.', route:'documents', action:'doc-batch:submit', cap:'doc.submit', openPeriod:true, icon:'check'},
    {label:'Xác nhận quỹ theo lô', detail:'Nhập số tiền thực tế từng phiếu đã duyệt.', route:'cash', action:'doc-batch:verify', cap:'cash.confirm', openPeriod:true, icon:'wallet'},
    {label:'Chứng từ kế toán', detail:'Tra chứng từ, nguồn phát sinh và bút toán.', route:'documents', icon:'doc'},
    {label:'Hóa đơn đầu vào', detail:'Tra XML và kết quả đối chiếu hóa đơn mua.', route:'invoices', icon:'doc'},
    {label:'Giao nhận và kiểm kê kho', detail:'Theo dõi hàng đã giao, thực nhận và biên bản kiểm kê.', route:'warehouse', icon:'stock'},
    {label:'Quỹ tiền mặt', detail:'Theo dõi thu, chi và kiểm kê quỹ.', route:'cash', icon:'wallet'},
    {label:'Bảng lương', detail:'Lập và theo dõi hồ sơ bàn giao tổng lương.', route:'payroll', icon:'people'},
    {label:'Lương tổng hợp', detail:'Tiếp nhận và xử lý số tổng theo kỳ.', route:'payroll-summary', icon:'people'},
    {label:'Hồ sơ được chia sẻ', detail:'Xem số dư được chia sẻ và gửi phản hồi.', route:'portal', icon:'link'}
  ]},
  {id:'control', title:'Đối chiếu và kiểm soát', icon:'check', items:[
    {label:'Kiểm tra chứng từ và sổ sách', detail:'So sổ cái với thẻ kho, công nợ và kiểm tra cân đối.', route:'ledger-review', icon:'check'},
    {label:'Đối chiếu ngân hàng', detail:'Tra sao kê, ghép phiếu và kiểm tra số dư.', route:'bank', icon:'bank'},
    {label:'Công nợ', detail:'Theo dõi tuổi nợ và thanh toán theo đối tác.', route:'debts', icon:'people'},
    {label:'Thẻ kho và nhập xuất tồn', detail:'Tra biến động hàng theo mã và khoảng ngày.', route:'stock', icon:'stock'},
    {label:'Duyệt theo lô', detail:'Kiểm tra người lập và hạn mức từng phiếu.', route:'approvals',action:'doc-batch:approve', cap:'approve', openPeriod:true, icon:'check'},
    {label:'Ghi sổ theo lô', detail:'Kiểm tra và ghi các phiếu đã duyệt theo ngày hạch toán.', route:'documents',action:'doc-batch:post',cap:'doc.post',openPeriod:true,icon:'doc'},
    {label:'Hồ sơ phê duyệt', detail:'Rà đơn, chứng từ và yêu cầu mở kỳ.', route:'approvals', icon:'check'},
    {label:'Kiểm tra trước khi chốt kỳ', detail:'Xem vướng mắc, bản chốt và yêu cầu mở lại.', route:'closing', icon:'lock'},
    {label:'Giải trình và nhật ký', detail:'Tra yêu cầu bằng chứng và lịch sử nghiệp vụ.', route:'evidence', icon:'history'},
    {label:'Sổ và báo cáo', detail:'Tra số liệu và bút toán đã ghi nhận.', route:'reports', icon:'reports'},
    {label:'Tổng quan tài chính', detail:'Xem doanh thu, dòng tiền, công nợ và tồn kho.', route:'management', icon:'trend'}
  ]},
  {id:'settings', title:'Thiết lập làm việc', icon:'settings', items:[
    {label:'Ngày hạch toán mặc định', detail:'Điền sẵn ngày cho biểu mẫu lập mới trong kỳ.', action:'posting-date', icon:'calendar', postingDate:true},
    {label:'Sự kiện tích hợp mẫu', detail:'Tra trạng thái và số lần nhận lặp trong bản thực hành.', route:'integration', icon:'history'}
  ]},
  {id:'organization', title:'Đơn vị và tài khoản', icon:'people', items:[
    {label:'Thông tin đơn vị', detail:'Xem chi nhánh, kỳ và vai trò đang sử dụng.', action:'organization-info', company:true, icon:'info'},
    {label:'Người dùng và phân quyền', detail:'Quản lý quyền theo vai trò, chi nhánh và hạn mức.', route:'administration', icon:'people', company:true},
    {label:'Ma trận quyền nghiệp vụ', detail:'Tra các màn hình và thao tác của từng vai trò.', route:'administration',
      filter:'roles', icon:'check', company:true},
    {label:'Tài khoản và phạm vi thực hành', detail:'Xem quyền và nhật ký quản trị của bộ mẫu.', route:'administration', icon:'people', company:false},
    {label:'Chọn không gian làm việc', detail:'Mở đơn vị theo phạm vi đã được cấp.', action:'workspace-picker', icon:'settings'},
    {label:'Đổi vai trò', detail:'Chọn trong danh sách vai trò của tài khoản.', action:'roles', icon:'people', multipleRoles:true},
    {label:'Đăng xuất', detail:'Kết thúc phiên làm việc hiện tại.', action:'auth-logout', icon:'exit', standalone:true}
  ]}
];

const normalize = value => value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{Mark}/gu,'').replaceAll('đ','d');

export function utilityGroups(view,{standalone=false}={}) {
  const company=view.workMode==='company';
  return shortcutGroups.map(group=>({...group,items:group.items.filter(item=>
    (!item.route||view.nav.includes(item.route))&&
    (item.company===undefined||item.company===company)&&
    (!item.multipleRoles||view.roles.length>1)&&
    (!item.standalone||standalone)&&
    (!item.cap||view.caps?.includes(item.cap))&&(!item.postingDate||maySetPostingDate(view))&&(!item.openPeriod||!view.locked)
  )})).filter(group=>group.items.length);
}

export function searchUtilities(groups,query) {
  const words=normalize(query).trim().split(/\s+/u).filter(Boolean);
  return groups.map(group=>({...group,items:group.items.filter(item=>{
    const text=normalize([group.title,item.label,item.detail].join(' '));
    return words.every(word=>text.includes(word));
  })})).filter(group=>group.items.length);
}
