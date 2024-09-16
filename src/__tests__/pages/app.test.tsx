import App from "@/app";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("app page", () => {
	const setup = () => {
		render(<App />);
	};

	it("should render app page", () => {
		setup();
		expect(
			screen.getByText("Build modern apps with Electron and React!"),
		).toBeDefined();
	});

	it("should change phrase when button is clicked", () => {
		setup();
		const button = screen.getByTestId("random-button");
		fireEvent.click(button);
		expect(
			screen.getByText("Create high-quality desktop apps fast."),
		).toBeDefined();
	});
});
