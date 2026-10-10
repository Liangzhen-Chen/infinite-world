import Ajv from 'ajv';
import {contentHash,sampleRows} from './economy-content.mjs';
import {withWildlife,wildlifeFoundation} from '../world/design/wildlife-foundation.mjs';
import {withHighWildlife,highWildlifeFoundation} from '../world/design/high-wildlife-foundation.mjs';
import {validateWorld} from './validate-world.mjs';
export {contentHash,sampleRows};
export const wildlifeGeneratorFiles=['tools/draft-wildlife.mjs','tools/wildlife-content.mjs','world/design/wildlife-foundation.mjs','world/design/high-wildlife-foundation.mjs'];
export function wildlifeBones(kind){
    if(kind===undefined||kind==='foundation')return wildlifeFoundation();
    if(kind==='highWildlife')return highWildlifeFoundation();
    throw new Error('未知物种起草类型');
}
export const loreOnly=row=>Object.fromEntries(['id','appearance','habits','threat','materials','folklore','voice'].map(k=>[k,row[k]]));
const field=(minLength,maxLength)=>({type:'string',minLength,maxLength});
export const wildlifeLoreSchema={type:'object',additionalProperties:false,required:['id','appearance','habits','threat','materials','folklore','voice'],properties:{
    id:field(1,100),appearance:field(65,135),habits:field(90,180),threat:field(55,125),materials:field(40,100),folklore:field(65,145),voice:field(30,85)}};
const ajv=new Ajv({allErrors:true,strict:true});export const validateWildlifeLore=ajv.compile(wildlifeLoreSchema);
export const corpus=row=>['appearance','habits','threat','materials','folklore','voice'].map(key=>row[key]??'').join('');
export function wildlifeLoreIssues(row,bone){
    const errors=[];if(!validateWildlifeLore(row))errors.push(JSON.stringify(validateWildlifeLore.errors));
    const text=corpus(row);if(/主持人|提示词|玩家不能|不要让|禁止|系统要求|JSON|schema|编号|生成器/.test(text))errors.push('图鉴泄漏开发或主持规则');
    if(/塑料|电动|电池|汽车|现代科技|原地重生|无限刷新/.test(text))errors.push('现代技术或刷新保证');
    for(const key of ['appearance','habits','threat','materials','folklore','voice']){
        const phrase=row[key]?.match(/无掉落|登记清水|不增肉|不加工|不作商品|无法加工|不可加工|不能加工|无语言/)?.[0];
        if(phrase)errors.push(`${key}含开发保证句“${phrase}”：改写为可观察的行为或痕迹，不写掉落、加工或语言能力的操作限制`);
    }
    if(!bone||row.id!==bone.id)errors.push('物种编号不符');
    if(bone?.intelligence===0&&/[“「][^”」]*[我你您他她谁请要让别是的][^”」]*[”」]/.test(row.voice))errors.push('无灵智野兽被赋予人类台词');
    if(bone?.drops.length===0&&/可(?:剥取|采集|提炼|得到|获取|收获)/.test(row.materials))errors.push('没有登记掉落的物种被添加可用材料');
    if(bone?.drops.some(d=>d.item==='item_rawhide')&&/阴干|风干|晒干/.test(row.materials))errors.push('取材只产湿生皮，不得宣称已经干燥');
    if(bone?.id==='monster_ember_throat_civet'&&/(?:连|不|无法|不能)[^。；]{0,12}湿草[^。；]{0,8}(?:烘不干|不干)|(?:不能|无法)[^。；]{0,8}烘干[^。；]{0,5}湿草/.test(corpus(row)))errors.push('火喉穴狸既定能烘干穴口湿草，民间纠误不能否定该能力');
    return errors;
}
export function auditWildlifeLore(rows,bones){
    const errors=[],map=new Map(bones.monsters.map(b=>[b.id,b]));
    if(rows.length!==bones.monsters.length||new Set(rows.map(r=>r.id)).size!==rows.length)errors.push('物种遗漏或重复');
    for(const row of rows)errors.push(...wildlifeLoreIssues(row,map.get(row.id)).map(message=>({id:row.id,message})));
    const sets=rows.map(row=>{const text=corpus(row).replace(/[^\p{L}]/gu,'');return new Set(Array.from({length:text.length-1},(_,i)=>text.slice(i,i+2)));});
    let maximumSimilarity=0;
    for(let i=0;i<sets.length;i++)for(let j=0;j<i;j++){
        const common=[...sets[i]].filter(g=>sets[j].has(g)).length,score=common/(sets[i].size+sets[j].size-common||1);maximumSimilarity=Math.max(maximumSimilarity,score);
        if(score>=.35)errors.push({id:rows[i].id,other:rows[j].id,similarity:score});
    }
    return{ok:errors.length===0,errors,maximumSimilarity};
}
export function assembleWildlife(world,bones,rows){
    const map=new Map(rows.map(r=>[r.id,r])),audit=auditWildlifeLore(rows,bones);if(!audit.ok)throw new Error(JSON.stringify(audit.errors));
    const additions=bones.monsters.map(b=>({...b,...map.get(b.id)}));
    const candidate=bones.kind==='highWildlife'?withHighWildlife(world,additions):withWildlife(world,additions);
    const combined=auditWildlifeLore(candidate.monsters.map(loreOnly),{monsters:candidate.monsters});
    if(!combined.ok)throw new Error(`完整图鉴审核失败：${JSON.stringify(combined.errors)}`);
    return candidate;
}
export function verifyWildlifePublication(world,source,rows,reviews){
    const expected=wildlifeBones(source.kind);
    if(source.sourceWorldHash!==contentHash(world)||source.boneHash!==contentHash(expected)||contentHash(source.bones)!==source.boneHash)throw new Error('世界或物种骨架已变化，拒绝旧证明');
    if(source.kind==='highWildlife'&&expected.monsters.some(b=>world.monsters.some(s=>s.id===b.id)))throw new Error('扩充编号已存在，拒绝覆盖正式物种');
    if(!Array.isArray(source.reviewSeeds)||source.reviewSeeds.length!==Math.ceil(rows.length/50))throw new Error('缺起草前随机抽样种子');
    for(let batch=0;batch<source.reviewSeeds.length;batch++){
        const review=reviews.find(r=>r.batch===batch),sample=sampleRows(rows.slice(batch*50,batch*50+50),source.reviewSeeds[batch]);
        if(!review?.approved||review.runId!==source.runId||review.seed!==source.reviewSeeds[batch]||review.boneHash!==source.boneHash||review.loreHash!==contentHash(rows)||review.sample.length!==sample.length)throw new Error('缺少匹配的人工批次审核');
        for(const row of sample){const read=review.sample.find(r=>r.id===row.id);
            if(!read||read.hash!==contentHash(row)||read.scores?.length!==6||read.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||read.scores.reduce((a,b)=>a+b,0)/6<4||!read.notes?.trim())throw new Error(`人工样本不合格：${row.id}`);
        }
    }
    const candidate=assembleWildlife(world,source.bones,rows),validation=validateWorld(candidate);if(!validation.ok)throw new Error(validation.errors.join('\n'));return candidate;
}
