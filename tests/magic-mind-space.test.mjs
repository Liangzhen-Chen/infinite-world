import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage,digest}from'../server-plugin/storage.mjs';
import {prepareMagic,applyMagic,validateMagicCatalog}from'../server-plugin/magic.mjs';
import {mindSpaceSpellCandidates,mechanismMap}from'../tools/w2-mechanism-map.mjs';
import {mindSpaceMechanisms}from'../server-plugin/magic-mind-space.mjs';
import {createBusinessContract}from'../server-plugin/contracts.mjs';
import {recordLocalContact}from'../server-plugin/environment.mjs';
import {npcCognitionView}from'../server-plugin/npc-cognition.mjs';
import {advanceNpcSchedules}from'../server-plugin/npc-schedule.mjs';
import {MemoryIndex}from'../server-plugin/retrieval.mjs';
import {modelToolCall,toolDefinitions}from'../extension/tools.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_linsui',far='loc_hw';
const mental=()=>({fatigue:80,alertness:20,stress:40,interference:[{kind:'compulsion',thought:'secret_thought'}]});
function fixture(){
 const world=structuredClone(original),candidates=mindSpaceSpellCandidates();
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 delete world.rules.weather;delete world.rules.settlementTrade;delete world.rules.worldClock;
 world.spells=world.spells.filter(s=>!candidates.some(c=>c.id===s.id));world.spells.push(...candidates);
 for(const c of candidates)if(!world.skills.some(s=>s.id===c.skill))world.skills.push({id:c.skill,name:c.skill,attribute:'精神',profession:null});
 const location=new WorldEngine(world).initialFromLegacy(seed,'mind-space').state.location;
 const feature=(id,kind,state,position=[0,0],extra={})=>({id,name:id,kind,state,owner:'player',position,...extra});
 const rows=[
  feature('feature_bag','container',{contents:['bag_b','bag_a'],capacityKg:20,closed:true,integrity:100,mouthIngressMlPerMinute:10,holeIngressMlPerMinute:2,wetMl:0}),
  feature('feature_metal','surface',{material:'metal',integrity:100,corrosionResistance:.2}),
  feature('feature_point','silt_heap',{blinkLanding:true},[3,4]),
  feature('feature_door','door',{locked:true,open:false,keyItem:'item_iron',lockGapMm:1,blockRadiusMeters:.2},[0,0],{connects:[location,far]}),
  feature('feature_source','silt_heap',{anchorIntact:true,anchorOffsetMeters:[0,0]},[0,0],{spaceAnchor:true}),
  feature('feature_anomaly','surface',{blocksSpace:true,blockRadiusMeters:.2,spaceAnomaly:{divine:false,radiusMeters:.2,intensity:1}},[1.5,2]),
 ];
 world.locations.find(l=>l.id===location).features=rows;
 world.locations.find(l=>l.id===far).features=[feature('feature_destination','silt_heap',{anchorIntact:true,anchorOffsetMeters:[0,0]},[0,0],{spaceAnchor:true})];
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'mind-space');
 Object.assign(doc.state.player,{mp:100000,maxMp:100000,hp:100,maxHp:100,mental:mental(),companions:[]});
 Object.assign(doc.state.npcs[npc],{mental:mental(),location,activity:'休息',memoryStream:[{id:'old_memory',minute:0,salience:1,kind:'trade',participants:['player',npc],content:'secret_old_fact',sourceType:'亲历',sourceEvent:'real_past'}]});
 doc.state.inventory.item_resin={quantity:100};doc.state.inventory.item_herb={quantity:100};doc.state.inventory.item_iron={quantity:1};
 doc.state.inventory.item_charcoal={quantity:1};
 for(const c of candidates){doc.state.spells[c.id]={source:{type:'fixture'}};doc.state.skills[c.skill]={proficiency:1000,daily:{},breakthroughs:[]};}
 for(const [id,item]of [['bag_a','item_charcoal'],['bag_b','item_iron']])doc.state.itemInstances[id]={id,item,owner:'player',status:'袋内',container:'feature_bag',quality:'普通',durability:100,maxDurability:100,source:'existing-bag'};
 const code=world.rules.law.codes.find(c=>c.locations.includes(location));
 doc.state.records.mental_permit={category:'authorization',action:'mental_magic',subject:'player',location,grantor:code.officers[0],grantee:'player',expires:1000000};
 doc.state.records.mental_consent={category:'authorization',action:'mental_magic',subject:npc,grantor:npc,grantee:'player',expires:1000000};
 const s={world,engine,doc,location,rows,candidates,serial:0};contact(s);return s;
}
function draft(s){return{document:s.doc,get:(...p)=>p.reduce((v,k)=>v?.[k],s.doc),set:(p,v)=>{let n=s.doc;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=structuredClone(v);},remove:p=>{let n=s.doc;for(const k of p.slice(0,-1))n=n[k];delete n[p.at(-1)];},say:()=>{}};}
function contact(s){recordLocalContact(draft(s),s.engine,npc,`contact-${++s.serial}`);}
function catalog(s,op){return s.candidates.find(c=>(c.effectSpec.operation??c.effectSpec.kind)===op);}
function state(s,id){return s.doc.state.records[`physical_feature:${id}`]?.state??s.rows.find(r=>r.id===id)?.state??s.world.locations.flatMap(l=>l.features??[]).find(r=>r.id===id)?.state;}
function change(s,id,extra){const row=s.world.locations.flatMap(l=>(l.features??[]).map(r=>({...r,location:l.id}))).find(r=>r.id===id);draft(s).set(['state','records',`physical_feature:${id}`],{category:'physical_feature',id,location:row.location,state:{...state(s,id),...extra}});}
function publicCall(tool,args){
 const call=modelToolCall(tool,args),definition=toolDefinitions().find(d=>d.function.name===call.tool);assert.ok(definition);
 const schema=definition.function.parameters;
 for(const key of schema.required??[])assert.notEqual(call.args[key],undefined,key);
 for(const [key,value]of Object.entries(call.args)){assert.ok(schema.properties[key],key);if(schema.properties[key].enum)assert.ok(schema.properties[key].enum.includes(value),key);}
 return call;
}
async function run(s,tool,args,eventId=`mind-action-${++s.serial}`){
 const out=await s.engine.reduce(s.doc,{...publicCall(tool,args),eventId});s.doc=applyPatches(s.doc,out.patches);return out.result;
}
async function cast(s,op,target,extra={}){
 const before=s.doc,c=catalog(s,op),n=++s.serial;
 for(let i=0;i<100;i++){
  const eventId=`mind-${n}-${op}-${i}`,out=await s.engine.reduce(before,{...publicCall('world_cast',{spell:c.id,target,...extra}),eventId});
  if(out.result.checkSuccess&&out.result.effectFailed)assert.fail(out.result.effectFailed);
  if(out.result.success){s.doc=applyPatches(before,out.patches);return{...out.result,eventId};}
 }
 assert.fail(`未找到成功施法:${op}`);
}
async function denied(s,op,target,pattern,extra={}){
 const before=structuredClone(s.doc);
 await assert.rejects(s.engine.reduce(s.doc,{...publicCall('world_cast',{spell:catalog(s,op).id,target,...extra}),eventId:`denied-${++s.serial}`}),pattern);
 assert.deepEqual(s.doc,before);
}
const mentalArgs={authorization:'mental_consent',permit:'mental_permit'};
const wait=(s,minutes,activity)=>run(s,'world_time',{minutes,...(activity?{activity}:{})});
function contract(s,power=10){
 const d=draft(s),r=createBusinessContract(d,{kind:'supply',parties:['player',npc],subject:'item_iron',quantity:1,deadline:10000,business:'test',cost:10},`real-contract-${++s.serial}`);
 d.set(['state','records',r.id,'enforcement'],{channel:'shadow',active:true,power,target:npc,stressPerMinute:1,remaining:100,started:s.doc.state.minute,expires:s.doc.state.minute+1000,authorization:'mental_consent'});return r.id;
}
function known(s,id){
 const row=s.world.locations.flatMap(l=>(l.features??[]).map(r=>({...r,location:l.id}))).find(r=>r.id===id);
 s.doc.state.records[`known_anchor:${id}`]={category:'known_anchor',subject:id,owner:row.owner,location:row.location,position:row.position,fingerprint:digest({id:row.id,location:row.location,owner:row.owner,position:row.position,spaceAnchor:row.spaceAnchor}),discoveredAt:0,sourceEvent:'actual-discovery'};
 s.doc.state.records[`permission_${id}`]={category:'authorization',action:'teleport_anchor',subject:id,grantor:row.owner,grantee:'player',expires:1000000};
}
const cargoArgs={source:'feature_source',destination:'feature_destination',authorizations:['permission_feature_source','permission_feature_destination']};

