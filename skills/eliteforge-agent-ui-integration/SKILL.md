---
name: eliteforge-agent-ui-integration
description: "指导其他 agent 将 @personai/agent-ui-* npm 包接入 React/Vue 或浏览器应用，包括包选择、统一版本、样式、ChatAdapter、A2UI action、Composer 回调和终端 transport；也用于从本地链接迁移到 npm。"
metadata:
  version: 1.0.7
---

# EliteForge Agent UI 对接

让宿主通过公开 npm 包使用 Agent UI，由宿主负责业务 API、鉴权、持久化和运行控制。此 skill 用于消费组件；修改公共组件主题时再使用主题 skill。普通接入不需要修改或发布 Agent UI 本身。

## Output Path

1. 用户指定的宿主项目及模块路径优先。
2. 未指定模块时，沿用宿主的依赖清单、锁文件、UI 入口、adapter/transport 与样式目录；不要创建另一套平行应用。
3. 接入代码属于宿主项目，公共库缺陷在 Agent UI 仓库修复。不要编辑 `node_modules`、复制渲染器源码或建立隐式 `.agent-deps/agent-ui` 链接。

## 工作流程

1. 检查宿主框架、构建工具、已有 UI/设计系统、所需功能及已安装包。按[包与安装](references/packages.md)选择所需包，核对目标版本的 `exports`、`peerDependencies` 和类型声明。源码分支中的新 API 不代表已在 npm 发布。
2. 通过公共 npm 安装同一个明确版本的全部 Agent UI 依赖，并更新锁文件。当前仓库版本是 `1.0.0-preview.7`，示例以此为基线；用户另定版本时先核对该版本元数据，不能盲信 `latest` / `next`。
3. 显式导入对应样式；评估全局主题对宿主的影响。只通过公开导出、属性、插槽、CSS 变量和主题挂点扩展。
4. 按所需模块读取[宿主运行契约](references/host-contracts.md)，实现 adapter/transport/回调。先用 mock 验证 UI 可以，但交付时必须区分 mock 与真实后端的验证结果。
5. 运行宿主已有类型检查、构建及相关检查，检查浏览器真实交互和资源释放。仅在用户要求时新增测试代码。

## 接入边界

- React/Vue 共享 core 数据契约，但组件属性和事件语法各不相同；核对对应包类型，不能把 React 回调名直接套到 Vue。
- `ChatRuntimeWindow` 管理会话与运行状态；宿主完全控制状态时使用 `ChatPanel`，浮窗使用 `ChatWindow`。只需输入区时选择独立 `Composer`，无需引入聊天运行时。
- 不把宿主实体直接强转成公共类型；保留稳定 ID、错误代码、AbortSignal 和运行身份。断开流观察不等于停止 Agent，停止必须走后端 `stopRun`。
- A2UI 的协议 `version` / Catalog ID 与 npm 包版本不同；协议字段必须符合包内 schema，不得替换成 npm 版本号。A2UI 不自动发送网络请求或恢复审批。
- A2UI 每条消息包含 `version` 和一个操作，`surfaceId`、`components` 放在操作对象内。`1.0.0-preview.4` 支持 `TextField.placeholder` 字符串/路径绑定；启用时必须核对前后端 Catalog 和渲染版本，不将提示作为字段值。
- A2UI Surface 展示消息沿用所属运行的状态，不独立代表执行中。`1.0.0-preview.4` 修复 Surface 缺少历史记录导致已完成运行持续显示“工作中”的问题；验收时同时检查历史恢复与真实执行中的状态。
- 浏览器终端通过宿主 PTY 服务工作，不在前端创建 shell。服务端凭据、模型密钥和权限判断留在服务端。

- `1.0.0-preview.7` 的 React/Vue 工作时间使用前端单调时钟每秒刷新，事件只提供首次历史基线；等待回答时暂停，回答确认后恢复。宿主须保留 `requestId`、`runId`、`status` 与 `answeredAt`，已回答请求不能继续显示为等待。详见宿主运行契约。

## 验收

- 所有已使用的 `@personai/agent-ui-*` 版本一致，锁文件解析到 npm tarball；`npm ls --all` 无缺失或无效依赖。
- 检查 manifest、lockfile、构建 alias、TS paths、安装脚本和 `.agent-deps`；实际安装路径不得指向本地 Agent UI 源码。检查嵌套依赖，不能只检查顶层版本号。
- 按本次接入范围验证：消息发送/恢复/停止、输入法与附件、A2UI action、主题切换、终端连接/resize/dispose；未实现能力不要声明为支持。
- 汇报修改的宿主项目、分支、包版本、真实后端覆盖及未完成事项。安装成功、构建成功与端到端通过是不同结论。

## 维护依据

本 skill 随 Agent UI 源码维护，完整源码导航见两个 references。skill 单独分发时，references 必须随附；仓库文档不可用时，以目标版本 npm 包的 README、导出和类型声明为准，缺少契约时再获取对应源码，不假定消费项目有本地源码目录。
