import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { expect, it, vi } from "vitest";
import RouteError from "./error";
import GlobalError from "./global-error";

it.each([["route", RouteError], ["global", GlobalError]] as const)("renders an accessible %s recovery action", async (_kind, Component) => {
  const reset = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const view = render(<Component error={Object.assign(new Error("secret detail"), { digest: "safe-digest" })} reset={reset} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalled();
  expect(consoleError).toHaveBeenCalledWith(expect.any(String), { digest: "safe-digest" });
  expect(await axe(view.container)).toHaveNoViolations();
  consoleError.mockRestore();
});
