import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";

test("renders home page heading", () => {
  render(<Home />);
  const heading = screen.getByRole("heading", { name: /RawBlock PullPay/i });
  expect(heading).toBeDefined();
});

test("renders Enter Dashboard button", () => {
  render(<Home />);
  const button = screen.getByRole("button", { name: /Enter Dashboard/i });
  expect(button).toBeDefined();
});
