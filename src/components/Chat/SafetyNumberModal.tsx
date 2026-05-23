import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../context/AuthContext";
import { SignalKeysService } from "../../services/SecurityService";
import { computeSafetyNumber } from "../../services/E2EEService";
import { colors } from "../../theme/colors";

const SAFETY_STORAGE_PREFIX = "@whispr:safety:";

interface SafetyNumberModalProps {
  visible: boolean;
  onClose: () => void;
  contactUserId: string;
  contactName: string;
  onVerified: (contactUserId: string) => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({
  visible,
  onClose,
  contactUserId,
  contactName,
  onVerified,
}) => {
  const { userId, deviceId } = useAuth();
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  useEffect(() => {
    if (!visible || !userId || !deviceId || !contactUserId) return;

    let cancelled = false;
    setLoading(true);
    setSafetyNumber(null);
    setError(null);

    const storageKey = `${SAFETY_STORAGE_PREFIX}${userId}:${contactUserId}`;

    Promise.all([
      SignalKeysService.getKeyBundle(userId, deviceId),
      SignalKeysService.listDevices(contactUserId).then((r) => {
        const firstDevice = r.deviceIds[0];
        if (!firstDevice) throw new Error("NO_DEVICE");
        return SignalKeysService.getKeyBundle(contactUserId, firstDevice);
      }),
      AsyncStorage.getItem(storageKey),
    ])
      .then(([myBundle, theirBundle, stored]) => {
        if (cancelled) return;
        setAlreadyVerified(stored === "verified");
        return computeSafetyNumber(
          myBundle.identity_key,
          userId,
          theirBundle.identity_key,
          contactUserId,
        );
      })
      .then((num) => {
        if (cancelled || !num) return;
        setSafetyNumber(num);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de calculer le Safety Number.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, userId, deviceId, contactUserId]);

  const handleMarkVerified = async () => {
    if (!userId) return;
    const storageKey = `${SAFETY_STORAGE_PREFIX}${userId}:${contactUserId}`;
    await AsyncStorage.setItem(storageKey, "verified");
    setAlreadyVerified(true);
    onVerified(contactUserId);
    onClose();
  };

  const groups = safetyNumber ? safetyNumber.split(" ") : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Safety Number</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            testID="safety-close-btn"
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Vérifiez ce code avec{" "}
          <Text style={styles.contactName}>{contactName}</Text> pour confirmer
          que votre conversation est chiffrée de bout en bout.
        </Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary.main} />
          </View>
        )}

        {error && (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {groups.length === 12 && (
          <View style={styles.grid}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.gridRow}>
                {groups.slice(row * 4, row * 4 + 4).map((g, col) => (
                  <View key={col} style={styles.groupCell}>
                    <Text style={styles.groupText}>{g}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {alreadyVerified && (
          <View style={styles.verifiedBanner}>
            <Ionicons name="lock-closed" size={16} color="#4CAF50" />
            <Text style={styles.verifiedText}>Contact vérifié</Text>
          </View>
        )}

        {!alreadyVerified && !loading && !error && groups.length === 12 && (
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={handleMarkVerified}
            activeOpacity={0.85}
          >
            <Text style={styles.verifyButtonText}>Marquer comme vérifié</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#1A1F3A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 20,
    marginBottom: 24,
  },
  contactName: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  center: {
    alignItems: "center",
    paddingVertical: 24,
  },
  errorText: {
    color: colors.ui.error,
    fontSize: 14,
    textAlign: "center",
  },
  grid: {
    gap: 10,
    marginBottom: 24,
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  groupCell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  groupText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(76,175,80,0.12)",
    marginBottom: 8,
  },
  verifiedText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 15,
  },
  verifyButton: {
    backgroundColor: colors.primary.main,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});
