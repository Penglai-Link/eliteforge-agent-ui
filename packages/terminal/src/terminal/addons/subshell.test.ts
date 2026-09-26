// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { SubshellBootstrapAddon } from "./subshell";

describe("SubshellBootstrapAddon", () => {
  it("never writes a bootstrap command into a detected nested shell", () => {
    const write = vi.fn();
    const addon = new SubshellBootstrapAddon({
      write,
      getBootstrap: () => "eval bootstrap",
      isNestedShellActive: () => true,
    });
    addon.activate({} as never);

    addon.handleDetection({ command: "ssh host", host: "host" });

    expect(write).not.toHaveBeenCalled();
  });

  it("does not change rendering for a Docker shell", () => {
    const write = vi.fn();
    const terminal = {
      write: vi.fn((_data: string, callback: () => void) => callback()),
    };
    const addon = new SubshellBootstrapAddon({
      write,
      getBootstrap: () => "eval bootstrap",
      isNestedShellActive: () => true,
    });
    addon.activate(terminal as never);

    addon.handleDetection({ command: "docker exec -it api bash", host: "api" });

    expect(terminal.write).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps unrecognized shells in ordinary terminal mode", () => {
    const write = vi.fn();
    const addon = new SubshellBootstrapAddon({
      write,
      getBootstrap: () => "eval bootstrap",
      isNestedShellActive: () => false,
    });
    addon.activate({ clear: vi.fn() } as never);

    addon.handleDetection({ command: "su -", host: "host" });

    expect(write).not.toHaveBeenCalled();
  });
});
