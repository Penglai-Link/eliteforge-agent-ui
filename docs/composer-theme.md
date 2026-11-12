# 输入区主题变量

变量可设置在输入区祖先节点或公开的 `composer` 挂点上。颜色沿用 chat 的直接令牌、`-color` 覆盖和基础 `--color-*` 回退；尺寸、间距、字体与动画优先复用通用变量。没有在组件根部赋默认颜色，避免遮蔽祖先继承。

同一变量因子元素不同可能有多个回退值。以下清单包含共享 primitives 和图标引用；机器索引见 [composer-theme-tokens.json](composer-theme-tokens.json)。

| 变量 | 回退值 |
| --- | --- |
| `--agent-ui-chat-border` | `var(--agent-ui-chat-border-color, var(--color-outline-variant, #c4c7c7) )` |
| `--agent-ui-chat-border-color` | `var(--color-outline-variant, #c4c7c7)` |
| `--agent-ui-chat-danger` | `var(--agent-ui-chat-danger-color, var(--color-error, #ba1a1a) )` |
| `--agent-ui-chat-danger-color` | `var(--color-error, #ba1a1a)` |
| `--agent-ui-chat-danger-text` | `var(--agent-ui-chat-danger-text-color, var(--color-on-error, #ffffff) )` |
| `--agent-ui-chat-danger-text-color` | `var(--color-on-error, #ffffff)` |
| `--agent-ui-chat-focus` | `var(--agent-ui-chat-focus-color, var(--color-focus-ring, #2f5f9f) )` |
| `--agent-ui-chat-focus-color` | `var(--color-focus-ring, #2f5f9f)` |
| `--agent-ui-chat-hover` | `var(--agent-ui-chat-hover-color, var(--color-hover-surface, #f2f2f7) )` |
| `--agent-ui-chat-hover-color` | `var(--color-hover-surface, #f2f2f7)` |
| `--agent-ui-chat-on-primary` | `var(--agent-ui-chat-on-primary-color, var(--color-on-primary, #ffffff) )` |
| `--agent-ui-chat-on-primary-color` | `var(--color-on-primary, #ffffff)` |
| `--agent-ui-chat-primary` | `var(--agent-ui-chat-primary-color, var(--color-primary, #000000) )` |
| `--agent-ui-chat-primary-color` | `var(--color-primary, #000000)` |
| `--agent-ui-chat-surface-muted` | `var(--agent-ui-chat-surface-muted-color, var(--color-surface-container-low, #f7f3f2) )` |
| `--agent-ui-chat-surface-muted-color` | `var(--color-surface-container-low, #f7f3f2)` |
| `--agent-ui-chat-surface-soft` | `var(--agent-ui-chat-surface-soft-color, var(--color-surface-container, #f1edec) )` |
| `--agent-ui-chat-surface-soft-color` | `var(--color-surface-container, #f1edec)` |
| `--agent-ui-chat-surface-strong` | `var(--agent-ui-chat-surface-strong-color, var(--color-surface-container-lowest, #ffffff) )` |
| `--agent-ui-chat-surface-strong-color` | `var(--color-surface-container-lowest, #ffffff)` |
| `--agent-ui-chat-text` | `var(--agent-ui-chat-text-color, var(--color-on-surface, #1c1b1b) )` |
| `--agent-ui-chat-text-color` | `var(--color-on-surface, #1c1b1b)` |
| `--agent-ui-chat-text-muted` | `var(--agent-ui-chat-text-muted-color, var(--color-on-surface-variant, #444748) )` |
| `--agent-ui-chat-text-muted-color` | `var(--color-on-surface-variant, #444748)` |
| `--agent-ui-composer-attachment-height` | `64px` |
| `--agent-ui-composer-attachment-radius` | `12px` |
| `--agent-ui-composer-border-width` | `1px` |
| `--agent-ui-composer-button-padding` | `0 var(--_agent-ui-control-padding)` |
| `--agent-ui-composer-caret-duration` | `1s` |
| `--agent-ui-composer-caret-height` | `1em` |
| `--agent-ui-composer-caret-width` | `1px` |
| `--agent-ui-composer-compact-gap` | `6px` |
| `--agent-ui-composer-control-weight` | `500` |
| `--agent-ui-composer-count-radius` | `999px` |
| `--agent-ui-composer-count-size` | `18px` |
| `--agent-ui-composer-detail-font-size` | `13px` |
| `--agent-ui-composer-disabled-opacity` | `0.46` |
| `--agent-ui-composer-editor-min-height` | `72px` |
| `--agent-ui-composer-emphasis-weight` | `600` |
| `--agent-ui-composer-file-icon-box-size` | `44px` |
| `--agent-ui-composer-file-padding` | `8px 40px 8px 10px` |
| `--agent-ui-composer-file-width` | `280px` |
| `--agent-ui-composer-focus-offset` | `3px` |
| `--agent-ui-composer-focus-width` | `2px` |
| `--agent-ui-composer-font-size` | `14px` |
| `--agent-ui-composer-hover-brightness` | `0.96` |
| `--agent-ui-composer-icon-control-size` | `24px` |
| `--agent-ui-composer-icon-size` | `13px` / `14px` / `15px` / `16px` / `22px` |
| `--agent-ui-composer-image-width` | `88px` |
| `--agent-ui-composer-inline-gap` | `2px` |
| `--agent-ui-composer-line-height` | `normal` |
| `--agent-ui-composer-menu-gap` | `8px` |
| `--agent-ui-composer-menu-heading-padding` | `5px 9px` |
| `--agent-ui-composer-menu-max-height` | `min(320px, 50vh)` |
| `--agent-ui-composer-menu-padding` | `6px` |
| `--agent-ui-composer-menu-radius` | `var(--agent-ui-panel-radius, 10px)` |
| `--agent-ui-composer-menu-shadow` | `0 8px 28px rgba(15, 23, 42, .14)` |
| `--agent-ui-composer-meta-font-size` | `12px` |
| `--agent-ui-composer-min-height` | `112px` |
| `--agent-ui-composer-padding` | `var(--agent-ui-panel-padding, 12px)` |
| `--agent-ui-composer-queue-line-height` | `1.45` |
| `--agent-ui-composer-queue-max-height` | `132px` |
| `--agent-ui-composer-queue-padding` | `6px 8px` |
| `--agent-ui-composer-radius` | `var(--agent-ui-control-radius, 6px)` |
| `--agent-ui-composer-remove-inset` | `6px` |
| `--agent-ui-composer-remove-radius` | `50%` |
| `--agent-ui-composer-row-gap` | `12px` |
| `--agent-ui-composer-send-font-size` | `20px` |
| `--agent-ui-composer-shadow` | `inset 0 0 0 1px rgba(15, 23, 42, 0.055)` |
| `--agent-ui-composer-skill-outline-width` | `2px` |
| `--agent-ui-composer-small-font-size` | `11px` |
| `--agent-ui-composer-small-gap` | `4px` |
| `--agent-ui-composer-suggestion-padding` | `7px 9px` |
| `--agent-ui-control-font-size` | `0.875rem` |
| `--agent-ui-control-height` | `2rem` |
| `--agent-ui-control-padding` | `0.625rem` |
| `--agent-ui-control-radius` | `4px` / `6px` |
| `--agent-ui-font` | `var(--agent-ui-skin-font, var(--font-sans, Inter, sans-serif))` |
| `--agent-ui-gap` | `0.75rem` / `12px` / `8px` |
| `--agent-ui-motion-transition-duration` | `var(--agent-ui-transition-duration, 120ms)` |
| `--agent-ui-panel-padding` | `12px` / `1rem` |
| `--agent-ui-panel-radius` | `10px` / `8px` |
| `--agent-ui-skin-font` | `var(--font-sans, Inter, sans-serif)` |
| `--agent-ui-transition-duration` | `120ms` |
| `--color-error` | `#ba1a1a` |
| `--color-focus-ring` | `#2f5f9f` |
| `--color-hover-surface` | `#f2f2f7` |
| `--color-on-error` | `#ffffff` |
| `--color-on-primary` | `#ffffff` |
| `--color-on-surface` | `#1c1b1b` |
| `--color-on-surface-variant` | `#444748` |
| `--color-outline-variant` | `#c4c7c7` |
| `--color-primary` | `#000000` |
| `--color-surface-container` | `#f1edec` |
| `--color-surface-container-low` | `#f7f3f2` |
| `--color-surface-container-lowest` | `#ffffff` |

技能标签沿用输入框的字体与尺寸，以保持光标位置一致；`--agent-ui-composer-skill-font-size` 和 `--agent-ui-composer-skill-max-width` 不再生效。
