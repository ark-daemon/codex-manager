import { describe, expect, it } from "vitest";
import { accountNotificationLabel } from "../electron/services/notifications.js";

describe("accountNotificationLabel", () => {
  it("uses the profile name with email context when both differ", () => {
    expect(accountNotificationLabel({ name: "Work Account", email: "work@example.com" })).toBe("Work Account (work@example.com)");
  });

  it("does not duplicate the email when the name is already the email", () => {
    expect(accountNotificationLabel({ name: "same@example.com", email: "same@example.com" })).toBe("same@example.com");
  });

  it("falls back to email when the name is missing", () => {
    expect(accountNotificationLabel({ name: "", email: "fallback@example.com" })).toBe("fallback@example.com");
  });

  it("falls back to a generic label when name and email are missing", () => {
    expect(accountNotificationLabel({ name: "", email: undefined })).toBe("Codex profile");
  });
});
