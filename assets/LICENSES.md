# 本地字体

assets/visual/ 的 80 张场景 SVG、职业纹章、logo.svg 与 logo.png 为《无限原野》T82 原创几何素材，2026-10-13 由 tools/build-m6-art.mjs 绘制，未使用外部图片、图像生成服务或小说素材。项目作者以 CC0 1.0 Universal 将这些视觉素材贡献至公共领域，允许复制、修改及商业使用，无需署名；不涉及本文件记录的字体。许可全文：https://creativecommons.org/publicdomain/zero/1.0/legalcode 。

正文使用 Noto Serif SC Regular，来源为本机安装的 NotoSerifSC-VF.ttf，固定 400 字重后转为完整 WOFF2，未删减字形。上游为 [Google Fonts Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc)，版权及 SIL Open Font License 1.1 全文见 fonts/NotoSerifSC-OFL.txt。

标题使用 [霞鹜文楷 LXGW WenKai](https://github.com/lxgw/LxgwWenKai) 的 LXGWWenKai-Regular.ttf，系统文字使用 [思源黑体](https://github.com/adobe-fonts/source-han-sans) release 分支的 SourceHanSansSC-Regular.otf。两者均仅转换为完整 WOFF2；版权及 SIL Open Font License 1.1 全文分别见 fonts/LXGW-OFL.txt 与 fonts/SourceHanSansSC-OFL.txt。

字体于 2026-10-13 整理，使用已安装的 fontTools 4.60.1 转换。本地包保留完整许可文件，浏览器只请求随扩展分发的 assets/fonts/，不使用外部 CDN。字体文件不得单独出售。

# 原创程序合成声音

2026-10-13，T83 为《无限原野》原创编写 `extension/ambient-audio.mjs` 的 `synthesizeLoop`。生成的风、水流、鸟鸣、虫声、无词集市杂响、炉火、雨、风暴、雪、雾、房间底噪及洞穴滴水循环，以及村镇白天、夜晚酒馆、野外、地下城、战斗五段旋律，均从确定性噪声与正弦振荡生成，没有第三方录音、乐曲或人声。生成的音频素材允许复制、修改、分发与商业使用，不要求署名；明确许可见 `audio/LICENSE.txt`。生成方法与选择规则见 `world/audio/synthesis.md`。
