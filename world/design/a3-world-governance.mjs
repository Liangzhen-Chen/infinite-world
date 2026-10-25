// A3 收口修复（fix3-world）：白石镇、河湾、环城的基层司法/治安/建房职位与猎户会。
// 本文件只列“要审批的事实”；不在加载世界时执行。条目先过 L1/L2/L4，再由发布步骤写入正式文件，
// 之后任何手改都会使 world/drafts/a3-world-approval 里的回执失效（见 tests/a3-world-approval.test.mjs）。
// 依据：05 §5.2.7（案件：报案/立案/拘禁/上诉/罚款入公库）、05 §5.3（组织可设职位表与代理）、
// regions.json 的垄渠郡/环城郡叙述、rules.json governance 里既有的村长/村管事职权、各人物 notes 里写明的职责。
export const revision = 'a3-world-approval-1';
export const draftRoot = 'world/drafts/a3-world-approval';

const WATCH = [[480, 720], [780, 1080]];   // 镇巡值房前厅 8–18 时，午间 12–13 时值更人回家
const OFFICE = [[480, 720], [780, 1020]];  // 白石镇公署前厅 8–17 时
const YP = '（world/geo/settlements.json#loc_bs 治理现状写明“镇长任命、税章和裁决权限待正式接入”，本批接入。）';

// ---- 新增人物：只有白石镇长一人确无合适现任者 ---------------------------------------------------
export const newPeople = [{
  id: 'npc_bs_townhead', name: '仲岳', aliases: ['白石镇长'], tier: 'roster', scope: 'loc_bs', culture: 'culture_river',
  age: 54, occupation: '白石镇长', location: 'loc_bs', coins: 0, inventory: {}, skills: [], services: [],
  flags: {minor: false, romanceable: false}, faction: 'faction_bs_government',
  notes: '白石镇公署首长，按镇长职权统管镇务，把受理、收款、羁押、拘捕和案件经办分给不同的人，自己不兼办。' +
    '来源：rules.governance.promotion（村长升镇后改称镇长，公款上限与税率上限随级别）与rules.governance.sovereignty（镇长任期三百六十日）。' +
    '姓名、年龄与履历为本次落实实体新增的成年任职事实。',
  schedule: {default: [
    {start: 0, end: 420, location: 'loc_bs', activity: '休息', services: []},
    {start: 420, end: 480, location: 'loc_bs', activity: '前往公署', services: []},
    {start: 480, end: 720, location: 'bld_bs_office', activity: '在公署处理镇务、听取受理与案情汇报', services: []},
    {start: 720, end: 780, location: 'loc_bs', activity: '午饭', services: []},
    {start: 780, end: 1020, location: 'bld_bs_office', activity: '在公署处理镇务、听取受理与案情汇报', services: []},
    {start: 1020, end: 1440, location: 'loc_bs', activity: '整理文书后休息', services: []},
  ]},
}];

// ---- 既有人物新增 faction 字段（归属事实）：只加字段，不动年龄、职业、作息 ------------------------------
export const personFields = [
  {id: 'patch_npc_bs_034_1_faction', subject: 'npc_bs_034_1', field: 'faction', value: 'faction_bs_government',
    source: {path: 'world/people/baseline.json#npc_bs_034_1', detail: '杜澄是白石镇公署递件人，职责是记录申请并约请相关人说明、不授予权利；公署前厅的受理登记是其日常。'}},
];

// ---- 新增组织（不含职位；职位逐条另审）---------------------------------------------------------------
const rep = (trusted, neutral, distrusted) => ({
  trusted: {minimum: 40, response: trusted}, neutral: {minimum: -19, response: neutral}, distrusted: {maximum: -20, response: distrusted}});
const clock = (id, name, trigger, effects, counterplay, execution) => ({id, name, intervalDays: 30, probability: 1, initialStage: 0, trigger,
  stageEffects: effects.map(([effect, requires], i) => ({stage: i + 1, effect, requires})), counterplay, execution});
