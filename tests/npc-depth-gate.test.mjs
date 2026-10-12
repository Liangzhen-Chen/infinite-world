import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {validateNpcDepth,validateNpcProfiles,findNpcRuleWording,legacyTraitsAuditIds} from '../tools/npc-profile-validation.mjs';
import {auditNpcDepth,runAudit} from '../tools/audit-npc-depth.mjs';
import {depthEntries,validateDraft} from '../tools/npc-depth-content.mjs';
import fs from 'node:fs/promises';

function fixture() {
 const person=(id,name,other)=>({id,name,tier:'full',traits:['守时','谨慎'],personality:{traits:['守时','谨慎']},
  knowledge:{known:[{fact:'春芽村告示规定集日禁止车马进入石桥。',source:'loc_village',reliability:'读过告示'},{fact:'去年替村里修过石桥。',source:id,reliability:'亲历'},{fact:'林舟曾帮忙核对桥头的木料账。',source:other,reliability:'亲历'}],unknown:['春芽村石桥缺口是否需要先补木板','林舟是否愿意到石桥核对账目']},
  goals:Object.fromEntries(['short','mid','long'].map(term=>[term,[{id:`${id}_${term}`,content:'补好石桥缺口',steps:[{content:'向林舟询问石桥旧木板的数量',status:'pending'}]}]])),
  voice:{register:'话语平缓，使用完整句子',habits:['开口先叫对方姓名']},relationships:[{with:other,type:'同村朋友',note:'雨后曾一起核对石桥木料账，对漏记一行仍有分歧。'}],
  memorySeeds:[{id:'memory_bridge',event:'雨后两人在石桥核对木料账，还没商定补桥次序。',knownBy:['npc_a','npc_b'],location:'loc_bridge',reliability:'亲历'}]});
 return {npcs:[person('npc_a','林舟','npc_b'),person('npc_b','江禾','npc_a')],residents:[],factionPeople:[],locations:[{id:'loc_village',name:'春芽村'},{id:'loc_bridge',name:'石桥'}]};
}
function rejects(mutate,code,field) {const world=fixture();mutate(world.npcs[0],world);const report=validateNpcDepth(world);assert.equal(report.ok,false);assert.ok(report.issues.some(x=>x.id==='npc_a'&&x.code===code&&(!field||x.field===field)),JSON.stringify(report.issues));}

