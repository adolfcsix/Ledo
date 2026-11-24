export const pendingCash = row => row.status === 'approved' && !row.verified;
export const readyToPost = row => row.status === 'approved' && (row.channel !== 'cash' || row.verified);
export const pendingDelivery = row => row.status === 'approved' && row.receipts.reduce((total, receipt) => total + receipt.quantity, 0) < row.quantity;
const ownedDraft = row => row.status === 'draft' && row.mine;
const returnedOrder = row => row.status === 'returned' && row.mine;
const needsApproval = (row, view, total) => row.status === 'review' && !row.mine &&
  (view.actor.limit === null || total <= view.actor.limit);
const actionable = (view, code) => view.caps.includes(code) && !view.locked;

export const filters = {
  documents: {
    mine: ['Nháp của tôi', ownedDraft],
    revision: ['Nháp của tôi bị trả', row => ownedDraft(row) && Boolean(row.returnReason)],
    recording: ['Đã duyệt, chờ ghi sổ', readyToPost]
  },
  orders: {returned: ['Đơn của tôi bị trả', returnedOrder]},
  warehouse: {pending: ['Chờ giao nhận', pendingDelivery]},
  cash: {pending: ['Chờ xác nhận', pendingCash], confirmed: ['Đã xác nhận', row => row.verified && row.status !== 'posted'],
    posted: ['Đã ghi sổ', row => row.status === 'posted']},
  approvals: {
    orders: ['Đơn trong thẩm quyền', (row, view) => needsApproval(row, view, row.price * row.quantity)],
    vouchers: ['Phiếu trong thẩm quyền', (row, view) => needsApproval(row, view, row.total)],
    reopen: ['Yêu cầu mở kỳ chờ duyệt', row => row.status === 'review' && !row.mine]
  }
};

export const desks = {
  KT: {title:'Nghiệp vụ kế toán', primary:'documents', modules:['documents','orders','bank','debts'], handoff:'Chuyển đơn và chứng từ cho người duyệt. Theo dõi phiếu kho để lập chứng từ từ số thực giao, thực nhận.'},
  TK: {title:'Vận hành kho', primary:'warehouse', modules:['warehouse','stock'], handoff:'Xác nhận hàng thực giao, thực nhận trên đơn đã duyệt. Kế toán nhận phiếu giao nhận để lập chứng từ.'},
  TQ: {title:'Vận hành quỹ tiền mặt', primary:'cash', modules:['cash'], handoff:'Xác nhận thực thu hoặc thực chi trên phiếu đã duyệt. Kế toán trưởng dùng xác nhận này để ghi sổ.'},
  PD: {title:'Phê duyệt nghiệp vụ', primary:'approvals', modules:['approvals'], handoff:'Duyệt hoặc trả hồ sơ theo phạm vi và hạn mức được cấp. Người lập tiếp nhận lý do khi hồ sơ bị trả.'},
  KTT: {title:'Kiểm soát và chốt sổ', primary:'closing', modules:['documents','approvals','bank','closing','ledger-review','reports'], handoff:'Rà các chứng từ chờ ghi sổ, theo dõi giải trình và xử lý các mục còn vướng trước khi khóa kỳ.'},
  LD: {title:'Điều hành tài chính', primary:'management', modules:['management'], handoff:'Mở chỉ tiêu tài chính hoặc gửi yêu cầu giải trình cho kế toán trưởng.'},
  KS: {title:'Kiểm toán và kiểm soát', primary:'evidence', modules:['evidence','ledger-review','reports','stock'], handoff:'Tra sổ và chứng từ đã ghi. Theo dõi phản hồi cho các yêu cầu bằng chứng của mình.'},
  QT: {title:'Quản trị đơn vị', primary:'administration', modules:['administration'], handoff:'Rà ma trận quyền, phạm vi chi nhánh và hạn mức trước khi cấp vai trò.'},
  TL: {title:'Tiền lương', primary:'payroll', modules:['payroll'], handoff:'Chuyển tổng lương đã rà cho kế toán trưởng. Hồ sơ cá nhân được giữ trong phân hệ tiền lương.'},
  DT: {title:'Đối chiếu với đối tác', primary:'portal', modules:['portal'], handoff:'Xác nhận số dư được chia sẻ hoặc gửi thông tin chênh lệch cho kế toán.'},
  HT: {title:'Theo dõi tích hợp', primary:'integration', modules:['integration'], handoff:'Kiểm tra tình trạng tiếp nhận và các lần gửi trùng theo mã sự kiện.'}
};

