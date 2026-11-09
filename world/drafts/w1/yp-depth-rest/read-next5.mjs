import fs from 'node:fs/promises';
import {hashContent} from '../../../../tools/content-pipeline.mjs';
const root=new URL('./',import.meta.url),notes={
panju:'阅读全部13个修订项与L2；同户潘宁和本户拣菜信息来自旧档，未知仍是篮位与歇脚石的具体待问事项。共享记忆保留与任泊的已有摆石争议，目标步骤未完成，未改家人财物。',
renbo:'阅读全部13个修订项与L2；任芋同户与坡路巡看沿原档，松土绕行与外乡人复述是未来步骤。门边摆石争议和潘菊回忆完全一致，未宣称已让出行走宽度。',
caoyun:'阅读全部13个修订项与L2；树影核看和根边歇工问题有原描述支持，曹榛同户信息保留儿子身份。与荀禾的别扭没有变成已议定新歇工点或修剪许可。',
xunhe:'阅读全部13个修订项与L2；荀稼同户和补休息时间沿原档，未来记工不新增工资。曹芸根边争议与双方回忆一致，殷茸帮忙为待当面商量的提议。',
yinrong:'阅读全部13个修订项与L2；殷绥同户和碎线归属来自旧档，废线辨认与损耗记账保持未做。共享回忆只将原同村往来明确为相认，没有替卫迟处置绳料；家人空闲仍待问。'
};
const rows=[];for(const [key,note]of Object.entries(notes)){const id='npc_yp_'+key,r=JSON.parse(await fs.readFile(new URL(id+'.json',root)));if(r.status!=='passed'||r.errors.length)throw Error('L2尚未通过 '+id);rows.push({id,note,draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),readAt:new Date().toISOString()});}await fs.writeFile(new URL('human-notes-next5.json',root),JSON.stringify(rows,null,2)+'\n');
