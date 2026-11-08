# 统一动效接入

Chat、A2UI 的 React / Vue 客户端共用配置、效果名称和主题变量。宿主负责保存用户偏好，再把配置传给 `MotionProvider`。公共包不读取产品设置或本地存储。

```text
宿主设置 → MotionConfig → MotionProvider
                           ├─ Chat 输入请求 → A2UI 问答、审批
                           ├─ A2UI Tabs、Accordion、Collapsible
                           └─ AgentMotion → 默认实现 / 宿主效果适配器
```

## React

```tsx
import { MotionProvider, ChatPanel } from "@personai/agent-ui-chat-react";
import "@personai/agent-ui-chat-react/styles.css";

<MotionProvider config={{ mode: "system", duration: 180, distance: 8, transitionDuration: 120 }}>
  <ChatPanel {...chatProps} />
</MotionProvider>
```

`@personai/agent-ui-a2ui-react` 也导出 Provider。单独使用基础动效时，从 `@personai/agent-ui-motion-react` 导入。

```tsx
<AgentMotion preset="fade" replayKey={activeTab}>
  <TabContent />
</AgentMotion>
```

## Vue

```vue
<script setup lang="ts">
import { MotionProvider, ChatPanel } from "@personai/agent-ui-chat-vue";
import "@personai/agent-ui-chat-vue/styles.css";
const motion = { mode: "system", duration: 180, distance: 8 } as const;
</script>

<template>
  <MotionProvider :config="motion">
    <ChatPanel v-bind="chatProps" />
  </MotionProvider>
</template>
```

`@personai/agent-ui-a2ui-vue` 同样导出 Provider；基础接口位于 `@personai/agent-ui-motion-vue`。

## 配置和生命周期

| 配置 | 默认 | 行为 |
| --- | --- | --- |
| `mode` | `system` | `system` 跟随系统偏好；`reduced`、`off` 显示静态内容；`full` 启用基础出现效果 |
| `duration` / `delay` | 180 / 0 ms | 内容出现动画的时长和延迟 |
| `distance` | 8 px | `enter` 的垂直位移；`fade` 不移动 |
| `intensity` | 1 | 0..1，缩放位移；0 关闭效果 |
| `easing` | `ease-out` | 默认实现使用的 CSS 缓动函数 |
| `presets.enter` / `presets.fade` | 继承通用配置 | 覆盖对应效果的时长、延迟、位移、强度和缓动 |
| `transitionDuration` | 继承旧控件变量，默认 120 ms | 共用控件的过渡时间 |
| `spinDuration` | A2UI 默认 1000 ms | A2UI Spinner 周期 |
| `pulseDuration` / `pulseEasing` | A2UI 默认 1500 ms，Chat 默认 1600 ms / `ease-in-out` | 加载脉冲周期和缓动 |

未设置的参数继续继承祖先配置或主题变量。嵌套 Provider 可以调整参数；祖先明确设置的 `off` / `reduced` 不会被子 Provider 重新启用。

`AgentMotion` 保留原生节点、事件、引用和子组件。内容或配置更新不会重播；只有 `preset` 或 `replayKey` 改变才重播，也不会通过 React/Vue 的组件 `key` 重建表单。关闭效果时取消当前动画，重新启用时保留静态内容，下一次明确的身份变化才播放。

页面隐藏时取消出现效果，并停止 Provider 内的 CSS 动画。系统偏好变化会更新所有客户端；最后一个订阅者卸载后移除监听。没有 Web Animations API 或在服务端渲染时，默认实现显示完整内容。旧 CSS 加载效果继续尊重系统的减少动态效果设置，包括 `full` 模式。

当前接入范围：QuestionCard / ApprovalCard 出现、QuestionCard 问题切换、Tabs 面板切换、Accordion / Collapsible 展开。Chat 的输入请求使用这些 A2UI 组合组件，因此共享同一策略。已完成的问答、审批卡片初次出现时不播放；普通历史消息和流式 Markdown 未增加逐字或重播动画。加载反馈保留已有 CSS 动画覆盖入口，并纳入 Provider 的开关及周期配置。

