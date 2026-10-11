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

// This gate is separate from structural validation until T11 publishes corrected
// content. It checks observable defects; L2 still reviews semantic specificity
// and narrative compatibility. Consumers use issues for field patches and errors
// for build rejection. No world objects are changed.
const normal = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[\s，。；：、,.!?！？;:「」“”"']/g, '') : '';
const placeholder = /待(?:补充|扩充|完善|填写)|占位|^(?:暂无|待定|未设定|未知|无|todo)$/i;
const genericUnknown = /本人未在场|不在场且无人|他人未公开|未(?:向.{0,8})?讲过的私事|无人(?:实际)?(?:告知|转告)的|玩家行为|他人.{0,5}(?:秘密|财产|私事)|不知道的事/;
const matter = /是否|何时|何处|哪里|哪(?:一|次|个|条|户|位)|谁|多少|究竟|原因|来由|去向|来源|期限|时限|轮次|次序|差额|数目|失误|缺口|漏记|漏行|愿不愿|能否/;
const concreteAction = /照顾|病逝|核对|核账|核清|借|还|欠|救|修|补|搬|送|找|抄|记|见|听|学|教|带|争|分歧|催|劝|拒|解释|收|清|留|等|帮|雇|买|卖|付|说|谈|婚|养|供|种|看|查|守|换|摔|结算|承诺|约定/;
const genericNote = /^同村日常往来$|^认识(?:同村)?[^，。；]*[,，；]?不因此知道|为.{0,12}的(?:配偶|儿子|女儿|父亲|母亲).{0,8}各自保有财物|^(?:关系一般|关系良好|熟人|邻居|朋友|同事|夫妻|父子|母女)$/;

export const legacyTraitsExpected = Object.freeze({
 npc_hw_ayan:['好奇','要强'],npc_hw_chenbai:['耐心','谨慎'],npc_hw_xuling:['冷静','讲究实证'],npc_hw_duanyan:['直率','护女'],npc_hw_duanhe:['细心','爱画图'],
 npc_hw_wushuo:['克制','护犬'],npc_hw_taozhi:['温和','谨慎'],npc_hw_zhengshuisheng:['熟练','直言'],npc_hw_luowei:['勤恳','重边界'],npc_hw_sulan:['能干','重公平'],
 npc_hw_gucen:['稳重','讲证据'],npc_hw_meiling:['耐性','愿协作'],npc_hw_yanzhe:['守时','计算细'],npc_hw_luqing:['耐心','爱记录'],npc_hw_hezhou:['专注','重同意'],
 npc_hw_anhuai:['安静','愿试验'],npc_hw_shendu:['细致','守边界'],
});
export const legacyTraitsAuditIds = Object.freeze([
 'npc_hw_ayan','npc_hw_chenbai','npc_hw_xuling','npc_hw_duanyan','npc_hw_duanhe',
 'npc_hw_wushuo','npc_hw_taozhi','npc_hw_zhengshuisheng','npc_hw_luowei','npc_hw_sulan',
 'npc_hw_gucen','npc_hw_meiling','npc_hw_yanzhe','npc_hw_luqing','npc_hw_hezhou',
 'npc_hw_anhuai','npc_hw_shendu',
]); // Extracted from the traits-only diff in 1bc8f3b.

function strings(value, field, out) {
 if (typeof value === 'string') out.push({field, text:value});
 else if (Array.isArray(value)) value.forEach((v,i)=>strings(v,`${field}[${i}]`,out));
 else if (value && typeof value === 'object') for (const [key,v] of Object.entries(value)) strings(v,`${field}.${key}`,out);
}

// Explicit out-of-world directions always fail. A prohibition is a fact when
// attributed to an in-world authority, law, notice, or a speaker's own boundary.
export function findNpcRuleWording(profile) {
 const rows=[], issues=[];
 for (const field of ['knowledge','notes','familyNotes','description','personality','voice','relationships','memorySeeds','goals','opinions','secrets','authoredFacts']) strings(profile?.[field],field,rows);
 for (const {field,text} of rows) for (const sentence of text.split(/[。；;\n]/).filter(Boolean)) {
  const instruction=/主持人|系统设定|玩家(?:不能|不得|不应|必须)|不要让|(?:禁止|不许|不得)(?:玩家|叙述者|模型)|(?:不能|不得)(?:凭空|自动|因此)(?:知道|得知|获得|生成)|不因此知道(?:对方|他人)|不(?:生成|新增)(?:产权|债务|库存|财物)/.test(sentence);
  const prohibition=/禁止|不许/.test(sentence);
  const attributed=/(?:村规|镇规|法规|法律|法令|条例|禁令|告示|公告|契约|契据|巡守|官府|议事会|守卫|执法者|税吏)[^。；;]*?(?:禁止|不许)/.test(sentence)||/(?:本人|我|她|他)(?:禁止|不许)/.test(sentence);
  if(instruction || (prohibition && !attributed)) issues.push({id:profile.id,field,code:'rule-wording',reason:'人物事实或设定含叙述/玩家指令；世界内禁令须写明发布者或法令',text:sentence});
 }
 return issues;
}

function mentionsOther(text, npc, world) {
 return [...(world.npcs??[]),...(world.residents??[]),...(world.factionPeople??[]),...(world.locations??[])]
  .some(entity=>entity.id!==npc.id && [entity.id,entity.name,...(entity.aliases??[])].some(name=>typeof name==='string' && name.length>=2 && text.includes(name)));
}
function memoryConflict(a,b) {
 if (a.location && b.location && a.location!==b.location) return true;
 if (a.minute!==undefined && b.minute!==undefined && a.minute!==b.minute) return true;
 // Only compare explicit negated/affirmed outcomes, not arbitrary occurrences
 // of '未' (which may describe a different detail of the same recollection).
 for (const verb of ['商定','同意','交付','付款','付清','结清','签署','归还','完成']) {
  const no=new RegExp(`(?:未|尚未|没有|没|还没|未曾)(?:\\S{0,3})${verb}`);
  const yes=new RegExp(`(?:已经|已|最终)(?:\\S{0,3})${verb}`);
  if ((no.test(a.event)&&yes.test(b.event))||(no.test(b.event)&&yes.test(a.event))) return true;
 }
 return false;
}
function compatibleMemory(a,b,npc,other) {
 if(typeof a.event!=='string'||typeof b.event!=='string'||!normal(a.event)||!normal(b.event))return false;
 if (memoryConflict(a,b)) return false;
 const participants=x=>[...new Set(x.knownBy??[])].sort().join('|');
 if (participants(a)!==participants(b)) return false;
 if (normal(a.event)===normal(b.event)) return true;
 // Shared id/participants alone cannot turn unrelated accounts into one event.
 // Require a shared specific action/object phrase; viewpoints
 // may use different pronouns and omit private later thoughts.
 const strip=text=>[npc.name,other.name].filter(Boolean).reduce((value,name)=>value.split(normal(name)).join(''),normal(text));
 const first=strip(a.event),second=strip(b.event);
 for (let i=0;i<=first.length-4;i++) { const part=first.slice(i,i+4); if(concreteAction.test(part)&&second.includes(part)) return true; }
 return false;
}

export function validateNpcDepth(world) {
 const issues=[];
 const people=new Map([...(world.npcs??[]),...(world.residents??[]),...(world.factionPeople??[])].map(n=>[n.id,n]));
 const full=[...people.values()].filter(n=>n.tier==='full');
 const allIds=new Set(Object.values(world).filter(Array.isArray).flat().map(n=>n?.id).filter(Boolean));
 const add=(n,field,code,reason)=>issues.push({id:n.id,field,code,reason});
 for (const n of full) {
  const known=Array.isArray(n.knowledge?.known)?n.knowledge.known:[];
  if(known.length<3) add(n,'knowledge.known','known-count','已知事实至少3条');
  const seen=new Set();
  known.forEach((row,i)=>{
   if(!normal(row?.fact)||placeholder.test(row.fact??'')||!normal(row?.reliability)||!allIds.has(row?.source)) add(n,`knowledge.known[${i}]`,'known-shape','事实、有效来源与可靠性均须填写，不能为占位');
   const key=normal(row?.fact);if(key&&seen.has(key))add(n,`knowledge.known[${i}].fact`,'known-duplicate','已知事实重复');seen.add(key);
  });
  if(!known.some(row=>typeof row?.fact==='string'&&mentionsOther(row.fact,n,world)))add(n,'knowledge.known','known-other','至少一条事实须具体涉及另一人物或地点，来源引用本身不计');
  const unknown=Array.isArray(n.knowledge?.unknown)?n.knowledge.unknown:[];
  if(!unknown.length)add(n,'knowledge.unknown','unknown-specific','须列出具体待知事项');
  unknown.forEach((text,i)=>{if(!normal(text)||placeholder.test(text??'')||genericUnknown.test(text??'')||!(matter.test(text??'')&&(mentionsOther(text,n,world)||concreteAction.test(text??''))))add(n,`knowledge.unknown[${i}]`,'unknown-specific','未知须指出具体待知事项，不能泛指私事或未在场的事');});
  for(const term of ['short','mid','long']) {
   const goals=Array.isArray(n.goals?.[term])?n.goals[term]:[];
   if(!goals.length)add(n,`goals.${term}`,'goal-steps','各期限须有目标及不同于目标的行动步骤');
   goals.forEach((goal,i)=>{
    const field=`goals.${term}[${i}]`;
    if(!normal(goal?.content)||placeholder.test(goal.content??'')||!Array.isArray(goal?.steps)||!goal.steps.length)add(n,field,'goal-steps','目标与步骤均须填写具体内容');
    for(const [j,step] of (Array.isArray(goal?.steps)?goal.steps:[]).entries())if(!normal(step?.content)||placeholder.test(step.content??'')||normal(step.content)===normal(goal?.content))add(n,`${field}.steps[${j}].content`,'goal-steps','行动步骤不能重复目标或占位');
   });
  }
  if(!normal(n.voice?.register)||placeholder.test(n.voice?.register??'')||!normal(n.voice?.habits?.[0])||normal(n.voice.register)===normal(n.voice.habits[0]))add(n,'voice.register','voice-register','语域须与第一条说话习惯不同，不能空缺或占位');
  let shared=false;
  for(const [i,memory] of (Array.isArray(n.memorySeeds)?n.memorySeeds:[]).entries()) {
   const field=`memorySeeds[${i}]`,ids=Array.isArray(memory.knownBy)?memory.knownBy:[];
   if(!ids.includes(n.id)||ids.some(id=>!people.has(id)))add(n,`${field}.knownBy`,'memory-reference','知情者须含本人且全部存在');
   const others=ids.filter(id=>id!==n.id);if(!others.length)continue;
   let valid=!!normal(memory.id)&&!!normal(memory.event)&&!placeholder.test(memory.event??'')&&ids.includes(n.id);
   for(const id of others) {
    const other=people.get(id);
    const counterpart=normal(memory.id)&&other?.tier==='full' && (Array.isArray(other.memorySeeds)?other.memorySeeds:[]).find(m=>m.id===memory.id);
    if(!counterpart||!compatibleMemory(memory,counterpart,n,other)){valid=false;add(n,field,'memory-shared','共享记忆须在另一完整档有同事件、相同知情者及兼容事实');}
   }
   if(valid)shared=true;
  }
  if(!shared)add(n,'memorySeeds','memory-shared','至少一条与另一完整档人物共同知晓且事实兼容的记忆');
  const relations=Array.isArray(n.relationships)?n.relationships:[];
  if(!relations.length)add(n,'relationships','relationship-note','完整档须记具体关系来由');
  relations.forEach((r,i)=>{if(!normal(r?.note)||placeholder.test(r.note??'')||genericNote.test(r.note??'')||!concreteAction.test(r.note??''))add(n,`relationships[${i}].note`,'relationship-note','关系备注须写具体来由、往事或持续分歧，不能只重复关系称谓');});
  for(const field of ['traits','personality.traits']) {
   const traits=field==='traits'?n.traits:n.personality?.traits;
   if(!Array.isArray(traits)||!traits.length||traits.some(t=>!normal(t)||placeholder.test(t)))add(n,field,'traits-placeholder','性格特征不得空缺或含待扩充占位');
  }
  issues.push(...findNpcRuleWording(n));
 }
 return {ok:issues.length===0,checked:full.length,issues,errors:issues.map(x=>`${x.id}/${x.field}: ${x.reason}`)};
}
