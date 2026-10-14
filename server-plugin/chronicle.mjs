import fs from 'node:fs/promises';
import path from 'node:path';
import {applyPatches,digest} from './storage.mjs';
import {MemoryIndex,normalize} from './retrieval.mjs';
import {stateNotices} from './state-notices.mjs';
import {expandRetrievalText,prepareRetrievalRecord,RETRIEVAL_DICTIONARY} from './retrieval-lexicon.mjs';

const DAY=1440,clone=value=>structuredClone(value),cache=new WeakMap();
const unique=values=>[...new Set(values.filter(value=>value!==null&&value!==undefined))];
const unresolved=new Set(['待履行','进行中','待偿还','逾期','待交付','在途','待处理']);
const visible=(row,viewer)=>viewer==='omniscient'||row.visibleTo?.includes(viewer);
const count=value=>typeof value==='number'?value:value?.quantity??0;
function bounded(parts,limit){
 let text='';for(const raw of parts){const part=String(raw).replace(/\s+/g,' ').trim();if(!part)continue;
  const next=text?`${text}；${part}`:part;if([...next].length>limit){if(!text)text=[...part].slice(0,Math.max(0,limit-1)).join('')+'…';break;}text=next;
 }return text;
}
function span(facts){return {events:unique(facts.map(f=>f.sourceEvent)),sequences:unique(facts.map(f=>f.sequence)).sort((a,b)=>a-b),anchors:unique(facts.map(f=>f.anchor)),from:Math.min(...facts.map(f=>f.minute)),to:Math.max(...facts.map(f=>f.minute))};}

// Only reducer output and its before/after state are accepted. Raw chat,
// remember.content, model summaries and free-form result.messages are not facts.
export function collectChronicleFacts(engine,beforeDocument,afterDocument,input,{sequence=0,anchor=null}={}){
 const before=beforeDocument.state,after=afterDocument.state,eventId=input.eventId;
 if(!eventId||!before||!after||after.minute<before.minute)throw Error('编年史缺少有效事件或时间倒退');
 if(input.type&&input.type!=='npc_plan')return [];
 const name=id=>id==='player'?after.player.name??'旅人':engine.byId.get(id)?.name??id;
 const rows=[],seen=new Set();
 const add=(key,text,{minute=after.minute,location=after.location,participants=['player'],entities=[],visibleTo=['player'],salience=3,kind='change',reference=null,status=null}={})=>{
  if(!text||minute<before.minute||minute>after.minute||seen.has(key))return;seen.add(key);
  const clean=prepareRetrievalRecord({text},{verified:true})?.text;if(!clean)return;
  const items=entities.map(id=>engine.byId.get(id)).filter(row=>row?.id.startsWith('item_'));
  const keywords=unique([...(kind==='trade'?['购买 买过 支付 交易']:[]),...items.flatMap(row=>[row.name,...row.aliases??[],row.use??''])]);
  rows.push({id:`chronicle_fact_${digest([eventId,key]).slice(0,24)}`,sourceEvent:eventId,sequence,anchor,minute,location,participants:unique(participants),entities:unique([...participants,...entities,location]),keywords,visibleTo:unique(visibleTo),salience,kind,text:clean,reference,status,authority:'event-derived'});
 };
 const observed=new Map();
 for(const [npcId,npc] of Object.entries(after.npcs??{}))for(const memory of npc.memoryStream??[]){
  if(memory.sourceEvent!==eventId||!['亲历','目击','约定核对'].includes(memory.sourceType)||before.npcs?.[npcId]?.memoryStream?.some(old=>old.id===memory.id))continue;
  const row=observed.get(memory.id)??{memory,holders:[]};row.holders.push(npcId);observed.set(memory.id,row);
 }
 for(const {memory,holders} of observed.values())add(`memory:${memory.id}`,memory.content,{minute:memory.minute,location:memory.location,participants:memory.participants??[],entities:memory.entities??[],visibleTo:unique([...holders,...(memory.participants?.includes('player')?['player']:[])]),salience:memory.salience,kind:memory.kind,reference:memory.rumor?`rumor:${memory.rumor}`:null,status:memory.rumor?'未核实':null});
 // Family, health and moving events the player stood right there for
 // (npc-life marks them); the text is the first-hand memory of those involved.
 for(const [root,minute] of Object.entries(after.family?.seenByPlayer??{}))if(before.family?.seenByPlayer?.[root]===undefined){
  const memory=Object.values(after.npcs??{}).flatMap(npc=>npc.memoryStream??[]).find(row=>(row.rootMemoryId??row.id)===root);
  if(memory)add(`life:${root}`,memory.content,{minute,location:memory.location??after.location,participants:['player',...memory.participants??[]],visibleTo:['player'],salience:memory.salience??3,kind:memory.kind});
 }
 if(before.location!==after.location)add('move',`${name('player')}从${name(before.location)}抵达${name(after.location)}`,{kind:'move',entities:[before.location],participants:['player',...after.player.companions??[]]});
 // Reuse observable state deltas. Do not turn private NPC records or remote
 // autonomous work into something the player supposedly witnessed.
 const notices=stateNotices(before,after,name).filter(n=>['coins','hp','mp','status','level','inventory','durability','effect','protection','learning','skill','learned','profession','repair'].includes(n.type));
 if(notices.length)add('player-changes',`${name('player')}：${notices.map(n=>n.text).join('；')}`,{kind:'player-change',salience:notices.some(n=>n.type==='status')?5:3,entities:unique([...Object.keys(before.inventory??{}),...Object.keys(after.inventory??{})].filter(id=>count(before.inventory?.[id])!==count(after.inventory?.[id])))});
 for(const collection of ['obligations','quests','records'])for(const [id,row] of Object.entries(after[collection]??{})){
  const old=before[collection]?.[id];if(old&&old.status===row.status&&old.paid===row.paid)continue;
  const participants=collection==='obligations'?[row.promisor,row.promisee]:collection==='quests'?['player',row.giver,row.issuer]:row.category==='debt'?[row.debtor,row.creditor]:row.parties??[];
  if(!participants.includes('player')&&!participants.some(p=>after.npcs?.[p]))continue;
  let text;if(collection==='obligations')text=`${name(row.promisor)}与${name(row.promisee)}的${row.type}约定：${row.status}`;
  else if(collection==='quests')text=`${name('player')}的委托“${row.name??row.title??id}”：${row.status}`;
  else if(row.category==='debt')text=`${name(row.debtor)}欠${name(row.creditor)}${row.amount-(row.paid??0)}铜：${row.status}`;
  else if(row.category==='contract')text=`${participants.map(name).join('、')}的契约“${row.name??'契约'}”：${row.status}`;
  else continue;
  add(`${collection}:${id}`,text,{kind:collection,participants,visibleTo:participants,location:row.location??null,salience:4,reference:`${collection}:${id}`,status:row.status});
 }
 for(const [id,row] of Object.entries(after.npcAutonomy?.actions??{}))if(!before.npcAutonomy?.actions?.[id]){
  const participants=unique([row.npc,row.action?.seller]);
  // The summary is created by the deterministic autonomy reducer. Pending
  // proposals have no actions row and cannot enter this history.
  add(`autonomy:${id}`,`${name(row.npc)}${row.summary}`,{minute:row.minute,location:row.location,participants,visibleTo:participants,kind:'autonomy',salience:3});
 }
 return rows;
}

