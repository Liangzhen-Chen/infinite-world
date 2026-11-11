import Ajv from'ajv';
import {createHash}from'node:crypto';
import {validateWorld}from'./validate-world.mjs';
import {fixtureAffording}from'../server-plugin/workstation-services.mjs';
import {economyFoundation}from'../world/design/economy-foundation.mjs';
export const contentHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(minLength,maxLength)=>({type:'string',minLength,maxLength});
export const economyLoreSchema={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',minItems:1,maxItems:4,items:{
 type:'object',additionalProperties:false,required:['id','description','inspection','storage'],properties:{id:text(1,100),description:text(90,190),inspection:text(45,140),storage:text(30,100)}
}}}};
const loreAjv=new Ajv({strict:true,allErrors:true});
export const validateEconomyLore=loreAjv.compile(economyLoreSchema);
export function economyItemRequest(bone){
 const schema=structuredClone(economyLoreSchema);schema.properties.items.minItems=1;schema.properties.items.maxItems=1;
 schema.properties.items.items.properties.id.enum=[bone.id];
 schema.properties.items.items.properties.storage.pattern=bone.shelfLifeDays===null
    ?'^(?!.*[0-9零一二两三四五六七八九十百千]+(?:天|日|个月|月|年)).*$'
    :`(?:^|[^0-9])${bone.shelfLifeDays}天`;
 return{schema,validate:loreAjv.compile(schema)};
}
const makesClaim=(text,pattern)=>text.split(/[，。；！？：\n]/).some(clause=>[...clause.matchAll(new RegExp(pattern,'g'))].some(match=>
 !/(?:不|并非|没有|无法|未|不可|不用).{0,6}$/.test(clause.slice(Math.max(0,match.index-12),match.index))));
