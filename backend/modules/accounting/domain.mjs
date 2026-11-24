import {ledgerReview, reviewEvidence, reviewGroups} from './ledgerReview.mjs';
import {documentBatchLimit, documentBatchOperations} from '../../../shared/documentBatch.mjs';
import {varianceMethods,varianceProgress,varianceCashLine,varianceCashProgress,varianceCashIssue} from './varianceSettlement.mjs';
import {stockCardModel} from './stockCard.mjs';
import {inspectBankBatch,statementLimit} from './bankStatement.mjs';
import {openingEditable,openingProfile,normalizeOpening} from './opening.mjs';
import {catalogChange,usableCatalogRecord,sameParty} from './catalog.mjs';
import {financialOverview} from './overview.mjs';
import {parsePurchaseInvoice} from './invoice.mjs';
import {roleCapabilities,rolePages,roles,branches,warehouses,grants} from '../access/roles.mjs';
import {kinds,accounts,bankSample,sampleDocs,summary,amount,openAmount,preview,issue,entries,posted,validPostingDate,stockForItem,debtSources,openingBalances,stockActivity,stockMovement,isStockAdjustment,averageStockValue} from './ledger.mjs';

const demoPeriod='2026-11';
const accountingPeriod=state=>state.period??demoPeriod;
const suggestedDate=state=>{
  if(!state.period)return demoPeriod+'-24';
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short'}).format(new Date());
  return today.startsWith(state.period)?today:state.period+'-01';
};
const partyByKind={buy:'Nhà cung cấp Minh Long',sell:'Cà phê Mộc'};
const stockForBranch={CN01:'K01',CN02:'K02'};
const MAX=1000000000000;

export class WorkspaceError extends Error {
  constructor(message,status=422){super(message);this.status=status;}
}
function ensure(condition,message,status=422){if(!condition)throw new WorkspaceError(message,status);}
function short(value,limit=120){
  const normalized=typeof value==='string'?value.trim():'';
  ensure(normalized.length>0&&normalized.length<=limit,'Kiểm tra nội dung bắt buộc và độ dài.');
  return normalized;
}
function integer(value,min=1,max=MAX){
  ensure(Number.isSafeInteger(value)&&value>=min&&value<=max,'Nhập số nguyên hợp lệ trong phạm vi cho phép.');
  return value;
}
function postingDate(state,value){
  ensure(validPostingDate(value,accountingPeriod(state)),'Ngày hạch toán phải thuộc kỳ '+accountingPeriod(state)+'.');
  return value;
}
function stamp(){return new Date().toISOString();}
function id(state,prefix){state.serial+=1;return prefix+'-'+String(state.serial).padStart(3,'0');}
const documentAuditActions=new Set([
  'order.draft','warehouse.adjust','warehouse.settle','warehouse.cash','warehouse.void-adjustment',
  'doc.save','doc.revise','doc.cancel','doc.restore','doc.submit','doc.approve','doc.return','doc.post',
  'cash.verify','payroll.prepare'
]);
const legacyDocumentMessages=new Set([
  'Đã lập nháp từ phiếu giao nhận','Đã lập nháp phiếu thu/chi','Đã lưu nội dung bổ sung',
  'Đã hủy bản nháp điều chỉnh','Đã hủy bản nháp xử lý chênh lệch','Đã hủy bản nháp và giữ để có thể phục hồi',
  'Đã phục hồi về bản nháp','Đã gửi hồ sơ vào hàng đợi duyệt','Đã duyệt hồ sơ',
  'Đã trả về người lập để bổ sung','Đã ghi sổ chứng từ','Đã xác nhận tiền thực tế, chờ ghi sổ',
  'Đã duyệt và tạo phiếu lương tổng hợp chờ ghi sổ',
  'Đã lập nháp phiếu thu bồi thường','Đã lập nháp phiếu chi phải trả khác'
]);
function log(state,code,branch,target,message,action,documentId){
  state.audit.push({time:stamp(),actor:code,branch,target,message,action,documentId});
  if(!state.period&&state.audit.length>280)state.audit.splice(0,state.audit.length-280);
}
export function newWorkspace(mode='sample'){
  const sample=mode==='sample';
  return {
    serial:20,grants:grants(),locked:{CN01:false,CN02:false},closed:{},reopen:[],orders:[],counts:[],cashCounts:[],
    docs:(sample?structuredClone(sampleDocs):[]).map(doc=>({...doc,branch:'CN01',owner:'KT',approvedBy:'PD',warehouse:'K01'})),
    bank:(sample?structuredClone(bankSample):[]).map(row=>({...row,branch:'CN01',linked:null})),
    invoices:[],payroll:[],evidence:[],portalReplies:[],events:[],audit:[
      {time:stamp(),actor:'QT',branch:'CN01',target:'AN-PHAT',message:sample?'Khởi tạo bộ mẫu An Phát':'Khởi tạo từ số dư đầu kỳ'}
    ]
  };
}
export function author(state,code,access=null){
  const role=Object.hasOwn(roles,code)?roles[code]:null;
  const grant=access?{active:access.roles.includes(code),branch:access.branch,limit:access.limit,bankLink:access.bankLink}:
    Object.hasOwn(state.grants,code)?state.grants[code]:null;
  ensure(role&&grant?.active,'Vai trò thực hành đã bị tạm ngưng.',403);
  const caps=roleCapabilities(code,{company:Boolean(access),period:Boolean(state.period),catalog:Boolean(state.catalog),bankLink:grant.bankLink});
  return {code,role,grant,branch:grant.branch,caps,identity:access?.id??code,access};
}
function allowed(actor,cap){ensure(actor.caps.has(cap),'Vai trò chưa được cấp quyền thực hiện thao tác này.',403);}
function requireOpen(state,actor){ensure(!state.locked[actor.branch],'Kỳ của chi nhánh đã khóa. Cần mở lại đúng quy trình.',409);}
function atScope(collection,key,actor,field='id'){
  const row=collection.find(item=>item[field]===key&&item.branch===actor.branch);
  ensure(row,'Không tìm thấy hồ sơ trong phạm vi được giao.',404);
  return row;
}
function viewLedger(state,branch){
  const applied=state.openingBooks?.[branch];
  const openingFund=applied?.accounts['111']??state.openingCash?.[branch]??0;
  const opening=applied?.accounts['112']??state.openingBank?.[branch]??(branch==='CN01'?5000000:0);
  return {docs:state.docs.filter(doc=>doc.branch===branch),locked:state.locked[branch],period:accountingPeriod(state),
    openingFund,opening,initialAccounts:applied?.accounts??{'111':openingFund,'112':opening,'334':0,'411':openingFund+opening},
    stockOpening:applied?.stock??[],debtOpening:applied?.debts??[]};
}
function debts(state,branch,ledger=viewLedger(state,branch)){
  const settlements=new Map();
  for(const payment of posted(ledger)){
    if(!payment.link) continue;
    if(!settlements.has(payment.link)) settlements.set(payment.link,[]);
    settlements.get(payment.link).push({id:payment.id,date:payment.date,amount:amount(payment),channel:payment.channel});
  }
  return debtSources(ledger).map(doc=>{
    const payments=settlements.get(doc.id)??[];
    const original=amount(doc);
    return {id:doc.id,party:doc.party,partyId:doc.partyId,partyCode:doc.partyCode,kind:doc.kind,
      date:doc.date,opening:Boolean(doc.opening),ref:doc.ref,dueDate:doc.dueDate,original,
      open:original-payments.reduce((sum,payment)=>sum+payment.amount,0),settlements:payments};
  });
}
function verifiedCashOut(ledger){
  return ledger.docs.reduce((total,doc)=>total+(doc.kind==='pay'&&doc.channel==='cash'&&doc.status==='approved'&&doc.verified?amount(doc):0),0);
}
function checks(state,branch){
  const ledger=viewLedger(state,branch);
  const sums=summary(ledger);
  const invalidItems=state.catalog?.items.filter(item=>{const stock=stockForItem(ledger,item.id);return stock.units<0||stock.value<0;}).length??0;
  return [
    {name:'Chứng từ',count:ledger.docs.filter(doc=>doc.status!=='posted'&&doc.status!=='void').length,to:'documents'},
    {name:'Đối chiếu ngân hàng',count:state.bank.filter(row=>row.branch===branch&&!row.linked).length,to:'bank'},
    {name:'Tồn và công nợ',count:invalidItems+(sums.units<0||sums.stock<0||sums.ar<0||sums.ap<0?1:0),to:'debts'},
    {name:'Bàn giao kho',count:state.orders.filter(row=>row.branch===branch).flatMap(row=>row.receipts).filter(row=>!row.docId).length+state.counts.filter(row=>row.branch===branch&&row.delta!==0&&!row.resolved).length,to:'orders'},
    {name:'Quỹ tiền mặt',count:ledger.docs.filter(doc=>doc.channel==='cash'&&doc.status!=='posted'&&doc.status!=='void').length+state.cashCounts.filter(row=>row.branch===branch&&row.delta!==0&&!row.resolved).length,to:'cash'},
  ];
}
function report(state,actor,full){
  const ledger=viewLedger(state,actor.branch);
  const summ=summary(ledger);
  const overview=['KTT','LD'].includes(actor.code)?financialOverview(ledger,summ):undefined;
  if(overview&&state.catalog){
    overview.inventory.units=null;
    overview.inventory.itemCount=state.catalog.items.filter(item=>stockForItem(ledger,item.id).units>0).length;
  }
  if(full)return {summary:summ,overview,accounts,openingBank:ledger.opening,openingCash:ledger.openingFund,openingBalances:openingBalances(ledger),locked:state.locked[actor.branch],snapshot:state.closed[actor.branch]??null};
  const {cash,fund,ar,ap,stock,revenue,otherIncome,cogs,profit,expense,wages}=summ;
  return {summary:{cash,fund,ar,ap,stock,revenue,otherIncome,cogs,profit,expense,wages},overview,locked:state.locked[actor.branch]};
}
function orderStatus(order){return order.status??'approved';}
function orderProjection(order,warehouse){
  if(!warehouse)return {...order,status:orderStatus(order)};

  const {id,branch,kind,warehouse:location,party,partyCode,itemId,itemCode,itemName,unit,quantity,date:when,receipts}=order;
  return {id,branch,kind,warehouse:location,party,partyCode,itemId,itemCode,itemName,unit,quantity,date:when,status:orderStatus(order),receipts:receipts.map(row=>({id:row.id,quantity:row.quantity,remark:row.remark}))};
}
function owns(row,actor){
  return (row.ownerActor??row.owner)===actor.identity;
}
function ownedView(row,actor){
  const {ownerActor, ...visible}=row;
  return {...visible,mine:owns(row,actor)};
}
function docProjection(state,doc,actor){
  const draft=preview(viewLedger(state,doc.branch),doc);
  return {...ownedView(doc,actor),total:amount(doc),lines:entries(draft).filter(line=>line[2]>0).map(([debit,credit,value])=>({debit,credit,value}))};
}
function bankProjection(state,actor){
  const ledger=viewLedger(state,actor.branch);
  const scoped=state.bank.filter(row=>row.branch===actor.branch);
  const linked=new Set(scoped.map(row=>row.linked));
  const debtRows=debts(state,actor.branch);
  const payments=posted(ledger).filter(doc=>doc.channel!=='cash'&&!linked.has(doc.id));
  return scoped.map(row=>{
    const sources=row.linked?[]:debtRows.filter(doc=>sameParty(doc,row)&&doc.kind===(row.kind==='receive'?'sell':'buy')&&doc.open>=row.amount&&doc.date<=row.date)
      .map(({id,opening,ref,open,date})=>({id,opening,ref,open,date}));
    const existing=row.linked?[]:payments.filter(doc=>doc.kind===row.kind&&sameParty(doc,row)&&doc.date===row.date&&amount(doc)===row.amount);
    const proposal=row.proposal?{mode:row.proposal.mode,source:row.proposal.source,by:row.proposal.by,mine:(row.proposal.byActor??row.proposal.by)===actor.identity}:null;
    return {...row,proposal,sources,existing:existing.map(doc=>({id:doc.id,amount:amount(doc)}))};
  });
}
export function ledgerReviewAt(state,code,date,group,access=null){
  const actor=author(state,code,access);
  ensure(actor.role.pages.includes('ledger-review'),'Vai trò không được kiểm tra sổ sách.',403);
  ensure(validPostingDate(date,accountingPeriod(state)),'Ngày đối chiếu phải thuộc kỳ hiện tại.');
  ensure(!group||Object.hasOwn(reviewGroups,group),'Nhóm đối chiếu không hợp lệ.');
  const full=viewLedger(state,actor.branch);
  const ledger={...full,docs:posted(full).filter(doc=>doc.date<=date)};
  const debtRows=debts(state,actor.branch,ledger);
  const stock=stockCardModel(ledger,state.catalog,stockForBranch[actor.branch],true);
  return {date,branch:actor.branch,...ledgerReview(summary(ledger),debtRows,stock),
    evidence:group?reviewEvidence(group,ledger,debtRows,stock):[]};
}

