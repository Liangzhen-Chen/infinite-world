模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二七审 B（第七版，1659 行）

静态阅读，未运行任何东西。input-view 对照了 F:/dnd/extension/input-view.mjs。

## 结论：有条件通过（2 条机制层真问题）

## 一、六审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| P1 原样传递/obj[text]/Map 来源 | 已解决（由新机制取代） | L448 位置白名单：展开、迭代、解构、内建函数、`obj[text]`、模板、`+` 全不在白名单；L476 容器键类型须为品牌，裸 string 构造的 Map/Set 违例 |
| P2 类型来源 | 已解决 | L445、L448 `tsc --checkJs` + JSDoc 品牌类型 + typescript-eslint 类型感知规则；L1617 注明卷一扫描底线改为类型感知 |
| P3 id 泄漏实现 | 已解决 | L432 `matchIdLeak`（gate 组的函数），L459 gate 的 needle 可取自代号登记表；aiGate 只调用 |
| P4 pathTypes | 已解决 | L413 textWriters 补齐 records、basis；L683 E-PATH-UNDECLARED、E-WRITER-MISSING；L1492 dimension 路径不含 string |
| P5 input-view 迁移行 | 已解决 | L1218 与代码吻合：`inputForMode` 的中文前缀正则（:1-4）、`prepareInput`（:5-8）、整句中文预设按钮（:20）、`mountInput` DOM（:9-32）；`.length`（:7）、模板插值（:22）、`===`（:7）均在重写范围；"规范化+查表"明确为新写 |
| 小项 | 已解决 | aiGate 长度按码点数（L432）；labels 查表键为 EntityId/Handle（L458）；其余两条（哈希排除表重复、L220 拆条）未逐项复核，记入小项 |

## 二、对 §2.8 机制本身的评估

**原理上能堵住上轮那一类绕法：** 展开、迭代、解构、`obj[text]`、传给内建函数、非品牌键的 Map/Set，在"类型为 string 或品牌的表达式只许出现在白名单位置"这条下全部自动违例，不靠枚举；构造品牌值只许 kernel 组，堵了裸字串伪造。15 条正反例（L467-481）覆盖了主要类别，代表性够；日后新绕法归卷十二，我不计入。

**机制本身的缺陷（真问题）：**

**Q1　类型系统的逃逸口没有封闭（L445-L448）。**
位置白名单只对"静态类型为 string 或品牌"的表达式生效。以下写法让表达式变成 `any`/`unknown`，类型检查随之失效，等于整个机制的后门：显式 `any`、`as any`/`as unknown as …`、`JSON.parse()` 的返回值（any）、`// @ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 注释、不在 tsconfig include 里的规则层文件、未开 `strict`/`noImplicitAny`。`any` 还可以直接赋给品牌形参，绕开"只有 kernel 构造品牌"。现有条款只写了"无类型标注的导出函数参数视为失败"（L448），不够。须补一条封闭条款：规则层与各非 kernel 组启用 `strict`；`no-explicit-any` 与 `no-unsafe-*` 全系（argument/assignment/call/member-access/return）；禁止 `@ts-ignore/@ts-nocheck/eslint-disable`；tsconfig `include` 必须覆盖 `server-plugin/**`，门禁核对覆盖无遗漏（新码 E-TSC-COVERAGE）；`as` 断言在 kernel 组之外一律违例（现仅覆盖"强转裸字串为品牌"）。另须写明 state 的 JSDoc 类型由 state-owners 的 pathTypes 生成，不是 `any`（规则层只经 View 读，但写者模块要读 state）。

**Q2　位置白名单与自己的正例不一致（L448 对 L468、L479）。**
白名单列出的位置只有：`===` 两侧、同品牌形参实参、`return`、对象属性初始化、Map/Set 键。没有"局部变量声明/赋值"，但 L479 `const {family} = st.dims` 判"通过"，真实代码也必然有 `const f = fact.value`。还有三元/`??` 合流、数组字面量元素（`[V.a.x, V.a.y].includes(x)`）。须补："变量声明与赋值，且目标类型为同一品牌"为合法位置，并写明三元与 `??` 的合流只在两个分支同品牌时通过（`??` 作默认填充另按 E-VIEW-FALLBACK）；数组/`includes` 要么列为合法（元素同品牌），要么明说违例、规则层改用 Set。否则实现者无法按字面做出与正例一致的检查器。

## 三、措辞小项（记账）

- L420 写"五个模块组…五组文件级不相交"，但 §1.1 L47、L410、L433-434 已有第六组 kernel（"六组之外"）；统一为"六个模块组"，并写 kernel 与其余五组是否也文件级不相交。
- "typescript-eslint 类型感知规则"：现成规则做不了"两侧同品牌 + 位置白名单"，需要自写自定义规则；§2.8 开头"现成做法"建议改为"在现成工具上自写一条规则"，工作量归卷十二。
- `Text` "只在 display/aiGate/outputGate 组可见"（L445）靠 TS project references 或分组 tsconfig 实现，建议一句话点明。
- `matchIdLeak` 以"登记表条目子串"为准（L432），无前缀的单例 id（如 `player`）会在普通文本里高频误报；规定只用带前缀的 id 做 needle，单例 id 豁免或另议。
- L448 的 `return` 位置请写成"返回类型声明为同一品牌"，避免只要是 return 就放行。
- 另见前两项未核对的小项：哈希排除表两条描述重复、L220 行拆条。

## 偏离指令之处

无。未提交 git。
