import {csvDocument} from '../../ui/csv.mjs';

export function stockHistory(model,from,to){
  const reports=new Map(model.items.map(item=>[item.id,{
    item,opening:{...item.opening},closing:{...item.opening},
    received:{units:0,...(model.withValue?{value:0}:{})},issued:{units:0,...(model.withValue?{value:0}:{})},rows:[]
  }]));
  function move(total,row,factor=1){
    total.units+=factor*row.quantity;
    if(model.withValue)total.value+=factor*row.value;
  }
  for(const row of model.rows){
    const report=reports.get(row.itemId);
    if(!report||row.date>to)continue;
    const isReceipt=row.incoming, factor=isReceipt?1:-1;
    move(report.closing,row,factor);
    if(row.date<from){
      move(report.opening,row,factor);
    }else{
      move(isReceipt?report.received:report.issued,row);
      report.rows.push({...row,after:{...report.closing}});
    }
  }
  return [...reports.values()];
}

export function stockCsv(model,reports,from,to,detail){
  const range=['Kho','Mã hàng','Tên hàng','Đơn vị','Từ ngày','Đến ngày'];
  const itemFields=item=>[model.warehouse,item.code,item.name,item.unit,from,to];
  const summaries=['Tồn đầu','Nhập','Xuất','Tồn cuối'];
  const values=row=>[row.opening,row.received,row.issued,row.closing];
  if(!detail)return csvDocument([...range,...summaries.map(label=>label+' (SL)'),
    ...(model.withValue?summaries.map(label=>label+' (VND)'):[])],reports.map(report=>[
      ...itemFields(report.item),...values(report).map(value=>value.units),
      ...(model.withValue?values(report).map(value=>value.value):[])
    ]));
  const [report]=reports;
  const prefix=itemFields(report.item);
  return csvDocument([...range,'Ngày hạch toán','Chứng từ','Đối tác','Nhập (SL)','Xuất (SL)','Tồn sau giao dịch (SL)',
    ...(model.withValue?['Trị giá nhập (VND)','Giá vốn xuất (VND)','Tồn sau giao dịch (VND)']:[])],[
    [...prefix,from,'Tồn đầu khoảng','',0,0,report.opening.units,...(model.withValue?[0,0,report.opening.value]:[])],
    ...report.rows.map(row=>[
      ...prefix,row.date,row.id,row.party,row.incoming?row.quantity:0,!row.incoming?row.quantity:0,row.after.units,
      ...(model.withValue?[row.incoming?row.value:0,!row.incoming?row.value:0,row.after.value]:[])
    ]),
    [...prefix,to,'Tồn cuối khoảng','',report.received.units,report.issued.units,report.closing.units,
      ...(model.withValue?[report.received.value,report.issued.value,report.closing.value]:[])]
  ]);
}
