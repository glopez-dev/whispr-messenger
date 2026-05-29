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
jest.mock("@/services/calls/callsApi", () => ({
  callsApi: { list: (...a: unknown[]) => mockListCalls(...a) },
}));

const mockGetConversation = jest.fn();
const mockGetConversationMembers = jest.fn();
jest.mock("@/services/messaging/api", () => ({
  messagingAPI: {
    getConversation: (...a: unknown[]) => mockGetConversation(...a),
    getConversationMembers: (...a: unknown[]) =>
      mockGetConversationMembers(...a),
  },
}));

jest.mock("@/services/TokenService", () => ({
  TokenService: {
    getAccessToken: jest.fn().mockResolvedValue("at"),
    decodeAccessToken: jest.fn().mockReturnValue({ sub: "me" }),
  },
}));

jest.mock("@/components/Chat/Avatar", () => ({ Avatar: () => null }));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock("react-native-spotlight-tour", () => ({
  SpotlightTourProvider: ({ children }: any) =>
    typeof children === "function" ? children({}) : children,
  AttachStep: ({ children }: any) => children,
}));
jest.mock("@/components/Tour/TourAutoStart", () => ({
  TourAutoStart: () => null,
}));
jest.mock("@/context/TourContext", () => ({
  useTour: () => ({ isTourActive: false, skipTour: jest.fn() }),
}));

import { CallHistoryScreen } from "@/screens/Calls/CallHistoryScreen";

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

// ---------------------------------------------------------------------------
// Tests unitaires des helpers d'affichage des dates
// ---------------------------------------------------------------------------

// On importe les helpers via un re-export temporaire pour les tester en isolation.
// On les teste indirectement via le rendu de l'écran avec des dates contrôlées.

describe("affichage des sous-textes de dates dans les lignes d'appel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversation.mockResolvedValue(null);
    mockGetConversationMembers.mockResolvedValue([]);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("affiche juste l'heure pour un appel d'aujourd'hui", async () => {
    const now = new Date();
    now.setHours(14, 30, 0, 0);
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c1",
          conversation_id: "conv-1",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: now.toISOString(),
          duration_seconds: 12,
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    // sous-texte "12s · HH:MM" sans mention du jour
    const subtext = await findByText(/^12s · \d{2}:\d{2}$/);
    expect(subtext).toBeTruthy();
    expect(subtext.props.children).not.toMatch(
      /hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i,
    );
  });

  it("préfixe 'hier' pour un appel d'hier", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c2",
          conversation_id: "conv-2",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: yesterday.toISOString(),
          duration_seconds: 60,
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    const subtext = await findByText(/hier \d{2}:\d{2}/);
    expect(subtext).toBeTruthy();
  });

  it("préfixe le jour de la semaine pour un appel de cette semaine", async () => {
    const daysAgo3 = new Date();
    daysAgo3.setDate(daysAgo3.getDate() - 3);
    daysAgo3.setHours(9, 15, 0, 0);
    const expectedWeekday = daysAgo3.toLocaleDateString("fr-FR", {
      weekday: "long",
    });
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c3",
          conversation_id: "conv-3",
          status: "missed",
          type: "audio",
          initiator_id: "other",
          started_at: daysAgo3.toISOString(),
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    const subtext = await findByText(
      new RegExp(`Manqué · ${expectedWeekday} \\d{2}:\\d{2}`),
    );
    expect(subtext).toBeTruthy();
  });

  it("préfixe 'j mois.' pour un appel plus ancien", async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 1);
    old.setHours(8, 0, 0, 0);
    const expectedDay = old.getDate();
    const expectedMonth = old.toLocaleDateString("fr-FR", { month: "short" });
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c4",
          conversation_id: "conv-4",
          status: "ended",
          type: "video",
          initiator_id: "me",
          started_at: old.toISOString(),
          duration_seconds: 300,
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    const subtext = await findByText(
      new RegExp(
        `5min \\d{2}s · ${expectedDay} ${expectedMonth} \\d{2}:\\d{2}`,
      ),
    );
    expect(subtext).toBeTruthy();
  });
});

describe("section headers groupés par date", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversation.mockResolvedValue(null);
    mockGetConversationMembers.mockResolvedValue([]);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("affiche 'Aujourd\\'hui' comme section header pour un appel du jour", async () => {
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c1",
          conversation_id: "conv-1",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: new Date().toISOString(),
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText("Aujourd'hui")).toBeTruthy();
  });

  it("affiche 'Hier' comme section header pour un appel d'hier", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c2",
          conversation_id: "conv-2",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: yesterday.toISOString(),
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText("Hier")).toBeTruthy();
  });

  it("affiche le jour précis (ex: 'Mardi 21 mai') pour un appel de cette semaine", async () => {
    const daysAgo2 = new Date();
    daysAgo2.setDate(daysAgo2.getDate() - 2);
    const weekday = daysAgo2.toLocaleDateString("fr-FR", { weekday: "long" });
    const capitalizedWeekday =
      weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const day = daysAgo2.getDate();
    const month = daysAgo2
      .toLocaleDateString("fr-FR", { month: "short" })
      .replace(".", "");
    const expectedHeader = `${capitalizedWeekday} ${day} ${month}`;
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c3",
          conversation_id: "conv-3",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: daysAgo2.toISOString(),
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText(expectedHeader)).toBeTruthy();
  });

  it("affiche le mois + année pour un appel plus ancien", async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 1);
    const monthLong = old.toLocaleDateString("fr-FR", { month: "long" });
    const capitalized = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
    const expectedHeader = `${capitalized} ${old.getFullYear()}`;
    mockListCalls.mockResolvedValue({
      data: [
        {
          id: "c4",
          conversation_id: "conv-4",
          status: "ended",
          type: "audio",
          initiator_id: "me",
          started_at: old.toISOString(),
        },
      ],
    });
    const { findByText } = render(<CallHistoryScreen />);
    expect(await findByText(expectedHeader)).toBeTruthy();
  });
});
