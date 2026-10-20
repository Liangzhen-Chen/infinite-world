import {registerSetupLoader} from './index.mjs';
import {object,text,alias,integer,keys,gap,rows,requireShape,state,known,selector,eventSource} from './institutions.mjs';
import {accountKey,openLedger} from '../../server-plugin/ledger.mjs';
import {legacyMoney,mirrorPartyCoins,partyAccount} from '../../server-plugin/money.mjs';
import {changeItems} from '../../server-plugin/items.mjs';
import {BOOKED} from '../../server-plugin/stock.mjs';
import {openObligation} from '../../server-plugin/obligation-runtime.mjs';
import {obligationRow} from '../../server-plugin/obligation-state.mjs';

function loadAccounts(ctx,setup){
 const seen=new Set();
 rows(ctx,setup,'accounts',(row,item)=>{
  requireShape(keys(row,['owner','resource','purpose','balance','sourceEvent','seat','container','balanceMode'])&&text(row.owner)&&text(row.resource)&&text(row.purpose)&&integer(row.balance)&&[undefined,'ensure_existing'].includes(row.balanceMode),'invalid account snapshot');
  const owner=ctx.ref(row.owner),key=accountKey(owner,row.resource,row.purpose),source=eventSource(ctx,row.sourceEvent);
  requireShape(!seen.has(key),'duplicate account snapshot');seen.add(key);
  requireShape(source.verb==='opening_balance'&&source.payload.owner===owner&&source.payload.resource===row.resource&&source.payload.balance===row.balance,'opening balance source does not match account snapshot');
  requireShape(known(ctx,owner)||ctx.engine.rules.economy?.credit?.banks?.some(b=>b.id===owner),'unknown account owner');
  if(row.seat!==undefined)requireShape(ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.seat)),'unknown account seat');
  if(row.container!==undefined){gap(ctx,item,'accounts','缺少钱袋容器与原生现金账户绑定接点，不把容器现金复制到随身账户');return;}
  if(row.resource==='coin_river'){
   const nativeKey=partyAccount(ctx.engine,state(ctx),owner);
   if(key!==nativeKey){gap(ctx,item,'accounts',`缺少账户用途 ${row.purpose} 的原生开账/消费接点，不能合并为 ${nativeKey}`);return;}
   ctx.native(item,d=>{
    const old=legacyMoney(ctx.engine,d.get('state')).get(key)??0;
    if(row.balanceMode!=='ensure_existing')mirrorPartyCoins(d,ctx.engine,owner,row.balance-old,ctx.ref(row.sourceEvent),'a3-institutions');
    d.set(['ledger'],openLedger(ctx.engine,d.document));
   });
  }else{
   requireShape(row.purpose==='inventory'&&ctx.actor(owner)&&ctx.engine.world.items.some(i=>i.id===row.resource),'unsupported resource/account purpose or actor');
   ctx.native(item,d=>{
    const old=ctx.engine.quantity(d,owner,row.resource);
    if(row.balanceMode!=='ensure_existing')changeItems(d,ctx.engine,owner,row.resource,row.balance-old,{books:BOOKED});
    d.set(['ledger'],openLedger(ctx.engine,d.document));
   });
  }
 });
}
function loadObligations(ctx,setup){
 rows(ctx,setup,'obligations',(row,item)=>{
  requireShape(keys(row,['id','name','kind','debtor','creditor','amount','paid','openedAt','dueAt','sourceEvent','terms'])&&alias(row.id)&&['loan','deposit','fine','delivery','upkeep'].includes(row.kind)&&text(row.debtor)&&text(row.creditor)&&row.debtor!==row.creditor&&integer(row.amount)&&integer(row.paid)&&row.paid<=row.amount&&integer(row.openedAt)&&row.openedAt<=state(ctx).minute&&integer(row.dueAt)&&row.dueAt>=row.openedAt&&object(row.terms),'invalid old obligation');
  const source=eventSource(ctx,row.sourceEvent),debtor=ctx.ref(row.debtor),creditor=ctx.ref(row.creditor);
  requireShape(source.verb==='obligation_opened'&&source.payload.subject===row.id&&source.payload.debtor===debtor&&source.payload.creditor===creditor&&source.payload.amount===row.amount,'obligation source does not match claim');
  requireShape(!obligationRow(state(ctx),row.id)&&!Object.hasOwn(ctx.bindings,row.id),'obligation already exists');
  if(row.kind!=='loan'||row.paid!==0||row.terms.collateral!==undefined){gap(ctx,item,'obligations',`缺少 ${row.kind}${row.terms.collateral?' 质押':''} 旧快照导入接点（须保留原生存款/罚款/交付/维持投影及已付额），不能重做本次交易`);return;}
  requireShape(known(ctx,debtor)&&known(ctx,creditor),'unknown obligation party');
  if(ctx.native(item,d=>{
   const now=d.get('state','minute');d.set(['state','minute'],row.openedAt);
   openObligation(d,ctx.engine,{id:row.id,kind:'loan',category:'debt',legacyRecord:row.id,actor:debtor,debtor,creditor,amount:row.amount,deadline:row.dueAt,terms:structuredClone(row.terms),...(row.name?{name:row.name}:{}),source:ctx.ref(row.sourceEvent)},`${row.id}:setup`);
   d.set(['state','minute'],now);
  }))ctx.bindings[row.id]=row.id;
 });
}

