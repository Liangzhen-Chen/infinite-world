import fs from 'node:fs/promises';
import {highWildlifeFoundation} from '../world/design/high-wildlife-foundation.mjs';
export const fields=['appearance','habits','threat','materials','folklore','voice'];
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
export function numberValue(text){if(/^\d+(?:\.\d+)?$/.test(text))return Number(text);let total=0,digit=0;for(const char of text){if(char in digits)digit=digits[char];else if({十:10,百:100,千:1000}[char]){total+=(digit||1)*{十:10,百:100,千:1000}[char];digit=0;}else return NaN;}return total+digit;}
const n='[0-9零一二两三四五六七八九十百千]+(?:\\.[0-9]+)?';
const clock=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function wildlifeContext(entry,world){
    const bones=highWildlifeFoundation(),item=id=>world.items.find(row=>row.id===id);
    const habitat=bones.rules.habitats.find(h=>h.id===entry.wildlife.habitat);
    return{habitat,location:bones.locations.find(l=>l.id===habitat.location),activity:entry.wildlife.activeHours.map(clock),
        drops:entry.drops.map(drop=>({...drop,catalog:item(drop.item)})),gather:{...entry.wildlife.gather,tool:item(entry.wildlife.gather.tool),consumes:entry.wildlife.gather.consumes.map(c=>({...c,catalog:item(c.item)}))},
        tameFood:entry.tamingRule?.food.map(food=>item(food.item))??[],prey:entry.wildlife.predatorOf.map(id=>bones.monsters.find(row=>row.id===id)?.name),
        facts:['高等级代表体力与耐受，不自动赋予施法、毒伤、治疗、传送或人类语言。','没有列出的微小昆虫、野草、小鱼属于背景食源；数量恢复是区域尺度，不能称瞬间刷新。','gather 时间与清水是一次取材总量；商品重量和保存天数是每份，湿生皮成品仍湿。','领地行为遵守 territoriality；民间误解必须在同段明确纠正，不能否定 distinction 已成立的观察。']};
}
export function validateWildlifeDraft(row,bone,context){
    const errors=[],warnings=[];
    if(!row||row.id!==bone.id)errors.push('id 与骨架不符');
    if(!row||Object.keys(row).some(key=>!['id',...fields].includes(key)))errors.push('只许输出指定说明字段');
    for(const field of fields){if(typeof row?.[field]!=='string'||!row[field].trim())errors.push(`缺少 ${field}`);else if(row[field].length<25||row[field].length>230)warnings.push(`${field} 长度需要抽读`);}
    if(errors.length)return{errors,warnings};
    const text=fields.map(f=>row[f]).join('。');
    for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽词 ${word}`);
    if(/主持人|提示词|schema|JSON|生成器|骨架|\b(?:activity|grouping|drops)\b|编号|系统要求|原地重生|无限刷新|塑料|电池|电动/.test(text))errors.push('世界外术语或未设定技术');
    const times=[...row.habits.matchAll(/\d{2}:\d{2}/g)].map(m=>m[0]);
    if(times.join(',')!==context.activity.join(','))errors.push(`habits 活动时段应只写 ${context.activity.join(' 至 ')}`);
    if(!new RegExp(`${context.activity[0]}\\s*至(?:次日)?\\s*${context.activity[1]}`).test(row.habits)||/仅(?:在)?这两个时刻|仅此二时段|两个时刻(?:前后)?活动/.test(text))errors.push('作息必须是连续活动区间，不能写成两个瞬时时刻');
    if(!row.habits.includes(bone.grouping))errors.push(`habits 应明确原定群居情况：${bone.grouping}`);
    for(const match of text.matchAll(new RegExp(`(${n})\\s*(?:分钟|分鍾)`,'g'))){if(![bone.wildlife.gather.minutes,bone.tamingRule?.minutes].includes(numberValue(match[1])))errors.push(`时长 ${match[0]} 与取材或驯服骨架不符`);}
    for(const match of row.materials.matchAll(new RegExp(`(${n})\\s*(?:天|日)`,'g'))){if(!context.drops.some(drop=>drop.catalog.shelfLifeDays===numberValue(match[1])))errors.push(`材料保存期 ${match[0]} 不符`);}
    for(const match of row.materials.matchAll(new RegExp(`(${n})\\s*(公斤|千克|克)`,'g'))){const kg=numberValue(match[1])/(match[2]==='克'?1000:1);if(!context.drops.some(drop=>drop.catalog.weight===kg))errors.push(`材料单份重量 ${match[0]} 不符`);}
    for(const match of row.appearance.matchAll(new RegExp(`(${n})\\s*(公斤|千克)`,'g')))if(numberValue(match[1])!==bone.bodyMassKg)errors.push(`体重 ${match[0]} 不符`);
    for(const match of text.matchAll(new RegExp(`(${n})\\s*(公里|千米|米|铜币|铜钱)`,'g')))errors.push(`未给定的距离或价格 ${match[0]}`);
    for(const drop of [...context.drops,...context.gather.consumes]){const pattern=new RegExp(`${drop.catalog.name}[^。；，]{0,4}?(${n})份|(${n})份${drop.catalog.name}`);const match=row.materials.match(pattern);if(match&&numberValue(match[1]??match[2])!==drop.amount)errors.push(`材料或耗材份数不符 ${match[0]}`);}
    if(bone.drops.some(d=>d.item==='item_rawhide')&&/(?:阴干|风干|晒干)/.test(row.materials))errors.push('湿生皮被写成已干燥');
    if(bone.drops.length===0&&/可(?:剥取|采集|提炼|得到|获取|收获)/.test(row.materials))errors.push('无商品物种添加可用材料');
    if(/[“「][^”」]*[我你您他她谁请要让别是的][^”」]*[”」]/.test(row.voice))errors.push('灵智一级物种不能给人类台词');
    return{errors,warnings};
}
export function wildlifeDraftRequest(entry,feedback,context){
    return{temperature:.5,max_tokens:2000,response_format:{type:'json_object'},messages:[
        {role:'system',content:'为中文中世纪剑与魔法世界写一条原创野外图鉴。只输出 JSON，键为 id、appearance、habits、threat、materials、folklore、voice，六段均为中文。只补说明，不能改骨架事实。外观约60–120字；习性约90–170字；威胁与避让约60–120字；材料约50–120字；民间误解及真实可观察差别约70–140字；声音约30–70字。长度是建议，不用填空话凑字。habits以activity两个端点写完整连续区间，例如06:00至18:00或18:00至次日06:00；并非只在两个瞬间活动。原样包含grouping的中文值，不写英文标签。材料只写本条drops商品，drops空时只观察痕迹，不许承诺采集新商品。写实际工具和处理时间；引用事实规定最终保存方法，生皮取下仍湿不代表必须人为保湿，树脂和鱼更不能抄入湿皮说明。无需复述商品重量、期限、价格或物种体重，不另写距离。民间误解在同段明确纠正，不能否定distinction。高阶不自动施法；灵智1以动作和声音表达。不写骨架、drops、activity、grouping等标签或开发约束。'},
        {role:'user',content:JSON.stringify({skeleton:entry,publishedFacts:context,feedback})}]};
}
export function wildlifeReviewRequest(entry,draft,context){
    return{temperature:0,max_tokens:2000,thinking:{type:'disabled'},response_format:{type:'json_object'},messages:[
        {role:'system',content:'逐句审查野外图鉴，只输出 JSON {"contradictions":[{"quote":"说明原句","field":"事实字段路径","severity":"hard|soft|style","reason":"具体矛盾"}]}。无矛盾时数组为空，绝不能把理由为一致或不构成矛盾的句子放入数组。只把违反明确事实、数字或新增超自然能力/商品/攻击效果当作hard；合乎体型食性的感官、姿态、普通防御、背景食源细节是允许的，不需要骨架穷举每次动作。predatorOf是参与数量模型的已编目捕食关系，不是排斥微小昆虫/小鱼等背景食源的白名单。activeHours为分钟制连续区间，跨午夜连续；区间外休息不矛盾。drops是从死亡个体按gather工具、时长和耗材取材后得到的总量，不是击杀自动赠送另加一次采集；骨架明确允许此工具用于取材，泛用商品简介不撤销专门规则。商品用途和保存事实同样权威，不能只看骨架编号忽略publishedFacts。drops为空时观察足迹/蜕壳等环境线索是允许的，不生成商品；写能收集并获得材料则为错误。folklore的传言会在同段被否定，不得把明确否定的超能力当作实际能力；纠误也不能否定骨架真实特征。材料必须本条对应，不应强制保湿或禁止鞣制。形容力度和额外推测可以标soft，需要有具体原句与理由。'},
        {role:'user',content:JSON.stringify({skeleton:entry,publishedFacts:context,draft})}]};
}
