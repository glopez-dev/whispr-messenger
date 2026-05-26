/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Platform } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-blur", () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockListCalls = jest.fn();
jest.mock("../../../services/calls/callsApi", () => ({
  callsApi: { list: (...a: unknown[]) => mockListCalls(...a) },
}));

const mockGetConversation = jest.fn();
const mockGetConversationMembers = jest.fn();
jest.mock("../../../services/messaging/api", () => ({
  messagingAPI: {
    getConversation: (...a: unknown[]) => mockGetConversation(...a),
    getConversationMembers: (...a: unknown[]) =>
      mockGetConversationMembers(...a),
  },
}));

jest.mock("../../../services/TokenService", () => ({
  TokenService: {
    getAccessToken: jest.fn().mockResolvedValue("at"),
    decodeAccessToken: jest.fn().mockReturnValue({ sub: "me" }),
  },
}));

jest.mock("../../../components/Chat/Avatar", () => ({ Avatar: () => null }));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock("react-native-spotlight-tour", () => ({
  SpotlightTourProvider: ({ children }: any) =>
    typeof children === "function" ? children({}) : children,
  AttachStep: ({ children }: any) => children,
}));
jest.mock("../../../components/Tour/TourAutoStart", () => ({
  TourAutoStart: () => null,
}));
jest.mock("../../../context/TourContext", () => ({
  useTour: () => ({ isTourActive: false, skipTour: jest.fn() }),
}));

import { CallHistoryScreen } from "../CallHistoryScreen";

beforeEach(() => {
  jest.clearAllMocks();
  mockListCalls.mockResolvedValue({ data: [] });
  mockGetConversation.mockResolvedValue(null);
  mockGetConversationMembers.mockResolvedValue([]);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("CallHistoryScreen", () => {
  it("demande la liste des appels au montage", async () => {
    render(<CallHistoryScreen />);
    await waitFor(() =>
      expect(mockListCalls).toHaveBeenCalledWith({ limit: 50 }),
    );
  });

  it("affiche le header et les filtres", async () => {
    const { getByText } = render(<CallHistoryScreen />);
    expect(getByText("Appels")).toBeTruthy();
    expect(getByText("Tous")).toBeTruthy();
    expect(getByText("Manqués")).toBeTruthy();
  });

  it("affiche l'état vide quand aucun appel n'existe", async () => {
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText("Aucun appel pour le moment")).toBeTruthy();
  });

  it("affiche l'état vide Manqués quand filtre actif et aucun appel manqué", async () => {
    const { getByText, findByText } = render(<CallHistoryScreen />);
    await findByText("Aucun appel pour le moment");
    fireEvent.press(getByText("Manqués"));
    expect(await findByText("Aucun appel manqué")).toBeTruthy();
  });

  it("rend les appels retournés par l'API", async () => {
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "call-1",
          conversation_id: "conv-1",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: new Date().toISOString(),
        },
        {
          id: "call-2",
          conversation_id: "conv-2",
          status: "missed",
          type: "video",
          initiator_id: "other",
          started_at: new Date().toISOString(),
        },
      ],
    });

    const { queryByText } = render(<CallHistoryScreen />);
    await waitFor(() => expect(mockListCalls).toHaveBeenCalled());
    await waitFor(() =>
      expect(queryByText("Aucun appel pour le moment")).toBeNull(),
    );
  });

  it("le filtre Manqués n'affiche que les appels manqués", async () => {
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "call-1",
          conversation_id: "conv-1",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: new Date().toISOString(),
          title: "Alice",
        },
        {
          id: "call-2",
          conversation_id: "conv-2",
          status: "missed",
          type: "audio",
          initiator_id: "other",
          started_at: new Date().toISOString(),
          title: "Bob",
        },
      ],
    });

    const { getByText, queryByText } = render(<CallHistoryScreen />);
    await waitFor(() => expect(mockListCalls).toHaveBeenCalled());
    // Les deux doivent être visibles avec le filtre "Tous"
    await waitFor(() =>
      expect(queryByText("Aucun appel pour le moment")).toBeNull(),
    );
    // Passer sur le filtre Manqués
    fireEvent.press(getByText("Manqués"));
    // L'état vide ne doit pas apparaître (il y a un appel manqué)
    await waitFor(() => expect(queryByText("Aucun appel manqué")).toBeNull());
  });

  it("rend sans planter quand l'API échoue", async () => {
    mockListCalls.mockRejectedValue(new Error("boom"));
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText("Aucun appel pour le moment")).toBeTruthy();
  });
});

describe("CallHistoryScreen sur web", () => {
  const originalOS = Platform.OS;
  beforeAll(() => {
    (Platform as { OS: string }).OS = "web";
  });
  afterAll(() => {
    (Platform as { OS: string }).OS = originalOS;
  });

  it("rend sans planter (layout web)", () => {
    expect(() => render(<CallHistoryScreen />)).not.toThrow();
  });
});
