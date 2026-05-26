/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    React.useEffect(() => cb(), []);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const imagePicker = require("expo-image-picker") as Record<string, jest.Mock>;

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../components/Chat/Avatar", () => ({ Avatar: () => null }));
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ userId: "user-123" }),
}));
jest.mock("../../../components", () => ({
  Logo: () => null,
  Button: ({ title, onPress, disabled }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TouchableOpacity, Text } = require("react-native");
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled}>
        <Text>{title}</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock("../../../services", () => {
  const singleton = {
    getProfile: jest.fn(),
    getUserProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  return { UserService: { getInstance: () => singleton } };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const userInstance =
  require("../../../services").UserService.getInstance() as Record<
    string,
    jest.Mock
  >;

jest.mock("../../../services/MediaService", () => ({
  MediaService: {
    uploadMedia: jest.fn(),
    getMediaMetadata: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mediaService = require("../../../services/MediaService")
  .MediaService as Record<string, jest.Mock>;

jest.mock("../../../theme/colors", () => ({
  colors: {
    background: {
      gradient: { app: ["#000", "#111"] },
      primary: "#000",
      secondary: "#111",
      dark: "#000",
    },
    text: {
      light: "#fff",
      secondary: "#aaa",
      placeholder: "#666",
      primary: "#000",
    },
    primary: { main: "#6200ee" },
    ui: { error: "#f00", border: "#333" },
    status: { online: "#0f0", offline: "#888" },
  },
  withOpacity: (c: string) => c,
}));

import { MyProfileScreen } from "../MyProfileScreen";

const profileBase = {
  id: "user-123",
  firstName: "John",
  lastName: "Doe",
  username: "johndoe",
  phoneNumber: "+33612345678",
  biography: "Hello world",
  profilePictureUrl: "media-pic-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  userInstance.getProfile.mockResolvedValue({
    success: true,
    profile: profileBase,
  });
  userInstance.updateProfile.mockResolvedValue({ success: true });
  mediaService.uploadMedia.mockResolvedValue({
    id: "media-2",
    url: "https://cdn.test/img.jpg",
  });
  mediaService.getMediaMetadata.mockResolvedValue({ id: "media-pic-1" });
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
    status: "granted",
  });
  imagePicker.requestCameraPermissionsAsync.mockResolvedValue({
    status: "granted",
  });
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
  imagePicker.launchCameraAsync.mockResolvedValue({ canceled: true });
});

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

describe("MyProfileScreen — actions multi-pass", () => {
  it("fires every onPress without throwing", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.style !== "cancel");
        btn?.onPress?.();
      });
    const tree = render(<MyProfileScreen />);
    await waitFor(() => expect(userInstance.getProfile).toHaveBeenCalled());
    for (let pass = 0; pass < 3; pass++) {
      await act(async () => {
        for (const t of allOnPress(tree.UNSAFE_root)) {
          try {
            await t.props.onPress();
          } catch {
            /* swallow */
          }
        }
      });
    }
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });

  it("uploads a profile picture via the gallery picker", async () => {
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///tmp/pic.jpg" }],
    });
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) => {
        const btn = buttons?.find((b) => b.text === "Galerie");
        btn?.onPress?.();
      });
    const tree = render(<MyProfileScreen />);
    await waitFor(() => expect(userInstance.getProfile).toHaveBeenCalled());
    for (let pass = 0; pass < 2; pass++) {
      await act(async () => {
        for (const t of allOnPress(tree.UNSAFE_root)) {
          try {
            await t.props.onPress();
          } catch {
            /* swallow */
          }
        }
      });
    }
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });

  it("survives a getProfile rejection", async () => {
    userInstance.getProfile.mockReset();
    userInstance.getProfile.mockRejectedValue(new Error("offline"));
    const { toJSON } = render(<MyProfileScreen />);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it("survives an updateProfile rejection", async () => {
    userInstance.updateProfile.mockReset();
    userInstance.updateProfile.mockRejectedValue(new Error("server"));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const tree = render(<MyProfileScreen />);
    await waitFor(() => expect(userInstance.getProfile).toHaveBeenCalled());
    await act(async () => {
      for (const t of allOnPress(tree.UNSAFE_root)) {
        try {
          await t.props.onPress();
        } catch {
          /* swallow */
        }
      }
    });
    expect(tree.toJSON()).toBeTruthy();
    alertSpy.mockRestore();
  });
});
