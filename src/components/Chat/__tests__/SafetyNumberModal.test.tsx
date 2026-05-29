import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SafetyNumberModal } from "@/components/Chat/SafetyNumberModal";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ userId: "user-a", deviceId: "device-a" }),
}));

const mockGetKeyBundle = jest.fn();
const mockListDevices = jest.fn();
jest.mock("@/services/SecurityService", () => ({
  SignalKeysService: {
    getKeyBundle: (...a: unknown[]) => mockGetKeyBundle(...a),
    listDevices: (...a: unknown[]) => mockListDevices(...a),
  },
}));

const mockComputeSafetyNumber = jest.fn();
jest.mock("@/services/E2EEService", () => ({
  computeSafetyNumber: (...a: unknown[]) => mockComputeSafetyNumber(...a),
}));

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockGetAllKeys = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (...a: unknown[]) => mockGetItem(...a),
    setItem: (...a: unknown[]) => mockSetItem(...a),
    getAllKeys: (...a: unknown[]) => mockGetAllKeys(...a),
    multiGet: jest.fn().mockResolvedValue([]),
  },
}));

const MY_BUNDLE = {
  identity_key: "bXlLZXk=",
  signed_prekey: { key_id: 1, public_key: "cHViS2V5", signature: "c2ln" },
  one_time_prekeys: [],
};
const THEIR_BUNDLE = {
  identity_key: "dGhlaXJLZXk=",
  signed_prekey: { key_id: 2, public_key: "dGhlaXJQdWI=", signature: "c2ln" },
  one_time_prekeys: [],
};

describe("SafetyNumberModal", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    contactUserId: "user-b",
    contactName: "Bob",
    onVerified: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetKeyBundle.mockImplementation((userId: string) => {
      if (userId === "user-a") return Promise.resolve(MY_BUNDLE);
      return Promise.resolve(THEIR_BUNDLE);
    });
    mockListDevices.mockResolvedValue({
      userId: "user-b",
      deviceIds: ["device-b"],
    });
    mockComputeSafetyNumber.mockResolvedValue(
      "12345 67890 11111 22222 33333 44444 55555 66666 77777 88888 99999 00000",
    );
    mockGetItem.mockResolvedValue(null);
    mockGetAllKeys.mockResolvedValue([]);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<SafetyNumberModal {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it("displays safety number groups after loading", async () => {
    const { findByText } = render(<SafetyNumberModal {...defaultProps} />);
    expect(await findByText("12345")).toBeTruthy();
    expect(await findByText("67890")).toBeTruthy();
  });

  it("shows error when own keys are missing", async () => {
    mockGetKeyBundle.mockRejectedValue(new Error("Network error"));
    const { findByText } = render(<SafetyNumberModal {...defaultProps} />);
    expect(
      await findByText(
        "Vos clés Signal ne sont pas encore enregistrées. Reconnectez-vous.",
      ),
    ).toBeTruthy();
  });

  it("shows error when contact has no Signal keys", async () => {
    mockGetKeyBundle.mockImplementation((userId: string) => {
      if (userId === "user-a") return Promise.resolve(MY_BUNDLE);
      return Promise.reject(new Error("404"));
    });
    const { findByText } = render(<SafetyNumberModal {...defaultProps} />);
    expect(
      await findByText(
        "Ce contact n'a pas encore de clés Signal enregistrées. Il doit se connecter au moins une fois depuis l'app.",
      ),
    ).toBeTruthy();
  });

  it("calls onClose when close button pressed", async () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <SafetyNumberModal {...defaultProps} onClose={onClose} />,
    );
    await waitFor(() => expect(mockComputeSafetyNumber).toHaveBeenCalled());
    await act(async () => {
      fireEvent.press(getByTestId("safety-close-btn"));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to next device when first device has invalid bundle", async () => {
    mockListDevices.mockResolvedValue({
      userId: "user-b",
      deviceIds: ["device-b-bad", "device-b-good"],
    });
    mockGetKeyBundle.mockImplementation((userId: string, deviceId: string) => {
      if (userId === "user-a") return Promise.resolve(MY_BUNDLE);
      if (deviceId === "device-b-bad")
        return Promise.reject(new Error("INVALID_SIGNAL_BUNDLE"));
      return Promise.resolve(THEIR_BUNDLE);
    });
    const { findByText } = render(<SafetyNumberModal {...defaultProps} />);
    expect(await findByText("12345")).toBeTruthy();
  });

  it("marks contact as verified and calls onVerified", async () => {
    const onVerified = jest.fn();
    const onClose = jest.fn();
    mockSetItem.mockResolvedValue(undefined);
    const { findByText } = render(
      <SafetyNumberModal
        {...defaultProps}
        onVerified={onVerified}
        onClose={onClose}
      />,
    );
    const btn = await findByText("Marquer comme vérifié");
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(mockSetItem).toHaveBeenCalledWith(
      "@whispr:safety:user-a:user-b",
      "verified",
    );
    expect(onVerified).toHaveBeenCalledWith("user-b");
    expect(onClose).toHaveBeenCalled();
  });
});
