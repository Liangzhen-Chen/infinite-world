// E16 争水杀人，缺席审判【离屏】：NPC 犯罪伤人被限制在 hp-1 打不死人、犯案后不逃亡，分水口无水源存量，情境不可完整构造；
// 检查读取 NPC 犯罪、通缉与引渡、继承与立场、转述失真的实现。
import {src,world,ok,partial,wrong,missing} from '../harness.mjs';

const crime=()=>src('server-plugin/npc-crime.mjs');
export default [
 {id:'E16-1',event:'E16',no:1,text:'案件进法院，凶手被通缉；逃往无引渡关系的政体就抓不回',async check(){
  const flee=/flee|逃亡|escape/.test(crime());
  const extradition=/extradition:false/.test(src('server-plugin/law-codes.mjs'));
  return flee&&extradition?ok('NPC 可犯命案并逃往他国，引渡约束生效'):extradition?partial('不到案即通缉，通缉与引渡受政体关系约束；但 NPC 不会犯命案也不会主动逃往别的政体'):missing('无引渡');}},
 {id:'E16-2',event:'E16',no:2,text:'死者家属继承田产，并对凶手全家好感暴跌',async check(){
  const lethal=!/Math\.max\(0,hp-1\)/.test(crime());
  const inherit=/settleFamilyEstate/.test(src('server-plugin/npc-life.mjs')),household=/household/.test(src('server-plugin/standing.mjs'));
  return lethal&&inherit&&household?ok('命案后继承与按家户传导立场'):inherit&&household?partial('死亡后按规则继承、立场按家户折半传递；但 NPC 之间不会发生命案，接不到这条链'):missing('无继承或立场传导');}},
 {id:'E16-3',event:'E16',no:3,text:'性格暴烈的亲属可能私下报复，构成新案件',async check(){
  return /standing\(e,s,id,other\)<=-30/.test(crime())&&/assault/.test(crime())?ok('性格鲁莽且立场 ≤-30 者会对仇人伤人，按普通案件立案'):missing('无报复');}},
 {id:'E16-4',event:'E16',no:4,text:'分水矛盾仍在，可由村民大会出议案解决',async check(){
  const npcProposal=/npc[\s\S]{0,40}propos|proposeAsNpc/.test(src('server-plugin/governance.mjs'));
  const water=/waterShare|分水/.test(src('server-plugin/agriculture.mjs')+src('server-plugin/environment.mjs'));
  return water&&npcProposal?ok('有分水与 NPC 议案'):water||npcProposal?partial('只有分水或 NPC 议案之一'):missing('没有水源分配；议案只能由玩家提出（RW-04 未合入）');}},
 {id:'E16-5',event:'E16',no:5,text:'玩家回村看到的是传闻版本，可能失真（打死→毒死）',async check(){
  const c=src('server-plugin/npc-cognition.mjs');
  return /distortionTable|失真表|replaceCause/.test(c)?ok('转述有内容层面失真'):/听来的大意/.test(c)?partial('转述会省略数量并标“未经亲历核实”，没有内容层面的失真'):missing('转述等于真相');}},
];
