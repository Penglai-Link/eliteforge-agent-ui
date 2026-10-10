# shadcn Base UI 与 A2UI 组件对应表

参考 [shadcn Base UI 组件目录](https://ui.shadcn.com/docs/components/base/accordion)。通用 Catalog 共 79 个组件；其中新增 40 个。React / Vue 共享渲染、Schema、绑定校验、主题变量和状态快照。

这是 A2UI 声明式接口，属性不照搬 React JSX API。官方同类组件对应如下；Questionnaire 对应 Agent Catalog 的 QuestionCard。

| shadcn | A2UI |
| --- | --- |
| Accordion | Accordion |
| Alert | Alert |
| AlertDialog | AlertDialog |
| AspectRatio | AspectRatio |
| Attachment | Attachment |
| Avatar | Avatar |
| Badge | Badge |
| Breadcrumb | Breadcrumb |
| Bubble | Bubble |
| Button | Button |
| ButtonGroup | ButtonGroup |
| Calendar | Calendar |
| Card | Card |
| Carousel | Carousel |
| Chart | Chart |
| Checkbox | Checkbox |
| Collapsible | Collapsible |
| Combobox | Combobox |
| Command | Command |
| ContextMenu | ContextMenu |
| DataTable | DataTable |
| DatePicker | DatePicker |
| Dialog | Modal |
| Direction | Direction |
| Drawer | Drawer |
| DropdownMenu | DropdownMenu |
| Empty | EmptyState |
| Field | Field |
| HoverCard | HoverCard |
| Input | TextField |
| InputGroup | InputGroup |
| InputOTP | InputOTP |
| Item | Item |
| Kbd | Kbd |
| Label | Label |
| Marker | Marker |
| Menubar | Menubar |
| Message | Message |
| MessageScroller | MessageScroller |
| NativeSelect | Select（统一自定义选项弹层） |
| NavigationMenu | NavigationMenu |
| Pagination | Pagination |
| Popover | Popover |
| Progress | Progress |
| Questionnaire | QuestionCard（Agent Catalog） |
| RadioGroup | ChoicePicker |
| Resizable | Resizable |
| ScrollArea | ScrollArea |
| Select | Select |
| Separator | Divider |
| Sheet | Sheet |
| Sidebar | Sidebar |
| Skeleton | Skeleton |
| Slider | Slider |
| Spinner | Spinner |
| Switch | Switch |
| Table | Table |
| Tabs | Tabs |
| Textarea | Textarea |
| Toast | Toast |
| Toggle | Toggle |
| ToggleGroup | ToggleGroup |
| Tooltip | Tooltip |
| Typography | Text |

## 新组件属性

所有组件均需 `id` 和 `component`。值可使用 Catalog 支持的字面量或路径绑定；交互写入要求 `value: {path: "/..."}`。完整类型以 Catalog Schema 为准。

| 组件 | 必填属性 | 可选属性 |
| --- | --- | --- |
| ButtonGroup | children | label |
| InputGroup | children | label, prefix, suffix |
| Item | children | label, title, description |
| Sidebar | children | label |
| ScrollArea | children | label, height |
| Direction | children | label, direction |
| Bubble | children | label, align |
| MessageScroller | children | label |
| AspectRatio | child | ratio |
| Label | text | — |
| Kbd | text | — |
| Marker | text | — |
| Breadcrumb | items | label |
| NavigationMenu | items | label |
| Textarea | value | label, placeholder, rows, disabled |
| InputOTP | value | label, length, disabled |
| Calendar | value | label, min, max, disabled |
| DatePicker | value | label, min, max, disabled |
| Combobox | value, options | label, placeholder, disabled |
| Command | value, options | label, placeholder, disabled |
| Toggle | label, value | disabled |
| ToggleGroup | value, options | label, multiple, disabled |
| Pagination | value, totalPages | label, disabled |
| Collapsible | label, child | defaultOpen |
| Popover | label, child | defaultOpen |
| HoverCard | label, child | defaultOpen |
| Tooltip | label, child | defaultOpen |
| Drawer | label, child | defaultOpen, side |
| Sheet | label, child | defaultOpen, side |
| AlertDialog | label, child | defaultOpen, title, description, confirmLabel, action |
| DropdownMenu | label, value, options | disabled, action |
| ContextMenu | label, value, options | disabled, action |
| Menubar | label, value, options | disabled, action |
| Field | label, child | description, error |
| Carousel | children | label, defaultIndex |
| Resizable | children | label, defaultSize |
| Toast | title | description, variant, defaultOpen |
| Attachment | name, url | description |
| Message | role, text | — |
| DataTable | columns, rows | label, pageSize |

## 交互约定与边界

- Accordion 保留单项 `title + child` 用法，新增 `items: [{id, title, child, disabled?}]` 和 `multiple`。多项支持方向键、Home / End。
- Calendar / DatePicker 使用 `YYYY-MM-DD`，支持 min / max；InputOTP 只接收数字，长度可配置。禁用项、越界页码、非法日期和值类型会被 Core 拒绝。
- Combobox / Command 支持过滤、方向键和 Enter；ToggleGroup 支持单选、多选。DropdownMenu / ContextMenu / Menubar 使用单层 options，不含嵌套菜单。Menubar 展示一个菜单入口；NavigationMenu 展示平铺链接。
- Popover 使用浏览器原生顶层弹层；Drawer / Sheet / AlertDialog 使用原生 dialog，支持 Escape、模态焦点约束。Tooltip / HoverCard 支持鼠标悬停和键盘焦点；ContextMenu 支持右键及 Shift+F10。
- DataTable 支持本地排序、分页和空状态；不含服务端查询、列拖动及虚拟滚动。Resizable 支持指针拖动与键盘调整；Carousel 支持前后切换与方向键。
- Attachment 展示文件链接；Toast 为受控显隐通知；不承担文件上传、通知队列或自动过期。Message / Bubble / MessageScroller 提供消息展示，不承担模型流式请求。
- 组件值保存在 dataModel；展开、过滤、排序、月份和分栏尺寸保存在 viewState，随 exportSnapshot / importSnapshot 恢复。action 由宿主 onAction 处理，不直接执行网络或业务操作。

## 页面验收

两端 `#atomic-gallery` 展示 79 个带名称的独立 Surface，每个示例拥有独立数据模型。组合区域展示统计仪表盘，以及多项 Accordion、Field、DataTable。主题变量见 [主题清单](a2ui-theme.md)。

Select 使用自定义 listbox 弹层，支持方向键、Home / End、Enter、Escape、点击外部关闭与焦点恢复；不再显示系统原生选项菜单。Modal 使用原生 dialog 维护模态焦点，面板、关闭按钮和遮罩由共享主题控制。
