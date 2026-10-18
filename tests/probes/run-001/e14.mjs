// E14: real founding, recognition, law, defection and post-war control.
import {once,ok,wrong,missing} from '../harness.mjs';
import {setup,prepareNation,county,village} from '../../helpers/u16.mjs';
import {recognizeIndependence,recognitions,foundNation,defectFromNation,nationAction} from '../../../server-plugin/nation-founding.mjs';
import {grantTitle,stripTitle} from '../../../server-plugin/titles.mjs';
import {createArmy} from '../../../server-plugin/military.mjs';
import {armyKey} from '../../../server-plugin/military.mjs';
import {endWar,startWar} from '../../../server-plugin/war-diplomacy.mjs';
import {holdingSet} from '../../../server-plugin/holding-sources.mjs';
import {openHoldings,aliveHoldings} from '../../../server-plugin/holdings.mjs';
import {standing,adjustStanding} from '../../../server-plugin/standing.mjs';
import {nationAt,territoryController} from '../../../server-plugin/noble-state.mjs';
import {legalCodeAt} from '../../../server-plugin/law-codes.mjs';
import {groupAccountView} from '../../../server-plugin/group-account.mjs';
import {digest} from '../../../server-plugin/storage.mjs';
import {toolDefinitions} from '../../../extension/tools.mjs';

export function nationalScenario(){
 const {e,d}=setup(),factions=prepareNation(e,d);
 d.set(['holdings'],openHoldings(e,d.document));d.engine=e;
 for(const f of factions)recognizeIndependence(d,e,'player',f,`s2c-recognize:${f}`);
 const n=foundNation(d,e,{name:'垄渠新国',capital:village,coins:25000},'s2c-nation');
 const rebel='npc_yp_gaoxin',people=e.world.settlementProfiles.find(p=>p.id===village).residentIds.filter(id=>id!==rebel).slice(0,3);
 const org=structuredClone(d.get('state','records',`organization:${n.id}`));
 for(const id of [rebel,...people])org.members[id]={position:'成员',joinedAt:d.get('state','minute'),arrears:0};
 holdingSet(d,e,['state','records',`organization:${n.id}`],org,'nation-founding');
 d.set(['state','npcs',rebel,'location'],d.get('state','location'));d.set(['state','npcs',rebel,'activity'],'议事');
 const title=grantTitle(d,e,{name:'伯爵',member:rebel,settlement:county,consent:true},'s2c-grant').title;
 createArmy(d,e,{id:'army_s2c_rebel',name:'郡卫队',party:n.id,leader:rebel,base:village,location:village,supply:'purchase',regular:30,training:50,morale:70,payCopperMonth:0},d.get('state','minute'),'s2c-garrison');
 for(const [i,id]of people.entries()){
  adjustStanding(d,e,id,rebel,[60,-30,10][i],{sourceEvent:`s2c-rebel:${id}`});
  adjustStanding(d,e,id,n.id,[0,60,0][i],{sourceEvent:`s2c-nation:${id}`});
 }
 return {e,d,n,rebel,people,title};
}

