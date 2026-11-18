# B2-W2b《门禁基线写者（R12-8.5）与 S13 kernel 组逐行基线登记》只核原始输出

- 依据：卷十二 R12-8.4、R12-8.5、R12-8.9（:947–:952）、:468；卷二 S13 :2415；李白 11-18 08:18 第 1 条。主会话技术决定立卡（PLAN 已记）。
- 写：DeepSeek（deepseek-flash）两轮：42355e2a（基线写者、集合比较、S13 拆 k1/k3/k4）、6ba4279b（必改：B0 按基线提交数、--merge-ref 必填、执行器重生成 baseline.json）。
- 只核：另一 DeepSeek 两轮（首轮必须改、复核可封）。门禁设施非内核，不加 Claude。Claude 花费 $0。
- 会话日志目录：F:/dnd-tools/claude-config-ds/projects/F--dnd-wt-ds-b2w2b/

## 一轮只核（1c669116-e7db-4a18-bcbf-24433a12c7cd.jsonl；审 42355e2a）

照卷十二《验收与自动扫描》。

**不可封：必须改 1 条。**
- 新分量首次登记把 B0 直接取成本次实测：`run.mjs:71-76`（无基线行即 pass）、`:90-92`（`b0=current`）、`:216` 同源。R12-8.9（卷十二:952）原句是"对基线提交数出 B0，再对当前内容数出现值，两个数一起登记"；现只数一棵树，B0 与 current 恒等，同一次合入新增的违例可随新分量无声登入基线（`baselineVerdict` 首行对无基线行一律 pass）。

**第 2 条结论**：属放宽，卷文推不出，必须改。依据卷十二:952（R12-8.9）、:947（R12-8.4）。本卡数据上两数恰好相同（本提交未动 kernel，c8a2bccd 即基线提交），但机制不合。
**第 4 条结论**：非本卡新增（`git show --stat` 只动 tools/accept、tests/accept）。+6 来自 B2-W2 重写的 det-math：旧版 2 处字面量比较（`c8a2bccd^:35-36`）→新版 8 处（`parseDecimalLiteral` 6 处，det-math.mjs:74/80/88/91）。664 是 B2-W2 动手前的临时扫描约数（李白裁定-1117:957；同处 ③ 记 61、B2-W2 实测 64，口径本有差），无逐行清单可对平。

其余核过：行键=分量|文件|符号链|节点种|序号，无行号（run.mjs:107-112，合 §2.6:347-355）；`baseline.json` 键序/行序与 `writeBaseline`+`stableJson` 一致，20 分量、k1/k3=0、k4 行键 670；集合比较、只降不升、仅 pre_merge 且 pass 后写均符卡。验收：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → 460 pass / 0 fail；`node tools/accept/run.mjs pre_commit` → verdict pass，k4 current=last=670、diff 0。
提示：lastMergeRef 全空、CLI 无传参路径（R12-8.5 要记合入号），合入时须传 opts.mergeRef。

## 复核（c643141f-938e-44a4-8027-39a2783c6ae6.jsonl；审 6ba4279b）

照卷十二《验收与自动扫描》。

**可封。**（无必须改）
- B0 按基线提交用 git ls-tree/show 数出、不碰工作树，无 B0 即 fail（run.mjs:70/81/95；卷十二:952）；合入号必填，缺 `--merge-ref` 退 2 报 E-ACC-BASELINE-EDIT（run.mjs:117/374；卷十二:948、:512；error-codes.mjs:66）。
- 新 baseline 20 分量、c_text_kernel_4 b0/current 670、rowKeys 670 且已排序、lastMergeRef=938b3371；该文件 938b3371 主线不存在（42355e2a 首建），删旧重生成属初始化，值未升（670→670），非绕过只降不升。
- 命令：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → 462 pass / 0 fail（三条自测含"B0 在基线提交内容上数出"均过）；`node tools/accept/run.mjs pre_commit` → verdict pass，kernel b0=last=current=670、diff 0（另有 3 条非 in_core 的 vol12 条目不过，不挡）。
