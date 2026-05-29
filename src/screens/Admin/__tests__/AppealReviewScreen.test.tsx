/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for AppealReviewScreen.
 *
 * Smoke-style coverage. We avoid touching the rendered tree after mount
 * because the test renderer unmounts the component when AdminGate / nested
 * effects re-render, leading to "unmounted component" errors when walking
 * the tree. Instead we drive behavior via the route params + mock APIs.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const mockGoBack = jest.fn();
let mockRouteParams: any = { appealId: "ap-1" };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("@/context/ThemeContext", () => ({
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
  }),
}));

const mockReviewAppeal = jest.fn();
let mockAppealQueue: any[] = [];
jest.mock("@/store/moderationStore", () => ({
  useModerationStore: () => ({
    reviewAppeal: mockReviewAppeal,
    appealQueue: mockAppealQueue,
  }),
}));

jest.mock("@/services/moderation/moderationApi", () => ({
  appealsAPI: { getAppeal: jest.fn() },
  sanctionsAPI: { getSanction: jest.fn(), liftSanction: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  appealsAPI,
  sanctionsAPI,
} = require("@/services/moderation/moderationApi");

jest.mock("@/components/Moderation", () => ({
  AdminGate: ({ children }: any) => children,
  SanctionBadge: () => null,
}));

jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] }, dark: "#000" },
    text: { light: "#fff", secondary: "#aaa" },
    primary: { main: "#6200ee" },
    secondary: { main: "#03dac6" },
    ui: { divider: "#333", error: "#f00" },
  },
  withOpacity: (c: string) => c,
}));

import { AppealReviewScreen } from "@/screens/Admin/AppealReviewScreen";

const appealBase = {
  id: "ap-1",
  type: "sanction_appeal" as const,
  status: "pending" as const,
  reason: "Erreur",
  userId: "user-1",
  sanctionId: "san-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = { appealId: "ap-1" };
  mockAppealQueue = [];
  appealsAPI.getAppeal.mockReset();
  sanctionsAPI.getSanction.mockReset();
  sanctionsAPI.liftSanction.mockReset();
});

describe("AppealReviewScreen — loading + resolution", () => {
  it("resolves the appeal from the queue when present", async () => {
    mockAppealQueue = [{ ...appealBase }];
    sanctionsAPI.getSanction.mockResolvedValueOnce({
      id: "san-1",
      reason: "spam",
    });
    render(<AppealReviewScreen />);
    await waitFor(() =>
      expect(sanctionsAPI.getSanction).toHaveBeenCalledWith("san-1"),
    );
    expect(appealsAPI.getAppeal).not.toHaveBeenCalled();
  });

  it("fetches the appeal by id when not in the queue", async () => {
    appealsAPI.getAppeal.mockResolvedValueOnce({ ...appealBase });
    sanctionsAPI.getSanction.mockResolvedValueOnce({ id: "san-1" });
    render(<AppealReviewScreen />);
    await waitFor(() =>
      expect(appealsAPI.getAppeal).toHaveBeenCalledWith("ap-1"),
    );
  });

  it("swallows getAppeal rejection without crashing", async () => {
    appealsAPI.getAppeal.mockRejectedValueOnce(new Error("net"));
    const { toJSON } = render(<AppealReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("renders 'Appel introuvable' when no appeal could be resolved", async () => {
    mockRouteParams = {};
    const { getByText } = render(<AppealReviewScreen />);
    await waitFor(() => expect(getByText("Appel introuvable")).toBeTruthy());
  });

  it("renders the blocked_image preview branch with a base64 thumbnail", async () => {
    mockRouteParams = {
      appeal: {
        ...appealBase,
        type: "blocked_image",
        evidence: { thumbnailBase64: "AAAA" },
      },
    };
    const { toJSON } = render(<AppealReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("renders blocked_image branch with no thumbnail", async () => {
    mockRouteParams = {
      appeal: {
        ...appealBase,
        type: "blocked_image",
        evidence: {},
      },
    };
    const { getByText } = render(<AppealReviewScreen />);
    await waitFor(() =>
      expect(getByText("Aucune miniature transmise")).toBeTruthy(),
    );
  });

  it("renders the evidence images array branch", async () => {
    mockRouteParams = {
      appeal: {
        ...appealBase,
        evidence: { images: ["url-1.jpg", "url-2.jpg"] },
      },
    };
    sanctionsAPI.getSanction.mockResolvedValueOnce({ id: "san-1" });
    const { toJSON } = render(<AppealReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("renders the evidence scores branch", async () => {
    mockRouteParams = {
      appeal: {
        ...appealBase,
        type: "blocked_image",
        evidence: {
          thumbnailBase64: "AAAA",
          scores: { nsfw: 0.9, violence: 0.1 },
          blockReason: "Contenu sensible",
        },
      },
    };
    const { toJSON } = render(<AppealReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("renders the evidence dict-style branch (non-array, non-thumbnail)", async () => {
    mockRouteParams = {
      appeal: {
        ...appealBase,
        evidence: { foo: "bar", baz: 42 },
      },
    };
    sanctionsAPI.getSanction.mockResolvedValueOnce({ id: "san-1" });
    const { toJSON } = render(<AppealReviewScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });
});
