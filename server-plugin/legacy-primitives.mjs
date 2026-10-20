// Native adapters for programs that still execute through the old handlers.
// Never copy requested effects: the ledger journal and committed state are the
// evidence. The existing handlers remain the sole writers (no second payment).
import {parseAccount,isSource,isSink,openLedger} from './ledger.mjs';
import {readBodyState} from './primitives-body.mjs';
import {fixedUnits,fixedNumber} from './rx.mjs';
import {digest} from './storage.mjs';
import {reject} from './primitive-policy.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const at=(object,path)=>path.reduce((v,k)=>v?.[k],object);
export const legacyReceiptKey=id=>`primitive:${id}`;
export const legacyIdentity=(action,tool,args)=>digest({action:action.id,tool,args});

// transfer() ends every posting with a transfer-counter patch. Reading those
// boundaries preserves even A -> B -> A, and a purchase immediately consumed.
// Unlike net-balance inference, it also retains the actual source/sink/purpose.
export function legacyLedgerEffects(before,after,patches){
 const values=new Map();
 for(const part of ['accounts','flows'])for(const [key,value] of Object.entries(before.ledger?.[part]??{}))values.set(`${part}/${key}`,value);
 let pending=[],count=before.ledger?.transfers??0;
 const effects=[];
 for(const patch of patches){
  const [root,part,key]=patch.path;
  if(root!=='ledger')continue;
  if(['accounts','flows'].includes(part)&&patch.path.length===3){
   const slot=`${part}/${key}`,old=values.get(slot)??0,value=patch.op==='delete'?0:patch.value;
   values.set(slot,value);if(value!==old)pending.push({key,delta:value-old,part});
  }
  if(part!=='transfers'||patch.path.length!==2)continue;
  const debits=pending.filter(row=>row.part==='accounts'&&row.delta<0||row.part==='flows'&&isSource(parseAccount(row.key).owner));
  const credits=pending.filter(row=>row.part==='accounts'&&row.delta>0||row.part==='flows'&&isSink(parseAccount(row.key).owner));
  if(patch.value!==count+1||debits.length!==1||credits.length!==1||Math.abs(debits[0].delta)!==credits[0].delta||parseAccount(debits[0].key).resource!==parseAccount(credits[0].key).resource)
   reject('E-LEGACY-RECONCILE','Legacy posting does not reconcile with one resource transfer');
  effects.push({op:'transfer',from:debits[0].key,to:credits[0].key,resource:parseAccount(debits[0].key).resource,qty:credits[0].delta,ledgerTransfer:patch.value});
  count=patch.value;pending=[];
 }
 if(pending.length||count!==(after.ledger?.transfers??0))reject('E-LEGACY-RECONCILE','Unpaired legacy ledger writes');
 for(const part of ['accounts','flows'])for(const key of new Set([...Object.keys(before.ledger?.[part]??{}),...Object.keys(after.ledger?.[part]??{})]))
  if((values.get(`${part}/${key}`)??0)!==(after.ledger?.[part]?.[key]??0))reject('E-LEGACY-RECONCILE','Legacy receipt and account balance differ');
 return effects;
}

function stateEffect(op,fields,path,before,after){
 return {op,...fields,result:{path,before:structuredClone(at(before,path)??null),after:structuredClone(at(after,path)??null)}};
}
function rowChanges(before,patches,root,part){
 const rows=new Map(Object.entries(before[root]?.[part]??{})),out=[];
 for(const p of patches){
  if(p.path[0]!==root||p.path[1]!==part||p.path.length<3)continue;
  const id=p.path[2],old=rows.get(id);
  let row=p.op==='delete'?null:p.value;
  if(p.path.length>3){
   row=structuredClone(old??{});let parent=row;
   for(const key of p.path.slice(3,-1))parent=parent[key]??={};
   if(p.op==='delete')delete parent[p.path.at(-1)];else parent[p.path.at(-1)]=structuredClone(p.value);
  }
  rows.set(id,row);if(!same(old,row))out.push({id,old,row,path:[root,part,id]});
 }
 return out;
}
const actorPath=(s,id)=>id==='player'?['state','player']:s.npcs?.[id]?['state','npcs',id]:s.creatures?.[id]?['state','creatures',id]:null;
const kindOf=(engine,document,id)=>id==='player'||document.state.npcs?.[id]?'person':document.state.creatures?.[id]?'creature':document.holdings?.entities?.[id]?.kind??engine.byId.get(id)?.kind??null;

