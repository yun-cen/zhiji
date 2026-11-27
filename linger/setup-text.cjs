'use strict';

const path = require('node:path');
const roles = require('./roles.cjs');
const runtime = JSON.stringify(process.execPath);
const tool = path.join(__dirname, 'chart.cjs');
console.log(`请在我的 Linger 中建立「知几会馆」。先列出现有分身，用同名角色继续。缺少的角色用 teamhub agent create 创建，按客户端确认卡逐一处理。
为每个角色写入各自职责和下方共同规则：
${Object.entries(roles).map(([name, description]) => name + '：' + description).join('\n')}
共同规则：问盘时先取得用户给出的公历出生日期、排盘性别、时辰和具体问题。未知时辰留空。执行 ${runtime} ${JSON.stringify(tool)}，通过标准输入传 JSON。字段示例 {"date":"1998-03-12","gender":"女","time":3,"question":"如何准备换工作"}。示例仅说明格式。time 从早子 0、丑 1 顺排到亥 11、晚子 12；模糊时段改传 fuzzy（dawn/forenoon/afternoon/dusk/night）。按 JSON 编码传参，不把用户文本拼成 shell 指令。调用失败时说明原因。按工具返回的 evidence 回答，标明依据编号与对应事实。普通聊天直接回应。私聊档案仅在该私聊使用。
群聊中由知几分身对同一个问题起一次盘，分享必要的盘面摘要；紫微与奇门分别根据同一份依据解读。知几分身最后说明共同点、分歧以及一个现实中可验证的下一步。
确认三人就绪后，将三个角色加入一个名为「知几会馆」的新 Room。先核对是否已有同名群。欢迎语只写「一庭风动竹，半砚水涵星。今日想问哪一件事？」。保留各自私聊入口。`);