function faction(f) {
  const row = {category: 'faction', aliases: [], culture: 'culture_river', region: '西陲河谷', foundedYear: -1, descriptionVisibility: 'gm_private', ...f};
  row.publicDescription = `${row.name}活动于${row.region}，公开目标是${row.publicGoal}。行事方式：${row.method}。可提供${row.offers}；${row.demands}。`;
  row.description = Object.values(row.prose).join('\n');
  return row;
}
export const newFactions = [
  faction({
    id: 'faction_bs_government', name: '白石镇镇务署', aliases: ['镇务署'], scope: 'loc_bs', kind: '地方官署', contactAnchor: 'loc_bs',
    contactMode: '公署前厅递件窗登记询问；不是镇长即时到场的承诺',
    leader: 'npc_bs_townhead', leaderTitle: '白石镇长', coreMembers: ['npc_bs_034_1'],
    resources: {treasuryCopper: 0, memberCount: 2, assets: '白石镇公署前厅与镇巡值房两处公共设施的治理责任',
      resourceScope: '0铜只表示本组织目录不开账；镇公款以rules.questSources.ledgers里loc_bs的开局公账为准，不由职位持有人私用。'},
    publicGoal: '受理镇内报案、上诉与索赔，登记公事，维持镇内治安与公共事务',
    privateGoal: '把受理、收款、羁押、拘捕和案件经办分开，避免一人兼理',
    method: '镇长统管镇务，各受理职位按职权分办，重案移交既有法庭',
    divisions: ['公署前厅受理上诉与索赔并保存原件', '镇巡值房受理报案、代收罚款并办理羁押与拘捕'],
    offers: '报案、上诉与索赔的受理登记，以及已生效罚款的代收',
    demands: '要求写明事由、当事人和凭据，受理不等于定罪、批准或放人',
    reputation: rep('可约请镇长，并查询既有受理事项的交接进度', '先登记事由与当事人', '先补可核对的凭据，既有受理按原范围核验'),
    relations: [{faction: 'faction_civiccourt', score: 10, reason: '重案移交既有法庭，镇公署只做受理、羁押候审和罚款代收'}],
    clock: clock('clock_bs_register', '受理事项核册', '收到写明事由与当事人的报案、上诉或索赔',
      [['受理人登记事由并保存原件', '已收到具名递件'], ['区分报案、上诉与索赔并交相应职位', '事由已有原文凭据'], ['重案移交既有法庭，其余按镇规办理', '受理职位已按职权登记']],
      '补充凭据或撤回自己的递件', '此处只记录行政流程，不据此自动定罪、拨款或放人。'),
    prose: {
      conduct: '白石镇公署前厅每日八时到十七时递件。杜澄和余绵按事项登记上诉与索赔的来件、保存原件；镇巡值房的值更人接报案、代收罚款、办羁押与拘捕，各管一摊，不互相代签。',
      internalLife: '仲岳任镇长，习惯把受理、收款、羁押、拘捕和案件经办分给不同的人，自己只在案情汇报时过问。重案按既有办法移交庭阶巡契署，镇里不自行加刑；镇公款的开支必须留账，他不自任自拨。',
      playerEncounter: '来客在公署前厅可递上诉与索赔，在镇巡值房前厅可报案、缴已生效的罚款。受理只是登记，不等于定罪、批准或放人；想见镇长须在公署办公时间约请，他不会为一句话改判或任命。'},
    references: ['culture_river', 'loc_bs', 'npc_bs_townhead', 'npc_bs_034_1', 'faction_civiccourt'],
  }),
];

// ---- 职位（逐条审批）-----------------------------------------------------------------------------
const office = (faction, id, name, holder, seat, operations, scope, limits, source, receptionHours) => ({
  faction, row: {id, name, holder, seat, authority: {operations, scope, limits}, source, ...(receptionHours ? {receptionHours} : {})}});
