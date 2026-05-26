import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

    const myBundlePromise = SignalKeysService.getKeyBundle(
      userId,
      deviceId,
    ).catch(() => {
      throw new Error("NO_OWN_KEYS");
    });

    const theirBundlePromise = SignalKeysService.listDevices(contactUserId)
      .catch(() => {
        throw new Error("NO_DEVICE");
      })
      .then(async (r) => {
        if (!r.deviceIds.length) throw new Error("NO_DEVICE");
        // Certains appareils enregistrés ont une identityKey vide ("") —
        // on parcourt la liste jusqu'au premier appareil avec un bundle valide.
        for (const deviceId of r.deviceIds) {
          try {
            return await SignalKeysService.getKeyBundle(
              contactUserId,
              deviceId,
            );
          } catch {
            // bundle invalide ou absent pour cet appareil, on essaie le suivant
          }
        }
        throw new Error("NO_THEIR_KEYS");
      });

    Promise.all([
      myBundlePromise,
      theirBundlePromise,
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
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message === "NO_DEVICE" || err.message === "NO_THEIR_KEYS") {
          setError(
            "Ce contact n'a pas encore de clés Signal enregistrées. Il doit se connecter au moins une fois depuis l'app.",
          );
        } else if (err.message === "NO_OWN_KEYS") {
          setError(
            "Vos clés Signal ne sont pas encore enregistrées. Reconnectez-vous.",
          );
        } else {
          setError("Impossible de calculer le Safety Number.");
        }
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

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.lockIconWrap}>
              <Ionicons
                name={alreadyVerified ? "lock-closed" : "shield-checkmark"}
                size={18}
                color={
                  alreadyVerified ? colors.ui.success : colors.primary.main
                }
              />
            </View>
            <Text style={styles.title}>Safety Number</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            testID="safety-close-btn"
          >
            <Ionicons name="close" size={20} color={colors.secondary.light} />
          </TouchableOpacity>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Comparez ce code avec{" "}
          <Text style={styles.contactName}>{contactName}</Text> (en personne ou
          par appel) pour confirmer que la conversation est bien chiffrée de
          bout en bout.
        </Text>

        {/* Loading */}
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary.main} size="large" />
            <Text style={styles.loadingText}>Calcul en cours...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.center}>
            <Ionicons
              name="warning-outline"
              size={32}
              color={colors.ui.error}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Grid 3×4 */}
        {groups.length === 12 && (
          <View style={styles.grid}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.gridRow}>
                {groups.slice(row * 4, row * 4 + 4).map((g, col) => (
                  <View
                    key={col}
                    style={[
                      styles.groupCell,
                      alreadyVerified && styles.groupCellVerified,
                    ]}
                  >
                    <Text
                      style={[
                        styles.groupText,
                        alreadyVerified && styles.groupTextVerified,
                      ]}
                    >
                      {g}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Already verified banner */}
        {alreadyVerified && (
          <View style={styles.verifiedBanner}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.ui.success}
            />
            <Text style={styles.verifiedText}>Contact vérifié</Text>
          </View>
        )}

        {/* Verify button */}
        {!alreadyVerified && !loading && !error && groups.length === 12 && (
          <TouchableOpacity onPress={handleMarkVerified} activeOpacity={0.85}>
            <LinearGradient
              colors={["#FE7A5C", "#F04882"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.verifyButton}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.verifyButtonText}>Marquer comme vérifié</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.background.dark,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: `${colors.secondary.medium}60`,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.secondary.main,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
    opacity: 0.5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lockIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${colors.secondary.medium}80`,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.light,
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.secondary.medium}60`,
    justifyContent: "center",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 13,
    color: colors.secondary.light,
    lineHeight: 19,
    marginBottom: 20,
  },
  contactName: {
    color: colors.text.light,
    fontWeight: "600",
  },
  center: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: colors.secondary.light,
    fontSize: 13,
  },
  errorText: {
    color: colors.ui.error,
    fontSize: 14,
    textAlign: "center",
  },
  grid: {
    gap: 8,
    marginBottom: 20,
  },
  gridRow: {
    flexDirection: "row",
    gap: 8,
  },
  groupCell: {
    flex: 1,
    backgroundColor: `${colors.secondary.medium}50`,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${colors.secondary.main}40`,
  },
  groupCellVerified: {
    backgroundColor: `${colors.ui.success}15`,
    borderColor: `${colors.ui.success}40`,
  },
  groupText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.light,
    letterSpacing: 1.5,
  },
  groupTextVerified: {
    color: colors.ui.success,
  },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: `${colors.ui.success}18`,
    borderWidth: 1,
    borderColor: `${colors.ui.success}30`,
    marginBottom: 4,
  },
  verifiedText: {
    color: colors.ui.success,
    fontWeight: "600",
    fontSize: 14,
  },
  verifyButton: {
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonText: {
    color: colors.text.light,
    fontWeight: "700",
    fontSize: 15,
  },
});
