/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, render } from "@testing-library/react-native";
import { Animated } from "react-native";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../context/ThemeContext", () => ({
  useTheme: () => ({
    getThemeColors: () => ({
      background: { primary: "#000", secondary: "#111", tertiary: "#222" },
      text: { primary: "#fff", secondary: "#aaa", tertiary: "#555" },
      primary: "#fff",
      secondary: "#000",
      error: "#f00",
      success: "#0f0",
      warning: "#ff0",
      info: "#00f",
    }),
    getFontSize: () => 16,
    getLocalizedText: (k: string) => k,
  }),
}));

import Toast from "../Toast";

describe("Toast", () => {
  it("does not crash when visible=false", () => {
    expect(() =>
      render(<Toast visible={false} message="x" onHide={jest.fn()} />),
    ).not.toThrow();
  });

  it.each(["success", "error", "info", "warning"] as const)(
    "renders type=%s",
    (type) => {
      const { toJSON } = render(
        <Toast visible message="hello" type={type} onHide={jest.fn()} />,
      );
      expect(toJSON()).toBeTruthy();
    },
  );

  it("auto-hides after duration and invokes onHide once the close animation finishes", async () => {
    // Drive Animated.parallel's completion callback synchronously so onHide
    // is observable. Without this, the JS Animated timing relies on native
    // scheduling that does not always fire under jest fake timers.
    const parallelSpy = jest.spyOn(Animated, "parallel").mockImplementation(
      () =>
        ({
          start: (cb?: (info: { finished: boolean }) => void) =>
            cb?.({ finished: true }),
        }) as any,
    );
    jest.useFakeTimers();
    const onHide = jest.fn();
    render(<Toast visible message="x" duration={100} onHide={onHide} />);
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    jest.useRealTimers();
    parallelSpy.mockRestore();
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
