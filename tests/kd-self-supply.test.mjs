// 卡 D：关掉玩家的采集入口（玩家整段只等待），世界仍由 NPC 按职业采集自给；采得的东西来自据点账，钱物守恒。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {laborCategories} from '../server-plugin/npc-labor.mjs';
import {conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
// 玩家的采集入口：任何一次调用都算违规，测试直接失败。
const PLAYER_GATHER=/^core:(site\.(gather|mine|woodcut)|wildlife\.(gather|fish)|farm\.harvest)$/;
const npcHeld=(doc,item)=>Object.entries(doc.ledger.accounts).filter(([k,v])=>{const [owner,res,purpose]=k.split('|');return v>0&&res===item&&purpose==='inventory'&&doc.state.npcs[owner];}).reduce((n,[,v])=>n+v,0);

test('玩家不采集，NPC 按职业采集补入，世界自给且守恒', {timeout:1200000}, async()=>{
 const engine=new WorldEngine(structuredClone(world));
 const reduce=engine.reduce.bind(engine);
 engine.reduce=(doc,input)=>{if(PLAYER_GATHER.test(input?.args?.action??''))throw Error(`玩家采集入口已关闭：${input.args.action}`);return reduce(doc,input);};
 let doc=engine.createCharacter(seed,{},'kds'),n=0;
 const step=async slots=>{const out=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots},eventId:`kds-${n++}`});if(out.patches?.length)doc=applyPatches(doc,out.patches);};
 await step({until:{dayOffset:1,hour:6}});
 const start=doc,days=3,startMinute=doc.state.minute;
 for(let i=0;i<24*days;i++)await step({minutes:60});
 const gathers=Object.values(doc.state.records).filter(r=>r.category==='labor'&&r.labor==='gather'&&r.minute>startMinute);
 assert.ok(gathers.length>0,'NPC 应按职业采集');
 const items=new Set(gathers.flatMap(r=>r.produced.map(p=>p.item)));
 assert.ok(items.size>=2,`应不止一种采集产物：${[...items]}`);
 for(const r of gathers){
  assert.ok(laborCategories(engine,doc.state,r.npc).includes('gather'),`${r.npc} 的职业不含采集`);
  assert.ok(r.produced.every(p=>p.quantity>0));
  assert.ok(doc.state.npcAutonomy.actions[r.sourceEvent],'采集对应一条自主行动');
 }
 // 采集是逐日的劳动而非一次性的：不止一天有人采。据点存量有限，采空后要等再生（存量与再生量是世界数据），
 // 所以这里不要求每一天都有。
 assert.ok(new Set(gathers.map(r=>Math.floor(r.minute/1440))).size>=2,'采集应持续不止一天');
 // 采得的东西来自据点资源账：据点储量账户的净流出（含期间再生与首次开户）等于采集记录的总量，NPC 手里有这些东西。
 for(const item of items){
  const recorded=gathers.reduce((s,r)=>s+r.produced.filter(p=>p.item===item).reduce((a,p)=>a+p.quantity,0),0);
  const before=Object.entries(start.ledger.accounts).filter(([k])=>k.startsWith('site:')&&k.split('|')[1]===item).reduce((s,[,v])=>s+v,0);
  const after=Object.entries(doc.ledger.accounts).filter(([k])=>k.startsWith('site:')&&k.split('|')[1]===item).reduce((s,[,v])=>s+v,0);
  const regrown=(doc.ledger.flows[`src:regrowth|${item}|site`]??0)-(start.ledger.flows[`src:regrowth|${item}|site`]??0);
  const opened=(doc.ledger.flows[`src:genesis|${item}|site`]??0)-(start.ledger.flows[`src:genesis|${item}|site`]??0);
  // 林木据点的木料记在林木账上（forest-water），由下面的总账守恒核对。
  const siteBooked=Object.keys(doc.ledger.accounts).some(k=>k.startsWith('site:')&&k.split('|')[1]===item);
  if(siteBooked)assert.equal(before+regrown+opened-after,recorded,`${item} 的据点流出应等于采集记录`);
  assert.ok(npcHeld(doc,item)>0,`${item} 在 NPC 手中应有存量`);
 }
 assert.deepEqual(auditLedger(doc.ledger),[]);
 assert.deepEqual(conservation(engine,start,doc),[]);
});
