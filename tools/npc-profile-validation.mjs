// Full profiles are optional on legacy people. References are category-aware,
// and population size and particular NPC identifiers are never assumed here.
const digit={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
function numeric(text){if(/^\d+$/.test(text))return Number(text);let sum=0,last=0;for(const c of text){if(c in digit)last=digit[c];else if({十:10,百:100}[c]){sum+=(last||1)*{十:10,百:100}[c];last=0;}else return NaN;}return sum+last;}
export function validateNpcProfiles(world){
 const errors=[],people=new Map([...(world.npcs??[]),...(world.residents??[]),...(world.factionPeople??[])].map(n=>[n.id,n]));
 const sets=Object.fromEntries(['locations','cultures','skills','professions','items'].map(key=>[key,new Set((world[key]??[]).map(x=>x.id))]));
 const all=new Set(Object.values(world).filter(Array.isArray).flat().filter(x=>x?.id).map(x=>x.id));
 const ref=(id,kind,label)=>{if(!(kind==='people'?people.has(id):kind==='all'?all.has(id):sets[kind].has(id)))errors.push(`完整档引用不存在或类别不符：${label} -> ${id}`);};
 for(const n of world.npcs??[]){if(n.tier!=='full')continue;
  if(n.birth){const epochAge=1-n.birth.year-(n.birth.month===1&&n.birth.day===1?0:1);if(n.age!==epochAge)errors.push(`元年年初年龄与出生日期不符：${n.id}`);}
  ref(n.culture,'cultures',`${n.id}.culture`);
  for(const id of n.household??[])ref(id,'people',`${n.id}.household`);
  for(const key of ['home','workplace'])ref(n[key]?.location,'locations',`${n.id}.${key}`);
  for(const id of Object.keys(n.proficiencies??{}))ref(id,'skills',`${n.id}.proficiencies`);
  for(const id of n.professions??[])ref(id,'professions',`${n.id}.professions`);
  for(const id of n.wealth?.property??[])ref(id,'locations',`${n.id}.wealth.property`);
  for(const row of n.wealth?.valuables??[])if(typeof row==='string')ref(row,'items',`${n.id}.wealth.valuables`);else if(row?.item)ref(row.item,'items',`${n.id}.wealth.valuables`);
  if(n.wealth?.cashRange?.[0]>n.wealth?.cashRange?.[1])errors.push(`完整档现金区间颠倒：${n.id}`);
  const related=new Set();
  for(const row of n.relationships??[]){
   ref(row.with,'people',`${n.id}.relationships`);
   if(row.with===n.id||related.has(row.with))errors.push(`完整档关系自身或重复：${n.id}/${row.with}`);related.add(row.with);
   const other=people.get(row.with);if(!other)continue;
   if(/^(父女|父子|母女|母子|亲子)$/.test(row.type)&&Math.abs(n.age-other.age)<15)errors.push(`父母须比子女至少大15岁：${n.id}/${row.with}`);
   if(/^(父亲|母亲|父母)$/.test(row.type)&&other.age-n.age<15)errors.push(`父母关系年龄方向不符：${n.id}/${row.with}`);
   if(/^(女儿|儿子|子女)$/.test(row.type)&&n.age-other.age<15)errors.push(`子女关系年龄方向不符：${n.id}/${row.with}`);
   if((n.age<18||other.age<18)&&/恋人|情人|恋爱|配偶|夫妻|爱慕/.test(row.type))errors.push(`未成年不可进入恋爱关系：${n.id}/${row.with}`);
  }
  const memoryIds=new Set();for(const row of n.memorySeeds??[]){if(memoryIds.has(row.id))errors.push(`记忆种子编号重复：${n.id}/${row.id}`);memoryIds.add(row.id);if(!row.knownBy?.includes(n.id))errors.push(`记忆种子知情者须含本人：${n.id}/${row.id}`);for(const id of row.knownBy??[])ref(id,'people',`${n.id}.memorySeeds.knownBy`);}
  for(const row of n.secrets??[]){if(!row.knownBy?.includes(n.id))errors.push(`秘密知情者须含本人：${n.id}`);for(const id of row.knownBy??[])ref(id,'people',`${n.id}.secrets.knownBy`);}
  for(const row of n.knowledge?.known??[])ref(row.source,'all',`${n.id}.knowledge.source`);
  for(const row of n.opinions?.neighbors??[])ref(row.with,'people',`${n.id}.opinions.neighbors`);
  const goals=new Set();for(const row of Object.values(n.goals??{}).flat()){if(goals.has(row.id))errors.push(`目标编号重复：${n.id}/${row.id}`);goals.add(row.id);}
  for(const row of n.serviceCatalog??[]){if(row.kind==='teach'&&!(n.services??[]).includes(row.what))errors.push(`完整档教学不在原服务白名单：${n.id}/${row.what}`);if(row.price?.mode==='catalog')ref(row.price.source,'all',`${n.id}.serviceCatalog.price`);}
  for(const text of [n.notes??'',...(n.memorySeeds??[]).map(x=>x.event)])for(const match of text.matchAll(/([零一二两三四五六七八九十百\d]+)年前/g))if(numeric(match[1])>n.age)errors.push(`亲历早于出生：${n.id}/${match[0]}`);
 }
 return errors;
}
