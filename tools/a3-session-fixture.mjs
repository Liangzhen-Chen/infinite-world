// Execute host controls through the same plugin handlers used by runtime.js.
// No HTTP server, model client, user save, or result-shaped state injection.
import fs from 'node:fs/promises';
import path from 'node:path';
import {init} from '../server-plugin/index.mjs';
import {CampaignStorage,atomicJSON,digest} from '../server-plugin/storage.mjs';
import {WorldRegistry} from '../server-plugin/world-registry.mjs';
import {archivedReducer} from '../server-plugin/archived-reducer.mjs';
import {isSessionHistory,sessionHistory,validateSessionHistory} from './a3-setup/session.mjs';
import {tmpRoot} from './tmp-root.mjs';
import {changeItems} from '../server-plugin/items.mjs';
import {BOOKED} from '../server-plugin/stock.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {relationView} from '../server-plugin/npc-relations.mjs';

// In-process transport only: handlers, validation, reducer and durable storage
// are production code. Keeping it socket-free also works in the execution sandbox.
export async function sessionApi(world,baseRoot){
 const routes=new Map(),router={post:(key,fn)=>routes.set(key,fn),get:(key,fn)=>routes.set(key,fn)};
 await init(router,{world,baseRoot,npcPlanningEnabled:false,populationProfilesEnabled:false,consistencyEnabled:false});
 return async(endpoint,body={})=>{
  const handler=routes.get(endpoint);if(!handler)throw Error(`Unknown session endpoint: ${endpoint}`);
  let status=200,result;
  await handler({body},{status(code){status=code;return this;},json(value){result=value;return this;}});
  if(status!==200)throw Error(`${endpoint}: ${result?.error??status}`);
  return result;
 };
}
const anchors=chat=>chat.filter(m=>m.is_user&&!m.extra?.fields_invalidated).map(m=>m.extra.fields_anchor);
const sourceId=row=>row.id.replace(/-builder$/,'');
const quantity=(doc,owner,item)=>{const stack=owner==='player'?doc.state.inventory?.[item]:doc.state.npcs?.[owner]?.inventory?.[item];return typeof stack==='number'?stack:stack?.quantity??0;};
function fail(message){const error=Error(message);error.code='A3-SESSION';throw error;}
function checked(prepared){if(prepared.setupUnmet.length)fail(JSON.stringify(prepared.setupUnmet));return prepared.document;}
const receiptOf=value=>value?.result?.receipt??value?.receipt;
function completedRead(document,action,data,calls,receipt){
 const result=receipt??{status:'committed',routed:action,applied:[],cost:{time:0,resources:[]},data};
 return {document,before:document,receipt:result,effects:[],setupUnmet:[],requested:undefined,
  actual:{route:action,routed:action,status:result.status,signature:[],signatureEffects:[],excludedCosts:[],unmatchedCosts:[],refused:false,clarified:false,committed:true,fallback:false,traceOnly:false,entity:null,reactions:0,error:null,calls,builder:null,setupUnmet:[],previews:[]}};
}

