#!/bin/zsh
set -eu
cd "${0:A:h}"
lms="$HOME/.lmstudio/bin/lms"
node_bin="/Applications/Linger.app/Contents/Resources/runtime/bin/node"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:1234/v1/models >/dev/null; then
  "$lms" server start --port 1234
fi
"$node_bin" setup-text.cjs | pbcopy
open -a Linger
echo '建馆指令已复制。在 Linger 选择 Pi → Local / OpenAI-compatible model，用 http://127.0.0.1:1234/v1 和 qwen/qwen3.5-9b。首建时，在自己的 Linger 私聊粘贴指令，按确认卡创建角色和群。'
