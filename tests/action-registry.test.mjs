// A1 动作注册表、world_act / world_actions 与 /actions 路由（06 §6.4、§6.10.1）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {toolDefinitions,resolveToolCall,catalogTools} from '../extension/tools.mjs';
import {loadActionRegistry,actionCall,findAction,actionOfCall,searchActions} from '../server-plugin/action-registry.mjs';
import {translateCall} from '../server-plugin/action-gateway.mjs';
import {ActionRejection} from '../server-plugin/action-rejection.mjs';
import {worldActions,QUICK} from '../server-plugin/action-affordances.mjs';
import {syncRegistry,render,REGISTRY} from '../tools/build-action-registry.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {init} from '../server-plugin/index.mjs';

const registry=loadActionRegistry(),catalog=JSON.parse(fs.readFileSync('docs/actions.json','utf8')).actions;
const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
const fresh=()=>engine.initialFromLegacy(seed,'a1-registry');

test('注册表：数据声明、带命名空间、与 S0 动作清单一一对应且为最新同步',()=>{
 // A3 adds B's open namespace; the S0 set below remains exact and unchanged.
 assert.deepEqual(registry.errors,[]);assert.deepEqual(registry.namespaces,['core','open']);
 const s0=registry.actions.filter(a=>a.source==='s0');
 assert.deepEqual(s0.map(a=>a.id).sort(),catalog.map(a=>a.id).sort());
 assert.ok(registry.actions.length>catalog.length,'注册表在 S0 别名之外还有模板动作');
 const doc=JSON.parse(fs.readFileSync(REGISTRY,'utf8'));
 assert.equal(fs.readFileSync(REGISTRY,'utf8').replace(/\r\n/g,'\n'),render(syncRegistry(doc,catalog).doc),'world/actions/core.json 须用 node tools/build-action-registry.mjs 同步');
 for(const a of registry.actions){
  assert.match(a.id,new RegExp(`^${a.namespace}:[a-z]`),a.id);assert.ok(a.label&&a.group&&a.narration,a.id);assert.ok(Array.isArray(a.synonyms)&&Array.isArray(a.slots)&&Array.isArray(a.preconditions),a.id);
  assert.ok(a.visibility&&a.cost&&'check' in a&&a.participants?.actor==='player',a.id);
 }
});

