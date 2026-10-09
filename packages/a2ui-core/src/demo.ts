import { A2UIClient, VERSION, CATALOG_ID, type ActionHandler } from "./index";
export const profileMessages = [
  {
    version: VERSION,
    createSurface: {
      surfaceId: "profile",
      catalogId: CATALOG_ID,
      sendDataModel: true,
    },
  },
  {
    version: VERSION,
    updateComponents: {
      surfaceId: "profile",
      components: [
        { id: "root", component: "Card", child: "form" },
        {
          id: "form",
          component: "Column",
          children: ["title", "name", "newsletter", "role", "submit", "status"],
        },
        { id: "title", component: "Text", text: "修改资料", variant: "h2" },
      ],
    },
  },
  {
    version: VERSION,
    updateDataModel: {
      surfaceId: "profile",
      value: {
        name: "Alice",
        newsletter: false,
        role: ["developer"],
        status: "请修改资料后提交",
      },
    },
  },
  {
    version: VERSION,
    updateComponents: {
      surfaceId: "profile",
      components: [
        {
          id: "name",
          component: "TextField",
          label: "姓名",
          value: { path: "/name" },
        },
        {
          id: "newsletter",
          component: "CheckBox",
          label: "接收更新",
          value: { path: "/newsletter" },
        },
        {
          id: "role",
          component: "ChoicePicker",
          label: "角色",
          value: { path: "/role" },
          options: [
            { label: "开发者", value: "developer" },
            { label: "设计师", value: "designer" },
          ],
        },
        {
          id: "submit",
          component: "Button",
          child: "submit-label",
          variant: "primary",
          action: {
            event: {
              name: "saveProfile",
              context: {
                name: { path: "/name" },
                newsletter: { path: "/newsletter" },
                role: { path: "/role" },
              },
            },
          },
        },
        { id: "submit-label", component: "Text", text: "保存资料" },
        { id: "status", component: "Text", text: { path: "/status" } },
      ],
    },
  },
];
export function createProfileDemo() {
  const client = new A2UIClient();
  let index = 0;
  const next = () => {
    if (index < profileMessages.length) client.apply(profileMessages[index++]);
  };
  const onAction: ActionHandler = (message) =>
    client.apply({
      version: VERSION,
      updateDataModel: {
        surfaceId: "profile",
        path: "/status",
        value: `已保存：${message.action.context.name}`,
      },
    });
  return {
    client,
    next,
    onAction,
    get done() {
      return index === profileMessages.length;
    },
  };
}

export const atomicMessages = [
  {
    version: VERSION,
    createSurface: {
      surfaceId: "atoms",
      catalogId: CATALOG_ID,
      sendDataModel: true,
    },
  },
  {
    version: VERSION,
    updateDataModel: {
      surfaceId: "atoms",
      value: {
        volume: 35,
        birthday: "2026-10-09",
        appointment: "2026-10-09T09:00:00Z",
        time: "09:30:00",
        status: "调整滑块和日期后提交",
      },
    },
  },
  {
    version: VERSION,
    updateComponents: {
      surfaceId: "atoms",
      components: [
        { id: "root", component: "Card", child: "content" },
        {
          id: "content",
          component: "Column",
          children: [
            "heading",
            "image",
            "divider",
            "volume",
            "birthday",
            "appointment",
            "time",
            "save",
            "status",
            "video",
            "audio",
          ],
        },
        { id: "heading", component: "Row", children: ["icon", "title"] },
        { id: "icon", component: "Icon", name: "info" },
        { id: "title", component: "Text", text: "原子组件展示", variant: "h2" },
        {
          id: "image",
          component: "Image",
          url: "/samples/landscape.svg",
          description: "本地示例插画",
          fit: "contain",
          variant: "mediumFeature",
        },
        { id: "divider", component: "Divider" },
        {
          id: "volume",
          component: "Slider",
          label: "音量",
          min: 0,
          max: 100,
          value: { path: "/volume" },
        },
        {
          id: "birthday",
          component: "DateTimeInput",
          label: "日期",
          enableDate: true,
          value: { path: "/birthday" },
          min: "2026-01-01",
          max: "2026-12-31",
        },
        {
          id: "appointment",
          component: "DateTimeInput",
          label: "预约时间",
          enableDate: true,
          enableTime: true,
          value: { path: "/appointment" },
        },
        {
          id: "time",
          component: "DateTimeInput",
          label: "提醒时间",
          enableTime: true,
          value: { path: "/time" },
        },
        {
          id: "save",
          component: "Button",
          child: "save-label",
          action: {
            event: {
              name: "savePreferences",
              context: {
                volume: { path: "/volume" },
                birthday: { path: "/birthday" },
                appointment: { path: "/appointment" },
                time: { path: "/time" },
              },
            },
          },
        },
        { id: "save-label", component: "Text", text: "保存偏好" },
        { id: "status", component: "Text", text: { path: "/status" } },
        { id: "video", component: "Video", url: "/samples/demo.mp4" },
        {
          id: "audio",
          component: "AudioPlayer",
          url: "/samples/demo.wav",
          description: "本地提示音",
        },
      ],
    },
  },
];
export function initializeAtomicDemo(client: A2UIClient): ActionHandler {
  atomicMessages.forEach((message) => client.apply(message));
  return (message) =>
    client.apply({
      version: VERSION,
      updateDataModel: {
        surfaceId: "atoms",
        path: "/status",
        value: `已保存偏好：音量 ${message.action.context.volume}`,
      },
    });
}

