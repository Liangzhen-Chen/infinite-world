import fs from 'node:fs/promises';
import {hashContent,rowFingerprintShape,stampL4Notes,requireFlagValue} from './content-pipeline.mjs';
const root='world/drafts/w1/hewan',read=async p=>JSON.parse(await fs.readFile(p,'utf8')),write=(p,x)=>fs.writeFile(p,JSON.stringify(x,null,2)+'\n');
// 用法：node tools/w1-hewan-l4.mjs --by <L4审查者>
const by=requireFlagValue(process.argv,'--by');
// Notes record the actual fixed samples and flagged text read on 2026-10-10.
const notes={
 npc_hw_miaozhen:'复读修正全文：公开描写与台词已删去本人视力秘密，记忆不再保证种粒未沤坏；年龄67、家庭成员与筛种地点一致。',
 npc_hw_ranmo:'通读描写、三句台词和两段记忆：整经检查、废线教学与既定缺点一致。天亮后是模糊时段，实际作息仍09:00开始；不据台词增加教学服务。',
 npc_hw_wengqiao:'通读全文：66岁、丈夫蒲铎、孙女翁芹对应骨架；湿叶与转述船期的经历相容。询问饭食是台词范例，不产生可领取库存；驿站比对细节记作软问题。',
 npc_hw_xiejin:'复读修正全文：删除天未亮起床的句子后，与08:00家务、09:00田间目标一致；母亲黎雁和两名孩子的关系、41岁及肩膀旧劳损没有改变。',
 npc_hw_jiaoyou:'通读全文：酒馆帮工按林穗安排，不获得店铺库存；与白蕙分开花费。三句为静态台词范例，不能据其中今日去向替代实时作息。',
 npc_hw_hangli:'通读全文：48岁、费铠配偶、织坊洗晒与共同销售工时争议有骨架依据；旁人晾架细节不构成新库存或物权。',
 npc_hw_xieyi:'烦恼与大圆水纹可见特征对应六岁初入学堂儿童，未增成人工作、收费或恋爱内容。',
 npc_hw_shaohe:'筛活家务烦恼、清路与休息冲突对应邵鹤，撑膝站起仍为可见特征；未把亲属苗贞的秘密公开。',
 npc_hw_luoxing:'两个空种袋记号与描字习惯对应罗苇三口之家的儿童，不把空袋变成种粮库存。',
 npc_hw_luxun:'想听懂旧地名与歇脚处闲谈争议保持陆荀原烦恼，轻点膝盖只是动作细节。',
 npc_hw_zhongya:'父母在外与钟岫照看对应既定同户事实，等候家信没有新增已送达消息或运输能力。',
 bld_hw_home_18:'四人同户的木屋与户籍吻合；门外招呼、获允入屋边界保留。绳篓柴火为生活景物，未登记可拿物品或可调用环境能力。',
 bld_hw_home_19:'东檐小院仍是私宅；衣物、鞋与水缸是描述景物，不授予库存取用、供水或公开服务。',
 bld_hw_home_16:'复读定点修正：已删无骨架来源的修补渔具，保留择菜和衣袖的日常观察；三人户身份与私宅边界不变。',
 bld_hw_home_22:'旧木件与补榫户职业相容，物件仍未进入可售或可取库存；先问来意再允许进入，与私宅规则一致。',
 bld_hw_home_15:'筛种器物与本户筛粒生活相容，不另赋库存。没有固定公共开放时段，起居与睡处两房对应骨架。',
};
for(const kind of ['npcs','residents','locations']){const directory=`${root}/${kind}`,summary=await read(`${directory}/summary.json`);
 for(const batch of summary.batches){const rows=await Promise.all(batch.ids.map(id=>read(`${directory}/${id}.json`)));if(rows.some(r=>r.status!=='passed'||r.errors.length||r.review.contradictions.some(c=>c.severity==='hard')))throw new Error(`${kind}仍有未通过条目`);
  if(hashContent(rows.map(rowFingerprintShape))!==batch.fingerprint)throw new Error('审核指纹改变');
  const required=[...new Set([...batch.sample,...batch.flagged])];if(required.some(id=>!notes[id]))throw new Error(`缺少实际阅读笔记 ${required.filter(id=>!notes[id]).join(',')}`);
  batch.l4={approved:true,reviewedAt:'2026-10-10',notes:stampL4Notes(required.map(id=>({id,note:notes[id]})),by,rows)};await write(`${directory}/batch-${batch.index}.json`,batch);
 }await write(`${directory}/summary.json`,summary);
}
console.log('河湾固定抽样与全部标记项L4已记录；仍须候选校验，不写正式目录。');
