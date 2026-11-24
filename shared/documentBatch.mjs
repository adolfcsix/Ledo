export const documentBatchLimit = 25;
export const documentBatchOperations = Object.freeze({
  submit: {action:'doc.submit', title:'Gửi duyệt theo lô', completed:'Đã gửi duyệt'},
  approve: {action:'doc.approve', title:'Duyệt theo lô', completed:'Đã duyệt'},
  verify: {action:'cash.verify', title:'Xác nhận quỹ theo lô', completed:'Đã xác nhận thực thu, thực chi'},
  post: {action:'doc.post', title:'Ghi sổ theo lô', completed:'Đã ghi sổ'}
});
