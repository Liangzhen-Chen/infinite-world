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
    if(/主持人|提示词|schema|JSON|生成器|编号|系统要求|原地重生|无限刷新|塑料|电池|电动/.test(text))errors.push('世界外术语或未设定技术');
    const times=[...row.habits.matchAll(/\d{2}:\d{2}/g)].map(m=>m[0]);
    if(times.join(',')!==context.activity.join(','))errors.push(`habits 活动时段应只写 ${context.activity.join(' 至 ')}`);
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
        {role:'system',content:'为中文中世纪剑与魔法世界写一条原创野外图鉴。只输出 JSON，键为 id、appearance、habits、threat、materials、folklore、voice，六段均为中文。只补说明，不能改骨架事实。外观约60–120字；习性约90–170字；威胁与避让约60–120字；材料约50–120字；民间误解及真实可观察差别约70–140字；声音约30–70字。长度是建议，不用填空话凑字。habits原样写activity两个时刻且仅这两个时刻，原样包含grouping。写出食性与领地行为。材料只写本条drops商品，drops空时写足迹等观察线索。商品写实际工具和处理时间，份数用阿拉伯数，不添加药效；湿皮保湿不能干燥。无需复述商品重量、期限、价格或物种体重，不另写距离。其他时段休息，民间纠误不能增加夜间活动或否定既定特征。高阶不代表施法；灵智1以动作和声音表达。每段写具体观察和对行人的意义，不说明开发约束、编号、数据、系统权限。不复制其他物种工序。'},
        {role:'user',content:JSON.stringify({skeleton:entry,publishedFacts:context,feedback})}]};
}
