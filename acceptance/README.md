# 独立验收包

- 各卡的验收包，由不看实现的验收方编写；实现方只许运行，不许修改。
- 本机路径是 F:/dnd-tmp/<包>/，这里是同步过来的副本，供李白在 Linux 上跑 30 天长测。
- 用法：`ACC_REPO=<被测仓库> node acceptance/<包>/acceptance.mjs --days 30`。各包的细节见各自的 README.md。
- 本分支只放验收脚本，和代码分支无关。
