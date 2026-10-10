import fs from 'node:fs/promises';
import {highWildlifeFoundation} from '../world/design/high-wildlife-foundation.mjs';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {parseModelJSON,runContentPipeline} from './content-pipeline.mjs';
import {fields,wildlifeContext,validateWildlifeDraft,wildlifeDraftRequest,wildlifeReviewRequest} from './w4-content.mjs';

const root='world/drafts/w4',world=await loadWorld(),bones=highWildlifeFoundation();
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');
const ledger=await read(`${root}/budget.json`),client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w4-usage.jsonl'});
// The earlier worker had already completed. No in-flight reservation is needed.
client.spent=ledger.spentYuan-(ledger.interruptedReservationYuan??0);
const jobs=[];
for(const bone of bones.monsters){
    const file=`${root}/${bone.id}.json`,record=await read(file),row=structuredClone(record.draft),before=JSON.stringify(row),context=wildlifeContext(bone,world);
    if(!row)continue;
    if(!process.argv.includes('--review-only')){
        for(const field of fields){
            row[field]=row[field].replace(/(?:activity\s*为?|grouping\s*)/g,'').replace(/drops[：:]\s*/g,'');
            row[field]=row[field].replace(/(\d{2}:\d{2})\s*[与和、]\s*(\d{2}:\d{2})(?:两个时刻)?/g,(_,a,b)=>`${a}至${a>b?'次日':''}${b}`)
                .replace(/仅(?:在)?这两个时刻(?:前后)?(?:外出)?/g,'在这段时间').replace(/(?:只在此两时段|仅此二时段)/g,'在这段时间')
                .replace(/不(?:会)?整夜(?:活动|游走)/g,bone.wildlife.activeHours[0]>bone.wildlife.activeHours[1]?'在夜间活动':'白昼活动')
                .replace(/夜间无额外活动/g,bone.wildlife.activeHours[0]>bone.wildlife.activeHours[1]?'白天休息':'夜间休息')
                .replace(/它们不夜间活动，只在黄昏至清晨出没/g,'它们从黄昏至次日清晨活动')
                .replace(/并不在夜间额外活动/g,bone.wildlife.activeHours[0]>bone.wildlife.activeHours[1]?'白天伏藏休息':'夜间休息');
            // Remove only clauses with unsupported measurements; retain the
            // authored distinguishing anatomy and all other reviewed clauses.
            if(/[零一二两三四五六七八九十百千\d]+(?:公里|千米|厘米|丈|米)/.test(row[field])){
                row[field]=row[field].split(/[，。；]/).filter(clause=>!/[零一二两三四五六七八九十百千\d]+(?:公里|千米|厘米|丈|米)/.test(clause)).filter(Boolean).join('，')+'。';
            }
        }
        if(bone.diet==='肉食')for(const field of fields)row[field]=row[field].replace(/反刍猎物/g,'进食猎物').replace(/反刍/g,'休卧');
        if(bone.drops.length&&(/保湿|干燥|湿皮|毛尚在|毛仍|蹭落的旧皮|drops|骨架/.test(row.materials)||record.errors.some(e=>typeof e==='object'&&/materials|gather|drops/.test(e.field)))){
            const drop=context.drops[0],g=context.gather;
            const opening=[`取材时用${g.tool.name}处理${g.minutes}分钟，消耗${g.consumes[0].amount}份清水，可得${drop.amount}份${drop.catalog.name}。`,
                `${drop.catalog.name}是${bone.name}的取材产物，一次可得${drop.amount}份。处理需${g.minutes}分钟，工具为${g.tool.name}，另用${g.consumes[0].amount}份清水。`,
                `猎后处理所需的${g.tool.name}与${g.consumes[0].amount}份清水要预先备妥，${g.minutes}分钟取材所得为${drop.amount}份${drop.catalog.name}。`][bones.monsters.indexOf(bone)%3];
            row.materials=opening+(drop.item==='item_rawhide'?'刮去残肉脂肪后，生皮尚未鞣制。摊平放在阴凉通风处，勿叠压或密封，及时送交鞣制。':drop.item==='item_resin'?'取的是渗出的树脂，不削取木材。收入陶罐或皮袋，扎口放在阴凉干燥处，可供黏接或引火。':'剖净鲜鱼须当天处理。把鱼收在通风竹篮或陶盆中，避开日晒，腥酸或发黏时便不宜食用。');
        }
        if(!bone.drops.length&&/采集|拾|捡|收集|掉落|骨架|drops|商品|取得实体材料/.test(row.materials)){
            row.materials=`观察${bone.name}时，${bone.wildlife.distinction}。把这些形态与原地留下的活动痕迹对照，可判断所见是否为同一物种；记录时须避开它的休息处，留出退路。`;
        }
        if(bone.id==='monster_grit_fang_lion')row.habits=row.habits.replace(/日出后|白天常/g,'天亮前').replace(/也捕其他肉食/g,'捕食盘踵沙奔兽');
        if(bone.id==='monster_rift_crown_hart')row.habits=row.habits.replace(/兼食背景中的微小昆虫与野草/g,'沿崖畔寻找野草');
        if(bone.id==='monster_coal_wax_lotus')row.habits=row.habits.replace(/用胶皮包住邻近的腐木碎屑慢慢消化/g,'根体留在湿土中吸取养分');
        if(bone.id==='monster_red_fold_drake')row.folklore=row.folklore.replace(/靠皮褶展开散热并伪装/g,'晒岩时依次舒展皮褶');
        if(bone.id==='monster_red_pitch_giant')row.folklore='山路上有人把半圆沟当成废弃拖车印。赤脂行榕的侧根会撑住地面，缓慢变换位置，沟痕便随着根脚移动。观察时可把根端与沟沿对照，红脂结仍附在老根上。它在白昼活动，夜里休息，不能凭夜间树影判断整株已经移走。';
        if(bone.id==='monster_deep_pitch_cedar'){
            row.habits=`${context.activity[0]}至${context.activity[1]}活动，两至四株散在湿土与岩壁之间，以根体吸收土壤养分。枝干撑岩后留下三角根印，挪动很慢，路过者可先从旧根印辨认它的位置。只有触动根体时才防御，远离后不追赶；夜间休息。`;
            row.folklore='山坳的旅人常把三角根印误认成有人凿出的登山踏窝。那些印子来自沉脂星杉撑岩的枝根；对照枝端便能辨出印子的形状。白昼间隔观察时，根脚位置会缓慢变化，踩着旧印攀登容易碰到附近仍活着的根体。';
        }
        if(bone.id==='monster_salt_wax_root')row.threat='贴着淡水渗口行走时，留意根颈的蜡色胶层。踩中活根会引起防御，搬动周围枯苇也应先看清根体的位置。给根丛留出空间并退离后，它不追赶远去的人。';
        if(bone.id==='monster_bowl_crown_aurochs')row.habits=row.habits.replace(/群体由一头成年雌性带领[，。]?/g,'');
        if(bone.id==='monster_firn_globe_owl')row.folklore=row.folklore.replace(/实际它只在18:00至次日06:00活跃，其余时段休息，并不整夜活动/g,'实际它从18:00至次日06:00连续活动，白天休息');
    }
    const changed=JSON.stringify(row)!==before;
    if(changed||record.status!=='passed'||validateWildlifeDraft(row,bone,context).errors.length){
        const editedFields=fields.filter(field=>row[field]!==record.draft?.[field]);record.draft=row;record.manualEdits={method:'Codex按已确认错误作字段修正；不重新起草整条',fields:editedFields,review:'pending'};
        await write(file,record);jobs.push({bone,record,file,context});
    }
}
let cursor=0,writes=Promise.resolve();
await Promise.all(Array.from({length:12},async()=>{for(;;){const index=cursor++;if(index>=jobs.length)return;const {bone,record,file,context}=jobs[index];
    try{
        const response=await client.generate(wildlifeReviewRequest(bone,record.draft,context),`w4-corrected-facts-${bone.id}`),review=parseModelJSON(response);
        if(!Array.isArray(review.contradictions)||review.contradictions.some(c=>!['hard','soft','style'].includes(c.severity)||!c.quote||!c.reason||!c.field))throw new Error('事实审查格式错误');
        record.review=review;const l1=validateWildlifeDraft(record.draft,bone,context);record.errors=[...l1.errors,...review.contradictions.filter(c=>c.severity==='hard')];record.warnings=[...l1.warnings,...review.contradictions.filter(c=>c.severity!=='hard')];record.status=record.errors.length?'manual':'passed';record.feedback=record.errors.length?record.errors:null;record.manualEdits.review='completed';
    }catch(error){record.status='manual';record.errors=[error.message];record.feedback=record.errors;}
    await write(file,record);writes=writes.then(()=>write(`${root}/budget.json`,{spentYuan:client.spent,limitYuan:20}));await writes;
}}));
const {summary}=await runContentPipeline({entries:bones.monsters,root,client,contextFor:entry=>wildlifeContext(entry,world),buildDraftRequest:wildlifeDraftRequest,buildReviewRequest:wildlifeReviewRequest,validateDraft:validateWildlifeDraft,concurrency:12,batchSize:50,revision:'w4-v2'});
console.log(JSON.stringify({reviewed:jobs.length,passed:summary.passed,manual:summary.manual,pending:summary.pending,cost:summary.costUpperYuan}));
if(summary.manual||summary.pending)process.exitCode=1;