export async function executeSessionFixture(engine,initial,row,{applyIntentSetup,executeIntent}){
 const histories=sessionHistory(row.setup);if(!histories.length)return null;
 const baseSetup={...row.setup,history:row.setup.history.filter(r=>!isSessionHistory(r))};
 let document=initial,api,store,campaignId,root,original,chat=[],summary=null;
 const evidence={operations:[],searches:[],roundtrip:false};
 const eventIds=new Map();let serial=0;
 const log=(operation,data={})=>evidence.operations.push({operation,...data});
 const prepare=setup=>{
  const doc=checked(applyIntentSetup(engine,initial,setup));
  if(setup.inventory===undefined)return doc;
  // A declared opening bag is complete. Remove the new-character starter kit
  // through the native stock writer; it is not part of these isolated scenes.
  const draft=engine.primitiveDraft(doc);
  for(const item of Object.keys(doc.state.inventory??{})){
   if(!Object.hasOwn(setup.inventory,item))changeItems(draft,engine,'player',item,-engine.quantity(draft,'player',item),{books:BOOKED});
  }
  draft.set(['ledger'],openLedger(engine,draft.document));return draft.document;
 };
 const saveChat=async()=>{await atomicJSON(path.join(root,'chat.json'),{chat,summary});await api('/sync-index',{campaignId,start:0,total:chat.length,messages:chat});};
 const read=async()=>{const value=await api('/read',{campaignId});document=value.document;return value;};
 const call=async(tool,args,eventId,anchor)=>{
  const value=await api('/execute',{campaignId,tool,args,eventId,anchor});await read();
  log('execute',{tool,args,eventId,anchor,duplicate:value.duplicate===true,sequence:value.reference.sequence});return value;
 };
 const create=async(doc,world=engine.world)=>{
  if(campaignId)fail('Session initial snapshot must precede all operations');
  const registry=new WorldRegistry(path.join(root,'infinite-fields-worlds'));
  doc.worldHash=await registry.put(world);
  store=new CampaignStorage(path.join(root,'infinite-fields'),{reducer:archivedReducer(registry,engine)});
  const created=await store.create({worldVersion:world.version,document:doc});campaignId=created.reference.campaignId;
  api=await sessionApi(world,root);await read();original=structuredClone(document);
 };
 const append=(content,{speaker='narrator',index=chat.length+1}={})=>{
  if(index!==chat.length+1&&chat.length)fail('Chat turn index is not sequential');
  if(speaker!=='player'&&speaker!=='narrator'&&!engine.byId.has(speaker))fail('Unknown chat speaker');
  const anchor=`${sourceId(row)}:turn:${index}`;
  chat.push({is_user:speaker==='player',name:engine.byId.get(speaker)?.name??speaker,mes:content,extra:{fields_anchor:anchor,fields_event_id:anchor,fields_turn_index:index}});
  return anchor;
 };
 const turnMessage=index=>{const entry=eventIds.get(index);if(!entry)fail('Unknown executable turn');return entry;};
 const tradeCall=(step,history)=>{
  // Only this explicit corpus command has structured seller input. Never use
  // expected signatures or prose to generate money transfers or permissions.
  if(step.intent!=='花4铜买两块面包'||!engine.byId.has(step.seller))fail('Unsupported executable session turn');
  return {tool:'world_act',args:{action:'core:trade.buy',slots:{seller:step.seller,item:'item_bread',quantity:2}},eventId:`${history.id}:turn:${step.index}:buy`};
 };
 const walk=async(destination)=>{
  const view=engine.scoped(document),to=view.resolve(destination);
  if(document.state.location===to)return;
  await call('world_act',{action:'core:move',slots:{destination:to}},`${sourceId(row)}:move:${++serial}`);
  if(document.state.location!==to)fail(`Movement did not arrive at ${to}`);
 };
 try{
  for(const history of histories)validateSessionHistory(history,sourceId(row));
  const inspection=histories.every(h=>h.verb==='trade_completed'||h.steps.every(s=>['append_turns','append_turn','set_summary','initial_snapshot','execute_turn','edit_turn','delete_turn','regenerate_turn'].includes(s.operation)));
  if(inspection){
   const proposal=row.input?.tool==='world_propose'?row.input.args:row.builder?.action==='open:proposal'?row.builder.slots:row.proposal;
   if(proposal?.effects?.length)fail('Session inspection/retry cannot authorize additional effects');
   // An independently supplied executable call cannot be replaced by the
   // read adapter. The corpus rows use empty-effect inspection proposals.
   if(row.input&&row.input.tool!=='world_propose'||row.builder&&row.builder.action!=='open:proposal')fail('Explicit session calls require their original executor; refusing to substitute a read');
  }
  root=await fs.mkdtemp(path.join(tmpRoot(),'a3-session-'));
  for(const history of histories){
   if(history.verb==='trade_completed'){
    // The corpus explicitly supplies the post-sale amounts and the paid cost.
    // Reconstruct the pre-sale opening, then let the real trade produce them.
    if((baseSetup.inventory?.[history.resource]??0)<history.quantity)fail('Original sale does not fit declared post-sale inventory');
    const args={action:'core:trade.buy',slots:{seller:history.to,item:history.resource,quantity:history.quantity}};
    const setup={...baseSetup,minute:history.at,coins:baseSetup.coins+history.totalCoins,inventory:{...baseSetup.inventory,[history.resource]:baseSetup.inventory[history.resource]-history.quantity},present:[history.to]};
    // history.at is a completed transaction time. Derive its opening from
    // the native preview's duration, rather than assigning a final clock.
    const quote=await engine.previewAction(prepare(setup),{tool:'world_act',args,eventId:history.requestId});
    const duration=receiptOf(quote)?.cost?.time;
    if(!Number.isSafeInteger(duration)||duration<0||history.at<duration||baseSetup.minute<history.at)fail('Original sale has no valid native duration/completion time');
    await create(prepare({...setup,minute:history.at-duration}));
    const resolved=await api('/actions',{campaignId,resolve:args});
    evidence.originalAction=resolved.action;
    const paid=await call('world_act',args,history.requestId,history.id);
    if(paid.duplicate||document.state.minute!==history.at||document.state.player.coins!==baseSetup.coins||quantity(document,'player',history.resource)!==baseSetup.inventory[history.resource])fail('Original sale did not establish declared post-sale amounts/time');
    if(document.state.minute<baseSetup.minute)await call('world_act',{action:'core:time',slots:{minutes:baseSetup.minute-document.state.minute}},`${history.id}:until-retry`);
    const before=structuredClone(document),sequence=(await read()).reference.sequence;
    const duplicate=await call('world_act',args,history.requestId,history.id);
    if(!duplicate.duplicate||digest(document)!==digest(before)||duplicate.reference.sequence!==sequence)fail('Request replay changed the campaign');
    evidence.duplicate={eventId:history.requestId,result:duplicate.result,sequence};
    log('retry',{eventId:history.requestId,unchanged:true});
    continue;
   }
   for(const step of history.steps){
    switch(step.operation){
    case 'initial_snapshot':{
     const seller=history.steps.find(s=>s.operation==='execute_turn')?.seller;
     let doc=prepare({...baseSetup,coins:step.coins,inventory:step.inventory,minute:step.minute??baseSetup.minute,present:seller?[seller]:baseSetup.present});
     if(step.sellerStock){
      // Stock is an opening premise, not a conclusion about the deletion.
      const draft=engine.primitiveDraft(doc);
      for(const [item,balance] of Object.entries(step.sellerStock))changeItems(draft,engine,seller,item,balance-engine.quantity(draft,seller,item),{books:BOOKED});
      draft.set(['ledger'],openLedger(engine,draft.document));doc=draft.document;
     }
     await create(doc);log(step.operation);break;
    }
    case 'append_turns':
     if(!campaignId)await create(prepare(baseSetup));
     if(!Number.isSafeInteger(step.count)||step.count<1||step.count>100000)fail('Invalid turn count');
     for(let i=0;i<step.count;i++)append(step.content);
     await saveChat();log(step.operation,{count:step.count});break;
    case 'append_turn':
     if(!campaignId)await create(prepare(baseSetup));
     append(step.content,step);await saveChat();log(step.operation,{index:step.index});break;
    case 'set_summary':
     if(!campaignId||!chat[step.omitTurn-1])fail('Summary must refer to an existing turn');
     summary=step.content;await saveChat();log(step.operation);break;
    case 'execute_turn':{
     if(!campaignId)fail('Missing initial snapshot');
     const command=tradeCall(step,history),anchor=append(step.intent,{speaker:'player',index:step.index});
     const before=structuredClone(document);await call(command.tool,command.args,command.eventId,anchor);
     if(before.state.player.coins-document.state.player.coins!==4||quantity(document,'player','item_bread')-quantity(before,'player','item_bread')!==2)fail('Native purchase did not establish the declared transaction');
     eventIds.set(step.index,{...command,anchor,message:chat.length-1,before});await saveChat();break;
    }
    case 'edit_turn':{
     if(step.intent!=='只问两块面包多少钱，不购买')fail('Unsupported edited turn');
     const turn=turnMessage(step.index),message=chat[turn.message];
     for(let i=turn.message;i<chat.length;i++){chat[i].extra.fields_invalidated=true;}
     message.mes=step.intent;message.extra.fields_anchor=`${turn.anchor}:edit`;message.extra.fields_invalidated=false;
     await api('/reconcile',{campaignId,validAnchors:anchors(chat)});
     await api('/edit-index',{campaignId,index:turn.message,message});await read();await saveChat();
     if(digest(document)!==digest(turn.before))fail('Editing did not restore both parties and the world clock');
     // Asking a price is read-only; use the native catalog, never trade again.
     evidence.quote=await api('/catalog',{campaignId,entity:'item_bread',kind:'item'});
     log(step.operation,{index:step.index});break;
    }
    case 'delete_turn':{
     const turn=turnMessage(step.index);chat.splice(turn.message);
     await api('/reconcile',{campaignId,validAnchors:anchors(chat)});await read();await saveChat();
     if(digest(document)!==digest(turn.before))fail('Deleting did not restore both parties and the world clock');
     log(step.operation,{index:step.index,restored:true});break;
    }
    case 'regenerate_turn':{
     if(step.sameLogicalAction!==true)fail('Regeneration must retain the logical action');
     const turn=turnMessage(step.index);
     await api('/reconcile',{campaignId,validAnchors:anchors(chat),excludeAnchor:turn.anchor});await read();
     const restored=digest(document)===digest(turn.before);if(!restored)fail('Regeneration did not restore the pre-turn state');
     await call(turn.tool,turn.args,turn.eventId,turn.anchor);log(step.operation,{index:step.index,restored});break;
    }
    case 'make_old_version_copy':{
     if(step.relationship!=='熟识'||!engine.byId.has(step.knownPerson))fail('Unsupported relationship premise');
     const oldWorld=structuredClone(engine.world);oldWorld.version=`${engine.world.version}:session-copy`;oldWorld.rules.version=oldWorld.version;
     // Same old edition data, different edition identity; upgrade must really
     // run and archive the old copy without manufacturing a catalog change.
     await create(prepare({...baseSetup,coins:step.coins,inventory:step.inventory,location:step.location,present:step.present}),oldWorld);
     await call('world_remember',{subject:step.knownPerson,key:'相识',content:`我与${engine.byId.get(step.knownPerson).name}熟识。`},`${history.id}:known`);
     evidence.relationship={knownPerson:step.knownPerson,label:step.relationship,memories:structuredClone(document.memories),dimensions:relationView(engine,document.state,step.knownPerson,'player')};
     log(step.operation);break;
    }
    case 'upgrade_copy':{
     if(step.preserveOriginal!==true||!campaignId||!evidence.relationship)fail('Upgrade requires this session old copy');
     const previous=structuredClone(document),before=await api('/export',{campaignId});api=await sessionApi(engine.world,root);await read();
     if(document.state.player.coins!==previous.state.player.coins||digest(document.state.inventory)!==digest(previous.state.inventory)||digest(document.memories)!==digest(evidence.relationship.memories))fail('Upgrade did not preserve old-copy money, items or known relationship memory');
     if(digest(relationView(engine,document.state,evidence.relationship.knownPerson,'player'))!==digest(evidence.relationship.dimensions))fail('Upgrade changed native relationship dimensions');
     const known=await api('/search',{campaignId,query:`${engine.byId.get(evidence.relationship.knownPerson).name} 熟识`});
     if(!known.results.some(r=>r.id.startsWith('memory_')&&r.text.includes('熟识')))fail('Preserved acquaintance memory is not readable');
     evidence.relationship.search=known;
     const upgraded=await api('/export',{campaignId});
     if(upgraded.events.filter(e=>e.input?.type==='world_upgrade').length!==1)fail('Native world upgrade was not executed');
     const backups=(await fs.readdir(path.join(root,'infinite-fields',campaignId))).filter(n=>n.startsWith('before-world-update-'));
     if(backups.length!==1)fail('Missing old-copy upgrade backup');
     const backup=JSON.parse(await fs.readFile(path.join(root,'infinite-fields',campaignId,backups[0]),'utf8'));
     if(digest(backup)!==digest(before))fail('Upgrade backup changed the old copy');
     log(step.operation,{oldHash:before.documentHash,newHash:upgraded.documentHash,backupPreserved:true});break;
    }
    case 'snapshot_before_departure':{
     // The corpus describes the returning scene, not the departing gate.
     // Validate return perception only after actual travel, without moving NPCs.
     const {positions,...departureSetup}=baseSetup;
     await create(prepare({...departureSetup,location:step.location,present:[]}));log(step.operation,{location:step.location});break;
    }
    case 'leave_and_advance':{
     if(step.useNormalWorldClock!==true||!Number.isSafeInteger(step.days)||step.days<1||step.days>30)fail('Invalid normal-clock absence');
     // Select an authored route out of the village; all subsequent movement
     // and time are actions. No final-date assignment and no NPC relocation.
     const village=engine.byId.get(document.state.location)?.scope;
     const outside=engine.world.routes.filter(r=>[r.from,r.to].includes(village)).map(r=>r.from===village?r.to:r.from).find(id=>{
      const place=engine.byId.get(id);return place&&place.id!==village&&place.scope!==village&&!id.startsWith('bld_');
     });
     if(!outside)fail('No authored departure route');
     await walk(outside);const start=document.state.minute;
     await call('world_act',{action:'core:time',slots:{minutes:step.days*1440}},`${history.id}:absence`);
     if(document.state.minute-start!==step.days*1440)fail('Normal clock did not finish the requested absence');
     log(step.operation,{from:start,to:document.state.minute,days:step.days});break;
    }
    case 'return':
     await walk(step.location);log(step.operation,{location:document.state.location});break;
    default:fail('Unsupported session operation');
    }
   }
  }
  if(!campaignId)fail('Session did not establish a campaign');
  if(histories.some(h=>h.steps?.some(s=>s.operation==='return'))){
   evidence.returnScene=await api('/scene',{campaignId,query:''});
   const target=histories.flatMap(h=>h.steps??[]).find(s=>s.operation==='return')?.interlocutor??row.proposal?.effects?.find(e=>e.op==='emit')?.target;
   if(target){
    const destination=document.state.npcs?.[target]?.location;
    if(!destination)fail('Return interlocutor has no live native location');
    await walk(destination);log('visit_interlocutor',{target,location:document.state.location});
   }
   if(baseSetup.positions){const verified=applyIntentSetup(engine,document,{positions:baseSetup.positions});if(verified.setupUnmet.length)fail(JSON.stringify(verified.setupUnmet));}
  }
  // Host chat is persisted separately, as in SillyTavern; restart loads it and
  // syncs through the native index API, instead of turning chat into world facts.
  const host=JSON.parse(await fs.readFile(path.join(root,'chat.json'),'utf8').catch(e=>e.code==='ENOENT'?'{}':Promise.reject(e)));
  api=await sessionApi(engine.world,root);if(host.chat)await api('/sync-index',{campaignId,start:0,total:host.chat.length,messages:host.chat});
  await read();
  const bundle=await api('/export',{campaignId}),imported=await api('/import',{bundle});
  if(digest(imported.document)!==digest(document))fail('Session save roundtrip changed the document');evidence.roundtrip=true;
  const parties=[...new Set(histories.flatMap(h=>[h.to,...(h.steps??[]).flatMap(s=>[s.seller,s.knownPerson])]).filter(Boolean))];
  const snapshot=doc=>({coins:doc.state.player.coins,minute:doc.state.minute,location:doc.state.location,inventory:doc.state.inventory,parties:Object.fromEntries(parties.map(id=>[id,{coins:doc.state.npcs[id].coins,inventory:doc.state.npcs[id].inventory}]))});
  evidence.initial=snapshot(original);evidence.final=snapshot(document);
  evidence.events=bundle.events.map(e=>({id:e.id,kind:e.kind,anchor:e.anchor,input:e.input,removed:e.removed}));
  const searchesOriginalChat=histories.some(h=>h.steps?.some(s=>s.operation==='append_turn'));
  if(searchesOriginalChat){
   const intention=row.intent.split('【本次意图】').at(-1),quoted=[...intention.matchAll(/“([^”]+)”/g)].map(m=>m[1]);
   const queries=quoted.length>1?quoted:[intention];
   for(const query of queries){const result=await api('/search',{campaignId,query});evidence.searches.push({query,...result});}
   const targets=chat.flatMap((m,i)=>histories.some(h=>h.steps?.some(s=>s.operation==='append_turn'&&s.content===m.mes))?[`chat_${i}`]:[]);
   if(!targets.length||evidence.searches.some(s=>!s.results.some(r=>targets.includes(r.id))))fail('Native search did not retrieve the original chat for every query');
  }
  // Client reads use runtime.js's clientRead dispatch. World actions retain
  // the ordinary engine/router/signature evaluator and its actual failures.
  let run;
  if(searchesOriginalChat){
   const resolved=await api('/actions',{campaignId,resolve:{action:'core:search',slots:{query:evidence.searches[0].query}}});
   if(!resolved.clientRead||resolved.tool!=='world_search')fail('Search is not a native client read');
   run=completedRead(document,resolved.action,evidence.searches,[{phase:'read',tool:resolved.tool,queries:evidence.searches.map(s=>s.query)}]);
  }else if(evidence.duplicate){
   const oldReceipt=receiptOf(evidence.duplicate.result);
   // Transport retries return the old receipt, whose applied describes its
   // first commit. The measured retry has no new applied effects, proven by
   // the unchanged head and complete document above.
   if(!oldReceipt)fail('Original transaction has no native receipt');
   run=completedRead(document,evidence.originalAction,evidence.duplicate,[{phase:'retry',tool:'world_act',eventId:evidence.duplicate.eventId}],{...oldReceipt,duplicate:true,applied:[]});
  }else if(histories.some(h=>h.steps?.some(s=>['edit_turn','delete_turn','regenerate_turn'].includes(s.operation)))){
   run=await executeIntent(engine,document,{...row,setup:undefined,builder:undefined,input:{tool:'world_act',args:{action:'core:read',slots:{}}}});
  }else run=await executeIntent(engine,document,{...row,setup:undefined});
  run.actual.session=evidence;return run;
 }catch(error){
  const run={document,before:document,receipt:null,effects:[],requested:undefined,setupUnmet:[{item:'history.session',reason:error.message}],
   actual:{route:null,routed:null,status:null,signature:[],signatureEffects:[],excludedCosts:[],unmatchedCosts:[],refused:false,clarified:false,committed:false,fallback:false,traceOnly:false,entity:null,reactions:0,error:{code:error.code??'A3-SESSION',message:error.message},calls:[],builder:null,previews:[],session:evidence}};
  run.actual.setupUnmet=run.setupUnmet;
  return run;
 }finally{if(root)await fs.rm(root,{recursive:true,force:true});}
}