function auditForAuditor(state,branch,docs,evidence){
  const postedIds=new Set(docs.filter(doc=>doc.status==='posted').map(doc=>doc.id));
  const ownRequests=new Set(evidence.map(row=>row.id));
  const bankMatches=new Map(state.bank.filter(row=>row.branch===branch&&row.linked).map(row=>[row.ref,row.linked]));
  return state.audit.filter(row=>{
    if(row.branch!==branch)return false;
    if(row.action){
      if(row.action==='evidence.ask.audit'||row.action==='evidence.resolve')return ownRequests.has(row.target);
      return postedIds.has(row.documentId);
    }
    // Older entries have no structured action or document reference.
    if(ownRequests.has(row.target)&&['Đã gửi yêu cầu cho kế toán trưởng','Đã trả lời và lưu vết'].includes(row.message))return true;
    if(['Đã ghi khoản thanh toán và ghép sao kê','Đã ghép phiếu đã ghi, số dư được giữ nguyên'].includes(row.message)){
      return postedIds.has(bankMatches.get(row.target));
    }
    return postedIds.has(row.target)&&(legacyDocumentMessages.has(row.message)||
      row.message.startsWith('Đã lập nháp điều chỉnh từ ')||row.message.startsWith('Đã lập nháp xử lý từ '));
  });
}

