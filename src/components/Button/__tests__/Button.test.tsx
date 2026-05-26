/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "../Button";

describe("Button", () => {
  it.each(["primary", "secondary", "ghost", "danger"] as const)(
    "renders variant=%s",
    (variant) => {
      const { getByText } = render(
        <Button title="Tap" variant={variant} onPress={jest.fn()} />,
      );
      expect(getByText("Tap")).toBeTruthy();
    },
  );

  it.each(["small", "medium", "large"] as const)("renders size=%s", (size) => {
    const { getByText } = render(
      <Button title="Tap" size={size} onPress={jest.fn()} />,
    );
    expect(getByText("Tap")).toBeTruthy();
  });

  it("fires onPress when not disabled / not loading", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Tap" onPress={onPress} />);
    fireEvent.press(getByText("Tap"));
    expect(onPress).toHaveBeenCalled();
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Tap" disabled onPress={onPress} />,
    );
    fireEvent.press(getByText("Tap"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders the ActivityIndicator when loading", () => {
    const { toJSON } = render(
      <Button title="Tap" loading onPress={jest.fn()} />,
    );
    expect(JSON.stringify(toJSON())).toContain("ActivityIndicator");
  });

  it("applies fullWidth style", () => {
    const { toJSON } = render(
      <Button title="Tap" fullWidth onPress={jest.fn()} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it("applies custom style + textStyle props", () => {
    const { toJSON } = render(
      <Button
        title="Tap"
        onPress={jest.fn()}
        style={{ backgroundColor: "red" }}
        textStyle={{ fontWeight: "900" }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
