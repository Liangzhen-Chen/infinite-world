// E07 首领巨蟒出巢，兽群下山：有首领、巢穴与部分村的害兽农田，但首领领地与栖地/迁徙/害兽无关联，情境不可完整构造；
// 以下检查读取现有机制（导出函数、规则与源码）。
import {world,src,imp,ok,partial,wrong,missing,codeHas} from '../harness.mjs';

export default [
 {id:'E07-1',event:'E07',no:1,text:'首领领地挤压其他动物栖地，被挤出的动物迁到低处，麦田减产',async check(){
  const linked=['wildlife-habitats','wildlife-migration','farm-pests'].some(m=>/boss|lair|首领/.test(src(`server-plugin/${m}.mjs`)));
  return linked?partial('栖地/迁徙/害兽读取首领领地，需补实测'):missing('首领没有领地扩张；季节迁徙和害兽农田都与首领无关');}},
 {id:'E07-2',event:'E07',no:2,text:'击杀首领后兽群在若干天里逐步回迁，不是瞬间复原',async check(){
  return codeHas(/returnMigration|回迁/)?partial('有回迁机制'):missing('前提（领地挤压）不存在，也就没有回迁');}},
 {id:'E07-3',event:'E07',no:3,text:'猎犬受伤需要治疗，不治会死或退化',async check(){
  const p=src('server-plugin/pets.mjs');
  const worsen=/woundWorsen|伤势恶化|injury\w*\s*\+/.test(p);
  return worsen?ok('外伤随时间恶化，可治疗'):/sickness/.test(p)?partial('宠物有饥饿、疾病扣血致死与出走，可治疗病伤；外伤不随时间恶化'):missing('宠物无伤病');}},
 {id:'E07-4',event:'E07',no:4,text:'首领死后不会在原地立刻刷新',async check(){
  const b=src('server-plugin/bosses.mjs'),days=(world.bosses??[]).map(x=>x.residence?.vacancyDays).filter(Number.isFinite);
  return /reoccupyAfter=boss\.actor\?null:day\+boss\.residence\.vacancyDays/.test(b)&&days.every(n=>n>0)?ok(`巢穴空置 ${Math.min(...days)}–${Math.max(...days)} 天后才有新占据者（不同种）`):partial('巢穴空置期未全部为正');}},
 {id:'E07-5',event:'E07',no:5,text:'击杀名声随传闻扩散，玩家有机会进入名士条件',async check(){
  const r=src('server-plugin/reputation.mjs')+src('server-plugin/bosses.mjs');
  return /bossKill|击杀首领|slay/.test(r)?partial('击杀计名声'):missing('名声只来自法律案件与决斗；名士成就只认学术、艺术、教育');}},
 {id:'E07-6',event:'E07',no:6,text:'猎得的野猪肉上市，肉价下跌',async check(){
  const w=await imp('server-plugin/wildlife.mjs'),body=w.wildlifePriceFactor.toString();
  if(/sold|supply|供给|market/.test(body))return ok('野味价格计入上市供给');
  return /initial/.test(body)&&/current/.test(body)?wrong('野味价格只按野生存量稀缺度（初始/现存）计算：猎得越多价越高，与供给增加价格下降相反'):missing('野味无价格机制');}},
];
