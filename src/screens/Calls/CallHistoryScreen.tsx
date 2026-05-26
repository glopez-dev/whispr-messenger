/**
 * @danger-zone-mobile-layout
 *
 * DANGER ZONE - Layout web/iOS critique
 *
 * Bug historique : scroll bottom inaccessible sur Safari iOS PWA si la chaine flex
 * ne porte pas le pattern WHISPR-1254 (height:100% + minHeight:0 web).
 *
 * AVANT TOUTE MODIF :
 * 1. Tester live sur Safari iOS PWA (whispr-preprod.roadmvn.com).
 * 2. Verifier scroll vers le bas + boutons visibles + retour fonctionnel.
 * 3. Preserver les Platform.OS === 'web' ? minHeight:0 sur containers/scroll.
 *
 * Tickets historiques : WHISPR-1254, WHISPR-1291, WHISPR-1313, WHISPR-1335, WHISPR-1548
 *
 * Tag parsable : @danger-zone-mobile-layout (utilise par script CI grep pour detection).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AttachStep,
  SpotlightTourProvider,
  type TourStep,
} from "react-native-spotlight-tour";
import { Ionicons } from "@expo/vector-icons";
import { TourAutoStart } from "../../components/Tour/TourAutoStart";
import { TourTooltip } from "../../components/Tour/TourTooltip";
import { Avatar } from "../../components/Chat/Avatar";
import { FLOATING_TAB_BAR_RESERVED_SPACE } from "../../components/Navigation/floatingTabBarLayout";
import { callsApi } from "../../services/calls/callsApi";
import { messagingAPI } from "../../services/messaging/api";
import { TokenService } from "../../services/TokenService";
import { colors, withOpacity } from "../../theme/colors";
import type { Call, CallStatus } from "../../types/calls";
import type { Conversation } from "../../types/messaging";
import { formatUsername, getConversationDisplayName } from "../../utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnrichedCallHistoryItem extends Call {
  title: string;
  subtitle?: string;
  avatarUrl?: string;
}

type ConversationMemberPreview = {
  id: string;
  display_name: string;
  username?: string;
  avatar_url?: string;
};

type FilterTab = "all" | "missed";

interface SectionData {
  title: string;
  data: EnrichedCallHistoryItem[];
}

// ---------------------------------------------------------------------------
// Tour steps
// ---------------------------------------------------------------------------

const CALLS_STEPS_COUNT = 1;

const CALLS_TOUR_STEPS: TourStep[] = [
  {
    placement: "bottom",
    offset: 10,
    render: (props) => (
      <TourTooltip
        {...props}
        title="Historique d'appels"
        description="Retrouve ici tous tes appels audio et vidéo. Filtre par manqués ou lance un nouvel appel."
        total={CALLS_STEPS_COUNT}
      />
    ),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}min ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function formatCallTime(date: string): string {
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Retourne le jour normalisé (minuit) pour comparaison.
 */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Retourne le libellé de section de date :
 * - Aujourd'hui
 * - Hier
 * - Cette semaine : "Mardi 21 mai" (weekday + jour + mois court)
 * - Plus ancien : "Avril 2026" (mois long + année)
 */
