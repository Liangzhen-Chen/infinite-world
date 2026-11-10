import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomInt } from 'node:crypto';
import assert from 'node:assert/strict';
import {openContentBudget} from './content-budget.mjs';
import {numeralIssues,applyDerivedDuration} from './content-numerals.mjs';

export const hashContent = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseModelJSON(response) {
  const message = response.choices?.[0]?.message;
  const raw = message?.tool_calls?.[0]?.function?.arguments ?? message?.content;
  if (typeof raw !== 'string') throw new Error('模型没有返回 JSON 正文');
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
// 工序类正文（配方 process）的起草约束：起草提示与复核清单(f)共用这一处来源，改动只在此处。
// 不属于审核指纹（指纹只算 entry、context、revision），改字不使已通过记录失效。
// 起草与复核共用的约束（单一来源）。总时长一条起草与复核口径不同，分开写在下面两处。
const PROCESS_SHARED_RULES = [
  '收尾和辅助动作（清洗、加盖、画线、舀取、暂置、晾放等）不得引入骨架以外的器具、容器或水；骨架没有水就不写用水洗、冲、浸（骨架里的醋、蜜液等材料本身可用于浸），没有锅盖就不写加盖，没有量具或墨线就不写画线，没有容器就不写舀出暂置。物品说明里交代“容器须使用者另备、不随货提供”是如实说明，不算引入骨架外容器。',
  '用火必须交代火源，且火源只能来自骨架里的燃料；骨架没有燃料就不写点火、烧、烤、煮、熬、停火。',
  '副产品为空时，余料、废料弃置是允许的；但弃置不得引入骨架外的容器或去处。',
  '不写骨架和引用事实以外的用途、期限或禁忌。',
].join('');
// 起草用：总时长句由系统按骨架 minutes 写入正文末尾（runContentPipeline 的 extractDraft 派生），模型不写。
export const PROCESS_DRAFT_RULES = PROCESS_SHARED_RULES + '不写总时长（全程多少分钟之类），由系统按骨架生成。';
// 复核用：复核看到的草稿已含系统写入的总时长句，所以只查一致性，不能因“写了总时长”判错。
const PROCESS_REVIEW_RULES = PROCESS_SHARED_RULES + '正文中的总时长句由系统按骨架 minutes 写入或保留，数值与骨架一致即不算错（“约N分钟”且 N 等于骨架也不算错）；与骨架不一致，或用“多、余、来、几”一类概数时列 hard。';
// 通用硬性检查清单：对所有条目适用，凡命中一律列为 severity=hard 的 contradictions，不得降为 soft/style。
// 反例由真实复读错误改写；它们只示意错误形状，不是条目特判。工序类正文（配方、制作步骤）尤其要逐句过一遍。
const REVIEW_CHECKLIST = ' 另须逐句过下列六项，命中即列 hard，不得因为读起来合理而放过：' +
  '(a)工序连贯：正文中被使用、移动、加工的每样材料、容器、半成品，前文必须交代它从哪里来、放在哪里；“已叠好”“已入锅”“已弯成”一类状态，前文要有对应步骤。反例：只写把核桃仁切碎，随后就写“碎仁均匀裹糊”，碎仁从未入锅；又如只写取黄油“置于锅旁”，随后却写与锅里的蒜末相混；又如框料从未弯折，却写“把悬片悬在框内”。' +
  '(b)工具与材料只能来自骨架或引用事实，不得出现骨架以外的工具、材料或水量。反例：骨架工具只有框锯、凿、锉，正文却写“配木槌轻敲”；骨架只有一份水，正文却写“再以清水冲去残砂”。' +
  '(c)不得自添用途、保存期、食用期限、禁忌、维修需求，骨架和引用事实里没有的一律不行。反例：“所得一份，须当日食用”；“锅壁破裂时需维修”；“不横切石料”“刨屑留作引火之用”（骨架并无此用途或限制）。' +
  '(d)数量与单位须与骨架一致。反例：骨架材料是“干直芦管束”一束，正文写“取芦管束一根”。' +
  '(e)语句须通顺，不得有错字、病句、不通的动宾搭配、残缺的数词或单位。反例：“待麦糊稠度稳定后段入锅中”“全程约八十份钟”“取炭入厚底煮锅小灶”“皂片全散后停火”（全文并未点火）。' +
  '(f)工序类正文另须符合下列约束，违反者列 hard：' + PROCESS_REVIEW_RULES;
export function defaultReviewRequest(entry, draft, context) {
  return {
    thinking: { type: 'disabled' }, temperature: 0, max_tokens: 1800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是游戏内容事实审查员。逐句核对说明与骨架及引用事实，只返回 JSON {"contradictions":[{"quote":"说明原句","field":"骨架字段路径","severity":"hard|soft|style","reason":"具体原因"}]}。hard 表示数值、材料、用途、能力、食性、归属、时间、取得途径等与骨架相反或新增没有依据的功能。正常且相容的感官细节不是新增功能。不推测骨架没有声明的规则。不因没有重述全部骨架字段报错。无矛盾则空数组。' + REVIEW_CHECKLIST },
      { role: 'user', content: JSON.stringify({ skeleton: entry, publishedFacts: context ?? null, draft }) },
    ],
  };
}
// 起草型条目（既无冻结草稿也无离线草稿）在发起草请求前拿不到草稿，复核请求费用上界只能由规则推出：
// 草稿是起草请求的模型输出，至多 max_tokens 个 token；复核请求 = 复核骨架 + 草稿。
// 系数：每个输出 token 至多对应多少 UTF-8 字节。取实测值，不估：tools/measure-output-bytes-per-token.mjs 遍历
// world/drafts/**/budget-responses/*.json（本仓库真实 DeepSeek 调用证据），字节 = message.content + tool_calls arguments，token = usage.completion_tokens，
// 排除无 token 数、带 reasoning_content、输出为空的记录（本次均为 0 条）。2026-11-10 实测 2453 条：最大 4.623、p99 4.191、中位 3.0；
// 其中起草类（label 不含 -review）仅 20 条，最大 3.720。取法：对全部样本的最大值向上取整 = 5。
// tests/content-pipeline.test.mjs 会重跑该统计，实测最大值一旦超过本常量即失败，需重新取值。样本里起草类偏少，所以超界照样停（见 one()）。
// 占位草稿用 '"' 填充：嵌进复核请求（JSON 套 JSON）每个引号最多转义成 4 字节，使占位草稿覆盖转义膨胀的最坏情形。
// 起草请求必须是真正的模型请求（有 messages 数组）；人工稿等没有模型输出上界的请求无法推出上界，按原规定停。
export const MAX_UTF8_BYTES_PER_OUTPUT_TOKEN=5;
const DEFAULT_MAX_TOKENS=1800; // 与 content-budget 的 reserveCeilingYuan 默认值一致
export function maxDraftBytes(draftBody){
  if(!Array.isArray(draftBody?.messages))return NaN;
  const tokens=draftBody.max_tokens??DEFAULT_MAX_TOKENS;
  return Number.isInteger(tokens)&&tokens>0?tokens*MAX_UTF8_BYTES_PER_OUTPUT_TOKEN:NaN;
}
function reviewIssues(review) {
  if (!review || !Array.isArray(review.contradictions)) throw new Error('事实审查缺少 contradictions 数组');
  for (const row of review.contradictions) {
    if (!['hard', 'soft', 'style'].includes(row.severity) || !['quote', 'field', 'reason'].every(key => typeof row[key] === 'string' && row[key].trim())) {
      throw new Error('事实审查的原句、字段、严重度或原因无效');
    }
  }
  return review.contradictions;
}
async function readJSON(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await fs.rename(temp, file);
}
// L4 退回格式：批次文件 batch-N.json 的 l4.rejection = {by, at, reason, ids:[被退回条目 id…]}（approved 同时为 false）。
// ids 必须是该批 ids 的非空子集；缺 ids 或含批外 id 即报错，不猜测退回范围。reason 是退回意见，重写时作为 feedback。
// 返回 Map(id → {key,by,at,reason})；key 由 by/at/reason/id 哈希而来，用来判断某条记录是否已处理过这次退回。
async function readL4Rejections(root, entries) {
  const out = new Map();
  let files;
  try { files = (await fs.readdir(root)).filter(name => /^batch-\d+\.json$/.test(name)); }
  catch (error) { if (error.code === 'ENOENT') return out; throw error; }
  for (const name of files) {
    const batch = await readJSON(path.join(root, name)), rejection = batch?.l4?.rejection;
    if (!rejection) continue;
    const { ids, reason } = rejection;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !batch.ids?.includes(id)) || typeof reason !== 'string' || !reason.trim())
      throw new Error(`${name} 的 l4.rejection 格式不合法：需要 reason 与 ids（该批条目 id 的非空子集）`);
    for (const id of ids) {
      if (!entries.some(entry => entry.id === id)) throw new Error(`${name} 的 l4.rejection 含不在本次冻结条目中的 id ${id}`);
      out.set(id, { key: hashContent({ by: rejection.by ?? null, at: rejection.at ?? null, reason, id }), by: rejection.by ?? null, at: rejection.at ?? null, reason });
    }
  }
  return out;
}
function randomSample(rows, count) {
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}
function hasWrapperEvidence(record,entry){
  const expected={id:entry.id,contract:'audit-patch-v1',patches:structuredClone(entry.patches)};
  // Compare the complete historical assertion, including its values. A loose
  // substring match could grant recovery to a factual or id mismatch.
  let wrapperError;try{assert.deepEqual({candidate:expected},expected);}catch(e){wrapperError=e.message;}
  if(record.errors?.includes(wrapperError))return true;
  if(!record.draftResponse||record.errorCode!=='AUDIT_PATCH_PROTOCOL')return false;
  try{assert.deepEqual(parseModelJSON(record.draftResponse),{candidate:expected});return true;}catch{return false;}
}