export function workspaceView(state,code,revision,access=null){
  const actor=author(state,code,access);
  const {role,branch}=actor;
  const inBranch=records=>records.filter(row=>row.branch===branch);
  const docs=inBranch(state.docs);
  const nav=rolePages(code,{company:Boolean(access),period:Boolean(state.period)});
  if(actor.caps.has('catalog.write'))nav.push('catalog','opening');
  const evidence=nav.includes('evidence')||code==='LD'?
    inBranch(state.evidence).filter(row=>!['LD','KS'].includes(code)||owns(row,actor)):null;
  const auditorAudit=actor.caps.has('audit.read')?auditForAuditor(state,branch,docs,evidence):null;
  const view={
    actor:{code,name:role.name,person:access?.name??role.person,initial:access?access.name.slice(0,2).toLocaleUpperCase('vi'):role.initial,lead:role.lead,branch,branchName:branches[branch],limit:actor.grant.limit},
    roles:Object.entries(roles).filter(([key])=>state.grants[key].active).map(([key,info])=>({code:key,name:info.name,person:info.person})),
    caps:[...actor.caps],nav,revision,locked:state.locked[branch],period:accountingPeriod(state),defaultDate:suggestedDate(state),inventoryItem:state.inventoryItem??null
  };
  if(access){
    view.workMode='company';
    view.organization=access.organization;
    view.preferenceScope=access.id;
    view.roles=access.roles.map(key=>({code:key,name:roles[key].name,person:access.name}));
    view.actor.branchName=branch==='CN01'?'Chi nhánh chính':'Chi nhánh 02';
  }
  if(state.catalog&&(actor.caps.has('catalog.write')||code==='TK')){
    const localLedger=viewLedger(state,branch);
    const items=state.catalog.items.map(item=>{
      const stock=stockForItem(localLedger,item.id);
      return {...item,units:stock.units,...(code==='TK'?{}:{value:stock.value})};
    });
    view.catalog={items,...(code==='TK'?{}:{parties:state.catalog.parties})};
  }
  if(nav.includes('stock'))view.stockCard=stockCardModel(viewLedger(state,branch),state.catalog,stockForBranch[branch],code!=='TK',inBranch(state.audit));
  if(nav.includes('opening')){
    const ledger=viewLedger(state,branch);
    view.opening={current:openingProfile(ledger),pending:state.openingDrafts?.[branch]??null,
      editable:openingEditable(state,branch),appliedAt:state.openingBooks?.[branch]?.appliedAt??null};
  }
  if(nav.includes('documents')||code==='KS'){
    const history=new Map();
    for(const row of (auditorAudit??inBranch(state.audit)).slice().reverse()){
      const target=row.documentId??row.target;
      const events=history.get(target)??[];
      if(events.length<12)events.push({time:row.time,actor:row.actor.split(' · ').at(-1),message:row.message});
      history.set(target,events);
    }
    view.documents=docs.filter(doc=>code==='KT'?doc.kind!=='payroll':code==='KS'?doc.status==='posted':true)
      .map(doc=>({...docProjection(state,doc,actor),history:history.get(doc.id)??[]}));
  }
  if(nav.includes('orders')||code==='TK')view.orders=inBranch(state.orders)
    .filter(row=>code!=='TK'||orderStatus(row)==='approved').map(row=>ownedView(orderProjection(row,code==='TK'),actor));
  if(nav.includes('invoices'))view.invoices=inBranch(state.invoices??[]).map(({xml,...record})=>record);
  if(['KT','KTT','KS'].includes(code)){
    const visibleDocs=code==='KS'?posted({docs}):docs;
    view.varianceCases=visibleDocs.filter(doc=>doc.status==='posted'&&isStockAdjustment(doc.kind)&&amount(doc)>0).map(source=>{
      const {history,...totals}=varianceProgress(visibleDocs,source);
      return {id:source.id,countId:source.countId,kind:source.kind,date:source.date,itemCode:source.itemCode,itemName:source.itemName,...totals,
        history:history.map(doc=>({id:doc.id,date:doc.date,status:doc.status,decision:doc.decision,total:amount(doc)}))};
    });
  }
  if(['KT','KTT','KS'].includes(code)){
    const visibleDocs=code==='KS'?posted({docs}):docs;
    view.varianceCashCases=visibleDocs.flatMap(decision=>{
      const line=varianceCashLine(decision);
      if(!line)return [];
      const {history,...totals}=varianceCashProgress(visibleDocs,decision,line);
      return [{id:decision.id,date:decision.date,decision:decision.decision,account:line.account,party:line.party,...totals,
        history:history.map(doc=>({id:doc.id,date:doc.date,status:doc.status,verified:Boolean(doc.verified),
          receiptRef:doc.receiptRef,total:amount(doc)}))}];
    });
  }
  if(['TK','KT','KTT'].includes(code)){
    const ledger=viewLedger(state,branch);
    view.counts=inBranch(state.counts).map(row=>{
      const adjustment=docs.find(doc=>doc.id===row.adjustmentId);
      const base={...row,adjustmentStatus:adjustment?.status??null};
      return code==='TK'?base:{...base,current:countIsCurrent(state,row,ledger),
        ...(row.delta<0&&!row.resolved?{estimatedValue:averageStockValue(stockForItem(ledger,row.itemId),-row.delta)}:{})};
    });
  }
  if(nav.includes('bank')){
    view.bank=bankProjection(state,actor);
    view.bankImportBlocked=Boolean(state.openingDrafts?.[branch]);
    const ledger=viewLedger(state,branch);
    view.bankReconciliation={
      opening:openingBalances(ledger)['112'].debit,
      movements:posted(ledger).flatMap(doc=>{
        let move=0;
        for(const [debit,credit,value] of entries(doc)){
          if(debit==='112')move+=value;
          if(credit==='112')move-=value;
        }
        return move===0?[]:[{id:doc.id,date:doc.date,party:doc.party,move}];
      }),
      checkpoints:Object.values(state.bankCheckpoints?.[branch]??{}).sort((a,b)=>b.date.localeCompare(a.date))
    };
  }
  if(nav.includes('debts'))view.debts=debts(state,branch);
  if(nav.includes('approvals')){
    view.approvals=docs.filter(doc=>doc.status==='review'&&(doc.kind!=='payroll'||code==='KTT')).map(doc=>docProjection(state,doc,actor));
    view.orderApprovals=inBranch(state.orders).filter(row=>orderStatus(row)==='review').map(row=>ownedView(orderProjection(row,false),actor));
    view.reopen=inBranch(state.reopen).map(row=>ownedView(row,actor));
  }
  if(nav.includes('cash')){
    const ledger=viewLedger(state,branch);
    view.cash={fund:summary(ledger).fund,reservedOut:verifiedCashOut(ledger),requests:docs.filter(doc=>doc.channel==='cash'&&(code!=='TQ'||['approved','posted'].includes(doc.status))).map(doc=>({id:doc.id,kind:doc.kind,party:doc.party,total:amount(doc),status:doc.status,date:doc.date,mine:owns(doc,actor),verified:doc.verified,receiptRef:doc.receiptRef,varianceAccount:doc.varianceAccount})),counts:inBranch(state.cashCounts)};
  }
  if(nav.includes('reports'))view.report=report(state,actor,true);
  else if(nav.includes('management'))view.report=report(state,actor,false);
  if(nav.includes('ledger-review')){
    view.ledgerReview=ledgerReview(view.report.summary,view.debts??debts(state,branch),view.stockCard);
  }
  if(nav.includes('closing'))view.closing={checks:checks(state,branch),snapshot:state.closed[branch]??null,reopen:inBranch(state.reopen).map(row=>ownedView(row,actor))};
  if(evidence)view.evidence=evidence.map(row=>ownedView(row,actor));
  if(auditorAudit)view.audit=auditorAudit.slice(-50).reverse();
  if(code==='KTT')view.audit=inBranch(state.audit).slice(-50).reverse();
  if(code==='QT'&&!access)view.administration={grants:Object.entries(state.grants).map(([key,value])=>({code:key,role:roles[key].name,...value})),audit:state.audit.filter(row=>row.actor==='QT').slice(-40).reverse()};
  if(code==='TL')view.payroll=inBranch(state.payroll).filter(row=>!access||owns(row,actor)).map(row=>ownedView(row,actor));
  if(code==='KTT')view.payroll=inBranch(state.payroll).filter(row=>row.status!=='draft').map(({id,month,total,status,docId})=>({id,month,total,status,docId}));
  if(code==='DT'){
    const ledger=viewLedger(state,branch);
    const doc=posted(ledger).find(row=>row.id==='BH-001'&&row.party==='Cà phê Mộc');
    view.portal=doc?{id:doc.id,party:doc.party,original:amount(doc),open:openAmount(ledger,doc),replies:inBranch(state.portalReplies).filter(row=>row.ref===doc.id)}:null;
  }
  if(code==='KT'||code==='KTT')view.portalReplies=inBranch(state.portalReplies);
  if(nav.includes('integration'))view.events=inBranch(state.events);
  return view;
}