export function adaptLegacyExecution(engine,before,d,{action,tool,args,eventId,result,requested=[],persist=true}){
 const after=d.document,b=before.state,a=after.state,source={kind:'catalog',id:action.id};
 const receipt={eventId,actor:'player',source,routed:action.id,status:'committed',applied:[],trimmed:[],check:null,consequences:[],narrate:{must:[],mustNot:[]},cost:{time:a.minute-b.minute,resources:[],...(result.cost&&typeof result.cost==='object'?{body:result.cost.body}: {})}};
 if(tool==='craft'&&result.clipped>0)receipt.trimmed.push({slot:'batches',requested:result.requestedBatches,applied:result.batches,reason:'按实际材料、工坊费、工具、工时及行动能力裁剪制造批数'});
 const add=(effect,role='outcome')=>{
  const target=effect.target??effect.entity??effect.subject;
  const row={...effect,index:receipt.applied.length,source,role,appliedEvent:eventId,actedAs:effect.actedAs??null,...(target?{signatureKind:effect.signatureKind??kindOf(engine,after,target)}:{})};
  receipt.applied.push(row);return row;
 };
 const involved=new Set(['player']);
 for(const value of [result.target,result.buyer,result.seller,result.teacher,result.dialogue?.npc,result.debt,result.obligation,args.target,args.subject,args.student,args.seller,args.buyer,args.promisor,args.promisee,args.summon]){
  if(typeof value!=='string')continue;
  // Runtime instruments/summons have canonical IDs outside the world catalog.
  if(b.obligations?.[value]||b.effects?.[value]||b.itemInstances?.[value])involved.add(value);
  try{involved.add(engine.resolve(value));}catch{/* A free text subject is not an entity. */}
 }
 const transfers=legacyLedgerEffects(before,after,d.patches);
 for(const effect of transfers){
  const owners=[parseAccount(effect.from).owner,parseAccount(effect.to).owner];
  if(owners.some(owner=>involved.has(owner))){
   const resourceTags=engine.byId.get(effect.resource)?.tags;
   add({...effect,...(resourceTags?.length?{resourceTags:[...resourceTags]}:{})});
  }
  // Autonomous postings stay internal, just like native time's world advance.
 }
 const posted=receipt.applied.filter(e=>e.op==='transfer');
 if(posted.length){
  // Opening adapters read the old state projections without changing them.
  // A journal alone is insufficient: the carried goods/purse must agree too.
  const projected=openLedger(engine,after);
  for(const key of new Set(posted.flatMap(e=>[e.from,e.to]))){
   const owner=parseAccount(key).owner;if(isSource(owner)||isSink(owner))continue;
   if((projected.accounts[key]??0)!==(after.ledger.accounts[key]??0))reject('E-LEGACY-RECONCILE','Legacy state projection and adopted resource transfer differ');
  }
 }
 const elapsed=a.minute-b.minute;
 if(elapsed&&tool==='time')add({op:'time',minutes:elapsed,mode:args.activity==='睡眠'?'sleep':'rest',...(args.until?{until:structuredClone(args.until)}:{}),result:{before:b.minute,after:a.minute}});
 // Cast's declared MP debit is a resource cost, not injury to the caster.
 // Require its actual native patch; a negative net delta alone is not proof.
 const manaCost=tool==='cast'&&Number.isSafeInteger(result.mpCost)&&result.mpCost>0&&d.patches.some(p=>p.op==='set'&&same(p.path,['state','player','mp'])&&p.value===b.player.mp-result.mpCost)?result.mpCost:0;
 const costs=[];
 if(manaCost)costs.push(add({op:'vital',target:'player',need:'mp',type:'resource:mp',delta:-manaCost,result:{path:['state','player','mp'],before:b.player.mp,after:b.player.mp-manaCost}}));
 for(const id of involved){
  const path=actorPath(a,id);if(!path)continue;
  const old=at(before,path),now=at(after,path);if(!old||!now)continue;
  for(const need of ['hp','mp']){
   // Combat lazily initializes NPC HP. Its actual starting HP comes from the
   // exchange, not from treating an absent projection as zero health.
   const initial=need==='hp'&&tool==='combat'?result.vitals?.[id]?.before:undefined;
   const was=initial??(id==='player'&&need==='mp'?old[need]-manaCost:old[need]),value=now[need];
   if(!Number.isFinite(was)||!Number.isFinite(value))continue;
   const delta=value-was;
   if(delta){
    const effect=stateEffect('vital',{target:id,need,type:delta<0?'harm':'heal',delta},[...path,need],before,after);
    effect.result.before=was;add(effect);
   }
  }
  if(old.status!==now.status)add(stateEffect('status',{target:id,status:now.status},[...path,'status'],before,after));
  // Native pet feeding uses care.hunger (inverse satiety), rather than the
  // humanoid body partition. Adopt only the actual committed reduction.
  if(tool==='pet'&&args.operation==='feed'&&id===result.target&&result.fed&&Number.isFinite(old.care?.hunger)&&Number.isFinite(now.care?.hunger)){
   const delta=old.care.hunger-now.care.hunger;
   if(delta>0)add({op:'vital',target:id,type:'body:satiety',need:'satiety',delta,result:{before:{value:100-old.care.hunger},after:{value:100-now.care.hunger}}});
  }
  for(const field of ['xp','level','attributes'])if(!same(old[field],now[field])){
   const change=stateEffect('fact.set',{entity:id,field,value:now[field]},[...path,field],before,after);
   const awards=id==='player'?Object.values(a.experienceLedger??{}).filter(row=>row.eventId===eventId&&!same(b.experienceLedger?.[row.source],row)):[];
   // 06 §6.3 / §6.10.3: experience is derived by progression, never an
   // executable fact.set(xp) proposal. Retain its real evidence as a consequence.
   if(awards.length)receipt.consequences.push({type:'progression',entity:id,field,value:now[field],result:change.result,awards:structuredClone(awards),reason:`${field}: ${JSON.stringify(old[field])} → ${JSON.stringify(now[field])}`});
   else add(change);
  }
  for(const need of ['stamina','satiety','hydration','fatigue']){
   if(!engine.world.primitiveTables?.body)continue;
   const initial=readBodyState(engine,before,id,need),value=readBodyState(engine,after,id,need);
   // Nutrition/sleep return the delta actually applied at the end of the span.
   // The preceding drain can cancel it in the end-to-end diff; keep both facts.
   const recovery=id==='player'?(result.nutrition?.[need]??result.cost?.sleep?.recovery?.[need]?.delta):undefined;
   const delta=recovery??fixedNumber(fixedUnits(value.value)-fixedUnits(initial.value));
   const was=recovery===undefined?initial:{...value,value:fixedNumber(fixedUnits(value.value)-fixedUnits(delta))};
   // Cost-managed body drains are already in cost.body. Time and meals expose
   // their actual need changes; a full/clamped need never invents a recovery.
   const written=!same(old.body?.[need],now.body?.[need]);
   if((delta||recovery!==undefined||written&&tool==='time')&&(tool==='time'||result.nutrition))add({op:'vital',target:id,type:`body:${need}`,need,delta,result:{before:was,after:value,...(!same(initial,was)?{initial}:{}),...(!delta?{clamped:true}: {})}});
  }
 }
 if(b.location!==a.location)add(stateEffect('move',{entity:'player',from:b.location,to:a.location,mode:args.mode??'walk'},['state','location'],before,after));
 // A removed native summon is gone even though it never lived in creatures.
 // Its real contract closure supplies the cause, not a requested transition.
 if(tool==='summon'&&args.operation==='dismiss'&&result.dismissed){
  const id=result.summon,old=b.effects?.[id],contract=old&&a.records?.[old.contract];
  if(old?.kind==='summon'&&!a.effects?.[id]&&contract?.ended!==undefined)
   add(stateEffect('transition',{entity:id,to:'gone',reason:'contract_ended',basis:'contract_ended',signatureKind:'creature'},['state','effects',id],before,after));
 }
 for(const [id,row] of Object.entries(a.effects??{})){
  if(same(b.effects?.[id],row)||!involved.has(row.target)&&!String(row.source??id).startsWith(eventId))continue;
  // 06 §6.3: the native summon instance and its real upkeep contract map to
  // create + obligation, not an untargeted status on the caster.
  if(row.kind==='summon'){
   if(!b.effects?.[id]){
    add(stateEffect('create',{entity:id,kind:'creature',template:row.summonType,owner:row.owner,location:row.location,expires:row.expires},['state','effects',id],before,after));
    const contract=a.records?.[row.contract];
    if(contract?.category==='summon_contract'&&contract.effect===id&&!b.records?.[row.contract])
     add(stateEffect('obligation.create',{id:row.contract,obligationKind:'upkeep',debtor:row.owner,creditor:id,from:row.owner,to:id,terms:contract.terms,expires:contract.expires},['state','records',row.contract],before,after));
   }
   continue;
  }
  add(stateEffect('status',{target:row.target,status:row.status??row.kind,power:row.power,duration:Math.max(0,(row.expires??a.minute)-a.minute)},['state','effects',id],before,after));
 }
 for(const [id,row] of Object.entries(a.inventory??{}))if(Number.isFinite(b.inventory?.[id]?.durability)&&row?.durability!==undefined&&row.durability!==b.inventory[id].durability)
  add(stateEffect('fact.set',{entity:id,field:'durability',value:row.durability},['state','inventory',id,'durability'],before,after));
 // Drying writes the carried item's moisture, not the entity fact partition.
 for(const [id,row] of Object.entries(a.inventory??{}))if(row?.moisture!==undefined&&!same(b.inventory?.[id]?.moisture,row.moisture))
  add(stateEffect('fact.set',{entity:id,field:'moisture',value:row.moisture},['state','inventory',id,'moisture'],before,after));
 // A research project is created at inception; it does not grant knowledge.
 if(tool==='research'&&args.operation==='start'&&result.project&&a.projects?.[result.project]&&!b.projects?.[result.project]){
  const row=a.projects[result.project];
  add(stateEffect('create',{entity:result.project,kind:'project',facts:{name:row.name,concept:row.concept,skills:row.skills},stage:row.stage},['state','projects',result.project],before,after));
 }

 // A failed lesson is an applied learning attempt, never a fabricated grant.
 for(const [id,lesson] of Object.entries(a.learning??{}))if(!same(b.learning?.[id],lesson)&&id===eventId)
  add(stateEffect('learn',{entity:'player',target:'player',subject:lesson.entity,learningSource:lesson.source?.id,mode:lesson.source?.type},['state','learning',id],before,after));
 // Teaching, practice, and old education programs may write knowledge directly.
 for(const [partition,owner] of [['skills','player'],['recipes','player'],['spells','player']])for(const [subject,row] of Object.entries(a[partition]??{})){
  if(same(b[partition]?.[subject],row)||receipt.applied.some(e=>e.op==='learn'&&e.subject===subject))continue;
  add(stateEffect('learn',{entity:owner,target:owner,subject,learningSource:row.source?.id??result.source?.id??args.source,mode:row.source?.type??'practice'},['state',partition,subject],before,after));
 }
 for(const [id,row] of Object.entries(a.npcs??{}))if(involved.has(id))for(const [subject,value] of Object.entries(row.skills??{})){
  if(same(b.npcs?.[id]?.skills?.[subject],value))continue;
  add(stateEffect('learn',{entity:id,target:id,subject,learningSource:'player',mode:'teacher'},['state','npcs',id,'skills',subject],before,after));
 }

 const relevant=row=>[row?.holder,row?.subject,row?.debtor,row?.creditor].some(id=>involved.has(id));
 const disposed=new Set();
 for(const change of result.dispositions??[]){
  const old=before.holdings?.rows?.[change.holding],closed=after.holdings?.rows?.[change.holding],next=after.holdings?.rows?.[change.newHolding];
  if(!old||old.until!==undefined||closed?.until===undefined||!next||next.subject!==old.subject||next.holder!==change.to||next.source!==old.source)continue;
  disposed.add(old.id);disposed.add(next.id);
  add({op:'holding.transfer',holding:old.id,newHolding:next.id,holdingKind:old.kind,subject:old.subject,holder:old.holder,newHolder:next.holder,tags:change.tags??[],actedAs:change.actedAs??null,result:{path:['holdings','rows',old.id],before:structuredClone(old),closed:structuredClone(closed),after:structuredClone(next)}});
 }
 for(const {id,row,old,path} of rowChanges(before,d.patches,'holdings','rows')){
  if(disposed.has(id)||!row||!old&&row.writer==='genesis'||!relevant(row))continue;
  let op=!old?'holding.open':old.until===undefined&&row.until!==undefined?'holding.close':old.holder!==row.holder?'holding.transfer':null;
  if(!op)continue;
  add({op,holding:id,holdingKind:row.kind,variant:row.variant,holder:row.holder,subject:row.subject,terms:row.terms,grantedBy:row.grantedBy,...(op==='holding.transfer'?{newHolder:row.holder}:{}),...(op==='holding.close'?{reason:row.reason}: {}),result:{path,before:structuredClone(old??null),after:structuredClone(row)}});
 }
 for(const {id,row,old,path} of rowChanges(before,d.patches,'state','obligations')){
  if(!row||!relevant(row))continue;
  const paid=old?(row.paid??0)-(old.paid??0):0;
  const ended=old&&row.endedAt!==undefined&&old.endedAt===undefined;
  const op=!old?'obligation.create':paid>0?'obligation.settle':ended||['cancelled','void'].includes(row.status)&&row.status!==old.status?'obligation.cancel':null;
  if(op)add({op,id,obligationKind:row.kind??row.obligationKind,debtor:row.debtor,creditor:row.creditor,from:row.debtor,to:row.creditor,subject:row.subject,terms:row.terms,amount:op==='obligation.settle'?paid:row.amount,deadline:row.deadline,...(op==='obligation.cancel'?{reason:row.endReason??row.status}:{}),actedAs:row.actedAs??row.terms?.actedAs??null,result:{path,before:structuredClone(old??null),after:structuredClone(row)}});
  else {
   // A handler may finish the newly opened row's status/projection in another
   // patch. Keep that final row in the last actual lifecycle operation.
   const effect=receipt.applied.findLast(e=>e.op.startsWith('obligation.')&&e.id===id);
   if(effect)effect.result.after=structuredClone(row);
  }
 }
 // Legacy deposit balances already are the bank's payable claim. Describe
 // that actual liability in the receipt without creating a duplicate debt or
 // a second money transfer. Interest and withdrawal keep their native writer.
 if(tool==='trade'&&['deposit','withdraw'].includes(args.operation)&&result.bank){
  const bank=result.bank,path=['state','records',bank,'accounts','player'];
  const previous=at(before,path)??0,balance=at(after,path)??0,delta=balance-previous;
  if(delta)add(stateEffect(delta>0?'obligation.create':'obligation.settle',{
   id:`deposit:${bank}:player`,obligationKind:'deposit',debtor:bank,creditor:'player',from:bank,to:'player',
   amount:Math.abs(delta),terms:{resource:'coin_river',principal:Math.abs(delta)},balance
  },path,before,after));
 }
 const dialogue=result.dialogue;
 if(dialogue&&a.dialogues?.[dialogue.npc]?.sourceEvent===eventId){
  const verb=['ask','interpreter','persuade','request'].includes(dialogue.action)?'request':dialogue.action;
  add(stateEffect('emit',{target:dialogue.npc,verb,visibility:'private',payload:{kind:dialogue.action,content:args.content??null},...(dialogue.actedAs?{actedAs:dialogue.actedAs}:{})},['state','dialogues',dialogue.npc],before,after));
 }
 for(const [id,memory] of Object.entries(after.memories??{})){
  if(memory.sourceEvent!==eventId||same(before.memories?.[id],memory))continue;
  // An actual reading/hearing has a source; it does not make the claim true.
  add(stateEffect('emit',{target:memory.subject??'player',verb:'tell',visibility:'private',payload:{kind:memory.channel??memory.sourceType,content:memory.content,source:memory.source}},['memories',id],before,after));
 }
 // Actual created entities and changed authored facts (cast, manufacture,
 // facilities, etc.) use the same primitive vocabulary as native programs.
 for(const [id,row] of Object.entries(a.created??{}))if(!b.created?.[id])add(stateEffect('create',{entity:id,kind:row.kind??after.holdings?.entities?.[id]?.kind,facts:row.facts??{}},['state','created',id],before,after));
 for(const [id,row] of Object.entries(after.holdings?.entities??{})){
  const old=before.holdings?.entities?.[id];if(!old)continue;
  for(const [field,value] of Object.entries(row.facts??{}))if(!same(old.facts?.[field],value))add(stateEffect('fact.set',{entity:id,field,value},['holdings','entities',id,'facts',field],before,after));
 }
 for(const [id,row] of Object.entries(a.records??{}))if(row.category==='physical_feature'&&involved.has(row.id)){
  for(const [field,value] of Object.entries(row.state??{}))if(!same(b.records?.[id]?.state?.[field],value))
   add(stateEffect('fact.set',{entity:row.id,field,value},['state','records',id,'state',field],before,after));
 }
 const usedRequests=new Set();
 const owner=value=>value==='self'?'player':typeof value==='string'?value.split('|')[0]:null;
 const resource=r=>r.resource??(typeof r.from==='string'&&r.from.includes('|')?parseAccount(r.from).resource:null);
 for(const effect of posted){
  const index=requested.findIndex((r,index)=>!usedRequests.has(index)&&r.op==='transfer'&&owner(r.from)===owner(effect.from)&&owner(r.to)===owner(effect.to)&&['coin',effect.resource].includes(resource(r))&&r.qty===effect.qty);
  if(index>=0){Object.assign(effect,{role:'requested_consumption',requestIndex:index});usedRequests.add(index);}
 }
 // Only a handler's declared fee is an additional resource cost. Endpoints or
 // negative deltas alone do not establish that something was a fee (A3-A).
 if(tool==='learn'&&typeof result.cost==='number'&&result.cost>0){
  const fee=receipt.applied.find(e=>e.op==='transfer'&&e.resource==='coin_river'&&parseAccount(e.from).owner==='player'&&parseAccount(e.to).owner===result.source?.id&&e.qty===result.cost);
  if(fee)costs.push(fee);
 }
 if(tool==='cast')for(const material of engine.byId.get(result.spell)?.materials??[]){
  const cost=posted.find(e=>!costs.includes(e)&&e.resource===material.item&&e.qty===material.amount&&parseAccount(e.from).owner==='player'&&parseAccount(e.to).owner==='sink:consume'&&parseAccount(e.to).purpose==='spell');
  if(cost)costs.push(cost);
 }
 if(tool==='craft'&&result.spent?.feePaid>0){
  // Each completed batch declares its actual station fee; never infer a fee
  // from a sink or from every coin posting in the elapsed simulation.
  for(const batch of result.results??[result]){
   if(!batch.spent?.feePaid)continue;
   const station=a.crafted?.[batch.receipt]?.station??a.records?.[batch.receipt]?.station;
   const fee=posted.find(e=>!costs.includes(e)&&e.resource==='coin_river'&&parseAccount(e.from).owner==='player'&&e.qty===batch.spent.feePaid&&(parseAccount(e.to).owner===station||parseAccount(e.to).owner===engine.byId.get(a.location)?.workstations?.find(s=>s.id===station)?.owner));
   if(fee)costs.push(fee);
  }
 }
 for(const effect of costs){
  const index=effect.requestIndex??-1;
  Object.assign(effect,{role:index<0?'additional_cost':'requested_consumption',costIndex:receipt.cost.resources.length,...(index>=0?{requestIndex:index}:{})});
  receipt.cost.resources.push(structuredClone(effect));
 }
 receipt.check=tool==='craft'&&result.results?.length>1?{
  kind:'batches',success:result.success,degree:result.degree,difficulty:Math.max(...result.results.map(row=>row.difficulty)),
  batches:result.results.map(({die,rolls,modifier,total,difficulty,degree,success})=>({die,rolls,modifier,total,difficulty,degree,success}))
 }:a.checks?.[eventId]??null;
 receipt.signature=receipt.applied.map(e=>e.op);
 receipt.narrate.must=receipt.applied.map(e=>({op:e.op,index:e.index}));
 receipt.legacy=structuredClone(result);
 result.receipt=receipt;
 // Raw tools already persist their result in the event store. Do not turn an
 // ephemeral spell/observation into a permanent world record (legacy contract).
 if(persist)d.set(['state','records',legacyReceiptKey(eventId)],{category:'primitive_receipt',fingerprint:legacyIdentity(action,tool,args),receipt:structuredClone(receipt)});
 return receipt;
}
