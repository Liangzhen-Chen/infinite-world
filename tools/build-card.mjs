import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {staticMessages,parseExamples,promptSections} from '../extension/prompt.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {buildToolExamples} from './prompt-examples.mjs';
import {generationSettings,generationPreset} from '../extension/generation.mjs';

const root=path.resolve(import.meta.dirname,'..');
function reference(world){
    const r=world.rules;
    return [
        `历法：${r.calendar.epoch}，每年${r.calendar.monthsPerYear}个月，每月${r.calendar.daysPerMonth}日；月份依次为${r.calendar.months.join('、')}。`,
        `币制：${r.currency.copperPerSilver}铜换1银，${r.currency.silverPerGold}银换1金。`,
        `公开属性：${r.attributes.join('、')}。等级上限${r.levels.maximum}。`,
        `装备品质与使用等级：${r.equipment.qualities.map((q,i)=>`${q}器${r.equipment.requiredLevels[i]}级`).join('；')}。`,
        `战斗职业：${world.professions.filter(row=>row.kind==='combat').map(row=>row.name).join('、')}。`,
        `生活职业：${world.professions.filter(row=>row.kind==='life').map(row=>row.name).join('、')}。隐藏职业的取得条件不公开。`,
        `起始区域：${world.locations.filter(row=>row.id==='loc_hw'||row.scope==='loc_hw').map(row=>`${row.name}${row.description?`：${row.description}`:''}`).join('；')}。`,
        `其他已登记地点：${world.locations.filter(row=>row.id!=='loc_hw'&&row.scope!=='loc_hw').map(row=>row.name).join('、')}。详细地理通过目录与检索查阅。`,
        `起始居民：${world.npcs.filter(row=>row.scope==='loc_hw').map(row=>`${row.name}，${row.occupation}`).join('；')}。`,
        `已登记文化：${(world.cultures??[]).map(row=>row.name).join('、')||'暂无'}。`,
        `已登记神祇：${(world.deities??[]).map(row=>row.name).join('、')||'暂无'}。具体习俗与传说须通过世界检索确认。`,
    ].join('\n\n');
}
export async function loadPromptBundle({world=null,source=path.join(root,'prompt'),settings={}}={}){
    world??=await loadWorld();
    const read=name=>fs.readFile(path.join(source,name),'utf8');
    const [constitution,primer,style,examples,first,cliches]=await Promise.all(['constitution.md','world-primer.md','style.md','examples.md','first-message.md','cliches.json'].map(read));
    const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:'无限原野·世界主持人',
        description:primer.replace('{{WORLD_REFERENCE}}',reference(world)),personality:'人物各有生活与判断，叙述具体、克制。',
        scenario:'成年冒险者在河湾村展开生活，当前地点与经历由所载入的战役确定。',first_mes:first.trim(),mes_example:examples.trim(),
        system_prompt:'',post_history_instructions:'',alternate_greetings:[],creator_notes:'新版引擎主持人；首次启用请使用聊天副本。',
        tags:['中文','开放世界'],creator:'无限原野',character_version:'2.0',extensions:{world:'',fields_engine:2}}};
    card.data.extensions.fields_tool_examples=await buildToolExamples(world);
    const bundle={format:1,generation:generationSettings(settings),constitution:constitution.trim(),style:`${style.trim()}\n\n避免措辞：${JSON.parse(cliches).join('、')}。`,card};
    const staticText=staticMessages(bundle).map(message=>message.content).join('\n');
    if(/world_commit|world_roll|再生者/.test(staticText))throw new Error('提示词残留旧工具或旧身份');
    if(parseExamples(examples).length<12)throw new Error('需要至少六段对话示例');
    for(const match of (examples+first).matchAll(/<q who="([^"]+)"/g))if(!world.npcs.some(npc=>npc.id===match[1]))throw new Error(`对话示例引用未登记人物：${match[1]}`);
    // This estimate is only a build warning; acceptance must measure the real request's usage.
    const byteBound=Buffer.byteLength(staticText+JSON.stringify(toolDefinitions())+JSON.stringify(card.data.extensions.fields_tool_examples));
    if(byteBound>48000)throw new Error('静态提示过长，需核对模型分词后再发布');
    bundle.budget={utf8Bytes:byteBound,estimatedTokens:Math.ceil(byteBound/3),limit:12000,exact:false};
    if(bundle.budget.estimatedTokens>bundle.budget.limit)throw new Error('静态提示估算超过12000 token');
    return bundle;
}
export function presetFor(bundle){
    const prompts=promptSections(bundle).map(({identifier,name,marker,content})=>({identifier,name,role:'system',
        ...(marker?{marker:true}:{system_prompt:true,content})}));
    prompts.push({identifier:'chatHistory',name:'Chat History',role:'system',marker:true});
    return{preset_settings_openai:'无限原野新版',...generationPreset(bundle.generation),
        new_chat_prompt:'',new_example_chat_prompt:'',prompts,prompt_order:[100000,100001].map(character_id=>({character_id,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))})),
        extensions:{fields_engine:2}};
}
function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
export function encodeCardPNG(card,png){
    if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('头像不是PNG');
    const chunks=[png.subarray(0,8)];let ended=false;
    for(let cursor=8;cursor<png.length;){
        const length=png.readUInt32BE(cursor),end=cursor+length+12;if(end>png.length)throw new Error('PNG数据不完整');
        const type=png.toString('ascii',cursor+4,cursor+8),data=png.subarray(cursor+8,cursor+8+length);
        if(type==='IEND'){
            const metadata=Buffer.from('chara\0'+Buffer.from(JSON.stringify(card)).toString('base64'),'latin1');
            const chunk=Buffer.alloc(metadata.length+12);chunk.writeUInt32BE(metadata.length);chunk.write('tEXt',4);metadata.copy(chunk,8);chunk.writeUInt32BE(crc32(chunk.subarray(4,-4)),chunk.length-4);chunks.push(chunk);ended=true;
        }
        if(!(type==='tEXt'&&/^(chara|ccv3)\0/.test(data.toString('latin1'))))chunks.push(png.subarray(cursor,end));
        cursor=end;
    }
    if(!ended)throw new Error('PNG缺少结束块');return Buffer.concat(chunks);
}
export async function buildCard({destination=path.join(root,'dist/card'),avatarPath=null,...options}={}){
    const bundle=await loadPromptBundle(options);await fs.mkdir(destination,{recursive:true});
    // Image pixels are left untouched; this step only embeds the character metadata.
    const avatar=avatarPath?await fs.readFile(avatarPath):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=','base64');
    await Promise.all([fs.writeFile(path.join(destination,'host.json'),JSON.stringify(bundle.card,null,2)),
        fs.writeFile(path.join(destination,'host.png'),encodeCardPNG(bundle.card,avatar)),
        fs.writeFile(path.join(destination,'preset.json'),JSON.stringify(presetFor(bundle),null,2)),
        fs.writeFile(path.join(destination,'prompt.json'),JSON.stringify(bundle,null,2))]);
    return{destination,budget:bundle.budget,worldBookBound:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))console.log(JSON.stringify(await buildCard()));
