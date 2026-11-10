import { loreIssues } from './economy-content.mjs';
import { hashContent } from './content-pipeline.mjs';
import { validateWorld } from './validate-world.mjs';
import { annotateRows } from '../server-plugin/runtime-world.mjs';

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
  for(const field of fields){if(typeof draft[field]!=='string'||!draft[field].trim())errors.push(`缺少 ${field}`);else if(draft[field].length<(field==='description'?60:25)||draft[field].length>240)warnings.push(`${field}长度为${draft[field].length}，进入L4抽读`);}
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
  return {errors,warnings};
}
// mechanics：覆盖层（world.mechanics）。传入的世界还带着它时（loadWorld 的原样世界，发布路径），validateWorld 自己按运行时世界合并校验；
// 世界已被 WorldEngine 合并过（覆盖层已被消耗，world.mechanics 不在）时，本批新补进来的行没有机会被合并，调用方须把覆盖层传进来，
// 这里用运行时合并同一个函数（runtime-world.mjs 的 annotateRows）给新行补上覆盖，使 D12 整类校验看到的与发布后的运行时世界一致。
export function assembleW3(world,bones,lore,{mechanics=world.mechanics}={}) {
  const byId=new Map(lore.map(row=>[row.id,row])),candidate=structuredClone(world);
  // 已在世界里的行以正式（已审批、已发布）的形态为准：本批骨架只补世界还没有的行。否则重新装配会把后来经审批批次改过的字段（如 P1 修订批的羊皮纸价）按骨架旧值写回。
  const merge=(existing,rows)=>[...existing,...rows.filter(row=>!existing.some(old=>old.id===row.id))];
  const newItems=bones.items.filter(row=>byId.has(row.id)).map(row=>({...row,...byId.get(row.id)}));
  const available=new Set([...world.items,...newItems].map(row=>row.id));
  const newRecipes=bones.recipes.filter(row=>byId.has(row.id)&&available.has(row.output.item)&&row.materials.every(m=>available.has(m.item))).map(({processFacts,...row})=>({...row,...byId.get(row.id)}));
  candidate.items=merge(world.items,newItems);candidate.recipes=merge(world.recipes,newRecipes);
  if(!candidate.mechanics&&mechanics?.items){const added=new Set(newItems.map(row=>row.id)),fresh=candidate.items.filter(row=>added.has(row.id)&&!world.items.some(old=>old.id===row.id));annotateRows(fresh,structuredClone(mechanics.items),'items');}
  const validation=validateWorld(candidate,{stage:'engine'});if(!validation.ok)throw new Error(validation.errors.join('\n'));
  return candidate;
}
export const w3Revision='w3-household-2';
export {hashContent};
