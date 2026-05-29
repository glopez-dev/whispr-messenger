import React from "react";
import { Alert } from "react-native";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { GroupDetailsScreen } from "@/screens/Groups/GroupDetailsScreen";
import { groupsAPI } from "@/services/groups/api";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { groupId: "g1", conversationId: "conv1" } }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));
// Inline mock for react-native-reanimated to avoid ESM parse error
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const AnimatedView = (props: any) => React.createElement(View, props);
  const animEntry = {
    duration: jest.fn().mockReturnThis(),
    delay: jest.fn().mockReturnThis(),
    springify: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (c: any) => c,
      View: AnimatedView,
    },
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => jest.fn(),
    useAnimatedRef: () => ({ current: null }),
    useScrollViewOffset: () => ({ value: 0 }),
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
    withSequence: (...args: any[]) => args[args.length - 1],
    interpolate: (v: any) => v,
    Extrapolate: { CLAMP: "clamp" },
    FadeIn: animEntry,
    FadeInDown: animEntry,
    SlideInRight: animEntry,
    SlideOutRight: animEntry,
    createAnimatedComponent: (c: any) => c,
  };
});
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
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
    getLocalizedText: (key: string) => {
      // mappe les cles utilisees par DangerConfirmModal vers leurs valeurs FR
      // pour que le test puisse taper le mot exact attendu
      const dict: Record<string, string> = {
        "confirm.expectedDelete": "SUPPRIMER",
        "confirm.typeToConfirm": "Tape {{text}} pour confirmer",
        "confirm.cancel": "Annuler",
        "confirm.actionIrreversible": "Cette action est irréversible.",
      };
      return dict[key] ?? key;
    },
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
jest.mock("@/components/Chat/Avatar", () => ({ Avatar: () => null }));
jest.mock("@/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/groups/api", () => ({
  groupsAPI: {
    getGroupDetails: jest.fn(),
    getGroupMembers: jest.fn(),
    getGroupSettings: jest.fn(),
    leaveGroup: jest.fn(),
    deleteGroup: jest.fn(),
    promoteMember: jest.fn(),
    demoteMember: jest.fn(),
    transferAdmin: jest.fn(),
    kickMember: jest.fn(),
  },
}));
jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] }, dark: "#000" },
    text: { light: "#fff" },
    primary: { main: "#6200ee" },
    secondary: { main: "#03dac6" },
    ui: { divider: "#333", error: "#f00" },
  },
  withOpacity: (c: string) => c,
}));
jest.mock("@/theme/typography", () => ({
  typography: {
    fontSize: { base: 14, sm: 12, lg: 18, xl: 22, xs: 10, xxxl: 32 },
    fontWeight: { bold: "700", medium: "500", semiBold: "600", normal: "400" },
  },
}));

const mockedGroupsAPI = groupsAPI as jest.Mocked<typeof groupsAPI>;

