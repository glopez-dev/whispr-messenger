import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../theme/colors";

export interface NotContactBannerProps {
  onAddContact: () => void;
  busy: boolean;
}

export function NotContactBanner({
  onAddContact,
  busy,
}: NotContactBannerProps) {
  return (
    <View style={styles.notContactBanner}>
      <Ionicons
        name="information-circle-outline"
        size={16}
        color={colors.text.light}
        style={styles.icon}
      />
      <Text style={styles.notContactBannerText} numberOfLines={1}>
        Cette personne n'est pas dans vos contacts
      </Text>
      <TouchableOpacity
        onPress={onAddContact}
        disabled={busy}
        style={styles.notContactBannerButton}
      >
        {busy ? (
          // wrapper pour annoncer l'etat busy au screen reader
          <View
            accessibilityState={{ busy: true }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator size="small" color={colors.text.light} />
          </View>
        ) : (
          <Text style={styles.notContactBannerButtonText}>Ajouter</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    marginRight: 6,
  },
  notContactBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 8,
  },
  notContactBannerText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 13,
  },
  notContactBannerButton: {
    backgroundColor: colors.primary.main,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 8,
  },
  notContactBannerButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
