# Local Agent Connector

用于把学生本机的 Codex CLI、Claude Code 等 Agent 接入 Agent Guild 平台，并在受控边界内托管一次 Agent 进程运行。

## 基础使用

1. 启动 API 和 Web。
2. 学生登录主城区，展开“接入我的 Agent”，点击“生成连接凭证”。
3. 在项目根目录构建 Connector：

```bash
pnpm --filter agent-connector build
```

4. 使用页面显示的一次性命令启动 Connector：

```bash
AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....' pnpm --filter agent-connector start
```

Connector 会从凭证读取服务器地址，建立 `codex-cli` 连接并每 30 秒发送一次心跳。凭证绑定当前学生，只在 10 分钟内有效且只能使用一次；它不包含用户登录密码。

## 托管 Codex / Claude 进程

设置 `AGENT_GUILD_RUN_INSTRUCTION` 后，Connector 会连接平台、启动一次本机 Agent、上报结构化事件并离线退出：

```bash
AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....' \
AGENT_GUILD_DAY_ID=day-1 \
AGENT_GUILD_PROVIDER=codex-cli \
AGENT_GUILD_RUN_INSTRUCTION="检查当前项目并说明测试失败原因" \
pnpm --filter agent-connector start
```

- `codex` / `codex-cli` 使用 `codex exec`。
- `claude` / `claude-code` 使用 `claude --print`。
- instruction 通过标准输入传递，不进入 shell，也不会出现在 `run.started` 事件或进程参数中。
- 运行过程上报 `run.started`，成功上报 `run.completed`，超时、启动错误或非零退出上报 `run.failed`。

Provider 参数必须使用 JSON 字符串数组，避免 shell 拆词和转义歧义：

```bash
AGENT_GUILD_PROVIDER=claude-code \
AGENT_GUILD_PROVIDER_ARGS_JSON='["--permission-mode","plan"]' \
AGENT_GUILD_RUN_INSTRUCTION="只分析，不修改文件" \
AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....' \
pnpm --filter agent-connector start
```

自定义 Provider 必须同时显式配置可执行文件和白名单；只接受 `PATH` 中的命令名，不接受绝对路径或带目录的路径：

```bash
AGENT_GUILD_PROVIDER=company-agent \
AGENT_GUILD_PROVIDER_EXECUTABLE=company-agent \
AGENT_GUILD_PROVIDER_EXECUTABLE_ALLOWLIST=company-agent \
AGENT_GUILD_RUN_INSTRUCTION="执行课程任务" \
AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....' \
pnpm --filter agent-connector start
```

所有 Provider 都通过 `spawn(command, args, { shell: false })` 启动，`cwd` 的真实路径必须位于 `AGENT_GUILD_WORKSPACE` 内。运行有超时和输出上限；超时或 Connector 收到 `SIGINT` / `SIGTERM` 后先终止子进程，宽限期后强制结束。事件输出会脱敏常见 token、Cookie、密码、API Key，以及 Connector 凭据；所有 `AGENT_GUILD_*` 控制变量均不会传给子进程。长任务运行期间 Connector 仍会持续发送心跳。

## 接入测试专家

设置测试命令后，Connector 会在本机工作区执行测试，并把开始、完成和输出事件回传到当前 Day：

```bash
AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....' \
AGENT_GUILD_DAY_ID=day-1 \
AGENT_GUILD_TEST_COMMAND=pnpm \
AGENT_GUILD_TEST_ARGS="test --filter web" \
pnpm --filter agent-connector start
```

测试命令仅允许 `pnpm`、`npm`、`yarn`，不经过 shell，工作目录必须位于 Connector 工作区内。成功仍上报兼容事件 `test.completed`，失败改为上报 `run.failed`。

## 环境变量

- `AGENT_GUILD_CONNECTION_CREDENTIAL`：主城区生成的一次性连接凭证，内含服务器地址、学生绑定、过期时间和签名；不包含用户密码
- `AGENT_GUILD_PROVIDER`：Agent 类型，默认 `codex-cli`
- `AGENT_GUILD_CLIENT_NAME`：本机连接名称，默认 `local-agent`
- `AGENT_GUILD_CAPABILITIES`：逗号分隔的能力列表，默认 `events`
- `AGENT_GUILD_REQUEST_TIMEOUT_MS`：单次 API 请求超时，默认 `10000`
- `AGENT_GUILD_HEARTBEAT_MAX_RETRIES`：心跳最大重试次数，默认 `2`、硬上限 `5`；一次性配对和事件写入不自动重试，避免重复消费或重复事件
- `AGENT_GUILD_RETRY_DELAY_MS`：心跳重试初始退避时间，默认 `250`
- `AGENT_GUILD_WORKSPACE`：允许 Provider 或测试命令访问的工作区根目录，默认当前目录
- `AGENT_GUILD_DAY_ID`：事件所属 Day，默认 `day-1`
- `AGENT_GUILD_RUN_INSTRUCTION`：非空时启动一次 Provider 进程；未设置时只保持心跳
- `AGENT_GUILD_RUN_ID`：可选的运行 ID，默认自动生成
- `AGENT_GUILD_RUN_CWD`：相对工作目录，必须处于 workspace 内
- `AGENT_GUILD_PROVIDER_ARGS_JSON`：传给 Provider 的 JSON 字符串数组
- `AGENT_GUILD_PROVIDER_EXECUTABLE`：自定义 Provider 可执行文件命令名
- `AGENT_GUILD_PROVIDER_EXECUTABLE_ALLOWLIST`：逗号分隔的额外可执行文件白名单
- `AGENT_GUILD_RUN_TIMEOUT_MS`：Provider 运行超时，默认 `600000`
- `AGENT_GUILD_TERMINATION_GRACE_MS`：超时后强制终止前的宽限时间，默认 `2000`
- `AGENT_GUILD_MAX_OUTPUT_LENGTH`：stdout/stderr 合并输出的最大字符数，默认 `100000`
- `AGENT_GUILD_TEST_COMMAND` / `AGENT_GUILD_TEST_ARGS` / `AGENT_GUILD_TEST_CWD`：兼容原测试专家模式；设置后优先于 Provider 模式

网络请求均使用 `AbortController` 限时。只有幂等心跳会对网络错误及 `408/425/429/5xx` 中的可重试状态做有限退避重试；一次性配对和事件写入不会自动重试。错误信息和运行摘要不会记录 Connector token。
