import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme/colors";

export interface ChatBackgroundLayerProps {
  hasCustomBackground: boolean;
  customBackgroundUri: string | null;
  customBackgroundVersion: number;
}

export function ChatBackgroundLayer({
  hasCustomBackground,
  customBackgroundUri,
  customBackgroundVersion,
}: ChatBackgroundLayerProps) {
  return (
    <>
      {hasCustomBackground && customBackgroundUri ? (
        <ImageBackground
          key={`${customBackgroundUri}:${customBackgroundVersion}`}
          source={{ uri: customBackgroundUri }}
          resizeMode="cover"
          style={styles.customBackground}
        />
      ) : null}
      {!hasCustomBackground ? (
        <LinearGradient
          colors={colors.background.gradient.app}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.backgroundScrim,
          hasCustomBackground
            ? styles.backgroundScrimWithCustomImage
            : styles.backgroundScrimDefault,
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  customBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background.dark,
  },
  backgroundScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundScrimDefault: {
    backgroundColor: "rgba(3, 8, 27, 0.18)",
  },
  backgroundScrimWithCustomImage: {
    backgroundColor: "rgba(5, 8, 22, 0.62)",
  },
});
