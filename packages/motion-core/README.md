# Agent UI Motion Core

React / Vue 共用的动效配置、参数解析、浏览器偏好监听和播放生命周期。具体用法与完整变量见 [统一动效接入](../../docs/motion.md)。

公开 `MotionConfig`、`MotionPreset`、`ResolvedMotion`、`resolveMotion`、`motionTokens`、`mergeMotionConfig`、`getMotionEnvironmentStore`、`createMotionPlayback`、`nativeMotionDriver`。

入口无浏览器环境时也能导入。浏览器监听按 Document 共用，最后一个订阅者卸载后移除；不访问本地存储，也不导入 React 或 Vue。