test('静态别名与 S0 一致，目录专有动作独立声明槽位并路由到原工具',()=>{
 const tools=new Map(toolDefinitions().map(d=>[d.function.name,d.function.parameters]));const byId=new Map(catalog.map(a=>[a.id,a]));
 // 06 §6.4/6.9.5: native definitions use outcomes, not a fabricated old tool.
 const nativeOutcomes={
  'core:practice.session':[{op:'learn',entity:'$actor',subject:{slot:'skill'},learningSource:'practice'}],
  'open:question':[{op:'emit',actor:'$actor',target:{slot:'target'},verb:'request',visibility:'witnessed',payload:{kind:'ask',text:{slot:'content'}}}],
  'open:waive_debt':[{op:'obligation.cancel',id:{slot:'obligation'},reason:'creditor_waiver'}],
  'open:leave_mark':[{op:'create',kind:'mark',facts:{intent:{slot:'intent'},form:{slot:'form'}}}]
 };
 assert.deepEqual(registry.actions.filter(a=>a.outcomes).map(a=>a.id),Object.keys(nativeOutcomes));
 for(const a of registry.actions){
  if(a.projection){assert.equal(a.call,null);continue;}
  // 06 §6.9: the archived proposal gateway is reached via world_act and the
  // existing HTTP proposal adapter, without adding a static tool definition.
  if(a.id==='open:proposal'){
   assert.equal(a.source,'catalog');assert.deepEqual(a.call,{tool:'world_propose'});
   assert.equal(a.cost.owner,'handler');assert.equal(a.check,'engine');
   const slots={intent:'尝试组合动作',effects:[{op:'emit',verb:'tell',visibility:'witnessed'}]};
   assert.deepEqual(translateCall('world_act',{action:a.id,slots}),{tool:'world_propose',args:slots,action:a});
   assert.deepEqual(a.slots.map(s=>s.name),['intent','effects','means','context','participants']);
   assert.deepEqual(a.slots.filter(s=>s.required).map(s=>s.name),['intent','effects']);continue;
  }
  if(a.outcomes){
   assert.equal(a.source,'catalog',a.id);assert.equal(a.cost.owner,'primitives',a.id);
   assert.ok(a.slots.every(s=>s.name&&s.kind),a.id);assert.deepEqual(a.outcomes,nativeOutcomes[a.id]);
   // A3-B round 7 adds two exact native programs; retain exhaustive outcome
   // equality and exercise each program's own required slots.
   const slots={'open:leave_mark':{intent:'留下一幅画',form:'涂画'},'open:question':{target:'npc_hw_linsui',content:'是否愿意带路'},'open:waive_debt':{obligation:'signed_debt'},'core:practice.session':{skill:'skill_survival',minutes:120}}[a.id];
   assert.deepEqual(translateCall('world_act',{action:a.id,slots}),{tool:'world_act',args:{action:a.id,slots},action:a});
   if(['open:leave_mark','open:question','open:waive_debt'].includes(a.id)){assert.equal(a.call,undefined);continue;}
   assert.deepEqual(a.call,{tool:'world_practice',operation:'session'});
  }
  // a3qy adds a catalog-only operation that calls the existing internal
  // environment handler directly. It must not widen the static tool surface.
  if(a.id==='core:environment.unlock'){
   assert.equal(a.source,'catalog');assert.deepEqual(a.call,{tool:'world_environment',operation:'unlock'});
   assert.equal(tools.has(a.call.tool),false);assert.equal(typeof engine.environment,'function');
   assert.deepEqual(a.slots,[{name:'target',kind:'entity',entity:'entity',required:true,fill:'target'},{name:'tool',kind:'entity',entity:'item'}]);
   assert.ok(a.preconditions.length&&a.consent.from==='self');
   const slots={target:'door',tool:'item_lockpick'},args={...slots,operation:'unlock'};
   assert.deepEqual(translateCall('world_act',{action:a.id,slots}),{tool:'world_environment',args,action:a});
   assert.deepEqual(resolveToolCall(a.call.tool,args),{tool:'world_environment',args});
   assert.throws(()=>translateCall('world_act',{action:a.id,slots:{...slots,success:true}}),error=>{
    assert.ok(error instanceof ActionRejection);assert.equal(error.code,'E-ACTION-PRECONDITION');
    assert.equal(error.message,'尝试开锁没有这些槽位：success；可填：target、tool');return true;
   });
   continue;
  }
  // a3r2-intent2: daily water operations follow the same catalog-only internal
  // environment route as unlock; retaining this separate contract avoids
  // expanding the static schema merely to satisfy the legacy-alias assertion.
  const dailyWater={draw_water:{source:'feature_hw_pool',container:'item_clay_pot'},pour_water:{target:'vessel'},drink_contents:{target:'vessel'}};
  if(a.call.tool==='world_environment'&&Object.hasOwn(dailyWater,a.call.operation)){
   assert.equal(a.id,`core:environment.${a.call.operation}`);assert.equal(a.source,'catalog');
   assert.equal(tools.has(a.call.tool),false);assert.equal(typeof engine.environment,'function');
   assert.ok(a.slots.every(s=>s.name&&s.kind));assert.ok(a.preconditions.length&&a.consent.from==='self');
   const slots=dailyWater[a.call.operation],args={...slots,operation:a.call.operation};
   assert.deepEqual(translateCall('world_act',{action:a.id,slots}),{tool:'world_environment',args,action:a});
   assert.deepEqual(resolveToolCall(a.call.tool,args),{tool:'world_environment',args});
   assert.throws(()=>translateCall('world_act',{action:a.id,slots:{...slots,success:true}}),error=>error instanceof ActionRejection&&error.code==='E-ACTION-PRECONDITION');
   continue;
  }
  const schema=tools.get(a.call.tool);assert.ok(schema&&!catalogTools.has(a.call.tool),a.id);
  if(a.source==='catalog'){
   assert.ok(a.slots.every(s=>s.name&&s.kind),`${a.id} 独立声明槽位`);
   assert.ok(a.preconditions.length&&a.consent?.from,`${a.id} 声明前置和同意来源`);
   const r=resolveToolCall(a.call.tool,{operation:a.call.operation});
   // 06 §6.10.1: catalog-only aliases reuse the existing site/environment
   // handlers, without exposing new static tools. Check the exact dispatch.
   const catalogAliases={
    'core:environment.douse_fire':{tool:'world_environment',args:{operation:'douse_fire'}},
    'core:site.gather_session':{tool:'world_site',args:{operation:'gather'}},
    // A3 daily22 exposes the existing private-field executor through the
    // catalogue without widening the static field-tool operation enum.
    'core:farm.private_sow':{tool:'world_farm',args:{operation:'private_sow'}},
    'core:farm.private_harvest':{tool:'world_farm',args:{operation:'private_harvest'}},
    // 指南11.3 F5：取出施法后的原水须走目录入口，仍核对精确分派。
    'core:environment.take_contents':{tool:'world_environment',args:{operation:'take_contents'}}
   };
   if(catalogAliases[a.id]){
    assert.deepEqual(r,catalogAliases[a.id]);continue;
   }
   assert.equal(r.tool,a.call.tool,a.id);assert.equal(r.args.operation,a.call.operation,a.id);
   continue;
  }
  if(a.call.operation)assert.ok(schema.properties.operation.enum.includes(a.call.operation),a.id);
  // 06 §6.10.1: catalog slots may grow without widening static aliases.
  // A3 added exact loan terms, irrigation quantity, study mode, retreat target
  // and manufacture batches to their native programs. Check the complete slot
  // shapes, retaining rejection of every unlisted addition to a static alias.
  const catalogAdditions={
   // a3qy: disarm declares an item tool slot; undeclared additions still fail below.
   'core:site.disarm':[{name:'tool',kind:'entity',entity:'item'}],
   'core:trade.lend':[{name:'interest',kind:'quantity'}],
   // 指南11.3 L5：仅扩动态目录；保留未登记槽位一律拒绝的断言。
   'core:trade.sell_to':[{name:'allowPartial',kind:'flag',label:'允许部分收购'}],
   'core:cast':[{name:'millilitres',kind:'quantity'}],
   'core:learn':[{name:'mode',kind:'choice',options:['acquire','study','observe']}],
   'core:combat':[{name:'destination',kind:'text'}],
   'core:craft.manufacture':[{name:'batches',kind:'quantity',min:1,max:100000,default:1}],
   // D18.2: read-only service quote, retaining the exact allowed-slot check.
   'core:craft.repair':[{name:'quote',kind:'flag'}],
   // 06 §6.10.1: the legal request object is a catalog slot of the six request-taking law
   // actions; it is not in world_law's static schema (static prompt budget, review 10-22).
   ...Object.fromEntries(['report','confess','appeal','claim','bribe','hire_advocate'].map(op=>[`core:law.${op}`,[{name:'request',kind:'object'}]]))
  };
  assert.deepEqual(a.slots.filter(s=>!(s.name in schema.properties)),catalogAdditions[a.id]??[],`${a.id} 未登记的目录新增槽位`);
  if(a.id==='core:trade.lend'){
   assert.equal(a.slots.find(s=>s.name==='interest').kind,'quantity');
   assert.equal(translateCall('world_act',{action:a.id,slots:{seller:'npc_hw_wushuo',coins:50,days:10,interest:0}}).args.interest,0,'同意中的零利息原样传入真实借款核验');
  }
  const r=resolveToolCall(a.call.tool,{...Object.fromEntries(a.slots.map(s=>[s.name,'x'])),...a.call.fixed,...(a.call.operation?{operation:a.call.operation}:{})});
  const s0=a.source==='s0'?byId.get(a.id):catalog.find(x=>x.tool===a.call.tool&&x.operation===(a.call.operation??null));
  assert.equal(r.tool,s0.internalTool,a.id);if(s0.internalOperation)assert.equal(r.args.operation,s0.internalOperation,a.id);
 }
});

