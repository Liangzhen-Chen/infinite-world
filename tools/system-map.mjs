// K9 系统地图：从代码实际导出系统数据，写 docs/system-map.json 与自包含的 docs/system-map.html。
// 用法：node tools/system-map.mjs
//
// 数据来源（两类）：
//  A. 运行时导出（import 模块读取真实注册表）：
//     advance-registry.advanceRegistry、world-events.SOCIAL_VERBS、interaction-rules、
//     effects.effectKinds()/effectConsumer()、standing.TRANSMISSION、extension/tools 的
//     toolDefinitions()/resolveToolCall()、world.schema.json 的必填字段、world/ 实际 JSON 字段。
//  B. 静态扫描（正则近似，不执行代码）：
//     1) import 图：解析 `import {a,b as c} from './x.mjs'`，得到模块依赖与“标识符→来源模块”表。
//     2) 函数体归属：用花括号配对截出函数/方法体，取其中出现的已导入标识符，映射到来源模块
//        （用于工具处理器、推进项、效果类型、世界事件订阅者）。
//     3) state 分区：写 = `.set(['state','P'` / `.remove(['state','P'`；
//        读 = `get('state','P'` 或 `state.P` / `state?.P`（P 须是已知分区名）。
//     4) records 前缀：`['state','records',`前缀:`]`、`get('state','records','前缀:`、
//        `records?.[`前缀:`]`、`startsWith('前缀:')`；与 set/remove 同行记为写，否则记为读。
//     5) world 数据读取：`rules.K`（K 为 meta/rules.json 顶层键）、`world.K`（K 为 loadWorld 键），
//        以及直接 import ../world/design/*.mjs 或在代码里出现 world/<目录>/ 路径字符串。
//     6) 世界事件动词：全仓 `verb:'x'` 字面量 + SOCIAL_VERBS + deriveWorldEvents 默认以工具名为动词。
//        订阅者关心的动词：订阅函数所在模块内含 "verb" 的行里出现的已知动词字面量。
//  静态扫描是近似：经由 engine.byId、helper 间接读写、动态拼接路径的访问不会被统计。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=path.resolve(import.meta.dirname,'..');
const rel=p=>path.relative(ROOT,p).split(path.sep).join('/');
const abs=p=>path.join(ROOT,p);
const cache=new Map();
const src=file=>{if(!cache.has(file))cache.set(file,fs.readFileSync(abs(file),'utf8'));return cache.get(file);};
const uniq=a=>[...new Set(a)].sort();
const listDir=(dir,re)=>fs.readdirSync(abs(dir)).filter(f=>re.test(f)).map(f=>`${dir}/${f}`).sort();

// ---------------------------------------------------------------- file sets
const SERVER=[...listDir('server-plugin',/\.m?js$/),...listDir('server-plugin/migrations',/\.m?js$/),...listDir('server-plugin/compat',/\.m?js$/),...listDir('server-plugin/legacy',/\.js$/)];
const EXTENSION=listDir('extension',/\.m?js$/);
const CODE=[...SERVER,...EXTENSION];

// ---------------------------------------------------------------- import graph
function importsOf(file){
 const text=src(file),map=new Map(),mods=new Set();
 const re=/import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s*([\w$]+)\s*)?from\s*['"]([^'"]+)['"]/g;
 for(const m of text.matchAll(re)){
  const spec=m[4];if(!spec.startsWith('.'))continue;
  const target=rel(path.resolve(path.dirname(abs(file)),spec));mods.add(target);
  if(m[1])map.set(m[1],target);if(m[3])map.set(m[3],target);
  for(const part of(m[2]??'').split(',')){const t=part.trim();if(!t)continue;const [a,b]=t.split(/\s+as\s+/);map.set((b??a).trim(),target);}
 }
 // Dynamic imports: literal import('./x.mjs'), and the ui-*.mjs directory loaders
 // (server-plugin/ui-routes.mjs, extension/ui-shell.mjs) that import every ui-*.mjs beside them.
 for(const m of text.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g))mods.add(rel(path.resolve(path.dirname(abs(file)),m[1])));
 if(/\/\^ui-/.test(text)&&/import\(\s*new URL/.test(text)){const dir=path.dirname(file);
  for(const f of fs.readdirSync(abs(dir)))if(/^ui-.*\.mjs$/.test(f)&&`${dir}/${f}`!==file&&f!=='ui-routes.mjs'&&f!=='ui-shell.mjs')mods.add(`${dir}/${f}`);}
 return{map,mods:[...mods].sort()};
}
const IMPORTS=Object.fromEntries(CODE.map(f=>[f,importsOf(f)]));

