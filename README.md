# EliteForge Agent UI

可在不同产品中复用的 Web 聊天组件和终端组件。UI 包只定义展示所需的通用接口；会话 API、鉴权、Agent 服务和终端进程由使用它的宿主应用提供。

本仓库是独立公共项目。本阶段不修改 Tron，也不负责 Tron adapter、依赖切换或迁移。

## 包结构

```text
packages/
├── chat-core/    # 聊天数据类型、ChatAdapter、AG-UI 处理、模拟宿主
├── chat-react/   # React 聊天运行时、面板和悬浮窗口
├── chat-vue/     # Vue 3 对应组件
├── chat-theme/   # 可复用、可覆盖的聊天主题
└── terminal/     # xterm 终端、命令块、AI 交互和传输接口
```

React/Vue 通过 `ChatAdapter` 连接宿主的会话与消息服务；终端通过 `TerminalTransport` 连接 PTY、通过可选的 `AITransport` 连接 AI 服务。公共包不会自行读取某个产品的 token、调用某个产品的 API，或决定服务端在哪启动 shell。

## 本地开发与演示

```sh
npm install
npm run check
```

单独启动交互演示：

```sh
npm run dev --workspace @eliteforge/agent-ui-chat-react
npm run dev --workspace @eliteforge/agent-ui-chat-vue
npm run dev --workspace @eliteforge/agent-ui-terminal
```

React/Vue 演示使用 chat-core 的模拟 adapter，可创建会话、发送消息并查看 AG-UI 活动；terminal 演示使用内存中的模拟 Shell 和 AI transport，不会访问外部服务。详细接入步骤见[接入指南](docs/integration-guide.md)，各组件 README 提供对应 API 说明。

## 开发技能

- [eliteforge-agent-ui-theme](skills/eliteforge-agent-ui-theme/SKILL.md)：维护聊天组件的主题令牌、挂点和 React/Vue 样式一致性。

## 发布

五个包使用 `@eliteforge/agent-ui-*` 命名空间，包级 `publishConfig` 指向内部 npm registry。发布前需要配置 npm 凭据；当前仅准备发布配置，不执行发布。

## 独立 A2UI 客户端

新增 a2ui-core、a2ui-react、a2ui-vue 三个包，提供 A2UI v0.9.1 最小 Catalog 与模拟交互闭环，见 [接入文档](docs/a2ui-client.md)。