export const commonMessages = [
  {
    version: VERSION,
    createSurface: {
      surfaceId: "common",
      catalogId: CATALOG_ID,
      sendDataModel: true,
    },
  },
  {
    version: VERSION,
    updateDataModel: {
      surfaceId: "common",
      value: {
        quantity: 2,
        team: "engineering",
        enabled: true,
        progress: 65,
        rows: [
          { name: "Alice", role: "开发者" },
          { name: "Bob", role: "设计师" },
        ],
        status: "修改设置后保存",
      },
    },
  },
  {
    version: VERSION,
    updateComponents: {
      surfaceId: "common",
      components: [
        { id: "root", component: "Card", child: "layout" },
        {
          id: "layout",
          component: "Column",
          children: ["title", "tabs", "accordion", "modal", "list"],
        },
        { id: "title", component: "Text", text: "常用组件", variant: "h2" },
        {
          id: "tabs",
          component: "Tabs",
          tabs: [
            { title: "表单与数据", child: "form" },
            { title: "反馈与展示", child: "feedback" },
          ],
        },
        {
          id: "form",
          component: "Column",
          children: ["grid", "save", "status", "table"],
        },
        {
          id: "grid",
          component: "Grid",
          columns: 2,
          children: ["quantity", "team", "enabled"],
        },
        {
          id: "quantity",
          component: "NumberField",
          label: "数量",
          value: { path: "/quantity" },
          min: 1,
          max: 20,
          step: 1,
        },
        {
          id: "team",
          component: "Select",
          label: "团队",
          value: { path: "/team" },
          options: [
            { label: "研发", value: "engineering" },
            { label: "设计", value: "design" },
          ],
        },
        {
          id: "enabled",
          component: "Switch",
          label: "启用通知",
          value: { path: "/enabled" },
        },
        {
          id: "save",
          component: "Button",
          child: "save-label",
          action: {
            event: {
              name: "saveSettings",
              context: {
                quantity: { path: "/quantity" },
                team: { path: "/team" },
                enabled: { path: "/enabled" },
              },
            },
          },
        },
        { id: "save-label", component: "Text", text: "保存设置" },
        { id: "status", component: "Text", text: { path: "/status" } },
        {
          id: "table",
          component: "Table",
          caption: "成员",
          columns: [
            { key: "name", label: "姓名" },
            { key: "role", label: "角色" },
          ],
          rows: { path: "/rows" },
        },
        {
          id: "feedback",
          component: "Column",
          children: [
            "avatar",
            "badge",
            "alert",
            "progress",
            "spinner",
            "skeleton",
            "empty",
            "link",
            "spacer",
          ],
        },
        {
          id: "avatar",
          component: "Avatar",
          name: "Alice",
          url: "/samples/landscape.svg",
        },
        { id: "badge", component: "Badge", text: "已发布", variant: "success" },
        {
          id: "alert",
          component: "Alert",
          title: "保存成功",
          text: "所有组件均可独立使用",
          variant: "success",
        },
        {
          id: "progress",
          component: "Progress",
          label: "完成进度",
          value: { path: "/progress" },
        },
        { id: "spinner", component: "Spinner", label: "正在处理" },
        { id: "skeleton", component: "Skeleton", lines: 3 },
        {
          id: "empty",
          component: "EmptyState",
          title: "暂无记录",
          description: "添加数据后将在这里显示",
        },
        {
          id: "link",
          component: "Link",
          text: "A2UI 协议文档",
          url: "https://a2ui.org/specification/v0.9.1-a2ui/",
          newTab: true,
        },
        { id: "spacer", component: "Spacer", size: "small" },
        {
          id: "accordion",
          component: "Accordion",
          title: "查看说明",
          child: "instructions",
        },
        {
          id: "instructions",
          component: "Text",
          text: "选项卡、折叠和弹窗状态可以通过快照恢复。",
        },
        {
          id: "modal",
          component: "Modal",
          trigger: "open",
          content: "modal-content",
          accessibility: { label: "设置说明" },
        },
        {
          id: "open",
          component: "Button",
          child: "open-label",
          action: { event: { name: "unusedModalTrigger" } },
        },
        { id: "open-label", component: "Text", text: "打开弹窗" },
        {
          id: "modal-content",
          component: "Text",
          text: "这是一个独立 A2UI 对话框。",
        },
        {
          id: "list",
          component: "List",
          children: { componentId: "member", path: "/rows" },
        },
        { id: "member", component: "Text", text: { path: "name" } },
      ],
    },
  },
];
export function initializeCommonDemo(client: A2UIClient): ActionHandler {
  commonMessages.forEach((message) => client.apply(message));
  return (message) =>
    client.apply({
      version: VERSION,
      updateDataModel: {
        surfaceId: "common",
        path: "/status",
        value: `已保存设置：${message.action.context.team} / ${message.action.context.quantity}`,
      },
    });
}