function daysNumber(value){
 if(/^\d+$/.test(value))return Number(value);
 const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units={十:10,百:100,千:1000};let result=0,current=0;
 for(const char of value)if(char in digits)current=digits[char];else if(char in units){result+=(current||1)*units[char];current=0;}else return NaN;
 return result+current;
}
function storageDeadlines(storage){
 const number='(?:[0-9]+|[零一二两三四五六七八九十百千]+)',out=[];
 for(const clause of storage.split(/[，。；！？\n]/)){
   const pattern=new RegExp(`(?:(?:保存|存放|保管)(?:上限|期限|时限)|最多(?:存|放)?|至多|最长|不超过|不宜超过|存|保存|存放|保管)\\s*(${number})天`,'g');
   for(const match of clause.matchAll(pattern)){
     const tail=clause.slice(match.index+match[0].length);
     if(!/(?:上限|期限|时限)/.test(match[0])&&/^(?:需|须|应|要)?(?:取出|拿出|翻出)?(?:复查|检查|翻看|翻动|翻晾|擦拭)/.test(tail))continue;
     out.push(daysNumber(match[1]));
   }
 }
 return out;
}
export function loreIssues(row,bone){
 const text=[row.description,row.inspection,row.storage].join(''),errors=[];
 if(/主持人|提示词|schema|JSON|玩家不能|不要让|系统要求/.test(text))errors.push('世界内说明出现开发规则措辞');
 if(/登记单位|技能编号|目录[^，。；！？]{0,8}(?:固定保存|保存天数|技能等级|索引)|(?:不|不会|不能|并非|未)[^，。；！？]{0,8}(?:赠送|附赠|复制)[^，。；！？]{0,8}(?:成品|粮|线团)|无限(?:供应|灯芯)/.test(text))errors.push('器物说明泄漏目录或游戏保证措辞');
 if(/水泥|塑料|电池|电动|不锈钢|微波|摄氏|冷藏柜|石蜡/.test(text))errors.push('出现未设定的现代物品或技术');
 if(bone?.id==='item_wax_candle'&&makesClaim(row.description,'棉.{0,2}(?:灯芯|芯)|(?:倒入|浇入|浇注).{0,6}模'))errors.push('蜂蜡烛工序与麻芯浸挂配方矛盾');
 if(bone&&!bone.book&&/识字|读满|阅读.{0,6}分钟/.test(row.description))errors.push('普通物品被擅加书本阅读前置');
 if(/否认期限|不能延长|读满\d+分钟(?:就|可|便)[^，。；！？]{0,8}(?:学会|记牢)/.test(text))errors.push('说明抄入写作约束或保证读书学成');
 if(bone?.id==='item_herb'&&makesClaim(text,'煮汤|炖菜|烤肉|喂牲|喂动物|洗伤口'))errors.push('未辨认药草擅作食材或治疗用料');
 if(bone?.id==='item_rawhide'&&makesClaim(text,'绷带|入药|洗伤口'))errors.push('未经处理生皮擅作医疗用料');
 if(bone?.book&&/(?:共|全册|全书|计|约)?(?:[0-9]+|[零一二两三四五六七八九十百千]+)页/.test(row.description))errors.push('书籍未设定页数，不能从阅读分钟推算页数');
 if(bone?.book&&!/识字[^，。；！？]{0,12}(?:100|一百|满百|百)/.test(row.description))errors.push('书籍说明缺少识字100的阅读门槛');
 for(const clause of text.split(/[，。；！？：\n]/))for(const match of clause.matchAll(/无限|永不损坏|自动修复|百分之百|保证治愈|凭空|增加\d+点|提升\d+点|魔力加/g)){
    const prefix=clause.slice(Math.max(0,match.index-12),match.index);
    if(!/(?:不|并非|没有|无法|未|不足以).{0,6}$/.test(prefix))errors.push('未在骨架中设定的能力保证');
 }
 if(!bone)errors.push('未知骨架编号');
 else if(Number.isFinite(bone.shelfLifeDays)){
    if(!new RegExp(`(?:^|[^0-9])${bone.shelfLifeDays}天`).test(row.storage??''))errors.push(`保管说明须明确骨架保存上限${bone.shelfLifeDays}天`);
    if(/(?:无|没有|未设|未标|不设|未定)[^，。；！？]{0,10}(?:固定|明确)[^，。；！？]{0,8}(?:保存|保管|期限|天数)|(?:保存|保管)[^，。；！？]{0,8}(?:没有|无|未设)[^，。；！？]{0,5}(?:期限|天数)/.test(row.storage??''))errors.push(`保存期与骨架${bone.shelfLifeDays}天矛盾`);
 }
 if(bone)for(const days of storageDeadlines(row.storage??''))if(days!==bone.shelfLifeDays)errors.push(`擅改保存上限为${days}天，骨架为${bone.shelfLifeDays??'无固定天数'}`);
 return errors;
}
export function assembleEconomy(world,bones,lore){
 const candidate=structuredClone(world),byId=new Map(lore.map(row=>[row.id,row]));
 if(byId.size!==bones.items.length||lore.length!==bones.items.length)throw new Error('经济说明编号遗漏或重复');
 const additions=bones.items.map(bone=>{const row=byId.get(bone.id);if(!row)throw new Error(`缺少说明${bone.id}`);
    if(!validateEconomyLore({items:[row]}))throw new Error(`说明格式不合格${bone.id}`);
    const issues=loreIssues(row,bone);if(issues.length)throw new Error(`${bone.id}: ${issues.join('；')}`);
    return{...bone,...row};});
 const mergeById=(existing,updated,combine=(old,row)=>row)=>{const byId=new Map(updated.map(row=>[row.id,row]));
    return[...existing.map(row=>byId.has(row.id)?combine(row,byId.get(row.id)):row),...updated.filter(row=>!existing.some(old=>old.id===row.id))];};
 // 骨架里已在世界中的物品：世界里已有的机制字段（nutrition、capacityMl 等）和标签、别名保留，骨架只能补充不能抹掉；
 // 骨架明写的数值字段与说明文字仍以骨架/新说明为准。例：骨架 water 行标签只有 water/food，整行覆盖会丢掉世界参照水的 drinkable 与 nutrition.hydration。
 const union=(a=[],b=[])=>[...new Set([...a,...b])];
 candidate.items=mergeById(candidate.items,additions,(old,row)=>{const merged={...old,...row};
    for(const key of['tags','aliases'])if(old[key]||row[key])merged[key]=union(old[key],row[key]);return merged;});
 candidate.recipes=mergeById(candidate.recipes,structuredClone(bones.recipes));
 // K5: a skeleton station is written as the equipment that affords it (with
 // its id and posted fee); owner and opening derive from the place.
 for(const station of bones.workstations){const location=candidate.locations.find(row=>row.id===station.location);if(!location)throw new Error('工坊位置不在世界中');
    const fixture=fixtureAffording(station.kind);if(!fixture)throw new Error(`没有能承担${station.kind}的设备`);
    const record={fixture,id:station.id,fee:station.fee};location.fixtures??=[];
    const index=location.fixtures.findIndex(row=>row.id===record.id),same=location.fixtures.findIndex(row=>(row.fixture??row)===fixture);
    if(index>=0)location.fixtures[index]={...location.fixtures[index],...record};else if(same>=0)location.fixtures[same]={...(typeof location.fixtures[same]==='string'?{}:location.fixtures[same]),...record};else location.fixtures.push(record);
 }
 const validation=validateWorld(candidate,{stage:'engine'});if(!validation.ok)throw new Error(validation.errors.join('\n'));
 return candidate;
}
const corpus=row=>[row.description,row.inspection,row.storage].join('');
const grams=value=>{const clean=value.replace(/[^\p{L}]/gu,'');return new Set(Array.from({length:Math.max(0,clean.length-1)},(_,i)=>clean.slice(i,i+2)));};
const similarity=(a,b)=>{let n=0;for(const gram of a)if(b.has(gram))n++;return n/(a.size+b.size-n||1);};
export function auditEconomyLore(lore,bones){
 const errors=[],warnings=[],sets=lore.map(row=>grams(corpus(row))),byId=new Map(bones.items.map(row=>[row.id,row]));
 if(new Set(lore.map(row=>row.id)).size!==lore.length)errors.push({type:'duplicate'});
 for(const row of lore){if(!validateEconomyLore({items:[row]}))errors.push({id:row.id,type:'schema',errors:structuredClone(validateEconomyLore.errors)});
    for(const message of loreIssues(row,byId.get(row.id)))errors.push({id:row.id,type:'lore',message});
 }
 let maximumSimilarity=0;
 for(let i=0;i<lore.length;i++)for(let j=0;j<i;j++){const score=similarity(sets[i],sets[j]);maximumSimilarity=Math.max(maximumSimilarity,score);
    if(score>=.35)errors.push({id:lore[i].id,other:lore[j].id,type:'similarity',score});
 }
 return{ok:errors.length===0,errors,warnings,maximumSimilarity,scope:'自动结构和措辞审查，不代表人工内容验收'};
}
export function sampleRows(rows,seed,count=10){
 let x=seed>>>0,out=[...rows];for(let i=out.length-1;i>0;i--){x^=x<<13;x^=x>>>17;x^=x<<5;const j=(x>>>0)%(i+1);[out[i],out[j]]=[out[j],out[i]];}
 return out.slice(0,Math.min(count,rows.length));
}
export function checkEconomyPublication(world,source,lore,reviews){
 if(source.sourceWorldHash!==contentHash(world)||source.boneHash!==contentHash(source.bones))throw new Error('当前世界或机制骨架与起草来源不符');
 if(source.boneHash!==contentHash(economyFoundation(world)))throw new Error('草稿不是当前手写经济骨架，须重新起草');
 const audit=auditEconomyLore(lore,source.bones);if(!audit.ok)throw new Error('自动审查不合格，不能发布');
 verifyEconomyReviews(source,lore,reviews);
 return assembleEconomy(world,source.bones,lore);
}
export function verifyEconomyReviews(source,lore,reviews){
 const batches=Math.ceil(lore.length/50);
 if(!Array.isArray(source.reviewSeeds)||source.reviewSeeds.length!==batches||source.reviewSeeds.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw new Error('缺少起草前记录的随机抽样种子，须整批重做');
 for(let batch=0;batch<batches;batch++){
    const review=reviews.find(row=>row.batch===batch),expected=sampleRows(lore.slice(batch*50,batch*50+50),source.reviewSeeds[batch]);
    if(review&&review.seed!==source.reviewSeeds[batch])throw new Error('人工审查随机样本版本不符');
    if(!review||!review.approved||review.runId!==source.runId||review.boneHash!==source.boneHash||review.loreHash!==contentHash(lore)||review.sample.length!==expected.length)throw new Error(`器物批${batch}未完成匹配版本的人工验收`);
    for(const item of expected){const judged=review.sample.find(row=>row.id===item.id);
       if(!judged||judged.hash!==contentHash(item)||judged.scores?.length!==6||judged.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||judged.scores.reduce((a,b)=>a+b,0)/6<4||!judged.notes?.trim())throw new Error(`人工样本不合格或文本不符：${item.id}`);
    }
 }
 return true;
}