function catalogParty(state,kind,input,date){
  const fallback=kind==='supplier'?partyByKind.buy:partyByKind.sell;
  if(!state.catalog)return {party:fallback};
  const party=usableCatalogRecord(state.catalog.parties,input.partyId,date,kind);
  ensure(party,'Chọn đối tác đúng nhóm và đang sử dụng vào ngày hạch toán.');
  return {party:party.name,partyId:party.id,partyCode:party.code};
}
function catalogItem(state,input,date){
  if(!state.catalog)return {};
  const item=usableCatalogRecord(state.catalog.items,input.itemId,date);
  ensure(item,'Chọn mặt hàng đang sử dụng vào ngày hạch toán.');
  return {itemId:item.id,itemCode:item.code,itemName:item.name,unit:item.unit};
}
function orderDueDate(value,date){
  if(value==null||value==='') return null;
  ensure(typeof value==='string'&&validPostingDate(value,value.slice(0,7))&&value>=date,
    'Hạn thanh toán phải là ngày hợp lệ và từ ngày hạch toán trở đi.');
  return value;
}
function orderInputs(state,kind,input){
  const date=postingDate(state,input.date);
  return {date,dueDate:orderDueDate(input.dueDate,date),...catalogParty(state,kind==='buy'?'supplier':'customer',input,date),...catalogItem(state,input,date)};
}
function createDoc(state,actor,input,options={}){
  const kind=options.kind??input.kind;
  ensure(['buy','sell','receive','pay','payroll'].includes(kind),'Loại chứng từ chưa được hỗ trợ.');
  let party=options.party??(kind==='payroll'?'Lương theo đơn vị':null);
  let source=null;
  if(kind==='receive'||kind==='pay'){
    source=atScope(debtSources(viewLedger(state,actor.branch)),input.source,actor);
    ensure(source.status==='posted'&&source.kind===(kind==='receive'?'sell':'buy'),'Chứng từ gốc chưa được ghi hoặc không phù hợp.');
    party=source.party;
  }
  const doc={id:id(state,{buy:'MH',sell:'BH',receive:'PT',pay:'PC',payroll:'LG'}[kind]),kind,date:postingDate(state,input.date??suggestedDate(state)),
    party:party??(state.period?short(input.party):partyByKind[kind]),quantity:integer(input.quantity??1,1,1000000),price:integer(input.price),owner:actor.code,ownerActor:actor.identity,branch:actor.branch,
    status:'draft',warehouse:stockForBranch[actor.branch],description:input.description?short(input.description,250):'',link:source?.id,
    channel:input.channel==='cash'?'cash':'bank',origin:options.origin??null};
  const master=source??options.order;
  if(master?.partyId)Object.assign(doc,{partyId:master.partyId,partyCode:master.partyCode});
  if(options.order?.dueDate)doc.dueDate=options.order.dueDate;
  if(options.order?.itemId){const {itemId,itemCode,itemName,unit}=options.order;Object.assign(doc,{itemId,itemCode,itemName,unit});}
  ensure(amount(doc)<=MAX,'Giá trị chứng từ vượt giới hạn 1.000 tỷ đồng.');
  if(source){
    ensure(doc.date>=source.date,'Ngày thanh toán phải từ ngày chứng từ gốc trở đi.');
    ensure(amount(doc)<=openAmount(viewLedger(state,actor.branch),source),'Số tiền vượt khoản công nợ còn lại.');
  }
  state.docs.push(doc);
  return doc;
}
function countIsCurrent(state,row,ledger){
  return row.stockVersion===stockActivity(ledger,row.itemId).version&&
    row.expected===stockForItem(ledger,row.itemId).units&&
    state.counts.findLast(candidate=>candidate.branch===row.branch&&candidate.itemId===row.itemId)?.id===row.id;
}
function pendingDispatchUnits(state,branch,itemId,ledger){
  const postedIds=new Set(posted(ledger).map(row=>row.id));
  return state.orders.filter(row=>row.branch===branch&&row.kind==='sell'&&row.itemId===itemId).flatMap(row=>row.receipts)
    .filter(receipt=>!postedIds.has(receipt.docId)).reduce((sum,row)=>sum+row.quantity,0);
}
function requireCurrentAdjustment(state,actor,row,ledger){
  ensure(!row.resolved&&countIsCurrent(state,row,ledger),
    'Sổ kho đã thay đổi hoặc đã có lần kiểm kê mới. Cần kiểm đếm lại trước khi điều chỉnh.',409);
  ensure(row.delta>0||row.quantity>=pendingDispatchUnits(state,actor.branch,row.itemId,ledger),
    'Còn phiếu giao chưa ghi sổ vượt số đếm thực. Xử lý bàn giao và kiểm kê lại.',409);
}
function verifyVarianceSource(docs,doc,actor){
  const source=atScope(docs,doc.varianceSource,actor);
  ensure(source.status==='posted'&&isStockAdjustment(source.kind)&&source.kind===doc.varianceKind,
    'Chỉ xử lý chứng từ điều chỉnh kiểm kê đã ghi sổ.',409);
  ensure(doc.date>=source.date,'Ngày xử lý phải từ ngày ghi nhận chênh lệch trở đi.');
  const other=docs.filter(row=>row.branch===actor.branch&&row.id!==doc.id);
  const progress=varianceProgress(other,source);
  ensure(amount(doc)<=progress.available,'Giá trị vượt phần còn có thể xử lý sau khi tính các phiếu đang chờ.',409);
  ensure(!progress.history.some(row=>row.status!=='void'&&row.decision.toUpperCase()===doc.decision.toUpperCase()),
    'Số quyết định đã dùng cho chứng từ kiểm kê này.',409);
}
function postDocument(state,actor,doc){
  ensure(doc.status==='approved','Chứng từ cần được duyệt trước khi ghi sổ.',409);
  if(doc.channel==='cash')ensure(doc.verified,'Thủ quỹ chưa xác nhận tiền thực tế.',409);
  const ledger=viewLedger(state,actor.branch);
  const count=isStockAdjustment(doc.kind)?atScope(state.counts,doc.countId,actor):null;
  if(count){
    ensure(count.adjustmentId===doc.id,'Chứng từ điều chỉnh đã mất liên kết với biên bản.',409);
    requireCurrentAdjustment(state,actor,count,ledger);
  }
  if(doc.kind==='varianceClear')verifyVarianceSource(state.docs,doc,actor);
  const failure=issue(ledger,doc);
  ensure(!failure,failure,409);
  const checked=preview(ledger,doc);
  Object.assign(doc,checked,{status:'posted',postedBy:actor.code});
  if(stockMovement(doc)){
    state.stockPostingSequence=(state.stockPostingSequence??0)+1;
    doc.stockPostingOrder=state.stockPostingSequence;
  }
  if(count){count.resolved=true;count.reason='Đã ghi điều chỉnh '+doc.id;}
  if(doc.kind==='payroll'){
    const batch=atScope(state.payroll,doc.origin,actor);
    batch.status='posted';
  }
}
const policies={
 'opening.stage':'opening.write','opening.discard':'opening.write','opening.apply':'opening.apply',
 'catalog.save':'catalog.write','catalog.status':'catalog.write',
 'role.update':'role.manage','demo.reset':'demo.reset','order.create':'order.write','order.revise':'order.write','order.submit':'order.write','order.approve':'approve','order.return':'approve','invoice.import':'invoice.import','order.link-invoice':'invoice.import','warehouse.confirm':'stock.confirm','warehouse.count':'stock.count',
 'order.invoice':'order.write','order.draft':'doc.write','warehouse.resolve':'period.lock','warehouse.adjust':'doc.write','warehouse.settle':'doc.write','warehouse.cash':'doc.write','warehouse.void-adjustment':'period.lock','doc.save':'doc.write','doc.revise':'doc.write','doc.cancel':'doc.write','doc.restore':'doc.write','doc.submit':'doc.submit','doc.approve':'approve','doc.return':'approve','doc.post':'doc.post',
 'bank.sample':'bank.prepare','bank.add':'bank.prepare','bank.import':'bank.prepare','bank.checkpoint':'bank.prepare','bank.propose':'bank.prepare','bank.confirm':'bank.link','bank.post':'bank.post',
 'cash.verify':'cash.confirm','cash.count':'cash.count','cash.resolve':'period.lock','period.lock':'period.lock','period.request':'period.request','period.approve':'approve','period.apply':'period.apply',
 'evidence.ask.audit':'evidence.ask.audit','evidence.ask.management':'evidence.ask.management','evidence.resolve':'evidence.resolve',
 'payroll.save':'payroll.write','payroll.submit':'payroll.submit','payroll.prepare':'payroll.post','portal.reply':'portal.reply','integration.event':'event.simulate'
};
const whileLocked=new Set(['opening.discard','catalog.save','catalog.status','role.update','demo.reset','period.request','period.approve','period.apply','evidence.ask.audit','evidence.ask.management','evidence.resolve','portal.reply','integration.event']);

