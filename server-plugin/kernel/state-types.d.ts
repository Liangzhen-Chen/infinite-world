// 生成文件，勿手改：tools/gen-state-types.mjs 由 world/ontology/state-owners.json 的 pathTypes 生成（卷二 §2.8 第 1 条末句）。
// 改 pathTypes 后重跑 node tools/gen-state-types.mjs；tests/kernel/state-owners.test.mjs 比对本文件与生成结果。

import type { Handle, EntityId, EventId } from './types.d.ts';

/** dimension 路径的值：按该维度表声明（§1.5 维度类型；string 维度不进 dimension 路径，§2.7）。 */
export type DimensionValue = number | boolean | null | Handle<string> | EntityId<string> | readonly DimensionValue[] | { readonly [field: string]: DimensionValue };
/** 命名 struct（§1.5 命名 struct 登记）；字段类型待命名 struct 有机读登记后生成，现只带名字。 */
export type StructValue<N extends string> = { readonly [field: string]: unknown } & { readonly __struct?: N };
/** textPaths 的封装值（§2.9 第 3 条）；Sealed 本身的声明不在规则层可见的文件里，这里只作不透明占位。 */
export type SealedValue = { readonly __brand: 'SealedValue' };

/** pathTypes 每条模式的值类型。 */
export interface PathTypes {
  readonly 'accounts.*': StructValue<'holderAccounts'>;
  readonly 'aggregates.*.ledgerHolder': boolean;
  readonly 'clock.dueNext': number;
  readonly 'clock.minute': number;
  readonly 'clock.seq': number;
  readonly 'created.*.props.*': DimensionValue;
  readonly 'created.*.props.basis': StructValue<'basis'>;
  readonly 'displayNames.*.seq': number;
  readonly 'displayNames.*.text': SealedValue;
  readonly 'due.*': StructValue<'dueItem'>;
  readonly 'holdings.*.*': StructValue<'holding'>;
  readonly 'ledgerCounters.lotNext': number;
  readonly 'ledgerTotals': StructValue<'resourceTotals'>;
  readonly 'narration.*': SealedValue;
  readonly 'outflowTotals.*': StructValue<'holderOutflow'>;
  readonly 'pendingPost.*': readonly (StructValue<'pendingPost'>)[];
  readonly 'playerNotes.*.text': SealedValue;
  readonly 'statuses.*': readonly (StructValue<'statusInstance'>)[];
  readonly 'stockLots.*': StructValue<'holderLots'>;
  readonly 'terminated.*': StructValue<'terminated'>;
}

/** 模式 P 在 pathTypes 里声明的值类型（§2.6 第 1 条 PathValue<P>）。 */
export type PathValue<P extends keyof PathTypes> = PathTypes[P];

/** state 的形状：按 pathTypes 各模式展开，`*` 段为索引签名。 */
export type State = {
  readonly accounts?: { readonly [segment: string]: StructValue<'holderAccounts'> };
  readonly aggregates?: { readonly [segment: string]: {
      readonly ledgerHolder?: boolean;
    } };
  readonly clock?: {
    readonly dueNext?: number;
    readonly minute?: number;
    readonly seq?: number;
  };
  readonly created?: { readonly [segment: string]: {
      readonly props?: {
        readonly basis?: StructValue<'basis'>;
      } & { readonly [segment: string]: (DimensionValue) | (StructValue<'basis'>) };
    } };
  readonly displayNames?: { readonly [segment: string]: {
      readonly seq?: number;
      readonly text?: SealedValue;
    } };
  readonly due?: { readonly [segment: string]: StructValue<'dueItem'> };
  readonly holdings?: { readonly [segment: string]: { readonly [segment: string]: StructValue<'holding'> } };
  readonly ledgerCounters?: {
    readonly lotNext?: number;
  };
  readonly ledgerTotals?: StructValue<'resourceTotals'>;
  readonly narration?: { readonly [segment: string]: SealedValue };
  readonly outflowTotals?: { readonly [segment: string]: StructValue<'holderOutflow'> };
  readonly pendingPost?: { readonly [segment: string]: readonly (StructValue<'pendingPost'>)[] };
  readonly playerNotes?: { readonly [segment: string]: {
      readonly text?: SealedValue;
    } };
  readonly statuses?: { readonly [segment: string]: readonly (StructValue<'statusInstance'>)[] };
  readonly stockLots?: { readonly [segment: string]: StructValue<'holderLots'> };
  readonly terminated?: { readonly [segment: string]: StructValue<'terminated'> };
};
