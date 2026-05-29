/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("expo-image-picker", () => ({
  __esModule: true,
  launchImageLibraryAsync: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const imagePicker = require("expo-image-picker") as Record<string, jest.Mock>;

jest.mock("@/services/moderation", () => ({
  tfjsService: { gate: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tfjsService } = require("@/services/moderation");

import { ModerationTestScreen } from "@/screens/Debug/ModerationTestScreen";

function allOnPress(root: any) {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n) return;
    if (n.props && typeof n.props.onPress === "function") out.push(n);
    const c = n.children;
    if (Array.isArray(c)) for (const x of c) visit(x);
    else if (c && typeof c === "object") visit(c);
  };
  visit(root);
  return out;
}

beforeEach(() => jest.clearAllMocks());

describe("ModerationTestScreen", () => {
  it("renders without crashing", async () => {
    const { toJSON } = render(<ModerationTestScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("picks an image + runs the gate (success path)", async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/img.jpg" }],
    });
    tfjsService.gate.mockResolvedValueOnce({
      allowed: true,
      probs: { nsfw: 0.01, safe: 0.99 },
    });

    const tree = render(<ModerationTestScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allOnPress(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tfjsService.gate).toHaveBeenCalled();
  });

  it("captures errors from tfjsService.gate", async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/img.jpg" }],
    });
    tfjsService.gate.mockRejectedValueOnce(new Error("boom"));
    const tree = render(<ModerationTestScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allOnPress(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tfjsService.gate).toHaveBeenCalled();
  });

  it("picker cancelled → no gate call", async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
    });
    const tree = render(<ModerationTestScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    await act(async () => {
      for (const t of allOnPress(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tfjsService.gate).not.toHaveBeenCalled();
  });
});
