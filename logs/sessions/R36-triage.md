## action-registry
✖ failing tests:
✖ world_act 与 world_actions 进入工具面但不算动作，静态提示不增加（≤ A1 前 10593 token） 
      1 ✔ /actions 只读目录与 /execute 的 world_act：事件存旧调用、回执带事件流文字、幂等与只读动作拒绝 (741.0674ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: 静态提示 10600 token

## arch-metrics
✖ failing tests:
✖ import 图：每个模块都已标层，没有新增的向上依赖或包间 import 
      1 expected: [],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## w2-s4
✖ failing tests:
✖ 隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存 
      2 ✖ 隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存 (2106.5095ms)
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