test('完整人物独立门槛允许具体内容、世界内禁令事实，且只读',()=>{
 const world=fixture();world.npcs[0].knowledge.known[0].fact+='春芽村石桥暂无车辆通行许可。';world.npcs[0].relationships[0].note+='这些同村日常往来让两人记住了那张旧账页。';const before=structuredClone(world);assert.deepEqual(validateNpcDepth(world),{ok:true,checked:2,issues:[],errors:[]});assert.deepEqual(world,before);
});
test('六类缺口：已知事实不足或无他人地点事实',()=>{
 rejects(n=>{n.knowledge.known=n.knowledge.known.slice(0,1);},'known-count','knowledge.known');
 rejects(n=>{n.knowledge.known=['我常修木板','我常搬木料','我常检查绳结'].map(fact=>({fact,source:'npc_a',reliability:'亲历'}));},'known-other');
 rejects(n=>{n.knowledge.known[1]={...n.knowledge.known[0]};},'known-duplicate');
 rejects(n=>{n.knowledge.known[0].source='loc_missing';},'known-shape');
 rejects(n=>{n.knowledge.known[0].fact='待补充';},'known-shape');
});
test('六类缺口：unknown必须为具体事项，长占位也不能通过',()=>{
 rejects(n=>{n.knowledge.unknown=['本人未在场且无人实际转告的事，写得很长仍然没有具体事项'];},'unknown-specific');
 rejects(n=>{n.knowledge.unknown=[];},'unknown-specific');
 rejects(n=>{n.knowledge.unknown=['不知道的事'];},'unknown-specific');
});
test('六类缺口：目标步骤不得重述目标，三个期限逐一检查',()=>{
 for(const term of ['short','mid','long'])rejects(n=>{n.goals[term][0].steps[0].content='补好，石桥缺口。';},'goal-steps',`goals.${term}[0].steps[0].content`);
 rejects(n=>{n.goals.short[0].steps=[];},'goal-steps');
});
test('六类缺口：语域和第一说话习惯分开',()=>{
 rejects(n=>{n.voice.register='开口先叫，对方姓名。';},'voice-register','voice.register');
 rejects(n=>{n.voice.register='待扩充';},'voice-register');
});
test('六类缺口：共同记忆需要另一完整档同事件、知情者和兼容事实',()=>{
 rejects(n=>{n.memorySeeds[0].knownBy=['npc_a'];},'memory-shared','memorySeeds');
 rejects((n,w)=>{delete n.memorySeeds[0].id;delete w.npcs[1].memorySeeds[0].id;},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds=[];},'memory-shared');
 rejects(n=>{n.memorySeeds[0].knownBy.push('npc_missing');},'memory-reference');
 rejects((n,w)=>{w.npcs[1].tier='roster';},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds[0].location='loc_village';},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds[0].event='雨后两人在石桥核对木料账，已经商定补桥次序。';},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds[0].event='在春芽村送来一袋种子。';},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds[0].event='雨后在石桥送来一袋种子。';},'memory-shared');
 rejects((n,w)=>{w.npcs[1].memorySeeds[0].knownBy=['npc_b'];},'memory-shared');
 const world=fixture();world.npcs[1].memorySeeds[0].event='我和林舟雨后在石桥核对木料账，还没商定新的次序，我后来保留了账页。';assert.equal(validateNpcDepth(world).ok,true);
});
test('六类缺口：关系备注须有具体来由，不能重复关系标签',()=>{
 rejects(n=>{n.relationships[0].note='认识同村江禾，不因此知道对方秘密或财产。';},'relationship-note');
 rejects(n=>{n.relationships[0].note='关系良好';},'relationship-note');
 rejects(n=>{n.relationships[0].note='江禾为林舟的配偶；各自保有财物。';},'relationship-note');
});
test('L1禁止人物里的主持人指令，世界禁令和个人实际边界不误拒',()=>{
 for(const text of ['主持人不要让玩家知道木料账','玩家不能进入村里的禁区','禁止透露这条秘密','不要让江禾自动接受委托','不能凭空知道他人的钱物']) {
  const issues=findNpcRuleWording({id:'npc_a',knowledge:{known:[{fact:text}]}});assert.equal(issues.length,1,text);
 }
 for(const text of ['春芽村村规禁止在石桥生火。','巡守告示禁止夜间推车上石桥。','本人不许外人未经同意翻账页。','江禾昨天听守卫说，村里法令禁止把车停在石桥。'])assert.deepEqual(findNpcRuleWording({id:'npc_a',knowledge:{known:[{fact:text}]}}),[],text);
 assert.equal(findNpcRuleWording({id:'npc_a',knowledge:{known:[{fact:'村规禁止过桥，主持人不要让玩家查看账页。'}]}}).length,1);
 assert.equal(findNpcRuleWording({id:'npc_a',description:'不要让角色擅自学会法术'}).length,1);
});
test('人物定点润色L1使用相同规则检查，保持原审核候选可读',async()=>{
 const root='world/drafts/w1/yupo-depth',base=JSON.parse(await fs.readFile(`${root}/base.json`,'utf8')),entry=depthEntries(base)[0],draft=JSON.parse(await fs.readFile(`${root}/${entry.id}.json`,'utf8')).draft;
 assert.deepEqual(validateDraft(draft,entry).errors,[]);
 assert.ok(validateDraft(undefined,entry).errors.length,'坏结构仍按原合同返回errors而非抛出');
 const bad=structuredClone(draft);bad.memorySeeds.at(-1).event='主持人不要让玩家接触这段记忆。';assert.ok(validateDraft(bad,entry).errors.some(error=>error.includes('人物事实或设定')));
});
test('当前正式完整档仍有缺口，准确核验提交修复的17人traits',async()=>{
 const world=await loadWorld(),report=auditNpcDepth(world);
 assert.equal(report.checked,world.npcs.filter(n=>n.tier==='full').length);
 assert.equal(report.ok,false,'现有字段缺口须如实报告');
 assert.ok(report.issues.every(x=>x.id&&x.field&&x.code&&x.reason));
 assert.equal(report.legacyTraits.source,'1bc8f3b');assert.equal(report.legacyTraits.checked,17);assert.equal(report.legacyTraits.ok,true);
 assert.deepEqual(report.legacyTraits.rows.map(x=>x.id),[...legacyTraitsAuditIds]);
 assert.deepEqual(validateNpcProfiles(world),[],'原结构验证合同保留');
 const output=[];await runAudit({json:true,write:text=>output.push(text)});assert.equal(JSON.parse(output.join('')).issues.length,report.issues.length);
 const broken=structuredClone(world);broken.npcs.find(n=>n.id===legacyTraitsAuditIds[0]).traits=['待扩充'];assert.equal(auditNpcDepth(broken).legacyTraits.ok,false);
 broken.npcs.find(n=>n.id===legacyTraitsAuditIds[0]).traits=['冷淡'];assert.equal(auditNpcDepth(broken).legacyTraits.ok,false,'非占位漂移也应提示核查审核');
});
