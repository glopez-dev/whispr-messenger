import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSpotlightTour } from "react-native-spotlight-tour";
import type { RenderProps } from "react-native-spotlight-tour";
import { colors } from "../../theme/colors";

const CORAL = colors.primary.main;
const NAVY = "#0B1124";

interface TourTooltipProps extends RenderProps {
  title: string;
  description: string;
  total: number;
}

export const TourTooltip: React.FC<TourTooltipProps> = ({
  title,
  description,
  current,
  isLast,
  next,
  total,
}) => {
  const { stop } = useSpotlightTour();

  const handleSkip = () => {
    stop();
  };

  const handleNext = () => {
    if (isLast) {
      stop();
    } else {
      next();
    }
  };

  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 60 : 80}
      tint="dark"
      style={styles.blur}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Ionicons name="compass-outline" size={13} color={CORAL} />
            <Text style={styles.badgeText}>Tour guidé</Text>
          </View>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {current + 1} / {total}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.divider} />

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
            <Text style={styles.nextText}>
              {isLast ? "Terminer" : "Suivant"}
            </Text>
            {!isLast && (
              <Ionicons
                name="arrow-forward"
                size={14}
                color={NAVY}
                style={{ marginLeft: 4 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  blur: {
    borderRadius: 20,
    overflow: "hidden",
    minWidth: 260,
    maxWidth: 300,
    borderWidth: 1,
    borderColor: "rgba(254,122,92,0.40)",
  },
  container: {
    padding: 18,
    backgroundColor: "rgba(26,14,60,0.88)",
    borderRadius: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(254,122,92,0.12)",
    borderWidth: 1,
    borderColor: "rgba(254,122,92,0.28)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgeText: {
    color: CORAL,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  counter: {
    backgroundColor: "rgba(103,116,189,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(103,116,189,0.35)",
  },
  counterText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  description: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(103,116,189,0.30)",
    marginVertical: 14,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CORAL,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 99,
  },
  nextText: {
    color: NAVY,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
