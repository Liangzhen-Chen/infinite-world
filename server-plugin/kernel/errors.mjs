// 错误：错误码登记 + 日志出口 + 内核拒写错误（S1-1 卡 A 合并：原 error-codes.mjs、report.mjs 并入本文件）。
// 三部分：① 错误码登记（卷二 §4.3 + 各卷自己的错误码表，卷十二 R12-5.7）；② kernelApi `report(code, fields)` 与控制台/文件出口；
// ③ kernelApi `reportError` 与 KernelError（§2.6"事务内拒写的处置"）。
// 错误码文法（卷二 §4.2）的定义与判定在 kernel/handles.mjs#isErrorCode（本文件只登记码与出处）。

import { appendFileSync } from 'node:fs';
import { errorCodeOf, HandleError, CODE_RE } from './handles.mjs';

// 错误码登记（机读）：卷二 §4.3 错误码表，加各卷自己的错误码表（卷十二 R12-5.7）。
// 卷二 §1.9 :282 error_code 是"代码内封闭枚举"；本文件是它的唯一来源，转录自卷文，运行时不解析 markdown。
// 每项只含码与出处（来源卷与节）；说明文字留在卷文。同一码被多卷表列出时 sources 记全部出处，不裁定以哪处为准。
// 不收：卷二 §4.3 :1555 与卷十一 §2.7 的 E-MIG-* 一组（块 2 体检 K2-49 作废，只服务迁移卡账）。
// 卷三甲的七码登在卷二 §4.3（卷三甲 :982），卷二十有自己的"附 本卷错误码表"（李白 11-17 裁定，勘误 1117ec20）。
// 不收：各卷已删的旧码与前缀写法（E-DEITY-CAP、E-ACT-AUTHORITY、E-ACT-DUPLICATE、E-EVT-NOEVENT、E-EVT-PACE、E-DIM-EXTEND-ON-INSTANCE、E-NAME-BLOCKLIST、E-PACK-PATCH-* 等缩写）。

const V2 = 'vol2.s4.3';