test('world_act 与 world_actions 进入工具面但不算动作，静态提示不增加（≤ A1 前 10593 token）',async()=>{
 const names=toolDefinitions().map(d=>d.function.name);
 assert.ok(names.includes('world_act')&&names.includes('world_actions'));assert.equal(names.length,27);
 const bundle=await loadPromptBundle();assert.ok(bundle.budget.estimatedTokens<=10593,`静态提示 ${bundle.budget.estimatedTokens} token`);
 for(const d of toolDefinitions().filter(d=>catalogTools.has(d.function.name)))assert.ok(JSON.stringify(d).length<260,'目录工具定义只有一句话，动作说明在检索结果里');
 assert.ok(findAction(registry,'core:settlement.festival_plan').hint.includes('custom'),'从静态区移出的长说明进入动作目录');
});

test('world_act 翻译成旧调用：id 可省 core:，模板固定参数生效，未知动作与槽位给出可纠正的原因',()=>{
 assert.equal(findAction(registry,'trade.buy'),findAction(registry,'core:trade.buy'));assert.equal(findAction(registry,'other:trade.buy'),null);
 assert.deepEqual(translateCall('world_act',{action:'trade.lodge',slots:{seller:'林穗',days:2}}).args,{seller:'林穗',days:2,service:'住宿',operation:'trade'});
 assert.deepEqual(translateCall('world_act',{action:'time.rest',slots:{minutes:30}}),{tool:'world_time',args:{minutes:30,activity:'休息'},action:findAction(registry,'core:time.rest')});
 assert.deepEqual(translateCall('world_act',{action:'farm.buy',slots:{quantity:2}}).args,{quantity:2,operation:'farm_buy'});
 assert.deepEqual(translateCall('world_trade',{seller:'林穗'}),{tool:'world_trade',args:{seller:'林穗'},action:null});
 assert.throws(()=>translateCall('world_act',{action:'trade.fly'}),/没有这个动作.*world_actions/);
 assert.throws(()=>translateCall('world_act',{action:'trade.buy',slots:{seller:'林穗',item:'面包',quantity:1,price:1}}),/没有这些槽位：price/);
 assert.throws(()=>translateCall('world_act',{action:'trade.buy',slots:{seller:'林穗'}}),/还缺：item、quantity/);
 assert.throws(()=>translateCall('world_act',{action:'core:look'}),/不写进账本/);
 // A3-A7 replaces the obsolete dialogue promise with actual consent sources.
 // 06 §6.10.4: require the current world-facing reason; forged consent still throws.
 // 06 §6.10.4: typed business rejection retains the complete consent reason.
 assert.throws(()=>translateCall('world_act',{action:'trade.trade',slots:{seller:'林穗',service:'住宿',consent:true}}),error=>{
  assert.ok(error instanceof ActionRejection);assert.equal(error.code,'E-ACTION-PRECONDITION');
  assert.equal(error.message,'需要对方答应（须有同意事件、有效服务约定或对方当前决策，不能代填同意）');return true;
 },'任何动作都不接受调用方替对方答应');
 assert.throws(()=>translateCall('world_act',{action:'core:read',slots:{section:'行囊'}}),/只读查询/);
 assert.equal(actionOfCall(registry,'world_trade',{operation:'trade',service:'住宿'}).id,'core:trade.lodge');
 assert.equal(actionOfCall(registry,'world_trade',{seller:'林穗',item:'x'}).id,'core:trade.trade','模型常用的无 operation 交易调用归到同名子操作');
 assert.equal(actionOfCall(registry,'world_time',{minutes:5}).id,'core:time');
 assert.deepEqual(searchActions(registry,'存钱').map(a=>a.id).slice(0,1),['core:trade.deposit']);
});

