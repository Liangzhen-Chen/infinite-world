# 锚点修订只核（二）：verb-emitter 逐格解析二

只核者：claude-opus-5-5 中档，2026-11-14。只读，没改任何卷和脚本。核对依据：`审查/锚点修订-verb-emitter与卷十九-只核.md` 问题 1。

## 结论：通过

## 一、diff 与现文件一致

- `diff check-verb-emitter.mjs.bak-1114-逐格二 check-verb-emitter.mjs` 与 `脚本/检查脚本锚点改动/check-verb-emitter-逐格解析二.diff` 一致，只改三处：新增 `EMIT_LEAD`、`hasOtherVerbKey`、`continues`；`emitWindows` 的跟句条件由 `ANAPHOR` 换成 `continues`；调用处把本动词的 `keys`（句柄或代号加别名）传进去。
- `.bak-1114-逐格` 与 `.bak-1114-逐格二` 的差异就是上一轮的逐格解析，本轮没有动它，也没有动撞号部分。
- 改法和上轮建议一致，对所有动词通用：下一句以"发出系统为 / 发出者是（为） / 唯一发出方 / 由…发出"开头，并且这一句里没有出现别的动词键（别的 `roles.verbs.*`、在句柄表里的反引号裸写名、别的 `verb_*` 代号）时，才并入窗口。没有针对具体动词写特例，判定标准也没有放宽。

## 二、注入复验（F:/temp/vchk-1114 下的 inject.mjs、inject2.mjs，每次只注入一处）

| 编号 | 新版 | 期望 |
|---|---|---|
| V1–V5 kindOnly 各种声明或发出 | 都是 FAIL | FAIL ✓ |
| V6 / V7 非 kindOnly，有别卷声明或别卷发出语句 | 需人工 | 需人工 ✓ |
| **V8** 省略主语的次句"发出系统为卷八市集结算。" | **FAIL**（上轮是 PASS） | FAIL ✓，漏洞已堵 |
| V9 字段用法 `x.showAnnounced` | PASS | PASS ✓ |
| V10 撞号 | 可能撞号 1 组 | ≥1 ✓ |
| W1 未登记动词出现在两卷 | 需人工 | ✓ |
| W2 kindOnly 缺 kindFrom/三栏引用 | FAIL（引用 0 处） | ✓ |
| W3 / W4 代号形在别卷声明、在表格非首格声明 | 需人工 | ✓ |

## 三、自构例（F:/temp/vchk-1114b/inject3.mjs，注入卷二十三副本）

| 编号 | 注入内容 | 结果 |
|---|---|---|
| C1 | 句柄句。`由卷八市集结算发出。` | FAIL ✓ |
| C2 | 句柄句。`唯一发出方（卷八市集）。` | FAIL ✓ |
| C3 | 表格非首格两句，次句`发出者是卷八市集` | FAIL ✓ |
| C4 | 句柄句。无关句。`发出系统为…`（隔了一句） | 不并入，PASS（只承接紧邻的下一句，和指代句规则一样） |
| C5 | 次句`发出系统为…`，同一句里点名 `roles.verbs.showBegun` | showAnnounced 不挂（PASS）；声明归到 showBegun，判需人工 ✓ |
| C6 | 次句`由…发出 \`yielded\``（裸写别的句柄） | showAnnounced 不挂；声明归到 yielded，判需人工 ✓ |

C5、C6 说明：次句里点名了别的动词时，不会把声明挂到上一句的动词头上。这也就是卷二十三:201 那类跨句误挂的防线。

## 四、卷二十三:201 等误抓没有带回

- 现文实跑：showAnnounced 判 PASS（声明 0 处），showBegun 判 PASS（声明 0 处）。
- 把本版逐条判定与上轮新版输出（F:/temp/vchk-1114/new.out）逐行比较：除卷二十七行号顺移一行外完全一致，没有新增的声明，也没有判定结果变化。

## 五、重跑

`node F:/dnd-tmp/book/check-verb-emitter.mjs`
- 本轮开始时：① PASS 60 FAIL 0 需人工 23；② 可能撞号 0 组。
- 收尾时再跑：① PASS 61 FAIL 0 需人工 23；② 0 组。多出的一条是正文在核查期间新加的 `verb_invite_refused`（卷九，别名"拒绝应答事件"），判 PASS（登记卷即发出卷），和本次脚本改动无关。

## 六、余事

- 注入副本目录 docs 每轮跑完都删了；自建的检查脚本副本 F:/temp/vchk-1114b/v-new.mjs 也删了。注入脚本 inject3.mjs 和输出 real2.out 留作证据。F:/temp/vchk-1114 下的 v-new.mjs、v-old.mjs、c19*.mjs、r19*.mjs 是 inject.mjs 重跑时按原名重新生成的副本，另外留下了输出 real.out。
