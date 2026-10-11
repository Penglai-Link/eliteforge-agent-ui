// @vitest-environment jsdom
import { createApp, h } from "vue";
import { beforeEach, afterEach, expect, it } from "vitest";
import { ensureTestLocalStorage } from "../../chat-react/src/testLocalStorage";
import ChatWindow from "./components/ChatWindow.vue";
beforeEach(ensureTestLocalStorage);
afterEach(() => window.localStorage.clear());
it.each([undefined, true, false])("shows New chat unless explicitly disabled (%s)", showNewSession => {
  const container=document.createElement("div");document.body.append(container);
  const app=createApp({render:()=>h(ChatWindow,{draft:"",messages:[],showNewSession})});
  try {app.mount(container);expect(Boolean(container.querySelector('button[aria-label="New chat"]'))).toBe(showNewSession !== false);}
  finally {app.unmount();container.remove();}
});
