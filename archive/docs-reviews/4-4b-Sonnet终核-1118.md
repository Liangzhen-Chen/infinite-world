# 4-4b 终核（Sonnet 5.5，只读，11-18）

（原文由主会话从 F:/dnd-tmp/review/ 原样入库。）

结论：**可封**。无"必须改"项；两条非阻断建议见末尾。

## 核查范围与证据
- 分支 ds/44b，`git diff origin/master...ds/44b`：26 文件。
- 命令：`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`（表值逐位一致）。
- 命令：`node --test "tests/kernel/*.test.mjs" "tests/accept/*.test.mjs"` → tests 591 / pass 591 / fail 0。
- 已有只核两份（4-4b-DS只核-1118、只核2-1118）的条目未重做。

## 重点逐项
1. 七函数与卷二十七 R27-5.2（现 :570–:575）一致：
   - 查表插值 `server-plugin/kernel/det-math.mjs:396`，BigInt 除法向零截断，域外 E-DET-DOMAIN，不外推不钳位（含负值用例，tests/kernel/det-numeric-fn.test.mjs:34–40）。
   - sin/cos 先取余再查表（det-math.mjs:421 一带，负数取余落在 [domainMin, domainMax)）。
   - atan 域外按 sign·π/2−atan(1/x) 折回，π/2 取自表 x=1 的值 ×2，无另设常数（det-math.mjs:445 一带）。
   - sqrt 牛顿固定步数 `iterations`、不查表、取 min(y, n/y)（det-math.mjs:470 一带）。
   - pow = fixedExp(k·ln x)，底数 ≤0 拒（E-DET-DOMAIN）。
   - exp 只调 fixedExp，无另立表（该行无 values，加载检查有测试）。
2. 表值离线生成，`--check` 逐位通过；每行 basis 非空由加载器查（load/rules.mjs `checkFnRow`），values 长度与 step 整除也在加载期查。
3. `checkedFixed` 改报 E-DET-OVERFLOW，上限取登记的 safeIntMax（det-math.mjs:66–70）；全仓调用方只有 det-math 内部定点运算，无遗留断言期待旧码；E-DET-OVERFLOW 已在 error-codes.mjs:172。无放宽。
4. 旧 `fn_` 名：detfn 为代码内封闭枚举（handles/markers.mjs:36），`fnTables` 以枚举作 map 键，旧名按枚举校验加载即拒（tests/kernel/det-numeric-tables.test.mjs:83 有用例）。全仓非历史文件已无旧名；残留只在 docs/迁移体检/块4*.md（历史体检记录）与勘误前快照、审查原文、卷十七/卷二十七修订记录行内（历史记录，按裁定不回改）。
5. 无写死、无按名特判：fnTable 形状检查按值形状识别，缺行检查从 CODE_ENUMS 派生；无为测试造设施（detectors.test 的 `rows.length` 改为 ≥1，是把此前的偶然数字字面量 9 去掉，符合卡头第 4 条）。criteria.json 为 rev 递增 + print 重盖，形态与登记器产出一致（未发现手改痕迹）。

## 非阻断建议（不影响封）
- A. `sqrt` 在 det-math.mjs 与 sample.mjs:286 `isqrt`（4-3 triangular 用，卷二 §1.10 :327）各有一份牛顿法整数开方。卷二十七 :574 写"用卷二 §1.10 的整数开方"，严格说应共用一份。两者行为不同（后者迭代到收敛、无固定步数），属 4-3 既有代码，不在本卡文件清单内，建议记入 docs/问题.md 待块 4 之后合并，不拦封。
- B. 卷二十七 §2.2 表中 detfn 相关行号随勘误前后有位移（卡文写 :167–:171，现为 :168–:172）；仅文档行号，不影响内容。

## 主会话处置（11-18）
A 属真缺陷（卷二 §1.10 :326 写"牛顿法固定 32 步"，sample.mjs isqrt 迭代到收敛，与卷文不符且与 det-math sqrt 两份实现），记 docs/问题.md 并排小卡 4-4c 合并为一份；不拦 4-4b 封。B 不处理。
