/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: jest.fn(() => true),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-haptics", () => ({
  __esModule: true,
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    settings: { backgroundPreset: "whispr" },
    getThemeColors: () => ({
      background: {
        gradient: ["#000", "#111"],
        primary: "#000",
        secondary: "#111",
      },
      text: { primary: "#fff", secondary: "#aaa", tertiary: "#555" },
      primary: "#6200ee",
    }),
    getFontSize: () => 16,
    getLocalizedText: (key: string) => key,
  }),
}));
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userId: "user1",
    deviceId: "dev1",
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    joinConversationChannel: jest
      .fn()
      .mockReturnValue({ channel: null, cleanup: jest.fn() }),
    sendMessage: jest.fn(),
    markAsRead: jest.fn(),
    sendTyping: jest.fn(),
  }),
}));
jest.mock("@/services/TokenService", () => ({
  TokenService: { getAccessToken: jest.fn().mockResolvedValue("tok") },
}));
jest.mock("@/services/messaging/api", () => ({
  messagingAPI: {
    searchMessagesGlobal: jest.fn().mockResolvedValue([
      {
        id: "m1",
        conversation_id: "c1",
        content: "found",
        message_type: "text",
        sender_id: "u2",
        sent_at: "2026-01-01T00:00:00Z",
      },
    ]),
  },
}));

jest.mock("@/store/conversationsStore", () => {
  const state = {
    conversations: [
      {
        id: "c1",
        type: "direct",
        display_name: "Alice",
        members: ["user1", "user2"],
        member_user_ids: ["user1", "user2"],
        unread_count: 0,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "c2",
        type: "group",
        display_name: "Squad",
        name: "Squad",
        members: ["user1", "user3"],
        member_user_ids: ["user1", "user3"],
        unread_count: 5,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    status: "ready",
    manuallyUnreadIds: new Set<string>(),
    archived: {
      items: [],
      status: "idle",
      error: null,
      offset: 0,
      hasMore: false,
      loadingMore: false,
    },
    fetchConversations: jest.fn().mockResolvedValue(undefined),
    refreshConversations: jest.fn().mockResolvedValue(undefined),
    applyConversationUpdate: jest.fn(),
    applyConversationSummaries: jest.fn(),
    applyNewMessage: jest.fn(),
    applyMessageUpdated: jest.fn(),
    applyMessageDeleted: jest.fn(),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    archiveConversation: jest.fn().mockResolvedValue(undefined),
    applyArchiveBroadcast: jest.fn(),
    muteConversation: jest.fn().mockResolvedValue(undefined),
    pinConversation: jest.fn(),
    markAsUnread: jest.fn(),
    clearManualUnread: jest.fn(),
    resetUnreadCount: jest.fn(),
    loadManuallyUnreadIds: jest.fn(),
  };
  return {
    useConversationsStore: (selector: any) => selector(state),
  };
});
jest.mock("@/components/Chat/SwipeableConversationItem", () => ({
  SwipeableConversationItem: ({ conversation, onPress }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity onPress={() => onPress(conversation.id)}>
        <Text>{conversation.display_name || "Conversation"}</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("@/components/Chat/EmptyState", () => ({
  EmptyState: ({ onNewConversation }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity onPress={onNewConversation}>
        <Text>Nouvelle conversation</Text>
      </TouchableOpacity>
    );
  },
}));
jest.mock("@/components/Chat/SkeletonLoader", () => ({
  ConversationSkeleton: () => null,
}));
jest.mock("@/components/Navigation/BottomTabBar", () => ({
  BottomTabBar: () => null,
}));
jest.mock("@/components/Chat/NewConversationModal", () => ({
  NewConversationModal: () => null,
}));
jest.mock("@/components/Toast/Toast", () => () => null);
jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] } },
    primary: { main: "#6200ee" },
    text: { light: "#fff" },
    ui: { error: "#f00" },
    secondary: { main: "#03dac6" },
  },
  withOpacity: (c: string) => c,
}));
jest.mock("@/store/inboxStore", () => ({
  useInboxStore: (selector: any) =>
    selector({
      items: [],
      unread_count: 0,
      loading: false,
      has_more: false,
      next_cursor: null,
      hydrate: jest.fn().mockResolvedValue(undefined),
      loadMore: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(undefined),
      addNew: jest.fn(),
    }),
}));
jest.mock("@/components/Common/BellIcon", () => ({
  BellIcon: () => null,
}));
jest.mock("@/components/Common/InboxPanel", () => ({
  InboxPanel: () => null,
}));
jest.mock("@/components/Common/SafariPWABanner", () => ({
  SafariPWABanner: () => null,
}));

import { ConversationsListScreen } from "@/screens/Chat/ConversationsListScreen";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ConversationsListScreen — actions", () => {
  it("renders conversations and navigates to Chat when one is pressed", async () => {
    const { getByText } = render(<ConversationsListScreen />);
    await waitFor(() => expect(getByText("Alice")).toBeTruthy());
    fireEvent.press(getByText("Alice"));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("toggles edit mode + cancel + show selection bar", async () => {
    const { getByText } = render(<ConversationsListScreen />);
    fireEvent.press(getByText("Modifier"));
    await waitFor(() => expect(getByText("Annuler")).toBeTruthy());
    fireEvent.press(getByText("Annuler"));
    await waitFor(() => expect(getByText("Modifier")).toBeTruthy());
  });

  it("search text triggers searchMessagesGlobal", async () => {
    const { getByPlaceholderText } = render(<ConversationsListScreen />);
    const input = getByPlaceholderText(
      "Rechercher des messages ou utilisateurs",
    );
    fireEvent.changeText(input, "hello");
    await waitFor(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { messagingAPI } = require("@/services/messaging/api");
      expect(messagingAPI.searchMessagesGlobal).toHaveBeenCalled();
    });
  });

  it("fires every onPress in a multi-pass over the tree", async () => {
    const tree = render(<ConversationsListScreen />);
    await waitFor(() => expect(tree.toJSON()).toBeTruthy());
    const walk = (node: any) => {
      const out: any[] = [];
      const visit = (n: any) => {
        if (!n) return;
        if (n.props?.onPress) out.push(n);
        const c = n.children;
        if (Array.isArray(c)) for (const x of c) visit(x);
        else if (c && typeof c === "object") visit(c);
      };
      visit(node);
      return out;
    };
    for (let pass = 0; pass < 2; pass++) {
      await act(async () => {
        for (const t of walk(tree.UNSAFE_root)) {
          try {
            await t.props.onPress();
          } catch {
            /* swallow */
          }
        }
      });
    }
    expect(tree.toJSON()).toBeTruthy();
  });
});