## 主题变量

变量可设置在宿主祖先、Provider 或组件根节点；公共包不写入默认根变量。优先级为效果配置、通用配置、效果专用变量、通用变量、默认值。基础入口会自动导入策略样式。

| 变量 | 默认回退 | 用途 |
| --- | --- | --- |
| `--agent-ui-motion-duration` | `180ms` | 出现时长 |
| `--agent-ui-motion-delay` | `0ms` | 出现延迟 |
| `--agent-ui-motion-distance` | `8px` | enter 位移 |
| `--agent-ui-motion-intensity` | `1` | 位移强度 |
| `--agent-ui-motion-easing` | `ease-out` | 缓动 |
| `--agent-ui-motion-enter-{duration,delay,distance,intensity,easing}` | 继承通用变量 | enter 专用配置 |
| `--agent-ui-motion-fade-{duration,delay,intensity,easing}` | 继承通用变量 | fade 专用配置 |
| `--agent-ui-motion-transition-duration` | `var(--agent-ui-transition-duration, 120ms)` | 共用控件过渡 |
| `--agent-ui-motion-spin-duration` | `1s` | A2UI 旋转周期 |
| `--agent-ui-motion-pulse-duration` | A2UI `1.5s`，Chat `1.6s` | 加载脉冲周期 |
| `--agent-ui-motion-pulse-easing` | `ease-in-out` | 加载脉冲缓动 |

完整机器索引见 [motion-tokens.json](motion-tokens.json)。原有 `--agent-ui-a2ui-spinner-ring-animation` 和 `--agent-ui-a2ui-skeleton-animation` 仍可整体覆盖对应动画。

## Bits 适配

通过 Provider 的 `effects` 注册宿主拥有的效果组件。`enter` 对应适配后的 AnimatedContent，`fade` 对应适配后的 FadeContent。UI 包提供接口和轻量默认实现，不打包 React Bits / Vue Bits 源码。

React 的效果组件接收 `MotionEffectProps`：`children`、`motion: ResolvedMotion`、`replayKey`。Vue 接收 `motion`、`replayKey` props 和默认 slot。两端注册方式一致：

```tsx
// 这两个组件由宿主实现并管理上游动画的生命周期。
const effects = { enter: ControlledBitsContent, fade: ControlledBitsFade };
<MotionProvider config={preferences} effects={effects}>
  <ChatPanel {...chatProps} />
</MotionProvider>
```

适配组件必须保持自身和 children 挂载稳定；不要通过 `key` 重建表单。`motion.enabled` 变为 false 时，取消自身动画并立即显示最终内容；卸载时只清理自身动画和 ScrollTrigger。显式 `replayKey` 改变时重播，普通 props 更新时不重播。时长和延迟统一为毫秒，映射上游参数时按组件实际单位转换；GSAP ease 需要单独映射。

上游原始组件不能直接作为 `effects` 值。部分版本只在挂载时读取配置，或清理全局 ScrollTrigger；需要完成上述适配后再注册。适配源码归属和分发方式须遵守上游 [React Bits 许可证](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)及 [Vue Bits 许可证](https://github.com/DavidHDev/vue-bits/blob/main/LICENSE.md)。

## 演示和验证

分别启动 React / Vue A2UI 演示后，访问 `/motion.html`：

```sh
npm run dev --workspace @personai/agent-ui-a2ui-react -- --port 5187
npm run dev --workspace @personai/agent-ui-a2ui-vue -- --port 5188
```


2026-10-10 验证：11 个包构建通过，470 个测试通过。以下 3 个 Chat React 历史展示测试在改动前的 `6afc042` 基线也失败，本次未修改对应展示行为：

- `ChatPanel submit controls > collapses answered user questions into completed work in event order`
- `shows readable historical answers and interaction tool details without duplicate timings or JSON`
- `reads one structured snapshot and renders records without any event replay`
