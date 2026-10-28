import {registerSetupLoader,preludeOnly,PRELUDE_REASON} from './index.mjs';
import {rows,keys,text,integer,requireShape,known,eventSource,gap} from './institutions.mjs';
import {accountKey,openLedger} from '../../server-plugin/ledger.mjs';
import {changeItems} from '../../server-plugin/items.mjs';
import {BOOKED} from '../../server-plugin/stock.mjs';
import {carryOverKg,packItemKg} from '../../server-plugin/carry.mjs';

// Opening inventory counts are plain item quantities. A coin_river balance, a case,
// an obligation or a document is a claim somebody holds: it exists only because a
// real action created it, so those forms report the prelude reason.
function loadAccounts(ctx,setup){
 const seen=new Set();
 rows(ctx,setup,'accounts',(row,item)=>{
  requireShape(keys(row,['owner','resource','purpose','balance','sourceEvent','seat','container','balanceMode'])&&text(row.owner)&&text(row.resource)&&text(row.purpose)&&integer(row.balance)&&[undefined,'ensure_existing'].includes(row.balanceMode),'invalid account snapshot');
  const owner=ctx.ref(row.owner),key=accountKey(owner,row.resource,row.purpose),source=eventSource(ctx,row.sourceEvent);
  requireShape(!seen.has(key),'duplicate account snapshot');seen.add(key);
  requireShape(source.verb==='opening_balance'&&source.payload.owner===owner&&source.payload.resource===row.resource&&source.payload.balance===row.balance,'opening balance source does not match account snapshot');
  requireShape(known(ctx,owner),'unknown account owner');
  if(row.container!==undefined){gap(ctx,item,'accounts','Container accounts are owned by the physical adapter');return;}
  if(row.resource==='coin_river'){ctx.unmet(item,PRELUDE_REASON);return;}
  requireShape(row.purpose==='inventory'&&ctx.actor(owner)&&ctx.engine.world.items.some(i=>i.id===row.resource),'unsupported resource/account purpose or actor');
  ctx.native(item,d=>{
   const old=ctx.engine.quantity(d,owner,row.resource);
   // A premise pack is held to the same carry rule as play (01 §1.2): too heavy is unmet, never exempt.
   const over=carryOverKg(d,ctx.engine,owner,(row.balance-old)*packItemKg(d,ctx.engine,owner,row.resource));
   if(over&&row.balanceMode!=='ensure_existing')throw Error(`前提行囊超出安全负重${over}公斤，01 §1.2`);
   if(row.balanceMode!=='ensure_existing')changeItems(d,ctx.engine,owner,row.resource,row.balance-old,{books:BOOKED});
   d.set(['ledger'],openLedger(ctx.engine,d.document));
  });
 });
}
registerSetupLoader({fields:['accounts'],order:20,load:loadAccounts});
// Physical originals load at 40; existing summons load at 80.
for(const [field,order] of [['cases',25],['obligations',85],['documents',86]])registerSetupLoader({fields:[field],order,load:(ctx,setup)=>preludeOnly(ctx,setup,field)});
