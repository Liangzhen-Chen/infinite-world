import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {currentShops,advanceShops,tradeQuote} from '../server-plugin/shop.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {physicalFeature,placeView,populationView,itemView} from '../server-plugin/entity-view.mjs';
import {publicSettlement} from '../server-plugin/settlement-profile.mjs';
import {advanceTribalAwakening,tribalKey,tribalOrgId} from '../server-plugin/tribal-awakening.mjs';
import {remoteWorld} from '../server-plugin/remote-generation.mjs';
import {applyEffects} from '../server-plugin/effects.mjs';
import {forestHabitatCapacity} from '../server-plugin/forest-water.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440,Q=90*DAY;
const host='npc_hw_linsui',inn='bld_hw_qingdeng';
function fixture(){
 const w=structuredClone(world);for(const n of w.npcs){delete n.tier;delete n.schedule;}
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'entity-world');doc.state.minute=600;
 const d={document:doc,get(...path){return path.reduce((o,k)=>o?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};
 const act=async(tool,args,eventId)=>{const out=await engine.reduce(d.document,{tool,args,eventId});d.document=applyPatches(d.document,out.patches);return out.result;};
 return {w,engine,d,act};
}
const shelf=(d,id,item)=>{const v=d.get('state','npcs',id,'inventory',item);return typeof v==='number'?v:v?.quantity??0;};
const rolled=(doc,label)=>{for(let n=0;;n++){const id=`${label}_${n}`;if(createHash('sha256').update(`${doc.randomSeed}:${id}:d20`).digest().readUInt32LE(0)%20+1===20)return id;}};

test('迁店后补货产地、付款和新报价读取当前工作地；历史事实不变、报价重派生',()=>{
 const {engine,d}=fixture(),state=d.get('state');
 state.settlements.loc_bs={population:1000,treasury:900,food:100,iron:100};
 state.npcs[host].coins=100;state.npcs[host].inventory.item_bread=0;
 const quote=tradeQuote(d,engine,{buyer:'player',seller:host,item:'item_bread',location:inn,base:()=>2});
 // S5-02 /15.2: abundant food clamps to .5; baseline2 *other factors1
 // *one portion =1. Quote objects are observations, never saved daily truth.
 assert.equal(quote.totalCoins,1);const oldQuote=structuredClone(quote);
 d.set(['state','npcs',host,'residence'],{settlement:'loc_bs',home:'loc_bs',since:600,workChanged:false,schedule:{default:[{start:0,end:1440,location:'loc_bs',activity:'营业',services:['trade']}]}});
 const shop=currentShops(engine,d.get('state')).find(s=>s.keeper===host);
 assert.equal(shop.settlement,'loc_bs');assert.equal(shop.location,'loc_bs');
 assert.equal(shop.restock.find(r=>r.item==='item_bread').source,'route');
 assert.equal(shop.restock.find(r=>r.item==='item_bread').from,'loc_hw','迁店后的来源产地仍须正确派生，未到货不改变来源');
 // K2（卡 E）依据：铁匠铺的铁镰货架不再从模拟范围外进货，改向本聚落真实持货人进货；夹具安排一位村民手里有 3 把铁镰。
 const holder='npc_hw_shendu';d.set(['state','npcs',holder,'inventory','item_sickle'],3);
 const holderCoins=d.get('state','npcs',holder,'coins'),smithCoins=d.get('state','npcs','npc_hw_duanyan','coins');
 const cash=d.get('state','npcs',host,'coins'),treasury=d.get('state','settlements','loc_hw','treasury');
 advanceShops(d,engine,600,DAY);
 const ledger=d.get('state','records','shop:shop_hw_qingdeng'),row=ledger.entries.find(e=>e.item==='item_bread');
 // K08/K12：迁店把本地面包改为远途来源，但没有到场持货人/到站运单，不能按日期生成现货。
 assert.equal(ledger.settlement,'loc_bs');assert.equal(row.source,'route');assert.equal(row.added,0);assert.equal(row.paidCopper,0);assert.deepEqual(row.shipments,[]);
 assert.equal(row.from,undefined);assert.equal(shelf(d,host,'item_bread'),0);
 assert.equal(d.get('state','npcs',host,'coins'),cash-row.paidCopper);
 // K08没有远途现货或运费流；铁镰的真实本地补货单独记账。
 // K2（卡 E）依据：原断言是铁镰 1 把、20 铜付进公库（模拟范围外进货）；现在货架补上的铁镰来自那位村民，
 // 他的铁镰相应减少，货款进他的钱袋（扣去他自己缴的商税），公库只多出这笔商税。
 const sickle=d.get('state','records','shop:shop_hw_forge').entries.find(e=>e.item==='item_sickle');
 const tax=Object.values(d.get('state','records')).filter(r=>r.category==='trade_tax'&&r.payer===holder).reduce((n,r)=>n+r.amount,0);
 assert.equal(sickle.added,1);assert.ok(sickle.paidCopper>0);assert.deepEqual(sickle.from,[holder]);
 assert.equal(shelf(d,'npc_hw_duanyan','item_sickle'),1);assert.equal(shelf(d,holder,'item_sickle'),2);
 assert.equal(d.get('state','npcs',holder,'coins'),holderCoins+sickle.paidCopper-tax);
 assert.equal(d.get('state','settlements','loc_hw','treasury'),treasury+tax);assert.equal(row.cost,undefined);
 // 守恒：铁匠付出的正是村民收到的加商税（本夹具不开账本，按钱袋与公账核对）。
 assert.equal(smithCoins-d.get('state','npcs','npc_hw_duanyan','coins'),sickle.paidCopper);
 const history=structuredClone(d.get('state','records'));
 const moved=tradeQuote(d,engine,{buyer:'player',seller:host,item:'item_bread',location:'loc_bs',base:()=>999});
 // Updated baseline input999 *plentiful supply.5 *neutral grade/regard/
 // spread/depth/corrections1 *one =499.5, truncate once to499.
 assert.equal(moved.totalCoins,499);assert.equal(moved.settlement,'loc_bs');
 assert.notDeepEqual(moved,quote);assert.deepEqual(quote,oldQuote);
 assert.deepEqual(d.get('state','records'),history,'requoting cannot rewrite restock or transaction history');
 d.set(['state','minute'],DAY+600);
 assert.equal(tradeQuote(d,engine,{buyer:'player',seller:host,item:'item_bread',location:'loc_bs',base:()=>2}).settlement,'loc_bs');
});

test('迁居改业、拘押、死亡使原店停止补货；接手原工作地的现经营者易主',()=>{
 const {engine,d}=fixture(),before=shelf(d,host,'item_bread');
 d.set(['state','npcs',host,'residence'],{since:600,workChanged:true,settlement:'loc_bs',schedule:{default:[{start:0,end:1440,location:'loc_bs',services:[]}]}});
 assert.ok(!currentShops(engine,d.get('state')).some(s=>s.keeper===host));
 d.remove(['state','npcs',host,'residence']);
 d.set(['state','npcs',host,'vocation'],{id:'changed',since:600,services:[],schedule:{default:[{start:0,end:1440,location:inn,services:[]}]}});
 advanceShops(d,engine,600,DAY);assert.equal(shelf(d,host,'item_bread'),before);
 assert.ok(!currentShops(engine,d.get('state')).some(s=>s.keeper===host));
 d.remove(['state','npcs',host,'vocation']);
 d.set(['state','records','legal_detention:v5'],{category:'legal_detention',subject:host,location:inn,status:'生效',minute:0,expires:DAY});
 assert.ok(!currentShops(engine,d.get('state')).some(s=>s.keeper===host));
 d.remove(['state','records','legal_detention:v5']);d.set(['state','npcs',host,'status'],'死亡');
 assert.ok(!currentShops(engine,d.get('state')).some(s=>s.keeper===host));
 const successor='npc_hw_ayan',base=engine.byId.get(successor);base.shopType='tavern';base.services=['trade'];base.workplace={location:inn};
 d.set(['state','npcs',successor,'inventory','item_bread'],0);
 const shop=currentShops(engine,d.get('state')).find(s=>s.id==='shop_hw_qingdeng');assert.equal(shop.keeper,successor);
 // K2（卡 E）依据：接手人的面包货架向本聚落持货人进货（原先凭空补上）。先看反面：村里除了已故原店主没人有面包，补不上，回执说明原因。
 const empty=structuredClone(d.document);
 for(const [id,n]of Object.entries(empty.state.npcs))if(id!==host&&n.inventory?.item_bread)n.inventory.item_bread=0;
 const none={...d,document:empty};advanceShops(none,engine,600,DAY);
 assert.equal(shelf(none,successor,'item_bread'),0);
 assert.match(none.get('state','records','shop:shop_hw_qingdeng').entries.find(e=>e.item==='item_bread'&&e.minute===DAY).reason,/没有人持有|余量/);
 // 正面：一位村民手里有 8 个面包，接手人从他那里补上货架，他的面包减少，货款进他的钱袋。
 const holder='npc_hw_shendu';d.set(['state','npcs',holder,'inventory','item_bread'],8);const holderCoins=d.get('state','npcs',holder,'coins');
 advanceShops(d,engine,600,DAY);assert.ok(shelf(d,successor,'item_bread')>0);assert.equal(shelf(d,host,'item_bread'),before);
 const bread=d.get('state','records','shop:shop_hw_qingdeng').entries.find(e=>e.item==='item_bread'&&e.minute===DAY&&e.added);
 const tax=Object.values(d.get('state','records')).filter(r=>r.category==='trade_tax'&&r.payer===holder).reduce((n,r)=>n+r.amount,0);
 assert.deepEqual(bread.from,[holder]);assert.equal(shelf(d,holder,'item_bread'),8-bread.added);assert.equal(shelf(d,successor,'item_bread'),bread.added);
 assert.equal(d.get('state','npcs',holder,'coins'),holderCoins+bread.paidCopper-tax);
});

test('树木居民与运行时改换物种从实际身体派生，借形到期与单件读取不写存档',()=>{
 const {engine,d}=fixture(),tree='npc_ms_yg_jiecang',state=d.get('state'),before=structuredClone(state);
 const traits=traitsOf(engine,state,tree);assert.ok(traits.tags.includes('plant'));assert.ok(traits.tags.includes('bark'));assert.ok(!traits.tags.includes('flesh'));
 assert.deepEqual(state,before);
 state.npcs[tree].species='monster_black_fin_perch';assert.ok(traitsOf(engine,state,tree).tags.includes('fish'));assert.ok(!traitsOf(engine,state,tree).tags.includes('bark'));
 state.npcs[tree].body={species:'monster_knot_elm_sprite'};state.npcs[tree].form={as:'人形',until:601};
 assert.ok(traitsOf(engine,state,tree).tags.includes('bark'));assert.ok(traitsOf(engine,state,tree).tags.includes('shapeshifted'));
 state.minute=601;assert.ok(!traitsOf(engine,state,tree).tags.includes('shapeshifted'));
 state.itemInstances.v5={id:'v5',item:'item_kitchen_knife',owner:tree,status:'持有',durability:12};
 assert.equal(itemView(engine,state,'v5').owner.value,tree);assert.ok(traitsOf(engine,state,'v5').tags.includes('metal'));
});

test('聚落公开人口、家户与主官权限跟随当前迁居与任免；空缺不回退原主官',()=>{
 const {engine,d,w}=fixture(),sid='loc_bs_yupo',profile=w.settlementProfiles.find(p=>p.id===sid),original=publicSettlement(w,sid,d.document);
 d.set(['state','settlements',sid,'population'],profile.population+1);
 const foreign=w.households.find(h=>h.settlement!==sid),local=w.households.find(h=>h.settlement===sid),person=foreign.members[0];
 d.set(['state','family','households',foreign.id],{left:[person]});d.set(['state','family','households',local.id],{members:[person]});
 const key='governance_office:v5';d.set(['state','records',key],{category:'governance_office',holder:'player',settlement:sid,office:'office_village_head',status:'在任',until:DAY,appointedAt:600,source:'任命书'});
 let current=publicSettlement(w,sid,d.document);assert.equal(current.population,original.population+1);assert.equal(current.governance.head.id,'player');
 assert.deepEqual(current.governance.permissions.head,engine.rules.governance.authority.offices.office_village_head.powers);
 const house=w.households.find(h=>h.settlement===sid&&h.id!==local.id);
 assert.ok(house);d.set(['state','family','households',house.id],{left:[...house.members]});assert.equal(publicSettlement(w,sid,d.document).householdCount,original.householdCount-1);
 d.set(['state','records',key,'status'],'已撤职');current=publicSettlement(w,sid,d.document);assert.equal(current.governance.head,null);assert.deepEqual(current.governance.permissions.head,[]);
 assert.equal(placeView(engine,d.get('state'),sid).government.head.override,true);
});

test('K6冻结记录在钓鱼实际结算中阻止捕获，解冻后鱼群扣减且产出一份鱼',async()=>{
 const {engine,d,act}=fixture(),h=engine.rules.wildlife.habitats.find(h=>h.id==='habitat_hw_water');
 // D05 5.5 / approved S505C: the actual bamboo rod and finite earthworms
 // replace the cleaning knife as fishing inputs; retain freeze and pool assertions.
 const arranged=applyIntentSetup(engine,d.document,{location:h.location,inventory:{item_earthworm_bait:10,item_bamboo_fishing_rod:1,item_water:10}});
 assert.deepEqual(arranged.setupUnmet,[]);d.document=arranged.document;
 const feature=engine.byId.get(h.location).features.find(f=>f.kind==='water');assert.ok(feature);
 applyEffects(d,engine,[{kind:'environment',locations:[h.location],state:'frozen',minutes:300}],{minute:600,sourceEvent:'freeze'},'world');
 assert.equal(physicalFeature(engine,d.get('state'),feature.id).state.value.frozenUntil,900);
 const species='monster_black_fin_perch',count=populationView(engine,d.get('state'),h.id,species).population.value.count;
 const frozen=await act('world_field',{operation:'wildlife_fish',species},rolled(d.document,'frozen'));
 assert.equal(frozen.success,false);assert.equal(frozen.reason,'水面封冻');assert.deepEqual(frozen.obtained,[]);
 assert.equal(populationView(engine,d.get('state'),h.id,species).population.value.count,count);
 d.set(['state','records',`physical_feature:${feature.id}`,'state','frozenUntil'],0);
 const thawed=await act('world_field',{operation:'wildlife_fish',species},rolled(d.document,'thawed'));
 assert.equal(thawed.success,true);assert.equal(thawed.obtained[0].quantity,1);assert.equal(populationView(engine,d.get('state'),h.id,species).population.value.count,count-1);
});

test('U11自治地点可进入并展开同种居民，往返、重启与重放保留名册、路网和K8栖地',async()=>{
 const {engine,d,act,w}=fixture(),dyn=engine.rules.tribalAwakening.dynamics.find(x=>x.id==='badger_northwood');
 d.set(['state','records',tribalKey(dyn.id)],{category:'tribal_awakening',id:dyn.id,status:'听息',progress:engine.rules.tribalAwakening.thresholds.liyi-1,totals:{magic:0,teach:0,injustice:0},taught:0,choiceTotals:{teach:0,trade:0,mediate:1,suppress:0},seen:{displaced:0},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null,lastTick:0});
 advanceTribalAwakening(d,engine,{before:Q-1,after:Q});
 const eco=d.get('state','records',`ecology:${dyn.habitat}`,'populations',dyn.species);
 d.set(['state','records',`ecology:${dyn.habitat}`,'populations',dyn.species],{...eco,count:eco.count+2,born:eco.born+2});
 const org=tribalOrgId(dyn.id,'accord');d.set(['state','records',`tribal_clock:${org}`,'filled'],engine.rules.tribalAwakening.clock.segments);
 advanceTribalAwakening(d,engine,{before:2*Q-1,after:2*Q});
 const record=d.get('state','records',`tribal_settlement:${dyn.id}`);assert.ok(record);const sk=record.skeleton;
 // R24: the wild range keeps half its capacity (at least a breeding pair); only the surplus joins.
 const keep=Math.max(2,Math.ceil(forestHabitatCapacity(engine,d.get('state'),engine.rules.wildlife.habitats.find(h=>h.id===dyn.habitat),engine.byId.get(dyn.species))/2));
 assert.ok(eco.count+2>keep,'夹具野生存量超出可持续保留量');assert.equal(sk.population,eco.count+2-keep);assert.equal(d.get('state','records',`ecology:${dyn.habitat}`,'populations',dyn.species,'count'),keep);
 d.set(['state','location'],dyn.home);
 const arrival=d.document,out=await engine.reduce(arrival,{tool:'world_move',args:{destination:sk.id},eventId:'v5-enter'});d.document=applyPatches(arrival,out.patches);
 const replay=await engine.reduce(arrival,{tool:'world_move',args:{destination:sk.id},eventId:'v5-enter'},{replay:true,result:out.result});assert.deepEqual(replay.patches,out.patches);
 await act('world_move',{destination:sk.districts[0].id},'v5-district');
 const inhabitants=Object.values(d.get('state','created')).filter(p=>p.settlement===sk.id);assert.ok(inhabitants.length);assert.ok(inhabitants.every(p=>p.species===dyn.species));
 const population=structuredClone(d.get('state','population',sk.id)),overlay=engine.scoped(d.document);
 assert.equal(publicSettlement(overlay.world,sk.id,d.document).population,sk.population);
 const habitat=overlay.rules.wildlife.habitats.find(h=>h.location===`${sk.id}_wild`);assert.ok(habitat);assert.ok(d.get('state','records',`ecology:${habitat.id}`));
 await act('world_move',{destination:dyn.home},'v5-return');await act('world_move',{destination:sk.districts[0].id},'v5-back');
 assert.deepEqual(d.get('state','population',sk.id),population);
 const saved=JSON.parse(JSON.stringify(d.document)),fresh=new WorldEngine(structuredClone(w)).scoped(saved);
 assert.deepEqual(fresh.world.locations,remoteWorld(w,saved.state).locations);assert.deepEqual(fresh.rules.wildlife.habitats,engine.scoped(d.document).rules.wildlife.habitats);
 assert.deepEqual(fresh.route(dyn.home,sk.districts[0].id,'walk',saved.state.minute,saved.randomSeed),engine.scoped(d.document).route(dyn.home,sk.districts[0].id,'walk',saved.state.minute,saved.randomSeed));
 assert.deepEqual(saved.state.population[sk.id],population);
 // A pre-V5 U11 skeleton has no public ledger or derived range yet.
 const old=structuredClone(saved);delete old.state.settlements[sk.id];delete old.state.records[`ecology:${habitat.id}`];old.state.location=dyn.home;
 const resumed=new WorldEngine(structuredClone(w)),step=await resumed.reduce(old,{tool:'world_move',args:{destination:sk.id},eventId:'v5-old-enter'}),after=applyPatches(old,step.patches);
 const replayOld=await resumed.reduce(old,{tool:'world_move',args:{destination:sk.id},eventId:'v5-old-enter'},{replay:true,result:step.result});assert.deepEqual(replayOld.patches,step.patches);
 assert.equal(after.state.settlements[sk.id].population,sk.population);assert.ok(after.state.records[`ecology:${habitat.id}`]);assert.deepEqual(after.state.population[sk.id],population);
});
