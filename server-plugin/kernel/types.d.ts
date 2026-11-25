// 代号类品牌类型（卷二 §2.8 第 1 条、§2.9 第 2 条"声明文件分两份"）。本文件只放代号类品牌，规则层可见；
// 文字相关的不透明类型（RawText、Sealed、Credential、TextScope、Secret、NamingIntent、ReplyHandle 等）在 kernel/text-types.d.ts，不在此。
// 形态一律 `string & { readonly __brand: '…' }`（§2.8 第 1 条）；只能由 kernel/handles/* 的构造函数产生（§2.9 第 2 条强转豁免文件表）。
// state 的类型与 PathValue<P> 由 pathTypes 生成在 kernel/state-types.d.ts（§2.8 第 1 条末句），不在此。

/** 词表代号；F 为族名。构造：V.<族名>.<id>（kernel/handles/generated.mjs，经 vocab-handle.mjs）。 */
export type Handle<F extends string> = string & { readonly __brand: `Handle<${F}>` };

/** 实体 id；K 为 22 类 kind、`effect` 或 `note`。构造：kernel/handles/entity-id.mjs。 */
export type EntityId<K extends string> = string & { readonly __brand: `EntityId<${K}>` };

/** 事件 id（§1.5"事件 id 类型 EventId"）。不是实体，无 kind。 */
export type EventId = string & { readonly __brand: 'EventId' };

/** 持有边 id（§2.8 第 1 条；用法同 EventId，只作不透明值）。 */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/** 维度键 `<kind>.<dimension>[<key>]`。拼接只在 kernel/handles/keys.mjs。 */
export type DimKey = string & { readonly __brand: 'DimKey' };

/** 修正键（§3.1）。拼接只在 kernel/handles/keys.mjs。 */
export type ModKey = string & { readonly __brand: 'ModKey' };

/** 种子键（§1.10）。 */
export type SeedKey = string & { readonly __brand: 'SeedKey' };

/** 声明节点名 `view:…` 等（§2.3）。 */
export type NodeName = string & { readonly __brand: 'NodeName' };

/** 错误码 `E-*` / `W-*`（§4.2、§4.3）。构造：E.<标识符>（连字符换下划线）。 */
export type ErrorCode = string & { readonly __brand: 'ErrorCode' };

/** 加载期编译的表达式登记号。 */
export type RxId = string & { readonly __brand: 'RxId' };

/** state 路径；P 为 pathTypes 里某条模式的字面量类型，只作 readPath/writePath 的实参（§2.6）。构造：句柄 P。 */
export type StatePath<P extends string> = string & { readonly __brand: `StatePath<${P}>` };

declare global {
  // 缺读数的求值失败在 Error 上带 key（kernel/rx.mjs 的 missing / RxError.key），让调用方分清"该键是已知的没有"与"该键未知"；
  // 其余错误不设该键，读到的是 undefined。类型层只声明可选的附加键，不新增运行期字段。
  interface Error {
    key?: string;
  }
}
