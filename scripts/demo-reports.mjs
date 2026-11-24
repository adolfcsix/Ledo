import {newWorkspace} from '../backend/modules/accounting/domain.mjs';
import {record} from '../backend/modules/accounting/ledger.mjs';

// Separate, in-memory data set for the financial dashboard. All amounts are fictional.
export function reportExample(){
  const workspace=newWorkspace('start');
  workspace.openingBank={CN01:125000000,CN02:0};
  workspace.openingCash={CN01:8500000,CN02:0};
  const ledger={docs:workspace.docs,opening:125000000,openingFund:8500000,period:'2026-11',logs:[]};
  const rows=[
    [1,'buy','MH-001','Nội thất Minh Long',220,500000],
    [3,'sell','BH-001','Cà phê Mộc',42,920000],
    [5,'sell','BH-002','Khách sạn Vịnh Xanh',21,980000],
    [6,'receive','PT-001','Cà phê Mộc',1,31000000,'BH-001'],
    [7,'pay','PC-001','Nội thất Minh Long',1,28000000,'MH-001'],
    [8,'sell','BH-003','Cà phê Mộc',33,960000],
    [9,'receive','PT-002','Khách sạn Vịnh Xanh',1,15000000,'BH-002','cash'],
    [10,'buy','MH-002','Xưởng Hòa Bình',140,540000],
    [12,'sell','BH-004','Nhà hàng An Lạc',48,1000000],
    [13,'pay','PC-002','Xưởng Hòa Bình',1,36000000,'MH-002'],
    [14,'receive','PT-003','Nhà hàng An Lạc',1,30000000,'BH-004'],
    [16,'sell','BH-005','Khách sạn Vịnh Xanh',28,995000],
    [18,'pay','PC-003','Nội thất Minh Long',1,35000000,'MH-001'],
    [19,'sell','BH-006','Cà phê Mộc',22,1020000],
    [20,'receive','PT-004','Cà phê Mộc',1,20000000,'BH-003'],
    [22,'buy','MH-003','Xưởng Hòa Bình',120,520000],
    [23,'sell','BH-007','Nhà hàng An Lạc',53,1050000],
    [25,'receive','PT-005','Nhà hàng An Lạc',1,42000000,'BH-007'],
    [26,'sell','BH-008','Cà phê Mộc',39,990000],
    [27,'pay','PC-004','Xưởng Hòa Bình',1,20000000,'MH-003','cash'],
    [28,'payroll','LG-001','Lương theo đơn vị',1,16500000],
    [29,'sell','BH-009','Khách sạn Vịnh Xanh',23,1030000],
    [30,'receive','PT-006','Cà phê Mộc',1,21000000,'BH-008']
  ];
  const due={
    'MH-001':'2026-11-18','BH-001':'2026-11-20','BH-002':'2026-11-25','BH-003':'2026-11-23',
    'MH-002':'2026-12-03','BH-004':'2026-12-05','BH-005':'2026-12-08',
    'MH-003':'2026-12-10','BH-007':'2026-11-30','BH-008':'2026-12-07'
  };
  for(const [day,kind,id,party,quantity,price,link,channel='bank'] of rows){
    const error=record(ledger,{kind,id,party,quantity,price,link,channel,dueDate:due[id],date:'2026-11-'+String(day).padStart(2,'0'),
      branch:'CN01',warehouse:'K01',owner:'KT',ownerActor:'KT'});
    if(error)throw new Error(id+' '+error);
  }
  workspace.audit.length=0;
  workspace.serial=rows.length+20;
  return workspace;
}
