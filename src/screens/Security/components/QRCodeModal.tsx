import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCodeStyled from "react-native-qrcode-styled";
import { useTheme } from "../../../context/ThemeContext";
import { DeviceManagerService } from "../../../services/SecurityService";

const formatCountdown = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Module-level cache — survives re-renders and component remounts
export const _qrCache: {
  challenge: string | null;
  deviceId: string;
  generatedAt: number;
  inFlight: Promise<string> | null;
} = { challenge: null, deviceId: "", generatedAt: 0, inFlight: null };

export interface QRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  deviceId: string;
  themeColors: ReturnType<ReturnType<typeof useTheme>["getThemeColors"]>;
  accentColor: string;
  getFontSize: ReturnType<typeof useTheme>["getFontSize"];
  getLocalizedText: ReturnType<typeof useTheme>["getLocalizedText"];
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  visible,
  onClose,
  deviceId,
  themeColors,
  accentColor,
  getFontSize,
  getLocalizedText,
}) => {
  const qrModalScale = useRef(new Animated.Value(0.9)).current;
  const qrModalOpacity = useRef(new Animated.Value(0)).current;
  const [qrChallenge, setQrChallenge] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(300);

  const fetchChallenge = useCallback(
    async (force = false) => {
      if (!deviceId) return;
      const now = Date.now();

      // Cache hit — serve immediately without any loading state
      if (!force && _qrCache.deviceId === deviceId && _qrCache.challenge) {
        const age = now - _qrCache.generatedAt;
        if (age < 270_000) {
          setQrChallenge(_qrCache.challenge);
          setQrCountdown(Math.max(1, 300 - Math.floor(age / 1000)));
          setQrLoading(false);
          return;
        }
      }

      // Join in-flight request for the same device instead of firing a duplicate
      if (!force && _qrCache.inFlight && _qrCache.deviceId === deviceId) {
        setQrLoading(true);
        try {
          const challenge = await _qrCache.inFlight;
          const age = Date.now() - _qrCache.generatedAt;
          setQrChallenge(challenge);
          setQrCountdown(Math.max(1, 300 - Math.floor(age / 1000)));
        } finally {
          setQrLoading(false);
        }
        return;
      }

      // Fresh fetch (either forced refresh or no usable cache)
      _qrCache.deviceId = deviceId;
      if (force) {
        _qrCache.challenge = null;
        setQrChallenge(null);
      }
      setQrLoading(true);
      setQrCountdown(300);

      const promise = DeviceManagerService.generateQRChallenge(deviceId);
      _qrCache.inFlight = promise;
      try {
        const challenge = await promise;
        _qrCache.challenge = challenge;
        _qrCache.generatedAt = Date.now();
        _qrCache.inFlight = null;
        setQrChallenge(challenge);
        setQrCountdown(300);
      } catch (err) {
        _qrCache.inFlight = null;
        throw err;
      } finally {
        setQrLoading(false);
      }
    },
    [deviceId],
  );

  // Pre-fetch as soon as deviceId is available (modal is always mounted)
  useEffect(() => {
    if (deviceId) {
      fetchChallenge().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(qrModalScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(qrModalOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      // Re-fetch only if cache is stale and nothing is already in-flight
      const isFresh =
        _qrCache.deviceId === deviceId &&
        !!_qrCache.challenge &&
        Date.now() - _qrCache.generatedAt < 270_000;
      if (!isFresh && !_qrCache.inFlight) {
        fetchChallenge().catch(() => {});
      } else if (isFresh) {
        // Sync countdown with remaining cache age
        const elapsed = Math.floor((Date.now() - _qrCache.generatedAt) / 1000);
        setQrCountdown(Math.max(1, 300 - elapsed));
      }
    } else {
      Animated.parallel([
        Animated.timing(qrModalScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(qrModalOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || !qrChallenge) return;
    const id = setInterval(() => {
      setQrCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [visible, qrChallenge]);

  useEffect(() => {
    if (qrCountdown === 0 && visible) setQrChallenge(null);
  }, [qrCountdown, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[styles.modalBackdrop, { opacity: qrModalOpacity }]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: themeColors.background.primary,
              opacity: qrModalOpacity,
              transform: [{ scale: qrModalScale }],
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: -4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 20,
                },
                android: { elevation: 24 },
              }),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text
              style={[
                styles.modalTitle,
                {
                  color: themeColors.text.primary,
                  fontSize: getFontSize("xl"),
                },
              ]}
            >
              {getLocalizedText("security.scanQRCode")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.modalCloseButton,
                { backgroundColor: themeColors.background.secondary },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="close"
                size={20}
                color={themeColors.text.primary}
              />
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.modalSubtitle,
              {
                color: themeColors.text.secondary,
                fontSize: getFontSize("sm"),
              },
            ]}
          >
            {getLocalizedText("security.qrInstructions") ||
              "Scannez ce code avec l'appareil à connecter"}
          </Text>
          <View style={styles.qrContainer}>
            {qrLoading ? (
              <ActivityIndicator size="large" color={accentColor} />
            ) : qrChallenge ? (
              <QRCodeStyled
                data={qrChallenge}
                style={{ backgroundColor: "#FFFFFF" }}
                padding={12}
                width={200}
              />
            ) : (
              <View style={styles.qrExpiredContainer}>
                <Ionicons
                  name="time-outline"
                  size={48}
                  color={themeColors.text.tertiary}
                />
                <Text
                  style={[
                    styles.qrExpiredText,
                    {
                      color: themeColors.text.secondary,
                      fontSize: getFontSize("sm"),
                    },
                  ]}
                >
                  {getLocalizedText("security.qrExpired") || "QR code expiré"}
                </Text>
              </View>
            )}
          </View>
          {qrChallenge && !qrLoading && (
            <Text
              style={[
                styles.qrCountdownText,
                {
                  color: themeColors.text.secondary,
                  fontSize: getFontSize("sm"),
                },
              ]}
            >
              {getLocalizedText("security.qrExpiresIn") || "Expire dans"}{" "}
              {formatCountdown(qrCountdown)}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => {
              void fetchChallenge(true);
            }}
            disabled={qrLoading}
            activeOpacity={0.8}
            style={[
              styles.qrRefreshButton,
              {
                backgroundColor: accentColor + "15",
                borderColor: accentColor + "40",
                opacity: qrLoading ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons name="refresh" size={18} color={accentColor} />
            <Text
              style={[
                styles.qrRefreshText,
                { color: accentColor, fontSize: getFontSize("base") },
              ]}
            >
              {getLocalizedText("security.qrRefresh") || "Actualiser"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubtitle: {
    marginBottom: 24,
    textAlign: "center",
    fontWeight: "500",
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 224,
    paddingVertical: 16,
  },
  qrExpiredContainer: {
    alignItems: "center",
    gap: 12,
  },
  qrExpiredText: {
    fontWeight: "500",
    textAlign: "center",
  },
  qrCountdownText: {
    textAlign: "center",
    fontWeight: "500",
    marginBottom: 20,
  },
  qrRefreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 8,
  },
  qrRefreshText: {
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
