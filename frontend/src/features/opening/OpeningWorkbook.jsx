import {useRef,useState} from 'react';
import template from './LEDO_MAU_SO_DU_DAU_KY.xlsx?url&inline';
import {openingAccountLabels,readOpeningWorkbook,workbookLimit} from './openingWorkbook.mjs';
import './openingWorkbook.css';

const fileName='LEDO_MAU_SO_DU_DAU_KY.xlsx';
const dateLabel=value=>value?value.split('-').reverse().join('/'):'—';
const number=new Intl.NumberFormat('vi-VN');
const vnd=value=>number.format(value)+' ₫';

function PreviewTable({title,headers,rows,moneyColumns=[]}){
  return <details className="opening-preview" open>
    <summary>{title} <span className="chip neutral">{rows.length} dòng</span></summary>
    {rows.length===0?<p className="subtle">Trang tính không có dòng chi tiết.</p>:
      <div className="table-wrap" tabIndex={0} role="region" aria-label={title}>
        <table aria-label={title}>
          <thead><tr>{headers.map((head,i)=><th scope="col" className={moneyColumns.includes(i)?'num':undefined} key={head}>{head}</th>)}</tr></thead>
          <tbody>{rows.map((row,index)=><tr key={index}>{row.map((text,i)=><td key={i} className={moneyColumns.includes(i)?'num':undefined}>{text}</td>)}</tr>)}</tbody>
        </table>
      </div>}
  </details>;
}

export function OpeningWorkbook({catalog,period,branch,applyToForm}){
  const [file,setFile]=useState(null);
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [replace,setReplace]=useState(false);
  const request=useRef(0);
  function clear(){
    request.current++;
    setFile(null);setResult(null);setError('');setLoading(false);setReplace(false);
  }
  async function choose(event){
    const selected=event.currentTarget.files[0];
    event.currentTarget.value='';
    if(!selected) return;
    clear();
    const index=request.current;
    setFile(selected.name);
    if(!/\.xlsx$/i.test(selected.name)||selected.size>workbookLimit){
      setError('Chọn tệp .xlsx có dung lượng tối đa 2 MB.');return;
    }
    setLoading(true);
    try {
      const inspection=await readOpeningWorkbook(await selected.arrayBuffer(),catalog,period,branch);
      if(index===request.current) setResult(inspection);
    } catch(error) {
      if(index===request.current) setError(error.message);
    } finally {
      if(index===request.current) setLoading(false);
    }
  }
  const preview=result?.issues.length===0?result.preview:null;
  const totals=result?.totals;
  return <section className="card padded stack opening-import" aria-labelledby="opening-import-title">
    <div className="opening-import-head">
      <div><h2 id="opening-import-title">Nhập số dư từ Excel</h2>
      <p>Chi nhánh <strong>{branch}</strong> · Kỳ <strong>{period.split('-').reverse().join('/')}</strong></p></div>
      <a className="btn soft" href={template} download={fileName}>Tải tệp mẫu Excel</a>
    </div>
    <ol className="opening-import-steps">
      <li><strong>Điền tệp mẫu</strong><span>Giữ nguyên tên và thứ tự cột của ba trang Tài khoản, Tồn kho và Công nợ.</span></li>
      <li><strong>Kiểm tra dữ liệu</strong><span>Đối chiếu mã danh mục, sửa các dòng báo lỗi và kiểm tra tổng Nợ/Có.</span></li>
      <li><strong>Đưa vào biểu mẫu</strong><span>Rà số liệu trên màn hình rồi lưu bản chờ Kế toán trưởng áp dụng.</span></li>
    </ol>
    <div className="opening-file">
      <label className="field">Tệp số dư đầu kỳ<input type="file" accept=".xlsx" onChange={choose} aria-describedby="opening-file-help"/></label>
      <p id="opening-file-help" className="subtle">Tệp .xlsx tối đa 2 MB. Tồn kho và công nợ có tối đa 40 dòng cộng lại.</p>
    </div>
    {file&&<div className="opening-import-file-status"><span><strong>{file}</strong></span>
      <button type="button" className="btn soft" onClick={clear}>Bỏ tệp đã chọn</button>
    </div>}
    {loading&&<p className="notice" role="status">Đang đọc tệp và đối chiếu danh mục…</p>}
    {error&&<p className="notice warn" role="alert">{error}</p>}
    {result?.issues.length>0&&<section className="opening-error" aria-labelledby="opening-error-title">
      <h3 id="opening-error-title" role="alert">Cần sửa {result.issues.length} lỗi trong tệp</h3>
      <p>Sửa các ô được chỉ ra trong Excel, lưu rồi chọn lại tệp. Biểu mẫu hiện tại chưa thay đổi.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Các lỗi trong tệp Excel">
        <table>
          <thead><tr><th scope="col">Trang tính</th><th scope="col">Dòng Excel</th><th scope="col">Việc cần sửa</th></tr></thead>
          <tbody>{result.issues.map(({sheet,row,message},i)=><tr key={i}><td>{sheet}</td><td>{row??'Cả trang'}</td><td>{message}</td></tr>)}</tbody>
        </table>
      </div>
    </section>}
    {preview&&<>
      <div className="opening-import-summary" aria-live="polite">
        <div><span>Tổng Nợ</span><strong>{vnd(totals.debit)}</strong></div>
        <div><span>Tổng Có</span><strong>{vnd(totals.credit)}</strong></div>
        <div><span>Chênh lệch</span><strong>{vnd(Math.abs(totals.debit-totals.credit))}</strong></div>
      </div>
      {result.canLoad?
        <p className="notice" role="status">Tệp hợp lệ và đã cân Nợ/Có.</p>:
        <p className="notice warn" role="alert">Tổng {totals.debit>totals.credit?'Nợ':'Có'} đang lớn hơn {vnd(Math.abs(totals.debit-totals.credit))}. Cần đối chiếu lại số dư trong Excel.</p>}
      <PreviewTable title="Tài khoản" headers={['Mã','Tên tài khoản','Số dư']} moneyColumns={[2]}
        rows={Object.entries(preview.accounts).map(([code,value])=>[code,openingAccountLabels[code],vnd(value)])}/>
      <PreviewTable title="Tồn kho" headers={['Mã hàng','Mặt hàng','Số lượng','Đơn vị tính','Trị giá']} moneyColumns={[2,4]}
        rows={preview.stock.map(row=>[row.itemCode,row.itemName,number.format(row.quantity),row.unit,vnd(row.value)])}/>
      <PreviewTable title="Công nợ" headers={['Loại','Đối tác','Chứng từ gốc','Ngày chứng từ','Hạn thanh toán','Số dư']} moneyColumns={[5]}
        rows={preview.debts.map(row=>[row.kind==='sell'?'Phải thu':'Phải trả',row.partyCode+' · '+row.party,row.ref,dateLabel(row.date),dateLabel(row.dueDate),vnd(row.price)])}/>
      {result.canLoad&&<div className="stack opening-import-confirm">
        <label><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/>
          <span>Thay toàn bộ số đang nhập trên biểu mẫu bằng dữ liệu tệp. Bản đã lưu và sổ chỉ thay đổi khi thực hiện các bước tiếp theo.</span></label>
        <div className="row-actions"><button className="btn primary" type="button" disabled={!replace} onClick={()=>applyToForm(result.data)}>Đưa số liệu vào biểu mẫu</button></div>
      </div>}
    </>}
  </section>;
}
