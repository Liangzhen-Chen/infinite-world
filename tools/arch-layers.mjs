// S0：现有模块 → 目标层（03 章五层）与目标玩法包，按 10 章 §10.2 的归组表。
// import 图测试（tools/import-graph.mjs）用它标层；新模块必须在这里归类，否则测试报“未归层”。
// 第 10 章未逐一列出的模块（标 * 的注释）由本表按职责补归。
export const LAYERS=['L0','L1','L2','L3','L4'];
export const LAYER_NAMES={L0:'内核',L1:'本体',L2:'玩法包',L3:'投影',L4:'接口'};

const L0=['storage','archived-reducer','campaign-reducer','migrations','migrations/r1','rule-state-migration','world-upgrade','world-registry',
 'agriculture-migration','boss-migration','farm-pests-migration',/* 迁移归存档 */
 'engine','activities'/* 工具分派适配器，随 engine */,'ledger'/* S1a 账本：账户与转移 */,'holdings'/* S2a 持有存储：持有、实体化对象与位置事实 */,'advance-registry','advance-layers','effect-registry','effects','magic-effects','magic-primitives','checks','world-events',
 'compat/v2-phase1-activities','compat/v2-phase1-engine','legacy/core'];
const L1=['subjective-view','npc-decision','autonomy-candidates','entity-view','organization-state','employment-state','facility-state','noble-state','faith-state','education-state','family-state','npc-state','medicine-state'/* *-state 选择器 */,
 'entity-transitions','group-account','money'/* S1a 货币适配器：旧字段 → 账户 */,'stock'/* S1b 物品、粮与库存适配器：旧字段 → 账户 */,'holding-kinds'/* S2a 持有种类注册表 */,'holding-sources'/* S2a 持有适配器：旧字段 → 持有 */,'items','finance-operations','law-codes','traits','interactions','location-access','regions','catalog','retrieval','retrieval-lexicon','lore','character','progression','action-registry'/* A1 动作注册表（数据） */];
const PACKS={
 economy:['business','shop','settlement-trade','finance-bank','finance-assets','finance-tax','credit','contracts','labor-market','transport','transport-route','post','smuggling','extraction','manufacturing','repair','works','magic-economy'],
 law:['law','bounty','npc-crime','legal-representation','duels'],
 governance:['governance','civic','promotion','promotion-view','elections','titles','high-nobility','nation-founding','public-projects','office-salary','notables','settlement-profile'],
 family:['npc-life','family-inheritance','family-law','family-politics','family-diplomacy'],
 organizations:['organizations','faction-clock','faith','faith-catalog','festival','world-clock'/* * 时钟阶段，与势力时钟同组 */],
 ecology:['weather','hazard-calendar','seasonal-hazards','agriculture','wildlife','wildlife-habitats','wildlife-range','wildlife-migration','wildlife-awakening','wildlife-society','seasonal-migration','farm-pests',
  'bosses','boss-abilities','boss-cognition','boss-negotiation','creature-nature','environment','monster-society','tribal-awakening','sites','forest-water','water-cycle'/* RW-04 林水 */],
 magic:['magic','magic-air','magic-area','magic-care','magic-consent','magic-context','magic-growth','magic-light','magic-marks','magic-message','magic-mind-space','magic-movement','magic-object','magic-ritual','magic-status','magic-targeting','magic-water-earth','spell-research','summons'],
 character:['combat','revival','professions','career-metrics','hidden-passives','training','local-exams','learning','education','education-cohorts'],
 npc:['dialogue','npc-autonomy','npc-planning-service','npc-schedule','npc-memory','npc-cognition','npc-relations','npc-intelligence','npc-growth','npc-obligations','npc-rumors','lies'],
 military:['military','war-diplomacy'],
 companion:['pets'],
 remote:['remote-generation','population','population-service'],
 medicine:['medicine'/* * RW-06 日常诊疗 */],
 quests:['quest-board','quest-sources','quest-wildlife'/* * 委托 */],
 facilities:['facilities'/* * 03 §3.4 设施包（火灾） */],
};
const L3=['scene-card','prompt-scope','chronicle','state-notices','return-summary','consistency-review','consistency-service','consistency-evidence','consistency-outcome',
 'standing','reputation','reputation-registry','reputation-catalog','public-opinion','ui-affairs','ui-history','ui-map','ui-messages','ui-overview','ui-personal',
 'applied-effects','action-text','action-affordances'/* A1 已应用效果、事件流模板、可做之事 */];
const L4=['index','ui-routes','action-gateway'/* A1 world_act 翻译 */];

const TABLE=new Map();
const put=(names,layer,pack=null)=>{for(const n of names){const f=`server-plugin/${n}.${n.startsWith('legacy/')?'js':'mjs'}`;if(TABLE.has(f))throw Error(`重复归层：${f}`);TABLE.set(f,{layer,pack});}};
put(L0,'L0');put(L1,'L1');for(const [pack,names]of Object.entries(PACKS))put(names,'L2',pack);put(L3,'L3');put(L4,'L4');
export const PACK_NAMES=Object.keys(PACKS);

// {layer, pack} for a repository-relative file, or null when unassigned.
export function layerOf(file){
 if(TABLE.has(file))return TABLE.get(file);
 if(file.startsWith('extension/'))return{layer:'L4',pack:null};
 const m=/^packs\/([^/]+)\//.exec(file);if(m)return{layer:'L2',pack:m[1]};
 return null;
}
export function assignedFiles(){return [...TABLE.keys()];}