// These consumers have narrower native records than the corpus contract. A
// historical emit is not a substitute for their domain state. Validate first,
// then report the precise missing import writer instead of fabricating records.
function loadDocuments(ctx,setup){rows(ctx,setup,'documents',(row,item)=>{
 requireShape(keys(row,['id','owner','sourceEvent','obligation','case','links','content','reviewed','valid','namedHolder','describes'])&&text(row.id)&&known(ctx,ctx.ref(row.owner))&&[undefined,true,false].includes(row.reviewed)&&[undefined,true,false].includes(row.valid)&&(row.content===undefined||object(row.content))&&(row.links===undefined||Array.isArray(row.links)&&row.links.every(text)),'invalid document');
 eventSource(ctx,row.sourceEvent);for(const id of row.links??[])eventSource(ctx,id);
 const existing=state(ctx).itemInstances?.[ctx.ref(row.id)];
 if(!existing){gap(ctx,item,'documents','缺少同一 itemInstances 纸张的原生凭证/证据来源导入接点（不能另造第二张纸）');return;}
 gap(ctx,item,'documents','缺少既有纸张的 obligation/case/links/content 原生证据写入接点，不能预判采纳');
});}
function loadCases(ctx,setup){rows(ctx,setup,'cases',(row,item)=>{
 requireShape(keys(row,['id','name','court','stage','parties','sourceEvent','judgmentEvent','appealDeadline','handlerOffice','defendant'])&&text(row.id)&&ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.court))&&['judged','pending','execution','prosecution'].includes(row.stage)&&Array.isArray(row.parties)&&row.parties.length>0&&row.parties.every(p=>known(ctx,ctx.ref(p)))&&(row.appealDeadline===undefined||integer(row.appealDeadline)),'invalid case');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='case_registered'&&source.payload.subject===row.id&&source.payload.court===ctx.ref(row.court),'case registration source mismatch');
 if(row.judgmentEvent!==undefined){const judgment=eventSource(ctx,row.judgmentEvent);requireShape(judgment.verb==='judged'&&judgment.payload.subject===row.id,'judgment source mismatch');}
 gap(ctx,item,'cases','缺少已登记案件阶段、判决/上诉期限的原生快照导入接点；registerIncident 需要题面未提供的罪名/法典，不能补造');
});}

const loaders={accounts:loadAccounts,obligations:loadObligations,documents:loadDocuments,cases:loadCases};
registerSetupLoader({fields:Object.keys(loaders),order:20,load(ctx,setup,fields){for(const field of fields)loaders[field](ctx,setup);}});
