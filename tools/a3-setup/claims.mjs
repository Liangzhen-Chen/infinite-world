import {registerSetupLoader} from './index.mjs';
import {object,text,alias,integer,keys,gap,rows,requireShape,known,eventSource} from './institutions.mjs';
import {accountKey,openLedger} from '../../server-plugin/ledger.mjs';
import {restoreCoinAccount} from '../../server-plugin/money.mjs';
import {changeItems} from '../../server-plugin/items.mjs';
import {BOOKED} from '../../server-plugin/stock.mjs';
import {restoreObligationSnapshot} from '../../server-plugin/obligation-runtime.mjs';
import {restoreCaseSnapshot,restoreDocumentSnapshot} from '../../server-plugin/law.mjs';
import {restoreInstitutionDocument} from '../../server-plugin/governance.mjs';

function loadAccounts(ctx,setup){
 const seen=new Set();
 rows(ctx,setup,'accounts',(row,item)=>{
  requireShape(keys(row,['owner','resource','purpose','balance','sourceEvent','seat','container','balanceMode'])&&text(row.owner)&&text(row.resource)&&text(row.purpose)&&integer(row.balance)&&[undefined,'ensure_existing'].includes(row.balanceMode),'invalid account snapshot');
  const owner=ctx.ref(row.owner),key=accountKey(owner,row.resource,row.purpose),source=eventSource(ctx,row.sourceEvent);
  requireShape(!seen.has(key),'duplicate account snapshot');seen.add(key);
  requireShape(source.verb==='opening_balance'&&source.payload.owner===owner&&source.payload.resource===row.resource&&source.payload.balance===row.balance,'opening balance source does not match account snapshot');
  requireShape(known(ctx,owner),'unknown account owner');
  if(row.container!==undefined){gap(ctx,item,'accounts','Container accounts are owned by the physical adapter');return;}
  if(row.resource==='coin_river')ctx.native(item,d=>restoreCoinAccount(d,ctx.engine,{...row,owner,seat:row.seat&&ctx.ref(row.seat),sourceEvent:ctx.ref(row.sourceEvent)},{origin:'initial'}));
  else{
   requireShape(row.purpose==='inventory'&&ctx.actor(owner)&&ctx.engine.world.items.some(i=>i.id===row.resource),'unsupported resource/account purpose or actor');
   ctx.native(item,d=>{
    const old=ctx.engine.quantity(d,owner,row.resource);
    if(row.balanceMode!=='ensure_existing')changeItems(d,ctx.engine,owner,row.resource,row.balance-old,{books:BOOKED});
    d.set(['ledger'],openLedger(ctx.engine,d.document));
   });
  }
 });
}
function loadCases(ctx,setup){rows(ctx,setup,'cases',(row,item)=>{
 requireShape(keys(row,['id','name','court','stage','parties','sourceEvent','judgmentEvent','appealDeadline','handlerOffice','defendant'])&&text(row.id)&&Array.isArray(row.parties),'invalid case snapshot');
 eventSource(ctx,row.sourceEvent);if(row.judgmentEvent)eventSource(ctx,row.judgmentEvent);
 if(ctx.native(item,d=>restoreCaseSnapshot(d,ctx.engine,{...row,court:ctx.ref(row.court),parties:row.parties.map(ctx.ref),defendant:row.defendant&&ctx.ref(row.defendant),handlerOffice:row.handlerOffice&&ctx.ref(row.handlerOffice),sourceEvent:ctx.ref(row.sourceEvent),judgmentEvent:row.judgmentEvent&&ctx.ref(row.judgmentEvent)},{origin:'initial'})))ctx.bindings[row.id]=row.id;
});}
function loadObligations(ctx,setup){rows(ctx,setup,'obligations',(row,item)=>{
 requireShape(keys(row,['id','name','kind','debtor','creditor','amount','paid','openedAt','dueAt','sourceEvent','terms'])&&alias(row.id)&&object(row.terms),'invalid old obligation');
 eventSource(ctx,row.sourceEvent);
 const terms=structuredClone(row.terms);
 for(const k of ['collateral','subject','case','judgmentEvent','collectionSite'])if(typeof terms[k]==='string')terms[k]=ctx.ref(terms[k]);
 if(ctx.native(item,d=>restoreObligationSnapshot(d,ctx.engine,{...row,debtor:ctx.ref(row.debtor),creditor:ctx.ref(row.creditor),sourceEvent:ctx.ref(row.sourceEvent),terms},{origin:'initial'})))ctx.bindings[row.id]=row.id;
});}
function loadDocuments(ctx,setup){rows(ctx,setup,'documents',(row,item)=>{
 requireShape(keys(row,['id','owner','sourceEvent','obligation','case','links','content','reviewed','valid','namedHolder','describes','public'])&&text(row.id)&&known(ctx,ctx.ref(row.owner))&&(row.links===undefined||Array.isArray(row.links)&&row.links.every(text)),'invalid document');
 eventSource(ctx,row.sourceEvent);for(const id of row.links??[])eventSource(ctx,id);
 if(typeof row.content==='string'){
  requireShape(keys(row,['id','owner','sourceEvent','content','valid','public']),'institutional text cannot override structured claim evidence');
  ctx.native(item,d=>restoreInstitutionDocument(d,ctx.engine,{...row,id:ctx.ref(row.id),owner:ctx.ref(row.owner),sourceEvent:ctx.ref(row.sourceEvent)},{origin:'initial'}));return;
 }
 ctx.native(item,d=>restoreDocumentSnapshot(d,ctx.engine,{...row,id:ctx.ref(row.id),owner:ctx.ref(row.owner),sourceEvent:ctx.ref(row.sourceEvent),obligation:row.obligation&&ctx.ref(row.obligation),case:row.case&&ctx.ref(row.case),links:(row.links??[]).map(ctx.ref),namedHolder:row.namedHolder&&ctx.ref(row.namedHolder),describes:row.describes&&ctx.ref(row.describes)},{origin:'initial'}));
});}
registerSetupLoader({fields:['accounts'],order:20,load:loadAccounts});
registerSetupLoader({fields:['cases'],order:25,load:loadCases});
// Physical originals load at 40; existing summons load at 80.
registerSetupLoader({fields:['obligations'],order:85,load:loadObligations});
registerSetupLoader({fields:['documents'],order:86,load:loadDocuments});
