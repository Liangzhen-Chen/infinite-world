import test from 'node:test';
import assert from 'node:assert/strict';
import festivals,{festivalCalendar} from '../world/design/w5-festivals.mjs';
import {validateSkeletons,validateDraft,validateCandidate,contextFor,buildDraftRequest} from '../tools/w5-festivals.mjs';
test('24节日覆盖10文化12神祇，日期和资源引用闭合',()=>{
 assert.equal(festivals.length,24);assert.equal(new Set(festivals.map(x=>x.culture)).size,10);assert.equal(new Set(festivals.map(x=>x.deity)).size,12);assert.deepEqual(validateSkeletons(),[]);
 assert.deepEqual(festivalCalendar.marketDays,[5,15,25]);for(const row of festivals)assert.equal(contextFor(row).length,row.references.length);
});
test('日期不能变为31日或误报集市日，材料不得凭空生成',()=>{
 const rows=structuredClone(festivals);rows[0].calendar.day=31;rows[1].calendar.marketDay=true;rows[2].resourceNeeds[0].item='item_missing';const errors=validateSkeletons(rows);assert.ok(errors.includes(`${rows[0].id}:历法错误`));assert.ok(errors.includes(`${rows[1].id}:历法错误`));assert.ok(errors.includes(`${rows[2].id}:材料或所有权错误`));
});
test('远方会场没有旅行坐标，活动条件和自愿资源保留',()=>{
 assert.equal(festivals.filter(x=>x.venue.location===null).length,20);
 for(const row of festivals){assert.ok(row.condition);assert.ok(row.permission);assert.equal(row.runtime.effects.length,0);assert.match(row.resourceNeeds[0].source,/自有且同意/);}
 const rows=structuredClone(festivals);rows[8].venue.precision='existing_location';rows[0].runtime.effects=[{coins:10}];assert.equal(validateSkeletons(rows).length,2);
});
test('模型调用仅允许单条三段正文，L1拒绝错误时长与收费',()=>{
 const row=festivals[0];const request=buildDraftRequest(row,[],contextFor(row));assert.equal(request.tool_choice.function.name,'submit_entry');assert.deepEqual(request.tools[0].function.parameters.properties.id.enum,[row.id]);
 const draft={id:row.id,prose:{customScene:'共同吃饭。',participationScene:'旁听三铜，活动持续十五分钟。',tensionScene:'争议仍需相邻户议事。'}};
 assert.ok(validateDraft(draft,row).errors.includes('中文入场费与骨架不符'));assert.ok(validateDraft(draft,row).errors.includes('中文时长与骨架不符'));
 draft.prose.participationScene='2月1日举办，持续15分钟。';assert.ok(validateDraft(draft,row).errors.includes('日期与骨架不符'));
 draft.prose.participationScene='春历二月廿五日举办。';assert.ok(validateDraft(draft,row).errors.includes('中文日期与骨架不符'));
});
test('未批准或缺失候选不伪装成完整节日目录',()=>{assert.deepEqual(validateCandidate({festivals:[]}),['候选结构或数量错误']);});
