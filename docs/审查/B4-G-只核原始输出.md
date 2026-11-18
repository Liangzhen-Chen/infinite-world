# B4-G《块 4 余卡门禁三项》只核原始输出

- 依据：李白 11-18 16:07 第 1 条、16:3x 第 2 条；对照表 docs/迁移体检/块4-余卡规矩检查对照.md；卷一 §8.2 :638、卷二十七 R27-8.1 :717、R27-8.4 :720。
- 写：DeepSeek（deepseek-flash）两轮：ca28cdd9（rng_bypass 条目 implemented；②③ 只登 registered）、528fdbdf（主会话审 diff 判 ②③ 未建检测器不合"开写前装进门禁"，改：新建 seed_sites 检测器做双向比对与 role_seed 查重/非空前缀、条目转 implemented、vol27 登 docVolumes 消 ORPHAN）。
- 只核：另一 DeepSeek，可封。门禁非内核，不加 Claude。Claude $0。
- 真实读数：rng_bypass 0 命中；seed_sites 两条报 E-ACC-ITEM-PARAM×2（registry 尚无 seedKeys 行，随 4-3 重建，不造表），非 in_core 不拦提交。
- 会话日志：F:/dnd-tools/claude-config-ds/projects/F--dnd-wt-ds-b4g/7f869805-f357-42f7-af63-c6827bcce1b0.jsonl

## 原始输出

卷二十七《离屏性能存档与确定性》、卷十二《验收与自动扫描》：**可封**。仅记账一处：tests/accept/runner.test.mjs:33 的 `seed_sites-` 豁免已无用、注释失实（两条已 implemented），建议下卡删，不拦封。

1 合：卷二 :320 同句写明 Math.random 只在 legacy/、受 E-SEED-KEY 比对（卷二十 :1380 定义含未登记抽取点、卷二十六 P26-5 同码）；a 项真实 0 命中，报/不报两用例过。

4 合：R12-11.7 :1110 要件齐（实现文件在、类别四用例全过）；真实读数 E-ACC-ITEM-PARAM×2（registry 缺 seedKeys 行，随 4-3 重建），非 in_core 故不拦提交，pre_commit verdict pass。

另核：检测器无写死名单（表代号取类别行 seedTable、被调名学自登记行）；vol27 三条 ORPHAN 已消。node --test 480 项 479 过，唯一败 runner.test.mjs:128 为旧基线 0<0（非本卡）；`node tools/accept/run.mjs pre_commit` pass。

（主会话：runner.test.mjs:128 由另卡 9b624323 修；:33 `seed_sites-` 无用豁免并入 4-3 卡删。）