// Entries contain hand-authored mechanics. Request builders supply category
// prompts; this runner owns bounded rewrites, factual review, costs and resume.
// status "passed" means L1+L2 only. Publication must additionally approve L4.
export async function runContentPipeline({
  entries, root, client, buildDraftRequest, extractDraft = parseModelJSON,
  validateDraft, contextFor = () => null, buildReviewRequest = defaultReviewRequest,
  extractReview = parseModelJSON, concurrency = 8, batchSize = 40,
  revision = 'v2', retryManual = false, onBatch = null, budgetRoot = root,
  cardId, allocation, protocolRecoveryIds = [], requestTransform,
  reviewDraftFor = buildDraftRequest?.reviewDraftFor, reuseFrozenDrafts = false,
  storeContext = false, // 可选：true 时把审查时的上下文原样存进记录（contextSnapshot），供 reuseRecord 比对
  reuseRecord = null, // 可选：(旧记录, 条目, 新指纹) => 沿用后的记录 | null；仅在旧记录 passed 而指纹变了时调用，返回记录则不重审（小改动沿用）
  stopOnReviewError = null, // 可选：(error, entry) => true 时，该审查解析错误使整轮停止后续条目（不再发请求）；默认不停，其他卡行为不变
}) {
  if (!Array.isArray(entries) || new Set(entries.map(row => row.id)).size !== entries.length) throw new Error('条目编号重复或缺失');
  if (entries.some(row => !/^[a-z][a-z0-9_-]+$/i.test(row.id ?? ''))) throw new Error('条目编号不安全');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('并发必须为 1–16；正式波次使用 8–16');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('批次必须为 1–50；正式波次使用 25–50');
  if (typeof validateDraft !== 'function' || typeof buildDraftRequest !== 'function') throw new Error('缺少起草或 L1 校验接口');
  // 派生优先：骨架带 minutes 的条目，正文的总时长由代码写入（删去模型自带的总括时长，追加「全程N分钟。」），不交给模型。
  // 挂在提取草稿这一步，所有工具的起草结果都经过；骨架无 minutes 时原样返回。规则与理由见 content-numerals.mjs 的 stripOverallDuration。
  const extractRaw = extractDraft;
  extractDraft = async (response, entry) => applyDerivedDuration(await extractRaw(response, entry), entry);
  // 所有内容草稿共用的 L1 数字规则：对每个调用方自己的 validateDraft 结果统一追加（中文数字合法性、总括时长与 minutes 一致）。
  const l1 = async (draft, entry, context) => {
    const result = await validateDraft(draft, entry, context);
    const errors = Array.isArray(result) ? result : result?.errors ?? [];
    const extra = numeralIssues(draft, entry, context).filter(message => !errors.includes(message));
    return extra.length ? { ...(Array.isArray(result) ? { warnings: [] } : result), errors: [...errors, ...extra] } : result;
  };
  await fs.mkdir(root, { recursive: true });
  const l4Rejections = await readL4Rejections(root, entries);
  const ledgerPath = path.join(budgetRoot, 'budget.json');
  if(!Array.isArray(protocolRecoveryIds)||protocolRecoveryIds.some(id=>!entries.some(e=>e.id===id)))throw Error('协议恢复 id 不在冻结条目中');
  const budget=await openContentBudget({file:ledgerPath,client,cardId,allocation});
  const results = [], batches = [], recordsById=new Map();
  let halted=null;
  async function prepareRequest(body,details){return requestTransform?requestTransform({...details,body}):{body};}
  async function request(transformed,label,details,reservationId){
    const receipt=transformed.receipt;
    if(!receipt)return budget.request(transformed.body,label,{reservationId});
    await writeJSON(details.file,details.record);
    try{const response=await budget.request(transformed.body,label,{reservationId});receipt.status='completed';receipt.responseHash=hashContent(response);if(details.phase==='review')details.record.firstSourceEvidence.reviewResponse=structuredClone(response);await writeJSON(details.file,details.record);return response;}
    catch(error){receipt.status='failed';receipt.error=error.message;await writeJSON(details.file,details.record);throw error;}
  }
  async function one(entry) {
    const context = await contextFor(entry);
    const fingerprint = hashContent({ entry, context, revision });
    const file = path.join(root, `${entry.id}.json`);
    let record = recordsById.get(entry.id);
    if(record?.budgetStop){budget.stop(record.budgetStop.message);return record;}
    if(halted)return record??{id:entry.id,fingerprint,status:'pending',attempts:0,draft:null,review:null,errors:[],warnings:[]}; // 已因审查解析错误停止：不发请求、不写盘
    if(reuseRecord&&record?.status==='passed'&&record.fingerprint!==fingerprint){const carried=await reuseRecord(record,entry,fingerprint,context);if(carried){await writeJSON(file,carried);recordsById.set(entry.id,carried);return carried;}}
    // L4 退回：同指纹记录、该条在批次 l4.rejection.ids 内且这次退回尚未处理（记录里没有同 key 的 l4Rejection）→ 视为需要重写。
    const rejection=l4Rejections.get(entry.id);
    const l4Rewrite=!!rejection&&record?.fingerprint===fingerprint&&!record.l4Rejection?.some(row=>row.key===rejection.key);
    const recovering=protocolRecoveryIds.length>0;
    let eligible=recovering&&protocolRecoveryIds.includes(entry.id)&&entry.contract==='audit-patch-v1'&&record?.fingerprint===fingerprint&&record.status==='manual'&&!record.review&&!record.protocolRecovery&&
      hasWrapperEvidence(record,entry);
    if(eligible)eligible=await budget.claimProtocolRecovery(entry.id,fingerprint);
    if(recovering&&!eligible)return record??{id:entry.id,fingerprint,status:'pending',attempts:0,draft:null,review:null,errors:[],warnings:[]};
    if (!eligible&&!l4Rewrite&&record?.fingerprint === fingerprint && (record.status === 'passed' || record.status === 'manual' && !retryManual)) return record;
    let feedback = record?.fingerprint === fingerprint ? record.feedback : null;
    const priorAttempts = record?.fingerprint === fingerprint ? record.attempts ?? 0 : 0;
    if(eligible){record.protocolRecovery={kind:'audit-patch-v1-single-wrapper',startedAt:new Date().toISOString(),prior:structuredClone(record),status:'started'};record.status='pending';await writeJSON(file,record);}
    else record = record?.fingerprint===fingerprint?structuredClone(record):{ id: entry.id, fingerprint, status: 'pending', attempts: priorAttempts, draft: null, review: null, errors: [], warnings: [], feedback };
    if(l4Rewrite){
      // 只重写被退回的条目：留下 l4Rejection 历史（含退回意见与被退回的旧稿/旧审查），退回意见作 feedback；
      // 其后沿用本流水线的预留与预算机制（最多再发 2 轮起草+复核，attempts 与旧记录累加，标签不重名）。
      feedback=[`L4 退回：${rejection.reason}`];
      (record.l4Rejection??=[]).push({key:rejection.key,by:rejection.by,at:rejection.at,reason:rejection.reason,priorStatus:record.status,priorAttempts,attemptCap:priorAttempts+2,priorDraft:record.draft,priorReview:record.review});
      record.draft=null;record.review=null;record.errors=[];record.warnings=[];record.feedback=feedback;
    }
    record.status='pending';
    if(storeContext)record.contextSnapshot=JSON.parse(JSON.stringify(context??null));
    // 已付费草稿复用：同指纹旧记录为 pending、已有草稿、该草稿的起草请求已结算、其复核预留都未发出（cancelled-unissued）、
    // 草稿仍通过 L1 校验时，重跑直接用这份草稿进入复核，不重新起草；任一条件不满足则照常起草。
    let reuse=null;
    const old=recordsById.get(entry.id);
    if(!eligible&&old?.fingerprint===fingerprint&&old.status==='pending'&&old.draft&&!old.review&&priorAttempts>0&&old.draftResponse){
      const n=priorAttempts-1,rows=Object.values(budget.ledger.requests);
      const dl=`content-${path.basename(root)}-${entry.id}-draft${n}`,rl=`content-${path.basename(root)}-${entry.id}-review${n}`;
      const drafts=rows.filter(r=>r.label===dl),reviews=rows.filter(r=>r.label===rl);
      if(drafts.length&&drafts.every(r=>r.status==='settled')&&reviews.length&&reviews.every(r=>r.status==='cancelled-unissued')){
        try{
          assert.deepEqual(await extractDraft(old.draftResponse,entry),old.draft);
          const check=await l1(old.draft,entry,context),errors=Array.isArray(check)?check:check.errors??[];
          if(!errors.length)reuse={attempt:n,draft:old.draft};
        }catch{reuse=null;}
      }
    }
    for (let attempt = reuse?reuse.attempt:priorAttempts; attempt < (eligible?priorAttempts+1:Math.max(3,record.l4Rejection?.at(-1)?.attemptCap??0)); attempt++) {
      let reservations=[],preparedDraft;
      if(!eligible)record.errorCode=null; // 本次尝试开始前清上次的错误码，成功后不残留
      try {
        if(budget.stopped)throw budget.stopped;
        const offline=eligible?record.protocolRecovery.prior.draftResponse:null;
        const frozen=reuseFrozenDrafts&&!eligible?(record.draft??await reviewDraftFor?.(entry,feedback,context)):null;
        const draftLabel=`content-${path.basename(root)}-${entry.id}-${eligible?'protocol-recovery':'draft'+attempt}`,reviewLabel=`content-${path.basename(root)}-${entry.id}-review${attempt}`;
        const paid=!frozen&&!eligible&&reuse&&attempt===reuse.attempt?reuse.draft:null;
        const expectedDraft=frozen??paid??(offline?await extractDraft(offline,entry):await reviewDraftFor?.(entry,feedback,context));
        if(frozen){const check=await l1(frozen,entry,context);const errors=Array.isArray(check)?check:check.errors??[];if(errors.length)throw Error(errors.join('\n'));record.frozenCandidate={entryHash:hashContent(entry),draftHash:hashContent(frozen)};}
        const draftDetails={entry,context,phase:'draft',feedback,record,file};
        if(!offline&&!frozen&&!paid)preparedDraft=await prepareRequest(await buildDraftRequest(entry,feedback,context),draftDetails);
        let draftBytes=null,plannedDraft=expectedDraft;
        if(expectedDraft===undefined){
          // 起草型：用按 max_tokens 换算的最大占位草稿构造复核请求，求预留上界；其余路径不进入这里。
          draftBytes=preparedDraft?maxDraftBytes(preparedDraft.body):NaN;
          if(!Number.isFinite(draftBytes))throw budget.stop('候选未定且无法证明完整审核请求上界，已停止');
          plannedDraft='"'.repeat(draftBytes);
        }
        // Preflight on a copy so the future review has no emitted receipt yet.
        const plannedReview=await prepareRequest(await buildReviewRequest(entry,plannedDraft,context),{entry,context,phase:'review',draft:plannedDraft,record:structuredClone(record),file});
        reservations=await budget.reserveRound([...(offline||frozen||paid?[]:[{body:preparedDraft.body,label:draftLabel}]),{body:plannedReview.body,label:reviewLabel}]);
        if(!eligible&&!frozen)record.attempts=attempt+1;
        const response = frozen||paid?null:offline??await request(preparedDraft,draftLabel,draftDetails,reservations[0]);
        if(response)record.draftResponse=response;
        record.responseEvidence??=[];
        if(!offline&&!frozen&&!paid)record.responseEvidence.push({phase:'draft',attempt:attempt+1,requestId:reservations[0],...budget.ledger.requests[reservations[0]].responseEvidence});
        record.measurements??=[];if(!offline&&!frozen&&!paid&&response.measurement)record.measurements.push(response.measurement);
        await writeJSON(file,record);
        const extracted=frozen??paid??await extractDraft(response, entry);
        if(draftBytes!==null){if(Buffer.byteLength(JSON.stringify(extracted))>draftBytes)throw budget.stop('起草结果超过已预留的复核请求上界，已停止');}
        record.draft = extracted;
        if(draftBytes===null)assert.deepEqual(record.draft,expectedDraft,'起草结果不符已预留的固定候选');
        const validation = await l1(record.draft, entry, context);
        record.errors = Array.isArray(validation) ? validation : validation.errors ?? [];
        record.warnings = Array.isArray(validation) ? [] : validation.warnings ?? [];
        // L2 covers every syntactically usable draft, even if L1 found errors.
        const reviewDetails={entry,context,phase:'review',draft:record.draft,record,file};
        const preparedReview=await prepareRequest(await buildReviewRequest(entry,record.draft,context),reviewDetails);
        const reviewId=reservations.at(-1);
        // 起草型：预留时用的是占位草稿的复核请求，其哈希必与真实复核请求不同。草稿通过超界检查后，把这份复核预留换成真实请求
        // （新估价必须不超过占位上界，只会减少预留）；发送时的 requestHash 相等检查保持原样。
        if(draftBytes!==null)await budget.replaceReservation(reviewId,{body:preparedReview.body,label:reviewLabel});
        const reviewResponse=await request(preparedReview,reviewLabel,reviewDetails,reviewId);
        record.responseEvidence.push({phase:'review',attempt:attempt+1,requestId:reviewId,...budget.ledger.requests[reviewId].responseEvidence});
        await writeJSON(file,record);
        if(reviewResponse.measurement)record.measurements.push(reviewResponse.measurement);
        if(reviewResponse.rawProviderReviewResponse){
          record.rawProviderReviewResponses??=[];
          record.rawProviderReviewResponses.push({attempt:attempt+1,response:reviewResponse.rawProviderReviewResponse,hash:reviewResponse.rawProviderReviewResponseHash});
        }
        try{record.review = await extractReview(reviewResponse, entry, record);}
        catch(error){if(stopOnReviewError?.(error,entry))halted={id:entry.id,code:error.code??null,message:error.message};throw error;}
        const issues = reviewIssues(record.review);
        record.errors.push(...issues.filter(row => row.severity === 'hard'));
        record.warnings.push(...issues.filter(row => row.severity !== 'hard'));
        if (!record.errors.length) { record.status = 'passed'; record.feedback = null; break; }
        feedback = record.errors;if(frozen)break;
      } catch (error) {
        if(error.code==='CONTENT_BUDGET_STOP'){
          // A queued reservation is not a sent rewrite. Preserve all old attempts.
          if(!eligible&&reservations.length&&budget.ledger.requests[reservations[0]].status==='reserved')record.attempts=attempt;
          record.budgetStop={code:error.code,message:error.message,at:new Date().toISOString()};
          record.status=eligible?'manual':'pending';
          if(preparedDraft?.receipt&&preparedDraft.receipt.status==='started'){preparedDraft.receipt.status='failed';preparedDraft.receipt.error=error.message;}
          if(eligible)record.protocolRecovery.status='budget-stopped';
          await writeJSON(file,record);return record;
        }
        record.errorCode=error.code??null;(record.errorHistory??=[]).push(error.code??null);
        feedback = [String(error.message)]; record.errors = feedback;
        // Transport failure keeps an already sent attempt and its unknown cost.
        if (/费用上限|环境变量|fetch failed|timeout|timed out|HTTP (429|5\d\d)/i.test(error.message)) {
          record.status = eligible?'manual':'pending'; record.feedback = feedback;
          if(eligible)record.protocolRecovery.status='failed';
          await writeJSON(file, record); return record;
        }
      } finally {if(reservations.length)await budget.releaseRound(reservations);}
      record.feedback = feedback;
      if(halted?.id===entry.id)break; // 本条不再请求新的审查，记录按失败写盘
      await writeJSON(file, record);
    }
    if (record.status !== 'passed') record.status = 'manual';
    if(eligible)record.protocolRecovery.status=record.status==='passed'?'passed-L1-L2':'failed';
    await writeJSON(file, record);
    return record;
  }
  try {
  const oldRecords=await Promise.all(entries.map(entry=>readJSON(path.join(root,`${entry.id}.json`))));
  entries.forEach((entry,index)=>recordsById.set(entry.id,oldRecords[index]));
  const priorStop=oldRecords.find(record=>record?.budgetStop);if(priorStop)budget.stop(priorStop.budgetStop.message);
  for (let start = 0; start < entries.length; start += batchSize) {
    const slice = entries.slice(start, start + batchSize), rows = new Array(slice.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, async () => {
      for (;;) { const index = cursor++; if (index >= slice.length) return; rows[index] = await one(slice[index]); }
    }));
    results.push(...rows);
    const index = batches.length, file = path.join(root, `batch-${index}.json`);
    const prior = await readJSON(file), fingerprint = hashContent(rows.map(row => ({ id: row.id, draft: row.draft, review: row.review, status: row.status })));
    const passed = rows.filter(row => row.status === 'passed');
    const batch = {
      index, fingerprint, count: rows.length, passed: passed.length,
      ids: rows.map(row => row.id),
      rewritten: rows.filter(row => row.attempts > 1).length,
      manual: rows.filter(row => row.status === 'manual').map(row => row.id),
      pending: rows.filter(row => row.status === 'pending').map(row => row.id),
      flagged: rows.filter(row => row.warnings.length).map(row => row.id),
      sample: prior?.fingerprint === fingerprint ? prior.sample : randomSample(passed, 5).map(row => row.id),
      l4: prior?.fingerprint === fingerprint ? prior.l4 : { approved: false, notes: [] },
      ...(prior?.fingerprint !== fingerprint && prior?.l4?.rejection ? { l4History: [...(prior.l4History ?? []), prior.l4] } : prior?.l4History ? { l4History: prior.l4History } : {}),
      costUpperYuan: client.spent+(client.reserved??0),
    };
    batch.manualRatio = batch.manual.length / batch.count;
    batch.needsSystemicRepair = batch.manualRatio > 0.1;
    batches.push(batch); await writeJSON(file, batch);
    if (onBatch) await onBatch(batch, rows);
  }
  const summary = { total: entries.length, passed: results.filter(row => row.status === 'passed').length, manual: results.filter(row => row.status === 'manual').length, pending: results.filter(row => row.status === 'pending').length, costUpperYuan: client.spent+(client.reserved??0), budget:budget.ledger, batches, scope: 'L1/L2 审核结果；尚须 L4 抽读与发布校验', ...(halted?{halted}:{}) };
  await writeJSON(path.join(root, 'summary.json'), summary);
  return { results, summary, halted };
  } finally {await budget.close();}
}

