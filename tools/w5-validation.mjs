import {normalize} from '../server-plugin/retrieval.mjs';

export const worldLoreCategories=['cultures','deities'];
export function bigramSimilarity(a,b){
 const grams=text=>new Set((normalize(text).match(/[\u3400-\u9fff]+/g)??[]).flatMap(span=>Array.from({length:Math.max(0,span.length-1)},(_,i)=>span.slice(i,i+2))));
 const x=grams(a),y=grams(b),union=new Set([...x,...y]);
 return union.size?[...x].filter(word=>y.has(word)).length/union.size:0;
}
export function validateWorldLore(world,{reference,blocked=[]}={}){
 const errors=[],warnings=[],ids=new Map(worldLoreCategories.flatMap(key=>world[key]??[]).map(row=>[row.id,row]));
 const ref=(value,label)=>reference?.(value,label);
 for(const category of worldLoreCategories){
  const rows=world[category]??[];
  for(const row of rows){
   for(const id of row.references??[])ref(id,`${row.id}.references`);
   const text=JSON.stringify(row.prose??{});
   for(const word of blocked)if(normalize(text).includes(normalize(word)))errors.push(`W5正文触及屏蔽表：${row.id}/${word}`);
   if(category==='cultures'){
    ref(row.anchor,`${row.id}.anchor`);ref(row.witness,`${row.id}.witness`);
    if(!world.locations.some(place=>place.id===row.anchor))errors.push(`文化锚点不是已登记地点：${row.id}`);
    if(!world.npcs.some(person=>person.id===row.witness))errors.push(`文化见证人不是已登记人物：${row.id}`);
    if(new Set(row.prose.proverbs).size!==row.prose.proverbs.length)errors.push(`文化谚语重复：${row.id}`);
    if(row.naming.syllableCount[0]>row.naming.syllableCount[1])errors.push(`命名音节区间倒置：${row.id}`);
   }else{
    ref(row.culture,`${row.id}.culture`);ref(row.related,`${row.id}.related`);
    if(ids.get(row.culture)?.category!=='culture')errors.push(`信仰文化引用类型错误：${row.id}`);
    if(ids.get(row.related)?.category!=='deity')errors.push(`神祇关系引用类型错误：${row.id}`);
   }
   // These explicit fields are semantically authoritative; reference arrays may not hide omissions.
   const expected=category==='cultures'?[row.anchor,row.witness]:[row.culture,row.related];
   for(const id of expected)if(!row.references.includes(id))errors.push(`W5引用清单遗漏：${row.id}/${id}`);
   const description=Object.values(row.prose).map(v=>Array.isArray(v)?v.join('；'):v).join('\n');
   if(description!==row.description)errors.push(`W5检索正文与审查字段不一致：${row.id}`);
  }
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(bigramSimilarity(rows[i].description,rows[j].description)>=0.35)errors.push(`W5同类说明相似度过高：${rows[i].id}/${rows[j].id}`);
 }
 return {errors,warnings};
}
