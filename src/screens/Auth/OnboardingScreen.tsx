import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";

const { width: W } = Dimensions.get("window");
const ONBOARDING_KEY = "@whispr:onboarding_done";
const CORAL = "#FE7A5C";
const NAVY = "#0B1124";

type Nav = StackNavigationProp<AuthStackParamList, "Onboarding">;

const SLIDES = [
  {
    id: "1",
    title: "Chiffré de bout en bout",
    subtitle:
      "Chaque message, photo et appel. Seuls toi et ton correspondant peuvent lire ce que vous partagez.",
  },
  {
    id: "2",
    title: "Appels sécurisés",
    subtitle:
      "Audio et vidéo chiffrés en temps réel. La qualité d'un appel classique, la confidentialité en plus.",
  },
  {
    id: "3",
    title: "Protégé par l'IA",
    subtitle:
      "Modération intelligente qui détecte les abus sans jamais lire tes messages privés.",
  },
] as const;

// ─── Slide 1 : Chat bubbles + lock ──────────────────────────────────────────
function ChatEncryptSlide({ active }: { active: boolean }) {
  const b1x = useSharedValue(-80);
  const b1o = useSharedValue(0);
  const b2x = useSharedValue(80);
  const b2o = useSharedValue(0);
  const lockO = useSharedValue(0);
  const lockS = useSharedValue(0.7);
  const lineW = useSharedValue(0);

  useEffect(() => {
    if (active) {
      b1x.value = withDelay(0, withSpring(0, { stiffness: 100, damping: 14 }));
      b1o.value = withDelay(0, withTiming(1, { duration: 350 }));
      b2x.value = withDelay(
        280,
        withSpring(0, { stiffness: 100, damping: 14 }),
      );
      b2o.value = withDelay(280, withTiming(1, { duration: 350 }));
      lockO.value = withDelay(680, withTiming(1, { duration: 350 }));
      lockS.value = withDelay(
        680,
        withSpring(1, { stiffness: 200, damping: 14 }),
      );
      lineW.value = withDelay(900, withTiming(1, { duration: 400 }));
    } else {
      b1x.value = -80;
      b1o.value = 0;
      b2x.value = 80;
      b2o.value = 0;
      lockO.value = 0;
      lockS.value = 0.7;
      lineW.value = 0;
    }
  }, [active]);

  const s1 = useAnimatedStyle(() => ({
    opacity: b1o.value,
    transform: [{ translateX: b1x.value }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: b2o.value,
    transform: [{ translateX: b2x.value }],
  }));
  const sL = useAnimatedStyle(() => ({
    opacity: lockO.value,
    transform: [{ scale: lockS.value }],
  }));
  const sLine = useAnimatedStyle(() => ({ width: lineW.value * 36 }));

  return (
    <View style={styles.slideScene}>
      {/* Received bubble */}
      <Animated.View style={[styles.bubbleRow, s1]}>
        <View style={[styles.bubble, styles.bubbleReceived]}>
          <Text style={styles.bubbleText}>Salut, t'es libre ce soir ? 👋</Text>
          <Text style={styles.bubbleTick}>✓</Text>
        </View>
      </Animated.View>

      {/* Sent bubble */}
      <Animated.View style={[styles.bubbleRow, styles.bubbleRight, s2]}>
        <View style={[styles.bubble, styles.bubbleSent]}>
          <Text style={[styles.bubbleText, { color: "#fff" }]}>
            Oui ! 20h au café ? 😊
          </Text>
          <Text style={[styles.bubbleTick, { color: "rgba(255,255,255,0.7)" }]}>
            ✓✓
          </Text>
        </View>
      </Animated.View>

      {/* Lock badge */}
      <Animated.View style={[styles.lockRow, sL]}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={12} color={CORAL} />
          <Animated.View style={[styles.lockLine, sLine]} />
          <Text style={styles.lockLabel}>Chiffré E2E</Text>
          <Animated.View style={[styles.lockLine, sLine]} />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Slide 2 : Call UI ───────────────────────────────────────────────────────
function CallSlide({ active }: { active: boolean }) {
  const cardO = useSharedValue(0);
  const cardY = useSharedValue(30);
  const pulse = useSharedValue(1);
  const timerO = useSharedValue(0);

  useEffect(() => {
    if (active) {
      cardO.value = withDelay(0, withTiming(1, { duration: 500 }));
      cardY.value = withDelay(0, withSpring(0, { stiffness: 90, damping: 14 }));
      pulse.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1.12, { duration: 900 }),
            withTiming(1, { duration: 900 }),
          ),
          -1,
          true,
        ),
      );
      timerO.value = withDelay(400, withTiming(1, { duration: 400 }));
    } else {
      cardO.value = 0;
      cardY.value = 30;
      pulse.value = 1;
      timerO.value = 0;
    }
  }, [active]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardO.value,
    transform: [{ translateY: cardY.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const timerStyle = useAnimatedStyle(() => ({ opacity: timerO.value }));

  return (
    <View style={styles.slideScene}>
      <Animated.View style={cardStyle}>
        <BlurView intensity={50} tint="dark" style={styles.callCard}>
          <View style={styles.callCardInner}>
            {/* Avatar */}
            <Animated.View style={[styles.callAvatarWrap, pulseStyle]}>
              <View style={styles.callAvatarRing} />
              <LinearGradient
                colors={[CORAL, "#F96645"]}
                style={styles.callAvatar}
              >
                <Text style={styles.callAvatarInitial}>A</Text>
              </LinearGradient>
            </Animated.View>

            <Text style={styles.callName}>Alice Martin</Text>

            {/* Waveform bars */}
            <Animated.View style={[styles.waveRow, timerStyle]}>
              {[0.4, 0.8, 1, 0.6, 0.9, 0.5, 1, 0.7, 0.4, 0.8, 0.6, 1].map(
                (h, i) => (
                  <WaveBar key={i} height={h} delay={i * 60} active={active} />
                ),
              )}
            </Animated.View>

            <Animated.View style={[styles.callStatusRow, timerStyle]}>
              <View style={styles.callDot} />
              <Text style={styles.callStatus}>00:42</Text>
              <Ionicons name="lock-closed" size={11} color={CORAL} />
            </Animated.View>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

function WaveBar({
  height,
  delay,
  active,
}: {
  height: number;
  delay: number;
  active: boolean;
}) {
  const scaleY = useSharedValue(0.2);
  useEffect(() => {
    if (active) {
      scaleY.value = withDelay(
        600 + delay,
        withRepeat(
          withSequence(
            withTiming(height, { duration: 400 }),
            withTiming(0.2, { duration: 400 }),
          ),
          -1,
          true,
        ),
      );
    } else {
      scaleY.value = 0.2;
    }
  }, [active, delay, height]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));
  return <Animated.View style={[styles.waveBar, style]} />;
}

// ─── Slide 3 : AI Shield ─────────────────────────────────────────────────────
function AISlide({ active }: { active: boolean }) {
  const msgO = useSharedValue(0);
  const msgX = useSharedValue(-60);
  const shieldO = useSharedValue(0);
  const shieldS = useSharedValue(0.5);
  const badgeO = useSharedValue(0);

  useEffect(() => {
    if (active) {
      msgO.value = withDelay(0, withTiming(1, { duration: 350 }));
      msgX.value = withDelay(0, withSpring(0, { stiffness: 100, damping: 14 }));
      shieldO.value = withDelay(500, withTiming(1, { duration: 400 }));
      shieldS.value = withDelay(
        500,
        withSpring(1, { stiffness: 180, damping: 12 }),
      );
      badgeO.value = withDelay(900, withTiming(1, { duration: 400 }));
    } else {
      msgO.value = 0;
      msgX.value = -60;
      shieldO.value = 0;
      shieldS.value = 0.5;
      badgeO.value = 0;
    }
  }, [active]);

  const msgStyle = useAnimatedStyle(() => ({
    opacity: msgO.value,
    transform: [{ translateX: msgX.value }],
  }));
  const shieldStyle = useAnimatedStyle(() => ({
    opacity: shieldO.value,
    transform: [{ scale: shieldS.value }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeO.value }));

  return (
    <View style={styles.slideScene}>
      {/* Flagged message */}
      <Animated.View style={msgStyle}>
        <View style={styles.flaggedMsg}>
          <Ionicons name="warning-outline" size={14} color={CORAL} />
          <Text style={styles.flaggedText}>
            Message potentiellement inapproprié
          </Text>
        </View>
      </Animated.View>

      {/* Shield */}
      <Animated.View style={[styles.shieldWrap, shieldStyle]}>
        <View style={styles.shieldGlow} />
        <Ionicons name="shield-checkmark" size={72} color={CORAL} />
      </Animated.View>

      {/* Protected badge */}
      <Animated.View style={[styles.protectedBadge, badgeStyle]}>
        <Ionicons name="checkmark-circle" size={14} color="#6774BD" />
        <Text style={styles.protectedText}>
          Message bloqué · Utilisateur protégé
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Dot ─────────────────────────────────────────────────────────────────────
function Dot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 24 : 7);
  const bg = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    w.value = withSpring(active ? 24 : 7, { stiffness: 240, damping: 20 });
    bg.value = withTiming(active ? 1 : 0, { duration: 250 });
  }, [active]);

  const style = useAnimatedStyle(() => ({
    width: w.value,
    backgroundColor: bg.value === 1 ? CORAL : "rgba(255,255,255,0.28)",
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [current, setCurrent] = useState(0);
  const [listHeight, setListHeight] = useState(0);

  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) setCurrent(viewableItems[0].index);
    },
    [],
  );

  const markDone = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    navigation.replace("Welcome");
  }, [navigation]);

  const goNext = useCallback(() => {
    if (current < SLIDES.length - 1) {
      // Sur web onViewableItemsChanged ne fire pas fiablement avec
      // pagingEnabled, donc le current restait bloque a 0 et le clic
      // suivant recalculait le meme offset. On met a jour current direct.
      const next = current + 1;
      setCurrent(next);
      flatRef.current?.scrollToOffset({
        offset: next * W,
        animated: true,
      });
    } else {
      void markDone();
    }
  }, [current, markDone]);

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0B1124", "#3C2E7C", "#FE7A5C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 18) }]}>
        <TouchableOpacity
          onPress={() => void markDone()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <Text style={styles.skip}>Passer</Text>
        </TouchableOpacity>
      </View>

      {/* Slide scenes */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        style={styles.list}
        onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
        renderItem={({ index }) => (
          <View
            style={{
              width: W,
              height: listHeight > 0 ? listHeight : undefined,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {index === 0 && <ChatEncryptSlide active={current === 0} />}
            {index === 1 && <CallSlide active={current === 1} />}
            {index === 2 && <AISlide active={current === 2} />}
          </View>
        )}
      />

      {/* Bottom glass panel */}
      <BlurView intensity={40} tint="dark" style={styles.panelBlur}>
        <View
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 30) }]}
        >
          <View style={styles.textBlock}>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
          </View>

          <View style={styles.controls}>
            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => (
                <Dot key={i} active={i === current} />
              ))}
            </View>
            <TouchableOpacity
              onPress={goNext}
              activeOpacity={0.85}
              style={styles.ctaBtn}
            >
              <LinearGradient
                colors={["#FE7A5C", "#F96645"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGrad}
              >
                <Text style={styles.ctaText}>
                  {isLast ? "Commencer" : "Suivant"}
                </Text>
                <Ionicons
                  name={isLast ? "checkmark-circle" : "arrow-forward-circle"}
                  size={20}
                  color="#fff"
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    alignItems: "flex-end",
    paddingHorizontal: 26,
    paddingBottom: 8,
    zIndex: 10,
  },
  skip: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  list: { flex: 1 },

  // ── Scene wrapper ──────────────────────────────────────
  slideScene: {
    width: W * 0.86,
    alignItems: "center",
    gap: 14,
  },

  // ── Chat bubbles ───────────────────────────────────────
  bubbleRow: {
    width: "100%",
    alignItems: "flex-start",
  },
  bubbleRight: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  bubbleReceived: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderBottomLeftRadius: 4,
  },
  bubbleSent: {
    backgroundColor: CORAL,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  bubbleTick: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 1,
  },
  lockRow: {
    marginTop: 4,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: "rgba(11,17,36,0.70)",
    borderWidth: 1,
    borderColor: "rgba(254,122,92,0.40)",
  },
  lockLine: {
    height: 1,
    backgroundColor: "rgba(254,122,92,0.50)",
  },
  lockLabel: {
    color: CORAL,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },

  // ── Call UI ────────────────────────────────────────────
  callCard: {
    borderRadius: 32,
    overflow: "hidden",
    width: W * 0.72,
  },
  callCardInner: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 14,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(11,17,36,0.45)",
  },
  callAvatarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  callAvatarRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(254,122,92,0.35)",
  },
  callAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  callAvatarInitial: {
    color: "#fff",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  callName: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 32,
  },
  waveBar: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: CORAL,
    opacity: 0.85,
  },
  callStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  callDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
  },
  callStatus: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // ── AI shield ──────────────────────────────────────────
  flaggedMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(254,122,92,0.12)",
    borderWidth: 1,
    borderColor: "rgba(254,122,92,0.28)",
  },
  flaggedText: {
    color: CORAL,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  shieldWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  shieldGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(254,122,92,0.18)",
  },
  protectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: "rgba(103,116,189,0.15)",
    borderWidth: 1,
    borderColor: "rgba(103,116,189,0.32)",
  },
  protectedText: {
    color: "#6774BD",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  // ── Bottom panel ───────────────────────────────────────
  panelBlur: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: "hidden",
  },
  panel: {
    paddingTop: 26,
    paddingHorizontal: 26,
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(11,17,36,0.5)",
  },
  textBlock: { gap: 6 },
  title: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  subtitle: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { height: 7, borderRadius: 4 },
  ctaBtn: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: CORAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  ctaGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  ctaText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

export default OnboardingScreen;
