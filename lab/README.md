# 知几 · P0（浏览器/本地调试版）

> Electron + n8n 的正式封装见 [`../README_APP.md`](../README_APP.md)。

「命·运·事」三盘会诊的最小可运行原型。当前只做 **紫微 × 奇门**，八字后补。

## 现在能做什么

- 输入出生日期/时辰/性别 + 一个具体问题；
- 紫微：十二宫、主星/亮度/四化、当前大限/流年；
- 奇门：时家奇门九宫、八门/九星/八神、值符值使、旺衰/门迫/格局；
- 按领域把两盘压成结构化 facts；
- 调 LLM 生成“会诊简报”：结论先行、命盘、事盘、合参与分歧、下一步、边界；
- 展开“结构化盘面”核对事实。

## 本地运行

```bash
# 方式一：环境变量
ZHIPU_API_KEY='你的 key' node server.mjs

# 方式二：本机临时文件（不要提交）
printf '%s' '你的 key' > /tmp/zhiji_api_key && chmod 600 /tmp/zhiji_api_key
node server.mjs
```

打开：

```
http://127.0.0.1:8787/lab/
```

服务端只代理 `/api/chat`，key 不会进入浏览器；静态文件只开放 `/lab/`、`/fonts.css`、`/art/`、`/assets/`、`/index.html`。

## 当前限制

- 只有紫微 + 奇门，没有八字；
- 单轮会诊，没有对话记忆；
- 领域目前是用户手选，还不是自动 router；
- 奇门用 3meta 默认起局，流派参数未展开；
- LLM 输出仍需事实校验，尤其是星曜别名、门/旺衰混淆；
- 公网部署需要服务端代理；**不能把 key 放进 GitHub Pages 静态文件**。

## 下一步

1. 自动 router：问题 → 领域/时间尺度/是否需要奇门；
2. 结构化 Judgment schema + 一致性/分歧计算；
3. 八字层；
4. 证据链、反事实（时辰 ±1 / 起局时间 ±1）、模型卡；
5. 服务端代理 + 公网部署。

## 依赖

- [iztro](https://github.com/SylarLong/iztro)（MIT）— 紫微排盘
- [3meta](https://github.com/3metaJun/3meta)（MIT）— 奇门排盘
- 智谱 GLM — 会诊语言层
