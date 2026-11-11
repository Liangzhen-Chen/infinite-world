import { loreIssues } from './economy-content.mjs';
import { hashContent } from './content-pipeline.mjs';
import { validateWorld } from './validate-world.mjs';
import { numeralIssues } from './content-numerals.mjs';
import { applySupersedes } from './approved-revisions.mjs';

// 物品正文不再以长度逼内容（骨架没写就不写，事实少就写短）：只有短到近乎空文本（少于 6 字）才提示 L4 抽读；配方 process 的长度提示不变。
const ITEM_MIN_LENGTH = 6;
const units = { '公斤': ['weight',1], '千克':['weight',1], '斤':['weight',.5], '克':['weight',.001], '铜币':['basePrice',1], '分钟':['minutes',1], '小时':['minutes',60], '天':['shelfLifeDays',1] };
const numeral='(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万点半]+?)';
export function chineseNumber(value){
  if(/^\d/.test(value))return Number(value);if(value==='半')return .5;
  const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if(value.includes('点')){const[whole,fraction]=value.split('点');return chineseNumber(whole)+Number('0.'+[...fraction].map(x=>digits[x]).join(''));}
  if(!/[十百千万]/.test(value))return Number([...value].map(x=>digits[x]).join(''));
  let sum=0,last=0;for(const c of value){if(c in digits)last=digits[c];else{sum+=(last||1)*({十:10,百:100,千:1000,万:10000}[c]);last=0;}}return sum+last;
}
const grams = value => { const clean=value.replace(/[^\p{L}]/gu,''); return new Set(Array.from({length:Math.max(0,clean.length-1)},(_,i)=>clean.slice(i,i+2))); };
export function closestW3Similarity(draft, others) {
  const corpus = row => ['description','inspection','storage','process'].map(key=>row[key]??'').join('');
  const own = grams(corpus(draft)); let maximum=0, other=null;
  for(const row of others){if(row.id===draft.id)continue; const set=grams(corpus(row));let shared=0;for(const word of own)if(set.has(word))shared++;const score=shared/(own.size+set.size-shared||1);if(score>maximum){maximum=score;other=row.id;}}
  return {score:maximum,id:other};
}
export function w3Context(world,bones,entry) {
  const context=w3ContextFacts(world,bones,entry);
  // 校验用的目录与配方表：不可枚举，不进入指纹、审核请求和落盘快照（见 w3-process-check.mjs）。
  Object.defineProperty(context,'catalog',{value:[...world.items,...bones.items]});
  Object.defineProperty(context,'catalogRecipes',{value:[...(world.recipes??[]),...(bones.recipes??[])]});
  // 世界里的人名、地名、店名：物品正文名称出处检查（w3-item-claims.mjs）用，同样不进指纹。
  Object.defineProperty(context,'worldNames',{value:[...world.npcs,...world.locations].filter(row=>typeof row.name==='string'&&row.name.length>=2).map(row=>({id:row.id,name:row.name}))});
  return context;
}
function w3ContextFacts(world,bones,entry) {
  const ids = new Map([...world.items,...bones.items,...world.npcs,...world.locations,...world.skills].map(row=>[row.id,row]));
  const fact = id => {const row=ids.get(id);if(!row)throw new Error(`引用丢失 ${id}`);return {id:row.id,name:row.name,weight:row.weight,basePrice:row.basePrice,use:row.use,shelfLifeDays:row.shelfLifeDays};};
  if(entry.id.startsWith('recipe_'))return {materials:entry.materials.map(row=>({...row,facts:fact(row.item)})),tools:entry.tools.map(fact),product:fact(entry.output.item),byproducts:entry.byproducts.map(row=>({...row,facts:fact(row.item)})),skill:fact(entry.skill),workplaces:world.locations.filter(row=>row.workstations?.some(s=>s.kind===entry.workstation)).map(row=>({id:row.id,name:row.name})),teachers:entry.teachers.map(fact)};
  return {origin:fact(entry.origin),recipe:bones.recipes.find(row=>row.output.item===entry.id)??null,book:entry.book?{...entry.book,teaches:entry.book.teaches.map(id=>({id,name:bones.recipes.find(row=>row.id===id)?.name}))}:null};
}
export function validateW3Draft(draft,entry,blocklist,context=null) {
  const item=entry.id.startsWith('item_'),fields=item?['description','inspection','storage']:['process'],errors=[],warnings=[];
  if(!draft||typeof draft!=='object'||Array.isArray(draft))return {errors:['说明必须为对象'],warnings};
  if(draft.id!==entry.id)errors.push('说明编号与骨架不一致');
  if(Object.keys(draft).some(key=>!['id',...fields].includes(key)))errors.push('说明覆盖了骨架或增加未授权字段');
  for(const field of fields){if(typeof draft[field]!=='string'||!draft[field].trim())errors.push(`缺少 ${field}`);else if(draft[field].length<(item?ITEM_MIN_LENGTH:field==='description'?60:25)||draft[field].length>240)warnings.push(`${field}长度为${draft[field].length}，进入L4抽读`);}
  if(errors.length)return {errors,warnings};
  const text=fields.map(field=>draft[field]).join('');
  for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽词 ${word}`);
  if(/主持人|玩家不能|不要让|禁止|骨架|schema|JSON|系统要求/.test(text))errors.push('泄漏规则措辞');
  if(/(?:npc|item|recipe|skill|loc|bld)_[a-z0-9_]+/.test(text))errors.push('说明泄漏内部实体编号');
  if(item)errors.push(...loreIssues(draft,entry));
  // Numeric claims in item prose concern this item. Recipes include ingredient
  // quantities, so their other numbers are checked by L2 against named facts.
  if(item)for(const match of text.matchAll(new RegExp(`(${numeral})\\s*(公斤|千克|斤|克|铜币|分钟|小时)`,'g'))){
    const[field,factor]=units[match[2]],expected=field==='minutes'?entry.book?.readingMinutes:entry[field];
    if(expected!==undefined&&Math.abs(chineseNumber(match[1])*factor-expected)>.0001)errors.push(`数字${match[0]}与${field}=${expected}矛盾`);
  }
  if(!item){
    // Only an explicitly overall duration must equal minutes. A substep such
    // as "浸泡约30分钟" may use part of a 90-minute process.
    for(const match of draft.process.matchAll(new RegExp(`(?:总耗时|总用时|总计|全程|前后|整个过程|整件活计|全部)(?:(?:约|为|需|要|一共|共|工时))*\\s*(${numeral})(?:个)?\\s*(分钟|小时|时辰|息)`,'g'))){
      const factor={分钟:1,小时:60,时辰:120}[match[2]];
      if(factor===undefined||chineseNumber(match[1])*factor!==entry.minutes)errors.push(`工序耗时${match[0]}与骨架${entry.minutes}分钟矛盾`);
    }
    if(new RegExp(`${numeral}息(?:工时|火候|时间)?`).test(draft.process))errors.push('工序时间使用未定义的息，须改为分钟');
    if(context?.materials)for(const match of draft.process.matchAll(new RegExp(`(${numeral})\\s*(公斤|千克|克)(?:的)?(铁坯|铁料|木炭|干木刨屑|筛过黏土|黏土|燕麦粉)`,'g'))){
      const key={铁坯:'item_iron',铁料:'item_iron',木炭:'item_charcoal',干木刨屑:'item_wood_shavings',筛过黏土:'item_clay',黏土:'item_clay',燕麦粉:'item_oat_flour'}[match[3]],material=context.materials.find(row=>row.item===key);
      if(material&&Math.abs(chineseNumber(match[1])*units[match[2]][1]-material.amount*material.facts.weight)>.0001)errors.push(`投料${match[0]}与骨架重量${material.amount*material.facts.weight}公斤矛盾`);
    }
  }
  // 共用 L1 数字规则（tools/content-numerals.mjs）：中文数字合法性、总括时长与 minutes 一致；runContentPipeline 也会统一追加，重复项去重。
  for(const message of numeralIssues(draft,entry,context))if(!errors.includes(message))errors.push(message);
  return {errors,warnings};
}
// supersedes：调用方先经 readApprovedSupersedes（核验审批）取得的取代声明；本函数不自己读文件。
export function assembleW3(world,bones,lore,supersedes=[]) {
  // 候选必须从 loadWorld 读出的原样世界装配（发布路径如此）：已被 materializeRuntimeWorld 合并过的世界覆盖层已消耗，后补进来的行拿不到覆盖，D12 整类校验会悄悄算错。
  if(world.runtimeMaterialized)throw new Error('候选必须用原样世界装配（世界已被 materializeRuntimeWorld 物化，覆盖层已消耗）');
  const byId=new Map(lore.map(row=>[row.id,row])),candidate=structuredClone(world);
  // 已在世界里的行以正式（已审批、已发布）的形态为准：本批骨架只补世界还没有的行。否则重新装配会把后来经审批批次改过的字段（如 P1 修订批的羊皮纸价）按骨架旧值写回。
  const merge=(existing,rows)=>[...existing,...rows.filter(row=>!existing.some(old=>old.id===row.id))];
  // physical 是骨架上的派生事实（起草、检查、评分取证用），不发布进正式物品目录。
  const newItems=bones.items.filter(row=>byId.has(row.id)).map(({physical,...row})=>({...row,...byId.get(row.id)}));
  // 骨架只补世界还没有的行，但骨架上的值若已被发布的修订取代（如 P1 的羊皮纸价），新行按修订值装配；
  // 否则回到旧版再装配时，旧价会和后来按修订价派生的成品并存，出现售价低于材料。
  for(const receiptFile of new Set(supersedes.map(s=>s.receiptFile).filter(f=>/^world\/drafts\/w3\/(?:[^/]+\/)?bones\.json$/.test(f))))applySupersedes(newItems,receiptFile,supersedes);
  const available=new Set([...world.items,...newItems].map(row=>row.id));
  const newRecipes=bones.recipes.filter(row=>byId.has(row.id)&&available.has(row.output.item)&&row.materials.every(m=>available.has(m.item))).map(({processFacts,...row})=>({...row,...byId.get(row.id)}));
  candidate.items=merge(world.items,newItems);candidate.recipes=merge(world.recipes,newRecipes);
  const validation=validateWorld(candidate,{stage:'engine'});if(!validation.ok)throw new Error(validation.errors.join('\n'));
  return candidate;
}
export const w3Revision='w3-household-2';
export {hashContent};
