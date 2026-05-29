import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { AdminDemosScreen } from "@/screens/Admin/AdminDemosScreen";

const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/theme/colors", () => ({
  colors: {
    background: { gradient: { app: ["#000", "#111"] } },
    primary: { main: "#6200ee" },
  },
}));

jest.mock("@/store/moderationStore", () => ({
  useIsStaff: jest.fn(() => true),
}));

jest.mock("@/components/Moderation", () => ({
  AdminGate: ({ children }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useIsStaff } = require("@/store/moderationStore");
    const isStaff = useIsStaff();
    if (!isStaff) {
      const { Text } = require("react-native");
      return <Text>Acces refuse</Text>;
    }
    return children;
  },
}));

describe("AdminDemosScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("affiche les deux cards modeles quand l'utilisateur est admin", async () => {
    const { getByText } = render(<AdminDemosScreen />);
    await waitFor(() => {
      expect(getByText("Modele V1 (Zeyou)")).toBeTruthy();
      expect(getByText("Modele V2 (Maya)")).toBeTruthy();
    });
  });

  it("affiche les boutons desactives pour chaque modele", async () => {
    const { getAllByTestId } = render(<AdminDemosScreen />);
    await waitFor(() => {
      const imageButtons = getAllByTestId(/^btn-image-/);
      const textButtons = getAllByTestId(/^btn-text-/);
      expect(imageButtons).toHaveLength(2);
      expect(textButtons).toHaveLength(2);
      // les boutons doivent etre desactives - pas encore integres backend
      imageButtons.forEach((btn) => {
        expect(btn.props.accessibilityState?.disabled).toBe(true);
      });
      textButtons.forEach((btn) => {
        expect(btn.props.accessibilityState?.disabled).toBe(true);
      });
    });
  });

  it("affiche le badge Bientot sur chaque card", async () => {
    const { getAllByText } = render(<AdminDemosScreen />);
    await waitFor(() => {
      const badges = getAllByText("Bientôt");
      expect(badges).toHaveLength(2);
    });
  });

  it("affiche le titre du header", async () => {
    const { getByText } = render(<AdminDemosScreen />);
    await waitFor(() => {
      expect(getByText("Demos IA")).toBeTruthy();
    });
  });

  it("affiche 'Acces refuse' si l'utilisateur n'est pas staff", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useIsStaff } = require("@/store/moderationStore");
    (useIsStaff as jest.Mock).mockReturnValue(false);

    const { getByText, queryByText } = render(<AdminDemosScreen />);
    await waitFor(() => {
      expect(getByText("Acces refuse")).toBeTruthy();
    });
    expect(queryByText("Modele V1 (Zeyou)")).toBeNull();
    expect(queryByText("Modele V2 (Maya)")).toBeNull();
  });
});
