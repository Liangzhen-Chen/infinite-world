import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import '../server-plugin/engine.mjs';
import {SOCIAL_VERBS,worldEventSubscribers} from '../server-plugin/world-events.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {effectKinds} from '../server-plugin/effects.mjs';
import {interactionRules} from '../world/design/interaction-rules.mjs';

async function run(){
 try{return execFileSync(process.execPath,['tools/system-map.mjs'],{encoding:'utf8'});}
 catch(error){
  if(error.code!=='EPERM')throw error;
  // Sandboxed runners may forbid child processes; execute the same CLI entry in process.
  const argv=process.argv,log=console.log;let out='';
  try{
   process.argv=[process.execPath,fileURLToPath(new URL('../tools/system-map.mjs',import.meta.url))];
   console.log=(...args)=>{out+=args.join(' ')+'\n';};
   await import('../tools/system-map.mjs');
  }finally{process.argv=argv;console.log=log;}
  return out;
 }
}
const out=await run();
const data=JSON.parse(fs.readFileSync('docs/system-map.json','utf8'));
const html=fs.readFileSync('docs/system-map.html','utf8');

test('脚本可运行并生成两个文件',()=>{
 assert.match(out,/system-map:/);
 assert.equal(data.title,'无限原野系统地图');
 assert.match(html,/<title>无限原野系统地图<\/title>/);
});

test('导出覆盖全部推进注册项（id 与 order）',()=>{
 assert.deepEqual(data.advance.map(a=>[a.id,a.order]),advanceRegistry.map(s=>[s.id,s.order]));
 for(const a of data.advance)assert.ok(a.modules.length,`${a.id} 没有归属模块`);
});

test('导出覆盖全部 25 个工具，且每个工具都分派到处理模块',()=>{
 const names=toolDefinitions().map(d=>d.function.name);
 assert.equal(names.length,25);
 assert.deepEqual(data.tools.map(t=>t.name),names);
 for(const t of data.tools){
  assert.ok(t.routes.length,`${t.name} 无分派`);
  for(const r of t.routes)assert.ok(r.handler&&r.modules.length,`${t.name}→${r.tool} 找不到处理器`);
  assert.ok(t.systems.length,`${t.name} 未归到系统`);
 }
});

test('导出覆盖全部世界事件动词与订阅者',()=>{
 for(const v of SOCIAL_VERBS)assert.ok(data.worldEvents.verbs.includes(v),`缺动词 ${v}`);
 const registered=worldEventSubscribers();
 assert.equal(data.worldEvents.subscribers.length,registered.length+1);
 assert.deepEqual(data.worldEvents.subscribers.slice(0,-1).map(s=>s.id),registered.map(s=>s.id));
 for(const s of data.worldEvents.subscribers)assert.ok(s.module,`订阅者 ${s.fn} 没有来源模块`);
});

test('K8：仍需手动接线只剩新工具；栖地按地形派生；engine 不再持订阅者数组',()=>{
 assert.deepEqual(data.findings.manualWiring.map(m=>m.content),['工具']);
 const monster=data.contentTypes.find(c=>c.id==='monster'),location=data.contentTypes.find(c=>c.id==='location');
 assert.ok(monster.hooks.find(h=>h.field==='habitatTags')?.modules.includes('server-plugin/wildlife-habitats.mjs'));
 assert.ok(location.hooks.find(h=>h.field.startsWith('terrain / biome'))?.modules.includes('server-plugin/wildlife-habitats.mjs'));
 assert.doesNotMatch(fs.readFileSync('server-plugin/engine.mjs','utf8'),/worldEventSubscribers/);
});

test('交互规则、效果类型、立场传导与实际注册一致',()=>{
 assert.deepEqual(data.interactions.rules.map(r=>r.id),interactionRules.rules.map(r=>r.id));
 assert.deepEqual(data.effects.kinds.map(k=>k.kind),effectKinds().sort());
 for(const k of data.effects.kinds)assert.ok(k.sources.length&&k.modules.length,k.kind);
 assert.ok(data.standing.holderKinds.includes('organization'));
 assert.equal(data.standing.transmission.household,0.5);
});

test('每个代码模块都归入一个系统，每个系统属于一层',()=>{
 assert.deepEqual(data.findings.unassignedModules,[]);
 const layers=new Set(data.layers.map(l=>l.id));
 for(const s of data.systems)assert.ok(layers.has(s.layer),s.id);
 const ids=new Set(data.systems.map(s=>s.id));
 for(const l of data.links)assert.ok(ids.has(l.from)&&ids.has(l.to),`${l.from}->${l.to}`);
 const files=[...fs.readdirSync('server-plugin').filter(f=>f.endsWith('.mjs')).map(f=>`server-plugin/${f}`)];
 for(const f of files)assert.ok(data.modules[f]?.system,`${f} 未归类`);
});

test('内容查表覆盖主要内容类型，并给出自动参与的系统',()=>{
 const ids=data.contentTypes.map(c=>c.id);
 for(const id of['monster','location','spell','npc','item','organization','festival','faction'])assert.ok(ids.includes(id),id);
 for(const c of data.contentTypes){assert.ok(c.required.length,c.id);assert.ok(c.autoSystems.length,c.id);}
});

test('HTML 自包含：内嵌数据，无外部脚本，带深色配色',()=>{
 assert.ok(!/<script[^>]+src=/.test(html));
 assert.ok(!/<link[^>]+stylesheet/.test(html));
 assert.match(html,/<script id="data" type="application\/json">/);
 assert.match(html,/prefers-color-scheme: dark/);
 const embedded=JSON.parse(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
 assert.equal(embedded.tools.length,25);
 assert.equal(embedded.advance.length,advanceRegistry.length);
});