export const scenario=once(async()=>{
 const {e,d,n,rebel,people}=nationalScenario();
 const national=legalCodeAt(e,village,d.get('state')),crime=Object.keys(national.penalties)[0];
 nationAction.call(e,d,{operation:'nation',choice:'law',name:crime,coins:37,minutes:600},'e14-law');
 const localLaw=legalCodeAt(e,village,d.get('state')),outside=legalCodeAt(e,'bld_bs_office',d.get('state'));
 const foreign=n.suzerain;
 const before=recognitions(e,d.get('state'),'player');
 const ally=before[0];
 createArmy(d,e,{id:'army_e14_foreign',name:'外部军队',party:ally,base:village,location:village,supply:'purchase',regular:10,training:40,morale:50,payCopperMonth:0},d.get('state','minute'),'e14-foreign');
 const conflict=startWar(d,e,{id:'e14-recognition-war',name:'外部争端',aggressor:n.id,defender:ally,front:village,armies:['army_u16_private','army_e14_foreign']},d.get('state','minute'),'e14-war');
 const during=recognitions(e,d.get('state'),'player');endWar(d,e,structuredClone(conflict),{winner:null,at:d.get('state','minute'),src:'e14-recognition-peace'});
 const coins=groupAccountView(e,d.get('state'),n.id).coins;
 const defection=defectFromNation(d,e,{nation:n.id,member:rebel},'e14-defect');
 const retained=d.get('state','records',`title:${rebel}`,'status')==='受封';
 const canonicalRetained=aliveHoldings(d,{kind:'holds_office',holder:rebel,subject:`office_title:title:${rebel}`}).length===1;
 const controlBefore=territoryController(e,d.get('state'),village);
 const snapshot=digest(d.document);defectFromNation(d,e,{nation:n.id,member:rebel},'e14-repeat');const idempotent=digest(d.document)===snapshot;
 stripTitle(d,e,{member:rebel,reason:'公开叛离的除爵裁决'},'e14-strip');
 const controlAfter=territoryController(e,d.get('state'),village),stripped=d.get('state','records',`title:${rebel}`,'status')==='已除爵';
 const war=startWar(d,e,{id:'e14-reclaim',name:'收复领地',aggressor:n.id,defender:rebel,front:village,territory:county,armies:['army_u16_private','army_s2c_rebel']},d.get('state','minute'),'e14-reclaim');
 endWar(d,e,structuredClone(war),{winner:n.id,at:d.get('state','minute'),src:'e14-won'});
 return {before,during,ally,localLaw,outside,crime,retained,canonicalRetained,stripped,controlBefore,controlAfter,recovered:territoryController(e,d.get('state'),village),n,rebel,people,defection,idempotent,coins,remainingCoins:groupAccountView(e,d.get('state'),n.id).coins,document:d.document};
});
export default [
 {id:'E14-1',event:'E14',no:1,text:'建国后是否获得承认取决于周边政体立场，不自动获得',async check(){const r=await scenario();return r.before.length>=2&&!r.during.includes(r.ally)?ok('真实外交承认参与建国门槛；实际开战后该方承认失效'):wrong('真实外交正反例未满足');}},
 {id:'E14-2',event:'E14',no:2,text:'新法典只在本国疆域内生效',async check(){const r=await scenario();return r.localLaw.nation===r.n.id&&r.localLaw.penalties[r.crime].baseFine===37&&r.outside?.nation!==r.n.id?ok('国君真实修法后域内罚金37，域外未套用该国法典'):wrong('法律越界或修法未生效');}},
 {id:'E14-3',event:'E14',no:3,text:'叛变者的伯爵权限由玩家决定剥夺；剥夺之前保留实际控制',async check(){const r=await scenario(),ops=toolDefinitions().find(t=>t.function.name==='world_settlement').function.parameters.properties.operation.enum;if(!ops.includes('title_grant')||!ops.includes('title_strip'))return missing('领域授爵/除爵已实现，但公共操作枚举和动作目录仍待K1接入');return r.retained&&r.canonicalRetained&&r.stripped&&r.controlBefore===r.rebel&&r.controlAfter===r.rebel?ok('实际授爵、叛离、君主裁决；除爵前后驻军实控均保留'):wrong('爵权被自动撤销或裁决越权改变实控');}},
 {id:'E14-4',event:'E14',no:4,text:'封地归属以实际控制和战争或外交结果为准',async check(){const r=await scenario();return r.controlBefore===r.rebel&&r.controlAfter===r.rebel&&r.recovered===r.n.id?ok('驻军叛离取得实控，除爵不夺地，实际战果才恢复本国控制'):wrong('实控没有跟随实际驻军和战果');}},
 {id:'E14-5',event:'E14',no:5,text:'叛变者的部下按各自对两边的好感决定跟谁走',async check(){const r=await scenario();return r.defection.followers.length===1&&r.defection.followers[0]===r.people[0]&&r.idempotent&&r.coins===r.remainingCoins?ok('亲叛者跟随、亲原国和差值不足者留下；重入不转款，原公库保留'):wrong('人员分流或公库守恒不满足');}}
];
