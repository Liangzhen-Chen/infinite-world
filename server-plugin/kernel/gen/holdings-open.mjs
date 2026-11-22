// 开局建筑归属（卷十 R10-3.9 ownerRef、卷六 §4.1 规则 5 :370 / §4.18 规则 2 :1078 / §4.22 规则 3：开局建筑的所有权份额以 src_genesis 记到 ownerRef 名下，
// 账本分录是唯一存储，卷十八的"所有"持有边是它的只读投影，本文件不写持有边）。生成阶段 gstage_holdings（gen/worldgen.mjs 登记）的生成器。
// 本文件是纯函数：对每栋建筑（按 id 升序）推 ownerRef，交出"开局入账提案"（entries）与缺口清单（gaps）；入账由 gen/assetcalls.mjs 经账本唯一写入口做。
// 推法对所有建筑行同一条，不按 id、名字、聚落特判；手写优先、生成补缺（卷十 R10-1.7），推不出就记缺口，不编：
//   ① 作者覆盖：作者写了 owner，且能指到已载入的组织或人物 → 就是它；指到地点 → 取该地点的统治组织 governorOf（卷八 R8-5.1）；
//      指不到（派系 id、不存在的 id、没有统治组织的地点、不是持有种类的实体）→ 作者值不采用，按下面 ②③ 推，并在结果里带 ignoredOwner 列出；
//   ② 住处（意图是 rules.gen.dwellingIntendedType，卷十 R10-7.2 ④）：资产持有者是家户（李白 11-24 H-1：居民聚合体只是卷二十七统计层从家户汇总出来的数，不持有资产；卷十勘误 1124k20），
//      住处归"驻地就是这栋"的家户组织行（家户是组织行，卷十八 :27、:1515；卷六 :642 个体层取家户）；恰一户才成立，零户、多户都记缺口；不需要聚落组织；
//   ③ 其余建筑照卷六 §4.1 规则 11 :642 的 ownerRef 三步：先定管辖的聚落组织（从建筑所在地点起沿包含树向上，取第一个有聚落组织的站点）；
//      再读该聚落组织的保有方式 tenure：归组织公有 → 该组织（卷八 :260 村社）；归上级 → 该组织在卷八隶属关系上的上级组织；
//      归户 → :642 要"对所需服务有效技能最高、且尚无同类设施的家户"，技能数据现在没有，记缺口（不再退回聚合体：聚合体不持有资产，H-1）；保有方式不是这三项之一 → 缺口。
//      沿包含树找不到聚落组织时分两类缺口：不在任何站点之下（卷六 :642 要按 reachOf 退回，reachOf 未建）与站点之上都没有聚落组织。
// 输入形状不合、特殊值（空串 owner、重复 id 等）一律拒收报错，不静默按空处理。不读 state、墙钟，不用 Math.*。

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** 缺口原因代号（本文件唯一定义；报缺口与测试都引用）。 */
export const GAP = Object.freeze({
  noSiteAbove: 'gap_no_site_above', // 不在任何站点之下（卷六 :642 要按 reachOf 退回，reachOf 未建）
  noSettlementOrg: 'gap_no_settlement_org', // 站点之上都没有聚落组织
  tenureUnknown: 'gap_tenure_unknown', // 聚落组织的保有方式读不到或不是三项之一
  tenureHousehold: 'gap_tenure_household_skill', // 归户：要有效技能最高的家户，技能数据未建
  noHousehold: 'gap_no_household', // 住处，但没有驻地就是这栋的家户行
  householdAmbiguous: 'gap_household_ambiguous', // 住处，驻地就是这栋的家户不止一户
  noSuperior: 'gap_no_superior_org', // 归上级但该组织没有上级组织
});

/** 来路代号（entries 里 via 的取值）。 */
export const VIA = Object.freeze({
  author: 'via_author', authorPlaceGovernor: 'via_author_place_governor', dwellingHousehold: 'via_dwelling_household',
  tenureCommon: 'via_tenure_common', tenureSuperior: 'via_tenure_superior',
});