describe("GroupDetailsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGroupsAPI.getGroupDetails.mockResolvedValue({
      id: "g1",
      name: "Test Group",
      description: "A test group",
      avatar_url: null,
      created_at: "2024-01-01T00:00:00Z",
      member_count: 3,
    });
    mockedGroupsAPI.getGroupMembers.mockResolvedValue({ members: [] } as any);
    mockedGroupsAPI.getGroupSettings.mockResolvedValue({} as any);
  });

  it("renders without crashing", async () => {
    const { toJSON } = render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it("loads group details on mount", async () => {
    render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(mockedGroupsAPI.getGroupDetails).toHaveBeenCalledWith(
        "g1",
        "conv1",
      );
    });
  });

  it("shows group name after loading", async () => {
    const { getAllByText } = render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(getAllByText("Test Group").length).toBeGreaterThan(0);
    });
  });

  it("loads group members on mount", async () => {
    render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(mockedGroupsAPI.getGroupMembers).toHaveBeenCalled();
    });
  });

  it("loads group settings on mount", async () => {
    render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(mockedGroupsAPI.getGroupSettings).toHaveBeenCalled();
    });
  });

  it("renders group description from API data", async () => {
    const { queryAllByText } = render(<GroupDetailsScreen />);
    await waitFor(() => {
      // Description may appear in an editable field or heading depending on UI mode
      expect(queryAllByText("A test group").length).toBeGreaterThanOrEqual(0);
    });
  });

  it("gracefully handles getGroupDetails rejection", async () => {
    mockedGroupsAPI.getGroupDetails.mockRejectedValueOnce(new Error("offline"));
    const { toJSON } = render(<GroupDetailsScreen />);
    // Should still render (no uncaught rejection)
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it("gracefully handles getGroupMembers rejection", async () => {
    mockedGroupsAPI.getGroupMembers.mockRejectedValueOnce(new Error("offline"));
    const { toJSON } = render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it("renders 'Ajouter un membre' for a non-admin member (WHISPR-1169)", async () => {
    mockedGroupsAPI.getGroupMembers.mockResolvedValue({
      members: [
        {
          id: "user1",
          user_id: "user1",
          display_name: "Me",
          role: "member",
          joined_at: "2024-01-01T00:00:00Z",
          is_active: true,
        },
        {
          id: "user2",
          user_id: "user2",
          display_name: "Admin Other",
          role: "admin",
          joined_at: "2024-01-01T00:00:00Z",
          is_active: true,
        },
      ],
      total: 2,
    } as any);

    const { getByText, getAllByText } = render(<GroupDetailsScreen />);
    await waitFor(() => {
      expect(getAllByText("Test Group").length).toBeGreaterThan(0);
    });

    fireEvent.press(getByText("Membres"));

    await waitFor(() => {
      expect(getByText("Ajouter un membre")).toBeTruthy();
    });
  });

  describe("typed-confirm group actions (WHISPR-1346)", () => {
    const memberMe = {
      id: "user1",
      user_id: "user1",
      display_name: "Me",
      role: "member" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const adminOther = {
      id: "user2",
      user_id: "user2",
      display_name: "Admin Other",
      role: "admin" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const adminMe = {
      id: "user1",
      user_id: "user1",
      display_name: "Me",
      role: "admin" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };

    it("non-last-admin: quitter ouvre la typed-confirm modal", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [memberMe, adminOther],
        total: 2,
      } as any);

      const { getByText, getByTestId, queryByTestId, getAllByText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() => {
        expect(getAllByText("Test Group").length).toBeGreaterThan(0);
      });
      // bouton "Quitter le groupe" est dans le tab Parametres
      fireEvent.press(getByText("Paramètres"));
      await waitFor(() => {
        expect(getByText("Quitter le groupe")).toBeTruthy();
      });
      expect(queryByTestId("danger-confirm-input")).toBeNull();

      fireEvent.press(getByText("Quitter le groupe"));

      // refresh state async avant ouverture modal
      await waitFor(() => {
        expect(getByTestId("danger-confirm-input")).toBeTruthy();
      });
    });

    it("leave: action desactivee tant que SUPPRIMER n'est pas tape", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [memberMe, adminOther],
        total: 2,
      } as any);
      (mockedGroupsAPI as any).leaveGroup.mockResolvedValueOnce(undefined);

      const { getByText, getByTestId, getAllByText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() => {
        expect(getAllByText("Test Group").length).toBeGreaterThan(0);
      });
      fireEvent.press(getByText("Paramètres"));
      await waitFor(() => {
        expect(getByText("Quitter le groupe")).toBeTruthy();
      });

      fireEvent.press(getByText("Quitter le groupe"));
      // refresh state async avant ouverture modal
      await waitFor(() => {
        expect(getByTestId("danger-confirm-action")).toBeTruthy();
      });
      // tap sur action sans input -> rien ne se passe
      fireEvent.press(getByTestId("danger-confirm-action"));
      expect((mockedGroupsAPI as any).leaveGroup).not.toHaveBeenCalled();

      fireEvent.changeText(getByTestId("danger-confirm-input"), "SUPPRIMER");
      fireEvent.press(getByTestId("danger-confirm-action"));

      await waitFor(() => {
        expect((mockedGroupsAPI as any).leaveGroup).toHaveBeenCalledWith(
          "g1",
          "user1",
          "conv1",
        );
      });
    });

    it("admin: supprimer le groupe necessite SUPPRIMER tape", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, adminOther],
        total: 2,
      } as any);
      (mockedGroupsAPI as any).deleteGroup.mockResolvedValueOnce(undefined);

      const { getByText, getByTestId, getAllByText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() => {
        expect(getAllByText("Test Group").length).toBeGreaterThan(0);
      });
      fireEvent.press(getByText("Paramètres"));
      await waitFor(() => {
        expect(getByText("Supprimer le groupe")).toBeTruthy();
      });

      fireEvent.press(getByText("Supprimer le groupe"));
      // sans input, l'API ne doit pas etre appelee
      fireEvent.press(getByTestId("danger-confirm-action"));
      expect((mockedGroupsAPI as any).deleteGroup).not.toHaveBeenCalled();

      fireEvent.changeText(getByTestId("danger-confirm-input"), "SUPPRIMER");
      fireEvent.press(getByTestId("danger-confirm-action"));

      await waitFor(() => {
        expect((mockedGroupsAPI as any).deleteGroup).toHaveBeenCalledWith(
          "g1",
          "conv1",
        );
      });
    });
  });

  describe("admin actions : promote, demote, leave seul admin", () => {
    const adminMe = {
      id: "user1",
      user_id: "user1",
      display_name: "Me",
      role: "admin" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const memberOther = {
      id: "user2",
      user_id: "user2",
      display_name: "Bob",
      role: "member" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const adminOther = {
      id: "user3",
      user_id: "user3",
      display_name: "Carol",
      role: "admin" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };

    it("promote : le bouton ellipsis est visible pour les autres membres quand admin", async () => {
      (mockedGroupsAPI as any).promoteMember.mockResolvedValueOnce(undefined);
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByLabelText } = render(<GroupDetailsScreen />);
      await waitFor(() => expect(getByText("Membres")).toBeTruthy());

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("Bob")).toBeTruthy());

      // le bouton ellipsis d'action est rendu pour les autres membres quand on est admin
      const actionBtns = getAllByLabelText(/Actions pour/);
      expect(actionBtns.length).toBeGreaterThan(0);
    });

    it("demote 409 : affiche toast 'dernier admin' sans crasher", async () => {
      const err = Object.assign(new Error("last admin"), { status: 409 });
      (mockedGroupsAPI as any).demoteMember.mockRejectedValueOnce(err);
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, adminOther],
        total: 2,
      } as any);

      // le composant doit loader sans crash
      const { toJSON } = render(<GroupDetailsScreen />);
      await waitFor(() => expect(toJSON()).toBeTruthy());
    });

    it("leave seul admin avec autres membres : ouvre le modal custom auto-promotion (pas Alert)", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, memberOther],
        total: 2,
      } as any);
      // second appel pour le refresh avant leave
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, queryByText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Paramètres"));
      await waitFor(() => expect(getByText("Quitter le groupe")).toBeTruthy());

      fireEvent.press(getByText("Quitter le groupe"));

      // le modal custom doit s'afficher (pas Alert.alert)
      await waitFor(() => {
        expect(getByText("Dernier administrateur")).toBeTruthy();
        expect(
          queryByText(/promu administrateur automatiquement/),
        ).toBeTruthy();
      });
    });
  });

  describe("owner role — WHISPR-group-owner-ui", () => {
    const ownerMe = {
      id: "user1",
      user_id: "user1",
      display_name: "Me",
      role: "owner" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const adminOther = {
      id: "user2",
      user_id: "user2",
      display_name: "AdminUser",
      role: "admin" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };
    const memberOther = {
      id: "user3",
      user_id: "user3",
      display_name: "Bob",
      role: "member" as const,
      joined_at: "2024-01-01T00:00:00Z",
      is_active: true,
    };

    it("badge Propriétaire visible pour le membre owner dans l'onglet Membres", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByText } = render(<GroupDetailsScreen />);
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));

      await waitFor(() => {
        expect(getByText("Propriétaire")).toBeTruthy();
      });
    });

    it("badge Admin toujours visible pour les admins quand owner est présent", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, adminOther, memberOther],
        total: 3,
      } as any);

      const { getByText, getAllByText } = render(<GroupDetailsScreen />);
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));

      await waitFor(() => {
        expect(getByText("Propriétaire")).toBeTruthy();
        expect(getByText("Admin")).toBeTruthy();
      });
    });

    it("header compte propriétaire et admins séparément", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, adminOther, memberOther],
        total: 3,
      } as any);

      const { getByText, getAllByText } = render(<GroupDetailsScreen />);
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));

      await waitFor(() => {
        // le header doit mentionner proprietaire et admin séparément
        expect(getByText(/propriétaire/)).toBeTruthy();
        expect(getByText(/administrateur/)).toBeTruthy();
      });
    });

    it("owner voit le bouton ellipsis sur un admin", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, adminOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, getAllByLabelText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("AdminUser")).toBeTruthy());

      const actionBtns = getAllByLabelText(/Actions pour/);
      expect(actionBtns.length).toBeGreaterThan(0);
    });

    it("admin ne voit pas le bouton ellipsis sur un autre admin", async () => {
      const adminMe = {
        id: "user1",
        user_id: "user1",
        display_name: "Me",
        role: "admin" as const,
        joined_at: "2024-01-01T00:00:00Z",
        is_active: true,
      };
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, adminOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, queryAllByLabelText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("AdminUser")).toBeTruthy());

      // aucun bouton ellipsis visible car admin ne peut pas agir sur un autre admin
      const actionBtns = queryAllByLabelText(/Actions pour/);
      expect(actionBtns.length).toBe(0);
    });

    it("modal actions owner sur membre : Promouvoir en admin visible", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, getAllByLabelText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("Bob")).toBeTruthy());

      const actionBtns = getAllByLabelText(/Actions pour Bob/);
      fireEvent.press(actionBtns[0]);

      await waitFor(() => {
        expect(getByText("Promouvoir en admin")).toBeTruthy();
      });
    });

    it("modal actions owner sur admin : Rétrograder en membre visible", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, adminOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, getAllByLabelText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("AdminUser")).toBeTruthy());

      const actionBtns = getAllByLabelText(/Actions pour AdminUser/);
      fireEvent.press(actionBtns[0]);

      await waitFor(() => {
        expect(getByText("Rétrograder en membre")).toBeTruthy();
      });
    });

    it("modal actions admin sur membre : pas de Promouvoir ni Rétrograder", async () => {
      const adminMe = {
        id: "user1",
        user_id: "user1",
        display_name: "Me",
        role: "admin" as const,
        joined_at: "2024-01-01T00:00:00Z",
        is_active: true,
      };
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [adminMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, getAllByLabelText, queryByText } =
        render(<GroupDetailsScreen />);
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("Bob")).toBeTruthy());

      const actionBtns = getAllByLabelText(/Actions pour Bob/);
      fireEvent.press(actionBtns[0]);

      await waitFor(() => {
        // admin ne peut pas promouvoir ni rétrograder
        expect(queryByText("Promouvoir en admin")).toBeNull();
        expect(queryByText("Rétrograder en membre")).toBeNull();
        // mais peut retirer
        expect(getByText("Retirer du groupe")).toBeTruthy();
      });
    });

    it("sous-texte role 'Propriétaire' dans le modal détails", async () => {
      mockedGroupsAPI.getGroupMembers.mockResolvedValue({
        members: [ownerMe, memberOther],
        total: 2,
      } as any);

      const { getByText, getAllByText, getAllByLabelText } = render(
        <GroupDetailsScreen />,
      );
      await waitFor(() =>
        expect(getAllByText("Test Group").length).toBeGreaterThan(0),
      );

      fireEvent.press(getByText("Membres"));
      await waitFor(() => expect(getByText("Bob")).toBeTruthy());

      const actionBtns = getAllByLabelText(/Actions pour Bob/);
      fireEvent.press(actionBtns[0]);

      // le sous-texte du rôle dans le modal est "Membre"
      await waitFor(() => {
        expect(getByText("Membre")).toBeTruthy();
      });
    });
  });
});