function summaries(facts,{now,viewer='player',chapterDays=28,sceneBreakAfter=[]}={}){
 const selected=facts.filter(row=>visible(row,viewer)&&row.minute<=now).map(clone).sort((a,b)=>a.minute-b.minute||a.sequence-b.sequence||a.id.localeCompare(b.id));
 const boundaries=new Set(sceneBreakAfter);
 const scenes=[];let current;
 for(const fact of selected){const day=Math.floor(fact.minute/DAY);
  if(!current||current.day!==day||current.location!==fact.location||boundaries.has(current.facts.at(-1).sourceEvent)&&current.facts.at(-1).sourceEvent!==fact.sourceEvent){current={id:`chronicle_scene_${digest([fact.id,viewer]).slice(0,24)}`,level:'scene',day,location:fact.location,facts:[]};scenes.push(current);}current.facts.push(fact);
 }
 for(const [index,scene] of scenes.entries()){
  const last=new Map();for(const fact of scene.facts)if(fact.reference)last.set(fact.reference,fact);
  const open=[...last.values()].filter(f=>unresolved.has(f.status));
  const ordered=[...scene.facts].sort((a,b)=>b.salience-a.salience||a.minute-b.minute),refs=span(scene.facts);
  Object.assign(scene,{minute:refs.to,from:refs.from,participants:unique(scene.facts.flatMap(f=>f.participants)),entities:unique(scene.facts.flatMap(f=>f.entities)),sources:refs,
   text:bounded([...ordered.map(f=>f.text),...open.map(f=>`当时未了：${f.text}`)],200),unresolved:open.map(f=>({reference:f.reference,status:f.status,text:f.text})),closed:index<scenes.length-1||now>=(scene.day+1)*DAY||boundaries.has(scene.facts.at(-1).sourceEvent),authority:'summary-below-events',factIds:scene.facts.map(f=>f.id)});delete scene.facts;
 }
 const aggregate=(children,level,width,limit)=>{
  const groups=new Map();for(const child of children){const bucket=Math.floor(child.day/width),list=groups.get(bucket)??[];list.push(child);groups.set(bucket,list);}
  return [...groups.entries()].map(([bucket,rows])=>({id:`chronicle_${level}_${viewer}_${bucket}`,level,day:bucket*width,from:bucket*width*DAY,minute:Math.max(...rows.map(r=>r.minute)),through:(bucket+1)*width*DAY,
   locations:unique(rows.flatMap(r=>r.locations??[r.location])),participants:unique(rows.flatMap(r=>r.participants)),entities:unique(rows.flatMap(r=>r.entities)),text:bounded(rows.map(r=>r.text),limit),children:rows.map(r=>r.id),
   sources:{events:unique(rows.flatMap(r=>r.sources.events)),sequences:unique(rows.flatMap(r=>r.sources.sequences)).sort((a,b)=>a-b),anchors:unique(rows.flatMap(r=>r.sources.anchors)),from:Math.min(...rows.map(r=>r.sources.from)),to:Math.max(...rows.map(r=>r.sources.to))},closed:now>=(bucket+1)*width*DAY,authority:'summary-below-events'}));
 };
 const days=aggregate(scenes,'day',1,800),weeks=aggregate(days,'week',7,1600),chapters=aggregate(weeks,'chapter',chapterDays,2400);
 return {version:1,viewer,now,facts:selected,scenes,days,weeks,chapters};
}
export function buildChronicle(facts,{now,viewer='player',chapterDays=28,sceneBreakAfter=[]}={}){
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(chapterDays)||chapterDays<7||chapterDays%7)throw Error('编年史时间或篇章跨度无效；篇章按完整周合成');
 return summaries(facts,{now,viewer,chapterDays,sceneBreakAfter});
}