// [来源卷与节, 该表登记的码]。卷二 §4.3 表里的 `-ENUM` 一类缩写已按卷文展开成全码。
/** @type {readonly (readonly [string, readonly string[]])[]} */
const GROUPS = [
  [V2, [
    'E-DIM-SCHEMA-KIND', 'E-DIM-SCHEMA-NAMESPACE', 'E-DIM-SCHEMA-VERSION', 'E-DIM-SCHEMA-TYPE', 'E-DIM-SCHEMA-PRECISION', 'E-DIM-BEHAVIOR-UNKNOWN',
    'E-DIM-DUPLICATE-KEY', 'E-DIM-ID-FORMAT', 'E-DIM-ID-DUPLICATE',
    'E-DIM-UNIT-UNKNOWN', 'W-DIM-UNIT-DIM',
    'E-DIM-DOMAIN-RANGE', 'E-DIM-DOMAIN-ENUM', 'E-DIM-DOMAIN-SIZE', 'E-DIM-DOMAIN-CURVE', 'E-DIM-STRUCT-FIELD', 'E-DIM-REF-DIM',
    'E-DIM-ONUNKNOWN-MISSING', 'E-DIM-UNKNOWN-READ',
    'E-DIM-MAP-SPARSE-NONSUM',
    'E-STATE-MULTI-WRITER',
    'E-DIM-DERIVED-WRITTEN', 'E-DIM-DERIVED-VAR', 'E-DIM-DERIVED-CYCLE', 'E-DIM-DERIVED-RECURSIVE',
    'E-DIM-MODIFIABLE-TYPE',
    'E-DIM-SAMPLE-DOMAIN', 'E-DIM-SAMPLE-PARAM', 'E-DIM-SAMPLE-WEIGHTS', 'E-DIM-SAMPLE-CORR', 'E-DIM-SAMPLE-DERIVED',
    'E-DIM-EXTENDS-TARGET', 'E-DIM-EXTEND-CONFLICT', 'E-DIM-EXTEND-NOPARENT', 'E-DIM-EXTEND-ON-OVERRIDE', 'E-DIM-CYCLE',
    'E-DIM-STRING-NOT-DISPLAY', 'E-DIM-UNION-NONE', 'E-DIM-UNION-AMBIGUOUS', 'E-DIM-UNION-SHAPE',
    'E-DIM-VOCAB-PREFIX',
    'E-DIM-DERIVED-CONFLICT',
    'E-DIM-INVARIANT-DOCTRINE-GROUP',
    'E-I18N-LABEL-MISSING', 'E-I18N-LABEL-NUMERIC', 'E-I18N-BLOCKLIST',
    'E-GROUP-SIZE', 'E-GROUP-OVERLAP',
    'E-FILE-UNASSIGNED', 'E-I18N-REDACT-HIT',
    'E-INPUT-FUZZY', 'E-INPUT-DEFAULT', 'E-INPUT-NORMALIZE-SCATTER', 'E-GATE-FUZZY',
    'E-TEXT-UNGATED', 'E-PATH-UNDECLARED', 'E-PATH-OVERLAP', 'E-PATH-NAME-CLASH', 'E-PATH-SEGMENT-GRAMMAR', 'E-PATH-KEYKINDS', 'E-WRITER-MISSING', 'E-WRITER-DUPLICATE', 'E-DIGEST-EXCLUDE-DRIFT', 'E-KERNEL-UPWARD-IMPORT', 'E-KERNEL-ONLY',
    'E-TSC-ESCAPE-ANY', 'E-TSC-ESCAPE-ASSERT', 'E-TSC-ESCAPE-DIRECTIVE', 'E-TSC-PARSE', 'E-TSC-CATCH-NARROW', 'E-TSC-COVERAGE',
    'E-TEXTCORE-IMPORT', 'E-SEAL-READ', 'E-SEAL-DIGEST', 'E-TEXT-EXIT', 'E-GLOBAL-UNLISTED',
    'E-I18N-BLOCKLIST-UNNORMALIZED',
    'E-PROC-IMPORT', 'E-WIRE-ENVELOPE', 'E-WIRE-REPLY', 'E-TERM-RESIDUE',
    'E-TERM-REVIVE-DENIED', 'E-TERM-RECORD-UNLISTED',
    'E-ADMIT-CAUSE',
    'E-RELOC-TARGET', 'E-RELOC-FIELDS',
    'E-GRID-FOOTPRINT-OUTSIDE-PARENT', 'E-GRID-SIBLING-OVERLAP', 'E-GRID-SEED-SAME-CELL', 'E-GRID-WATERWAY-NO-CHANNEL', 'E-GRID-VOLUME-TOP-EXPOSED', 'E-GRID-CELL-NO-TERRAIN', 'E-GRID-PATH-OVER-CAP', 'E-GRID-STOCK-OVER-CAP', 'E-GRID-WATER-BAND',
    'E-SAVE-WRITE-FAIL', 'E-SAVE-IMPORT-SIZE', 'E-SAVE-SLOT-INVALID', 'E-SAVE-EMPTY',
    'E-SAVE-RULES-MISMATCH', 'E-SAVE-SHARD-DIGEST', 'E-SAVE-TORN',
    'E-DIM-CLASS-UNKNOWN', 'E-DIM-ABSTRACT-IN-PRECEDENCE', 'E-DIM-PRECEDENCE-UNKNOWN', 'E-DIM-PRECEDENCE-GROUP', 'E-DIM-PRECEDENCE-BROADER', 'W-DIM-PRECEDENCE-TIE',
    'E-DIM-REF-MISSING', 'E-DIM-VOCAB-FIELD', 'E-DIM-NAMESPACE-OVERRIDE', 'E-DIM-REQ-CYCLE',
    'E-DIM-REQUIRED-MISSING', 'E-DIM-INSTANCE-BASIS', 'E-DIM-SOURCE-MISMATCH', 'E-DIM-SOURCE-PLACEHOLDER', 'E-DIM-MEMBER-DEVIATION',
    'E-DIM-COMPONENT-REQUIRES', 'E-DIM-COMPONENT-ENABLES', 'E-DIM-COMPONENT-CONFLICT', 'E-DIM-COMPONENT-TABLE',
    'E-KIN-ORG-TRAITS', 'E-HK-ROW-FIELDS',
    'E-HK-UNREGISTERED', 'E-HK-HYPER', 'E-HK-PROTOCOL', 'E-HK-END-TYPE', 'E-HK-SUCCEED-SOURCE', 'E-HK-HOLDER-MAX', 'E-HK-HOLD-WHILE', 'E-HK-CAPACITY',
    'E-REL-INTIMATE-MINOR', 'E-REL-MINOR-LOAD', 'E-REL-REWRITE', 'E-REL-INTIMATE-FIELD', 'E-REL-SOCIAL-FIELDS', 'E-REL-KIND', 'E-REL-CONSENT',
    'E-KIN-DESCENT-TRAITS', 'E-KIN-REGIME-AGE', 'E-KIN-CYCLE', 'E-STANCE-BYPASS', 'E-STANCE-SOURCE', 'E-ESTEEM-UNSOURCED', 'E-SOC-TEXT',
    'E-PERSON-CULTURE-MISSING',
    'E-DIM-INVARIANT-MASS-VOLUME', 'E-DIM-INVARIANT-PORTION-SUM', 'E-DIM-INVARIANT-SEVERITY-ORDER',
    'E-MOD-KEY-UNREGISTERED', 'E-MOD-STAGE', 'E-MOD-SCOPE', 'E-MOD-STACKING', 'E-MOD-BOUNDS', 'E-MOD-BUDGET', 'E-MOD-RX', 'E-MOD-SLOT-DUPLICATE',
    'E-RX-NS-UNKNOWN',
    'E-RULES-UNREGISTERED',
    'E-KEYID-WIDTH',
    'E-GEN-STAGE-UNKNOWN', 'E-GEN-STAGE-CYCLE', 'E-GEN-ROW-INVALID', 'E-GEN-OVERRIDE-AUTHORED', 'E-GEN-BYPASS', 'E-GEN-BRANCH-ORIGIN', 'E-GEN-ID-COLLISION', 'E-GEN-SKELETON',
    'E-GEN-REJECT', 'E-GEN-NAME-EMPTY', 'E-GEN-GROUP-ROW', 'E-GEN-GROUP-CYCLE', 'E-GEN-LATE-SOURCE', 'E-GEN-MANIFEST-DRIFT', 'E-GEN-DEFAULT', 'E-GEN-NOT-MATERIALIZED', 'E-GEN-RESPECT',
    'E-I18N-LOCALE', 'E-I18N-LABEL-ORPHAN', 'E-I18N-LABEL-FOREIGN', 'E-I18N-FORM', 'E-I18N-TPL-MISSING', 'E-I18N-TPL-SLOT', 'E-I18N-PLURAL',
    'E-TPL-KEY', 'E-TPL-NO-FALLBACK', 'E-TPL-CYCLE', 'E-TPL-RX', 'E-PANEL-SOURCE', 'E-PANEL-PATH', 'E-PANEL-KIND', 'E-PANEL-ACTION', 'E-MAP-COMPASS', 'E-AV-KEY', 'E-AV-NO-DEFAULT',
    'E-DISPLAY-LITERAL', 'E-DISPLAY-BRANCH-TEXT', 'E-DISPLAY-LOCALE-BRANCH', 'E-DISPLAY-BACKFLOW', 'E-DISPLAY-DICE', 'E-DISPLAY-UNSEEN', 'E-DISPLAY-SUBJECT', 'E-DISPLAY-HOST-CHAT',
    'E-BST-TIER-ROWS', 'E-BST-QUOTA', 'E-BST-WARD-SHAPE', 'E-BST-BANE-CLASH', 'E-BST-BODY-WRITE', 'E-BST-MONSTER-SCHEMA', 'E-BST-LORE-SHAPE', 'E-BST-SIM-DIMS',
    'E-BST-DUPLICATE', 'E-BST-VARIANT', 'E-BST-GEN-SLOT', 'E-BST-LAIR', 'E-BST-TRANSFORM-ROWS',
    'E-ACC-ITEM-UNREGISTERED', 'E-ACC-ITEM-ORPHAN', 'E-ACC-ITEM-COUNT', 'E-ACC-ITEM-FORM', 'E-ACC-ITEM-PARAM', 'E-ACC-ITEM-UNIMPLEMENTED', 'E-ACC-CODE-UNLISTED',
    'E-ACC-SCAN-NAMELIST', 'E-ACC-SCAN-SELFNAME', 'E-ACC-BASELINE-UP', 'E-ACC-BASELINE-EDIT', 'E-ACC-ROWKEY-DRIFT', 'E-ACC-NEWROW-UNANCHORED', 'E-ACC-ITEM-DOWNGRADE',
    'E-ACC-HIT-OPEN', 'E-ACC-REVIEW-MISSING', 'E-ACC-REVIEW-STALE', 'E-ACC-REVIEW-SELF', 'E-ACC-REVIEW-VETO', 'E-ACC-REVIEW-CHECKLIST', 'E-ACC-GATE-BYPASS', 'E-ACC-RUN-UNBOUND',
    'E-ACC-REPORT-FORM', 'E-ACC-COMMIT-MSG', 'E-ACC-EXT-CODE-CHANGED', 'E-ACC-EXT-EXISTING-ROW', 'E-ACC-FIXTURE-INSTANCE', 'E-ACC-ZERO-MISMATCH', 'E-ACC-BYPASS-REGRESSION',
    'E-ACC-CRITERION-LOOSENED', 'E-ACC-CRITERION-UNVERSIONED', 'E-ACC-DOC-SEAL', 'E-ACC-REQUIRED-TEST',
    'E-EFF-FAMILY-UNKNOWN', 'E-EFF-OUTPUT', 'E-EFF-PRIMITIVE', 'E-EFF-RX', 'E-EFF-PARAM', 'E-EFF-CONSENT',
    'E-VIEW-BYPASS', 'E-VIEW-BYPASS-CATALOG', 'E-VIEW-TEXT-MATCH', 'E-VIEW-DISPLAY-READ', 'E-VIEW-LABEL-READ', 'E-VIEW-FALLBACK', 'E-VIEW-PREDICATE-LOCAL', 'E-VIEW-ID-PARSE',
    'E-VIEW-UNDECLARED-READ', 'E-VIEW-UNDECLARED-WRITE', 'E-VIEW-DEPS-CYCLE', 'E-VIEW-DYNAMIC-STATE', 'E-VIEW-INPUT-IMPORT', 'E-VIEW-FAMILY-MISMATCH', 'E-VIEW-FAMILY-UNRESOLVED',
    'E-VIEW-NAME-RESEED', 'W-VIEW-OVERDECLARED',
    'E-PHASE-DUPLICATE', 'E-PHASE-HOOK-DUPLICATE', 'E-PHASE-SORTKEY-ORDER', 'E-PHASE-SORTKEY-DRIFT', 'E-SEED-KEY',
    'W-DIM-SOURCE', 'W-MOD-UNKNOWN-BASE',
    // 封卷后勘误 1117ec2：卷三甲 M-22、M-23 七码（卷三甲 :982 写明"§4.3 登记"）、W-DIM-GAP（李白 11-17 裁定）、卷十二 §2.12 新两码。
    'E-MAT-GRADE-KEYS', 'E-MAT-GRADE-FIELD', 'E-MAT-GRADE-REF', 'W-MAT-REF-UNUSED',
    'E-MAT-UNREAD-WRITTEN', 'E-MAT-READER-NULL', 'E-MAT-READER-UNREGISTERED',
    'W-DIM-GAP', 'E-ACC-REGISTRY-WRITE', 'E-ACC-TOOL-NONDET',
    // 封卷后勘误 1118k18（李白 11-18 08:20 裁定①）：卷十二 §2.12 新两码（A12-4.4、A12-4.5）。
    'E-ACC-PROMISE-UNREACHABLE', 'E-ACC-PARAM-UNCONSUMED',
    // 封卷后勘误 1118k25（李白 11-18 22:10 丙9）：卷九 §2.8 新码，本卷不定义、只登记。
    'E-ACT-WRITER-NOT-READY',
  ]],
  // 卷二 §2.7 `dated`"拒写的错误码随首个 dated 写者卡登记"（:796）；本卡命名。已定：E-DATED-FROMDAY = 追加记录的 fromDay 不是大于写入时当前日的整数（拒写、不落记录）；
  // E-DATED-WRITER = 写者登记不合 dated 的规矩（dated 缺写或非布尔、真而无改写写者、与 viaRelocate 同真、有建行写者、路径模式或键类不合记录路径形、两条 dated 模式覆盖同一实体类）。
  // 理由：两码各管运行期一道与加载期一道，同 E-RELOC-TARGET / E-RELOC-FIELDS 的分法；卷二 §4.3 与 §2.7 跟改待主会话派勘误。
  ['vol2.s2.7', [
    'E-DATED-FROMDAY', 'E-DATED-WRITER',
  ]],
  // 卷五 §4.1 规则 15 :504、:505 点名（封卷后勘误 1120k1、卷十九 §5.5 卷五行 ⑤）：alterCells 的两个拒写码，G9 登记（对照表待定 7 已定：随首个调用者）。
  // E-GRID-OFFSCREEN-WRITE 另见卷二十七附录码表；E-GRID-STRUCTURE-CELL = 差分要把建筑体元所在格（外墙、隔墙、楼梯格）写成别的材料。
  ['vol5.s4.1', [
    'E-GRID-OFFSCREEN-WRITE', 'E-GRID-STRUCTURE-CELL',
  ]],
  ['vol4.s2.7', [
    'E-BODY-PLAN-SHAPE', 'E-BODY-TISSUE-KEYS', 'E-BODY-CAP-CYCLE', 'E-BODY-INTEGRITY-TARGET', 'E-SPECIES-GROWTH', 'E-SPECIES-TEMPERAMENT', 'E-DIET-EATS', 'E-DIET-PREY',
    'E-SPECIES-ATTR-KEYS', 'E-SPECIES-SAPIENT', 'E-LIFE-STAGES', 'E-SPECIES-MATURITY', 'E-HEREDITY-FACTOR', 'E-BODY-PART-TARGET', 'E-PERSON-SEX', 'E-IDENTITY-LEGAL', 'E-PERSON-CULTURE-MISSING',
  ]],
  ['vol7.s2.8', [
    'E-FAITH-LAYER', 'E-FAITH-TENET', 'E-FAITH-HOLY-SUBSET', 'E-FAITH-SPHERE-CLASH', 'E-FAITH-MIRACLE-ROW', 'E-FAITH-ENTRY-CODE', 'E-FAITH-DEVOTEE-LAYER', 'E-FAITH-UNSOURCED', 'E-FAITH-STORED-DERIVED',
    'E-CULT-VALUE-COVER', 'E-CULT-PREF-KEY', 'E-CULT-TRADITION', 'E-CULT-EVAL-ABOUT', 'E-CULT-TEXT', 'E-FEST-RECUR', 'E-LANG-NAME-TABLE', 'E-RESPECT-TIER', 'E-CULT-INTEG-RECORD', 'W-CULT-INTEG-UNCALIBRATED',
  ]],
  ['vol8.s2.8', [
    'E-ORG-POLITY', 'E-ORG-PARENT-CYCLE', 'E-ORG-TREASURY', 'E-ORG-CHARTER', 'E-MOTION-PHASE', 'E-OFFICE-DOMAIN-LEVEL', 'E-OFFICE-ORG', 'E-OFFICE-BENCH', 'E-OFFICE-KIND', 'E-OFFICE-REVOKED', 'E-OFFICE-INELIGIBLE',
    'E-DOMAIN-RANKS', 'E-TITLE-DUP', 'E-TITLE-USURP', 'E-HOLD-INELIGIBLE', 'E-TAX-DUP', 'E-TAX-ROW', 'E-DIPLO-QUOTA', 'E-WAR-CASUS', 'E-POP-DIRECT', 'E-POP-FLOW', 'E-POP-GENESIS-ONLY', 'E-INF-ROW',
    'E-DIM-INVARIANT-SPENDPURPOSE',
  ]],
  ['vol8b.s2.8', [
    'E-OFF-MODE', 'E-OFF-BROADER-CYCLE', 'E-LAW-FORM', 'E-LAW-BOOK', 'E-LAW-REF', 'E-LAW-LEGISLATOR', 'E-LAW-PENALTY', 'E-LAW-GATE-KIND', 'E-LAW-PROCEDURE-DUP', 'E-LAW-LIMIT', 'E-LAW-STACK-ORDER',
    'E-LAW-GENESIS-ONLY', 'E-LAW-ENACT', 'E-FACT-DIRECT', 'E-CASE-PHASE', 'E-CASE-STANDING', 'E-CASE-FORUM', 'E-PEN-ROW', 'E-PEN-COMMUTE', 'E-DISP-DENIED', 'E-FLAG-ROW', 'E-BOUNTY-ESCROW', 'E-AUDIT-POWER',
    'E-CRIME-FLOW', 'E-CUSTODY-CAPACITY', 'E-CUSTODY-STEP', 'E-ESTATE-ROW', 'E-ESTATE-STEP', 'E-CIVIL-REMEDY',
  ]],
  ['vol9.s2.8', [
    'E-ACT-ROW', 'E-ACT-UNKNOWN', 'E-ACT-SLOT', 'E-ACT-CAPACITY', 'E-ACT-PRECONDITION', 'E-ACT-CONSENT', 'E-ACT-COST', 'E-ACT-BUSY', 'E-ACT-CAP-MISSING', 'E-ACT-DIFFICULTY-MISSING', 'E-ACT-PRIMITIVE', 'E-ACT-MENU-UNREACHABLE',
    // 封卷后勘误 1118k25（李白 11-18 22:10 丙9）：原语适配器或其目标写者尚未上线；E-ACT-PRIMITIVE 保持原义（只管契约不合）。
    'E-ACT-WRITER-NOT-READY',
    'E-OPEN-EXPIRED', 'E-OPEN-DRIFT', 'E-OPEN-INEXPRESSIBLE', 'E-TURN-UNMAPPED', 'E-CLAIM-SCHEMA', 'E-DIALOGUE-STATE', 'E-AI-TIER', 'E-NPC-BYPASS', 'E-GATE-RETRY',
  ]],
  ['vol10.s2.7', [
    'E-GEN-STAGE-UNKNOWN', 'E-GEN-STAGE-CYCLE', 'E-GEN-ROW-INVALID', 'E-GEN-OVERRIDE-AUTHORED', 'E-GEN-BYPASS', 'E-GEN-BRANCH-ORIGIN', 'E-GEN-ID-COLLISION', 'E-GEN-SKELETON',
    'E-GEN-REJECT', 'E-GEN-NAME-EMPTY', 'E-GEN-GROUP-ROW', 'E-GEN-GROUP-CYCLE', 'E-GEN-LATE-SOURCE', 'E-GEN-MANIFEST-DRIFT', 'E-GEN-DEFAULT', 'E-GEN-NOT-MATERIALIZED', 'E-GEN-RESPECT',
    // 已定：高低次序投影改了生成值时记日志的告警码（李白 11-21 裁定甲：投影不拒收，改了哪些值要可追溯）；卷十勘误待补。
    'W-GEN-DOWNHILL-PROJECTED',
    // 封卷后勘误 1121k16（卷十 §2.7）：高低次序作者自相矛盾；水体足迹输入补不出（事由代号随码返回，R10-2.17）。
    'E-GEN-ORDER-CONFLICT', 'E-GEN-WATER-FOOTPRINT',
  ]],
  ['vol12.s2.12', [
    'E-ACC-ITEM-UNREGISTERED', 'E-ACC-ITEM-ORPHAN', 'E-ACC-ITEM-COUNT', 'E-ACC-ITEM-FORM', 'E-ACC-ITEM-PARAM', 'E-ACC-ITEM-UNIMPLEMENTED', 'E-ACC-CODE-UNLISTED',
    'E-ACC-SCAN-NAMELIST', 'E-ACC-SCAN-SELFNAME', 'E-ACC-BASELINE-UP', 'E-ACC-BASELINE-EDIT', 'E-ACC-ROWKEY-DRIFT', 'E-ACC-NEWROW-UNANCHORED', 'E-ACC-ITEM-DOWNGRADE',
    'E-ACC-HIT-OPEN', 'E-ACC-REVIEW-MISSING', 'E-ACC-REVIEW-STALE', 'E-ACC-REVIEW-SELF', 'E-ACC-REVIEW-VETO', 'E-ACC-REVIEW-CHECKLIST', 'E-ACC-GATE-BYPASS', 'E-ACC-RUN-UNBOUND',
    'E-ACC-REPORT-FORM', 'E-ACC-COMMIT-MSG', 'E-ACC-EXT-CODE-CHANGED', 'E-ACC-EXT-EXISTING-ROW', 'E-ACC-FIXTURE-INSTANCE', 'E-ACC-ZERO-MISMATCH', 'E-ACC-BYPASS-REGRESSION',
    'E-ACC-CRITERION-LOOSENED', 'E-ACC-CRITERION-UNVERSIONED', 'E-ACC-DOC-SEAL', 'E-ACC-GATEFAC-FORM', 'E-ACC-REQUIRED-TEST', 'E-ACC-REGISTRY-WRITE', 'E-ACC-TOOL-NONDET', 'E-ACC-TEST-FAIL', 'E-ACC-REQUIRED-NOT-RUN', 'E-ACC-INSTANCE-NAME', 'E-ACC-CONST-LITERAL', 'E-ACC-CARD-SELFCHECK', 'E-ACC-CARD-ARCHIVE', 'E-CONTENT-TIER',
  ]],
  ['vol13.s2.9', [
    'E-CBT-DAMAGE', 'E-CBT-TYPEROWS', 'E-CBT-WCLASS', 'E-CBT-ATTACKS', 'E-CBT-GUARD', 'E-CBT-SHARES', 'E-CBT-LAUNCH', 'E-CBT-NATURAL', 'E-CBT-WEAK', 'E-CBT-CURVE', 'E-CBT-ROLES', 'E-CBT-MORALE-RATE',
    'E-CBT-ROUND', 'E-CBT-ENC-STATE', 'E-CBT-ENC-MEMBER', 'E-CBT-NOT-ENGAGED', 'E-CBT-REACH', 'E-CBT-SIEGE-STATE', 'E-CBT-MISSION', 'E-CBT-SNAPSHOT',
  ]],
  ['vol14.s2.7', [
    'E-PROF-PROFILE-EMPTY', 'E-PROF-VARIANT-DOMAIN', 'E-PROF-HIDDEN-OPPORTUNITY', 'W-PROF-SERVICE-GAP', 'W-PROF-SHADOWED', 'E-SKILL-PREREQ-CYCLE', 'E-SKILL-SOURCE-NONE', 'E-SKILL-TRANSFER-CLASS',
    'E-SERVICE-SKILL', 'E-CERT-STEP', 'E-PERK-TREE', 'E-DEED-FILTER', 'E-PREQ-SELECTOR', 'E-RX-VAR-UNLISTED', 'E-RX-BARE-NUMBER', 'E-SKILL-WEIGHTS', 'E-SKILL-CLASS-MEMBER', 'E-SKILL-SPOKEN-DUP',
  ]],
  ['vol15.s2.8', [
    'E-ARC-SPELL-SHAPE', 'E-ARC-FAMILY-CLASS', 'E-ARC-BODY-WRITE', 'E-ARC-SIXAXIS', 'E-ARC-RITE-SHAPE', 'E-ARC-LIMINAL', 'E-ARC-IX-ROW', 'E-ARC-WORKING', 'E-ARC-ENCHANT-LOAD', 'E-ARC-FATE-ROWS', 'E-ARC-REALM-LINK', 'E-ARC-SERVICE',
  ]],
  ['vol16.s2.8', [
    'E-BST-TIER-ROWS', 'E-BST-QUOTA', 'E-BST-WARD-SHAPE', 'E-BST-BANE-CLASH', 'E-BST-BODY-WRITE', 'E-BST-MONSTER-SCHEMA', 'E-BST-LORE-SHAPE', 'E-BST-SIM-DIMS',
    'E-BST-DUPLICATE', 'E-BST-VARIANT', 'E-BST-GEN-SLOT', 'E-BST-LAIR', 'E-BST-TRANSFORM-ROWS',
  ]],
  ['vol17.s2.5', [
    'E-TRIP-MODE', 'E-TRIP-TABLE', 'E-TRIP-LEG', 'E-TRIP-UNKNOWN', 'E-POS-WRITER', 'E-VEH-SLOT', 'E-GATE-TERMS', 'E-POS-SYNC',
  ]],
  ['vol18.s2.5', [
    'E-HK-UNREGISTERED', 'E-HK-HYPER', 'E-HK-PROTOCOL', 'E-HK-END-TYPE', 'E-HK-SUCCEED-SOURCE', 'E-HK-HOLDER-MAX', 'E-HK-HOLD-WHILE', 'E-HK-CAPACITY',
    'E-REL-INTIMATE-MINOR', 'E-REL-MINOR-LOAD', 'E-REL-REWRITE', 'E-REL-INTIMATE-FIELD', 'E-REL-SOCIAL-FIELDS', 'E-REL-KIND', 'E-REL-CONSENT',
    'E-KIN-DESCENT-TRAITS', 'E-KIN-ORG-TRAITS', 'E-HK-ROW-FIELDS', 'E-KIN-REGIME-AGE', 'E-KIN-CYCLE', 'E-STANCE-BYPASS', 'E-STANCE-SOURCE', 'E-ESTEEM-UNSOURCED', 'E-SOC-TEXT',
  ]],
  // E-CLOCK-REACTION-LIMIT：李白 11-18 03:22 裁定①（一码管 reactionDepthMax、proposalMax 两上限，信息带字段名、上限值、实际值）；卷二十本卷码表登记另卡。
  ['vol20.appendix.codes', [
    'E-CLOCK-WALLTIME', 'E-CLOCK-CADENCE', 'E-CLOCK-REACTION-LIMIT', 'E-DUE-UNDECLARED', 'E-DUE-DUPLICATE', 'E-DUE-RANK-DUP', 'E-CAL-MONTHS', 'E-CAL-LOCAL', 'W-CAL-DRIFT',
    'E-RECUR-ANCHOR', 'E-RECUR-PLACE-NULL', 'E-WX-WEIGHT', 'E-WX-WEIGHT-CYCLE', 'E-SEASON-COVER', 'E-SEASON-CODE-KEY', 'E-ENV-TARGET', 'E-ENV-BYPASS', 'E-ENV-ACCUM-LOCAL',
    'E-ACCUM-LOOKBACK', 'E-WATER-CYCLE', 'E-FIELD-TIER', 'E-PACE-UNCLASSIFIED', 'E-PACE-MISCLASSIFIED', 'E-PACE-NO-UNIT', 'E-SEED-KEY', 'E-PROP-LAW',
  ]],
  // 卷六账本码（封卷后勘误 1118k7 六码；1118k8 补 USEDBYDAY-ORDER、HOLDER-NOT-SUBJECT；1118k9 补 STAGING-SPONSOR；
  // 1118k13 续补 CAPPED-DIRECT）：只收账本码，同表的 E-ECON-* 两码不涉账本，随卷六 §4.13 首卡登。
  ['vol6.appendix.codes', [
    'E-LEDGER-UNBALANCED', 'E-LEDGER-NEGATIVE', 'E-LEDGER-CODE-UNREGISTERED', 'E-LEDGER-PAIR-MISSING', 'E-LEDGER-TRANSFER-RESTRICTED', 'W-LEDGER-ALERT',
    'E-LEDGER-USEDBYDAY-ORDER', 'E-LEDGER-HOLDER-NOT-SUBJECT', 'E-LEDGER-STAGING-SPONSOR', 'E-LEDGER-CAPPED-DIRECT',
  ]],
  ['vol21.s2.8', [
    'E-MED-STATUS-SHAPE', 'E-MED-RX-VAR', 'E-MED-WOUND-MAP', 'E-MED-PHARM-SHAPE', 'E-MED-NEED-CYCLE', 'E-MED-PROC-TERM', 'E-MED-SEQUELA-CYCLE', 'E-MED-EFFECT-TARGET', 'E-MED-CARE-SHAPE', 'E-MED-FIELD-BODY', 'E-MED-SPAWN-CAUSE',
    'W-MED-UNTREATABLE', 'W-MED-NO-RESPONSE', 'W-MED-DRIVE-STEP',
  ]],
  ['vol22.s2.5', [
    'E-KNOW-FACT-SHAPE', 'E-KNOW-CHANNEL', 'E-KNOW-WRITER', 'E-LORE-WRITER', 'E-LORE-CARRIER', 'E-RESEARCH-GATE', 'E-PLOT-GOAL', 'E-INFER-CYCLE',
  ]],
  ['vol23.s2.6', [
    'E-WORK-KIND-SLOT', 'E-WORK-FORM-KIND', 'E-WORK-EMBODIED', 'E-WORK-ACT-WAY', 'E-WORK-COVER', 'E-WORK-BASED-CYCLE', 'E-WORK-LANG', 'W-WORK-FORM-ORPHAN',
  ]],
  ['vol24.s2.7', [
    'E-EVT-VERB', 'E-EVT-EMITTER', 'E-EVT-SHAPE', 'E-EVT-CAUSE', 'E-EVT-TYPE', 'E-EVT-TARGET', 'E-EVT-PARAMS', 'E-EVT-PUB', 'E-EVT-PLAYERREAD',
  ]],
  ['vol26.s2.6', [
    'E-PSY-GAUGE-STATUS', 'E-PSY-GAUGE-MODE', 'E-PSY-THOUGHT-TRIGGER', 'E-PSY-EPISODE-GATE', 'E-PSY-RX-VAR', 'E-PSY-LOAD-KEY', 'E-PSY-JOINT-AXES', 'E-PSY-COMPONENT', 'E-PSY-DELTA-DIRECTION', 'E-PSY-BASIS', 'E-PSY-INTERNAL-BRANCH',
    'W-PSY-NEED-UNSATISFIABLE', 'W-PSY-STAGE-UNREACHABLE',
  ]],
  ['vol27.appendix.codes', [
    'E-SIM-MATRIX-MISSING', 'E-SIM-FORM-INVALID', 'E-SIM-BYPASS', 'E-AGG-KEY-UNDECLARED', 'E-AGG-KEY-CLOCKED', 'E-AGG-FOLD-FOOTPRINT', 'E-AGG-MEMBER-OVERLAP', 'E-AGG-SPECIAL-CASE',
    'E-COST-COEF-MISSING', 'E-COST-OVER-BUDGET', 'E-COST-WALLCLOCK',
    // 卷五 §4.1 规则 15 :504 点名、卷二十七 :1024 列出：差分写入由不在泡内的行为者发起时拒写（G9 随 alterCells 登记）。
    'E-GRID-OFFSCREEN-WRITE',
    // 卷二十七 R27-1.13 :317、:1024：展开落格时 landCell 返回未知，位置保持区格精度，告警级（G10 登记，随首个调用者）。
    'E-GRID-LAND-UNKNOWN',
    'E-SAVE-SHARD-UNCOVERED', 'E-SAVE-SHARD-DIGEST', 'E-SAVE-TORN', 'E-SAVE-RULES-MISMATCH', 'E-SAVE-BYPASS', 'E-SAVE-WRITE-FAIL', 'E-SAVE-IMPORT-SIZE', 'E-SAVE-SLOT-INVALID', 'E-SAVE-EMPTY',
    'E-DET-FLOAT', 'E-DET-NONFINITE', 'E-DET-OVERFLOW', 'E-DET-DOMAIN', 'E-DET-ORDER', 'E-KEYID-WIDTH', 'E-DIGEST-READ', 'E-REPLAY-DIVERGE', 'E-REPLAY-VERSION-BRANCH',
    'E-SEED-COMPONENT', 'E-SEED-STREAM', 'E-SEED-COLLISION', 'E-PERF-BUDGET', 'E-PERF-REGRESS', 'E-PERF-SCALE', 'E-PERF-BASELINE-UNJUSTIFIED', 'E-PERF-UNCALIBRATED',
  ]],
  ['vol28.s2.9', [
    'E-PACK-MANIFEST', 'E-PACK-NS-FORMAT', 'E-PACK-NS-DUPLICATE', 'E-PACK-FILE-KIND', 'E-PACK-DATA-VERSION', 'E-PACK-ID-NS', 'E-PACK-VOCAB-CLOSED', 'E-PACK-DIM-EXT', 'E-PACK-PATCH-OP',
    'E-PACK-DEP-MISSING', 'E-PACK-DEP-CYCLE', 'E-PACK-DEP-UNDECLARED', 'E-PACK-CONFLICTS', 'E-PACK-VOCAB-BROADER', 'E-PACK-PATCH-TARGET', 'E-PACK-PATCH-CONFLICT', 'E-PACK-RULEKEY', 'E-PACK-LIMIT',
    'E-PACK-BRANCH-NS', 'E-PACK-LOADER-LITERAL', 'E-PACK-APPEND-BASE', 'E-PACK-APPEND-CHANGED', 'E-CONTENT-TIER', 'E-CONTENT-STALE', 'E-CONTENT-RECORD',
  ]],
  ['vol29.s2.9', [
    'E-I18N-LOCALE', 'E-I18N-LABEL-ORPHAN', 'E-I18N-LABEL-FOREIGN', 'E-I18N-FORM', 'E-I18N-TPL-MISSING', 'E-I18N-TPL-SLOT', 'E-I18N-PLURAL',
    'E-TPL-KEY', 'E-TPL-NO-FALLBACK', 'E-TPL-CYCLE', 'E-TPL-RX', 'E-PANEL-SOURCE', 'E-PANEL-PATH', 'E-PANEL-KIND', 'E-PANEL-ACTION', 'E-MAP-COMPASS', 'E-AV-KEY', 'E-AV-NO-DEFAULT',
    'E-DISPLAY-LITERAL', 'E-DISPLAY-BRANCH-TEXT', 'E-DISPLAY-LOCALE-BRANCH', 'E-DISPLAY-BACKFLOW', 'E-DISPLAY-DICE', 'E-DISPLAY-UNSEEN', 'E-DISPLAY-SUBJECT', 'E-DISPLAY-HOST-CHAT',
  ]],
];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function build() {
  /** @type {Map<string, string[]>} */
  const byCode = new Map();
  for (const [source, codes] of GROUPS) {
    for (const code of new Set(codes)) {
      const list = byCode.get(code);
      if (list) list.push(source);
      else byCode.set(code, [source]);
    }
  }
  return Object.freeze([...byCode.keys()].sort(cmp).map((code) => Object.freeze({ code, sources: Object.freeze(byCode.get(code)) })));
}

