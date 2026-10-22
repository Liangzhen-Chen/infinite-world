// A3 收口修复：补齐 A3-内容1/2 及后续卡已写入世界文件、但当时没有 L1/L2/L4 回执的条目。
// 本文件只列“要审批的事实”（纠正项、定点补丁、来源与边界）；不在加载世界时执行。
// 条目的行取自正式世界文件的当前值，再叠加 corrections；草稿冻结后，世界文件里的行一旦被手改，
// 发布前核对（verifyPublished）会因指纹或行不符而失败。
export const revision = 'a3-content-approval-1';
export const draftRoot = 'world/drafts/a3-content-approval';

// 纠正：先改条目、重新审批，再由发布步骤写入正式文件。
export const corrections = {
  office_exam_life_6: {
    field: 'seat', before: 'bld_bs_guild', value: 'bld_hw_mill',
    reason: '考官尹葛住在河湾（bld_hw_home_22），工作地点是旧磨坊（bld_hw_mill，设有公共木作台）。' +
      '原席位在二十余公里外的白石行会，等于每天跨聚落接待；改在他自己的工作地点。',
  },
};

// 已发布地点上新增的字段（原条目没有这些字段）。
export const patches = [
  {id: 'patch_loc_hw_northwood_site', subject: 'loc_hw_northwood', field: 'site',
    source: {path: 'world/geo/locations.json#loc_hw_northwood', detail: '北林边是河湾的林缘采集处；药草采集资源点登记在该地点。'}},
  {id: 'patch_loc_hw_gate_notices', subject: 'loc_hw_gate', field: 'notices',
    source: {path: 'world/geo/locations.json#loc_hw_gate', detail: '村口公示，署名为河湾村居民陈柏；只提示传闻来源须核对。'}},
  {id: 'patch_bld_hw_qingdeng_publicConversations', subject: 'bld_hw_qingdeng', field: 'publicConversations',
    source: {path: 'world/geo/locations.json#bld_hw_qingdeng', detail: '酒馆主人林穗在酒馆里公开讲述一条已发布的传闻。'}},
  {id: 'patch_bld_hw_school_site', subject: 'bld_hw_school', field: 'site',
    source: {path: 'world/geo/locations.json#bld_hw_school', detail: '小学堂的学塾设施已登记在陆青名下；site.manager 与之一致。'}},
];

export const isNewPerson = id => /^npc_a3_exam_|^npc_hc_/.test(id);
export const sourceOf = (kind, row) => ({
  person: {path: 'world/people/baseline.json', detail: row.authoredFacts?.origin ?? row.notes, authorization: 'A3-内容2用户授权新增'},
  faction: {path: 'world/lore/factions.json', detail: '环城郡署，最小可执行官署：两名现任与公共设施。', authorization: 'A3-内容2用户授权落实'},
  office: {path: 'world/lore/factions.json', detail: row.source},
  location: {path: 'world/geo/locations.json', detail: row.authoredFacts?.ownershipBasis ?? row.description, authorization: 'A3-内容2用户授权落实'},
  route: {path: 'world/geo/routes.json', detail: '环城城墙/石城门与环城本体同点，零距离步行连接。'},
})[kind];
export const boundaryOf = kind => ({
  person: '只登记任职/名册事实；不预置学员通过、不补历史财产、库存或服务；考官资格由职位派生。',
  faction: '官署只登记两名现任与公共设施；0 铜不表示历史税收、原存档或官仓账已结清。',
  office: '职位只授予认证职权；考官席位须与其居住聚落一致；不附送组织资产代表权。',
  location: '公共设施归属组织；公共通行不含拆改、取料或施工许可。',
  route: '同点零距离连接，不引入新通行规则。',
  patch: '只补该字段，不改该地点其余字段与其他人物。',
})[kind];