// CampaignStorage already verifies the hash chain and knows the active branch.
// This cache follows its sequence/revision and uses its existing reducer. It
// writes neither campaign documents nor an independent historical authority.
export async function getChronicle(store,id,{engineFor,engine,viewer='player',chapterDays=28,sceneBreakAfter=[]}={}){
 return store.exclusive(id,async()=>{
  const state=await store.load(id),campaigns=cache.get(store)??new Map();cache.set(store,campaigns);
  let projection=campaigns.get(id);
  if(!projection||projection.revision!==state.revision){projection={revision:state.revision,sequence:0,facts:[],document:JSON.parse(await fs.readFile(path.join(store.directory(id),'initial.json'),'utf8'))};}
  else projection={...projection,facts:[...projection.facts]};
  for(const event of state.events){
   if(event.sequence<=projection.sequence||!state.active.has(event.sequence))continue;
   const before=projection.document,output=store.reducer?await store.reducer(before,event.input,{replay:true,result:event.result}):event;
   projection.document=applyPatches(before,output.patches);
   const selected=engineFor?await engineFor(projection.document):engine??await store.worldRegistry?.get(projection.document.worldHash);
   if(!selected)throw Error('编年史需要战役对应的世界实体目录');
   const scoped=selected.scoped?.(projection.document)??selected;
   projection.facts.push(...collectChronicleFacts(scoped,before,projection.document,{...event.input,eventId:event.input.eventId??event.id},{sequence:event.sequence,anchor:event.anchor}));
  }
  projection.sequence=state.sequence;campaigns.set(id,projection);
  return {...buildChronicle(projection.facts,{now:state.document.state.minute,viewer,chapterDays,sceneBreakAfter}),reference:store.reference(state)};
 });
}

export function syncChronicleIndex(index,chronicle){
 const wanted=new Set();for(const fact of chronicle.facts){const record={id:fact.id,text:fact.text,keywords:fact.keywords??[],eventId:fact.sourceEvent,minute:fact.minute,entities:fact.entities,scope:fact.location,salience:fact.salience,source:'编年史·真实事件摘记',verified:true,revision:digest(fact)};wanted.add(record.id);index.upsert(record);}
 for(const id of [...index.documents.keys()])if(id.startsWith('chronicle_fact_')&&!wanted.has(id))index.remove(id);
 return {indexed:wanted.size};
}
export function searchChronicle(chronicle,query,{entities=[],location=null,participants=[],limit=8}={}){
 const index=new MemoryIndex({entities,dictionary:RETRIEVAL_DICTIONARY});syncChronicleIndex(index,chronicle);
 const expanded=expandRetrievalText(query,{normalize,resolver:index.resolver,scope:location});
 return index.search(expanded,{now:chronicle.now,scope:location,present:participants,limit});
}
export function chronicleContext(chronicle,{query='',entities=[],location=null,participants=[],budgetChars=1800,index=null}={}){
 const recent=chronicle.scenes.slice(-3),today=chronicle.days.find(d=>d.day===Math.floor(chronicle.now/DAY));
 const hits=index?index.search(query,{now:chronicle.now,scope:location,present:participants,limit:8}):searchChronicle(chronicle,query,{entities,location,participants,limit:8}),events=new Set(hits.map(h=>h.eventId));
 const relevant=chronicle.scenes.filter(s=>!recent.some(r=>r.id===s.id)&&s.sources.events.some(id=>events.has(id))).slice(-3);
 const selected=[];let size=0;for(const row of [...recent,...(today?[today]:[]),...relevant]){if(size+row.text.length>budgetChars)continue;selected.push(clone(row));size+=row.text.length;}
 return {authority:'历史摘要低于当前状态与原始事件；未了事项描述的是当时状态',entries:selected,characters:size};
}
