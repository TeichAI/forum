import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updatePolicy: vi.fn() }));

vi.mock("@/actions/spaces", () => ({
  updateSpacePostingPolicy: mocks.updatePolicy,
}));

import { SpacePostingPolicyForm } from "./space-posting-policy-form";

const category = {
  id: "cm12345678901234567890123",
  name: "News",
  description: "Official community updates.",
  color: "#0f766e",
  postingPolicy: "ANNOUNCEMENTS" as const,
};

beforeEach(() => {
  mocks.updatePolicy.mockReset().mockResolvedValue({ status: "success", message: "Posting permissions saved." });
});

describe("SpacePostingPolicyForm", () => {
  it("shows the current policy and updates the explanatory copy", async () => {
    const user = userEvent.setup();
    const { container } = render(<SpacePostingPolicyForm category={category} />);

    expect(screen.getByRole("heading", { name: "News" })).toBeInTheDocument();
    expect(screen.getByLabelText("Posting permissions")).toHaveValue("ANNOUNCEMENTS");
    expect(screen.getByText("Only admins can start discussions; everyone can comment.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Posting permissions"), "ADMIN_ONLY");
    expect(screen.getByText("Only admins can start discussions or comment.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits the space ID and selected policy with explicit save feedback", async () => {
    const user = userEvent.setup();
    render(<SpacePostingPolicyForm category={category} />);

    await user.selectOptions(screen.getByLabelText("Posting permissions"), "ADMIN_ONLY");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updatePolicy).toHaveBeenCalledOnce());
    const submitted = mocks.updatePolicy.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("categoryId")).toBe(category.id);
    expect(submitted.get("postingPolicy")).toBe("ADMIN_ONLY");
    expect(await screen.findByRole("status")).toHaveTextContent("Posting permissions saved.");
  });
});