/** 码表：按 code 排序、无重复；每项 {code, sources}，sources 是登记该码的全部卷与节（同一码多卷列出时多于一项）。 */
export const ERROR_CODES = build();

/** 已登记码集合（只读使用）。 */
export const REGISTERED_CODES = new Set(ERROR_CODES.map((e) => e.code));
// kernelApi `report(code, fields)`（卷二 §2.7 kernelApi :630；§2.6"事务内拒写的处置"第 2 件 :501；§2.9 第 1 条登记出口表 report.mjs 行）：
// 日志与控制台的唯一出口，"按代号与数值写"——只收 ErrorCode 与只含代号、数值的字段，不收文字，不进 state，不进哈希。
// console 只许本文件用（§2.9 第 1 条全局对象白名单 kernel 行）；node:fs 追加写只许本文件、kernel/load/*、kernel/save.mjs（§2.7 import 矩阵 kernel 行）。
// 日志落到哪里由挂接时定（useReportSink）；未挂接时写到控制台。只按登记数据判，不认任何具体错误码或字段。

/** @typedef {null | boolean | number | string} FieldValue 代号（实体 id、句柄值、错误码）或数值；文字收不进来。 */
/** @typedef {{code: import('./types.d.ts').ErrorCode, fields: Readonly<Record<string, FieldValue>>}} ReportRecord */

