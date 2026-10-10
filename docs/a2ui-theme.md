# A2UI 主题变量

React / Vue 共用同一套变量。将变量设置在 `.a2ui-surface` 或其祖先上；未设置时使用 CSS 回退值。

优先使用共享 `--agent-ui-*` 控件变量；组件特有外观使用 `--agent-ui-a2ui-*`。`--color-*` 保留为宿主基础配色回退。

不同状态可有不同回退值，同一公开变量覆盖所有列出的用途。0、100%、布局方向、SVG 数据坐标等结构值不作为主题变量。

## 示例

```css
[data-theme-part="a2ui"] {
  --agent-ui-control-padding: 14px;
  --agent-ui-transition-duration: 180ms;
  --agent-ui-a2ui-statistic-value-font-size: 2.25rem;
  --agent-ui-a2ui-chart-color-1: #2f5f9f;
  --agent-ui-a2ui-chart-color-2: #4f6f52;
  --agent-ui-a2ui-color-card-border: #dedee3;
}
```

## 完整变量清单

| 变量 | 默认回退 | 作用 |
| --- | --- | --- |
| `--agent-ui-a2ui-accordion-border` | `1px solid var(--color-outline-variant, #ccc)` | `.a2ui-accordion` |
| `--agent-ui-a2ui-accordion-box-shadow` | `0 1px 2px rgb(0 0 0 / 0.025)` | `.a2ui-surface :is(.a2ui-card, .a2ui-accordion)` |
| `--agent-ui-a2ui-accordion-content-padding` | `12px` | `.a2ui-surface .a2ui-accordion [role="region"]` |
| `--agent-ui-a2ui-accordion-padding` | `12px` | `.a2ui-accordion` |
| `--agent-ui-a2ui-accordion-summary-font-weight` | `600` | `.a2ui-accordion summary` |
| `--agent-ui-a2ui-accordion-summary-margin-bottom` | `12px` | `.a2ui-accordion[open] > summary` |
| `--agent-ui-a2ui-accordion-trigger-padding` | `12px 0` | `.a2ui-surface .a2ui-accordion h3 > button` |
| `--agent-ui-a2ui-alert-border` | `1px solid color-mix(in srgb, currentColor 15%, transparent)` | `.a2ui-surface .a2ui-alert` |
| `--agent-ui-a2ui-alert-font-weight` | `600` | `.a2ui-surface .a2ui-alert strong` |
| `--agent-ui-a2ui-alert-gap` | `4px` | `.a2ui-alert` |
| `--agent-ui-a2ui-attachment-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-attachment` |
| `--agent-ui-a2ui-attachment-padding` | `12px` | `.a2ui-surface .a2ui-attachment` |
| `--agent-ui-a2ui-audioplayer-max-width` | `640px` | `.a2ui-video, .a2ui-audioplayer` |
| `--agent-ui-a2ui-avatar-border-radius` | `50%` | `.a2ui-avatar` |
| `--agent-ui-a2ui-avatar-height` | `40px` | `.a2ui-avatar` |
| `--agent-ui-a2ui-avatar-large-font-size` | `24px` | `.a2ui-avatar[data-size="large"]` |
| `--agent-ui-a2ui-avatar-large-height` | `64px` | `.a2ui-avatar[data-size="large"]` |
| `--agent-ui-a2ui-avatar-large-width` | `64px` | `.a2ui-avatar[data-size="large"]` |
| `--agent-ui-a2ui-avatar-small-font-size` | `12px` | `.a2ui-avatar[data-size="small"]` |
| `--agent-ui-a2ui-avatar-small-height` | `28px` | `.a2ui-avatar[data-size="small"]` |
| `--agent-ui-a2ui-avatar-small-width` | `28px` | `.a2ui-avatar[data-size="small"]` |
| `--agent-ui-a2ui-avatar-width` | `40px` | `.a2ui-avatar` |
| `--agent-ui-a2ui-badge-border` | `1px solid var(--a2ui-border)` | `.a2ui-surface .a2ui-badge` |
| `--agent-ui-a2ui-badge-border-radius` | `99px / 5px` | `.a2ui-badge; .a2ui-surface .a2ui-badge` |
| `--agent-ui-a2ui-badge-font-size` | `12px / 0.75rem` | `.a2ui-badge; .a2ui-surface .a2ui-badge` |
| `--agent-ui-a2ui-badge-font-weight` | `500` | `.a2ui-surface .a2ui-badge` |
| `--agent-ui-a2ui-badge-padding` | `3px 10px / 2px 7px` | `.a2ui-badge; .a2ui-surface .a2ui-badge` |
| `--agent-ui-a2ui-bubble-background` | `var(--color-surface-container, #f1edec)` | `.a2ui-surface :is(.a2ui-bubble, .a2ui-message)` |
| `--agent-ui-a2ui-bubble-foreground` | `var(--color-on-surface, #1c1b1b)` | `.a2ui-surface :is(.a2ui-bubble, .a2ui-message)` |
| `--agent-ui-a2ui-bubble-max-width` | `85%` | `.a2ui-surface .a2ui-bubble[data-align="end"], .a2ui-surface .a2ui-message[data-role="user"]` |
| `--agent-ui-a2ui-bubble-padding` | `10px 14px` | `.a2ui-surface :is(.a2ui-bubble, .a2ui-message)` |
| `--agent-ui-a2ui-bubble-radius` | `12px` | `.a2ui-surface :is(.a2ui-bubble, .a2ui-message)` |
| `--agent-ui-a2ui-button-border` | `1px solid var(--color-outline-variant, #c4c7c7)` | `.a2ui-button` |
| `--agent-ui-a2ui-button-box-shadow` | `0 1px 2px rgb(0 0 0 / 0.04)` | `.a2ui-surface .a2ui-button` |
| `--agent-ui-a2ui-button-font-weight` | `500` | `.a2ui-button; .a2ui-surface .a2ui-button` |
| `--agent-ui-a2ui-button-gap` | `6px` | `.a2ui-button` |
| `--agent-ui-a2ui-button-group-gap` | `0` | `.a2ui-surface .a2ui-buttongroup` |
| `--agent-ui-a2ui-button-padding` | `4px var(--_agent-ui-control-padding)` | `.a2ui-button` |
| `--agent-ui-a2ui-calendar-day-height` | `32px` | `.a2ui-surface .a2ui-calendar-body td .a2ui-button` |
| `--agent-ui-a2ui-calendar-font-size` | `0.8125rem` | `.a2ui-surface .a2ui-calendar-body :is(th, td)` |
| `--agent-ui-a2ui-calendar-heading-gap` | `8px` | `.a2ui-surface .a2ui-calendar-heading` |
| `--agent-ui-a2ui-calendar-outside-opacity` | `0.45` | `.a2ui-surface .a2ui-calendar-body [data-outside="true"]` |
| `--agent-ui-a2ui-calendar-width` | `280px` | `.a2ui-surface .a2ui-calendar-body` |
| `--agent-ui-a2ui-card-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-card` |
| `--agent-ui-a2ui-chart-area-opacity` | `0.18` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-axis-opacity` | `0.3` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-caption-font-weight` | `500 / 600` | `.a2ui-surface :is(.a2ui-chart, .a2ui-sparkline) figcaption; .a2ui-chart figcaption, .a2ui-sparkline figcaption` |
| `--agent-ui-a2ui-chart-caption-margin-block-end` | `0.5rem` | `.a2ui-chart figcaption, .a2ui-sparkline figcaption` |
| `--agent-ui-a2ui-chart-color-1` | `var(--color-accent, #3568a8)` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-color-2` | `var(--color-success, #16857b)` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-color-3` | `var(--color-warning, #ae6429)` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-color-4` | `#8756aa` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-color-5` | `#b34c6a` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-label-font-size` | `11px` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-legend-font-size` | `0.75rem / 0.875rem` | `.a2ui-surface .a2ui-chart-legend; .a2ui-chart-legend` |
| `--agent-ui-a2ui-chart-legend-gap` | `0.5rem 1rem` | `.a2ui-chart-legend` |
| `--agent-ui-a2ui-chart-legend-item-gap` | `0.4rem` | `.a2ui-chart-legend li` |
| `--agent-ui-a2ui-chart-legend-swatch-border-radius` | `2px` | `.a2ui-chart-legend span` |
| `--agent-ui-a2ui-chart-legend-swatch-height` | `8px / 0.7rem` | `.a2ui-surface .a2ui-chart-legend span; .a2ui-chart-legend span` |
| `--agent-ui-a2ui-chart-legend-swatch-width` | `8px / 0.7rem` | `.a2ui-surface .a2ui-chart-legend span; .a2ui-chart-legend span` |
| `--agent-ui-a2ui-chart-point-radius` | `3` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-stroke-width` | `2` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-chart-summary-font-size` | `0.8125rem / 0.875rem` | `.a2ui-surface .a2ui-chart summary; .a2ui-chart summary` |
| `--agent-ui-a2ui-chart-summary-padding-block` | `6px` | `.a2ui-surface .a2ui-chart summary` |
| `--agent-ui-a2ui-check-control-height` | `16px` | `.a2ui-surface input:is([type="checkbox"], [type="radio"]); .a2ui-surface input[role="switch"]::before` |
| `--agent-ui-a2ui-check-control-width` | `16px` | `.a2ui-surface input:is([type="checkbox"], [type="radio"]); .a2ui-surface input[role="switch"]::before` |
| `--agent-ui-a2ui-checkbox-gap` | `8px` | `.a2ui-surface .a2ui-checkbox` |
| `--agent-ui-a2ui-choicepicker-gap` | `12px / 10px 16px` | `.a2ui-choicepicker; .a2ui-surface .a2ui-choicepicker` |
| `--agent-ui-a2ui-choicepicker-option-gap` | `8px` | `.a2ui-surface .a2ui-choicepicker label` |
| `--agent-ui-a2ui-color-accent` | `var(--color-accent, #2f5f9f)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-accent-container` | `var(--color-accent-container, #dbe7f7)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-card-border` | `var(--color-card-border, #e5e5e5)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-elevated-surface` | `var(--color-elevated-surface, #fff)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-error` | `var(--color-error, #ba1a1a)` | `A2UI color fallback; .a2ui-surface .a2ui-field [role="alert"]; .a2ui-surface .a2ui-toast[data-variant="error"]` |
| `--agent-ui-a2ui-color-error-container` | `var(--color-error-container, #ffdad6)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-focus-ring` | `var(--color-focus-ring, #2f5f9f)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-hover-surface` | `var(--color-hover-surface, #f2f2f7)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-accent-container` | `var(--color-on-accent-container, #133761)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-error-container` | `var(--color-on-error-container, #93000a)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-primary` | `var(--color-on-primary, #fff)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-success-container` | `var(--color-on-success-container, #253927)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-surface` | `var(--color-on-surface, #1c1b1b)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-on-surface-variant` | `var(--color-on-surface-variant, #444) / var(--color-on-surface-variant, #626267)` | `A2UI color fallback; .a2ui-surface :is(.a2ui-field small, .a2ui-item p, .a2ui-attachment small); .a2ui-surface .a2ui-breadcrumb li:not(:last-child)::after; .a2ui-surface .a2ui-inputgroup > :is(.a2ui-inputgroup-prefix, .a2ui-inputgroup-suffix)` |
| `--agent-ui-a2ui-color-on-warning-container` | `var(--color-on-warning-container, #3f2f0b)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-outline` | `var(--color-outline, #747878)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-outline-variant` | `var(--color-outline-variant, #c4c7c7)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-primary` | `var(--color-primary, #000)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-success` | `var(--color-success, #28744c) / var(--color-success, #4f6f52)` | `A2UI color fallback; .a2ui-surface .a2ui-toast[data-variant="success"]` |
| `--agent-ui-a2ui-color-success-container` | `var(--color-success-container, #e4efe5)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-surface-container` | `var(--color-surface-container, #f1edec)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-surface-container-highest` | `var(--color-surface-container-highest, #ddd)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-surface-container-low` | `var(--color-surface-container-low, #f7f3f2)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-surface-container-lowest` | `var(--color-surface-container-lowest, #fff)` | `A2UI color fallback` |
| `--agent-ui-a2ui-color-warning-container` | `var(--color-warning-container, #f4e8c8)` | `A2UI color fallback` |
| `--agent-ui-a2ui-control-border` | `1px solid var(--color-outline-variant, #c4c7c7)` | `.a2ui-surface input:not([type="checkbox"]):not([type="radio"]), .a2ui-surface textarea` |
| `--agent-ui-a2ui-control-min-height` | `5rem` | `.a2ui-surface textarea` |
| `--agent-ui-a2ui-control-outline` | `2px solid
    color-mix(in srgb, var(--color-focus-ring, #2f5f9f) 35%, transparent)` | `.a2ui-surface :is(input, textarea, select):focus-visible` |
| `--agent-ui-a2ui-control-outline-offset` | `2px` | `.a2ui-surface :is(input, textarea, select):focus-visible` |
| `--agent-ui-a2ui-control-padding` | `4px var(--_agent-ui-control-padding)` | `.a2ui-surface input:not([type="checkbox"]):not([type="radio"]), .a2ui-surface textarea` |
| `--agent-ui-a2ui-control-padding-block` | `See source fallback` | `packages/a2ui-core/defaults.css` |
| `--agent-ui-a2ui-control-placeholder-opacity` | `0.75` | `.a2ui-surface :is(input, textarea)::placeholder` |
| `--agent-ui-a2ui-datetimeinput-gap` | `6px` | `.a2ui-slider, .a2ui-datetimeinput` |
| `--agent-ui-a2ui-description-font-size` | `0.8125rem` | `.a2ui-surface :is(.a2ui-field small, .a2ui-item p, .a2ui-attachment small)` |
| `--agent-ui-a2ui-descriptionlist-gap` | `10px 16px / 0.5rem 1rem` | `.a2ui-surface .a2ui-descriptionlist dl; .a2ui-descriptionlist dl` |
| `--agent-ui-a2ui-dialog-max-height` | `90vh` | `.a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog` |
| `--agent-ui-a2ui-dialog-max-width` | `calc(100vw - 32px)` | `.a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog` |
| `--agent-ui-a2ui-dialog-scrim` | `var(--color-backdrop-scrim, rgb(15 23 42 / 0.24))` | `.a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog::backdrop` |
| `--agent-ui-a2ui-disabled-opacity` | `0.46` | `.a2ui-surface :is(button, input, select, textarea):disabled` |
| `--agent-ui-a2ui-disclosure-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-collapsible` |
| `--agent-ui-a2ui-disclosure-padding` | `10px 0` | `.a2ui-surface .a2ui-collapsible summary` |
| `--agent-ui-a2ui-divider-border-left` | `1px solid var(--color-outline-variant, #c4c7c7)` | `.a2ui-divider[aria-orientation="vertical"]` |
| `--agent-ui-a2ui-divider-border-top` | `1px solid var(--color-outline-variant, #c4c7c7)` | `.a2ui-divider` |
| `--agent-ui-a2ui-divider-min-height` | `24px` | `.a2ui-divider[aria-orientation="vertical"]` |
| `--agent-ui-a2ui-divider-width` | `1px` | `.a2ui-divider[aria-orientation="vertical"]` |
| `--agent-ui-a2ui-emptystate-padding` | `32px 16px` | `.a2ui-emptystate` |
| `--agent-ui-a2ui-field-font-weight` | `500` | `.a2ui-surface :is( .a2ui-textfield, .a2ui-numberfield, .a2ui-select, .a2ui-datetimeinput, .a2ui-slider )` |
| `--agent-ui-a2ui-field-gap` | `8px` | `.a2ui-surface :is( .a2ui-textfield, .a2ui-numberfield, .a2ui-select, .a2ui-datetimeinput, .a2ui-slider ); .a2ui-surface :is( .a2ui-field, .a2ui-textarea, .a2ui-inputotp, .a2ui-item, .a2ui-sidebar, .a2ui-attachment, .a2ui-command, .a2ui-combobox ); .a2ui-surface .a2ui-inputgroup; .a2ui-surface .a2ui-select` |
| `--agent-ui-a2ui-group-gap` | `8px` | `.a2ui-surface :is( .a2ui-buttongroup, .a2ui-togglegroup, .a2ui-pagination, .a2ui-datatable nav, .a2ui-carousel > div:last-child, .a2ui-inputgroup )` |
| `--agent-ui-a2ui-heading-1-font-size` | `1.5rem` | `.a2ui-surface h1` |
| `--agent-ui-a2ui-heading-2-font-size` | `1.125rem` | `.a2ui-surface h2` |
| `--agent-ui-a2ui-heading-3-font-size` | `1rem` | `.a2ui-surface h3` |
| `--agent-ui-a2ui-heading-font-weight` | `600` | `.a2ui-surface :is(h1, h2, h3)` |
| `--agent-ui-a2ui-heading-letter-spacing` | `-0.025em` | `.a2ui-surface :is(h1, h2, h3)` |
| `--agent-ui-a2ui-heading-line-height` | `1.35` | `.a2ui-surface :is(h1, h2, h3)` |
| `--agent-ui-a2ui-icon-size` | `24px` | `packages/a2ui-core/src/index.ts` |
| `--agent-ui-a2ui-icon-stroke-width` | `2` | `packages/a2ui-core/src/index.ts` |
| `--agent-ui-a2ui-image-avatar-border-radius` | `50%` | `.a2ui-image[data-variant="avatar"]` |
| `--agent-ui-a2ui-image-avatar-height` | `64px` | `.a2ui-image[data-variant="avatar"]` |
| `--agent-ui-a2ui-image-avatar-width` | `64px` | `.a2ui-image[data-variant="avatar"]` |
| `--agent-ui-a2ui-image-header-max-height` | `240px` | `.a2ui-image[data-variant="header"]` |
| `--agent-ui-a2ui-image-icon-height` | `24px` | `.a2ui-image[data-variant="icon"]` |
| `--agent-ui-a2ui-image-icon-width` | `24px` | `.a2ui-image[data-variant="icon"]` |
| `--agent-ui-a2ui-image-largefeature-max-width` | `640px` | `.a2ui-image[data-variant="largeFeature"]` |
| `--agent-ui-a2ui-image-mediumfeature-max-width` | `320px` | `.a2ui-image[data-variant="mediumFeature"]` |
| `--agent-ui-a2ui-image-smallfeature-max-width` | `160px` | `.a2ui-image[data-variant="smallFeature"]` |
| `--agent-ui-a2ui-inputgroup-addon-background` | `var(--color-surface-container, #f4f4f5)` | `.a2ui-surface .a2ui-inputgroup > :is(.a2ui-inputgroup-prefix, .a2ui-inputgroup-suffix)` |
| `--agent-ui-a2ui-inputgroup-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-inputgroup; .a2ui-surface .a2ui-inputgroup > :is(.a2ui-inputgroup-prefix, .a2ui-inputgroup-suffix)` |
| `--agent-ui-a2ui-inputgroup-padding` | `0 10px` | `.a2ui-surface .a2ui-inputgroup; .a2ui-surface .a2ui-inputgroup > :is(.a2ui-inputgroup-prefix, .a2ui-inputgroup-suffix)` |
| `--agent-ui-a2ui-interaction-card-border` | `1px solid var(--ef-border, #ddd)` | `.a2ui-questioncard, .a2ui-approvalcard` |
| `--agent-ui-a2ui-interaction-card-border-radius` | `.75rem` | `.a2ui-questioncard, .a2ui-approvalcard` |
| `--agent-ui-a2ui-interaction-card-gap` | `.75rem` | `.a2ui-questioncard, .a2ui-approvalcard` |
| `--agent-ui-a2ui-interaction-card-margin-inline-end` | `.5rem` | `.a2ui-questioncard button, .a2ui-approvalcard button` |
| `--agent-ui-a2ui-interaction-card-padding` | `1rem / .4rem .7rem` | `.a2ui-questioncard, .a2ui-approvalcard; .a2ui-questioncard button, .a2ui-approvalcard button` |
| `--agent-ui-a2ui-kbd-background` | `var(--color-surface-container-low, #f7f3f2)` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-kbd-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-kbd-font` | `12px ui-monospace, monospace` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-kbd-padding` | `2px 6px` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-kbd-radius` | `4px` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-kbd-shadow` | `0 1px 1px rgb(0 0 0 / 0.08)` | `.a2ui-surface .a2ui-kbd` |
| `--agent-ui-a2ui-label-font-weight` | `500` | `.a2ui-surface .a2ui-control-label, .a2ui-surface .a2ui-label` |
| `--agent-ui-a2ui-link-underline-offset` | `3px` | `.a2ui-surface :is(.a2ui-breadcrumb, .a2ui-navigationmenu) a` |
| `--agent-ui-a2ui-list-gap` | `12px` | `.a2ui-list` |
| `--agent-ui-a2ui-list-max-height` | `400px` | `.a2ui-list` |
| `--agent-ui-a2ui-listbox-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="listbox"]` |
| `--agent-ui-a2ui-listbox-gap` | `2px` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="listbox"]` |
| `--agent-ui-a2ui-listbox-max-height` | `240px` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="listbox"]` |
| `--agent-ui-a2ui-listbox-padding` | `4px` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="listbox"]` |
| `--agent-ui-a2ui-marker-background` | `var(--color-warning-container, #f4e8c8)` | `.a2ui-surface .a2ui-marker` |
| `--agent-ui-a2ui-marker-foreground` | `var(--color-on-warning-container, #3f2f0b)` | `.a2ui-surface .a2ui-marker` |
| `--agent-ui-a2ui-marker-padding` | `0 3px` | `.a2ui-surface .a2ui-marker` |
| `--agent-ui-a2ui-marker-radius` | `3px` | `.a2ui-surface .a2ui-marker` |
| `--agent-ui-a2ui-menu-gap` | `4px` | `.a2ui-surface .a2ui-popup[role="menu"]:popover-open` |
| `--agent-ui-a2ui-meter-bad-color` | `var(--color-error, #ba1a1a)` | `packages/a2ui-core/statistics.css` |
| `--agent-ui-a2ui-meter-border-radius` | `99px` | `packages/a2ui-core/statistics.css` |
| `--agent-ui-a2ui-meter-gap` | `0.5rem` | `.a2ui-meter` |
| `--agent-ui-a2ui-meter-good-color` | `See source fallback` | `packages/a2ui-core/statistics.css` |
| `--agent-ui-a2ui-meter-height` | `12px / 1.25rem` | `.a2ui-surface .a2ui-meter meter; .a2ui-meter meter` |
| `--agent-ui-a2ui-meter-track` | `See source fallback` | `packages/a2ui-core/statistics.css` |
| `--agent-ui-a2ui-meter-warning-color` | `See source fallback` | `packages/a2ui-core/statistics.css` |
| `--agent-ui-a2ui-modal-background` | `rgba(0, 0, 0, 0.4)` | `.a2ui-modal dialog::backdrop` |
| `--agent-ui-a2ui-modal-border` | `1px solid var(--color-outline-variant, #ccc)` | `.a2ui-modal dialog` |
| `--agent-ui-a2ui-modal-box-shadow` | `0 16px 48px rgb(0 0 0 / 0.16)` | `.a2ui-surface .a2ui-modal dialog` |
| `--agent-ui-a2ui-modal-close-border` | `1px solid var(--a2ui-border)` | `.a2ui-surface .a2ui-modal dialog > button` |
| `--agent-ui-a2ui-modal-close-border-radius` | `5px` | `.a2ui-surface .a2ui-modal dialog > button` |
| `--agent-ui-a2ui-modal-close-gap` | `12px` | `.a2ui-surface .a2ui-modal dialog > .a2ui-modal-close` |
| `--agent-ui-a2ui-modal-close-padding` | `4px 8px` | `.a2ui-surface .a2ui-modal dialog > button` |
| `--agent-ui-a2ui-modal-max-height` | `85vh` | `.a2ui-modal dialog` |
| `--agent-ui-a2ui-modal-width` | `min(560px, calc(100% - 32px))` | `.a2ui-modal dialog` |
| `--agent-ui-a2ui-navigation-gap` | `12px` | `.a2ui-surface :is(.a2ui-breadcrumb, .a2ui-navigationmenu) ol; .a2ui-surface .a2ui-breadcrumb li:not(:last-child)::after` |
| `--agent-ui-a2ui-navigation-link-color` | `var(--color-accent, #2f5f9f)` | `.a2ui-surface :is(.a2ui-breadcrumb, .a2ui-navigationmenu) a` |
| `--agent-ui-a2ui-option-active-background` | `var(--color-hover-surface, #f2f2f7)` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="option"]:is([data-active="true"], [aria-selected="true"])` |
| `--agent-ui-a2ui-option-padding` | `8px 10px` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="option"]` |
| `--agent-ui-a2ui-option-radius` | `4px` | `.a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="option"]` |
| `--agent-ui-a2ui-otp-font` | `ui-monospace, monospace` | `.a2ui-surface .a2ui-inputotp input` |
| `--agent-ui-a2ui-otp-letter-spacing` | `0.7em` | `.a2ui-surface .a2ui-inputotp input` |
| `--agent-ui-a2ui-otp-width` | `100%` | `.a2ui-surface .a2ui-inputotp input` |
| `--agent-ui-a2ui-popup-background` | `var(--color-elevated-surface, #fff)` | `.a2ui-surface .a2ui-popup; .a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog` |
| `--agent-ui-a2ui-popup-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-popup; .a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog` |
| `--agent-ui-a2ui-popup-foreground` | `var(--color-on-surface, #1c1b1b)` | `.a2ui-surface .a2ui-popup; .a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog` |
| `--agent-ui-a2ui-popup-max-height` | `70vh` | `.a2ui-surface .a2ui-popup` |
| `--agent-ui-a2ui-popup-max-width` | `min(360px, calc(100vw - 32px))` | `.a2ui-surface .a2ui-popup` |
| `--agent-ui-a2ui-popup-padding` | `12px` | `.a2ui-surface .a2ui-popup` |
| `--agent-ui-a2ui-popup-radius` | `var(--agent-ui-panel-radius, 10px)` | `.a2ui-surface .a2ui-popup` |
| `--agent-ui-a2ui-popup-shadow` | `0 8px 24px rgb(0 0 0 / 0.12)` | `.a2ui-surface .a2ui-popup` |
| `--agent-ui-a2ui-progress-border-radius` | `99px` | `.a2ui-surface .a2ui-progress progress; .a2ui-surface .a2ui-progress progress::-webkit-progress-value; .a2ui-surface .a2ui-progress progress::-moz-progress-bar` |
| `--agent-ui-a2ui-progress-gap` | `6px` | `.a2ui-progress` |
| `--agent-ui-a2ui-progress-height` | `7px` | `.a2ui-surface .a2ui-progress progress` |
| `--agent-ui-a2ui-questioncard-gap` | `.5rem` | `.a2ui-questioncard fieldset; .a2ui-questioncard label` |
| `--agent-ui-a2ui-questioncard-min-height` | `4rem` | `.a2ui-questioncard textarea` |
| `--agent-ui-a2ui-questioncard-unit-opacity` | `.7` | `.a2ui-questioncard small` |
| `--agent-ui-a2ui-resize-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-resizable` |
| `--agent-ui-a2ui-resize-handle-background` | `var(--color-surface-container, #f1edec)` | `.a2ui-surface .a2ui-resizable [role="separator"]` |
| `--agent-ui-a2ui-resize-handle-width` | `8px` | `.a2ui-surface .a2ui-resizable` |
| `--agent-ui-a2ui-resize-min-height` | `120px` | `.a2ui-surface .a2ui-resizable` |
| `--agent-ui-a2ui-resize-panel-padding` | `12px` | `.a2ui-surface .a2ui-resizable > div:not([role="separator"])` |
| `--agent-ui-a2ui-scroll-height` | `var(--a2ui-scroll-height, 160px)` | `.a2ui-surface :is(.a2ui-scrollarea, .a2ui-messagescroller)` |
| `--agent-ui-a2ui-scroll-padding` | `8px` | `.a2ui-surface :is(.a2ui-scrollarea, .a2ui-messagescroller)` |
| `--agent-ui-a2ui-select-border` | `1px solid var(--color-outline-variant, #ccc)` | `.a2ui-select select` |
| `--agent-ui-a2ui-select-gap` | `6px` | `.a2ui-numberfield, .a2ui-select` |
| `--agent-ui-a2ui-select-padding` | `4px var(--_agent-ui-control-padding)` | `.a2ui-select select` |
| `--agent-ui-a2ui-selection-background` | `var(--color-primary, #18181b)` | `.a2ui-surface :is(.a2ui-toggle, .a2ui-togglegroup button)[aria-pressed="true"], .a2ui-surface .a2ui-pagination [aria-current="page"]; .a2ui-surface .a2ui-calendar-body [data-selected="true"]; .a2ui-surface .a2ui-select [role="option"][aria-selected="true"]` |
| `--agent-ui-a2ui-selection-foreground` | `var(--color-on-primary, #fff)` | `.a2ui-surface :is(.a2ui-toggle, .a2ui-togglegroup button)[aria-pressed="true"], .a2ui-surface .a2ui-pagination [aria-current="page"]; .a2ui-surface .a2ui-calendar-body [data-selected="true"]; .a2ui-surface .a2ui-select [role="option"][aria-selected="true"]` |
| `--agent-ui-a2ui-sheet-width` | `360px` | `.a2ui-surface :is(.a2ui-drawer, .a2ui-sheet) dialog` |
| `--agent-ui-a2ui-skeleton-animation` | `a2ui-pulse 1.5s ease-in-out infinite` | `.a2ui-skeleton > div` |
| `--agent-ui-a2ui-skeleton-border-radius` | `6px` | `.a2ui-skeleton > div` |
| `--agent-ui-a2ui-skeleton-gap` | `10px` | `.a2ui-skeleton` |
| `--agent-ui-a2ui-skeleton-height` | `16px` | `.a2ui-skeleton > div` |
| `--agent-ui-a2ui-skeleton-pulse-opacity` | `0.5` | `@keyframes a2ui-pulse { 50%` |
| `--agent-ui-a2ui-slider-control-box-shadow` | `0 1px 2px rgb(0 0 0 / 0.025)` | `.a2ui-surface :is( input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select )` |
| `--agent-ui-a2ui-slider-control-font-weight` | `400` | `.a2ui-surface :is( input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select )` |
| `--agent-ui-a2ui-slider-control-min-height` | `20px` | `.a2ui-surface input[type="range"]` |
| `--agent-ui-a2ui-spacer-height` | `16px` | `.a2ui-spacer` |
| `--agent-ui-a2ui-spacer-horizontal-height` | `1px` | `.a2ui-spacer[data-axis="horizontal"]` |
| `--agent-ui-a2ui-spacer-horizontal-width` | `16px` | `.a2ui-spacer[data-axis="horizontal"]` |
| `--agent-ui-a2ui-spacer-large-height` | `32px` | `.a2ui-spacer[data-size="large"]` |
| `--agent-ui-a2ui-spacer-large-horizontal-width` | `32px` | `.a2ui-spacer[data-axis="horizontal"][data-size="large"]` |
| `--agent-ui-a2ui-spacer-small-height` | `8px` | `.a2ui-spacer[data-size="small"]` |
| `--agent-ui-a2ui-spacer-small-horizontal-width` | `8px` | `.a2ui-spacer[data-axis="horizontal"][data-size="small"]` |
| `--agent-ui-a2ui-sparkline-max-height` | `90px` | `.a2ui-sparkline svg` |
| `--agent-ui-a2ui-sparkline-point-radius` | `2.5` | `packages/a2ui-core/src/statistics-components.ts` |
| `--agent-ui-a2ui-spinner-gap` | `8px` | `.a2ui-spinner` |
| `--agent-ui-a2ui-spinner-ring-animation` | `a2ui-spin 1s linear infinite` | `.a2ui-spinner-ring` |
| `--agent-ui-a2ui-spinner-ring-border` | `2px solid var(--color-outline-variant, #ccc)` | `.a2ui-spinner-ring` |
| `--agent-ui-a2ui-spinner-ring-border-radius` | `50%` | `.a2ui-spinner-ring` |
| `--agent-ui-a2ui-spinner-ring-height` | `20px` | `.a2ui-spinner-ring` |
| `--agent-ui-a2ui-spinner-ring-width` | `20px` | `.a2ui-spinner-ring` |
| `--agent-ui-a2ui-statistic-label-font-size` | `0.8125rem` | `.a2ui-surface .a2ui-statistic-label` |
| `--agent-ui-a2ui-statistic-label-font-weight` | `500` | `.a2ui-surface .a2ui-statistic-label` |
| `--agent-ui-a2ui-statistic-value-font-size` | `1.875rem / 2rem` | `.a2ui-surface .a2ui-statistic-value; .a2ui-statistic-value` |
| `--agent-ui-a2ui-statistic-value-font-weight` | `600 / 650` | `.a2ui-surface .a2ui-statistic-value; .a2ui-statistic-value` |
| `--agent-ui-a2ui-statistic-value-letter-spacing` | `-0.035em` | `.a2ui-surface .a2ui-statistic-value` |
| `--agent-ui-a2ui-statistic-value-margin-top` | `4px` | `.a2ui-surface .a2ui-statistic-value` |
| `--agent-ui-a2ui-statistic-value-unit-font-size` | `0.875rem` | `.a2ui-statistic-value small` |
| `--agent-ui-a2ui-statistic-value-unit-font-weight` | `400` | `.a2ui-statistic-value small` |
| `--agent-ui-a2ui-statistic-value-unit-margin-inline-start` | `0.4rem` | `.a2ui-statistic-value small` |
| `--agent-ui-a2ui-surface-line-height` | `1.5` | `.a2ui-surface` |
| `--agent-ui-a2ui-surface-outline` | `2px solid var(--color-focus-ring, #2f5f9f)` | `.a2ui-surface :focus-visible` |
| `--agent-ui-a2ui-surface-outline-offset` | `3px` | `.a2ui-surface :focus-visible` |
| `--agent-ui-a2ui-switch-border` | `1px solid transparent` | `.a2ui-surface input[role="switch"]` |
| `--agent-ui-a2ui-switch-border-radius` | `99px` | `.a2ui-switch input` |
| `--agent-ui-a2ui-switch-checked-thumb-left` | `17px / 15px` | `.a2ui-switch input:checked:before; .a2ui-surface input[role="switch"]:checked::before` |
| `--agent-ui-a2ui-switch-gap` | `8px` | `.a2ui-switch` |
| `--agent-ui-a2ui-switch-height` | `22px / 20px` | `.a2ui-switch input; .a2ui-surface input[role="switch"]` |
| `--agent-ui-a2ui-switch-thumb-background` | `#fff` | `.a2ui-switch input:before` |
| `--agent-ui-a2ui-switch-thumb-border-radius` | `50%` | `.a2ui-switch input:before` |
| `--agent-ui-a2ui-switch-thumb-box-shadow` | `0 1px 2px rgb(0 0 0 / 0.15)` | `.a2ui-surface input[role="switch"]::before` |
| `--agent-ui-a2ui-switch-thumb-height` | `16px` | `.a2ui-switch input:before` |
| `--agent-ui-a2ui-switch-thumb-left` | `3px / 1px` | `.a2ui-switch input:before; .a2ui-surface input[role="switch"]::before` |
| `--agent-ui-a2ui-switch-thumb-top` | `3px / 1px` | `.a2ui-switch input:before; .a2ui-surface input[role="switch"]::before` |
| `--agent-ui-a2ui-switch-thumb-width` | `16px` | `.a2ui-switch input:before` |
| `--agent-ui-a2ui-switch-width` | `36px / 34px` | `.a2ui-switch input; .a2ui-surface input[role="switch"]` |
| `--agent-ui-a2ui-table-border-bottom` | `1px solid var(--color-outline-variant, #ccc)` | `.a2ui-table th, .a2ui-table td` |
| `--agent-ui-a2ui-table-font-weight` | `600` | `.a2ui-table caption` |
| `--agent-ui-a2ui-table-header-font-weight` | `500` | `.a2ui-surface .a2ui-table th` |
| `--agent-ui-a2ui-table-padding` | `4px var(--_agent-ui-control-padding) / 10px 14px / 10px 12px` | `.a2ui-table caption; .a2ui-table th, .a2ui-table td; .a2ui-surface .a2ui-table :is(th, td)` |
| `--agent-ui-a2ui-tabs-box-shadow` | `0 1px 3px rgb(0 0 0 / 0.08)` | `.a2ui-surface .a2ui-tabs [aria-selected="true"]` |
| `--agent-ui-a2ui-tabs-tab-border-bottom` | `3px solid transparent` | `.a2ui-tabs [role="tab"]` |
| `--agent-ui-a2ui-tabs-tab-border-radius` | `4px` | `.a2ui-surface .a2ui-tabs [role="tab"]` |
| `--agent-ui-a2ui-tabs-tab-font-weight` | `500` | `.a2ui-surface .a2ui-tabs [role="tab"]` |
| `--agent-ui-a2ui-tabs-tab-min-height` | `30px` | `.a2ui-surface .a2ui-tabs [role="tab"]` |
| `--agent-ui-a2ui-tabs-tab-padding` | `4px var(--_agent-ui-control-padding)` | `.a2ui-tabs [role="tab"]` |
| `--agent-ui-a2ui-tabs-tablist-border-bottom` | `1px solid var(--color-outline-variant, #ccc)` | `.a2ui-tabs [role="tablist"]` |
| `--agent-ui-a2ui-tabs-tablist-border-radius` | `7px` | `.a2ui-surface .a2ui-tabs [role="tablist"]` |
| `--agent-ui-a2ui-tabs-tablist-gap` | `4px / 2px` | `.a2ui-tabs [role="tablist"]; .a2ui-surface .a2ui-tabs [role="tablist"]` |
| `--agent-ui-a2ui-tabs-tablist-padding` | `4px` | `.a2ui-surface .a2ui-tabs [role="tablist"]` |
| `--agent-ui-a2ui-tabs-tabpanel-padding` | `16px 0` | `.a2ui-tabs [role="tabpanel"]` |
| `--agent-ui-a2ui-textfield-gap` | `6px` | `.a2ui-textfield` |
| `--agent-ui-a2ui-toast-background` | `var(--color-elevated-surface, #fff)` | `.a2ui-surface .a2ui-toast` |
| `--agent-ui-a2ui-toast-border` | `1px solid var(--color-card-border, #e5e5e5)` | `.a2ui-surface .a2ui-toast` |
| `--agent-ui-a2ui-toast-padding` | `16px` | `.a2ui-surface .a2ui-toast` |
| `--agent-ui-a2ui-toast-shadow` | `0 4px 16px rgb(0 0 0 / 0.08)` | `.a2ui-surface .a2ui-toast` |
| `--agent-ui-a2ui-tooltip-font-size` | `0.8125rem` | `.a2ui-surface .a2ui-tooltip .a2ui-popup` |
| `--agent-ui-a2ui-trend-font-size` | `0.8125rem` | `.a2ui-surface .a2ui-trend` |
| `--agent-ui-control-font-size` | `0.875rem` | `packages/chat-theme/src/primitives.css; .a2ui-surface .a2ui-control-label, .a2ui-surface .a2ui-label` |
| `--agent-ui-control-height` | `2rem` | `packages/chat-theme/src/primitives.css` |
| `--agent-ui-control-padding` | `0.625rem` | `packages/chat-theme/src/primitives.css` |
| `--agent-ui-control-radius` | `4px / 6px` | `packages/chat-theme/src/primitives.css; .a2ui-surface .a2ui-inputgroup; .a2ui-surface :is(.a2ui-combobox, .a2ui-command) [role="listbox"]; .a2ui-surface .a2ui-inputgroup > .a2ui-inputgroup-prefix; .a2ui-surface .a2ui-inputgroup > .a2ui-inputgroup-suffix; .a2ui-surface .a2ui-inputgroup:not(:has(.a2ui-inputgroup-prefix)) input; .a2ui-surface .a2ui-inputgroup:not(:has(.a2ui-inputgroup-suffix)) input` |
| `--agent-ui-font` | `var(--agent-ui-skin-font, var(--font-sans, Inter, sans-serif))` | `packages/chat-theme/src/primitives.css` |
| `--agent-ui-gap` | `0.75rem / 14px` | `packages/chat-theme/src/primitives.css; .a2ui-surface .a2ui-messagescroller; .a2ui-surface .a2ui-carousel` |
| `--agent-ui-panel-padding` | `1rem / 20px / 24px` | `packages/chat-theme/src/primitives.css; .a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog; .a2ui-surface .a2ui-modal dialog` |
| `--agent-ui-panel-radius` | `8px / 10px / 12px` | `packages/chat-theme/src/primitives.css; .a2ui-surface .a2ui-attachment; .a2ui-surface .a2ui-popup; .a2ui-surface :is(.a2ui-drawer, .a2ui-sheet, .a2ui-alertdialog) dialog; .a2ui-surface .a2ui-toast; .a2ui-surface .a2ui-modal dialog` |
| `--agent-ui-skin-font` | `var(--font-sans, Inter, sans-serif)` | `packages/chat-theme/src/primitives.css` |
| `--agent-ui-system-font-size` | `See source fallback` | `packages/a2ui-core/components.css` |
| `--agent-ui-transition-duration` | `120ms` | `packages/chat-theme/src/primitives.css` |

Select 弹层默认与触发框同宽，并限制在视口内。可通过 `--agent-ui-a2ui-select-popup-width` 指定宽度（默认 `var(--a2ui-select-trigger-width, auto)`），通过 `--agent-ui-a2ui-select-popup-max-width` 设置上限（默认 `calc(100vw - 16px)`）。
