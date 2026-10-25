// Domain operation requirements, liquid/field unit conversions and vocabulary
// live in world/rules/tables/domain-rules.json. Actual tools and map junctions
// are derived by their consumers; the table does not name particular tools.
// validateDomainRules() is the world check run by tools/load-world.mjs.
const NONE=Object.freeze({});
const derived=new WeakMap();
const memo=(table,key,build)=>{
 if(!table||typeof table!=='object')return build();
 let slot=derived.get(table);if(!slot)derived.set(table,slot=new Map());
 if(!slot.has(key))slot.set(key,build());
 return slot.get(key);
};
export const domainRules=engine=>engine?.world?.domainRules??NONE;
// A named identifier of the world vocabulary (operation names, damage kinds, payment purposes...).
export const vocabulary=(engine,...path)=>path.reduce((v,k)=>v?.[k],domainRules(engine).vocabulary);

// ---- physical mechanisms ----------------------------------------------------
export function mechanismRule(engine,mechanism){
 const rows=domainRules(engine).physicalMechanisms;
 return typeof mechanism==='string'&&rows&&Object.hasOwn(rows,mechanism)?rows[mechanism]:null;
}
// knowledge id -> {mechanisms:[...]}, derived from the mechanism rows.
export function practicalKnowledgeRegistry(engine){
 const table=domainRules(engine).physicalMechanisms;
 return memo(table,'practical',()=>{
  const registry={};
  for(const [id,row] of Object.entries(table??{}))if(row.practicalKnowledge)(registry[row.practicalKnowledge]??={mechanisms:[]}).mechanisms.push(id);
  return Object.freeze(registry);
 });
}

// ---- liquids ---------------------------------------------------------------
// The portion item is whichever catalogue item carries the liquid's tag; its
// volume follows from its catalogue weight and the liquid's density.
export function liquidItem(engine,liquid='water'){
 const rule=domainRules(engine).liquids?.[liquid];
 if(!rule)return null;
 return memo(engine.world.items,`liquid:${liquid}`,()=>engine.world.items.find(i=>i.tags?.includes(rule.itemTag))?.id??null);
}
export function liquidPortionMl(engine,liquid='water'){
 const item=liquidItem(engine,liquid),rule=domainRules(engine).liquids?.[liquid],weight=item&&engine.byId.get(item)?.weight;
 return rule&&Number.isFinite(weight)&&weight>0?Math.round(weight*rule.mlPerKg):null;
}

// ---- hand-tool repair ------------------------------------------------------
export function handRepairRefused(engine,facts){
 // Handheld surface work can use the existing repair process; structural work cannot.
 return Boolean(facts.scale&&facts.scale!=='handheld'||facts.damage?.kind==='cracked_body');
}

// ---- languages ---------------------------------------------------------------
function languageTable(engine){
 const table=domainRules(engine).languages;
 return memo(table,'languages',()=>{
  const aliases=new Map(),ids=new Set(table?Object.keys(table):['lang:common']);
  for(const [id,row] of Object.entries(table??{}))for(const alias of row.aliases??[])aliases.set(alias,id);
  return {aliases,ids};
 });
}
export const languageId=(engine,id)=>languageTable(engine).aliases.get(id)??id;
export const isLanguage=(engine,id)=>languageTable(engine).ids.has(languageId(engine,id));

// ---- world check -----------------------------------------------------------
export function validateDomainRules(world){
 const table=world.domainRules;if(table===undefined)return;
 const fail=message=>{throw Error(`领域规则表无效：${message}`);};
 if(!table||typeof table!=='object'||Array.isArray(table)||table.version!==1)fail('缺少 version 1');
 const known=new Set(['version','note','physicalMechanisms','liquids','handRepair','privateField','languages','map','governance','vocabulary']);
 for(const key of Object.keys(table))if(!known.has(key))fail(`未知分区 ${key}`);
 const use=(tag,where)=>{if(typeof tag!=='string'||!tag)fail(`${where} requires a nonempty use tag`);};
 for(const [id,row] of Object.entries(table.physicalMechanisms??{})){
  const where=`physicalMechanisms.${id}`;
  if(!['disarm','unlock'].includes(row.operation))fail(`${where}.operation 须为 disarm 或 unlock`);
  if(!['armed','locked'].includes(row.state))fail(`${where}.state 须为 armed 或 locked`);
  if(typeof row.requiresIdentified!=='boolean')fail(`${where}.requiresIdentified 须为布尔值`);
  if(row.practicalKnowledge!==undefined&&(typeof row.practicalKnowledge!=='string'||!row.practicalKnowledge))fail(`${where}.practicalKnowledge 无效`);
  use(row.requiresUse,`${where}.requiresUse`);
  for(const key of Object.keys(row))if(!['operation','state','requiresUse','requiresIdentified','practicalKnowledge'].includes(key))fail(`${where} 含未知字段 ${key}`);
 }
 for(const [liquid,row] of Object.entries(table.liquids??{})){
  const tagged=(world.items??[]).filter(i=>i.tags?.includes(row.itemTag));
  if(typeof row.itemTag!=='string'||tagged.length!==1)fail(`liquids.${liquid} 的物品标签须恰好对应一件物品`);
  if(!Number.isFinite(row.mlPerKg)||row.mlPerKg<=0||!Number.isFinite(tagged[0].weight)||tagged[0].weight<=0)fail(`liquids.${liquid} 缺少体积换算`);
 }
 const list=value=>Array.isArray(value)&&value.every(x=>typeof x==='string'&&x);
 if(table.privateField!==undefined){
  const field=table.privateField;
  use(field.sowRequiresUse,'privateField.sowRequiresUse');use(field.harvestRequiresUse,'privateField.harvestRequiresUse');
  if(!(field.muPerHectare>0)||!(field.kgPerJin>0))fail('privateField 的单位换算须为正数');
 }
 if(table.languages!==undefined){
  const seen=new Set(Object.keys(table.languages));
  for(const [id,row] of Object.entries(table.languages)){
   if(!/^lang:[a-z][a-z0-9_-]*$/.test(id)||!list(row.aliases??[]))fail(`languages.${id} 无效`);
   for(const alias of row.aliases??[]){if(seen.has(alias))fail(`语言别名重复：${alias}`);seen.add(alias);}
  }
 }
 if(table.vocabulary!==undefined){
  const check=(value,where)=>{
   if(typeof value==='string'){if(!value)fail(`${where} 为空`);}
   else if(Array.isArray(value)){if(value.some(x=>typeof x!=='string'||!x))fail(`${where} 须为字符串列表`);}
   else if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))if(k!=='note')check(v,`${where}.${k}`);}
   else fail(`${where} 类型无效`);
  };
  check(table.vocabulary,'vocabulary');
 }
 if(table.governance!==undefined){
  const rule=table.governance,kinds=['notice','building_rule','transport_claim','expired_pawn_ticket','debt_evidence'];
  if(typeof rule.reviewOperation!=='string'||!rule.reviewOperation)fail('governance.reviewOperation 无效');
  for(const [verb,row] of Object.entries(rule.documentSources??{}))if(!kinds.includes(row.kind)||row.cause!==undefined&&typeof row.cause!=='string')fail(`governance.documentSources.${verb} 无效`);
 }

}
