import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {createHash}from'node:crypto';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
import {loreConstraintErrors}from'./spell-lore-constraints.mjs';
const text=(minLength,maxLength)=>({type:'string',minLength,maxLength});
const list=items=>({type:'array',items,minItems:2,maxItems:4});
const legalStatus={enum:['public','consent','permit','crime']};
const spellLore={
    type:'object',additionalProperties:false,
    properties:{id:{type:'string'},theory:text(70,180),casting:text(30,120),failure:text(40,150),counters:list(text(12,70)),
        socialConsequences:text(70,220),
        law:{type:'object',additionalProperties:false,properties:{river:legalStatus,city:legalStatus,port:legalStatus},required:['river','city','port']},
        proficiencyEffects:{type:'array',minItems:4,maxItems:4,items:text(15,80)}},
    required:['id','theory','casting','failure','counters','socialConsequences','law','proficiencyEffects'],
};
const loreSchema={type:'object',properties:{spells:{type:'array',items:spellLore}},required:['spells'],additionalProperties:false};
const validate=new Ajv({allErrors:true,strict:true}).compile(loreSchema);
const example=JSON.parse(await fs.readFile('world/design/spell-lore-example.json','utf8'));
if(!validate({spells:[example]}))throw new Error('手写格式示例未通过原始schema要求');
const client=new DeepSeekClient({budgetYuan:60}),all=spellBlueprints(),reports=[];
const runId=Date.now();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const option=process.argv.indexOf('--batches'),requested=option<0?[0]:process.argv[option+1].split(',').map(Number);
if(requested.some(value=>!Number.isInteger(value)||value<0||value>=11))throw new Error('批号需为0–10，例：--batches 0,1');
await fs.mkdir('world/drafts/spells',{recursive:true});
await fs.writeFile(`world/drafts/spells/source-${runId}.json`,JSON.stringify({runId,blueprints:all},null,2)+'\n');
await fs.writeFile('schemas/spell-lore.schema.json',JSON.stringify(loreSchema,null,2)+'\n');
async function draft(index){
    const schoolBones=all.slice(index*14,index*14+14),errors=[],assembled=[];
    for(let part=0;part<schoolBones.length;part+=3){
    const bones=schoolBones.slice(part,part+3);let success=false;
    for(let attempt=1;attempt<=3;attempt++){
        const messages=[{role:'system',content:`你为原创中文剑与魔法游戏写法术目录的世界内说明，输出JSON。用户给的14条机制及数字是固定事实，不得增加强度或赋予新能力。只补以下JSON字段，任何基础字段都不要重写。\n${JSON.stringify(loreSchema)}\n西陲河谷常由乡约见证民事承诺，中陆城市重视公会许可，琥珀海岸港务规定追究航运事故与货损。当前阶段还未命名神祇或学院，不要发明具名NPC、势力或地点。精神强迫、篡改记忆是重罪；隐私须同意，空间锚点须许可。law中river/city/port分别对应上述地区的public公开、consent同意、permit许可、crime重罪。普通制造或防护法术在合适地点可公开施放，纵火伤人则另算犯罪。每条分别说明魔力如何作用于媒介、具体手势/符文或动作、失败的可观察表现、至少两种不同反制与具体受益者/竞争者的反应。熟练度四段为0–99、100–299、300–599、600以上，只增加精确度和可靠性，不超过给定范围和阶段。不要写给主持人的提示，不出现主持人、提示词、任务列表、玩家不能等词；每条细节各不相同，勿套用相同开头或同一段制度说明。JSON必须含spells数组，编号原样保留。`},
            {role:'user',content:JSON.stringify({bones,example:{spells:[example]},
                fidelityInstructions:'law必须与各骨架的law逐字一致。它表示正常预定用途，不把普通点火或自有物品保鲜判成犯罪；伤人、侵占等由行为另行判定。boundaries是机制硬边界，theory、failure、社会影响及四段熟练度均须遵守。只说明现有能力，失败也不生成新的可用能力。城镇日常小术无需凭空发明许可手续。熟练度是点数，不是使用次数，不能写百次、三百次、六百次。',
                numericInstructions:'duration和durationLimit单位为分钟，是固定持续时间上限；四段熟练度不延长它。一小时=60分钟，一天=1440分钟，不能混用。持续类法术在theory或最高熟练度段明确原定分钟上限，不能用其他时间代替。duration=0表示瞬时完成，留下的伤势或修补可继续存在。时间只写分钟或秒，不写息或时辰。rangeMeters是米数，不因熟练度提高扩大距离。materials每项材料都必须在theory或casting说明实际用途，数量和高熟练度消耗不减少。额外水、石、燃料等环境媒介写明须在现场实际存在。社会用途不得突破目标种类与载荷。只有law=permit的正常用途才要求施法许可，特殊公共设施的所有权授权另说。world内法律事实使用允许、需授权、追究责任等措辞，不用禁止之类容易混入主持规则的句式。counters每一条都必须是使法术失效、抵挡或削弱的实际方法，帮助施法或延长效果不算反制，也不能用帮助对方的方案凑满两条。气囊只有封闭的两升空气，没有筛选净化外界空气、换气、再生氧气能力。世界内文本不出现骨架、duration、rangeMeters、schema、JSON等开发措辞。',
                lengthInstructions:'每个汉字计1字符。每条theory写100–140字，casting写50–80字，failure写60–100字，socialConsequences写110–160字，每条counters写20–40字，四段proficiencyEffects各写22–40字。这是3条以内的小批次，不要压缩成摘要。保持具体，避免填充句。',
                previousErrors:errors.at(-1)??null})}];
        try{
            const response=await client.generate({messages,response_format:{type:'json_object'},max_tokens:5000,temperature:0.8},`spell-draft-${index}-${part}-${attempt}`);
            const raw=response.choices?.[0]?.message?.content??'';
            await fs.writeFile(`world/drafts/spells/attempt-${runId}-${index}-${part}-${attempt}.json`,JSON.stringify({finishReason:response.choices?.[0]?.finish_reason,raw},null,2));
            const draft=JSON.parse(raw);
            if(!validate(draft))throw new Error(JSON.stringify(validate.errors.map(row=>({path:row.instancePath,keyword:row.keyword,params:row.params}))));
            const wanted=new Set(bones.map(row=>row.id)),received=new Set(draft.spells.map(row=>row.id));
            if(received.size!==bones.length||draft.spells.length!==bones.length||[...received].some(id=>!wanted.has(id)))throw new Error('编号遗漏、重复或出现骨架以外的法术');
            for(const row of draft.spells){
                const bone=bones.find(value=>value.id===row.id);
                if(['river','city','port'].some(region=>row.law[region]!==bone.law[region]))throw new Error(`${row.id}合法性偏离手写骨架`);
                if(/百次|三百次|六百次/.test(row.proficiencyEffects.join('')))throw new Error(`${row.id}把熟练度误写成使用次数`);
                const constraints=loreConstraintErrors(row,bone);if(constraints.length)throw new Error(`${row.id}: ${constraints.join('；')}`);
            }
            assembled.push(...draft.spells);
            success=true;break;
        }catch(error){errors.push({part,attempt,error:error.message});console.log(`法术批${index} 分组${part}第${attempt}次未通过校验`);}
    }
    if(!success)break;
    }
    const success=assembled.length===schoolBones.length;
    if(success){
        await fs.writeFile(`world/drafts/spells/lore-${String(index).padStart(2,'0')}.json`,JSON.stringify(assembled,null,2)+'\n');
        await fs.writeFile(`world/drafts/spells/lore-${String(index).padStart(2,'0')}.meta.json`,JSON.stringify({runId,source:`source-${runId}.json`,blueprintHash:digest(schoolBones),loreHash:digest(assembled)},null,2)+'\n');
    }
    reports.push({index,count:schoolBones.length,success,errors,published:false});console.log(`法术批${index}：${success?'草稿通过结构校验，待内容审查':'三次失败，待人工处理'}`);
}
for(let start=0;start<requested.length;start+=2)await Promise.all(requested.slice(start,start+2).map(draft));
const report={date:'2026-10-10',scope:'按手写法术机制生成世界内说明；仅草稿结构校验，尚未发布或质量验收',costUpperYuan:client.spent,batches:reports};
const pending=reports.filter(row=>!row.success);
if(pending.length){
    await fs.mkdir('docs/内容审查',{recursive:true});
    await fs.writeFile(`docs/内容审查/法术起草-待处理-${runId}.json`,JSON.stringify({runId,source:`world/drafts/spells/source-${runId}.json`,scope:'每批三次失败后进入人工清单，不发布、不覆盖旧草稿',batches:pending},null,2)+'\n');
}
await fs.writeFile(`docs/测试报告/法术起草-${Date.now()}.json`,JSON.stringify(report,null,2));
if(reports.some(row=>!row.success))process.exitCode=1;
