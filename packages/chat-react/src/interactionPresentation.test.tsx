// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { profileMessages } from "@eliteforge/agent-ui-a2ui-core/demo";
import type { ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
import { ChatUserInputCard } from "./ChatUserInputCard";
afterEach(cleanup);
it("upgrades a live interaction to its durable form without resetting unchanged drafts", () => {
 const request: ChatUserInputRequest = {requestId:"interaction",sessionId:"s",runId:"run",status:"Pending",requestedAt:0,intro:"Input",questions:[{questionId:"interaction",question:"Input",options:[],allowCustomAnswer:true,allowSkip:false}]};
 const submit=vi.fn(); const view=render(<ChatUserInputCard request={request} onSubmit={submit}/>);
 const form={...request,a2uiInteraction:{surfaceId:"profile",messages:profileMessages}};
 view.rerender(<ChatUserInputCard request={form} onSubmit={submit}/>);
 fireEvent.input(screen.getByRole("textbox",{name:"姓名"}),{target:{value:"Draft"}});
 view.rerender(<ChatUserInputCard request={structuredClone(form)} onSubmit={submit}/>);
 expect((screen.getByRole("textbox",{name:"姓名"}) as HTMLInputElement).value).toBe("Draft");
 expect(screen.getByRole("button",{name:"保存资料"})).toBeTruthy();
});
