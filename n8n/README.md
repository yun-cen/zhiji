# 知几 · n8n「算命大脑」

n8n 不负责排盘。盘面由 Electron 本机的 `iztro` / `3meta` 计算，n8n 负责：

1. 接住 Electron 发来的 `{ question, domain, facts }`；
2. 组装人话版会诊 prompt；
3. 调智谱 GLM；
4. 返回 `{ content }`。

这样模型 key 只在 n8n 凭证里，Electron 不碰 key；以后改 prompt、加紫微/奇门分支、加验证节点，都不用重新打包 app。

## 启动 n8n

需要 Docker。进入本目录：

```bash
docker compose up -d
```

打开 http://127.0.0.1:5678 ，第一次会要求创建 owner 账号。

## 导入工作流

1. 右上角 **Import from file**，选 `workflow-zhiji.json`；
2. 打开 **Zhipu Chat** 节点，创建一个 **Header Auth** 凭证：
   - Name: `Authorization`
   - Value: `Bearer <你的智谱 API key>`
3. 回到工作流，选中该凭证；
4. 右上角激活工作流；
5. 生产 webhook 地址是：

```
http://127.0.0.1:5678/webhook/zhiji-consult
```

## 在 Electron 里接上

打开知几 app → 右上角「设置」→ 填 n8n Webhook 地址；本地 n8n 共享密钥可留空。

## 安全与边界

- n8n 默认只监听本机；不要把 5678 端口直接暴露到公网。
- 如果要远程 n8n，至少加 HTTPS、Webhook Header Auth、IP 白名单；不要把 webhook 裸奔。
- n8n 是 fair-code / Sustainable Use License；自己本地用没问题，若要把 n8n 打包进商业 app 分发，先看许可证。
- 这套 workflow 已不是单 prompt：有结构化生成、人话定稿和证据字段；下一步再加事实一致性校验、重试与日志。

## 凭证模板

`credential-template.json` 只是格式示例，**不要直接把真 key 写进仓库**。在 n8n UI 里新建 Header Auth 更稳：Name 填 `Authorization`，Value 填 `Bearer <key>`。


## 当前本机状态

- 容器：`zhiji-n8n`，只监听 `127.0.0.1:5678`
- 当前唯一激活：`d9zwQ72OcQi1Yd15`，`/webhook/zhiji-consult`
- 双专家实验：`MpsOuv8w6XUcIf2d`，当前未激活；保留作为对照
- 当前主链路：结构化 JSON → 分段证据 `E#` → 人话定稿 → app 渲染
- 支持：确切/模糊/不详三种时辰、领域侧重、最近 3 轮上下文、每段盘面依据、本地文件/日历背景
- 输出：3–5 段动态标题（学业/关系/事业各自不同），不再固定“一句话/为什么/怎么做”
- 学业：识别期末/六级等考试类型与下周/下个月时间窗口，使用景门与文昌文曲
- 当前风险：不详时辰仍可能多给泛化建议；下一步做 evidence 与正文的一致性校验
- 本地上下文：app 会发 `context.file` 与 `context.calendar`；n8n 只作辅助，不当盘面 facts

> n8n 里还有几个同名旧副本，都是未激活的，不要删错当前两条。