test('机制图保留正式目录，二十个新消费者和三个位移候选完整可验证',()=>{
 const s=fixture();
 for(const op of Object.keys(mindSpaceMechanisms))assert.ok(catalog(s,op),op);
 for(const c of s.candidates)assert.deepEqual(validateMagicCatalog(c,{requireHandler:true}),[],c.id);
 const map=mechanismMap(original);
 for(const c of s.candidates){const row=map.rows.find(r=>r.id===c.id);assert.notEqual(row.status,'missing-consumer');assert.deepEqual(row.validation,[]);}
 const bad={...catalog(s,'sense_mind'),targeting:{lineOfSight:true}};assert.match(validateMagicCatalog(bad).join(';'),/同意|许可/);
});
test('自有感受封在持有单件，不接触他人记忆，超长文字及多件拒绝',async()=>{
 const s=fixture(),mem=structuredClone(s.doc.state.npcs[npc].memoryStream),r=await cast(s,'record_feeling','item_charcoal',{text:'我此刻有些紧张'});
 const record=s.doc.state.records[r.carrier];assert.equal(record.feeling,'我此刻有些紧张');
 assert.equal(s.doc.state.itemInstances[record.targetInstance].owner,'player');assert.deepEqual(s.doc.state.npcs[npc].memoryStream,mem);
 const inspected=await run(s,'world_environment',{operation:'inspect',target:'item_charcoal'});assert.equal(inspected.feelings[0].feeling,'我此刻有些紧张');
 await denied(s,'record_feeling','item_charcoal',/80字/,{text:'字'.repeat(81)});
 s.doc.state.inventory.item_charcoal.quantity=2;await denied(s,'record_feeling','item_charcoal',/单件/,{text:'自己的感受'});
});
test('自愿精神观察只返回干扰存在，不泄露思想；缺同意、许可、实际视线拒绝',async()=>{
 const s=fixture();
 await denied(s,'sense_mind',npc,/同意/,{permit:'mental_permit'});
 await denied(s,'sense_mind',npc,/许可/,{authorization:'mental_consent'});
 const r=await cast(s,'sense_mind',npc,mentalArgs);assert.equal(r.interference,true);assert.equal(r.interferenceCount,1);assert.ok(!JSON.stringify(r).includes('secret_thought'));
 delete s.doc.state.records[`local_actor_position:${npc}`];await denied(s,'sense_mind',npc,/距离|视线/,mentalArgs);
});
test('施法结束前授权到期会拒绝，完成时撤销同意整笔回滚',()=>{
 const s=fixture(),c=catalog(s,'sense_mind');s.doc.state.records.mental_consent.expires=s.doc.state.minute+c.minutes;
 assert.throws(()=>prepareMagic.call(s.engine,draft(s),c,{target:npc,...mentalArgs}),/同意/);
 s.doc.state.records.mental_consent.expires=100000;const p=prepareMagic.call(s.engine,draft(s),c,{target:npc,...mentalArgs});s.doc.state.records.mental_consent.revoked=true;
 assert.throws(()=>applyMagic.call(s.engine,draft(s),p,'completion'),/同意/);
});
test('既有精神状态与记忆可以直接观察保护，不额外要求疲劳字段',async()=>{
 const s=fixture();delete s.doc.state.npcs[npc].mental;
 s.doc.state.effects.actual_compulsion={kind:'status',target:npc,status:'compulsion',power:1,expires:s.doc.state.minute+100};
 const r=await cast(s,'sense_mind',npc,mentalArgs);assert.equal(r.interferenceCount,1);
 contact(s);const guard=await cast(s,'memory_guard',npc,{...mentalArgs,source:'old_memory'});assert.equal(guard.memory,'old_memory');assert.equal(guard.truthVerified,false);
});
test('疲惫者真实入睡并休养，睡眠中行动拒绝，到期恢复；高警觉者不会昏睡',async()=>{
 const s=fixture(),r=await cast(s,'sleep','player',{permit:'mental_permit'});assert.equal(r.sleeping,true);assert.equal(s.doc.state.player.activity,'睡眠');
 await assert.rejects(run(s,'world_move',{destination:far}),/睡眠/);
 await wait(s,30);assert.equal(s.doc.state.player.mental.fatigue,65);await wait(s,30);assert.notEqual(s.doc.state.player.activity,'睡眠');
 s.doc.state.player.mental.alertness=100;const before=s.doc.state.player.mental.fatigue;
 const alert=await cast(s,'sleep','player',{permit:'mental_permit'});assert.equal(alert.sleeping,false);assert.equal(s.doc.state.player.mental.fatigue,before);
});
test('NPC自愿睡眠阻止作息迁移，撤销授权立即终止且不追加休养',async()=>{
 const s=fixture();await cast(s,'sleep',npc,mentalArgs);
 const base=s.engine.byId.get(npc);base.schedule=structuredClone(original.npcs.find(n=>n.id===npc).schedule);
 const before=s.doc.state.minute;advanceNpcSchedules(draft(s),s.engine,before,before+20);assert.equal(s.doc.state.npcs[npc].activity,'睡眠');assert.equal(s.doc.state.npcs[npc].location,s.location);
 s.doc.state.records.mental_consent.revoked=true;const fatigue=s.doc.state.npcs[npc].mental.fatigue;await wait(s,5);
 assert.notEqual(s.doc.state.npcs[npc].activity,'睡眠');assert.equal(s.doc.state.npcs[npc].mental.fatigue,fatigue);
});
test('休养祝福只在实际休息推进疲劳，慰语有限减压且不消除干扰',async()=>{
 const s=fixture();await cast(s,'rest_bless','player');const before=s.doc.state.player.mental.fatigue;
 await wait(s,10);assert.equal(s.doc.state.player.mental.fatigue,before);
 await wait(s,20,'休息');assert.equal(s.doc.state.player.mental.fatigue,before-5);
 const m=structuredClone(s.doc.state.player.mental);await cast(s,'comfort','player');assert.equal(s.doc.state.player.mental.stress,m.stress-10);assert.deepEqual(s.doc.state.player.mental.interference,m.interference);
});
test('所选往事在护印期间不模糊，其他旧事照常模糊；到期不证明真假',async()=>{
 const s=fixture();s.engine.byId.get(npc).tier='full';s.doc.state.npcs[npc].memoryStream.push({...s.doc.state.npcs[npc].memoryStream[0],id:'other_memory'});
 const r=await cast(s,'memory_guard',npc,{...mentalArgs,source:'old_memory'});assert.equal(r.truthVerified,false);
 await wait(s,8*1440);
 let view=npcCognitionView(s.engine,s.doc,npc);assert.equal(view.memories.find(m=>m.id==='old_memory').content,'secret_old_fact');assert.equal(view.memories.find(m=>m.id==='other_memory').blurred,true);
 await wait(s,r.expires-s.doc.state.minute);view=npcCognitionView(s.engine,s.doc,npc);assert.equal(view.memories.find(m=>m.id==='old_memory').blurred,true);
 contact(s);await denied(s,'memory_guard',npc,/模糊/,{...mentalArgs,source:'old_memory'});
});
test('自己的长期事实护印实际取消检索衰减，到期恢复原衰减',async()=>{
 const s=fixture();s.doc.memories.own={subject:'player',content:'我在此处收过货',minute:0};
 await cast(s,'memory_guard','player',{source:'own',permit:'mental_permit'});
 const index=new MemoryIndex({entities:s.engine.entities}),m=s.doc.memories.own;index.upsert({id:'own',text:m.content,minute:m.minute,guardUntil:m.guardUntil});
 assert.equal(index.search('收过货',{now:10000})[0].score,index.search('收过货',{now:0})[0].score);
 assert.ok(index.search('收过货',{now:m.guardUntil})[0].score<index.search('收过货',{now:0})[0].score);
});
test('契痕审读返回真实原签条款差异，不宣判效力或泄露其他契约',async()=>{
 const s=fixture(),id=contract(s);s.doc.state.records[id].cost=20;
 const r=await cast(s,'contract_sense',id);assert.equal(r.legalJudgement,false);assert.deepEqual(r.changes,[{field:'cost',before:10,after:20}]);
 s.doc.state.records[id].parties=[npc];await denied(s,'contract_sense',id,/本人持有/);
});
test('反制终止实际暗影执行；过强契约会有限反噬双方并继续执行',async()=>{
 const s=fixture(),id=contract(s),before=s.doc.state.npcs[npc].mental.stress;
 await wait(s,2);assert.equal(s.doc.state.npcs[npc].mental.stress,before+2);contact(s);
 const r=await cast(s,'counter_contract',id,mentalArgs);assert.equal(r.countered,true);const stopped=s.doc.state.npcs[npc].mental.stress;await wait(s,5);assert.equal(s.doc.state.npcs[npc].mental.stress,stopped);
 const stronger=contract(s,30);contact(s);const own=s.doc.state.player.mental.stress;
 const b=await cast(s,'counter_contract',stronger,mentalArgs);assert.equal(b.backlash,true);assert.equal(s.doc.state.player.mental.stress,own+10);assert.equal(s.doc.state.records[stronger].enforcement.active,true);
 await denied(s,'counter_contract',stronger,/同意/,{permit:'mental_permit'});
});
test('材料腐蚀按抗性、实际时间损伤，留下可追查痕迹；活体和未知材料拒绝',async()=>{
 const s=fixture(),r=await cast(s,'corrode','feature_metal');await wait(s,10);assert.equal(state(s,'feature_metal').integrity,92);
 assert.equal(s.doc.state.records[`corrosion_trace:${r.eventId}`].sourceEvent,r.eventId);await wait(s,25);assert.equal(state(s,'feature_metal').integrity,76);
 change(s,'feature_metal',{alive:true});await denied(s,'corrode','feature_metal',/无生命/);
});
test('两点可见测距消费真实位置，不能用自报坐标或隔墙推断',async()=>{
 const s=fixture(),r=await cast(s,'measure','feature_source',{destination:'feature_point'});assert.equal(r.metres,5);
 await denied(s,'measure','feature_source',/真实环境/,{destination:'[3,4]'});
 s.world.locations.find(l=>l.id===s.location).features.push({id:'feature_wall',name:'wall',kind:'surface',owner:'player',position:[1.5,2],state:{blocksSight:true,blockRadiusMeters:1}});
 await denied(s,'measure','feature_source',/视线|隔墙/,{destination:'feature_point'});
});
test('袋内整理保持实际容量，取物只转移选中单件；他人物和超载拒绝',async()=>{
 const s=fixture(),before=Object.keys(s.doc.state.itemInstances);await cast(s,'organize','feature_bag');
 assert.deepEqual(state(s,'feature_bag').contents,['bag_a','bag_b']);assert.equal(state(s,'feature_bag').capacityKg,20);
 const r=await cast(s,'retrieve','feature_bag',{source:'bag_a'});assert.equal(r.instance,'bag_a');assert.equal(s.doc.state.itemInstances.bag_a.status,'持有');assert.equal(s.doc.state.inventory.item_charcoal.quantity,2);assert.deepEqual(state(s,'feature_bag').contents,['bag_b']);assert.deepEqual(Object.keys(s.doc.state.itemInstances),before);
 await denied(s,'retrieve','feature_bag',/真实袋内/,{source:'bag_a'});
 change(s,'feature_bag',{capacityKg:.00001});await denied(s,'organize','feature_bag',/容量/);
});
test('隔湿袋减少袋口渗水，破洞继续漏水，到期恢复',async()=>{
 const s=fixture();await cast(s,'bag_seal','feature_bag');const wet=state(s,'feature_bag').wetMl;
 await wait(s,10);assert.ok(Math.abs(state(s,'feature_bag').wetMl-wet-30)<1e-8);
 await wait(s,50);const expired=state(s,'feature_bag').wetMl;await wait(s,10);assert.equal(state(s,'feature_bag').wetMl-expired,120);
 change(s,'feature_bag',{closed:false});await denied(s,'bag_seal','feature_bag',/密封/);
});
test('短时封存拿走可用库存，失效原地掉出，取回同一单件且不能重复取',async()=>{
 const s=fixture(),r=await cast(s,'store','item_charcoal');assert.equal(s.doc.state.inventory.item_charcoal,undefined);assert.equal(s.doc.state.itemInstances[r.instance].status,'封存');
 await run(s,'world_move',{destination:far});await wait(s,30);const dropped=s.doc.state.itemInstances[r.instance];assert.equal(dropped.status,'落地');assert.equal(dropped.location,s.location);
 await denied(s,'retrieve',r.instance,/视野/);await run(s,'world_move',{destination:s.location});
 const pick=await cast(s,'retrieve',r.instance);assert.equal(pick.instance,r.instance);assert.equal(s.doc.state.inventory.item_charcoal.quantity,1);await denied(s,'retrieve',r.instance,/视野|手中/);
});
test('锁隙固定真实机械锁，普通接近必须持实际钥匙才能打开',async()=>{
 const s=fixture();await cast(s,'lock_space','feature_door');
 await assert.rejects(run(s,'world_environment',{operation:'approach',target:'feature_door'}),/钥匙/);
 await run(s,'world_environment',{operation:'approach',target:'feature_door',item:'item_iron'});assert.equal(state(s,'feature_door').locked,false);assert.equal(state(s,'feature_door').open,true);
});
test('获准门框警号消费正常通行事件，不宣称识破伪装；封界阻断路途并到期解除',async()=>{
 const s=fixture(),alarm=await cast(s,'alarm','feature_door');await run(s,'world_move',{destination:far});
 assert.equal(s.doc.state.effects[alarm.eventId].signals.length,1);assert.equal(s.doc.state.effects[alarm.eventId].signals[0].identified,false);
 await run(s,'world_move',{destination:s.location});const block=await cast(s,'block_space','feature_door');assert.match(block.publicSign,/暂时封闭/);
 await assert.rejects(run(s,'world_move',{destination:far}),/封界/);await wait(s,30);await run(s,'world_move',{destination:far});assert.equal(s.doc.state.location,far);
});
test('空间封界也阻断真实短移，公开标示可从正常观察读取',async()=>{
 const s=fixture();await cast(s,'block_space','feature_door');
 const v=await run(s,'world_environment',{operation:'inspect',target:'feature_door'});assert.match(v.mindSpace.publicSign,/空间封界/);
 await denied(s,'blink','feature_point',/封界/);
});
test('锚点偏移影响真实货运，需原所有者许可校准，货物在目的地归属守恒',async()=>{
 const s=fixture();known(s,'feature_source');known(s,'feature_destination');change(s,'feature_source',{anchorOffsetMeters:[.2,0]});
 await denied(s,'anchor_cargo','item_charcoal',/偏移/,cargoArgs);
 await denied(s,'calibrate_anchor','feature_source',/许可/);
 await cast(s,'calibrate_anchor','feature_source',{permit:'permission_feature_source'});assert.deepEqual(state(s,'feature_source').anchorOffsetMeters,[0,0]);
 const r=await cast(s,'anchor_cargo','item_charcoal',cargoArgs);assert.equal(s.doc.state.inventory.item_charcoal,undefined);assert.equal(s.doc.state.location,s.location);assert.equal(s.doc.state.itemInstances[r.instance].location,far);assert.equal(s.doc.state.itemInstances[r.instance].owner,'player');
 await run(s,'world_move',{destination:far});await cast(s,'retrieve',r.instance);assert.equal(s.doc.state.inventory.item_charcoal.quantity,1);
});
test('货运拒绝未知锚点、许可撤销、真实载荷超限、施法末端损坏和私人落地',async()=>{
 const s=fixture();await denied(s,'anchor_cargo','item_charcoal',/未知/,cargoArgs);
 known(s,'feature_source');known(s,'feature_destination');s.doc.state.records.permission_feature_destination.revoked=true;
 await denied(s,'anchor_cargo','item_charcoal',/许可/,cargoArgs);s.doc.state.records.permission_feature_destination.revoked=false;
 const def=s.engine.byId.get('item_charcoal'),weight=def.weight;def.weight=3;await denied(s,'anchor_cargo','item_charcoal',/载荷/,cargoArgs);def.weight=weight;
 const p=prepareMagic.call(s.engine,draft(s),catalog(s,'anchor_cargo'),{target:'item_charcoal',...cargoArgs});change(s,'feature_destination',{anchorIntact:false});assert.throws(()=>applyMagic.call(s.engine,draft(s),p,'completion-cargo'),/损坏/);
 change(s,'feature_destination',{anchorIntact:true});s.engine.byId.get(far).access={mode:'private',requiresConsent:true,residents:[npc]};
 await denied(s,'anchor_cargo','item_charcoal',/成年住户/,cargoArgs);
});
test('小型异常修补解除实际空间阻断，神性及大型裂隙不能缝合',async()=>{
 const s=fixture();
 await denied(s,'blink','feature_point',/空间封锁/);
 await cast(s,'repair_space','feature_anomaly');assert.equal(state(s,'feature_anomaly').blocksSpace,false);assert.equal(state(s,'feature_anomaly').spaceAnomaly.intensity,0);
 await cast(s,'blink','feature_point');assert.deepEqual(s.doc.state.records.local_player_position.point,[3,4]);
 s.doc.state.records.local_player_position.point=[0,0];change(s,'feature_anomaly',{spaceAnomaly:{divine:true,radiusMeters:.2,intensity:1}});await denied(s,'repair_space','feature_anomaly',/非神性/);
 change(s,'feature_anomaly',{spaceAnomaly:{divine:false,radiusMeters:1,intensity:1}});await denied(s,'repair_space','feature_anomaly',/小型/);
});
test('消费者状态能经正式存储恢复；同一事件重放不会复制封存单件',async()=>{
 const s=fixture(),root=await fs.mkdtemp(path.join(os.tmpdir(),'mind-space-'));
 try{
  const reducer=(doc,event)=>s.engine.reduce(doc,event),storage=new CampaignStorage(root,{reducer}),initial=structuredClone(s.doc);await storage.create({id:'test',worldVersion:s.world.version,document:initial});
  let chosen;
  for(let i=0;i<100;i++){
   const input={...publicCall('world_cast',{spell:catalog(s,'store').id,target:'item_charcoal'}),eventId:`persist-${i}`},out=await s.engine.reduce(initial,input);
   if(out.result.success){chosen={input,out};break;}
  }
  assert.ok(chosen);const request={id:chosen.input.eventId,anchor:'mind-space',input:chosen.input};await storage.transact('test',request,reducer);
  const fresh=new CampaignStorage(root,{reducer}),loaded=await fresh.read('test');s.doc=loaded.document;s.engine=new WorldEngine(structuredClone(s.world));
  assert.equal(s.doc.state.itemInstances[chosen.out.result.instance].status,'封存');
  await fresh.transact('test',request,reducer);assert.deepEqual((await fresh.read('test')).document,s.doc);
  const before=structuredClone(s.doc);await assert.rejects(s.engine.reduce(s.doc,chosen.input),/单件|持有/);assert.deepEqual(s.doc,before);
  await wait(s,30);assert.equal(s.doc.state.itemInstances[chosen.out.result.instance].status,'落地');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
