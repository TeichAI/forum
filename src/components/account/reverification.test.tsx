import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as unknown, level: "first_factor" as "first_factor" | "multi_factor" }));
const mocks = vi.hoisted(() => ({
  operation: vi.fn(), start: vi.fn(), prepareFirst: vi.fn(), attemptFirst: vi.fn(), prepareSecond: vi.fn(), attemptSecond: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useSession: () => ({ session: state.session }),
  useReverification: (fetcher: (...args: unknown[]) => Promise<unknown>, options: { onNeedsReverification: (request: unknown) => void }) => (...args: unknown[]) => new Promise((resolve, reject) => {
    options.onNeedsReverification({
      level: state.level,
      complete: () => { void fetcher(...args).then(resolve, reject); },
      cancel: () => reject(new Error("cancelled")),
    });
  }),
}));

import { ReverificationProvider, useCustomReverification } from "./reverification";

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function close(this: HTMLDialogElement) { this.removeAttribute("open"); } },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  state.level = "first_factor";
  state.session = {
    startVerification: mocks.start,
    prepareFirstFactorVerification: mocks.prepareFirst,
    attemptFirstFactorVerification: mocks.attemptFirst,
    prepareSecondFactorVerification: mocks.prepareSecond,
    attemptSecondFactorVerification: mocks.attemptSecond,
  };
  mocks.operation.mockResolvedValue("done");
  mocks.prepareFirst.mockResolvedValue({});
  mocks.prepareSecond.mockResolvedValue({});
});

function Harness() {
  const [result, setResult] = useState("");
  const secured = useCustomReverification(async () => mocks.operation());
  return <><button type="button" onClick={() => void secured().then(() => setResult("Completed"), () => setResult("Cancelled"))}>Sensitive action</button>{result && <p>{result}</p>}</>;
}

function renderHarness() {
  return render(<ReverificationProvider><Harness /></ReverificationProvider>);
}

describe("custom reverification", () => {
  it("verifies an email code in a custom accessible dialog and retries the action", async () => {
    mocks.start.mockResolvedValue({
      status: "needs_first_factor", supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "o***@example.com" }], supportedSecondFactors: null,
    });
    mocks.attemptFirst.mockResolvedValue({ status: "complete", supportedFirstFactors: [], supportedSecondFactors: [] });
    const user = userEvent.setup();
    const { container } = renderHarness();

    await user.click(screen.getByRole("button", { name: "Sensitive action" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm it’s you" });
    expect(dialog).toHaveAttribute("open");
    expect(mocks.prepareFirst).toHaveBeenCalledWith({ strategy: "email_code", emailAddressId: "email_1" });
    await user.type(screen.getByLabelText("Verification code"), "424242");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(mocks.attemptFirst).toHaveBeenCalledWith({ strategy: "email_code", code: "424242" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(mocks.operation).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("continues from password first factor to a TOTP second factor", async () => {
    state.level = "multi_factor";
    mocks.start.mockResolvedValue({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }], supportedSecondFactors: null });
    mocks.attemptFirst.mockResolvedValue({ status: "needs_second_factor", supportedFirstFactors: [], supportedSecondFactors: [{ strategy: "totp" }] });
    mocks.attemptSecond.mockResolvedValue({ status: "complete", supportedFirstFactors: [], supportedSecondFactors: [] });
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Sensitive action" }));
    await user.type(await screen.findByLabelText("Password"), "secretpass");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(mocks.attemptFirst).toHaveBeenCalledWith({ strategy: "password", password: "secretpass" }));

    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(mocks.attemptSecond).toHaveBeenCalledWith({ strategy: "totp", code: "123456" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("cancels without invoking the protected action and handles missing factors", async () => {
    mocks.start.mockResolvedValue({ status: "needs_first_factor", supportedFirstFactors: [], supportedSecondFactors: [] });
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Sensitive action" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No supported verification method");
    await user.click(screen.getByRole("button", { name: "Cancel identity verification" }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(mocks.operation).not.toHaveBeenCalled();
  });
});