export function perform(state,code,action,input,access=null){
  const actor=author(state,code,access);
  if(access)ensure(action!=='bank.sample','Chỉ có thể nạp sao kê mẫu trong chế độ thực hành.',403);
  ensure(Object.hasOwn(policies,action),'Thao tác không tồn tại.',404);
  allowed(actor,policies[action]);
  if(!whileLocked.has(action))requireOpen(state,actor);
  const b=actor.branch;
  if(state.openingDrafts?.[b]&&['order.create','doc.save','warehouse.count','bank.add','bank.import','cash.count','payroll.save','period.lock'].includes(action)){
    throw new WorkspaceError('Hãy áp dụng hoặc bỏ bản số dư đầu kỳ đang chờ trước khi phát sinh nghiệp vụ.',409);
  }
  let target='';
  let message='';
  let auditDocument;
  switch(action){
    case 'opening.stage':case 'opening.apply':case 'opening.discard':{
      const drafts=state.openingDrafts??(state.openingDrafts={});
      if(action!=='opening.discard')ensure(openingEditable(state,b),'Chỉ sửa số đầu kỳ trước khi phát sinh chứng từ nghiệp vụ tại chi nhánh.',409);
      if(action==='opening.stage'){
        drafts[b]={...normalizeOpening(state,b,input,ensure),preparedAt:stamp(),preparedBy:actor.access?.name??code};
        message='Đã lưu bản chờ áp dụng. Sổ hiện tại chưa thay đổi.';
      }else{
        ensure(drafts[b],'Chi nhánh chưa có bộ số dư chờ áp dụng.',409);
        if(action==='opening.apply'){
          const books=state.openingBooks??(state.openingBooks={});
          books[b]={...normalizeOpening(state,b,drafts[b],ensure),appliedAt:stamp(),appliedBy:actor.access?.name??code};
          message='Đã áp dụng số dư đầu kỳ';
        }else message='Đã bỏ bản chờ áp dụng';
        delete drafts[b];
      }
      target='DAU-KY-'+state.period;break;
    }
    case 'catalog.save':case 'catalog.status':{
      const record=catalogChange(state.catalog,action,input,ensure,short);
      target=record.code;
      message=action==='catalog.save'?(input.id?'Đã cập nhật tên danh mục':'Đã tạo mã danh mục'):
        record.inactiveFrom?'Đã đặt ngày ngừng sử dụng '+record.inactiveFrom:'Đã cho phép sử dụng lại';
      break;
    }
    case 'role.update':{
      const role=short(input.role,4);
      ensure(Object.hasOwn(state.grants,role)&&role!=='QT','Tài khoản quản trị mẫu được giữ để khôi phục quyền.');
      ensure(Object.hasOwn(branches,input.branch),'Chi nhánh không hợp lệ.');
      const current=state.grants[role];
      current.branch=input.branch;
      current.active=input.active===true;
      if(role==='PD')current.limit=integer(input.limit);
      if(role==='KT')current.bankLink=input.bankLink===true;
      target=role;message='Đã cập nhật phạm vi và quyền '+role;
      break;
    }
    case 'demo.reset':{
      ensure(['sample','start'].includes(input.mode),'Chọn bộ dữ liệu hợp lệ.');
      const rolesBefore=state.grants;
      Object.assign(state,newWorkspace(input.mode),{grants:rolesBefore});
      target='AN-PHAT';message='Đã đặt lại dữ liệu nghiệp vụ';break;
    }
    case 'order.create':{
      const kind=input.kind;
      ensure(kind==='buy'||kind==='sell','Chọn đơn mua hoặc đơn bán.');
      const quantity=integer(input.quantity,1,1000000), price=integer(input.price);
      ensure(quantity*price<=MAX,'Giá trị đơn vượt giới hạn 1.000 tỷ đồng.');
      target=id(state,kind==='buy'?'DM':'DB');
      state.orders.push({id:target,kind,quantity,price,...orderInputs(state,kind,input),branch:b,warehouse:stockForBranch[b],receipts:[],owner:code,ownerActor:actor.identity,status:'review'});
      message='Đã gửi đơn vào hàng đợi phê duyệt';break;
    }
    case 'order.revise':case 'order.submit':case 'order.approve':case 'order.return':{
      const order=atScope(state.orders,input.id,actor);
      target=order.id;
      if(action==='order.revise'||action==='order.submit'){
        ensure(orderStatus(order)==='returned'&&owns(order,actor),'Chỉ người lập được bổ sung đơn đã trả.',403);
        if(action==='order.revise'){
          const quantity=integer(input.quantity,1,1000000),price=integer(input.price);
          ensure(quantity*price<=MAX,'Giá trị đơn vượt giới hạn 1.000 tỷ đồng.');
          Object.assign(order,{quantity,price,...orderInputs(state,order.kind,{...input,dueDate:input.dueDate===undefined?order.dueDate:input.dueDate})});
          message='Đã lưu đơn đã bổ sung';
        }else{
          order.status='review';message='Đã gửi lại đơn để duyệt';
        }
      }else{
        ensure(orderStatus(order)==='review','Đơn đã được xử lý.',409);
        ensure(!owns(order,actor),'Người lập không được duyệt hoặc trả chính đơn của mình.',403);
        ensure(actor.grant.limit===null||order.quantity*order.price<=actor.grant.limit,'Giá trị vượt hạn mức duyệt đã cấp.',403);
        if(action==='order.return'){
          order.status='returned';order.returnReason=short(input.reason,250);
          message='Đã trả đơn về người lập';
        }else{
          order.status='approved';order.approvedBy=code;
          message='Đã duyệt và chuyển đơn sang thủ kho';
        }
      }
      break;
    }
    case 'invoice.import':{
      const parsed=parsePurchaseInvoice(input.xml);
      ensure(parsed,'XML sai cấu trúc mẫu, ngày hoặc thành tiền.');
      ensure(parsed.supplier==='NCC01'&&parsed.item==='BINH01','Nhà cung cấp hoặc mặt hàng chưa thuộc danh mục mẫu.');
      const invoices=state.invoices??(state.invoices=[]);
      const key=parsed.supplier+'/'+parsed.series+'/'+parsed.number;
      ensure(!invoices.some(row=>row.branch===b&&row.key===key),'Hóa đơn đã có trong chi nhánh.',409);
      target=id(state,'HDV');
      invoices.push({...parsed,id:target,branch:b,key,xml:input.xml,digest:input.digest,link:null,receivedAt:stamp()});
      message='Đã lưu XML đầu vào để đối chiếu';break;
    }
    case 'order.link-invoice':{
      const order=atScope(state.orders,input.id,actor);
      const receipt=order.receipts.find(row=>row.id===input.receipt);
      ensure(order.kind==='buy'&&receipt&&!receipt.docId,'Phiếu nhận chưa sẵn sàng để gắn hóa đơn.',409);
      const invoice=atScope(state.invoices??[],input.invoice,actor);
      ensure(!invoice.link||invoice.link.receipt===receipt.id,'Hóa đơn đã gắn với phiếu nhận khác.',409);
      const previous=(state.invoices??[]).find(row=>row.id===receipt.invoiceId);
      if(previous&&previous.id!==invoice.id)previous.link=null;
      receipt.invoiceId=invoice.id;
      receipt.invoice=invoice.quantity;
      invoice.link={order:order.id,receipt:receipt.id};
      target=invoice.id;message='Đã gắn hóa đơn với phiếu nhận';break;
    }
    case 'warehouse.confirm':{
      const order=atScope(state.orders,input.id,actor);
      ensure(orderStatus(order)==='approved','Đơn chưa được duyệt để giao nhận.',409);
      ensure(input.warehouse===order.warehouse,'Kho xác nhận không nằm trong quyền của tài khoản.',403);
      const remaining=order.quantity-order.receipts.reduce((sum,r)=>sum+r.quantity,0);
      const quantity=integer(input.quantity,1,Math.max(1,remaining));
      ensure(remaining>=quantity,'Số thực tế vượt phần còn lại của đơn.',409);
      if(order.kind==='sell'){
        const ledger=viewLedger(state,b);
        const reserved=pendingDispatchUnits(state,b,order.itemId,ledger);
        ensure(stockForItem(ledger,order.itemId).units-reserved>=quantity,'Kho không đủ hàng khả dụng để xác nhận giao.',409);
      }
      target=id(state,order.kind==='buy'?'PN':'PX');
      order.receipts.push({id:target,quantity,remark:input.remark?short(input.remark):'',invoice:null,docId:null});
      message='Đã bàn giao số thực tế cho kế toán';break;
    }
    case 'warehouse.count':{
      ensure(input.warehouse===stockForBranch[b],'Kho không thuộc phạm vi.',403);
      const item=state.catalog?.items.find(row=>row.id===input.itemId);
      ensure(!state.catalog||item,'Chọn mặt hàng cần kiểm kê.');
      const ledger=viewLedger(state,b);
      const {version,lastDate}=stockActivity(ledger,item?.id);
      const defaultDay=suggestedDate(state);
      const date=postingDate(state,input.date??(lastDate>defaultDay?lastDate:defaultDay));
      ensure(date>=lastDate,'Ngày kiểm kê phải từ ngày phát sinh kho gần nhất trở đi.');
      const quantity=integer(input.quantity,0,1000000),expected=stockForItem(ledger,item?.id).units;
      target=id(state,'KK');
      state.counts.push({id:target,branch:b,warehouse:input.warehouse,...(item?{itemId:item.id,itemCode:item.code,itemName:item.name,unit:item.unit}:{}),
        quantity,expected,delta:quantity-expected,date,stockVersion:version,time:stamp()});
      message='Đã lưu biên bản kiểm kê kho';break;
    }
    case 'warehouse.adjust':{
      const row=atScope(state.counts,input.id,actor);
      ensure(row.delta!==0&&!row.adjustmentId,'Biên bản không có chênh lệch cần lập hoặc đã có chứng từ.',409);
      const ledger=viewLedger(state,b);
      requireCurrentAdjustment(state,actor,row,ledger);
      const date=postingDate(state,input.date??row.date);
      ensure(date>=row.date,'Ngày hạch toán phải từ ngày kiểm kê trở đi.');
      const quantity=Math.abs(row.delta);
      const value=row.delta>0?integer(input.value):averageStockValue(stockForItem(ledger,row.itemId),quantity);
      const adjustmentValue=integer(value,row.delta>0?1:0);
      const description=short(input.reason,250);
      target=id(state,'DC');
      state.docs.push({id:target,kind:row.delta>0?'adjustIn':'adjustOut',date,quantity,adjustmentValue,description,
        itemId:row.itemId,itemCode:row.itemCode,itemName:row.itemName,unit:row.unit,warehouse:row.warehouse,
        branch:b,owner:code,ownerActor:actor.identity,countId:row.id,party:'Kiểm kê kho',status:'draft'});
      row.adjustmentId=target;
      message='Đã lập nháp điều chỉnh từ '+row.id;break;
    }
    case 'warehouse.settle':{
      const source=atScope(state.docs,input.id,actor);
      ensure(source.status==='posted'&&isStockAdjustment(source.kind),'Chỉ xử lý chứng từ điều chỉnh kiểm kê đã ghi sổ.',409);
      const methods=varianceMethods[source.kind];
      ensure(Array.isArray(input.allocations)&&input.allocations.length>=1&&input.allocations.length<=methods.length,
        'Chọn ít nhất một khoản xử lý hợp lệ.');
      const used=new Set();
      const allocations=input.allocations.map(line=>{
        const method=methods.find(entry=>entry.account===line?.account);
        ensure(method&&!used.has(method.account),'Tài khoản xử lý sai hoặc trùng trong quyết định.');
        used.add(method.account);
        return {account:method.account,value:integer(line.value),
          ...(method.requiresParty?{party:short(line.party,100)}:{})};
      });
      const doc={kind:'varianceClear',varianceSource:source.id,varianceKind:source.kind,decision:short(input.decision,60),
        date:postingDate(state,input.date),quantity:1,allocations,description:short(input.reason,250),
        itemId:source.itemId,itemCode:source.itemCode,itemName:source.itemName,warehouse:source.warehouse,
        branch:b,owner:code,ownerActor:actor.identity,party:'Xử lý kiểm kê',status:'draft'};
      verifyVarianceSource(state.docs,doc,actor);
      target=id(state,'XL');
      doc.id=target;
      state.docs.push(doc);
      message='Đã lập nháp xử lý từ '+source.id;break;
    }
    case 'warehouse.cash':{
      allowed(actor,'cash.request');
      const decision=atScope(state.docs,input.id,actor);
      const line=varianceCashLine(decision);
      ensure(line,'Quyết định chưa ghi sổ hoặc không có khoản phải thu, phải trả khác.',409);
      const kind=line.account==='1388'?'receive':'pay';
      const ledger=viewLedger(state,b);
      const doc={kind,varianceDecision:decision.id,varianceAccount:line.account,party:line.party,
        date:postingDate(state,input.date),price:integer(input.amount),quantity:1,
        receiptRef:short(input.receiptRef,60).toUpperCase(),description:short(input.reason,250),
        channel:'cash',branch:b,owner:code,ownerActor:actor.identity,status:'draft'};
      const failure=varianceCashIssue(ledger.docs,doc);
      ensure(!failure,failure,409);
      target=id(state,kind==='receive'?'PT':'PC');
      doc.id=target;
      state.docs.push(doc);
      message='Đã lập nháp phiếu '+(kind==='receive'?'thu bồi thường':'chi phải trả khác');break;
    }
    case 'warehouse.void-adjustment':{
      const doc=atScope(state.docs,input.id,actor);
      ensure((isStockAdjustment(doc.kind)||doc.kind==='varianceClear'||doc.varianceDecision)&&!doc.verified&&['draft','review','approved'].includes(doc.status),
        'Chỉ hủy chứng từ kiểm kê chưa ghi sổ.',409);
      if(isStockAdjustment(doc.kind)){
        const row=atScope(state.counts,doc.countId,actor);
        ensure(row.adjustmentId===doc.id&&!row.resolved,'Biên bản đã xử lý hoặc không còn liên kết.',409);
        row.adjustmentId=null;
      }
      doc.voidReason=short(input.reason,250);doc.status='void';
      target=doc.id;message='Đã hủy chứng từ kiểm kê chưa ghi sổ · '+doc.voidReason;break;
    }
    case 'warehouse.resolve':{
      const row=atScope(state.counts,input.id,actor);
      ensure(row.delta!==0&&!row.resolved&&!row.adjustmentId,'Biên bản đã xử lý hoặc đang có chứng từ điều chỉnh.');
      row.reason=short(input.reason,250);row.resolved=true;target=row.id;message='Đã lưu giải trình kiểm kê';
      break;
    }
    case 'order.invoice':case 'order.draft':{
      const order=atScope(state.orders,input.id,actor);
      const receipt=order.receipts.find(row=>row.id===input.receipt);
      ensure(receipt&&!receipt.docId,'Phiếu giao nhận đã được dùng hoặc không tồn tại.',409);
      target=receipt.id;
      if(action==='order.invoice'){
        ensure(order.kind==='buy','Chỉ đơn mua dùng bảng đối chiếu hóa đơn đầu vào.');
        ensure(!receipt.invoiceId,'Số hóa đơn đã lấy từ XML. Gắn hóa đơn khác để thay đổi.',409);
        receipt.invoice=integer(input.quantity,0,1000000);
        message='Đã lưu số trên hóa đơn mua';
      }else{
        if(order.kind==='buy'){
          ensure(receipt.invoice===receipt.quantity,'Hóa đơn chưa khớp số thực nhận.',409);
          if(receipt.invoiceId){
            const invoice=atScope(state.invoices??[],receipt.invoiceId,actor);
            ensure(invoice.price===order.price,'Đơn giá hóa đơn chưa khớp đơn mua.',409);
          }
        }
        const doc=createDoc(state,actor,{date:order.date,quantity:receipt.quantity,price:order.price,description:'Từ '+order.id+' · '+receipt.id+(receipt.invoiceId?' · '+receipt.invoiceId:'')},{kind:order.kind,party:order.party,order,origin:receipt.id});
        receipt.docId=doc.id;target=doc.id;message='Đã lập nháp từ phiếu giao nhận';
      }
      break;
    }
    case 'doc.save':{
      ensure(['receive','pay'].includes(input.kind),'Mua và bán được lập từ đơn và phiếu giao nhận.');
      if(input.channel==='cash')allowed(actor,'cash.request');
      const doc=createDoc(state,actor,{...input,quantity:1});
      target=doc.id;message='Đã lưu nháp phiếu thu/chi';break;
    }
    case 'doc.revise':case 'doc.cancel':{
      const doc=atScope(state.docs,input.id,actor);
      ensure(owns(doc,actor)&&doc.status==='draft'&&doc.kind!=='payroll','Chỉ người lập được sửa hoặc hủy bản nháp của mình.',403);
      target=doc.id;
      if(action==='doc.cancel'){
        if(isStockAdjustment(doc.kind)){
          const count=atScope(state.counts,doc.countId,actor);
          if(count.adjustmentId===doc.id)count.adjustmentId=null;
          doc.status='void';doc.voidReason='Người lập hủy bản nháp';
          message='Đã hủy bản nháp điều chỉnh';break;
        }
        if(doc.kind==='varianceClear'||doc.varianceDecision){
          doc.status='void';doc.voidReason='Người lập hủy bản nháp';
          message='Đã hủy bản nháp xử lý chênh lệch';break;
        }
        if(doc.origin){
          const receipt=state.orders.flatMap(order=>order.receipts).find(row=>row.docId===doc.id);
          if(receipt)receipt.docId=null;
        }
        doc.status='void';
        doc.cancelledDraftAt=stamp();
        doc.voidReason='Người lập hủy bản nháp';
        message='Đã hủy bản nháp và giữ để có thể phục hồi';
      }else{
        doc.description=short(input.description,250);
        if(doc.varianceDecision){
          const price=integer(input.amount);
          const failure=varianceCashIssue(viewLedger(state,b).docs,{...doc,price});
          ensure(!failure,failure,409);
          doc.price=price;
        }else if(doc.kind==='receive'||doc.kind==='pay'){
          const source=atScope(debtSources(viewLedger(state,b)),doc.link,actor);
          const price=integer(input.amount);
          ensure(price<=openAmount(viewLedger(state,b),source),'Số tiền vượt công nợ còn lại.');
          doc.price=price;
        }
        message='Đã lưu nội dung bổ sung';
      }
      break;
    }
    case 'doc.restore':{
      const doc=atScope(state.docs,input.id,actor);
      ensure(owns(doc,actor),'Chỉ người lập được phục hồi bản nháp của mình.',403);
      ensure(doc.status==='void'&&doc.cancelledDraftAt,'Chứng từ không có bản nháp có thể phục hồi.',409);
      postingDate(state,doc.date);
      if(doc.kind==='receive'||doc.kind==='pay'){
        if(doc.channel==='cash')allowed(actor,'cash.request');
        const ledger=viewLedger(state,b);
        const source=atScope(debtSources(ledger),doc.link,actor);
        ensure(source.kind===(doc.kind==='receive'?'sell':'buy')&&sameParty(doc,source)&&
          doc.date>=source.date&&amount(doc)<=openAmount(ledger,source),'Công nợ nguồn đã thay đổi. Kiểm tra trước khi lập phiếu mới.',409);
      }else{
        const order=state.orders.find(row=>row.branch===b&&row.receipts.some(receipt=>receipt.id===doc.origin));
        const receipt=order?.receipts.find(row=>row.id===doc.origin);
        ensure(receipt&&!receipt.docId&&orderStatus(order)==='approved'&&order.kind===doc.kind&&
          order.price===doc.price&&receipt.quantity===doc.quantity,'Phiếu giao nhận đã được dùng hoặc dữ liệu nguồn đã thay đổi.',409);
        if(doc.kind==='buy'){
          ensure(receipt.invoice===receipt.quantity,'Hóa đơn chưa khớp số thực nhận.',409);
          if(receipt.invoiceId){
            const invoice=atScope(state.invoices??[],receipt.invoiceId,actor);
            ensure(invoice.price===order.price,'Đơn giá hóa đơn chưa khớp đơn mua.',409);
          }
        }
        receipt.docId=doc.id;
      }
      doc.status='draft';
      delete doc.cancelledDraftAt;
      delete doc.voidReason;
      target=doc.id;message='Đã phục hồi về bản nháp';break;
    }
    case 'doc.submit':case 'doc.approve':case 'doc.return':case 'doc.post':{
      const doc=atScope(state.docs,input.id,actor);
      target=doc.id;
      if(action==='doc.submit'){
        ensure(doc.status==='draft'&&owns(doc,actor),'Chỉ người lập được gửi bản nháp của mình.',403);
        doc.status='review';message='Đã gửi hồ sơ vào hàng đợi duyệt';
      }else if(action==='doc.approve'||action==='doc.return'){
        ensure(doc.status==='review'&&!owns(doc,actor),'Cần người duyệt độc lập với người lập.',403);
        ensure(doc.kind!=='payroll'||code==='KTT','Hồ sơ lương chỉ đi theo tuyến kế toán trưởng.',403);
        ensure(actor.grant.limit===null||amount(doc)<=actor.grant.limit,'Giá trị vượt hạn mức duyệt đã cấp.',403);
        if(action==='doc.return'){
          doc.returnReason=short(input.reason,250);
          doc.status='draft';message='Đã trả về người lập để bổ sung';
        }else{
          doc.status='approved';doc.approvedBy=code;message='Đã duyệt hồ sơ';
        }
      }else{
        postDocument(state,actor,doc);message='Đã ghi sổ chứng từ';
      }
      break;
    }
    case 'bank.sample':{
      ensure(b==='CN01','Bộ sao kê An Phát chỉ áp dụng CN01.',403);
      for(const row of bankSample)if(!state.bank.some(old=>old.branch===b&&old.ref===row.ref))state.bank.push({...row,branch:b,linked:null});
      target='NH01';message='Đã rà và nạp các dòng sao kê mẫu còn thiếu';break;
    }
    case 'bank.add':{
      const ref=short(input.ref,42).toUpperCase();
      ensure(!state.bank.some(row=>row.branch===b&&row.ref===ref),'Mã sao kê đã có trong chi nhánh.',409);
      ensure(['receive','pay'].includes(input.kind),'Chọn chiều thu hoặc chi.');
      const date=postingDate(state,input.date);
      state.bank.push({ref,branch:b,kind:input.kind,...catalogParty(state,input.kind==='receive'?'customer':'supplier',input,date),date,amount:integer(input.amount),linked:null});
      target=ref;message='Đã nhập dòng sao kê';break;
    }
    case 'bank.import':{
      ensure(Array.isArray(input.rows)&&input.rows.length>=1&&input.rows.length<=statementLimit,
        'Mỗi lần nhập cần từ 1 đến '+statementLimit+' dòng sao kê.');
      const file=short(input.file,80);
      ensure(!/[\u0000-\u001f\u007f/\\]/.test(file)&&/\.(csv|xlsx)$/i.test(file),'Tên tệp sao kê không hợp lệ.');
      const result=inspectBankBatch(input.rows,{period:accountingPeriod(state),catalog:state.catalog,
        existing:state.bank.filter(row=>row.branch===b)});
      const issueIndex=result.findIndex(row=>row.status!=='ready'&&row.status!=='duplicate');
      if(issueIndex>=0){
        const issue=result[issueIndex];
        throw new WorkspaceError('Giao dịch thứ '+(issueIndex+1)+'. '+issue.message,issue.status==='conflict'?409:422);
      }
      const ready=result.flatMap(row=>row.status==='ready'?[row.row]:[]);
      const skipped=result.length-ready.length;
      if(!ready.length)return {target:null,message:'Tất cả '+skipped+' giao dịch đã có. Không có dòng mới.'};
      target=id(state,'SK');
      const importedAt=stamp();
      state.bank.push(...ready.map(row=>({...row,branch:b,linked:null,importBatch:target,importFile:file,importedAt})));
      message='Đã nhập '+ready.length+' dòng sao kê. Bỏ qua '+skipped+' dòng đã có.';
      break;
    }
    case 'bank.checkpoint':{
      const date=postingDate(state,input.date);
      const balance=integer(input.balance,-1e15,1e15);
      const reference=input.reference===undefined||input.reference===''?'':short(input.reference,120);
      ensure(!/[\u0000-\u001f\u007f]/.test(reference),'Nguồn số dư phải nằm trên một dòng.');
      state.bankCheckpoints??={};
      const checkpoints=state.bankCheckpoints[b]??(state.bankCheckpoints[b]={});
      const old=checkpoints[date];
      target='NH01-'+date;
      if(old&&old.balance===balance&&old.reference===reference)
        return {target,message:'Số dư đối chiếu đã được lưu.'};
      checkpoints[date]={date,balance,reference,by:access?.name??actor.role.person,at:stamp()};
      message=(old?'Đã cập nhật số dư ngân hàng ngày ':'Đã lưu số dư ngân hàng ngày ')+date+' · '+balance+' ₫';
      break;
    }
    case 'bank.propose':case 'bank.confirm':case 'bank.post':{
      const row=atScope(state.bank,input.ref,actor,'ref');
      ensure(!row.linked,'Sao kê đã được ghép.',409);
      const ledger=viewLedger(state,b);
      const mode=action==='bank.confirm'?'existing':action==='bank.post'?'new':input.mode;
      ensure(mode==='existing'||mode==='new','Chọn phương án xử lý.');
      const source=atScope(mode==='new'?debtSources(ledger):state.docs,input.source,actor);
      ensure(source.status==='posted'&&sameParty(source,row),'Nguồn chưa ghi sổ hoặc khác đối tác.');
      if(mode==='existing'){
        ensure(source.kind===row.kind&&source.date===row.date&&amount(source)===row.amount&&source.channel!=='cash'&&
          !state.bank.some(item=>item.branch===b&&item.linked===source.id),'Phiếu đã ghi không khớp sao kê hoặc đã được nối.');
      }else{
        ensure(source.kind===(row.kind==='receive'?'sell':'buy')&&openAmount(ledger,source)>=row.amount&&source.date<=row.date,'Không đủ công nợ hoặc ngày giao dịch chưa phù hợp.');
        const existing=posted(ledger).some(doc=>doc.kind===row.kind&&sameParty(doc,row)&&doc.date===row.date&&amount(doc)===row.amount&&doc.channel!=='cash'&&
          !state.bank.some(item=>item.branch===b&&item.linked===doc.id));
        ensure(!existing,'Đã có phiếu cùng ngày, đối tác và số tiền. Rà hoặc ghép phiếu đã ghi trước.',409);
      }
      target=row.ref;
      if(action==='bank.propose'){
        row.proposal={mode,source:source.id,by:code,byActor:actor.identity};message='Đã chuyển đề xuất đối chiếu';
      }else if(mode==='existing'){
        row.linked=source.id;row.proposal=null;message='Đã ghép phiếu đã ghi, số dư được giữ nguyên';
      }else{
        if(access)ensure(row.proposal?.mode==='new'&&row.proposal.source===source.id&&row.proposal.byActor&&row.proposal.byActor!==actor.identity,
          'Cần đề xuất khớp từ một người khác trước khi ghi khoản thanh toán.',403);
        const doc=createDoc(state,actor,{source:source.id,date:row.date,price:row.amount,description:'Đối chiếu sao kê '+row.ref},{kind:row.kind,origin:row.ref});
        doc.status='approved';doc.approvedBy=code;doc.bankRef=row.ref;
        postDocument(state,actor,doc);row.linked=doc.id;row.proposal=null;message='Đã ghi khoản thanh toán và ghép sao kê';
      }
      if(action!=='bank.propose')auditDocument=row.linked;
      break;
    }
    case 'cash.verify':{
      const doc=atScope(state.docs,input.id,actor);
      ensure(doc.channel==='cash'&&doc.status==='approved'&&!doc.verified,'Phiếu quỹ chưa đến bước xác nhận hoặc đã xác nhận.',409);
      ensure(!owns(doc,actor),'Người lập không xác nhận tiền trên chính phiếu của mình.',403);
      ensure(integer(input.actual)===amount(doc),'Tiền thực tế khác số duyệt. Cần xử lý chênh trước.');
      if(doc.kind==='pay'||doc.varianceDecision){
        const ledger=viewLedger(state,b);
        if(doc.varianceDecision){
          const failure=issue(ledger,doc);
          ensure(!failure,failure,409);
        }
        if(doc.kind==='pay')ensure(summary(ledger).fund-verifiedCashOut(ledger)>=amount(doc),
          'Quỹ không đủ sau khi trừ các phiếu chi đã xác nhận chờ ghi sổ.',409);
      }
      doc.verified=true;doc.cashVerifier=code;target=doc.id;message='Đã xác nhận tiền thực tế, chờ ghi sổ';break;
    }
    case 'cash.count':{
      const actual=integer(input.actual,0),expected=summary(viewLedger(state,b)).fund;
      target=id(state,'KQ');
      state.cashCounts.push({id:target,branch:b,actual,expected,delta:actual-expected,remark:input.remarks?short(input.remarks):'',resolved:false});
      message='Đã lưu biên bản quỹ';break;
    }
    case 'cash.resolve':{
      const count=atScope(state.cashCounts,input.id,actor);
      ensure(count.delta!==0&&!count.resolved,'Biên bản không có chênh lệch đang mở.');
      count.reason=short(input.reason,250);count.resolved=true;target=count.id;message='Đã ghi lý do xử lý chênh quỹ';break;
    }
    case 'period.lock':{
      ensure(checks(state,b).every(row=>row.count===0),'Còn mục phải xử lý trong bảng kiểm.',409);
      state.closed[b]={when:stamp(),by:code,sums:summary(viewLedger(state,b))};
      state.locked[b]=true;target=accountingPeriod(state);message='Đã khóa kỳ và lưu mốc báo cáo';break;
    }
    case 'period.request':{
      ensure(state.locked[b]&&!state.reopen.some(row=>row.branch===b&&['review','approved'].includes(row.status)),'Kỳ đang mở hoặc đã có hồ sơ mở kỳ.');
      target=id(state,'MK');state.reopen.push({id:target,branch:b,reason:short(input.reason,250),owner:code,ownerActor:actor.identity,status:'review'});
      message='Đã gửi yêu cầu mở lại kỳ';break;
    }
    case 'period.approve':case 'period.apply':{
      const row=atScope(state.reopen,input.id,actor);
      ensure(state.locked[b],'Kỳ hiện không khóa.');
      target=row.id;
      if(action==='period.approve'){
        ensure(row.status==='review'&&!owns(row,actor),'Phải duyệt độc lập với người yêu cầu.',403);
        row.status='approved';row.approver=code;message='Đã duyệt yêu cầu mở kỳ';
      }else{
        ensure(row.status==='approved','Yêu cầu mở lại cần được duyệt.',409);
        row.status='applied';state.locked[b]=false;message='Đã mở lại kỳ. Bản chốt cũ vẫn được lưu';
      }
      break;
    }
    case 'evidence.ask.audit':case 'evidence.ask.management':{
      target=id(state,'YC');
      state.evidence.push({id:target,branch:b,owner:code,ownerActor:actor.identity,question:short(input.question,250),answer:null,time:stamp()});
      message='Đã gửi yêu cầu cho kế toán trưởng';break;
    }
    case 'evidence.resolve':{
      const row=atScope(state.evidence,input.id,actor);
      ensure(!row.answer,'Yêu cầu đã được phản hồi.',409);
      row.answer=short(input.answer,250);target=row.id;message='Đã trả lời và lưu vết';break;
    }
    case 'payroll.save':{
      const member=short(input.member,60),pay=integer(input.total,1,100000000);
      target=id(state,'LU');state.payroll.push({id:target,branch:b,month:accountingPeriod(state).split('-').reverse().join('/'),member,owner:code,ownerActor:actor.identity,total:pay,status:'draft'});
      message='Đã lưu bảng lương mẫu';break;
    }
    case 'payroll.submit':case 'payroll.prepare':{
      const row=atScope(state.payroll,input.id,actor);
      target=row.id;
      if(action==='payroll.submit'){
        ensure(row.status==='draft'&&(!access||owns(row,actor)),'Bảng đã được chuyển hoặc không do bạn lập.',409);
        row.status='submitted';message='Đã chuyển số tổng cho kế toán trưởng';
      }else{
        ensure(row.status==='submitted'&&(!access||!owns(row,actor)),'Bảng lương không còn ở hàng đợi hoặc cần người duyệt độc lập.',409);
        // The role can approve the aggregate; no personal fields enter the journal.
        const doc=createDoc(state,actor,{price:row.total,description:'Tổng hợp kỳ '+row.month},{kind:'payroll',origin:row.id});
        doc.owner='TL';doc.ownerActor=row.ownerActor??'TL';doc.status='approved';doc.approvedBy=code;
        row.docId=doc.id;row.status='prepared';target=doc.id;message='Đã duyệt và tạo phiếu lương tổng hợp chờ ghi sổ';
      }
      break;
    }
    case 'portal.reply':{
      const doc=atScope(state.docs,'BH-001',actor);
      ensure(doc.party==='Cà phê Mộc'&&doc.status==='posted','Hồ sơ chưa được chia sẻ.',403);
      const status=input.status;
      ensure(['confirmed','disputed'].includes(status),'Chọn nội dung phản hồi.');
      target=id(state,'PH');
      state.portalReplies.push({id:target,ref:doc.id,branch:b,status,note:short(input.note,240),time:stamp(),balance:openAmount(viewLedger(state,b),doc)});
      message='Đã gửi phản hồi đến kế toán phụ trách';break;
    }
    case 'integration.event':{
      const ref=short(input.ref,42).toUpperCase();
      const kind=input.kind;
      ensure(['invoice','statement'].includes(kind),'Chọn luồng sự kiện mẫu.');
      const old=state.events.find(row=>row.branch===b&&row.ref===ref);
      if(old){
        ensure(old.kind===kind,'Mã sự kiện đã dùng cho nội dung khác.',409);
        old.duplicates+=1;
        message='Đã nhận sự kiện lặp. Giữ một kết quả xử lý';
      }else{
        state.events.push({ref,kind,branch:b,status:'verified',duplicates:0,time:stamp()});
        message='Đã tiếp nhận và xác minh sự kiện mẫu';
      }
      target=ref;break;
    }
  }
  log(state,access?access.name+' · '+code:code,b,target,message,action,documentAuditActions.has(action)?target:auditDocument);
  return {target,message};
}

