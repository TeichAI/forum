import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setRead = vi.hoisted(() => vi.fn());
vi.mock("@/actions/mail", () => ({ setMailReadState: setRead }));
import { MailReadReceipt } from "./read-receipt";

beforeEach(() => { vi.clearAllMocks(); setRead.mockResolvedValue({ status: "success" }); });

describe("MailReadReceipt", () => {
  it("marks an unread thread once and ignores already-read threads", async () => {
    const view = render(<MailReadReceipt threadId="thread" unread />);
    await act(async () => { await Promise.resolve(); });
    expect(setRead).toHaveBeenCalledOnce();
    const data = setRead.mock.calls[0]![0] as FormData;
    expect(data.get("threadId")).toBe("thread");
    view.rerender(<MailReadReceipt threadId="thread" unread />);
    expect(setRead).toHaveBeenCalledOnce();
    view.unmount();
    render(<MailReadReceipt threadId="read" unread={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(setRead).toHaveBeenCalledOnce();
  });
});
