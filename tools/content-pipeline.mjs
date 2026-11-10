import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomInt } from 'node:crypto';
import assert from 'node:assert/strict';
import {openContentBudget} from './content-budget.mjs';

export const hashContent = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseModelJSON(response) {
  const message = response.choices?.[0]?.message;
  const raw = message?.tool_calls?.[0]?.function?.arguments ?? message?.content;
  if (typeof raw !== 'string') throw new Error('模型没有返回 JSON 正文');
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
export function defaultReviewRequest(entry, draft, context) {
  return {
    thinking: { type: 'disabled' }, temperature: 0, max_tokens: 1800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是游戏内容事实审查员。逐句核对说明与骨架及引用事实，只返回 JSON {"contradictions":[{"quote":"说明原句","field":"骨架字段路径","severity":"hard|soft|style","reason":"具体原因"}]}。hard 表示数值、材料、用途、能力、食性、归属、时间、取得途径等与骨架相反或新增没有依据的功能。正常且相容的感官细节不是新增功能。不推测骨架没有声明的规则。不因没有重述全部骨架字段报错。无矛盾则空数组。' },
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
  await fs.mkdir(root, { recursive: true });
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
    const recovering=protocolRecoveryIds.length>0;
    let eligible=recovering&&protocolRecoveryIds.includes(entry.id)&&entry.contract==='audit-patch-v1'&&record?.fingerprint===fingerprint&&record.status==='manual'&&!record.review&&!record.protocolRecovery&&
      hasWrapperEvidence(record,entry);
    if(eligible)eligible=await budget.claimProtocolRecovery(entry.id,fingerprint);
    if(recovering&&!eligible)return record??{id:entry.id,fingerprint,status:'pending',attempts:0,draft:null,review:null,errors:[],warnings:[]};
    if (!eligible&&record?.fingerprint === fingerprint && (record.status === 'passed' || record.status === 'manual' && !retryManual)) return record;
    let feedback = record?.fingerprint === fingerprint ? record.feedback : null;
    const priorAttempts = record?.fingerprint === fingerprint ? record.attempts ?? 0 : 0;
    if(eligible){record.protocolRecovery={kind:'audit-patch-v1-single-wrapper',startedAt:new Date().toISOString(),prior:structuredClone(record),status:'started'};record.status='pending';await writeJSON(file,record);}
    else record = record?.fingerprint===fingerprint?structuredClone(record):{ id: entry.id, fingerprint, status: 'pending', attempts: priorAttempts, draft: null, review: null, errors: [], warnings: [], feedback };
    record.status='pending';
    if(storeContext)record.contextSnapshot=JSON.parse(JSON.stringify(context??null));
    for (let attempt = priorAttempts; attempt < (eligible?priorAttempts+1:3); attempt++) {
      let reservations=[],preparedDraft;
      if(!eligible)record.errorCode=null; // 本次尝试开始前清上次的错误码，成功后不残留
      try {
        if(budget.stopped)throw budget.stopped;
        const offline=eligible?record.protocolRecovery.prior.draftResponse:null;
        const frozen=reuseFrozenDrafts&&!eligible?(record.draft??await reviewDraftFor?.(entry,feedback,context)):null;
        const draftLabel=`content-${path.basename(root)}-${entry.id}-${eligible?'protocol-recovery':'draft'+attempt}`,reviewLabel=`content-${path.basename(root)}-${entry.id}-review${attempt}`;
        const expectedDraft=frozen??(offline?await extractDraft(offline,entry):await reviewDraftFor?.(entry,feedback,context));
        if(frozen){const check=await validateDraft(frozen,entry,context);const errors=Array.isArray(check)?check:check.errors??[];if(errors.length)throw Error(errors.join('\n'));record.frozenCandidate={entryHash:hashContent(entry),draftHash:hashContent(frozen)};}
        const draftDetails={entry,context,phase:'draft',feedback,record,file};
        if(!offline&&!frozen)preparedDraft=await prepareRequest(await buildDraftRequest(entry,feedback,context),draftDetails);
        let draftBytes=null,plannedDraft=expectedDraft;
        if(expectedDraft===undefined){
          // 起草型：用按 max_tokens 换算的最大占位草稿构造复核请求，求预留上界；其余路径不进入这里。
          draftBytes=preparedDraft?maxDraftBytes(preparedDraft.body):NaN;
          if(!Number.isFinite(draftBytes))throw budget.stop('候选未定且无法证明完整审核请求上界，已停止');
          plannedDraft='"'.repeat(draftBytes);
        }
        // Preflight on a copy so the future review has no emitted receipt yet.
        const plannedReview=await prepareRequest(await buildReviewRequest(entry,plannedDraft,context),{entry,context,phase:'review',draft:plannedDraft,record:structuredClone(record),file});
        reservations=await budget.reserveRound([...(offline||frozen?[]:[{body:preparedDraft.body,label:draftLabel}]),{body:plannedReview.body,label:reviewLabel}]);
        if(!eligible&&!frozen)record.attempts=attempt+1;
        const response = frozen?null:offline??await request(preparedDraft,draftLabel,draftDetails,reservations[0]);
        if(response)record.draftResponse=response;
        record.responseEvidence??=[];
        if(!offline&&!frozen)record.responseEvidence.push({phase:'draft',attempt:attempt+1,requestId:reservations[0],...budget.ledger.requests[reservations[0]].responseEvidence});
        record.measurements??=[];if(!offline&&!frozen&&response.measurement)record.measurements.push(response.measurement);
        await writeJSON(file,record);
        const extracted=frozen??await extractDraft(response, entry);
        if(draftBytes!==null){if(Buffer.byteLength(JSON.stringify(extracted))>draftBytes)throw budget.stop('起草结果超过已预留的复核请求上界，已停止');}
        record.draft = extracted;
        if(draftBytes===null)assert.deepEqual(record.draft,expectedDraft,'起草结果不符已预留的固定候选');
        const validation = await validateDraft(record.draft, entry, context);
        record.errors = Array.isArray(validation) ? validation : validation.errors ?? [];
        record.warnings = Array.isArray(validation) ? [] : validation.warnings ?? [];
        // L2 covers every syntactically usable draft, even if L1 found errors.
        const reviewDetails={entry,context,phase:'review',draft:record.draft,record,file};
        const preparedReview=await prepareRequest(await buildReviewRequest(entry,record.draft,context),reviewDetails);
        const reviewId=reservations.at(-1),reviewResponse=await request(preparedReview,reviewLabel,reviewDetails,reviewId);
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

export async function readApprovedContent(root, entries, { contextFor = () => null, revision = 'v2' } = {}) {
  const summary = await readJSON(path.join(root, 'summary.json'));
  if (!summary) throw new Error('缺少流水线摘要');
  const allowed = new Set();
  for (const batch of summary.batches) {
    const current = await readJSON(path.join(root, `batch-${batch.index}.json`));
    if (!current?.l4?.approved || current.fingerprint !== batch.fingerprint || current.needsSystemicRepair) throw new Error(`批 ${batch.index} 尚未完成 L4 或人工队列超过 10%`);
    if (!Array.isArray(current.ids)) throw new Error('批次缺少条目清单');
    const rows = await Promise.all(current.ids.map(id => readJSON(path.join(root, `${id}.json`))));
    if (rows.some(row => !row) || hashContent(rows.map(row => ({ id: row.id, draft: row.draft, review: row.review, status: row.status }))) !== current.fingerprint) throw new Error(`批 ${batch.index} 审查后内容已改变`);
    for (const id of [...current.sample, ...current.flagged]) {
      if (!current.l4.notes?.some(row => row.id === id && typeof row.note === 'string' && row.note.trim())) throw new Error(`缺少 L4 阅读记录 ${id}`);
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