/**
 * 字段核对：键是代号文法；值只许 null、布尔、有限数、代号（§1.9 :278 文法）或登记错误码。不合即 E-DIM-ID-FORMAT（非有限数 E-DET-NONFINITE）。
 * @param {unknown} fields
 * @returns {Record<string, FieldValue>} 按键名升序的新对象
 */
export function checkFields(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw new HandleError('E-DIM-ID-FORMAT', 'report fields: want a plain object of codes and numbers');
  /** @type {Record<string, FieldValue>} */
  const out = {};
  for (const k of Object.keys(fields).sort()) {
    if (!CODE_RE.test(k)) throw new HandleError('E-DIM-ID-FORMAT', `report field name ${JSON.stringify(k)}: want ^[a-z][a-z0-9_]{1,47}$`);
    const v = fields[k];
    if (v === null || typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new HandleError('E-DET-NONFINITE', `report field ${k}: non-finite number`);
      out[k] = v; continue;
    }
    if (typeof v === 'string' && (CODE_RE.test(v) || REGISTERED_CODES.has(v))) { out[k] = v; continue; }
    throw new HandleError('E-DIM-ID-FORMAT', `report field ${k}: value must be null, boolean, finite number, code or error code`);
  }
  return out;
}

/** @type {(rec: ReportRecord) => void} */
const consoleSink = (rec) => { console.error(JSON.stringify(rec)); };
let sink = consoleSink;