test('同一存档上 world_act 与对应旧调用得到完全相同的补丁与回执（结算不变）',async()=>{
 const cases=[['trade.buy',{seller:'林穗',item:'面包',quantity:2},'world_trade',{seller:'林穗',item:'面包',quantity:2}],
  ['trade.lodge',{seller:'林穗',days:1},'world_trade',{seller:'林穗',service:'住宿',days:1}],
  ['time.rest',{minutes:60},'world_time',{minutes:60,activity:'休息'}],['move',{destination:'河湾村'},'world_move',{destination:'河湾村'}],
  ['core:trade.sell_to',{buyer:'林穗',item:'干粮',quantity:1},'world_trade',{seller:'player',buyer:'林穗',item:'干粮',quantity:1}]];
 for(const [action,slots,tool,args]of cases){
  const doc=fresh(),t=translateCall('world_act',{action,slots});
  const a=await engine.reduce(doc,{tool:t.tool,args:t.args,eventId:'same'}),b=await engine.reduce(doc,{tool,args,eventId:'same'});
  assert.deepEqual(a.patches,b.patches,action);assert.deepEqual(a.result,b.result,action);
 }
});

test('world_actions：此处可做、对人可做、快捷栏七项；槽位可选项来自玩家能感知的场景',()=>{
 const doc=fresh(),s=engine.scoped(doc),here=worldActions(s,doc);
 assert.deepEqual(here.quick.map(q=>q.label),QUICK);
 assert.match(here.scene[0],/青灯酒馆/);assert.match(here.scene[1],/林穗/);assert.match(here.scene[2],/出门是河湾村/);
 const lodge=here.actions.find(a=>a.id==='core:trade.lodge');assert.equal(lodge.fill.seller,'npc_hw_linsui');
 assert.ok(!here.actions.some(a=>a.id==='core:trade.deposit'),'酒馆里没有钱庄');
 const linsui=worldActions(s,doc,{target:'林穗'});assert.equal(linsui.target.kind,'npc');
 const buy=linsui.actions.find(a=>a.id==='core:trade.buy');assert.equal(buy.fill.seller,'npc_hw_linsui');
 assert.deepEqual(buy.slots.find(x=>x.name==='item').options.map(o=>o.value).sort(),Object.keys(doc.state.npcs.npc_hw_linsui.inventory).filter(k=>(doc.state.npcs.npc_hw_linsui.inventory[k].quantity??doc.state.npcs.npc_hw_linsui.inventory[k])>0).sort());
 const post={...doc,state:{...doc.state,location:'bld_hw_post'}},atPost=worldActions(engine.scoped(post),post);
 assert.ok(atPost.actions.some(a=>a.id==='core:trade.deposit'&&a.fill.seller),'驿站钱庄柜面可存钱，柜员预填');
 const lodge2=worldActions(s,doc).actions.find(a=>a.id==='core:trade.lodge');assert.equal(lodge2.blocked,undefined,'当班店主出租客房由旧判定决定');
 const home={...doc,state:{...doc.state,location:'bld_hw_riverhome',npcs:{...doc.state.npcs,npc_hw_xuling:{...doc.state.npcs.npc_hw_xuling,location:'bld_hw_riverhome'}}}};
 // A3-A7 changes the explanation, while private lodging still needs its host.
 assert.match(worldActions(engine.scoped(home),home).actions.find(a=>a.id==='core:trade.lodge').blocked,/^需要对方答应（须有同意事件、有效服务约定或对方当前决策，不能代填同意）$/,'私宅借住仍须房东真实答应');
 const search=worldActions(s,doc,{query:'钓鱼'});assert.equal(search.actions[0].id,'core:wildlife.fish');
 assert.deepEqual(doc,fresh(),'只读投影');
});

