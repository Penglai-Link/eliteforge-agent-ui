// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { A2UIClient } from "@eliteforge/agent-ui-a2ui-core";
import { profileMessages } from "@eliteforge/agent-ui-a2ui-core/demo";
import type { ChatAdapter, ChatMessage, ChatSession } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";
beforeEach(() => { ensureTestLocalStorage(); Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); window.localStorage.clear(); });
it("renders a surface emitted immediately in the first run of a new session", async () => {
  const session: ChatSession = { id: 1, sessionId: "new-session", title: "New", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const messages = [
    {version:"v0.9.1",createSurface:{surfaceId:"report",catalogId:"https://eliteforge.dev/a2ui/v0.9.1/agent"}},
    {version:"v0.9.1",updateComponents:{surfaceId:"report",components:[{id:"root",component:"Text",text:"First run report"}]}},
  ];
  const client = new A2UIClient(); messages.forEach(message => client.apply(message as any));
  const surface = {surfaceId:"report",surfaceInstanceId:"instance",revision:1,mode:"Display" as const,ownerAgentId:"agent",runId:"run",messageId:"card",createdAtMs:Date.now(),snapshot:client.exportSnapshot().surfaces.report};
  const adapter: ChatAdapter = {
    capabilities:{supportsStreaming:true,supportsAgui:true}, createSession:vi.fn().mockResolvedValue(session), deleteSession:vi.fn(), loadMessages:vi.fn().mockResolvedValue([]),
    loadA2uiState:vi.fn().mockResolvedValue({sessionId:session.sessionId,revision:0,surfaces:[]}),
    streamMessage:vi.fn((_session, _input, handlers) => { handlers?.onAguiEvent?.({type:"CUSTOM",name:"agent.a2ui",threadId:session.sessionId,runId:"run",value:{revision:1,surface,messages}}); return new Promise(() => {}); }),
  };
  render(<ChatRuntimeWindow adapter={adapter} config={{floating:false}} allowDraftSession onError={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Show report"}});
  fireEvent.keyDown(screen.getByRole("textbox"), {key:"Enter"});
  expect(await screen.findByText("First run report")).toBeTruthy();
});
it.each([false, true])("forwards real A2UI actions through runtime (floating=%s)", async floating => {
  const session: ChatSession = { id: 1, sessionId: "s", title: "Test", status: "ACTIVE", createdAt: "2026-10-09", updatedAt: "2026-10-09" };
  const message: ChatMessage = { id: 1, messageId: "m", sessionId: "s", role: "ASSISTANT", channel: "MAIN_AGENT", actor: "Agent", content: "", createdAt: "2026-10-09", a2ui: { messages: profileMessages } };
  const adapter: ChatAdapter = { capabilities: { supportsStreaming: false }, createSession: vi.fn(), deleteSession: vi.fn(), loadMessages: vi.fn().mockResolvedValue([{ ...message, id: 0, messageId: "u", role: "USER", content: "Show profile", a2ui: undefined }, message]) };
  const onAction = vi.fn();
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{ floating }} onA2UIAction={onAction} windowState={{ x: 0, y: 0, width: 700, height: 700, collapsed: false, minimized: false }} />);
  fireEvent.click(await screen.findByRole("button", { name: "保存资料" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onAction.mock.calls[0][0]).toMatchObject({ action: { name: "saveProfile", surfaceId: "profile" } });
});

it.each([false,true])("submits reusable cards through adapter twice and recovers canonical state (floating=%s)",async floating=>{
 const session:ChatSession={id:1,sessionId:"s",title:"Search",status:"ACTIVE",createdAt:"2026-10-09",updatedAt:"2026-10-09"};
 const client=new A2UIClient(); for(const message of profileMessages) client.apply(message);
 let revision=1;
 const snapshot=()=>({sessionId:"s",revision,surfaces:[{surfaceId:"profile",surfaceInstanceId:"instance",revision,mode:"Reusable" as const,ownerAgentId:"agent",runId:"run",messageId:"card",createdAtMs:1,snapshot:client.exportSnapshot().surfaces.profile}]});
 const submit=vi.fn(async (_s,input,handlers)=>{revision++;client.apply({version:"v0.9.1",updateDataModel:{surfaceId:"profile",path:"/name",value:"Saved " + revision}});handlers?.onAguiEvent?.({type:"CUSTOM",name:"agent.a2ui",threadId:"s",runId:"next",value:{revision,surface:snapshot().surfaces[0],messages:[{version:"v0.9.1",updateDataModel:{surfaceId:"profile",path:"/name",value:"Saved " + revision}}]}});return {session,run:{runId:"next",status:"COMPLETED" as const,finalOutput:"",stepCount:1},messages:[]};});
 const notify=vi.fn();const adapter:ChatAdapter={capabilities:{supportsStreaming:true},createSession:vi.fn(),deleteSession:vi.fn(),loadMessages:vi.fn().mockResolvedValue([]),loadA2uiState:vi.fn(async()=>snapshot()),sendA2uiActionStream:submit};
 render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating}} onA2UIAction={notify} windowState={{x:0,y:0,width:700,height:700,collapsed:false,minimized:false}}/>);
 fireEvent.click(await screen.findByRole("button",{name:"保存资料"}));await waitFor(()=>expect(notify).toHaveBeenCalledTimes(1));await waitFor(()=>expect((screen.getByRole("button",{name:"保存资料"}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:"保存资料"}));await waitFor(()=>expect(notify).toHaveBeenCalledTimes(2));expect(submit.mock.calls[0][1].expectedRevision).toBe(1);expect(submit.mock.calls[1][1].expectedRevision).toBe(2);expect(submit.mock.calls[0][1].actionId).not.toBe(submit.mock.calls[1][1].actionId);
});

it("keeps draft input and action identity when a failed submission is retried", async () => {
  const session: ChatSession = { id: 1, sessionId: "s", title: "Retry", status: "ACTIVE", createdAt: "2026-10-09", updatedAt: "2026-10-09" };
  const client = new A2UIClient();
  for (const message of profileMessages) client.apply(message);
  const state = { sessionId: "s", revision: 1, surfaces: [{ surfaceId: "profile", surfaceInstanceId: "instance", revision: 1, mode: "Reusable" as const, ownerAgentId: "agent", runId: "run", messageId: "card", createdAtMs: 1, snapshot: client.exportSnapshot().surfaces.profile }] };
  const submit = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ session, run: { runId: "retry", status: "COMPLETED", finalOutput: "", stepCount: 1 }, messages: [] });
  const notify = vi.fn();
  const adapter: ChatAdapter = { capabilities: { supportsStreaming: true }, createSession: vi.fn(), deleteSession: vi.fn(), loadMessages: vi.fn().mockResolvedValue([]), loadA2uiState: vi.fn().mockResolvedValue(state), sendA2uiActionStream: submit };
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{ floating: false }} onA2UIAction={notify} />);
  fireEvent.input(await screen.findByRole("textbox", { name: "姓名" }), { target: { value: "Unsaved draft" } });
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "保存资料" }).hasAttribute("disabled")).toBe(false));
  expect((screen.getByRole("textbox", { name: "姓名" }) as HTMLInputElement).value).toBe("Unsaved draft");
  expect(notify).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[1][1]).toEqual(submit.mock.calls[0][1]);
});