export function processDocumentBatch(state,code,input,access=null,{commit=false}={}){
  ensure(Object.hasOwn(documentBatchOperations,input.operation),'Chọn thao tác theo lô hợp lệ.');
  const {action,completed}=documentBatchOperations[input.operation];
  const actor=author(state,code,access);
  allowed(actor,policies[action]);
  requireOpen(state,actor);
  ensure(Array.isArray(input.entries)&&input.entries.length>=1&&input.entries.length<=documentBatchLimit,
    'Chọn từ 1 đến '+documentBatchLimit+' chứng từ.');
  ensure(input.entries.every(entry=>entry&&typeof entry.id==='string'&&entry.id.length<=60),'Có mã chứng từ không hợp lệ.');
  ensure(new Set(input.entries.map(entry=>entry.id)).size===input.entries.length,'Một chứng từ chỉ được xuất hiện một lần trong lô.');

  // Run the existing single-document transitions on a private snapshot.
  // Each step sees earlier changes in this batch, including reserved cash and posted balances.
  const next=structuredClone(state);
  const entries=input.entries.map(entry=>({entry,doc:atScope(next.docs,entry.id,actor)}));
  if(input.operation==='post')entries.sort((a,b)=>a.doc.date.localeCompare(b.doc.date));
  const items=[];
  const target=commit?'LO-'+crypto.randomUUID():null;
  for(const {entry,doc} of entries){
    try{
      perform(next,code,action,{id:doc.id,...(input.operation==='verify'?{actual:entry.actual}:{})},access);
      if(target)next.audit.at(-1).batch=target;
      items.push({id:doc.id,date:doc.date,kind:doc.kind,total:amount(doc)});
    }catch(error){
      if(!(error instanceof WorkspaceError))throw error;
      if(commit)throw new WorkspaceError(doc.id+' · '+error.message+' Lô chưa được lưu.',error.status);
      return {ok:false,failure:{id:doc.id,message:error.message},items};
    }
  }
  if(!commit)return {ok:true,items};

  const message=completed+' '+items.length+' chứng từ.';
  log(next,access?access.name+' · '+code:code,actor.branch,target,message,'documents.batch');
  Object.assign(state,next);
  return {target,message,items};
}
