// Pure judgement of scheduler result.json objects. No I/O or wall-clock reads.
// candidate / baselineRuns: { runId?, status, files: runnerResult[] }.
// knownFailures (policy/known-failures.json) is an array of records:
// { file, id, path, fingerprint, owner, expiresAt }. path is the runner's array
// of suite/case names; id is the FULL runner case path
// (including its duplicate suffix); expiresAt is YYYY-MM-DD (inclusive UTC) or
// an ISO timestamp. Supply now, or candidate.endedAt, to evaluate expiration.
// expected23, when supplied, is the unchanged test:baseline report shape:
// { failures, expectedFailures }. It is checked separately, never a waiver for
// ordinary failures, and is not populated from knownFailures.

const failuresOf = file => Array.isArray(file?.failures) ? file.failures : [];
const identifiable = failure => typeof failure.id === 'string' && failure.id.length > 0
  && Array.isArray(failure.path) && failure.path.length > 0
  && failure.path.every(part => typeof part === 'string' && part.length > 0)
  && typeof failure.fingerprint === 'string' && failure.fingerprint.length > 0;
const sameFailure = (a, b) => identifiable(a) && identifiable(b)
  && a.id === b.id && a.fingerprint === b.fingerprint
  && JSON.stringify(a.path) === JSON.stringify(b.path);

function usable(file) {
  return file && ['PASS', 'FAIL'].includes(file.status) && !file.timedOut && !file.signal
    && !file.spawnError && (file.status !== 'PASS' ||
      ((file.exitCode === undefined || file.exitCode === 0) && failuresOf(file).length === 0))
    && (file.status !== 'FAIL' || failuresOf(file).length > 0);
}

function expiryTime(value) {
  if (typeof value !== 'string') return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(start) && new Date(start).toISOString().slice(0, 10) === value
      ? start + 86400000 - 1 : NaN;
  }
  // A timestamp must carry its timezone; local timezone must not affect judgement.
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
}

const overall = statuses => statuses.includes('INCOMPLETE') ? 'INCOMPLETE'
  : statuses.includes('FAIL') ? 'FAIL' : statuses.includes('BLOCKED') ? 'BLOCKED' : 'PASS';

export function judge({ candidate, baselineRuns = [], knownFailures = [], expected23,
  now = candidate?.endedAt } = {}) {
  const time = typeof now === 'number' ? now : Date.parse(now);
  const files = (candidate?.files || []).map(file => {
    const result = { file: file.file, sourceStatus: file.status, status: 'PASS', category: '测试',
      reason: '候选文件 PASS', cases: [] };
    if (!usable(file)) {
      const reason = `候选结果不完整：${file.status || '缺少状态'}${file.reason ? `；${file.reason}` : ''}`;
      return { ...result, status: 'INCOMPLETE', category: '基础设施', reason,
        cases: failuresOf(file).map(failure => ({ id: failure.id ?? null, path: failure.path ?? null,
          fingerprint: failure.fingerprint ?? null, location: failure.location ?? null,
          status: 'UNRESOLVED', category: '基础设施', reason })) };
    }
    if (file.status === 'PASS') return result;

    const bases = baselineRuns.slice(0, 2).map(run => run?.files?.find(b => b.file === file.file));
    const independent = baselineRuns.length >= 2 && !(baselineRuns[0]?.runId
      && baselineRuns[0].runId === baselineRuns[1]?.runId);
    result.cases = failuresOf(file).map(failure => {
      const item = { id: failure.id ?? null, path: failure.path ?? null,
        fingerprint: failure.fingerprint ?? null, location: failure.location ?? null };
      if (!identifiable(failure)) return { ...item, status: 'UNRESOLVED', category: '基础设施',
        reason: '候选失败缺少完整用例 id、路径或指纹' };
      if (!independent || bases.length !== 2 || bases.some(b => !usable(b)))
        return { ...item, status: 'UNRESOLVED', category: '基础设施',
          reason: '未取得两次独立且完整的基线文件结果（缺文件、超时、崩溃或不完整）' };
      const matches = bases.map(b => b.status === 'FAIL' && failuresOf(b).some(f => sameFailure(failure, f)));
      if (!matches.every(Boolean)) return { ...item, status: 'REGRESSION', category: '测试',
        reason: `两次基线仅 ${matches.filter(Boolean).length}/2 次出现相同完整用例路径和指纹` };

      const registered = knownFailures.filter(entry => entry && entry.file === file.file
        && entry.id === failure.id && entry.fingerprint === failure.fingerprint
        && JSON.stringify(entry.path) === JSON.stringify(failure.path));
      const known = registered.find(entry => typeof entry.owner === 'string' && entry.owner.trim()
        && Number.isFinite(time) && Number.isFinite(expiryTime(entry.expiresAt))
        && expiryTime(entry.expiresAt) >= time);
      return { ...item, baselineStatus: 'BASELINE_REPRODUCED',
        status: known ? 'KNOWN' : 'BLOCKED_PREEXISTING', category: '测试',
        reason: known ? `两次基线同败；有效登记 owner=${known.owner}，到期=${known.expiresAt}`
          : '两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定' };
    });
    result.status = overall(result.cases.map(c => c.status === 'UNRESOLVED' ? 'INCOMPLETE'
      : c.status === 'REGRESSION' ? 'FAIL' : c.status === 'KNOWN' ? 'PASS' : 'BLOCKED'));
    result.category = result.cases.some(c => c.category === '基础设施') ? '基础设施' : '测试';
    result.reason = result.status === 'PASS' ? '候选失败均为有效登记的 KNOWN' : '详见逐用例判定';
    return result;
  });
  const issues = [];
  if (!candidate || !Array.isArray(candidate.files) || !['PASS', 'FAIL'].includes(candidate.status))
    issues.push({ status: 'INCOMPLETE', category: '基础设施', reason: `候选任务未完整结束：${candidate?.status || '缺结果'}` });
  // An explicitly selected empty set may PASS; a failed job with no file results may not.
  if (candidate?.status === 'FAIL' && !files.some(f => f.sourceStatus === 'FAIL'))
    issues.push({ status: 'INCOMPLETE', category: '基础设施', reason: '候选任务 FAIL 却没有失败文件结果' });
  let historical;
  if (expected23 !== undefined) {
    const valid = Array.isArray(expected23?.failures) && Array.isArray(expected23?.expectedFailures);
    const unexpectedFailures = valid ? expected23.failures.filter(id => !expected23.expectedFailures.includes(id)) : [];
    const unexpectedlyPassing = valid ? expected23.expectedFailures.filter(id => !expected23.failures.includes(id)) : [];
    historical = { status: !valid ? 'INCOMPLETE' : unexpectedFailures.length || unexpectedlyPassing.length ? 'FAIL' : 'PASS',
      unexpectedFailures, unexpectedlyPassing, reason: valid ? '历史预期失败名单精确匹配核对' : '历史基线报告缺少名单' };
  }
  const status = overall([...files, ...issues, ...(historical ? [historical] : [])].map(r => r.status));
  return { status, exitCode: status === 'PASS' ? 0 : 1, files, issues,
    ...(historical ? { expected23: historical } : {}) };
}
