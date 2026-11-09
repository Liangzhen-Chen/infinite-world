import fs from 'node:fs/promises';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
const root=new URL('./',import.meta.url);
const notes={
zhaofeng:'逐项阅读候选与L2；乔端水痕和先后分歧来自原关系备注，替换规则式邻里意见。轮水册和旧记忆未改，未订新轮次。',
qiaoduan:'逐项阅读候选与L2；沿原关系保留田边听温绪解释穗轴，仅去掉规则句。没有增加温家库存或袋内知情。',
wenxu:'逐项阅读候选与L2；待知事项仍是严贝重描袋记的时间；穗袋摆放与篱脚通道的分歧保持未解决。只修三个审计叶子，未增回忆。',
jiangmi:'逐项阅读候选与L2；种穗袋归类和邻户搬篱同意均写成具体待知事项。韩培通道往来沿原关系，未代他承诺清圈。',
hanpei:'逐项阅读候选与L2；朱笙是否愿意分清范围仍未确认；邻里意见复用既有共灶争执，没有新增报酬、工时或换工约定。',
zhusheng:'逐项阅读候选与L2；秦砺谈过的旧磨架异响及先停磨意见来自原关系，未给朱笙新修磨技能，旧知识和共享回忆保留。',
qinli:'逐项阅读候选与L2；旧架接缝检看的具体位置仍待查。桌位意见保留高忻抄地名和秦砺摆记号的用途，先后没有排定。',
gaoxin:'逐项阅读候选与L2；桶件物主与柏嘉想问的契字都未断言答案；陶咨意见沿原修桶往来，未赋予高忻判定物主的权限。',
taozi:'逐项阅读候选与L2；误放桶记号、衣主、程懿不问的原因仍待本人说明。暂存位分歧没有变成挪动物品的同意；旧回忆不改。',
luxia:'逐项阅读候选与L2；待知事项指向具体物主、卢幼破口和登慈接待处。潘菊家务往来未共享潘家的财物；修订意见的帮忙表述为未落实提议。'
};
const rows=[];for(const [key,note]of Object.entries(notes)){const id='npc_yp_'+key,r=JSON.parse(await fs.readFile(new URL(id+'.json',root)));if(r.status!=='passed'||r.errors.length)throw Error('L2尚未通过 '+id);rows.push({id,note,draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),readAt:new Date().toISOString()});}
await fs.writeFile(new URL('human-notes-first10.json',root),JSON.stringify(rows,null,2)+'\n');
