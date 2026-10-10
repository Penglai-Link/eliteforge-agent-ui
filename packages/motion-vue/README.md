# Agent UI Motion Vue

共用配置、主题变量和生命周期约定见 [统一动效接入](../../docs/motion.md)。

提供 `MotionProvider`、`AgentMotion`、`useMotion` 和 `MotionEffects`。Chat、A2UI 对应的 Vue 包也导出这些接口。

默认使用浏览器 Web Animations API，不依赖 GSAP、Three.js 或产品主题引擎。宿主可通过 `effects` 注册适配后的 Bits 组件。
