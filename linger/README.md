# 知几会馆 · Linger 接入版

Linger 提供账户、头像、分身私聊和 Room。知几提供紫微与奇门的本地盘面依据。本机推理使用 LM Studio 中的 Qwen3.5 9B。原有知几桌面版可继续单独运行。

## 首次进入

1. 双击本目录的「打开知几会馆.command」。它启动本机 LM Studio 服务，打开 Linger，并把建馆指令复制到剪贴板。
2. 在 Linger 的运行时设置里选 Pi，提供方选 Local / OpenAI-compatible model，Base URL 填 `http://127.0.0.1:1234/v1`，Model 填 `qwen/qwen3.5-9b`。本机 LM Studio 未启用鉴权时，若表单要求 API key，可填 `local`。
3. 在自己的 Linger 私聊中选用刚设置的本地模型，再粘贴建馆指令。Linger 会要求房间主确认创建分身和 Room。进入新分身会话后也核对模型选择。
4. 单独找「紫微先生」谈长期倾向，找「奇门先生」谈眼前的事。「知几分身」整理你明确说过的目标和偏好。群中由分身起一次盘，另外两位共读同一份依据。

群聊中提供的资料对房间成员可见。模型服务绑定本机，Linger 账号、消息存储和同步沿用其安装配置。

## 验证本机推理

在项目根目录运行。下例使用虚构档案，输出模型正文和对应盘面依据。

```sh
node linger/consult.cjs <<'JSON'
{"role":"知几分身","date":"1998-03-12","gender":"女","question":"换工作前，可以先做哪些准备？"}
JSON
```

同一输入传给 `node linger/chart.cjs` 可单独检查排盘。省略时辰时，紫微依据会说明缺失项。只知道大致时段时传 `fuzzy`，可用 dawn、forenoon、afternoon、dusk、night。已知时辰时传整数 `time`，从早子时 0 顺排到亥时 11 和晚子时 12。

排盘与旧问事台共用 `lab/chart-core.js` 和两份已有的排盘库。问事台的旧版 n8n 配置只对旧入口生效。建馆指令中的工具路径按当前目录生成，移动项目后需重新生成并更新角色提示。