function getSectionLabel(date: string): string {
  const target = new Date(date);
  const now = new Date();
  const diffDays = Math.round((dayStart(now) - dayStart(target)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) {
    // ex: "Mardi 21 mai"
    const weekday = target.toLocaleDateString("fr-FR", { weekday: "long" });
    const day = target.getDate();
    const month = target.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} ${month}`;
  }
  // ex: "Avril 2026"
  const monthLong = target.toLocaleDateString("fr-FR", { month: "long" });
  return `${monthLong.charAt(0).toUpperCase()}${monthLong.slice(1)} ${target.getFullYear()}`;
}

/**
 * Retourne la partie "jour" à insérer dans le sous-texte selon le contexte temporel :
 * - Aujourd'hui : rien (juste l'heure)
 * - Hier : "hier"
 * - Cette semaine : weekday court ex "mar."
 * - Plus ancien : "26 avr."
 */
function formatCallDayContext(date: string): string | null {
  const target = new Date(date);
  const now = new Date();
  const diffDays = Math.round((dayStart(now) - dayStart(target)) / 86400000);
  if (diffDays === 0) return null;
  if (diffDays === 1) return "hier";
  if (diffDays < 7) {
    // ex: "mardi"
    return target.toLocaleDateString("fr-FR", { weekday: "long" });
  }
  // ex: "26 avr."
  const day = target.getDate();
  const month = target.toLocaleDateString("fr-FR", { month: "short" });
  return `${day} ${month}`;
}

/**
 * Texte secondaire sous le nom avec le jour contextuel :
 * - Aujourd'hui : "12s · 14:30" / "Manqué · 14:30"
 * - Hier : "12s · hier 14:30" / "Manqué · hier 14:30"
 * - Cette semaine : "12s · mardi 14:30"
 * - Plus ancien : "12s · 26 avr. 14:30"
 */
function buildCallSubtext(item: EnrichedCallHistoryItem): string {
  const time = formatCallTime(item.started_at);
  const dayCtx = formatCallDayContext(item.started_at);
  const timeWithDay = dayCtx ? `${dayCtx} ${time}` : time;

  if (item.status === "missed" || item.status === "declined") {
    return `Manqué · ${timeWithDay}`;
  }
  if (item.status === "failed") {
    return `Échec · ${timeWithDay}`;
  }
  const dur =
    item.duration_seconds != null
      ? formatDuration(item.duration_seconds)
      : null;
  return dur ? `${dur} · ${timeWithDay}` : timeWithDay;
}

function groupByDate(calls: EnrichedCallHistoryItem[]): SectionData[] {
  // Conserver l'ordre d'insertion (appels déjà triés du plus récent au plus ancien)
  const map = new Map<string, EnrichedCallHistoryItem[]>();
  for (const call of calls) {
    const label = getSectionLabel(call.started_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(call);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function isMissed(status: CallStatus): boolean {
  return status === "missed" || status === "declined" || status === "failed";
}

// ---------------------------------------------------------------------------
// Data enrichment (unchanged logic, extracted for clarity)
// ---------------------------------------------------------------------------

async function getCurrentUserId(): Promise<string | null> {
  const token = await TokenService.getAccessToken();
  if (!token) return null;
  return TokenService.decodeAccessToken(token)?.sub ?? null;
}

function resolveConversationAvatar(
  conversation: Conversation,
  members: ConversationMemberPreview[],
  currentUserId: string | null,
): string | undefined {
  if (conversation.type === "direct") {
    const other = members.find((m) => m.id && m.id !== currentUserId);
    return other?.avatar_url || conversation.avatar_url;
  }
  const meta = (conversation.metadata ?? {}) as Record<string, unknown>;
  return (
    conversation.avatar_url ||
    (meta.avatar_url as string | undefined) ||
    (meta.group_avatar_url as string | undefined) ||
    (meta.group_icon_url as string | undefined) ||
    (meta.icon_url as string | undefined) ||
    (meta.photo_url as string | undefined) ||
    (meta.picture_url as string | undefined) ||
    (meta.image_url as string | undefined)
  );
}

async function enrichCallsForDisplay(
  calls: Call[],
): Promise<EnrichedCallHistoryItem[]> {
  const currentUserId = await getCurrentUserId();
  const conversationIds = Array.from(
    new Set(calls.map((c) => c.conversation_id).filter(Boolean)),
  );
  const conversationMap = new Map<
    string,
    { conversation: Conversation | null; members: ConversationMemberPreview[] }
  >();

  await Promise.all(
    conversationIds.map(async (cid) => {
      try {
        const conversation = await messagingAPI.getConversation(cid);
        const members = await messagingAPI
          .getConversationMembers(cid)
          .catch(() => []);
        conversationMap.set(cid, { conversation, members });
      } catch {
        conversationMap.set(cid, { conversation: null, members: [] });
      }
    }),
  );

  return calls.map((call) => {
    const preview = conversationMap.get(call.conversation_id);
    const conversation = preview?.conversation;
    const members = preview?.members ?? [];

    if (!conversation) {
      return {
        ...call,
        title: call.type === "video" ? "Appel vidéo" : "Appel audio",
        subtitle: "Conversation indisponible",
      };
    }

    if (conversation.type === "group") {
      return {
        ...call,
        title: getConversationDisplayName(conversation),
        subtitle: "Groupe",
        avatarUrl: resolveConversationAvatar(
          conversation,
          members,
          currentUserId,
        ),
      };
    }

    const otherMember =
      members.find((m) => m.id && m.id !== currentUserId) ?? members[0];
    const username = formatUsername(
      otherMember?.username ??
        conversation.username ??
        conversation.metadata?.username,
    );
    const title = getConversationDisplayName({
      type: "direct",
      display_name: otherMember?.display_name ?? conversation.display_name,
      username: otherMember?.username ?? conversation.username,
      phone_number: conversation.phone_number,
      metadata: conversation.metadata,
    });

    return {
      ...call,
      title,
      subtitle: username && username !== title ? username : undefined,
      avatarUrl:
        otherMember?.avatar_url ||
        resolveConversationAvatar(conversation, members, currentUserId),
    };
  });
}

// ---------------------------------------------------------------------------
// CallRow — ligne compacte Signal/WhatsApp
// ---------------------------------------------------------------------------

const CallRow: React.FC<{ item: EnrichedCallHistoryItem }> = ({ item }) => {
  const missed = isMissed(item.status);
  const subtext = buildCallSubtext(item);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        // TODO : intégrer callsStore.initiate quand un écran de sélection sera dispo
      }}
      onLongPress={() => {
        // options : rappeler, supprimer…
      }}
      accessibilityLabel={`${item.title} - ${subtext}`}
      accessibilityRole="button"
    >
      {/* Avatar */}
      <View style={styles.avatarWrap} accessibilityElementsHidden>
        <Avatar uri={item.avatarUrl} name={item.title} size={40} />
      </View>

      {/* Corps */}
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowName, missed && styles.rowNameMissed]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <View style={styles.subtextRow}>
          <Ionicons
            name={
              missed
                ? "arrow-down-outline"
                : item.type === "video"
                  ? "videocam-outline"
                  : "call-outline"
            }
            size={13}
            color={
              missed ? colors.ui.error : withOpacity(colors.text.light, 0.55)
            }
            style={styles.subtextIcon}
          />
          <Text
            style={[styles.rowSubtext, missed && styles.rowSubtextMissed]}
            numberOfLines={1}
          >
            {subtext}
          </Text>
        </View>
      </View>

      {/* Icône type appel à droite (touch target >= 44px) */}
      <Pressable
        style={styles.callTypeBtn}
        onPress={() => {
          // rappel direct
        }}
        accessibilityLabel={`Rappeler ${item.title} en ${item.type === "video" ? "vidéo" : "audio"}`}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={item.type === "video" ? "videocam-outline" : "call-outline"}
          size={20}
          color={colors.primary.main}
        />
      </Pressable>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export const CallHistoryScreen: React.FC = () => {
  const [calls, setCalls] = useState<EnrichedCallHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callsApi.list({ limit: 50 });
      setCalls(await enrichCallsForDisplay(r.data));
    } catch (err) {
      console.error("Failed to load call history", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filter === "missed" ? calls.filter((c) => isMissed(c.status)) : calls,
    [calls, filter],
  );

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <SpotlightTourProvider
      steps={CALLS_TOUR_STEPS}
      overlayColor="#0B1124"
      overlayOpacity={0.82}
      placement="bottom"
      offset={10}
    >
      {() => (
        <View
          style={[
            styles.container,
            Platform.OS === "web" ? { minHeight: 0 } : {},
          ]}
        >
          <TourAutoStart />

          {/* Header */}
          <AttachStep index={0} fill={Platform.OS !== "web"}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Appels</Text>
              <Pressable
                style={styles.newCallBtn}
                onPress={() => {
                  // TODO : ouvrir sélecteur de contact
                }}
                accessibilityLabel="Nouvel appel"
                accessibilityRole="button"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons name="add" size={24} color={colors.text.light} />
              </Pressable>
            </View>
          </AttachStep>

          {/* Filtres tabs */}
          <View style={styles.filterRow}>
            <Pressable
              style={[
                styles.filterTab,
                filter === "all" && styles.filterTabActive,
              ]}
              onPress={() => setFilter("all")}
              accessibilityLabel="Tous les appels"
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === "all" }}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === "all" && styles.filterTabTextActive,
                ]}
              >
                Tous
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.filterTab,
                filter === "missed" && styles.filterTabActive,
              ]}
              onPress={() => setFilter("missed")}
              accessibilityLabel="Appels manqués"
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === "missed" }}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === "missed" && styles.filterTabTextActive,
                ]}
              >
                Manqués
              </Text>
            </Pressable>
          </View>

          {/* Liste groupée par date */}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={load}
                tintColor={colors.text.light}
              />
            }
            style={[styles.list, Platform.OS === "web" ? { minHeight: 0 } : {}]}
            contentContainerStyle={{
              paddingBottom:
                insets.bottom + FLOATING_TAB_BAR_RESERVED_SPACE + 16,
            }}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader}>{section.title}</Text>
            )}
            renderItem={({ item }) => <CallRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name="call-outline"
                    size={28}
                    color={withOpacity(colors.text.light, 0.55)}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {filter === "missed"
                    ? "Aucun appel manqué"
                    : "Aucun appel pour le moment"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {filter === "missed"
                    ? "Tous tes appels ont eu une réponse."
                    : "Tes appels audio et vidéo apparaîtront ici."}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </SpotlightTourProvider>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.text.light,
  },
  newCallBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: withOpacity(colors.primary.main, 0.18),
  },

  // Filtres
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: withOpacity(colors.text.light, 0.08),
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: colors.primary.main,
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: withOpacity(colors.text.light, 0.65),
  },
  filterTabTextActive: {
    color: colors.text.light,
  },

  // Liste
  list: {
    flex: 1,
  },

  // Section headers
  sectionHeader: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: withOpacity(colors.text.light, 0.55),
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Ligne d'appel
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 64,
  },
  rowPressed: {
    backgroundColor: withOpacity(colors.text.light, 0.06),
  },
  avatarWrap: {
    marginRight: 14,
  },
  rowBody: {
    flex: 1,
    justifyContent: "center",
  },
  rowName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: colors.text.light,
  },
  rowNameMissed: {
    color: "#FF6B6B",
  },
  subtextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  subtextIcon: {
    marginRight: 4,
  },
  rowSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: withOpacity(colors.text.light, 0.55),
  },
  rowSubtextMissed: {
    color: "#FF9090",
  },
  callTypeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // Séparateur
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74, // aligner avec le texte (20px padding + 40px avatar + 14px gap)
    backgroundColor: withOpacity(colors.text.light, 0.08),
  },

  // État vide
  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withOpacity(colors.text.light, 0.07),
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: colors.text.light,
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: withOpacity(colors.text.light, 0.6),
    textAlign: "center",
    lineHeight: 20,
  },
});

export default CallHistoryScreen;