export const newOffices = [
  office('faction_bs_government', 'office_bs_town_head', '白石镇长', 'npc_bs_townhead', 'bld_bs_office',
    ['public_project', 'quest_publish', 'housing', 'tax', 'steward'], '镇公署首长',
    ['月度公款上限5000铜、税率上限百分之十（rules.governance.promotion）', '不替受理职位定罪、立案或放人', '任命与公款动用须留记录，不得自任自拨'],
    'rules.governance.promotion：村长升镇后改称镇长，职权沿村长（公共工程、委托、批宅基、税、派管事），公款与税率上限随级别；任期三百六十日见sovereignty。' + YP,
    OFFICE),
  office('faction_bs_government', 'office_bs_report_desk', '镇巡值房受理报案', 'npc_bs_031_2', 'bld_bs_watch',
    ['receive_report'], '受理报案',
    ['只登记报案人的原话与证据，不定罪、不立案、不私设罚金'],
    '05 §5.2.7：报案是动作，嫌疑记录不是案件，立案由受理职位持有人决定。姜绵的职责写明“接治安报失并保留原话；不定罪”，作息每日在镇巡值房。', WATCH),
  office('faction_bs_government', 'office_bs_fine_collector', '镇巡值房罚款代收', 'npc_bs_037_2', 'bld_bs_watch',
    ['collect_fine'], '罚款代收',
    ['只代收已生效判决所定的罚款，款项入镇公库，不入个人账户', '不得自行定罚或加罚'],
    '05 §5.2.7：罚款执行为 transfer 到公库。丁绵的职责写明“抄记本人已核清的时辰”，是值房里管记账的值更人，作息每日在镇巡值房，适合只代收既定罚款并入账。', WATCH),
  office('faction_bs_government', 'office_bs_custody_guard', '镇巡值房拘禁看守', 'npc_bs_038_1', 'bld_bs_watch',
    ['keep_custody'], '拘禁室看守',
    ['只看守依有效拘捕依据或判决羁押的人', '不得擅自放人或加刑；无依据放人按 offense:unlawful_release 论'],
    '05 §5.2.7：监禁为 move 到牢房并开立 guest_of{detained}，典狱职位 actedAs；放人无依据命中 offense:unlawful_release。沈澄的职责写明“定罪移交既有司法流程”，作息每日在镇巡值房。', WATCH),
  office('faction_bs_government', 'office_bs_case_handler', '镇巡值房案件经办', 'npc_bs_035_1', 'bld_bs_watch',
    ['handle_case'], '案件经办',
    ['依证据评分决定是否立案并推进阶段', '重案移交既有法庭，不自行加刑'],
    '05 §5.2.7：立案由受理职位持有人读证据初评决定，是裁量与腐败的落点。钱澄的职责是分记报失人、物品特征与发现时地，作息每日在镇巡值房。', WATCH),
  office('faction_bs_government', 'office_bs_arrest_officer', '镇巡值房拘捕执行', 'npc_bs_034_2', 'bld_bs_watch',
    ['execute_arrest'], '拘捕执行',
    ['凭有效拘捕依据当面羁押，无依据不得拘人', '羁押后交拘禁看守，不自行处置'],
    '05 §5.2.7：缉捕/通缉后以 move 加 holding.open(guest_of{detained}) 执行；无权者开立同样成立但标 authority:none 并按罪名表论处。杜绵的职责写明“记录堵道地点与目击者；不没收摊货”，作息每日在镇巡值房。', WATCH),
  office('faction_bs_government', 'office_bs_appeal_desk', '白石镇公署受理上诉', 'npc_bs_034_1', 'bld_bs_office',
    ['receive_appeal'], '受理上诉',
    ['只登记上诉并保存新证据原件，转交上审，不改判'],
    '05 §5.2.7：上诉是阶段，新证据（收据等文书）在上诉审进入证据评分。杜澄的职责写明“记录申请并约请相关人说明；不授予权利”，作息每日在bld_bs_office，适合只登记转交、不改判。', OFFICE),
  office('faction_bs_government', 'office_bs_claim_desk', '白石镇公署受理索赔', 'npc_bs_033_2', 'bld_bs_office',
    ['receive_claim'], '受理索赔',
    ['只受理索赔并保存运单、交接凭据，不裁定赔付'],
    '05 §5.2.7：民事争议含货损索赔，由受理职位收件，判决另行作出。余绵的职责写明“收录申请，记清位置、申请人和待核项目；不批准施工或支出”，在公署前厅收件登记，作息每日在bld_bs_office。', OFFICE),
];

// ---- 其他条目 ---------------------------------------------------------------------------------------
export const roomPatch = {
  id: 'patch_bld_bs_watch_rooms', subject: 'bld_bs_watch', field: 'rooms',
  addRoom: {id: 'room_bs_watch_lockup', name: '拘禁室', purpose: '短期羁押候审或候押', access: '仅看守与经办人员进出；探视另须许可'},
  source: {path: 'world/meta/rules.json#law.codes.*.maximumDetentionMinutes', detail: '本地法典均有一日以内的羁押上限；镇巡值房已有“内室”且不授予外人执法权，拘禁看守职位需要一处实际的拘禁地点。'},
};
export const settlementHead = {
  id: 'patch_loc_bs_governance', subject: 'loc_bs',
  before: {head: null, enforcers: [], authority: '本卡登记官署职责和联络人员，未授予名册居民可执行官职；镇长任命、税章和裁决权限待正式接入。'},
  head: 'npc_bs_townhead', enforcers: ['npc_bs_034_2'],
  authority: '镇长按镇长职权统管镇务；镇巡值房的受理、收款、羁押、拘捕与案件经办分由不同职位办理，名册居民不因职业而获得未列明的执行权。',
  source: {path: 'world/geo/settlements.json#loc_bs.details.governance', detail: '原文“镇长任命、税章和裁决权限待正式接入”，head 为空；四村的 details.governance 以 head/enforcers 登记首长与执行人。本批接入镇长与拘捕执行人。'},
};

export const sourceOfFaction = f => ({path: 'world/lore/factions.json', detail: f.publicDescription});
export const boundary = {
  person: '只登记任职事实；不预置现金、库存、服务或学员，不补历史财产。',
  personField: '只加 faction 字段，不改该人物的年龄、职业、作息与其他字段。',
  faction: '组织目录不开账：0铜不表示公款为空；职位另行逐条审批，组织本身不附送任何职位权能。',
  office: '职位只授予所列受理/执行职权，不附送组织资产代表权，也不替裁判者定罪或定刑；持有人的作息与住处不变。',
  patch: '只补该字段，不改该地点其余字段与其他人物。',
};
