import {Card, DataTable} from '../../ui/components.jsx';

const operations = {
  'order.write':'Lập, sửa và gửi đơn', 'doc.write':'Lập, sửa chứng từ', 'doc.submit':'Gửi duyệt chứng từ',
  'doc.post':'Ghi sổ chứng từ', 'bank.prepare':'Nhập và đối chiếu sao kê', 'bank.link':'Ghép sao kê với chứng từ đã ghi',
  'bank.post':'Ghi giao dịch ngân hàng', 'debt.read':'Tra công nợ', 'cash.request':'Lập đề nghị thu hoặc chi',
  'stock.confirm':'Xác nhận số thực giao, thực nhận', 'stock.count':'Lập biên bản kiểm kê kho',
  'cash.confirm':'Xác nhận thực thu, thực chi', 'cash.count':'Lập biên bản kiểm kê quỹ', approve:'Duyệt hoặc trả hồ sơ',
  'report.summary':'Xem tổng quan tài chính', 'report.full':'Tra sổ và báo cáo', 'period.lock':'Khóa kỳ và xử lý các mục kiểm tra',
  'period.request':'Yêu cầu mở lại kỳ', 'period.apply':'Mở kỳ sau khi được duyệt', 'evidence.resolve':'Trả lời giải trình',
  'evidence.ask.management':'Gửi yêu cầu giải trình', 'evidence.ask.audit':'Gửi yêu cầu bằng chứng',
  'evidence.export':'Xuất bằng chứng', 'audit.read':'Xem nhật ký nghiệp vụ', 'payroll.post':'Tiếp nhận tổng lương và lập phiếu',
  'payroll.write':'Lập bảng lương', 'payroll.submit':'Chuyển tổng lương', 'catalog.write':'Quản lý danh mục',
  'opening.write':'Lưu dự thảo số dư đầu kỳ', 'opening.apply':'Áp dụng số dư đầu kỳ'
};

const conditions = {
  KT:'Có thể cấp thêm quyền ghép sao kê với phiếu đã ghi trên từng tài khoản.',
  TK:'Xác nhận và kiểm kê trong kho thuộc chi nhánh được cấp. Thẻ kho hiển thị số lượng.',
  TQ:'Xác nhận phiếu tiền mặt đã duyệt trong chi nhánh được cấp.',
  PD:'Theo hạn mức từng phiếu và nguyên tắc tách người lập với người duyệt.',
  KTT:'Chứng từ tiền mặt cần xác nhận của thủ quỹ trước khi ghi sổ. Hồ sơ mở kỳ cần duyệt độc lập.',
  LD:'Xem số liệu tổng hợp và theo dõi giải trình của mình.',
  KS:'Tra chứng từ đã ghi và yêu cầu bằng chứng của mình.',
  TL:'Làm việc trên bảng lương do mình lập trong phạm vi được cấp.'
};

export function RoleMatrix({roles, navigation}) {
  return <Card title="Ma trận quyền nghiệp vụ">
    <p className="padded subtle">Mỗi tài khoản làm việc trong chi nhánh được cấp. Thời hạn và quyền bổ sung được thiết lập trong hồ sơ người dùng.</p>
    <DataTable columns={['Vai trò', 'Màn hình', 'Thao tác được cấp', 'Điều kiện áp dụng']}
      empty="Chưa có vai trò trong phạm vi này."
      rows={roles.map(role => ({
        key:role.code,
        cells:[
          <strong>{role.name}</strong>,
          [...role.pages,...(role.capabilities.includes('catalog.write')?['catalog','opening']:[])].map(key=>navigation[key][0]).join(', '),
          <ul className="role-matrix-operations">{role.capabilities.filter(cap=>operations[cap]).map(cap=><li key={cap}>{operations[cap]}</li>)}</ul>,
          conditions[role.code]
        ]
      }))} />
  </Card>;
}