// Brace-matched body starting at the first `{` after index.
function braceBody(text,index){
 const open=text.indexOf('{',index);if(open<0)return '';
 let depth=0;for(let i=open;i<text.length;i++){const c=text[i];if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return text.slice(open,i+1);}}
 return text.slice(open);
}
const identsToModules=(file,body)=>{
 const {map}=IMPORTS[file]??importsOf(file),out=new Set();
 for(const m of body.matchAll(/[A-Za-z_$][\w$]*/g))if(map.has(m[0]))out.add(map.get(m[0]));
 return [...out].sort();
};
function functionBody(file,name){
 const text=src(file);
 const m=new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(|^\\s{4}(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`,'m').exec(text);
 if(!m)return '';
 // Skip the parameter list (it may hold `{a,b}` destructuring) and start at `) {`.
 const close=/\)\s*\{/g;close.lastIndex=m.index;const c=close.exec(text);
 return braceBody(text,c?c.index:m.index);
}

// ---------------------------------------------------------------- world data
const WORLD_FILES={rules:'meta/rules.json',npcs:'people/baseline.json',locations:'geo/locations.json',routes:'geo/routes.json',items:'meta/items.json',
 professions:'meta/professions.json',skills:'meta/skills.json',spells:'meta/spells.json',recipes:'meta/recipes.json',monsters:'meta/monsters.json',bosses:'meta/bosses.json',
 cultures:'lore/cultures.json',deities:'lore/deities.json',factions:'lore/factions.json',history:'lore/history.json',factionPeople:'lore/factionPeople.json',eras:'lore/eras.json',
 festivals:'lore/festivals.json',rumors:'lore/rumors.json',residents:'people/residents.json',households:'people/households.json',settlementProfiles:'geo/settlements.json',careers:'meta/careers.json',regions:'geo/regions.json'};
{const lw=src('tools/load-world.mjs');for(const [k,f]of Object.entries(WORLD_FILES)){const base=f.split('/')[1].replace('.json','');if(!lw.includes(k)||!lw.includes(base))throw Error(`load-world 不再读取 ${f}`);}}
const readJSON=f=>{try{return JSON.parse(fs.readFileSync(abs(`world/${f}`),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const RULES=readJSON('meta/rules.json');
const RULE_KEYS=Object.keys(RULES);
const WORLD_DIRS=fs.readdirSync(abs('world')).filter(d=>fs.statSync(abs(`world/${d}`)).isDirectory()).sort();

// ---------------------------------------------------------------- state partitions & records
const seed=JSON.parse(src('extension/seed.json'));
function scanState(file){
 const text=src(file),writes=new Set(),reads=new Set(),recW=new Set(),recR=new Set();
 for(const m of text.matchAll(/\.(?:set|remove)\(\s*\[\s*'state'\s*,\s*'(\w+)'/g))writes.add(m[1]);
 for(const line of text.split('\n')){
  const isWrite=/\.(?:set|remove)\(\s*\[\s*'state'\s*,\s*'records'/.test(line)||/records\[[^\]]+\]\s*=(?!=)/.test(line);
  const pats=[/'records'\s*,\s*[`']([A-Za-z][\w-]*):/g,/records\??\.?\[\s*[`']([A-Za-z][\w-]*):/g,/startsWith\(\s*'([A-Za-z][\w-]*):'\)/g];
  for(const re of pats)for(const m of line.matchAll(re))(isWrite?recW:recR).add(m[1]);
 }
 return{writes,reads,recW,recR,text};
}
const RAW_STATE=Object.fromEntries(SERVER.map(f=>[f,scanState(f)]));
const PARTITIONS=uniq([...Object.keys(seed.state),...Object.values(RAW_STATE).flatMap(s=>[...s.writes]),'effects','creatures','obligations','quests','projects','settlements']);
for(const [f,s]of Object.entries(RAW_STATE)){
 for(const m of s.text.matchAll(/get\(\s*'state'\s*,\s*'(\w+)'/g))s.reads.add(m[1]);
 for(const m of s.text.matchAll(/\bstate\??\.(\w+)/g))if(PARTITIONS.includes(m[1]))s.reads.add(m[1]);
 for(const p of s.writes)s.reads.delete(p);
 // records prefixes read/written via startsWith only count when the module touches records.
 s.recR=new Set([...s.recR].filter(p=>!s.recW.has(p)));
}
function scanWorldUse(file){
 const text=src(file),rules=new Set(),world=new Set(),dirs=new Set();
 for(const m of text.matchAll(/\brules\??\.(\w+)/g))if(RULE_KEYS.includes(m[1]))rules.add(m[1]);
 for(const m of text.matchAll(/\bworld\??\.(\w+)/g))if(WORLD_FILES[m[1]])world.add(m[1]);
 for(const m of text.matchAll(/world\/(\w+)\//g))if(WORLD_DIRS.includes(m[1]))dirs.add(m[1]);
 for(const t of IMPORTS[file]?.mods??[])if(t.startsWith('world/'))dirs.add(t.split('/')[1]);
 return{rules:[...rules].sort(),world:[...world].sort(),dirs:[...dirs].sort()};
}
const WORLD_USE=Object.fromEntries(CODE.map(f=>[f,scanWorldUse(f)]));

// ---------------------------------------------------------------- systems & layers
// 模块→系统归属（人工归类；脚本会校验 server-plugin 与 extension 的每个模块都有归属）。
const SYSTEMS=[
 {id:'sim_transport',layer:'sim',name:'承运与驿传',modules:['transport.mjs','transport-route.mjs','post.mjs']},
 {id:'sim_faith',layer:'sim',name:'寺观与信仰',modules:['faith-catalog.mjs','faith-state.mjs','faith.mjs']},
 // 数据层（world/ 目录与 prompt/）
 {id:'data_meta',layer:'data',name:'规则与目录',dir:'world/meta',modules:[]},
 {id:'data_geo',layer:'data',name:'地理',dir:'world/geo',modules:[]},
 {id:'data_people',layer:'data',name:'人物名册',dir:'world/people',modules:[]},
 {id:'data_lore',layer:'data',name:'传说与势力',dir:'world/lore',modules:[]},
 {id:'data_design',layer:'data',name:'设计表',dir:'world/design',modules:[]},
 {id:'data_assets',layer:'data',name:'美术与音频',dir:'world/art + world/audio',modules:[]},
 {id:'data_drafts',layer:'data',name:'内容草稿',dir:'world/drafts',modules:[]},
 {id:'data_ontology',layer:'data',name:'词汇表（L1，S0）',dir:'world/ontology',modules:[]},
 {id:'data_actions',layer:'data',name:'动作注册表与事件模板（A1）',dir:'world/actions',modules:[]},
 {id:'data_rules',layer:'data',name:'数值参数表与目标表（S1，rules/tables/balance）',dir:'world/rules',modules:[]},
 // 内核层
 {id:'kernel_engine',layer:'kernel',name:'结算引擎',modules:['engine.mjs','activities.mjs','campaign-reducer.mjs','archived-reducer.mjs','scheduler.mjs']},
 {id:'kernel_storage',layer:'kernel',name:'存档与迁移',modules:['storage.mjs','migrations.mjs','migrations/r1.mjs','rule-state-migration.mjs','world-registry.mjs','world-upgrade.mjs',
   'agriculture-migration.mjs','boss-migration.mjs','farm-pests-migration.mjs','compat/v2-phase1-activities.mjs','compat/v2-phase1-engine.mjs','legacy/core.js']},
 // 底座层 K1–K7
 {id:'base_traits',layer:'base',name:'性状标签',card:'K1',modules:['traits.mjs']},
 {id:'base_interactions',layer:'base',name:'交互规则',card:'K2',modules:['interactions.mjs']},
 {id:'base_events',layer:'base',name:'世界事件',card:'K3/V6',modules:['world-events.mjs','entity-transitions.mjs']},
 {id:'base_standing',layer:'base',name:'统一立场',card:'K4/K5',modules:['standing.mjs','entity-view.mjs']},
 {id:'base_effects',layer:'base',name:'效果表',card:'K6',modules:['effects.mjs','effect-registry.mjs']},
 {id:'base_advance',layer:'base',name:'推进注册表',card:'K7/P3',modules:['advance-registry.mjs','advance-layers.mjs']},
 {id:'base_ledger',layer:'base',name:'账本',card:'S1a/S1b',modules:['ledger.mjs','money.mjs','stock.mjs']},
 {id:'base_holdings',layer:'base',name:'持有与实体化',card:'S2a',modules:['holdings.mjs','holding-kinds.mjs','holding-sources.mjs']},
 // 模拟系统层
 {id:'sim_npc',layer:'sim',name:'人物',modules:['npc-state.mjs','npc-schedule.mjs','npc-cognition.mjs','npc-autonomy.mjs','npc-life.mjs','medicine.mjs','medicine-state.mjs','npc-memory.mjs','npc-relations.mjs','npc-rumors.mjs',
   'npc-obligations.mjs','npc-growth.mjs','npc-intelligence.mjs','lies.mjs','npc-planning-service.mjs','population.mjs','population-service.mjs','settlement-profile.mjs']},
 {id:'sim_character',layer:'sim',name:'角色成长',modules:['character.mjs','progression.mjs','professions.mjs','career-metrics.mjs','hidden-passives.mjs','spell-research.mjs','training.mjs','learning.mjs','education.mjs','education-state.mjs','education-cohorts.mjs','local-exams.mjs','checks.mjs','revival.mjs']},
 {id:'sim_combat',layer:'sim',name:'战斗',modules:['combat.mjs','duels.mjs']},
 {id:'sim_boss',layer:'sim',name:'首领',modules:['bosses.mjs','boss-abilities.mjs','boss-cognition.mjs','boss-negotiation.mjs']},
 {id:'sim_wildlife',layer:'sim',name:'生态',modules:['wildlife.mjs','wildlife-awakening.mjs','wildlife-range.mjs','wildlife-habitats.mjs','wildlife-society.mjs','wildlife-migration.mjs','creature-nature.mjs','seasonal-migration.mjs','farm-pests.mjs','forest-water.mjs','water-cycle.mjs']},
 {id:'sim_companion',layer:'sim',name:'伙伴',modules:['pets.mjs','summons.mjs']},
 {id:'sim_environment',layer:'sim',name:'环境与地点',modules:['environment.mjs','weather.mjs','location-access.mjs','sites.mjs','regions.mjs','remote-generation.mjs']},
 {id:'sim_magic',layer:'sim',name:'法术',modules:SERVER.map(f=>f.slice(14)).filter(f=>/^magic(-[\w-]+)?\.mjs$/.test(f)&&f!=='magic-economy.mjs')},
 // magic-economy.mjs (U10): settlement-scale prices, losses and reactions to life magic.
 {id:'sim_economy',layer:'sim',name:'经济',modules:['items.mjs','shop.mjs','business.mjs','contracts.mjs','credit.mjs','finance-bank.mjs','finance-assets.mjs','finance-tax.mjs','finance-operations.mjs','labor-market.mjs','employment-state.mjs','settlement-trade.mjs','manufacturing.mjs','repair.mjs','magic-economy.mjs','extraction.mjs','smuggling.mjs']},
 {id:'sim_agriculture',layer:'sim',name:'农业',modules:['agriculture.mjs']},
 {id:'sim_society',layer:'sim',name:'社会',modules:['family-state.mjs','family-politics.mjs','family-inheritance.mjs','family-law.mjs','family-diplomacy.mjs','monster-society.mjs','reputation.mjs','reputation-registry.mjs','reputation-catalog.mjs','organization-state.mjs','group-account.mjs','office-salary.mjs','public-opinion.mjs','organizations.mjs','civic.mjs','governance.mjs','public-projects.mjs','facilities.mjs','facility-state.mjs','titles.mjs','noble-state.mjs','high-nobility.mjs','nation-founding.mjs','notables.mjs','promotion.mjs','promotion-view.mjs','quest-board.mjs','quest-sources.mjs','quest-wildlife.mjs','tribal-awakening.mjs','elections.mjs']},
 {id:'sim_military',layer:'sim',name:'军队、战争与外交',modules:['military.mjs','war-diplomacy.mjs']},
 {id:'sim_clock',layer:'sim',name:'时钟、节令与灾害',modules:['world-clock.mjs','faction-clock.mjs','festival.mjs','seasonal-hazards.mjs','hazard-calendar.mjs']},
 {id:'sim_law',layer:'sim',name:'法律与通缉',modules:['law.mjs','law-codes.mjs','legal-representation.mjs','npc-crime.mjs','bounty.mjs']},
 {id:'sim_works',layer:'sim',name:'著作',modules:['works.mjs']},
 // 玩家接口层
 {id:'ui_tools',layer:'ui',name:'模型工具',modules:['ext:tools.mjs']},
 {id:'ui_scene',layer:'ui',name:'场景卡与状态提示',modules:['scene-card.mjs','prompt-scope.mjs','state-notices.mjs','return-summary.mjs']},
 {id:'ui_server',layer:'ui',name:'服务与界面接口',modules:['index.mjs','ui-routes.mjs','ui-affairs.mjs','ui-history.mjs','ui-map.mjs','ui-messages.mjs','ui-overview.mjs','ui-personal.mjs']},
 {id:'ui_client',layer:'ui',name:'浏览器界面',modules:['ext:ui-shell.mjs','ext:ui-affairs.mjs','ext:ui-art.mjs','ext:ui-history.mjs','ext:ui-map.mjs','ext:ui-messages.mjs','ext:ui-personal.mjs','ext:ui-settings.mjs',
   'ext:affairs-panels.mjs','ext:background-view.mjs','ext:input-view.mjs','ext:ledger-view.mjs','ext:mail-view.mjs','ext:map-view.mjs','ext:message-view.mjs','ext:people-history.mjs',
   'ext:personal-panels.mjs','ext:topbar.mjs','ext:history-window.mjs','ext:ambient-audio.mjs','ext:state-read.mjs']},
 {id:'ui_actions',layer:'ui',name:'动作目录与界面可操作（A1）',modules:['action-registry.mjs','action-gateway.mjs','action-affordances.mjs','action-text.mjs','applied-effects.mjs','ext:ui-actions.mjs','ext:actions-view.mjs']},
 {id:'ui_host',layer:'ui',name:'酒馆接入',modules:['ext:index.js','ext:runtime.js','ext:core.js','ext:turn.mjs']},
 // 叙述层
 {id:'nar_prompt',layer:'narr',name:'提示词',dir:'prompt/',modules:['ext:prompt.mjs','ext:generation.mjs']},
 {id:'nar_consistency',layer:'narr',name:'一致性审查',modules:['consistency-review.mjs','consistency-service.mjs','consistency-evidence.mjs','consistency-outcome.mjs']},
 {id:'nar_memory',layer:'narr',name:'档案与检索',modules:['retrieval.mjs','retrieval-lexicon.mjs','lore.mjs','catalog.mjs','chronicle.mjs']},
];
const fileOf=m=>m.startsWith('ext:')?`extension/${m.slice(4)}`:`server-plugin/${m}`;
for(const s of SYSTEMS)s.files=s.modules.map(fileOf);
const SYSTEM_OF=new Map();for(const s of SYSTEMS)for(const f of s.files){if(SYSTEM_OF.has(f))throw Error(`模块重复归类：${f}`);SYSTEM_OF.set(f,s.id);}
const unassigned=CODE.filter(f=>!SYSTEM_OF.has(f)&&!/legacy\/seed/.test(f));
for(const s of SYSTEMS)for(const f of s.files)if(!fs.existsSync(abs(f)))throw Error(`归类了不存在的模块：${f}`);
const LAYERS=[
 {id:'data',name:'数据层',reason:'world/ 下的 JSON 与设计表只描述内容，不含行为。tools/load-world.mjs 读入后成为 engine.world 与 engine.rules，各系统只经由这两者读取。'},
 {id:'kernel',name:'内核层',reason:'engine.mjs 的 reduce() 是唯一结算入口：工具调用先经它分派到各系统，结算后再发布世界事件、推进时间。storage.mjs 与迁移负责存档补丁和版本升级。所有系统都依赖它们，它们不属于任何玩法系统。'},
 {id:'base',name:'底座层',reason:'K1–K7 的共享协议：性状（K1）是读出的标签视图，交互（K2）、事件（K3）、立场（K4/K5）、效果（K6）、推进（K7）是带注册入口的表；账本（S1a）的转移是货币存量的唯一写入点，旧字段经适配器双写。模拟系统通过“登记一行”参与，不需要逐个改引擎。'},
 {id:'sim',name:'模拟系统层',reason:'各自持有 state 分区或 records 前缀的玩法系统。它们由工具分派驱动，或登记在推进表、订阅世界事件、实现效果类型，彼此主要通过底座和共享 records 交互。'},
 {id:'ui',name:'玩家接口层',reason:'模型能调用的 27 个工具（extension/tools.mjs，含 A1 动作目录 world_actions/world_act），以及把状态投影给模型和玩家的场景卡、状态提示、界面接口和浏览器面板。这一层只读状态或转交引擎，不自己结算。'},
 {id:'narr',name:'叙述层',reason:'提示词、长期检索和一致性审查，把账本事实交给模型写成文字，并核对回复有没有虚构结果。它读取引擎结果，不写游戏状态。'},
];

// ---------------------------------------------------------------- runtime exports
const imp=p=>import(pathToFileURL(abs(p)).href);
const {advanceRegistry}=await imp('server-plugin/advance-registry.mjs');
const WE=await imp('server-plugin/world-events.mjs');
const {interactionRules}=await imp('world/design/interaction-rules.mjs');
const EFF=await imp('server-plugin/effects.mjs');
const ST=await imp('server-plugin/standing.mjs');
const TR=await imp('server-plugin/traits.mjs');
const TOOLS=await imp('extension/tools.mjs');
const schema=JSON.parse(src('schemas/world.schema.json'));

// Advance registry: which module each registered function reaches.
const registryText=src('server-plugin/advance-registry.mjs');
const advance=advanceRegistry.map(s=>{
 const body=s.advance.toString()+(s.nextMinute?.toString()??'')+(s.active?.toString()??'');
 const modules=identsToModules('server-plugin/advance-registry.mjs',body).filter(m=>m.startsWith('server-plugin/'));
 const partitions=uniq([...body.matchAll(/'state'\s*,\s*'(\w+)'/g)].map(m=>m[1]));
 return{id:s.id,order:s.order,stepped:Boolean(s.active),nextMinute:Boolean(s.nextMinute),modules:modules.length?modules:['server-plugin/advance-registry.mjs'],inline:!modules.length,partitions};
});
if(!registryText.includes('registerAdvance(system)'))throw Error('推进注册方式已变化');

// World events: verbs and subscribers.
// Subscribers register themselves (registerWorldEventSubscriber); the runtime list
// (after loading the engine) gives the order, a scan of each call gives the function.
await imp('server-plugin/engine.mjs');
const registeredSubscribers=WE.worldEventSubscribers();
const subscriberCalls=new Map(SERVER.flatMap(f=>[...src(f).matchAll(/registerWorldEventSubscriber\(\{id:'(\w+)',order:([\d.]+),on:[^=]*=>\s*([A-Za-z_$][\w$]*)\(/g)].map(m=>[m[1],{file:f,order:Number(m[2]),fn:m[3]}])));
const verbLiterals=uniq(CODE.flatMap(f=>[...src(f).matchAll(/\bverb\s*:\s*'(\w+)'/g)].map(m=>m[1])));
// Tool → verbs derived in deriveWorldEvents (one `tool==='x'` branch each); other tools use their own name.
const toolVerbs={};
for(const seg of functionBody('server-plugin/world-events.mjs','deriveWorldEvents').split(/\}\s*else\s+if\s*\(/)){
 const tool=[...seg.matchAll(/tool\s*===\s*'(\w+)'/g)].pop()?.[1];if(!tool)continue;
 toolVerbs[tool]=uniq([...seg.matchAll(/verb\s*:([^,]*)/g)].flatMap(m=>[...m[1].matchAll(/'(\w+)'/g)].map(x=>x[1])));
}
const VERBS=uniq([...WE.SOCIAL_VERBS,...verbLiterals,'cast']);
const verbsInModule=file=>uniq(src(file).split('\n').filter(l=>/verb/.test(l)).flatMap(l=>[...l.matchAll(/'(\w+)'/g)].map(m=>m[1])).filter(v=>VERBS.includes(v)));
const subscribers=registeredSubscribers.map((r,i)=>{
 const call=subscriberCalls.get(r.id);if(!call||call.order!==r.order)throw Error(`找不到世界事件订阅者登记：${r.id}`);
 const module=call.file;
 return{order:i+1,id:r.id,fn:call.fn,module,verbs:verbsInModule(module)};
});
if(subscriberCalls.size!==subscribers.length)throw Error('有世界事件订阅者登记未在运行时生效');
subscribers.push({order:subscribers.length+1,fn:'recordCareerMetrics',module:IMPORTS['server-plugin/world-events.mjs'].map.get('recordCareerMetrics'),verbs:verbsInModule('server-plugin/career-metrics.mjs'),note:'publishWorldEvents 内固定最后调用'});
// Producers: modules with a verb:'x' literal; deriveWorldEvents also derives verbs from tool results.
const deriveBody=functionBody('server-plugin/world-events.mjs','deriveWorldEvents')+functionBody('server-plugin/world-events.mjs','obligationGifts')+functionBody('server-plugin/world-events.mjs','creditBreaches');
const derived=VERBS.filter(v=>new RegExp(`verb\\s*:[^,]*'${v}'`).test(deriveBody));
const verbProducers=Object.fromEntries(VERBS.map(v=>[v,uniq([...CODE.filter(f=>f!=='server-plugin/world-events.mjs'&&new RegExp(`\\bverb\\s*:\\s*'${v}'`).test(src(f))),...(derived.includes(v)?['server-plugin/world-events.mjs']:[])])]));
const worldEvents={
 version:WE.WORLD_EVENT_VERSION,socialVerbs:[...WE.SOCIAL_VERBS],verbs:VERBS,
 verbNotes:{default:'未特殊处理的工具以工具名为动词（verb=tool），不进入 records，只供订阅者与职业统计读取',
  harm:'combat 攻击/推搡，或伤害型法术命中',clash:'combat 防守/脱离',steal:'world_law steal',gift:'未收款的送货承诺完成',help:'治疗型法术命中',trade:'world_trade',
  learn:'world_learn',rumor:'效果表 rumor 效果放出的传闻（时钟、节日阶段）',breach:'借贷违约（credit）',author:'著作事件（works）',organize:'组织事件（organizations）',cast:'其他法术'},
 storedAs:'records world_event:<事件ID>（仅社会动词）',rumorWeight:WE.RUMOR_WEIGHT,
 subscribers,producers:verbProducers,toolVerbs,
};

// Interactions.
const interactions={rules:interactionRules.rules.map(r=>({id:r.id,agent:r.agent,when:r.when??{},effect:r.effect})),
 agents:uniq(interactionRules.rules.map(r=>r.agent)),tags:uniq(interactionRules.rules.flatMap(r=>[...r.when?.all??[],...r.when?.any??[],...r.when?.none??[]])),
 consumers:uniq(SERVER.filter(f=>/from\s*'\.\/interactions\.mjs'/.test(src(f)))),
 vocabulary:{elements:[...TR.ELEMENTS],creatureTags:[...TR.CREATURE_TAGS],flammable:[...TR.FLAMMABLE]},
 traitReaders:uniq(SERVER.filter(f=>/from\s*'\.\/traits\.mjs'/.test(src(f))))};

// Effects: kinds, allowed sources, implementing modules, users in rules data.
const effText=src('server-plugin/effects.mjs');
const effectRegistrations=[];
for(const f of SERVER){const text=src(f);
 for(const m of text.matchAll(/registerEffect\(\s*'(\w+)'/g))effectRegistrations.push({kind:m[1],file:f,index:m.index});
 for(const m of text.matchAll(/for\s*\(\s*const\s+kind\s+of\s+\[([^\]]+)\]\s*\)\s*registerEffect\(/g))for(const k of m[1].matchAll(/'(\w+)'/g))effectRegistrations.push({kind:k[1],file:f,index:m.index});
}
const effectHooks=(RULES.effectTable?.hooks??[]);
// Every `effects:[{kind}]` list authored in rules.json and lore (clock stages, hooks, festivals).
const effectUses=new Map();
function walkEffects(node,where){
 if(Array.isArray(node)){for(const x of node)walkEffects(x,where);return;}
 if(!node||typeof node!=='object')return;
 for(const [k,v]of Object.entries(node)){
  const list=k==='effects'&&Array.isArray(v)?v:k==='effect'&&v&&typeof v==='object'?[v]:[];
  for(const e of list)if(typeof e?.kind==='string'){if(!effectUses.has(e.kind))effectUses.set(e.kind,new Set());effectUses.get(e.kind).add(where);}
  walkEffects(v,where);
 }
}
for(const k of RULE_KEYS)walkEffects(RULES[k],`rules.${k}`);
for(const f of['lore/factions.json','lore/festivals.json'])walkEffects(readJSON(f),`world/${f}`);
const effects=EFF.effectKinds().sort().map(kind=>{
 const reg=effectRegistrations.find(r=>r.kind===kind);
 const body=reg?braceBody(src(reg.file),reg.index):'';
 const modules=uniq([reg?.file,...(reg?identsToModules(reg.file,body):[])].filter(Boolean)).filter(m=>m.startsWith('server-plugin/'));
 return{kind,sources:EFF.EFFECT_SOURCES.filter(s=>EFF.effectConsumer({},kind,s)),registeredIn:reg?.file??null,modules,
  usedByHooks:effectHooks.filter(h=>(h.effects??[]).some(e=>e.kind===kind)).map(h=>`${h.source}:${h.owner}`),usedIn:[...effectUses.get(kind)??[]].sort()};
});
const effectCallers=uniq(SERVER.filter(f=>/\bapplyEffects?\(|\bassertEffect\(/.test(src(f))&&f!=='server-plugin/effects.mjs'));

// Standing.
const kindBody=functionBody('server-plugin/standing.mjs','standingKind');
const standing={holderKinds:uniq([...kindBody.matchAll(/return\s*'(\w+)'/g)].map(m=>m[1])),transmission:{...ST.TRANSMISSION},
 weightedVerbs:uniq([...functionBody('server-plugin/standing.mjs','eventWeight').matchAll(/verb==='(\w+)'/g)].map(m=>m[1])),hostileThreshold:ST.HOSTILE,
 stores:identsToModules('server-plugin/standing.mjs',src('server-plugin/standing.mjs')),
 readers:uniq(CODE.filter(f=>/from\s*'\.\/standing\.mjs'/.test(src(f))&&f!=='server-plugin/standing.mjs')),
 notes:'standing:<holder>:<target> 记录集体立场；人物的变化写回人物关系账（npc-relations）。'};

// Tools: public definition -> routed internal tool(s) -> handler -> modules.
const activitiesFile='server-plugin/activities.mjs';
const activityKeys=new Set([...src(activitiesFile).matchAll(/^ {4}(\w+)\(d,args/mg)].map(m=>m[1]));
function handlerOf(internal){
 const name=internal.replace(/^world_/,'');
 // Handlers that spend time call engine.advance → the advance registry (K7).
 const timed=body=>/\b(?:this|engine|e)\.advance\(/.test(body)?['server-plugin/advance-registry.mjs']:[];
 if(activityKeys.has(name)){const body=functionBody(activitiesFile,name);return{handler:`activities.${name}`,file:activitiesFile,modules:[...identsToModules(activitiesFile,body),...timed(body)]};}
 const body=functionBody('server-plugin/engine.mjs',name);
 if(body)return{handler:`WorldEngine.${name}`,file:'server-plugin/engine.mjs',modules:[...identsToModules('server-plugin/engine.mjs',body),...timed(body)]};
 return null;
}
const runtimeText=src('extension/runtime.js'),indexText=src('server-plugin/index.mjs');
function readOnlyHandler(name){
 const line=runtimeText.split('\n').find(l=>l.includes(`name==='${name}'`));if(!line)return null;
 const route=/api\('(\w+)'/.exec(line)?.[1];
 if(route){const m=new RegExp(`router\\.post\\('/${route}'`).exec(indexText);const body=m?braceBody(indexText,m.index):'';
  return{handler:`extension/runtime.js → POST /${route}`,file:'server-plugin/index.mjs',modules:identsToModules('server-plugin/index.mjs',body)};}
 return{handler:'extension/runtime.js（浏览器本地）',file:'extension/runtime.js',modules:identsToModules('extension/runtime.js',line)};
}
const tools=TOOLS.toolDefinitions().map(def=>{
 const name=def.function.name,props=def.function.parameters.properties,ops=props.operation?.enum??null;
 const routes=new Map();
 const dummy=Object.fromEntries(Object.keys(props).map(k=>[k,'x']));
 for(const op of ops??[null]){
  let r;try{r=TOOLS.resolveToolCall(name,op===null?{}:{...dummy,operation:op});}catch{r={tool:name,args:{operation:op}};}
  const key=r.tool;if(!routes.has(key))routes.set(key,{tool:key,operations:[]});
  if(op!==null)routes.get(key).operations.push(r.args.operation===op?op:`${op}→${r.args.operation}`);
 }
 const routed=[...routes.values()].map(r=>{
  // A1：world_act 经 /execute 翻译成它所别名的旧工具调用再交引擎。
  const h=name==='world_act'?{handler:'POST /execute → action-gateway.translateCall → 旧工具',file:'server-plugin/action-gateway.mjs',modules:['server-plugin/index.mjs','server-plugin/action-registry.mjs']}:TOOLS.readOnlyTools.has(name)?readOnlyHandler(name):handlerOf(r.tool);
  const modules=uniq([h?.file,...(h?.modules??[])].filter(Boolean));
  return{...r,handler:h?.handler??null,modules,systems:uniq(modules.map(m=>SYSTEM_OF.get(m)).filter(Boolean))};
 });
 return{name,description:def.function.description,readOnly:TOOLS.readOnlyTools.has(name),operations:ops,routes:routed,systems:uniq(routed.flatMap(r=>r.systems))};
});

// World data directories -> reading modules.
const worldData=WORLD_DIRS.map(dir=>{
 const files=fs.readdirSync(abs(`world/${dir}`)).sort();
 const keys=Object.entries(WORLD_FILES).filter(([,f])=>f.startsWith(`${dir}/`)&&fs.existsSync(abs(`world/${f}`))).map(([k])=>k);
 const readers=uniq(CODE.filter(f=>{const u=WORLD_USE[f];return u.dirs.includes(dir)||u.world.some(k=>keys.includes(k))||(dir==='meta'&&u.rules.length);}));
 const toolsReaders=uniq(listDir('tools',/\.mjs$/).filter(f=>src(f).includes(`world/${dir}`)||src(f).includes(`'${dir}/`)||src(f).includes(`"${dir}/`)||src(f).includes(`'..', 'world'`)&&dir==='meta'));
 return{dir:`world/${dir}`,files:files.length,keys,readers,tools:toolsReaders};
});
const promptReaders=uniq([...CODE,...listDir('tools',/\.mjs$/)].filter(f=>/prompt\/|'prompt'/.test(src(f))&&f!=='tools/system-map.mjs'));
const rulesReaders=Object.fromEntries(RULE_KEYS.map(k=>[k,uniq(CODE.filter(f=>WORLD_USE[f].rules.includes(k)))]));

// ---------------------------------------------------------------- per-module & per-system facts
const modules=Object.fromEntries(CODE.map(f=>{
 const s=RAW_STATE[f],u=WORLD_USE[f];
 return[f,{system:SYSTEM_OF.get(f)??null,imports:IMPORTS[f].mods,
  stateWrites:s?[...s.writes].sort():[],stateReads:s?[...s.reads].sort():[],recordWrites:s?[...s.recW].sort():[],recordReads:s?[...s.recR].sort():[],
  rules:u.rules,world:u.world,worldDirs:u.dirs,lines:src(f).split('\n').length}];
}));
const dataSystemForDir={meta:'data_meta',geo:'data_geo',people:'data_people',lore:'data_lore',design:'data_design',art:'data_assets',audio:'data_assets',drafts:'data_drafts',ontology:'data_ontology',rules:'data_rules'};
const systemFacts=SYSTEMS.map(s=>{
 const ms=s.files.map(f=>modules[f]);
 const agg=k=>uniq(ms.flatMap(m=>m[k]));
 const dirReaders=s.layer==='data'?worldData.filter(w=>dataSystemForDir[w.dir.slice(6)]===s.id):[];
 return{id:s.id,name:s.name,layer:s.layer,card:s.card??null,dir:s.dir??null,modules:s.files,lines:ms.reduce((n,m)=>n+m.lines,0),
  stateWrites:agg('stateWrites'),stateReads:agg('stateReads').filter(p=>!agg('stateWrites').includes(p)),
  recordWrites:agg('recordWrites'),recordReads:agg('recordReads').filter(p=>!agg('recordWrites').includes(p)),
  rules:agg('rules'),world:agg('world'),
  advance:advance.filter(a=>a.modules.some(m=>s.files.includes(m))||(s.id==='base_advance'&&a.inline)).map(a=>a.id),
  subscribes:subscribers.filter(x=>s.files.includes(x.module)).map(x=>({fn:x.fn,verbs:x.verbs})),
  effects:effects.filter(e=>e.modules.some(m=>s.files.includes(m))).map(e=>e.kind),
  tools:tools.filter(t=>t.systems.includes(s.id)).map(t=>t.name),
  readBy:s.layer==='data'?uniq(dirReaders.flatMap(w=>w.readers).map(f=>SYSTEM_OF.get(f)).filter(Boolean)):(s.id==='nar_prompt'?uniq(promptReaders.map(f=>SYSTEM_OF.get(f)??f)):[]),
  files:s.layer==='data'?dirReaders.reduce((n,w)=>n+w.files,0):undefined};
});
const SYS=Object.fromEntries(systemFacts.map(s=>[s.id,s]));

// ---------------------------------------------------------------- links
const links=[];const add=(from,to,kind,label)=>{if(!from||!to||from===to)return;const l=links.find(x=>x.from===from&&x.to===to&&x.kind===kind);if(l){if(label&&!l.labels.includes(label))l.labels.push(label);}else links.push({from,to,kind,labels:label?[label]:[]});};
for(const [f,m]of Object.entries(modules))for(const t of m.imports){const a=SYSTEM_OF.get(f),b=SYSTEM_OF.get(t);
 if(b)add(a,b,'call',path.basename(t));
 else if(t.startsWith('world/'))add(dataSystemForDir[t.split('/')[1]],a,'data',path.basename(t));}
for(const w of worldData)for(const r of w.readers)add(dataSystemForDir[w.dir.slice(6)],SYSTEM_OF.get(r),'data',w.dir);
for(const r of promptReaders)add('nar_prompt',SYSTEM_OF.get(r),'data','prompt/');
for(const s of subscribers)add('base_events',SYSTEM_OF.get(s.module),'event',s.fn);
for(const a of advance)for(const m of a.modules)add('base_advance',SYSTEM_OF.get(m),'advance',a.id);
for(const e of effects)for(const m of e.modules)add('base_effects',SYSTEM_OF.get(m),'effect',e.kind);
for(const c of effectCallers)add(SYSTEM_OF.get(c),'base_effects','effect','applyEffects');
for(const t of tools)for(const s of t.systems)add('ui_tools',s,'tool',t.name);
// Shared records: writer -> reader of the same prefix (simulation and base systems).
const recWriters=new Map();for(const s of systemFacts)for(const p of s.recordWrites){if(!recWriters.has(p))recWriters.set(p,[]);recWriters.get(p).push(s.id);}
for(const s of systemFacts)for(const p of s.recordReads)for(const w of recWriters.get(p)??[])add(w,s.id,'record',p);
const stateWriters=new Map();for(const s of systemFacts)for(const p of s.stateWrites){if(!stateWriters.has(p))stateWriters.set(p,[]);stateWriters.get(p).push(s.id);}
const stateShare=Object.fromEntries([...stateWriters].sort().map(([p,ws])=>[p,{writers:uniq(ws),readers:uniq(systemFacts.filter(s=>s.stateReads.includes(p)).map(s=>s.id))}]));
links.sort((a,b)=>a.kind.localeCompare(b.kind)||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
for(const l of links)l.labels.sort();

// ---------------------------------------------------------------- content types
// Hooks: each names the authored field and a code pattern; the participating
// modules/systems are computed by scanning server-plugin and extension for it.
const req=name=>schema.$defs?.[name]?.required??[];
const sample=(file)=>{const v=readJSON(file);const a=Array.isArray(v)?v:v?Object.values(v):[];const c={};for(const x of a)for(const k of Object.keys(x??{}))c[k]=(c[k]??0)+1;return{count:a.length,fields:c};};
const CONTENT=[
 {id:'monster',name:'怪物 / 野物种类',file:'meta/monsters.json',required:req('monster'),hooks:[
   ['tags','creatureTraits|creatureCounter','身体标签进入性状视图，交互规则按标签给出元素倍率'],
   ['nature','\\.nature\\b','种族本性：显式弱抗覆盖标签倍率；灵体/亡灵等进入精怪状态'],
   ['wildlife.habitat','speciesInHabitat','指向已登记栖地时在当地生成个体、遭遇、捕食'],
   ['habitatTags','speciesHabitatTypes','栖息地标签决定物种自动分布到哪些派生栖地（K8，按稀有度定规模）'],
   ['tamingRule / taming','tamingRule|\\.taming\\b','驯服与宠物照料'],
   ['drops','\\.drops\\b','真实尸体取材'],
   ['intelligence','\\.intelligence\\b','灵智等级与可交谈性'],
   ['diet','\\.diet\\b','农田害虫'],
  ],manual:[],
  refs:['季节迁徙路线写在 rules.wildlife.migration.routes','rules.wildlife.habitats 手工登记的栖地是覆盖项：该地点不再派生，物种以 wildlife.habitat 为原生栖地'],
  extend:['新的身体标签词要加进 traits.CREATURE_TAGS，并在 interaction-rules.mjs 写规则才会影响倍率（沿用已有标签的新物种不需要）']},
 {id:'boss',name:'首领 / 巢穴',file:'meta/bosses.json',required:req('boss'),hooks:[
   ['monster','\\.monster\\b','套用物种性状与本性'],['lair / territory','\\.lair\\b','巢穴接近、谈判、驻地'],['tactics','\\.tactics\\b','首领反制技能'],
   ['minions','\\.minions\\b','随从'],['cognition','\\.cognition\\b','记得交锋，立场由此推出'],['negotiation','\\.negotiation\\b','谈判与盟约'],
  ],manual:[],refs:['lair 指向的地点须已在 geo/locations.json','生态参数在 rules.bossEcology']},
 {id:'location',name:'地点',file:'geo/locations.json',required:req('location'),hooks:[
   ['terrain / biome / areaKm2','locationHabitatTypes|areaKm2','野地按地形、群落标签与性状派生栖地并自动长出生物（K8 wildlife-habitats.mjs）'],
   ['terrain','\\.terrain\\b','地形标签进入性状（林/湿/石…）'],['parent','\\.parent\\b','聚落归属：立场传导沿 parent 找聚落'],
   ['features + thermalModel','\\.features\\b|thermalModel','场所物件：交互规则可点燃、浇湿、冻结'],['workstations','workstations','制造工位'],
   ['lodging','lodging','住宿出租'],['monsterSociety','monsterSociety','怪物聚居地：社会立场、治理、舆论'],['site','\\.site\\b','据点：进入、调查、机关、采集'],
   ['access / owner / rooms','\\.access\\b','私宅许可与进入'],['openHours','openHours','营业时间'],['coordinates','coordinates','地图与距离、法术范围'],['microclimate','microclimate','小气候'],
  ],manual:[],refs:['聚落：geo/settlements.json 有档案即自动成为声望与立场传导的聚落（reputation-registry.mjs 派生；怪物聚居地走社会立场）','可达性靠 geo/routes.json 路线','人口展开需 geo/settlements.json 档案']},
 {id:'route',name:'路线',file:'geo/routes.json',required:req('route'),hooks:[
   ['lengthKm','lengthKm','移动耗时、地区价差、传讯'],['closedSeasons','closedSeasons','封路季节、迁徙'],['toll','\\.toll\\b','路费'],
  ],manual:[]},
 {id:'spell',name:'法术',file:'meta/spells.json',required:req('spell'),hooks:[
   ['effectSpec.kind','effectSpec','按 kind 分派到 magic-* 模块'],['effectSpec.damageType','damageType','元素进入交互规则；伤害型命中产生 harm 事件'],
   ['targeting','\\.targeting\\b','目标边界与同意'],['law','\\.law\\b','施法许可与违法'],['learnFee / learnMinutes','learnFee','学习'],
  ],manual:[],refs:[],
  extend:['magic-consent.mjs 从 entity-view、standing 与灵智派生本人决定；rules.law 配置急救例外与强施处罚','新的 effectSpec.kind 由所在模块调用 registerMagicEffect 登记校验与结算（magic-effects.mjs），不改 magic.mjs','需要随时间结算的效果在推进注册表登记']},
 {id:'npc',name:'人物（名册）',file:'people/baseline.json',required:uniq([...req('npc'),...req('npcProfile')]),hooks:[
   ["tier: 'full'","tier==='full'",'完整人物参与认知、自主、生活、承诺推进'],['schedule','\\.schedule\\b','日程移动与服务时段'],
   ['household / householdId','householdId|\\.household\\b','家庭：立场按家庭传导'],['settlement','\\.settlement\\b','所属聚落：立场传导'],
   ['services / serviceCatalog','\\.services\\b|serviceCatalog','交易、授课、节日供货'],['creditPolicy','creditPolicy','赊账政策'],['memorySeeds','memorySeeds','初始记忆'],
   ['goals / redLines','\\.goals\\b|redLines','自主行动计划'],['intelligence','\\.intelligence\\b','灵智等级'],['relationships','relationships','初始关系'],
  ],manual:[],refs:['势力成员：势力的 leader/coreMembers 或人物的 faction 字段即自动成为成员（reputation-registry.mjs 派生）','开店：有交易服务并写 shopType（rules.economy.shops.types 已登记的类型）即自动成为店铺（shop.mjs derivedShops）','传闻种子在 geo/settlements.json 的 details.rumors 或 lore/rumors.json；world/design/w5-rumors-{1..6}.mjs 经 tools/w5-rumors.mjs 审核发布，w5-rumors-common.mjs 与 w5-rumors-sites.mjs 提供来源登记和据点说法。npc-rumors.mjs 读取；携信路线、人物在场与可交谈时间从当前状态派生']},
 {id:'resident',name:'居民（按需展开）',file:'people/residents.json',required:req('resident'),hooks:[
   ['householdId','householdId','按需展开到户'],['settlement','residentIds|populationSeed','聚落人口档案'],
  ],manual:[],refs:['人口册：geo/settlements.json 的 residentIds 列出（人数由人口校验核对），户在 people/households.json']},
 {id:'item',name:'物品',file:'meta/items.json',required:req('item'),hooks:[
   ['tags','itemTraits|applyInteraction','材质标签：可燃、导电、纸张等进入交互规则'],['basePrice','basePrice','定价、赠礼价值、立场权重'],['shelfLifeDays','shelfLifeDays','腐坏'],
   ['book','\\.book\\b','持书学习、著作'],['checkBonus','checkBonus','检定工具加值'],['durability','\\.durability\\b','耐久与维修'],['combat','\\.combat\\b','武器'],
  ],manual:[],refs:['上架：登记店铺的补货条目，或派生店铺店主持有的本地产物（shop.mjs derivedShops）','产出要有配方（meta/recipes.json）或掉落']},
 {id:'recipe',name:'配方',file:'meta/recipes.json',required:req('recipe'),hooks:[
   ['workstation','\\.workstation\\b','须在有工位的地点'],['output / byproducts','\\.output\\b|byproducts','产物登记为物品单件'],['toolWear','toolWear','工具损耗'],['learnFee','learnFee','学习'],
  ],manual:[]},
 {id:'skill',name:'技能',file:'meta/skills.json',required:req('skill'),hooks:[
   ['combatAction','combatAction','战斗动作'],['prerequisites','prerequisites','学习前置'],['learnFee','learnFee','学习'],
  ],manual:[]},
 {id:'profession',name:'职业',file:'meta/professions.json',required:req('profession'),hooks:[
   ['certification','certification','认证'],['trainingInstitutions','trainingInstitutions','训练机构'],['skillTree / promotions','skillTree|promotions','升职'],
  ],manual:[],refs:['长期职业指标与突破在 meta/careers.json']},
 {id:'faction',name:'势力',file:'lore/factions.json',required:['id','name','contactAnchor','relations','clock'],hooks:[
   ['contactAnchor','contactAnchor','联络地点：社会与组织'],['clock','\\.clock\\b','势力时钟阶段'],['relations','\\.relations\\b','势力间关系 → 盟友传导'],
  ],manual:[],refs:['立场传导：lore/factions.json 的势力自动登记（reputation-registry.mjs 派生，relations 照抄目录）；rules.reputation.factions 手填条目作为覆盖','时钟阶段效果在 rules.effectTable.hooks（source: faction）']},
 {id:'organization',name:'组织（游戏中创立）',file:null,required:['world_create type=org','name','data.occupation（行会/帮派/商号/教会）','scope'],hooks:[
   ['organization:<id> 记录','organization:','成员、职位、公库、章程'],['standing kind organization',"'organization'",'成员受损害/恩惠按 0.5 传导给组织'],['organizationEvent','organizationEvent','产生 organize 世界事件'],
  ],manual:[]},
 {id:'festival',name:'节日',file:'lore/festivals.json',required:['id','calendar.month','calendar.day','venue.location','runtime.status=active','runtime.host'],hooks:[
   ['runtime / calendar / venue','festivalCalendar','节日日历、筹办、参加'],['effectTable source:festival',"'festival'",'节日阶段效果'],
  ],manual:[],refs:['主持人 runtime.host 须是名册人物','阶段效果在 rules.effectTable.hooks 用 source: festival 登记']},
 {id:'clock',name:'世界时钟 / 阶段',file:'meta/rules.json#worldClock',required:['id','settlement','intervalDays','probability','stages[].effects[].kind'],hooks:[
   ['stages[].effects','applyEffects?\\(','阶段效果交给效果表执行'],
  ],manual:[],refs:['效果 kind 须已在效果表注册且允许 world 来源']},
 {id:'region',name:'省郡纲要',file:'geo/regions.json',required:['id','name','category（province/county）','terrain','biomes','keyPeople','郡：province / ruler / control / places / ties'],hooks:[
   ['places','regionOf','地点按挂接与上级链归属省郡'],['ruler / control','rulerOf|mapRegions','统治方与非人统治标记（地图）'],['全文','publicLoreEntries|catalogDefinition','目录查询与检索'],
  ],manual:[],refs:['biomes 由 traits 地形词派生（terrainBiomes），K8 据此生成栖地','聚落骨架与人物完整档由后续按需生成']},
 {id:'spirit-route',name:'个体成精路线',file:'meta/rules.json#wildlifeAwakening',required:['stages','spiritLands','spiritItems','mentor','borrowForm','society.homes'],hooks:[
   ['四类积累 / 三阶段','wildlifeAwakening|awakeningTotal','年岁经历、灵地、灵物、点化；听息、立意、借形'],
   ['society.homes','checkSpiritSocieties|society.homes','自愿定居与按季结社'],
  ],manual:[],refs:['T162 内容：world/design/monster-society-3.mjs；审核 tools/monster-society-3-content.mjs；发布 tools/publish-monster-society-3.mjs','族群觉醒复用 tribal-awakening.mjs，不由个体路线新建族群']},
 {id:'lore',name:'文化 / 神祇 / 历史',file:'lore/*.json',required:uniq([...req('culture'),...req('deity')]),hooks:[
   ['church（神祇）','\\.church\\b','复活点、训练、仪式'],['全文','publicLoreEntries|catalogDefinition','目录查询与检索'],
  ],manual:[]},
];
const SCAN_FILES=[...SERVER,...EXTENSION].filter(f=>f!=='server-plugin/legacy/core.js'&&!f.startsWith('server-plugin/compat/'));
const contentTypes=CONTENT.map(c=>{
 const hooks=c.hooks.map(([field,pattern,means])=>{
  const re=new RegExp(pattern),mods=SCAN_FILES.filter(f=>re.test(src(f)));
  return{field,means,pattern,modules:mods,systems:uniq(mods.map(f=>SYSTEM_OF.get(f)).filter(Boolean))};
 });
 const s=c.file&&!c.file.includes('*')&&!c.file.includes('#')?sample(c.file):null;
 return{id:c.id,name:c.name,file:c.file?`world/${c.file}`:null,count:s?.count??null,required:c.required,hooks,autoSystems:uniq(hooks.flatMap(h=>h.systems)),manual:c.manual,refs:c.refs??[],extend:c.extend??[]};
});
// Authored fields that no module reads: they only reach the model through catalog/prompt text.
const CONSUMER_SCAN=SCAN_FILES.map(src).join('\n');
const deadFields=[];
for(const c of contentTypes){if(!c.file||c.count===null)continue;const s=sample(c.file.slice(6));
 const unread=Object.keys(s.fields).filter(k=>!new RegExp(`\\.${k}\\b|'${k}'|\\b${k}:`).test(CONSUMER_SCAN));
 if(unread.length)deadFields.push({content:c.id,file:c.file,fields:unread.sort()});}

// ---------------------------------------------------------------- findings
const importedBy=new Map();for(const [f,m]of Object.entries(modules))for(const t of m.imports){if(!importedBy.has(t))importedBy.set(t,[]);importedBy.get(t).push(f);}
const entryPoints=new Set(['server-plugin/index.mjs','extension/index.js','extension/runtime.js','extension/core.js','server-plugin/legacy/core.js']);
const testsText=listDir('tests',/\.mjs$/).map(src).join('\n'),toolsText=listDir('tools',/\.mjs$/).filter(f=>f!=='tools/system-map.mjs').map(src).join('\n');
const orphanModules=CODE.filter(f=>!entryPoints.has(f)&&!importedBy.has(f)&&!/seed\.json$/.test(f)).map(f=>({module:f,usedByTests:testsText.includes(path.basename(f)),usedByTools:toolsText.includes(path.basename(f))}));
const systemDegree=Object.fromEntries(systemFacts.map(s=>[s.id,{in:links.filter(l=>l.to===s.id&&l.from!=='kernel_engine').length,out:links.filter(l=>l.from===s.id&&l.to!=='kernel_engine'&&l.to!=='kernel_storage').length}]));
// Isolated: no link other than calls to/from the kernel. Passive: simulation systems
// that never act on their own (no advance entry, no subscription, no effect kind).
const KERNEL=new Set(['kernel_engine','kernel_storage']);
const isolatedSystems=systemFacts.filter(s=>s.layer!=='data'&&!links.some(l=>(l.from===s.id&&!KERNEL.has(l.to))||(l.to===s.id&&!KERNEL.has(l.from)))).map(s=>({id:s.id,name:s.name,note:'除内核外没有任何连线'}));
const producedVerbs=files=>VERBS.filter(v=>verbProducers[v].some(m=>files.includes(m)));
const passiveSystems=systemFacts.filter(s=>s.layer==='sim'&&!s.advance.length&&!s.subscribes.length&&!s.effects.length).map(s=>({id:s.id,name:s.name,tools:s.tools,
 produces:uniq([...producedVerbs(s.modules),...s.modules.flatMap(m=>toolVerbs[path.basename(m,'.mjs')]??[])]),
 note:'不在推进表、不订阅世界事件、不实现效果；只在工具调用时结算'}));
const unusedEffects=effects.filter(e=>!e.usedIn.length).map(e=>e.kind);
const manualWiring=[
 ...contentTypes.flatMap(c=>c.manual.map(m=>({content:c.name,item:m}))),
 {content:'工具',item:'新工具要同时改 extension/tools.mjs 定义、engine.mjs 的职责白名单与 activities.mjs 处理器'},
];
// Not wiring for new content: structural notes about existing registries.
const structureNotes=[
 {content:'推进',item:'推进注册表里的 daily 项内联了农业、宠物、野物、首领的日结；pets 同时在 daily 与 pets 两处被调用'},
];
// S0 架构度量工具（AR 迁移）：每项一条命令，基线登记在 docs/架构设计/度量基线.md。
const METRIC_TOOLS=[
 {tool:'tools/ontology.mjs',script:'metrics:ontology',measures:'词汇表 schema 校验与 I18 词汇封闭（代码用到未登记的动词/标签/罪名）',reads:['world/ontology','schemas/ontology.schema.json'],baseline:null},
 {tool:'tools/import-graph.mjs',script:'metrics:imports',measures:'I19 import 图：按 tools/arch-layers.mjs 标层，统计向上依赖与包间 import',reads:['server-plugin','extension','tools/arch-layers.mjs'],baseline:'tests/metrics/import-graph.baseline.json'},
 {tool:'tools/derived-scan.mjs',script:'metrics:derived',measures:'I10 派生黑名单：存档写入点与作者数据中应派生却存储的字段',reads:['world/ontology/derived-fields.json','server-plugin','world'],baseline:'tests/metrics/derived-scan.baseline.json'},
 {tool:'tools/export-actions.mjs',script:'metrics:actions',measures:'动作清单自动导出（工具 × 子操作 × 处理器）',reads:['extension/tools.mjs','server-plugin'],output:'docs/actions.json'},
 {tool:'tools/intent-score.mjs',script:'metrics:intents',measures:'意图语料校验与评分骨架（路由、签名、不支持率、兜底实体无系统反应率）',reads:['tests/intents','docs/actions.json','world/ontology'],baseline:null},
 {tool:'tools/probe-score.mjs',script:'metrics:probes',measures:'run-001 事件推演脚本化合理率',reads:['tests/probes/run-001'],baseline:'tests/probes/run-001/baseline.json'},
 {tool:'tools/gap-list.mjs',script:'docs:gaps',measures:'函数级差距清单（保留/改造/替换与迁移阶段）',reads:['server-plugin','extension','tools/arch-layers.mjs'],output:'docs/架构设计/差距清单.md'},
 {tool:'tools/balance-tables.mjs',script:'balance:tables',measures:'S1 数值参数表（22 张，数值方案 §2）：随 world 加载的界内、必填、来源类别、可推算重算校验；包只能在界内覆盖；目标表 targets.json',reads:['world/rules/tables/balance','schemas/balance-table.schema.json','schemas/balance-targets.schema.json'],baseline:null},
 {tool:'tools/balance-metrics.mjs',script:'balance:metrics',measures:'S1 指标库骨架：对存档文档计算货币总量与源汇分项、价格指数、家户基尼、技能阶与等级分布、名额计数、物种存量（其余登记为 todo）；登记 tools/balance-combat.mjs 为竞技场第一版',reads:['world/rules/tables/balance','tools/balance-combat.mjs'],baseline:null},
 {tool:'tools/arch-layers.mjs',script:null,measures:'模块 → 目标层与玩法包归组表（第 10 章），供 import 图与差距清单使用',reads:[],baseline:null},
 {tool:'tools/s0-metrics.mjs',script:'metrics',measures:'以上全部一键产出',reads:[],baseline:null},
];
for(const m of METRIC_TOOLS)if(!fs.existsSync(abs(m.tool)))throw Error(`度量工具不存在：${m.tool}`);
const findings={manualWiring,structureNotes,isolatedSystems,passiveSystems,orphanModules,unusedEffects:unusedEffects.map(k=>({kind:k,note:'已注册，但 rules.json 与 lore 的任何 effects 列表都没有用到'})),deadFields,unassignedModules:unassigned};

// ---------------------------------------------------------------- output
const data={
 title:'无限原野系统地图',card:'K9',
 generatedFrom:{commit:(()=>{try{const h=fs.readFileSync(abs('.git'),'utf8').trim();const dir=h.startsWith('gitdir:')?h.slice(7).trim():abs('.git');const head=fs.readFileSync(path.join(dir,'HEAD'),'utf8').trim();return head.startsWith('ref:')?head.slice(5):head;}catch{return null;}})(),
  method:'运行时导出（注册表、规则表、工具定义、效果表、立场传导表）+ 静态正则扫描（import 图、函数体标识符、state 分区与 records 前缀、rules/world 读取）。静态扫描是近似：经 engine.byId、helper 间接或动态拼接路径的访问不计入。'},
 scanMethods:{
  imports:'解析 import {..} from "./x.mjs"，得到模块依赖与“标识符→来源模块”。',
  handlers:'工具处理器、推进项、效果类型、订阅者：截出函数体（花括号配对），取其中出现的已导入标识符所属模块。',
  stateWrites:"写：.set(['state','P'…) 或 .remove(['state','P'…)。",
  stateReads:"读：get('state','P'…) 或 state.P / state?.P（P 为已知分区）。",
  records:"records 前缀：['state','records',`前缀:…`]、records?.[`前缀:…`]、startsWith('前缀:')；与 set/remove 同行记写，否则记读。",
  worldData:'rules.K / world.K 属性访问（K 为 rules.json 顶层键或 loadWorld 键）、import ../world/design/*.mjs、代码中的 world/<目录>/ 字符串。',
  verbs:"全仓 verb:'x' 字面量 + SOCIAL_VERBS；订阅者关心的动词取其模块内含 verb 的行里的已知动词。",
  contentHooks:'每个内容字段给一个代码模式，扫描 server-plugin 与 extension（不含 legacy/compat）得到实际读取它的模块与系统。',
 },
 counts:{layers:LAYERS.length,systems:SYSTEMS.length,modules:CODE.length,advance:advance.length,tools:tools.length,verbs:VERBS.length,subscribers:subscribers.length,interactionRules:interactions.rules.length,effectKinds:effects.length,links:links.length},
 layers:LAYERS.map(l=>({...l,systems:SYSTEMS.filter(s=>s.layer===l.id).map(s=>s.id)})),
 systems:systemFacts,links,advance,worldEvents,interactions,effects:{kinds:effects,sources:[...EFF.EFFECT_SOURCES],callers:effectCallers,hooks:effectHooks.map(h=>({source:h.source,owner:h.owner,stage:h.stage,kinds:(h.effects??[]).map(e=>e.kind)}))},
 standing,tools,worldData,prompt:{dir:'prompt/',files:fs.readdirSync(abs('prompt')).sort(),readers:promptReaders},rulesReaders,stateShare,
 contentTypes,findings,metricTools:METRIC_TOOLS,modules,
};
const json=JSON.stringify(data,null,1)+'\n';
fs.writeFileSync(abs('docs/system-map.json'),json);
fs.writeFileSync(abs('docs/system-map.html'),renderHTML(data));
export const summary=`system-map: ${LAYERS.length} 层，${SYSTEMS.length} 个系统，${advance.length} 推进项，${tools.length} 工具，${VERBS.length} 动词，${links.length} 条连线 → docs/system-map.json, docs/system-map.html`;
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))console.log(summary);
export {data};

// ---------------------------------------------------------------- HTML
function renderHTML(data){
 const embedded=JSON.stringify({...data,modules:undefined}).replace(/</g,'\\u003c');
 return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>无限原野系统地图</title>
<style>
:root{
 --bg:#f6f4ef;--panel:#ffffff;--ink:#1f2328;--muted:#5d6670;--line:#d9d4c9;--soft:#ece8df;
 --accent:#2f6fb0;--hi:#d9822b;--dim:.14;
 --l-data:#8a6d3b;--l-kernel:#5b6470;--l-base:#7a4fb5;--l-sim:#2f8a5b;--l-ui:#2f6fb0;--l-narr:#b5523b;
 --k-call:#8c96a3;--k-data:#a0763a;--k-event:#7a4fb5;--k-advance:#2f8a5b;--k-effect:#c0538a;--k-tool:#2f6fb0;--k-record:#d9822b;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
 --bg:#15181c;--panel:#1d2126;--ink:#e6e8eb;--muted:#9aa4ae;--line:#323840;--soft:#262b31;
 --accent:#6aa7e6;--hi:#f0a050;
 --l-data:#c9a46a;--l-kernel:#9aa4ae;--l-base:#b18ae6;--l-sim:#5cc48d;--l-ui:#6aa7e6;--l-narr:#e38a72;
 --k-call:#6c7682;--k-data:#c9a46a;--k-event:#b18ae6;--k-advance:#5cc48d;--k-effect:#e07db0;--k-tool:#6aa7e6;--k-record:#f0a050;
}}
:root[data-theme="dark"]{
 --bg:#15181c;--panel:#1d2126;--ink:#e6e8eb;--muted:#9aa4ae;--line:#323840;--soft:#262b31;
 --accent:#6aa7e6;--hi:#f0a050;
 --l-data:#c9a46a;--l-kernel:#9aa4ae;--l-base:#b18ae6;--l-sim:#5cc48d;--l-ui:#6aa7e6;--l-narr:#e38a72;
 --k-call:#6c7682;--k-data:#c9a46a;--k-event:#b18ae6;--k-advance:#5cc48d;--k-effect:#e07db0;--k-tool:#6aa7e6;--k-record:#f0a050;
}
*{box-sizing:border-box}
html,body{margin:0;overflow-x:hidden}
body{background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:1180px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 10px}h3{font-size:16px;margin:16px 0 6px}
p{margin:6px 0}.muted{color:var(--muted)}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
.stat b{font-size:18px;margin-right:4px}
nav.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 0}
nav.tabs button,.chip,.filters label{font:inherit}
nav.tabs button{background:var(--soft);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 12px;cursor:pointer}
nav.tabs button[aria-selected="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
.filters{display:flex;flex-wrap:wrap;gap:4px 14px;margin:10px 0;font-size:13px}
.filters label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.sw{display:inline-block;width:14px;height:3px;border-radius:2px}
#mapwrap{position:relative}
#edges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1}
#edges path{fill:none;stroke-width:1.2;opacity:.35}
#edges path.on{opacity:.95;stroke-width:2.2}
#edges path.off{opacity:.05}
.layer{position:relative;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--lc);border-radius:10px;padding:10px 12px;margin:0 0 26px}
.layer header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.layer header b{color:var(--lc);font-size:16px}
.layer .why{font-size:12.5px;color:var(--muted);margin:2px 0 8px}
.nodes{display:flex;flex-wrap:wrap;gap:8px}
.node{position:relative;z-index:2;background:var(--panel);color:var(--ink);border:1.5px solid var(--lc);border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit;font-size:14px;text-align:left}
.node small{color:var(--muted);margin-left:4px;font-size:11.5px}
.node.sel{background:var(--lc);color:#fff}.node.sel small{color:#fff}
.node.rel{box-shadow:0 0 0 3px color-mix(in srgb,var(--hi) 55%,transparent)}
.node.fade{opacity:.35}
#detail{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:10px 0}
#detail h3{margin-top:0}
.kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 10px;font-size:13.5px}
.kv dt{color:var(--muted)}.kv dd{margin:0;overflow-wrap:anywhere}
.tag{display:inline-block;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:0 6px;margin:1px 3px 1px 0;font-size:12.5px;overflow-wrap:anywhere}
.tag.link{cursor:pointer;border-color:var(--accent)}
code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;overflow-wrap:anywhere}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.card h3{margin:0 0 4px}
.hook{border-top:1px dashed var(--line);padding:4px 0;font-size:13.5px}
.hook b{font-family:ui-monospace,Consolas,monospace;font-size:12.5px}
.manual{color:var(--hi)}
table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{color:var(--muted);font-weight:600}
details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
input[type=search]{font:inherit;width:100%;max-width:360px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
section[hidden]{display:none}
@media (max-width:640px){
 .kv{grid-template-columns:1fr}.kv dt{margin-top:6px}
 .cards{grid-template-columns:minmax(0,1fr)}
 table.wide thead{display:none}table.wide tr{display:block;border-bottom:1px solid var(--line);padding:4px 0}table.wide td{display:block;border:0;padding:1px 4px}
 table.wide td[data-h]::before{content:attr(data-h) "：";color:var(--muted)}
}
</style>
</head>
<body>
<main>
<h1>无限原野系统地图</h1>
<p class="muted">由 <code>node tools/system-map.mjs</code> 从代码导出生成（卡 K9）。数据来自注册表、规则表、工具定义和静态扫描，扫描方法见页底。</p>
<div class="stats" id="stats"></div>
<nav class="tabs" role="tablist">
 <button role="tab" aria-selected="true" data-tab="map">分层系统图</button>
 <button role="tab" aria-selected="false" data-tab="content">加内容查表</button>
 <button role="tab" aria-selected="false" data-tab="base">底座明细</button>
 <button role="tab" aria-selected="false" data-tab="tools">工具分派</button>
 <button role="tab" aria-selected="false" data-tab="findings">待接线与孤立</button>
</nav>

<section id="tab-map">
 <h2>分层系统图</h2>
 <p class="muted">点一个系统，看它读写哪些状态、订阅哪些事件、登记了哪些推进项和效果；相关连线和系统会高亮。再点一次取消。</p>
 <div class="filters" id="filters"></div>
 <div id="detail"><p class="muted">尚未选中系统。</p></div>
 <div id="mapwrap"><svg id="edges" aria-hidden="true"></svg><div id="layers"></div></div>
</section>

<section id="tab-content" hidden>
 <h2>新增一种内容：要接哪些系统</h2>
 <p class="muted">“自动参与”的系统是扫描代码后得到的：只要内容带了这个字段或标签，下列模块就会读到它。橙色条目是仍需手动登记的地方。点系统名可跳到系统图。</p>
 <div class="cards" id="content"></div>
</section>

<section id="tab-base" hidden>
 <h2>底座明细</h2>
 <details open><summary>推进注册表（K7）：按 order 依次结算</summary><table class="wide" id="advance"></table></details>
 <details><summary>世界事件（K3）：动词与订阅者</summary><div id="events"></div></details>
 <details><summary>交互规则（K2）</summary><div id="interactions"></div></details>
 <details><summary>效果表（K6）</summary><div id="effects"></div></details>
 <details><summary>统一立场（K4/K5）：持有方与传导</summary><div id="standing"></div></details>
 <details><summary>共享 state 分区：谁写谁读</summary><table class="wide" id="state"></table></details>
 <details><summary>world/ 数据目录：被谁读取</summary><table class="wide" id="worlddata"></table></details>
</section>

<section id="tab-tools" hidden>
 <h2>25 个模型工具 → 操作 → 模块</h2>
 <input type="search" id="toolq" placeholder="筛选工具、操作或模块">
 <table class="wide" id="tools"></table>
</section>

<section id="tab-findings" hidden>
 <h2>仍需手动接线</h2><ul id="manual"></ul>
 <h3>结构备注（不影响新增内容）</h3><ul id="structure"></ul>
 <h2>孤立或被动的系统</h2><ul id="isolated"></ul>
 <h2>没有被任何模块 import 的模块</h2><ul id="orphans"></ul>
 <h2>静态扫描未发现代码读取的内容字段</h2><p class="muted">这些字段可能只通过目录查询或整条输出到达模型，不参与结算（静态近似，经动态键读取的会漏报）。</p><ul id="dead"></ul>
 <h2>扫描方法</h2><dl class="kv" id="methods"></dl>
</section>
</main>
<script id="data" type="application/json">${embedded}</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);
const $=s=>document.querySelector(s),el=(t,a={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a))k==='class'?e.className=v:k.startsWith('on')?e.addEventListener(k.slice(2),v):e.setAttribute(k,v);for(const x of c.flat())e.append(x?.nodeType?x:document.createTextNode(x??''));return e;};
const SYS=Object.fromEntries(D.systems.map(s=>[s.id,s])),LNAME=Object.fromEntries(D.layers.map(l=>[l.id,l.name]));
const KIND={call:'调用',data:'读数据',event:'订阅事件',advance:'推进',effect:'效果',tool:'工具分派',record:'共享记录'};
const short=m=>m.replace(/^server-plugin\\//,'').replace(/^extension\\//,'ext/');
const tags=(a,cls='tag')=>a?.length?a.map(x=>el('span',{class:cls},x)):[el('span',{class:'muted'},'—')];
const sysTag=id=>el('span',{class:'tag link',onclick:()=>{show('map');select(id);document.getElementById('n-'+id)?.scrollIntoView({block:'center'});}},SYS[id]?.name??id);

// stats
const c=D.counts;
for(const[n,l]of[[c.layers,'层'],[c.systems,'个系统'],[c.modules,'个代码模块'],[c.advance,'个推进项'],[c.verbs,'个事件动词'],[c.subscribers,'个事件订阅者'],[c.interactionRules,'条交互规则'],[c.effectKinds,'种效果'],[c.tools,'个工具'],[D.contentTypes.length,'类内容']])
 $('#stats').append(el('span',{class:'stat'},el('b',{},String(n)),l));

// tabs
function show(t){for(const b of document.querySelectorAll('nav.tabs button'))b.setAttribute('aria-selected',String(b.dataset.tab===t));for(const s of document.querySelectorAll('main>section'))s.hidden=s.id!=='tab-'+t;if(t==='map')requestAnimationFrame(draw);}
for(const b of document.querySelectorAll('nav.tabs button'))b.onclick=()=>show(b.dataset.tab);

// map
const active=new Set(['data','event','advance','effect','tool','record']);
for(const k of Object.keys(KIND)){const cb=el('input',{type:'checkbox'});cb.checked=active.has(k);cb.onchange=()=>{cb.checked?active.add(k):active.delete(k);draw();};
 $('#filters').append(el('label',{},cb,el('span',{class:'sw',style:'background:var(--k-'+k+')'}),KIND[k]+' ('+D.links.filter(l=>l.kind===k).length+')'));}
for(const l of D.layers){
 const box=el('div',{class:'layer',style:'--lc:var(--l-'+l.id+')'},el('header',{},el('b',{},l.name),el('span',{class:'muted'},l.systems.length+' 个系统')),el('p',{class:'why'},l.reason));
 const nodes=el('div',{class:'nodes'});
 for(const id of l.systems){const s=SYS[id];const sub=s.card??(s.layer==='data'?s.dir:s.modules.length+' 模块');
  nodes.append(el('button',{class:'node',id:'n-'+id,'data-id':id,style:'--lc:var(--l-'+l.id+')',onclick:()=>select(sel===id?null:id)},s.name,el('small',{},sub)));}
 box.append(nodes);$('#layers').append(box);
}
let sel=null;
function center(id,wrap){const n=document.getElementById('n-'+id);if(!n)return null;const r=n.getBoundingClientRect();return{x:r.left-wrap.left+r.width/2,y:r.top-wrap.top+r.height/2,h:r.height};}
function draw(){
 const svg=$('#edges'),wrap=$('#mapwrap').getBoundingClientRect();if(!wrap.width)return;
 svg.setAttribute('viewBox','0 0 '+wrap.width+' '+wrap.height);svg.innerHTML='';
 for(const l of D.links){if(!active.has(l.kind))continue;const a=center(l.from,wrap),b=center(l.to,wrap);if(!a||!b)continue;
  const on=sel&&(l.from===sel||l.to===sel);if(sel&&!on&&l.kind==='call')continue;
  const dy=Math.max(30,Math.abs(b.y-a.y)/2),y1=a.y+(b.y>a.y?a.h/2:b.y<a.y?-a.h/2:0),y2=b.y+(b.y>a.y?-b.h/2:b.y<a.y?b.h/2:0);
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('d','M'+a.x+','+y1+' C'+a.x+','+(y1+(b.y>=a.y?dy:-dy))+' '+b.x+','+(y2-(b.y>=a.y?dy:-dy))+' '+b.x+','+y2);
  p.setAttribute('stroke','var(--k-'+l.kind+')');p.setAttribute('class',sel?(on?'on':'off'):'');
  const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=(SYS[l.from]?.name)+' → '+(SYS[l.to]?.name)+'（'+KIND[l.kind]+'）：'+l.labels.join('、');p.append(t);svg.append(p);}
}
function select(id){
 sel=id;const rel=new Set();if(id)for(const l of D.links)if(active.has(l.kind)&&(l.from===id||l.to===id)){rel.add(l.from);rel.add(l.to);}
 for(const n of document.querySelectorAll('.node')){const x=n.dataset.id;n.classList.toggle('sel',x===id);n.classList.toggle('rel',!!id&&x!==id&&rel.has(x));n.classList.toggle('fade',!!id&&!rel.has(x)&&x!==id);}
 draw();renderDetail(id);
}
function renderDetail(id){
 const d=$('#detail');d.innerHTML='';if(!id){d.append(el('p',{class:'muted'},'尚未选中系统。'));return;}
 const s=SYS[id],dl=el('dl',{class:'kv'}),row=(k,v)=>dl.append(el('dt',{},k),el('dd',{},v));
 d.append(el('h3',{},s.name+'  ',el('span',{class:'muted'},LNAME[s.layer]+(s.card?' · '+s.card:''))));
 if(s.layer==='data'){row('目录',s.dir);row('文件数',String(s.files??'—'));row('被这些系统读取',s.readBy.length?s.readBy.map(sysTag):tags([]));}
 else{
  row('模块',tags(s.modules.map(short)));
  if(s.id==='nar_prompt')row('读取 prompt/ 的',s.readBy.length?s.readBy.map(x=>SYS[x]?sysTag(x):el('span',{class:'tag'},short(x))):tags([]));
  row('写 state 分区',tags(s.stateWrites));row('读 state 分区',tags(s.stateReads));
  row('写 records 前缀',tags(s.recordWrites));row('读 records 前缀',tags(s.recordReads));
  row('读 rules 键',tags(s.rules));row('读 world 键',tags(s.world));
  row('推进项',tags(s.advance));row('订阅世界事件',s.subscribes.length?s.subscribes.map(x=>el('span',{class:'tag'},x.fn+(x.verbs.length?'（'+x.verbs.join('/')+'）':''))):tags([]));
  row('实现效果类型',tags(s.effects));row('处理工具',tags(s.tools));
 }
 const by=k=>D.links.filter(l=>l[k]===id&&active.has(l.kind));
 const list=(ls,k)=>ls.length?ls.map(l=>el('div',{},el('span',{class:'sw',style:'background:var(--k-'+l.kind+')'}),' ',KIND[l.kind],' ',sysTag(l[k]),el('span',{class:'muted'},' '+l.labels.slice(0,6).join('、')+(l.labels.length>6?' 等'+l.labels.length+'项':'')))):[el('span',{class:'muted'},'—')];
 row('连出',list(by('from'),'to'));row('连入',list(by('to'),'from'));
 d.append(dl);
}
addEventListener('resize',()=>requestAnimationFrame(draw));
if(document.fonts)document.fonts.ready.then(draw);requestAnimationFrame(draw);

// content
for(const ct of D.contentTypes){
 const card=el('div',{class:'card'},el('h3',{},ct.name),el('p',{class:'muted'},(ct.file?ct.file:'运行时创建')+(ct.count!=null?' · 现有 '+ct.count+' 条':'')));
 card.append(el('p',{},el('b',{},'必填 '),...tags(ct.required)));
 card.append(el('p',{},el('b',{},'自动参与 '),...(ct.autoSystems.length?ct.autoSystems.map(sysTag):tags([]))));
 for(const h of ct.hooks)card.append(el('div',{class:'hook'},el('b',{},h.field),' — ',h.means,el('br'),...(h.systems.length?h.systems.map(sysTag):[el('span',{class:'muted'},'（代码中未找到读取者）')])));
 if(ct.manual.length)card.append(el('div',{class:'hook'},el('b',{},'手动接线'),el('ul',{},ct.manual.map(m=>el('li',{class:'manual'},m)))));
 if(ct.refs.length)card.append(el('div',{class:'hook'},el('b',{},'配套数据（只写数据，由校验核对）'),el('ul',{},ct.refs.map(m=>el('li',{},m)))));
 if(ct.extend.length)card.append(el('div',{class:'hook'},el('b',{},'扩展机制或词表时'),el('ul',{},ct.extend.map(m=>el('li',{},m)))));
 $('#content').append(card);
}

// base details
const th=(t,...h)=>t.append(el('thead',{},el('tr',{},h.map(x=>el('th',{},x)))));
const td=(h,...v)=>el('td',{'data-h':h},...v);
{const t=$('#advance');th(t,'order','id','细分步进','模块','触及分区');const b=el('tbody');for(const a of D.advance)b.append(el('tr',{},td('order',String(a.order)),td('id',el('code',{},a.id)),td('细分步进',a.stepped?'是':'否'),td('模块',a.modules.map(short).join('、')+(a.inline?'（内联）':'')),td('触及分区',a.partitions.join('、'))));t.append(b);}
{const e=D.worldEvents,box=$('#events');
 box.append(el('p',{},el('b',{},'全部动词 '),...e.verbs.map(v=>el('span',{class:'tag'},v+(e.socialVerbs.includes(v)?' ●':'')))),el('p',{class:'muted'},'● 为社会动词，会存为 '+e.storedAs+'。'+e.verbNotes.default+'。'));
 const t=el('table',{class:'wide'});th(t,'动词','含义','产生于');const b=el('tbody');for(const v of e.verbs)b.append(el('tr',{},td('动词',el('code',{},v)),td('含义',e.verbNotes[v]??''),td('产生于',(e.producers[v]??[]).map(short).join('、'))));t.append(b);box.append(t);
 const t2=el('table',{class:'wide'});th(t2,'顺序','订阅函数','模块','关心的动词');const b2=el('tbody');for(const s of e.subscribers)b2.append(el('tr',{},td('顺序',String(s.order)),td('订阅函数',el('code',{},s.fn)),td('模块',short(s.module)+(s.note?'（'+s.note+'）':'')),td('关心的动词',s.verbs.join('、')||'全部')));t2.append(b2);box.append(el('h3',{},'订阅者'),t2);}
{const i=D.interactions,box=$('#interactions');
 box.append(el('p',{},'施动者：',...tags(i.agents)),el('p',{},'条件标签：',...tags(i.tags)),el('p',{},'读取交互的模块：',...tags(i.consumers.map(short))),el('p',{},'读取性状的模块：',...tags(i.traitReaders.map(short))));
 const t=el('table',{class:'wide'});th(t,'规则','施动者','条件','效果');const b=el('tbody');
 for(const r of i.rules)b.append(el('tr',{},td('规则',el('code',{},r.id)),td('施动者',r.agent),td('条件',Object.entries(r.when).map(([k,v])=>k+':'+[].concat(v).join('/')).join('；')),td('效果',Object.entries(r.effect).map(([k,v])=>k+'='+[].concat(v).join('/')).join('；'))));t.append(b);box.append(t);}
{const f=D.effects,box=$('#effects');box.append(el('p',{},'来源：',...tags(f.sources)),el('p',{},'调用效果表的模块：',...tags(f.callers.map(short))));
 const t=el('table',{class:'wide'});th(t,'效果类型','允许来源','实现模块','被规则数据使用');const b=el('tbody');
 for(const k of f.kinds)b.append(el('tr',{},td('效果类型',el('code',{},k.kind)),td('允许来源',k.sources.join('、')),td('实现模块',k.modules.map(short).join('、')),td('被规则数据使用',k.usedIn.join('、')||'—')));t.append(b);box.append(t);}
{const s=D.standing,box=$('#standing');box.append(el('p',{},'持有方种类：',...tags(s.holderKinds)),el('p',{},'计权动词：',...tags(s.weightedVerbs)),
 el('p',{},'传导比例：',...Object.entries(s.transmission).map(([k,v])=>el('span',{class:'tag'},k+' '+v))),el('p',{},'包装的既有账本：',...tags(s.stores.map(short))),el('p',{},'读取立场的模块：',...tags(s.readers.map(short))),el('p',{class:'muted'},s.notes));}
{const t=$('#state');th(t,'分区','写入系统','读取系统');const b=el('tbody');for(const[p,x]of Object.entries(D.stateShare))b.append(el('tr',{},td('分区',el('code',{},p)),td('写入系统',...x.writers.map(sysTag)),td('读取系统',...(x.readers.length?x.readers.map(sysTag):['—']))));t.append(b);}
{const t=$('#worlddata');th(t,'目录','文件','读取模块','离线工具');const b=el('tbody');for(const w of D.worldData)b.append(el('tr',{},td('目录',el('code',{},w.dir)),td('文件',String(w.files)),td('读取模块',w.readers.map(short).join('、')||'—'),td('离线工具',w.tools.length?w.tools.length+' 个':'—')));
 b.append(el('tr',{},td('目录',el('code',{},'prompt/')),td('文件',String(D.prompt.files.length)),td('读取模块',D.prompt.readers.map(short).join('、')),td('离线工具','')));t.append(b);}

// tools
function renderTools(q=''){const t=$('#tools');t.innerHTML='';th(t,'工具','说明','操作 → 内部工具 → 处理器','系统');const b=el('tbody');
 for(const x of D.tools){const text=JSON.stringify(x);if(q&&!text.includes(q))continue;
  b.append(el('tr',{},td('工具',el('code',{},x.name),x.readOnly?el('span',{class:'muted'},' 只读'):''),td('说明',x.description),
   td('分派',...x.routes.map(r=>el('div',{},el('code',{},r.tool),r.operations.length?'：'+r.operations.join(' '):'',el('br'),el('span',{class:'muted'},(r.handler??'')+' → '+r.modules.map(short).join('、'))))),
   td('系统',...x.systems.map(sysTag))));}
 t.append(b);}
renderTools();$('#toolq').oninput=e=>renderTools(e.target.value.trim());

// findings
const F=D.findings;
for(const m of F.manualWiring)$('#manual').append(el('li',{},el('b',{},m.content+'：'),m.item));
for(const m of F.structureNotes)$('#structure').append(el('li',{},el('b',{},m.content+'：'),m.item));
for(const s of F.isolatedSystems)$('#isolated').append(el('li',{},sysTag(s.id),' ',s.note));
for(const s of F.passiveSystems)$('#isolated').append(el('li',{},sysTag(s.id),'（被动）',s.note,'；工具：',s.tools.join('、')||'无','；产生事件：',s.produces.join('、')||'无'));
for(const e of F.unusedEffects)$('#isolated').append(el('li',{},'效果类型 ',el('code',{},e.kind),'：',e.note));
for(const o of F.orphanModules)$('#orphans').append(el('li',{},el('code',{},o.module),o.usedByTests?'（测试引用）':'',o.usedByTools?'（离线工具引用）':''));
if(!F.orphanModules.length)$('#orphans').append(el('li',{class:'muted'},'无'));
for(const x of F.deadFields)$('#dead').append(el('li',{},el('b',{},x.file+'：'),...tags(x.fields)));
for(const[k,v]of Object.entries(D.scanMethods))$('#methods').append(el('dt',{},k),el('dd',{},v));
</script>
</body>
</html>
`;
}