/**
 * 挂接日志出口（kernel 挂接时调；kernel 组内用，不在 kernelApi）。不给参数即回到控制台。
 * @param {(rec: ReportRecord) => void} [next]
 * @returns {(rec: ReportRecord) => void} 原出口（便于恢复）
 */
export function useReportSink(next) {
  const prev = sink;
  sink = typeof next === 'function' ? next : consoleSink;
  return prev;
}

/**
 * 追加写日志文件的出口：每条一行 JSON（键名升序，确定）。路径由挂接时给。
 * @param {string} path
 * @returns {(rec: ReportRecord) => void}
 */
export function fileSink(path) {
  return (rec) => { appendFileSync(path, JSON.stringify(rec) + '\n'); };
}

/**
 * kernelApi `report(code, fields)`：码须是登记码（经 E 句柄来的值），字段只含代号与数值。记录冻结后交给出口。
 * @param {import('./types.d.ts').ErrorCode} code
 * @param {Record<string, FieldValue>} [fields]
 * @returns {ReportRecord}
 */
export function report(code, fields = {}) {
  const rec = Object.freeze({ code: errorCodeOf(code, REGISTERED_CODES), fields: Object.freeze(checkFields(fields)) });
  sink(rec);
  return rec;
}
// kernelApi `reportError`（卷二 §2.7 kernelApi :631；§2.9 第 1 条"catch 变量"：catch、Promise.catch、finally 里的错误值是 unknown，
// 只能原样传给本函数，不得被收窄）与内核拒写错误 KernelError（§2.6"事务内拒写的处置"：被拒的错误码上抛到 kernel/transaction.mjs）。
// 规整后一律走 kernel/report.mjs 的 report(code, fields)（§2.9 第 1 条 report.mjs 行："reportError 规整后也走这里"）。
// 只按错误码登记表判，不认任何具体错误码；不收 E-MIG-*（块 2 体检 K2-49，登记表本来就不含）。

