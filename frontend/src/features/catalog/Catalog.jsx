import {useState} from 'react';
import {Action, Card, DataTable} from '../../ui/components.jsx';

const roles={customer:'Khách hàng',supplier:'Nhà cung cấp',both:'Khách hàng và nhà cung cấp'};
const qty=new Intl.NumberFormat('vi-VN');
const formatDate=value=>value?value.split('-').reverse().join('/'):'—';

export function Catalog({catalog,date,branch}){
  const [type,setType]=useState('items');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const item=type==='items';
  const filtered=catalog[type].filter(row=>{
    const future=row.from>date;
    const ended=row.inactiveFrom&&row.inactiveFrom<=date;
    const selected=status==='all'||status===(future?'future':ended?'ended':'active');
    return selected&&(row.code+' '+row.name).toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'));
  });
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Danh mục</h1><p>Mã hàng, khách hàng và nhà cung cấp</p></div>
        <Action action="form:catalog-edit" args={{type}} glyph="plus" style="primary">{item?'Thêm mặt hàng':'Thêm đối tác'}</Action>
      </div>
      <div className="row-actions" role="group" aria-label="Nhóm danh mục">
        {[['items','Hàng hóa'],['parties','Đối tác']].map(([key,label])=>(
          <button key={key} type="button" className={'btn '+(type===key?'primary':'soft')} aria-pressed={type===key}
            onClick={()=>{setType(key);setQuery('');setStatus('all');}}>{label}</button>
        ))}
      </div>
      <Card title={item?'Danh mục hàng hóa · '+branch:'Danh mục đối tác'}>
        <div className="controls flex-wrap">
          <label className="field">Tìm mã hoặc tên<input type="search" value={query} onChange={event=>setQuery(event.target.value)} /></label>
          <label className="field">Hiệu lực tại {formatDate(date)}
            <select value={status} onChange={event=>setStatus(event.target.value)}>
              <option value="all">Tất cả</option>
              <option value="active">Đang sử dụng</option>
              <option value="future">Chưa có hiệu lực</option>
              <option value="ended">Đã ngừng</option>
            </select>
          </label>
        </div>
        <DataTable columns={['Mã','Tên',...(item?['Đơn vị','Tồn theo sổ']:['Nhóm đối tác']),'Bắt đầu','Ngừng từ','Thao tác']}
          empty="Chưa có mã phù hợp." rows={filtered.map(row=>({
            key:row.id,
            cells:[row.code,<strong>{row.name}</strong>,...(item?[row.unit,qty.format(row.units)]:[roles[row.kind]]),
              formatDate(row.from),formatDate(row.inactiveFrom),
              <div className="row-actions">
                <Action action="form:catalog-edit" args={{type,id:row.id}} style="soft">Sửa tên</Action>
                <Action action="form:catalog-status" args={{type,id:row.id}}>{row.inactiveFrom?'Sửa ngày ngừng':'Ngừng sử dụng'}</Action>
                {row.inactiveFrom&&<Action action="send:catalog.status" args={{type,id:row.id,inactiveFrom:null}}>Dùng lại</Action>}
              </div>]
          }))} />
      </Card>
    </div>
  );
}
