import {entries, openingBalances, posted} from "./ledger.mjs";

export function ledgerReview(summary, debts, stockCard) {
  const {balances}=summary;
  const net = code=>balances[code].debit-balances[code].credit;
  const debtTotal = kind=>debts.filter(row=>row.kind===kind).reduce((total,row)=>total+row.open,0);
  const knownItems=new Set(stockCard.items.map(item=>item.id));
  const knownRows=stockCard.rows.filter(row=>knownItems.has(row.itemId));
  const inventory=stockCard.items.reduce((total,item)=>total+item.opening.value,0)+
    knownRows.reduce((total,row)=>total+(row.incoming?row.value:-row.value),0);
  const totals=Object.values(balances).reduce((total,row)=>({debit:total.debit+row.debit,credit:total.credit+row.credit}),{debit:0,credit:0});
  const compare=(id,title,leftLabel,rightLabel,left,right,route,focus)=>({
    id,title,leftLabel,rightLabel,left,right,difference:left-right,route,focus
  });
  return {
    comparisons:[
      compare('balance','Cân đối phát sinh và số dư đầu kỳ','Tổng ghi Nợ','Tổng ghi Có',totals.debit,totals.credit,'reports'),
      compare('inventory','Hàng hóa · TK 156','Sổ cái','Thẻ kho theo mã',net('156'),inventory,'stock'),
      compare('receivable','Phải thu khách hàng · TK 131','Sổ cái','Chi tiết phải thu',net('131'),debtTotal('sell'),'reports','131'),
      compare('payable','Phải trả nhà cung cấp · TK 331','Sổ cái','Chi tiết phải trả',-net('331'),debtTotal('buy'),'reports','331')
    ],
    signals:[
      {id:'unknownItems',label:'Dòng thẻ kho thiếu mã trong danh mục',count:stockCard.rows.length-knownRows.length,route:'stock'},
      {id:'negativeDebts',label:'Khoản công nợ có số còn lại âm',count:debts.filter(row=>row.open<0).length,route:'reports'},
      {id:'negativeCash',label:'Số dư tiền mặt theo sổ âm',count:Number(net('111')<0),route:'reports',focus:'111'}
    ]
  };
}

export const reviewGroups = Object.freeze({
  balance:null, inventory:'156', receivable:'131', payable:'331',
  unknownItems:'156', negativeDebts:null, negativeCash:'111'
});

export function reviewEvidence(group,ledger,debts,stockCard) {
  const account=reviewGroups[group];
  const known=new Map(stockCard.items.map(item=>[item.id,item]));
  if(group==='unknownItems'){
    return stockCard.rows.filter(row=>!known.has(row.itemId)).map(row=>({
      source:'Thẻ kho',reference:row.id,document:row.id,date:row.date,note:'Mã hàng nguồn '+row.itemId,
      debit:row.incoming?row.value:0,credit:row.incoming?0:row.value
    }));
  }
  const opening=Object.entries(openingBalances(ledger))
    .filter(([code,row])=>(!account||code===account)&&(row.debit||row.credit))
    .map(([code,row])=>({source:'Sổ cái',reference:'Đầu kỳ · '+code,note:'Số dư mang vào kỳ',...row}));
  const journal=posted(ledger).flatMap(doc=>entries(doc)
    .filter(([debit,credit,value])=>value>0&&(!account||debit===account||credit===account))
    .map(([debit,credit,value])=>({
      source:'Sổ cái',reference:doc.id,document:doc.id,date:doc.date,note:debit+' / '+credit,
      debit:!account||account===debit?value:0,credit:!account||account===credit?value:0
    })));
  if(group==='inventory'){
    const details=stockCard.rows.map(row=>({
      source:'Thẻ kho',reference:row.id,document:row.id,date:row.date,
      note:known.get(row.itemId)?.code??'Thiếu mã trong danh mục · '+row.itemId,
      debit:row.incoming?row.value:0,credit:row.incoming?0:row.value,excluded:!known.has(row.itemId)
    }));
    const stockOpening=stockCard.items.filter(item=>item.opening.value)
      .map(item=>({source:'Thẻ kho',reference:item.code,note:'Tồn đầu kỳ',debit:item.opening.value,credit:0}));
    return [...opening,...journal,...stockOpening,...details];
  }
  if(['receivable','payable','negativeDebts'].includes(group)){
    const details=debts.filter(row=>group==='negativeDebts'?row.open<0:row.kind===(group==='receivable'?'sell':'buy'))
      .map(row=>({source:'Công nợ chi tiết',reference:row.ref??row.id,date:row.date,
        document:row.opening?undefined:row.id,note:row.opening?'Công nợ đầu kỳ':'Công nợ từ chứng từ',
        debit:row.kind==='sell'?row.open:0,credit:row.kind==='buy'?row.open:0}));
    return group==='negativeDebts'?details:[...opening,...journal,...details];
  }
  return [...opening,...journal];
}
