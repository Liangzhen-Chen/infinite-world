import { loreIssues } from './economy-content.mjs';
import { hashContent } from './content-pipeline.mjs';
import { validateWorld } from './validate-world.mjs';

const units = { '公斤': ['weight',1], '千克':['weight',1], '克':['weight',.001], '铜币':['basePrice',1], '分钟':['minutes',1], '小时':['minutes',60], '天':['shelfLifeDays',1] };
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
export function validateW3Draft(draft,entry,blocklist) {
  const item=entry.id.startsWith('item_'),fields=item?['description','inspection','storage']:['process'],errors=[],warnings=[];
  if(!draft||typeof draft!=='object'||Array.isArray(draft))return {errors:['说明必须为对象'],warnings};
  if(draft.id!==entry.id)errors.push('说明编号与骨架不一致');
  if(Object.keys(draft).some(key=>!['id',...fields].includes(key)))errors.push('说明覆盖了骨架或增加未授权字段');
  for(const field of fields){if(typeof draft[field]!=='string'||!draft[field].trim())errors.push(`缺少 ${field}`);else if(draft[field].length<(field==='description'?60:25)||draft[field].length>240)warnings.push(`${field}长度为${draft[field].length}，进入L4抽读`);}
  if(errors.length)return {errors,warnings};
  const text=fields.map(field=>draft[field]).join('');
  for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽词 ${word}`);
  if(/主持人|玩家不能|不要让|禁止|schema|JSON|系统要求/.test(text))errors.push('泄漏规则措辞');
  if(item)errors.push(...loreIssues(draft,entry));
  // Numeric claims in item prose concern this item. Recipes include ingredient
  // quantities, so their other numbers are checked by L2 against named facts.
  if(item)for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(公斤|千克|克|铜币|分钟|小时)/g)){
    const[field,factor]=units[match[2]],expected=field==='minutes'?entry.book?.readingMinutes:entry[field];
    if(expected!==undefined&&Math.abs(Number(match[1])*factor-expected)>.0001)errors.push(`数字${match[0]}与${field}=${expected}矛盾`);
  }
  if(!item)for(const match of draft.process.matchAll(/(?:耗时|用时|历时|总计|全程)(?:约|为)?\s*(\d+(?:\.\d+)?)\s*(分钟|小时)/g))if(Number(match[1])*(match[2]==='小时'?60:1)!==entry.minutes)errors.push(`工序耗时${match[0]}与骨架${entry.minutes}分钟矛盾`);
  return {errors,warnings};
}
export function assembleW3(world,bones,lore) {
  const byId=new Map(lore.map(row=>[row.id,row])),candidate=structuredClone(world);
  const merge=(existing,rows)=>{const updates=new Map(rows.map(row=>[row.id,row]));return [...existing.map(row=>updates.get(row.id)??row),...rows.filter(row=>!existing.some(old=>old.id===row.id))];};
  const newItems=bones.items.filter(row=>byId.has(row.id)).map(row=>({...row,...byId.get(row.id)}));
  const available=new Set([...world.items,...newItems].map(row=>row.id));
  const newRecipes=bones.recipes.filter(row=>byId.has(row.id)&&available.has(row.output.item)&&row.materials.every(m=>available.has(m.item))).map(({processFacts,...row})=>({...row,...byId.get(row.id)}));
  candidate.items=merge(world.items,newItems);candidate.recipes=merge(world.recipes,newRecipes);
  const validation=validateWorld(candidate,{stage:'engine'});if(!validation.ok)throw new Error(validation.errors.join('\n'));
  return candidate;
}
export const w3Revision='w3-household-2';
export {hashContent};
