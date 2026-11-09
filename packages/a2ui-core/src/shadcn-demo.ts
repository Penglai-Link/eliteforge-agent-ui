import { A2UIClient, VERSION, CATALOG_ID } from "./index";
export function initializeShadcnDemo(client: A2UIClient) {
  const options = [
    { label: "React", value: "react" },
    { label: "Vue", value: "vue" },
    { label: "暂不可用", value: "disabled", disabled: true },
  ];
  const samples: any[] = [
    {
      component: "ButtonGroup",
      children: ["sample-button-a", "sample-button-b"],
      label: "操作组",
    },
    {
      component: "InputGroup",
      prefix: "https://",
      suffix: ".com",
      children: ["sample-input"],
    },
    {
      component: "Item",
      title: "项目成员",
      description: "查看与管理成员信息",
      children: ["sample-text-a"],
    },
    {
      component: "Sidebar",
      label: "工作区导航",
      children: ["sample-text-a", "sample-text-b"],
    },
    {
      component: "ScrollArea",
      label: "可滚动内容",
      height: 120,
      children: Array.from({ length: 12 }, (_, i) =>
        i % 2 ? "sample-text-a" : "sample-text-b"
      ),
    },
    { component: "Direction", direction: "rtl", children: ["sample-text-a"] },
    { component: "Bubble", align: "end", children: ["sample-text-a"] },
    {
      component: "MessageScroller",
      label: "消息记录",
      children: ["sample-message-a", "sample-message-b"],
    },
    { component: "AspectRatio", ratio: 16 / 9, child: "sample-image" },
    { component: "Label", text: "账户名称" },
    { component: "Kbd", text: "⌘ K" },
    { component: "Marker", text: "重点内容" },
    {
      component: "Breadcrumb",
      items: [
        { label: "首页", url: "#atomic-gallery" },
        { label: "组件" },
        { label: "当前页面" },
      ],
    },
    {
      component: "NavigationMenu",
      label: "页面导航",
      items: [
        { label: "原子组件", url: "#atomic-gallery" },
        { label: "组合示例", url: "#composed-examples" },
      ],
    },
    {
      component: "Textarea",
      label: "备注",
      value: { path: "/notes" },
      placeholder: "请输入备注",
    },
    {
      component: "InputOTP",
      label: "验证码",
      value: { path: "/otp" },
      length: 6,
    },
    {
      component: "Calendar",
      label: "选择日期",
      value: { path: "/date" },
      min: "2026-10-01",
      max: "2026-12-31",
    },
    {
      component: "DatePicker",
      label: "选择日期",
      value: { path: "/date" },
      min: "2026-10-01",
      max: "2026-12-31",
    },
    {
      component: "Combobox",
      label: "开发框架",
      value: { path: "/framework" },
      placeholder: "搜索框架",
      options,
    },
    {
      component: "Command",
      label: "搜索命令",
      value: { path: "/command" },
      placeholder: "搜索命令",
      options,
    },
    { component: "Toggle", label: "加粗", value: { path: "/bold" } },
    {
      component: "ToggleGroup",
      label: "文本样式",
      value: { path: "/styles" },
      options: [
        { label: "加粗", value: "bold" },
        { label: "斜体", value: "italic" },
      ],
      multiple: true,
    },
    { component: "Pagination", value: { path: "/page" }, totalPages: 12 },
    { component: "Collapsible", label: "展开内容", child: "sample-text-a" },
    { component: "Popover", label: "打开弹出内容", child: "sample-text-a" },
    { component: "HoverCard", label: "查看用户信息", child: "sample-text-a" },
    { component: "Tooltip", label: "查看提示", child: "sample-text-a" },
    {
      component: "Drawer",
      label: "打开抽屉",
      side: "bottom",
      child: "sample-text-a",
    },
    {
      component: "Sheet",
      label: "打开侧边面板",
      side: "right",
      child: "sample-text-a",
    },
    {
      component: "AlertDialog",
      label: "删除记录",
      title: "确认删除？",
      description: "确认后由宿主处理删除操作。",
      child: "sample-text-a",
      confirmLabel: "确认删除",
      action: { event: { name: "confirmDelete" } },
    },
    ...["DropdownMenu", "ContextMenu", "Menubar"].map((component) => ({
      component,
      label:
        component === "ContextMenu"
          ? "右键或点击打开菜单"
          : component === "Menubar"
          ? "文件"
          : "选择框架",
      value: { path: "/menu" },
      options,
      action: {
        event: {
          name: "selectFramework",
          context: { selected: { path: "/menu" } },
        },
      },
    })),
    {
      component: "Field",
      label: "表单字段",
      description: "填写账户名称",
      child: "sample-input",
    },
    {
      component: "Carousel",
      label: "内容轮播",
      children: ["sample-text-a", "sample-text-b"],
    },
    {
      component: "Resizable",
      label: "调整面板宽度",
      children: ["sample-text-a", "sample-text-b"],
    },
    {
      component: "Toast",
      title: "保存成功",
      description: "设置已更新",
      variant: "success",
    },
    {
      component: "Attachment",
      name: "产品说明",
      url: "/samples/landscape.svg",
      description: "SVG · 本地示例",
    },
    { component: "Message", role: "assistant", text: "已为你整理好结果。" },
    {
      component: "DataTable",
      label: "成员数据",
      columns: [
        { key: "name", label: "姓名" },
        { key: "count", label: "请求数" },
      ],
      rows: { path: "/rows" },
      pageSize: 2,
    },
  ].map((sample) => ({ ...sample, id: `sample-${sample.component}` }));
  const helpers = [
    { id: "sample-text-a", component: "Text", text: "这是第一段示例内容。" },
    { id: "sample-text-b", component: "Text", text: "这是第二段示例内容。" },
    {
      id: "sample-image",
      component: "Image",
      url: "/samples/landscape.svg",
      description: "示例插画",
      fit: "cover",
    },
    {
      id: "sample-button-a",
      component: "Button",
      child: "sample-label-a",
      action: { event: { name: "previous" } },
    },
    {
      id: "sample-button-b",
      component: "Button",
      child: "sample-label-b",
      action: { event: { name: "next" } },
    },
    { id: "sample-label-a", component: "Text", text: "上一步" },
    { id: "sample-label-b", component: "Text", text: "下一步" },
    {
      id: "sample-input",
      component: "TextField",
      label: "账户",
      placeholder: "请输入账户名称",
      value: { path: "/account" },
    },
    {
      id: "sample-message-a",
      component: "Message",
      role: "user",
      text: "帮我查一下数据",
    },
    {
      id: "sample-message-b",
      component: "Message",
      role: "assistant",
      text: "查询已完成。",
    },
    {
      id: "grouped-accordion",
      component: "Accordion",
      multiple: true,
      items: [
        { id: "one", title: "如何使用？", child: "sample-text-a" },
        { id: "two", title: "支持哪些框架？", child: "sample-text-b" },
        {
          id: "disabled",
          title: "不可用项目",
          child: "sample-text-a",
          disabled: true,
        },
      ],
    },
  ];
  client.apply({
    version: VERSION,
    createSurface: { surfaceId: "shadcn", catalogId: CATALOG_ID },
  });
  client.apply({
    version: VERSION,
    updateDataModel: {
      surfaceId: "shadcn",
      value: {
        account: "alice",
        notes: "",
        otp: "",
        date: "2026-10-10",
        framework: "react",
        command: "",
        bold: false,
        styles: [],
        page: 1,
        menu: "react",
        rows: [
          { name: "Alice", count: 10 },
          { name: "Bob", count: 2 },
          { name: "Carol", count: 30 },
        ],
      },
    },
  });
  client.apply({
    version: VERSION,
    updateComponents: {
      surfaceId: "shadcn",
      components: [
        {
          id: "root",
          component: "Column",
          children: ["grouped-accordion", "sample-Field", "sample-DataTable"],
        },
        ...helpers,
        ...samples,
      ],
    },
  });
  return samples.map((s) => s.id);
}
