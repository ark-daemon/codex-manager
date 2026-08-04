import { describe, expect, it } from "vitest";
import { getAppDefinition, isAllowedCodexExecutableBasename } from "../electron/services/paths.js";

describe("isAllowedCodexExecutableBasename", () => {
  it("accepts historical Codex binaries", () => {
    expect(isAllowedCodexExecutableBasename("Codex")).toBe(true);
    expect(isAllowedCodexExecutableBasename("Codex.exe")).toBe(true);
    expect(isAllowedCodexExecutableBasename("codex.exe")).toBe(true);
  });

  it("accepts rebranded ChatGPT desktop shell", () => {
    expect(isAllowedCodexExecutableBasename("ChatGPT")).toBe(true);
    expect(isAllowedCodexExecutableBasename("ChatGPT.exe")).toBe(true);
    expect(isAllowedCodexExecutableBasename("chatgpt.exe")).toBe(true);
  });

  it("rejects unrelated executables", () => {
    expect(isAllowedCodexExecutableBasename("malicious.exe")).toBe(false);
    expect(isAllowedCodexExecutableBasename("Relay.exe")).toBe(false);
    expect(isAllowedCodexExecutableBasename("chrome.exe")).toBe(false);
  });
});

describe("getAppDefinition process detection", () => {
  it("matches both ChatGPT and Codex process names after the rebrand", () => {
    const definition = getAppDefinition({
      appData: "C:\\Users\\test\\AppData\\Roaming",
      localAppData: "C:\\Users\\test\\AppData\\Local",
      userProfile: "C:\\Users\\test"
    });

    const normalized = definition.processNames.map((name) =>
      name.trim().toLowerCase().replace(/\.exe$/i, "")
    );

    expect(normalized).toContain("chatgpt");
    expect(normalized).toContain("codex");
  });
});