// 审批未齐（缺摘要、批次 L4 未批、缺阅读记录、条目未通过）是只读检查的结论而不是程序崩溃：带固定 code，供只读入口以明确原因和非 0 退出码结束。
// 内容在审查后被改动、指纹不符等完整性问题不用这个 code，仍按真错误抛出。
export const approvalIncomplete = message => Object.assign(new Error(message), { code: 'APPROVAL_INCOMPLETE' });
export async function reportApprovalIncomplete(task) {
  try { return await task(); }
  catch (error) {
    if (error?.code !== 'APPROVAL_INCOMPLETE') throw error;
    console.error(`审批未齐，无法完成检查：${error.message}`);
    process.exitCode = 2;
  }
}
export async function readApprovedContent(root, entries, { contextFor = () => null, revision = 'v2' } = {}) {
  const summary = await readJSON(path.join(root, 'summary.json'));
  if (!summary) throw approvalIncomplete('缺少流水线摘要');
  const allowed = new Set();
  for (const batch of summary.batches) {
    const current = await readJSON(path.join(root, `batch-${batch.index}.json`));
    if (!current?.l4?.approved || current.fingerprint !== batch.fingerprint || current.needsSystemicRepair) throw approvalIncomplete(`批 ${batch.index} 尚未完成 L4 或人工队列超过 10%`);
    if (!Array.isArray(current.ids)) throw new Error('批次缺少条目清单');
    const rows = await Promise.all(current.ids.map(id => readJSON(path.join(root, `${id}.json`))));
    if (rows.some(row => !row) || hashContent(rows.map(row => ({ id: row.id, draft: row.draft, review: row.review, status: row.status }))) !== current.fingerprint) throw new Error(`批 ${batch.index} 审查后内容已改变`);
    for (const id of [...current.sample, ...current.flagged]) {
      if (!current.l4.notes?.some(row => row.id === id && typeof row.note === 'string' && row.note.trim())) throw approvalIncomplete(`缺少 L4 阅读记录 ${id}`);
    }
  }
  const out = [];
  for (const entry of entries) {
    const record = await readJSON(path.join(root, `${entry.id}.json`));
    if (record?.status === 'passed') {
      if (record.fingerprint !== hashContent({ entry, context: await contextFor(entry), revision })) throw new Error(`发布骨架或引用事实已改变 ${entry.id}`);
      if (record.errors.length || reviewIssues(record.review).some(row => row.severity === 'hard')) throw new Error(`条目事实审查未通过 ${entry.id}`);
      if (!summary.batches.some(batch => batch.ids?.includes(entry.id))) throw new Error(`条目不在已审查批次 ${entry.id}`);
      if (allowed.has(entry.id)) throw new Error('发布编号重复'); allowed.add(entry.id); out.push(record.draft);
    }
  }
  return out;
}
