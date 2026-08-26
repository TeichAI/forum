import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), search: vi.fn(), send: vi.fn(), push: vi.fn(), uploadEndpoint: vi.fn() }));
vi.mock("@/actions/mail", () => ({ saveMailDraft: mocks.save, deleteMailDraft: mocks.remove, searchMailRecipients: mocks.search, sendMail: mocks.send }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/uploadthing", () => ({ UploadButton: ({ endpoint, onClientUploadComplete }: { endpoint: string; onClientUploadComplete: (files: Array<{ name: string; serverData: { url: string } }>) => void }) => {
  mocks.uploadEndpoint(endpoint);
  return <button type="button" onClick={() => onClientUploadComplete([{ name: "pond.png", serverData: { url: "/api/attachments/private" } }])}>Mock upload</button>;
} }));

import { MailComposer } from "./mail-composer";

const recipient = { id: "cm000000000000000000000001", displayName: "Other", username: "other", imageUrl: null, role: "MEMBER" };
const moderator = { id: "cm000000000000000000000003", displayName: "Mod Person", username: "moderator", imageUrl: "https://example.com/mod.png", role: "MODERATOR" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ status: "saved", draftId: "cm000000000000000000000002", savedAt: "now" });
  mocks.remove.mockResolvedValue({ status: "success" });
  mocks.search.mockResolvedValue([recipient]);
  mocks.send.mockResolvedValue({ status: "idle" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MailComposer", () => {
  it("validates compose fields, applies formatting, uploads inline images, and autosaves after one second", async () => {
    vi.useFakeTimers();
    render(<MailComposer role="MEMBER" initialRecipients={[recipient]} uploadsEnabled />);
    const send = screen.getByRole("button", { name: "Send mail" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Subject"), { target: { value: "Hello" } });
    const body = screen.getByLabelText("Mail body");
    fireEvent.change(body, { target: { value: "words" } });
    expect(send).toBeEnabled();
    (body as HTMLTextAreaElement).setSelectionRange(0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(body).toHaveValue("**words**");
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    expect(mocks.uploadEndpoint).toHaveBeenCalledWith("mailImageUploader");
    expect((body as HTMLTextAreaElement).value).toContain("![pond.png](/api/attachments/private)");
    expect((body as HTMLTextAreaElement).value).not.toContain("ufs.sh");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(mocks.save).toHaveBeenCalledWith(expect.any(FormData));
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved");
  });

  it("debounces recipient search and presents loading, result count, and member details", async () => {
    vi.useFakeTimers();
    mocks.search.mockResolvedValue([recipient, moderator]);
    render(<MailComposer role="MODERATOR" uploadsEnabled={false} />);
    expect(screen.getByText(/Staff BCC/)).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "To" });
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("aria-autocomplete", "list");

    fireEvent.change(input, { target: { value: "ot" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Searching members…")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(mocks.search).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(mocks.search).toHaveBeenCalledWith("ot");
    expect(screen.getByText("2 members found")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    const staffOption = screen.getByRole("option", { name: /Mod Person.*@moderator.*moderator/ });
    expect(staffOption).toBeInTheDocument();
    expect(staffOption.querySelector("img")).toHaveAttribute("src");
  });

  it("reports empty and failed searches without leaving stale results visible", async () => {
    vi.useFakeTimers();
    const oldSearch = deferred<Array<typeof recipient>>();
    const newSearch = deferred<Array<typeof recipient>>();
    mocks.search.mockImplementation((query: string) => query === "old" ? oldSearch.promise : newSearch.promise);
    render(<MailComposer role="MODERATOR" uploadsEnabled={false} />);
    const input = screen.getByRole("combobox", { name: "To" });

    fireEvent.change(input, { target: { value: "old" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.change(input, { target: { value: "new" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await act(async () => { newSearch.resolve([]); await Promise.resolve(); });
    expect(screen.getByText("No members found.")).toBeInTheDocument();

    await act(async () => { oldSearch.resolve([recipient]); await Promise.resolve(); });
    expect(screen.queryByRole("option", { name: /Other/ })).not.toBeInTheDocument();
    expect(screen.getByText("No members found.")).toBeInTheDocument();

    const failedSearch = deferred<Array<typeof recipient>>();
    mocks.search.mockReturnValueOnce(failedSearch.promise);
    fireEvent.change(input, { target: { value: "fail" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await act(async () => { failedSearch.reject(new Error("offline")); await Promise.resolve(); });
    expect(screen.getByText("We couldn’t load members. Try your search again.")).toBeInTheDocument();
  });

  it("supports keyboard navigation, selection, and Escape while retaining input focus", async () => {
    vi.useFakeTimers();
    mocks.search.mockResolvedValue([recipient, moderator]);
    render(<MailComposer role="MODERATOR" uploadsEnabled={false} />);
    const input = screen.getByRole("combobox", { name: "To" });
    fireEvent.change(input, { target: { value: "person" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", `mail-recipient-option-${recipient.id}`);
    expect(screen.getByRole("option", { name: /Other/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Mod Person/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("@other")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.change(input, { target: { value: "mod" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "Matching members" })).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("excludes selected members and supports mouse selection and chip removal", async () => {
    vi.useFakeTimers();
    mocks.search.mockResolvedValue([recipient, moderator]);
    render(<MailComposer role="MODERATOR" initialRecipients={[recipient]} uploadsEnabled={false} />);
    const input = screen.getByRole("combobox", { name: "To" });
    fireEvent.change(input, { target: { value: "person" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    expect(screen.queryByRole("option", { name: /Other/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Mod Person/ }));
    expect(screen.getByText("@moderator")).toBeInTheDocument();
    expect(input).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Remove Other" }));
    expect(screen.queryByText("@other")).not.toBeInTheDocument();
    expect(screen.getByText("@moderator")).toBeInTheDocument();
  });

  it("saves and closes or discards an existing draft", async () => {
    const draft = { id: "cm000000000000000000000002", threadId: null, subject: "Saved subject", body: "Saved body", recipients: [recipient] };
    const view = render(<MailComposer role="MEMBER" draft={draft} uploadsEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save & close" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.push).toHaveBeenCalledWith("/mail?folder=drafts");
    view.unmount();
    render(<MailComposer role="MEMBER" draft={draft} uploadsEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/mail");
  });

  it("waits for initial autosave creation before discarding the resulting draft", async () => {
    vi.useFakeTimers();
    const pending = deferred<{ status: "saved"; draftId: string; savedAt: string }>();
    mocks.save.mockReturnValueOnce(pending.promise);
    render(<MailComposer role="MEMBER" initialRecipients={[recipient]} uploadsEnabled={false} />);
    fireEvent.change(screen.getByPlaceholderText("Subject"), { target: { value: "Race-safe" } });
    fireEvent.change(screen.getByLabelText("Mail body"), { target: { value: "Draft body" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ status: "saved", draftId: "cm000000000000000000000099", savedAt: "now" });
      await Promise.resolve();
    });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect((mocks.remove.mock.calls[0]![0] as FormData).get("draftId")).toBe("cm000000000000000000000099");
    expect(mocks.push).toHaveBeenCalledWith("/mail");
  });

  it("adds the asynchronously-created draft id before sending", async () => {
    vi.useFakeTimers();
    const pending = deferred<{ status: "saved"; draftId: string; savedAt: string }>();
    mocks.save.mockReturnValueOnce(pending.promise);
    render(<MailComposer role="MEMBER" initialRecipients={[recipient]} uploadsEnabled={false} />);
    fireEvent.change(screen.getByPlaceholderText("Subject"), { target: { value: "Send safely" } });
    fireEvent.change(screen.getByLabelText("Mail body"), { target: { value: "Mail body" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    fireEvent.click(screen.getByRole("button", { name: "Send mail" }));
    expect(mocks.send).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ status: "saved", draftId: "cm000000000000000000000098", savedAt: "now" });
      await Promise.resolve();
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((mocks.send.mock.calls[0]![0] as FormData).get("draftId")).toBe("cm000000000000000000000098");
  });

  it("queues edits made while an autosave is still running", async () => {
    vi.useFakeTimers();
    const first = deferred<{ status: "saved"; draftId: string; savedAt: string }>();
    mocks.save.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ status: "saved", draftId: "cm000000000000000000000097", savedAt: "later" });
    render(<MailComposer role="MEMBER" initialRecipients={[recipient]} uploadsEnabled={false} />);
    const subject = screen.getByPlaceholderText("Subject");
    const body = screen.getByLabelText("Mail body");
    fireEvent.change(subject, { target: { value: "First version" } });
    fireEvent.change(body, { target: { value: "First body" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    fireEvent.change(subject, { target: { value: "Latest version" } });
    fireEvent.change(body, { target: { value: "Latest body" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(mocks.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ status: "saved", draftId: "cm000000000000000000000097", savedAt: "now" });
      await Promise.resolve();
    });

    expect(mocks.save).toHaveBeenCalledTimes(2);
    const queued = mocks.save.mock.calls[1]![0] as FormData;
    expect(queued.get("draftId")).toBe("cm000000000000000000000097");
    expect(queued.get("subject")).toBe("Latest version");
    expect(queued.get("body")).toBe("Latest body");
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved");
  });
});
