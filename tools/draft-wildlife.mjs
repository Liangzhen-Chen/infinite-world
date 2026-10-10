import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {wildlifeLoreSchema,wildlifeLoreIssues,validateWildlifeLore,auditWildlifeLore,contentHash,sampleRows,wildlifeBones,wildlifeGeneratorFiles,assembleWildlife} from './wildlife-content.mjs';
if(process.argv.slice(2).some(a=>a!=='--expansion'))throw new Error('用法：node tools/draft-wildlife.mjs [--expansion]');
const kind=process.argv.includes('--expansion')?'highWildlife':'foundation';
const world=await loadWorld(),bones=wildlifeBones(kind),runId=String(Date.now()),root=`world/drafts/wildlife/${runId}`;
if(kind==='highWildlife'&&bones.monsters.some(b=>world.monsters.some(s=>s.id===b.id)))throw new Error('扩充物种已在正式目录，不重复起草');
await fs.mkdir(root,{recursive:true});const reviewSeeds=Array.from({length:Math.ceil(bones.monsters.length/50)},()=>randomBytes(4).readUInt32LE());
const generatorSources=await Promise.all(wildlifeGeneratorFiles.map(async file=>({file,source:await fs.readFile(file,'utf8')})));
const source={runId,kind,sourceWorldHash:contentHash(world),boneHash:contentHash(bones),generatorHash:contentHash(generatorSources),reviewSeeds,bones};
await fs.writeFile(`${root}/source.json`,JSON.stringify(source,null,2));await fs.writeFile(`${root}/generator-sources.json`,JSON.stringify(generatorSources,null,2));
const client=new DeepSeekClient({budgetYuan:20}),rows=[],failures=[];
async function one(bone,index){
    let feedback=null;
    for(let attempt=1;attempt<=3;attempt++)try{
        const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
        const start=time(bone.wildlife.activeHours[0]),end=time(bone.wildlife.activeHours[1]),schema=structuredClone(wildlifeLoreSchema);
        schema.properties.id.const=bone.id;schema.properties.habits.pattern=`${start}[\\s\\S]*${end}`;
        const habitat=bones.rules.habitats.find(h=>h.id===bone.wildlife.habitat),input={bone,habitat,
            dailyActivity:`${start}至${bone.wildlife.activeHours[0]>bone.wildlife.activeHours[1]?'次日':''}${end}，其他时段休息；habits必须原样写出两个时间，不能重新换算为相反昼夜`,
            drops:bone.drops.map(d=>({...d,catalog:world.items.find(i=>i.id===d.item)})),food:bone.tamingRule?.food.map(f=>world.items.find(i=>i.id===f.item).name),
            gathering:{minutes:bone.wildlife.gather.minutes,tool:world.items.find(i=>i.id===bone.wildlife.gather.tool)?.name??null,
                consumes:bone.wildlife.gather.consumes.map(d=>({...d,catalog:world.items.find(i=>i.id===d.item)}))},
            prey:bone.wildlife.predatorOf.map(id=>bones.monsters.find(s=>s.id===id)?.name??world.monsters.find(s=>s.id===id)?.name),feedback,
            constraints:['distinction是已经确认的习性或能力，folklore的误解不能否定它。火喉穴狸的热气确实能烘干穴口湿草，但不能点火或暖屋。',
                '本物种materials只能描述本条drops中商品。只参照本物种drops.catalog，不复制别种动物、鱼或树脂的工序；weights与保存期必须对应本商品。',
                'gathering规定实际取材工具、时间和清水量，只在有商品时描述对应处理；不得把一份清水写成所有物种的固定耗材。湿生皮在处理后仍湿，不能已经晒干。观察残余标本不新增商品或奖励。',
                'distinctive特征仅按distinction所述观察，不自行添加毒伤、喷火、治疗、传送或人类语言。等级高代表力量与耐受性，不自动获得未规定的法术。',
                '自然野兽使用真实生理细节：兔无蹄且不反刍，貂是足爪；虫食鸟的觅食与危害围绕捕虫，不写啄食粮食造成减产。微小昆虫引起的是短暂干扰，不编造误工半日、重伤或整屋毁坏。',
                '所有行为都遵守dailyActivity。其他时段只休息，threat和folklore也不能额外编夜行或例外。',
                'materials有商品时只讲实际材料与处理保存，不列“其余不增加肉毒药金属”。没有商品时讲留下的爪痕、蜕壳、落羽等生态线索及记录方法，不写无掉落、不加工、不食用、不作商品、登记清水等操作保证。voice只写实际声音动作，不写无语言或不能说话。']};
        await fs.writeFile(`${root}/input-${index}-${attempt}.json`,JSON.stringify(input,null,2));
        const response=await client.generate({temperature:.45,max_tokens:2200,tools:[{type:'function',function:{name:'submit_species',description:'提交一个原创物种的图鉴文字，仅补指定七字段。',parameters:schema}}],tool_choice:{type:'function',function:{name:'submit_species'}},messages:[
            {role:'system',content:`写中文中世纪剑与魔法世界的野外图鉴。数值与生物骨架是既定事实，不能改等级、作息、食性、群居、材料和驯服。只输出id、appearance、habits、threat、materials、folklore、voice，严格遵守各字段长度。编号只用于id，其余用给定中文名称。appearance写distinction所述可辨特征及具体观察动作；habits按activeHours写晨昏/昼夜活动、觅食与巢穴，注意跨午夜时段，并将群居数量写清楚。threat写对居民具体造成的损失或干扰及避免接触的方法，微小动物的风险须与体型相称。materials在drops有商品时只描述这件商品的实际取材工序与保存；drops为空时只描述足迹、粪痕、蜕壳或啃痕的观察与辨认。所有限制只用于你检查事实，成文只呈现具体观察，不解释系统权限或未获商品。folklore写一则当地流传的具体误解及能验证的实际习性差别。voice只描述声音节拍或肢体表达。每种有自己的观察细节，避免开头句式相同与通用结尾。`},
            {role:'user',content:`字数按中文字符计，必须分别达到：appearance 85–115字；habits 120–150字；threat 80–105字；materials 60–85字；folklore 95–125字；voice 45–65字。不能每字段只写一句，每段应有可观察细节和相应作用。每字段自行检查长度后再提交；字数不足会整批拒绝。事实与上次校验错误如下：${JSON.stringify(input)}`}]},`wildlife-${runId}-${index}-${attempt}`);
        const calls=response.choices?.[0]?.message?.tool_calls??[],raw=calls[0]?.function?.arguments??response.choices?.[0]?.message?.content;
        await fs.writeFile(`${root}/attempt-${index}-${attempt}.json`,JSON.stringify({raw,calls,finishReason:response.choices?.[0]?.finish_reason},null,2));
        if(calls.length!==1||calls[0].function.name!=='submit_species')throw new Error('必须且只能提交一次指定图鉴工具');
        const row=JSON.parse(raw);if(!validateWildlifeLore(row))throw new Error(JSON.stringify(validateWildlifeLore.errors));
        if(!new RegExp(schema.properties.habits.pattern).test(row.habits))throw new Error('habits必须按顺序写出dailyActivity的两个时刻');
        const errors=wildlifeLoreIssues(row,bone);if(errors.length)throw new Error(errors.join('；'));
        rows.push(row);console.log(`物种 ${index+1}/${bones.monsters.length} 结构完成`);return true;
    }catch(error){feedback=error.message;failures.push({id:bone.id,attempt,error:feedback});console.log(`物种${index}第${attempt}次失败，原输出保留`);}
    return false;
}
for(let i=0;i<bones.monsters.length;i+=6){const results=await Promise.all(bones.monsters.slice(i,i+6).map((b,n)=>one(b,i+n)));if(results.some(ok=>!ok))break;}
rows.sort((a,b)=>bones.monsters.findIndex(m=>m.id===a.id)-bones.monsters.findIndex(m=>m.id===b.id));
const audit=auditWildlifeLore(rows,bones);
if(audit.ok)try{assembleWildlife(world,bones,rows);}catch(error){audit.ok=false;audit.errors.push(error.message);}
await fs.writeFile(`${root}/lore.json`,JSON.stringify(rows,null,2));await fs.writeFile(`${root}/audit.json`,JSON.stringify(audit,null,2));
for(let batch=0;batch<reviewSeeds.length;batch++){
    const slice=rows.slice(batch*50,batch*50+50),review={runId,batch,seed:reviewSeeds[batch],boneHash:source.boneHash,loreHash:contentHash(rows),approved:false,
        scope:'待人工随机精读；任何一项不合格整批重做，不逐项拼接修补',sample:sampleRows(slice,reviewSeeds[batch]).map(row=>({id:row.id,hash:contentHash(row),scores:null,notes:null}))};
    await fs.writeFile(`docs/内容审查/物种-${runId}-批${batch}.json`,JSON.stringify(review,null,2));
}
const report={runId,root,planned:bones.monsters.length,structured:rows.length,audit,failures,costUpperYuan:client.spent,manualApproved:false};
await fs.writeFile(`docs/测试报告/物种起草-${runId}.json`,JSON.stringify(report,null,2));
if(!audit.ok)await fs.writeFile(`docs/内容审查/物种待处理-${runId}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({runId,structured:rows.length,autoPassed:audit.ok,costUpperYuan:client.spent,manualApproved:false}));if(!audit.ok)process.exitCode=1;