/**
 * @param {{
 *   buildings: ReadonlyArray<{id: string, intendedType?: string | null, owner?: string | null}>,
 *   dwellingType: string,
 *   tenureModes: {common: string, household: string, superior: string},
 *   placeKind: string,
 *   kindOf: (id: string) => string | null,
 *   holderKinds: ReadonlySet<string> | ReadonlyArray<string>,
 *   governorOf: (placeId: string) => string | null,
 *   placeChain: (placeId: string) => ReadonlyArray<string>,
 *   isSite: ((placeId: string) => boolean) | undefined,
 *   settlementOrgAt: (placeId: string) => string | null,
 *   tenureOf: (orgId: string) => string | null,
 *   parentOrgOf: (orgId: string) => string | null,
 *   householdsAt: (placeId: string) => ReadonlyArray<string>
 * }} ctx
 *   dwellingType：规则表 rules.gen.dwellingIntendedType（卷十 :185）；tenureModes：规则表 rules.gen.tenureModes（保有方式封闭三项，卷八 :1535）；
 *   placeKind：地点实体的 kind；kindOf：已载入实体的 kind（不是实体为 null）；holderKinds：能持有建筑份额的实体 kind（人物与组织）；
 *   placeChain：地点自己起沿包含树向上的 id 表；isSite：该地点是不是站点（卷五 §4.6 站点类型条目；世界里没有这条产出时交 undefined，两类缺口并成"站点之上都没有聚落组织"）；
 *   settlementOrgAt：该地点上的聚落组织（卷八 orgkind 条目 settlement 为真、驻地就是它；没有为 null）；tenureOf、parentOrgOf：组织行的 tenure、parent 维度；
 *   householdsAt：驻地就是该地点的家户组织行（orgTraits 里 domestic 为真的组织，卷十八 :239）。
 * @returns {{entries: Array<{building: string, owner: string, via: string, ignoredOwner?: string}>, gaps: Array<{building: string, reason: string, candidates: string[], ignoredOwner?: string}>}}
 */
export function genOpeningAssets(ctx) {
  const holders = new Set(ctx.holderKinds);
  if (holders.size === 0) throw new TypeError('genOpeningAssets: holderKinds is empty (no kind can hold a building share)');
  if (!isStr(ctx.placeKind)) throw new TypeError('genOpeningAssets: placeKind is the entity kind of places');
  if (!isStr(ctx.dwellingType)) throw new TypeError('genOpeningAssets: dwellingType (rules.gen.dwellingIntendedType) is a non-empty string');
  const modes = ctx.tenureModes;
  if (!(modes && isStr(modes.common) && isStr(modes.household) && isStr(modes.superior))) throw new TypeError('genOpeningAssets: tenureModes (rules.gen.tenureModes) is {common, household, superior}');
  const entries = [];
  const gaps = [];
  const seen = new Set();

  for (const b of [...ctx.buildings].sort((x, y) => cmp(x.id, y.id))) {
    if (!isStr(b.id) || seen.has(b.id)) throw new TypeError(`genOpeningAssets: building id ${JSON.stringify(b.id)} is not a unique non-empty string`);
    seen.add(b.id);
    if (b.owner !== undefined && b.owner !== null && !isStr(b.owner)) throw new TypeError(`genOpeningAssets: ${b.id}: owner is null or a non-empty string`);
    if (b.intendedType !== undefined && b.intendedType !== null && !isStr(b.intendedType)) throw new TypeError(`genOpeningAssets: ${b.id}: intendedType is null or a non-empty string`);
    let ignored; // 作者值没被采用时记在结果里
    const hold = (owner, via) => entries.push({ building: b.id, owner, via, ...(ignored === undefined ? {} : { ignoredOwner: ignored }) });
    const gap = (reason, candidates = []) => gaps.push({ building: b.id, reason, candidates, ...(ignored === undefined ? {} : { ignoredOwner: ignored }) });

    // ① 作者覆盖
    if (isStr(b.owner)) {
      const kind = ctx.kindOf(b.owner);
      if (kind === ctx.placeKind) {
        const org = ctx.governorOf(b.owner);
        if (isStr(org) && holders.has(ctx.kindOf(org))) { hold(org, VIA.authorPlaceGovernor); continue; }
      } else if (kind !== null && holders.has(kind)) { hold(b.owner, VIA.author); continue; }
      ignored = b.owner;
    }

    // ② 住处归住在其中的家户（H-1），不经聚落组织
    if (b.intendedType === ctx.dwellingType) {
      const homes = [...ctx.householdsAt(b.id)].sort(cmp);
      if (homes.length === 0) { gap(GAP.noHousehold); continue; }
      if (homes.length > 1) { gap(GAP.householdAmbiguous, homes); continue; }
      hold(homes[0], VIA.dwellingHousehold);
      continue;
    }

    // ③ 管辖的聚落组织与站点（卷六 :642 第一步）
    const chain = ctx.placeChain(b.id);
    const site = chain.find((p) => isStr(ctx.settlementOrgAt(p)));
    if (site === undefined) {
      gap(typeof ctx.isSite === 'function' && !chain.some((p) => ctx.isSite(p)) ? GAP.noSiteAbove : GAP.noSettlementOrg);
      continue;
    }
    const org = ctx.settlementOrgAt(site);

    // 保有方式（卷六 :642 第二步）
    const tenure = ctx.tenureOf(org);
    if (tenure === modes.common) { hold(org, VIA.tenureCommon); continue; }
    if (tenure === modes.household) { gap(GAP.tenureHousehold, [org]); continue; }
    if (tenure === modes.superior) {
      const up = ctx.parentOrgOf(org);
      if (!isStr(up)) { gap(GAP.noSuperior, [org]); continue; }
      hold(up, VIA.tenureSuperior);
      continue;
    }
    gap(GAP.tenureUnknown, [org]);
  }
  return { entries, gaps };
}