test('/actions 只读目录与 /execute 的 world_act：事件存旧调用、回执带事件流文字、幂等与只读动作拒绝',async t=>{
 const root=fs.mkdtempSync(path.join(tmpRoot(),'a1-actions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=express();app.use(express.json({limit:'50mb'}));const router=express.Router();await init(router,{baseRoot:root,world,npcPlanningEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const request=async(endpoint,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const listed=await request('/actions',{});assert.equal(listed.status,200);assert.equal(listed.body.count,registry.actions.length);assert.ok(listed.body.actions.every(a=>a.id&&a.label&&!('call' in a)));
 const created=await request('/create',{name:'界面旅人'}),campaignId=created.body.reference.campaignId;
 const here=await request('/actions',{campaignId});assert.equal(here.status,200);assert.ok(here.body.quick.length===7&&here.body.scene.length>=3);
 assert.deepEqual((await request('/actions',{resolve:{action:'trade.lodge',slots:{seller:'林穗'}}})).body,{action:'core:trade.lodge',tool:'world_trade',args:{seller:'林穗',service:'住宿',operation:'trade'},clientRead:false});
 const bought=await request('/execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},eventId:'ui-buy',anchor:null});
 assert.equal(bought.status,200);assert.equal(bought.body.narration.action,'core:trade.buy');assert.match(bought.body.narration.lines[0],/林穗.*面包.*文/);
 assert.ok(bought.body.narration.applied.some(e=>e.op==='transfer'&&e.holder==='player'&&e.resource==='coin'&&e.delta<0));
 assert.equal((await request('/execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},eventId:'ui-buy',anchor:null})).body.duplicate,true);
 const legacy=await request('/execute',{campaignId,tool:'world_time',args:{minutes:10},eventId:'legacy-wait'});assert.equal(legacy.body.narration.action,'core:time');
 const exported=(await request('/export',{campaignId})).body,event=exported.events.find(e=>e.id==='ui-buy');
 assert.deepEqual(event.input,{tool:'world_trade',args:{seller:'林穗',item:'面包',quantity:1,operation:'trade'},eventId:'ui-buy'});assert.equal(event.anchor,null);
 assert.equal((await request('/execute',{campaignId,tool:'world_act',args:{action:'core:look'},eventId:'look'})).status,400);
 const refused=await request('/execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:'林穗',item:'面包',quantity:99999}},eventId:'too-many'});
 assert.equal(refused.status,400);assert.match(refused.body.error,/库存不足|只剩/);
 assert.equal((await request('/read',{campaignId})).body.reference.sequence,exported.events.length);
});
