import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StaffActionForm } from "./action-form";

describe("StaffActionForm", () => {
  it("submits through action state and announces successful feedback", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "success" as const, message: "Action complete." }));
    render(<StaffActionForm action={action}><input name="reason" defaultValue="Reviewed" /><button>Run action</button></StaffActionForm>);
    await user.click(screen.getByRole("button", { name: "Run action" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Action complete.");
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ status: "idle" }), expect.any(FormData));
  });

  it("announces action errors as alerts", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ status: "error" as const, message: "Action rejected." }));
    render(<StaffActionForm action={action}><button>Run action</button></StaffActionForm>);
    await user.click(screen.getByRole("button", { name: "Run action" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Action rejected.");
  });
});
