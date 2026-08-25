import { beforeEach, describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ permanentRedirect }));
import MessagesPage from "./page";
import LegacyConversationPage from "./[id]/page";

beforeEach(() => { vi.clearAllMocks(); permanentRedirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); }); });

describe("legacy message routes", () => {
  it("permanently redirects list and conversation bookmarks to Mail", () => {
    expect(() => MessagesPage()).toThrow("redirect:/mail");
    expect(() => LegacyConversationPage()).toThrow("redirect:/mail");
    expect(permanentRedirect).toHaveBeenCalledTimes(2);
  });
});