export function queueFor(view) {
  const count = (route, key, rows = []) => rows.filter(row => filters[route][key][1](row, view)).length;
  const entry = (route, key, rows) => ({route, key, label:filters[route][key][0], value:count(route,key,rows)});
  const approval = () => [
    entry('approvals','orders',view.orderApprovals),
    entry('approvals','vouchers',view.approvals),
    entry('approvals','reopen',view.reopen)
  ];
  const unresolved = (view.evidence ?? []).filter(row => !row.answer).length;
  const entries = {
    KT: () => [entry('documents','mine',view.documents),entry('documents','revision',view.documents),entry('orders','returned',view.orders),
      {route:'bank', key:'unlinked', label:'Sao kê chưa ghép',value:(view.bank ?? []).filter(row => !row.linked).length}],
    TK: () => [entry('warehouse','pending',view.orders)],
    TQ: () => [entry('cash','pending',view.cash?.requests)],
    PD: approval,
    KTT: () => [entry('documents','recording',view.documents),...approval(),
      {route:'closing',label:'Mục còn vướng khi chốt kỳ',value:(view.closing?.checks ?? []).reduce((sum, row) => sum + row.count, 0)},
      {route:'evidence',label:'Giải trình chưa phản hồi',value:unresolved}],
    LD: () => [{route:'management',action:'management-followup',label:'Giải trình chưa phản hồi',value:unresolved}],
    KS: () => [{route:'evidence',label:'Yêu cầu bằng chứng đang chờ',value:unresolved}],
    TL: () => [{route:'payroll',label:'Bảng lương nháp',value:(view.payroll ?? []).filter(row => row.status === 'draft').length}]
  };
  return (entries[view.actor.code]?.() ?? []).filter(row => view.nav.includes(row.route)).map(row => ({
    ...row,
    blocked: ['warehouse','cash','documents','orders','approvals'].includes(row.route) && row.key!=='reopen' && view.locked
  }));
}

export function quickAction(view) {
  const options = {
    KT:['order.write','orders','form:order','Tạo đơn mua hoặc bán','plus'],
    TK:['stock.count','warehouse','form:stock-count','Lập biên bản kiểm kê','plus'],
    TQ:['cash.confirm','cash','focus:cash','Mở phiếu chờ xác nhận','wallet','pending'],
    PD:['approve','approvals','focus:approvals','Mở phiếu chờ duyệt','check','vouchers'],
    KTT:['doc.post','documents','focus:documents','Rà chứng từ chờ ghi sổ','doc','recording'],
    LD:['evidence.ask.management','management','form:evidence-management','Gửi yêu cầu giải trình','doc'],
    KS:['evidence.ask.audit','evidence','form:evidence-audit','Yêu cầu bằng chứng','doc'],
    TL:['payroll.write','payroll','form:payroll','Lập bảng lương','plus'],
    DT:['portal.reply','portal','form:portal','Phản hồi đối chiếu','doc'],
    HT:['event.simulate','integration','form:event','Gửi sự kiện mẫu','plus']
  };
  const option = options[view.actor.code];
  if (!option) return null;
  const [cap,route,action,label,glyph,filter] = option;
  if (!view.nav.includes(route) || (route === 'portal' && !view.portal)) return null;
  const canReadWhenLocked = action.startsWith('focus:') || ['LD','KS','DT','HT'].includes(view.actor.code);
  if (!(canReadWhenLocked ? view.caps.includes(cap) : actionable(view, cap))) return null;
  return {action,label,glyph,args:filter ? {filter} : undefined};
}
