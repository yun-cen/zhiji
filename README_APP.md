# 知几 · 封装的 agent app

架构：**Electron 做 macOS 桌面端，n8n 做「算命大脑」**。

## 分工

```text
Electron 渲染层
  ├─ 启动页（app/index.html，水墨 + 天水一壤印章）
  ├─ 会诊页（lab/index.html，紫微 + 奇门双盘）
  ├─ 本机排盘：iztro（紫微）/ 3meta（奇门）
  └─ 用户看到的默认内容：人话版；盘面/术语在“展开原理”里

Electron 主进程
  ├─ 窗口与生命周期
  ├─ 安全存储 n8n webhook 地址 / 共享密钥（safeStorage）
  └─ IPC：把 { question, domain, facts } 发给 n8n

n8n「算命大脑」
  ├─ Webhook：接收问题 + 结构化 facts
  ├─ Build Prompt：生成人话版会诊 prompt
  ├─ Zhipu Chat：调 glm-4-plus
  ├─ Extract Reply：提取 content
  └─ Respond：返回 { content }
```

**为什么这样分：**

- 排盘是确定性的，留在本机，快且不依赖网络；
- n8n 负责编排、prompt、模型调用、重试和以后的多分支，不用每次改 app 都重新打包；
- 智谱 key 只存在 n8n 的凭证里，Electron 不碰 key；
- Electron 只存 n8n 地址和共享密钥。

## 启动顺序

### 1. 启动 n8n

需要 Docker：

```bash
cd n8n
docker compose up -d
```

打开 http://127.0.0.1:5678 ，创建 owner 账号。

### 2. 导入「算命大脑」

1. n8n 右上角 **Import from file**，选 `n8n/workflow-zhiji.json`；
2. 打开 **Zhipu Chat** 节点，新建 **Header Auth** 凭证：
   - Name: `Authorization`
   - Value: `Bearer <智谱 API key>`
3. 选中该凭证，激活工作流；
4. webhook 地址：

```
http://127.0.0.1:5678/webhook/zhiji-consult
```

### 3. 启动 Electron

在项目根目录：

```bash
pnpm install
pnpm start
```

如果 Electron 二进制下载慢，用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
```

打开 app 后，默认 webhook 就是 `http://127.0.0.1:5678/webhook/zhiji-consult`，本地 n8n 的共享密钥可留空；如果默认值不对，右上角「设置」改。

### 4. 已安装的 macOS app

本机只保留一份：

```
/Applications/知几.app
```

- 图标：`assets/zhiji-icon.svg` / `assets/zhiji.icns` 的「几」字；
- 不再生成 `dist/知几.app` 或 zip 副本，避免本机出现多个知几；
- 首次打开如果被 Gatekeeper 拦，右键 → 打开；个人使用不强制公证。

修改代码后重新打包（会直接替换 `/Applications/知几.app`，先退出 app）：

```bash
scripts/build-macos-app.sh /path/to/Electron.app
```

要求安装到别处时：

```bash
INSTALL_DIR="$HOME/Applications" scripts/build-macos-app.sh /path/to/Electron.app
```
## Windows 开发与打包

上面的打包流程面向 macOS。在 Windows 上：

- 开发调试一样：`pnpm install`，然后 `pnpm start`；
- 打包 Windows 安装包：`pnpm dist:win`（新增命令，输出在 `release/` 目录，生成 NSIS `.exe` 安装包）；
- Electron 二进制下载慢时可用镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install`；
- 平台差异：系统通知、safeStorage、开机启动等在 Windows 与 macOS 上行为不同，涉及这些功能的改动需要双平台各测一遍。

## 现在完成到哪一步

- ✅ 启动页（原题诗 + 天水一壤印章）
- ✅ 紫微 × 奇门双盘
- ✅ 人话版会诊 UI / 原理折叠
- ✅ Electron 主进程 + preload + IPC + safeStorage 设置
- ✅ n8n 工作流 JSON（Webhook → 结构化 Prompt → GLM → JSON 解析 → 人话定稿 → Respond）
- ✅ n8n Docker Compose（镜像已拉取，容器 `zhiji-n8n` 运行中，仅监听 127.0.0.1:5678）
- ✅ 工作流 `d9zwQ72OcQi1Yd15` 已导入并发布；智谱 Header Auth 已导入
- ✅ webhook 实测：`http://127.0.0.1:5678/webhook/zhiji-consult` 返回 HTTP 200 和人话版会诊
- ✅ macOS app 已安装：`/Applications/知几.app`，只保留这一份；包含新侧栏、插件、诗句状态、「几」字图标与启动页
- ✅ 会诊上下文：同一档案会带最近 3 轮对话给 n8n，追问不再从零开始
- ✅ 桌面 agent 壳：左侧「新问事 / 命主档案 / 插件 / 本地文件 / 最近问事」，右侧问事台
- ✅ 本地文件插件：只读用户选中的文件夹，可把一份 md/txt/json/csv 作为这一问的背景
- ✅ 日历插件：导入 .ics，把近 60 天的生日/纪念日/约定带进会诊，并在侧栏「近事」提醒
- ✅ 思考状态：不再显示“盘面已定，正在组织人话”，改为「星盘初定，墨痕未干」等诗句循环，屏幕阅读器仍保留明确状态
- ✅ 盘面依据：n8n 返回分段 `sections`，每段带 `evidence: [E#]`；app 在每段下显示「依据」，点开可看原始盘面 facts
- ✅ 动态分段：3–5 段标题跟着问题走，不再固定“一句话/为什么这么说/你可以怎么做”
- ✅ 学业/考试域：考试问题单独识别，看命宫/官禄/父母/福德、文昌文曲与奇门景门
- ✅ 时间窗口与考试类型：识别「下周/下个月」和「期末/六级」等标签，避免两场考试给同一套建议
- ✅ 双阶段输出：先生成结构化会诊，再由定稿编辑改成人话；正文不出现星曜/宫门名
- ✅ 事实预算：只把这一问用到的 ziwei 宫位、奇门目标宫/值符值使发给 n8n，不再整包九宫
- ✅ 时间模式已实测：确切时辰 / 模糊时辰 / 时辰不详三种都能被 n8n 正确接住
- ✅ n8n 领域提示：事业、财富、关系、迁移、时机有各自的判断侧重
- ✅ 双专家 v2 保留为实验分支，当前未激活；主链路已改为「结构化 + 证据 + 人话定稿」
- ⚠️ 时辰不详时仍可能给出未经严格事实校验的泛化建议；下一步做 evidence 一致性校验
- ⏳ n8n UI 首次打开还需要创建 owner 账号（不影响 webhook）
- ⏳ 八字、独立的 evidence 一致性校验、跨轮记忆持久化还没做

## 重要边界

- n8n 默认只监听本机，不要把 5678 端口直接暴露到公网。
- n8n 是 fair-code / Sustainable Use License；本地自用没问题，商业分发/打包前先看许可证。
- 会诊仍可能出错；默认人话版降低术语错误，但不等于事实校验。下一步要把“星曜/门/四化”的自动核对加进 n8n 或 Electron。
- 你发在聊天里的智谱 key 建议在 n8n 配好后轮换一次；app 和仓库里没有它。
