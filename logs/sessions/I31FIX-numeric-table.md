# I31FIX numeric-digest 对比

同一 Node v24.13.1 / V8 13.6.233.17-node.40。13 项数值函数的 sha/sample 比较，变化：[]。

| 字段 | 旧 → 新 | 原因 |
| --- | --- | --- |
| state.full | 28a5db8ece66a580e4523ca21b0ba3dbe8e5c54aef2da9a861981bcdbc921340 → ce0c3dbcaadd9dd307db803476b5560ec93766308c3d6ab2e223e48f360c5b12 | 违约当刻发布，稳定事件 ID 与 seq 排序变化；详见 golden-table |
| state.quiet | 00ca362dfe34d9f6ce6bb2425cea3e4148a8f04930f33b843441f374f5a0db5e → f805bd21b8d1e247f504a84ba206db5e11de8fe58b89b006ffa4cdff9747ae63 | 违约当刻发布，稳定事件 ID 与 seq 排序变化；详见 golden-table |