/**
 * 内核运行期拒写与拒收：带登记码与只含代号、数值的字段（事务处置第 2 件"记日志"用）。
 * 抛它的地方：writePath 的写者、类型、终止核对（§2.6 第 3 条），事务入口，以及日后各运行期核对（2-5 的非有限值拒写同此）。
 */
export class KernelError extends Error {
  /**
   * @param {string} code 登记表里的码（构造时核对，不在表内即 E-DIM-REF-MISSING）
   * @param {Record<string, null | boolean | number | string>} [fields] 只含代号与数值（report 同一核对）
   * @param {string} [detail] 给开发者的说明（不进日志，不进 state）
   */
  constructor(code, fields = {}, detail = '') {
    const c = errorCodeOf(code, REGISTERED_CODES);
    super(detail ? `${c} ${detail}` : c);
    this.code = c;
    this.fields = Object.freeze({ ...checkFields(fields) });
  }
}

/**
 * 错误规整：带登记码的错误（KernelError、HandleError 及其他带 `code` 字段的错误）规整成 report(code, fields)，返回所报的码；
 * 没有登记码的错误原样抛回——错误码登记表里没有"未分类错误"一类的通用码，本函数不自造码（交李白裁定前不吞错）。
 * @param {unknown} e
 * @returns {import('./types.d.ts').ErrorCode}
 */
export function reportError(e) {
  const code = codeOf(e);
  if (code === null) throw e;
  const raw = e !== null && typeof e === 'object' && 'fields' in e ? e.fields : undefined;
  let fields = {};
  try { fields = raw === undefined ? {} : checkFields(raw); } catch { fields = {}; }
  report(code, fields);
  return code;
}

/**
 * 错误值上的登记码；不是对象、没有 code、code 不在登记表内都返回 null。
 * @param {unknown} e
 * @returns {import('./types.d.ts').ErrorCode | null}
 */
export function codeOf(e) {
  if (e === null || typeof e !== 'object' || !('code' in e)) return null;
  const c = e.code;
  return typeof c === 'string' && REGISTERED_CODES.has(c) ? errorCodeOf(c, REGISTERED_CODES) : null;
}
