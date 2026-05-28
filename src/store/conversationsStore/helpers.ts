import { Conversation } from "../../types/messaging";
import { messagingAPI } from "../../services/messaging/api";
import { TokenService } from "../../services/TokenService";
import { logger } from "../../utils/logger";

// Short grace period: absorbs transient empty fetches (e.g. first WS payload
// arriving just after an HTTP fetch returns []) without flashing an empty UI.
export const EMPTY_STATE_GRACE_PERIOD_MS = 2_000;

/**
 * Valeurs sentinelles que le messaging-service injecte quand la resolution du
 * profil echoue cote backend. Ces valeurs NE doivent PAS bloquer l enrichment
 * cote frontend - elles doivent etre traitees comme "absent" dans les gardes
 * early-return de enrichSingleConversation et enrichWithDisplayNames.
 * cf WHISPR-1426 : "Utilisateur" faux positif bloque l early-return.
 */
const SENTINEL_DISPLAY_NAMES = new Set(["Utilisateur", "User"]);

export function isEnrichedDisplayName(
  value: string | undefined | null,
): boolean {
  if (!value) return false;
  return !SENTINEL_DISPLAY_NAMES.has(value.trim());
}

export const MANUALLY_UNREAD_KEY = "@whispr/manually_unread_ids";

const RECENT_MESSAGE_IDS_MAX = 50;
const recentMessageIdsByConversation = new Map<string, string[]>();

export function wasMessageSeen(
  conversationId: string,
  messageId: string,
): boolean {
  if (!conversationId || !messageId) return false;
  const list = recentMessageIdsByConversation.get(conversationId) ?? [];
  if (list.includes(messageId)) return true;
  const next = [messageId, ...list];
  recentMessageIdsByConversation.set(
    conversationId,
    next.slice(0, RECENT_MESSAGE_IDS_MAX),
  );
  return false;
}

export async function getCurrentUserId(): Promise<string | null> {
  const token = await TokenService.getAccessToken();
  if (!token) return null;
  const payload = TokenService.decodeAccessToken(token);
  return payload?.sub ?? null;
}

export async function enrichSingleConversation(
  conv: Conversation,
  currentUserId: string,
): Promise<Conversation> {
  if (
    conv.type !== "direct" ||
    (isEnrichedDisplayName(conv.display_name) && conv.avatar_url)
  ) {
    return conv;
  }

  try {
    let memberIds = conv.member_user_ids;

    // If member IDs are not available from the list, fetch conversation detail
    if (!memberIds || memberIds.length === 0) {
      const detail = await messagingAPI.getConversation(conv.id);
      if (detail?.members) {
        memberIds = detail.members.map(
          (m: { user_id?: string; userId?: string }) =>
            (m.user_id || m.userId) as string,
        );
      } else if (detail?.member_user_ids) {
        memberIds = detail.member_user_ids;
      }
    }

    if (!memberIds || memberIds.length === 0) {
      logger.warn("enrich", `No members found for conversation ${conv.id}`);
      return conv;
    }

    const otherUserId = memberIds.find((id: string) => id !== currentUserId);

    if (!otherUserId) {
      logger.warn("enrich", `No other user found in conversation ${conv.id}`);
      return conv;
    }

    const userInfo = await messagingAPI.getUserInfo(otherUserId);
    // fallback chain robuste pour eviter "Utilisateur" affiche en clair
    // quand le profil est masque par privacy CONTACTS (display_name vide
    // mais username ou phone_number_masked presents) cf WHISPR-1423
    const userInfoAny = userInfo as {
      display_name?: string;
      username?: string;
      avatar_url?: string;
      phone_number_masked?: string;
    } | null;
    const userPhoneMasked = userInfoAny?.phone_number_masked;
    if (userInfoAny?.display_name || userInfoAny?.username || userPhoneMasked) {
      return {
        ...conv,
        display_name: userInfoAny?.display_name || conv.display_name,
        username: userInfoAny?.username ?? conv.username,
        phone_number: userPhoneMasked ?? conv.phone_number,
        avatar_url: userInfoAny?.avatar_url || conv.avatar_url,
        member_user_ids: memberIds,
      };
    }

    logger.warn(
      "enrich",
      `getUserInfo returned no display_name for ${otherUserId}`,
    );
    return { ...conv, member_user_ids: memberIds };
  } catch (err) {
    logger.warn("enrich", `Failed for conversation ${conv.id}`, err);
    return conv;
  }
}

export async function enrichWithDisplayNames(
  conversations: Conversation[],
  currentUserId: string,
): Promise<Conversation[]> {
  // WHISPR-1357 : pre-warming du cache profils via 1 seul batch /profiles/batch
  // au lieu de N fetchs unitaires. enrichSingleConversation continue d'utiliser
  // getUserInfo pour le fallback (member_user_ids absents qui forcent un
  // getConversation), mais l'appel reseau retourne en cache hit.
  const otherIdsToWarmup = new Set<string>();
  for (const conv of conversations) {
    if (conv.type !== "direct") continue;
    if (isEnrichedDisplayName(conv.display_name) && conv.avatar_url) continue;
    const memberIds = conv.member_user_ids;
    if (!memberIds || memberIds.length === 0) continue;
    const other = memberIds.find((id: string) => id && id !== currentUserId);
    if (other) otherIdsToWarmup.add(other);
  }

  if (otherIdsToWarmup.size > 0) {
    try {
      await messagingAPI.getUsersInfoBatch(Array.from(otherIdsToWarmup));
    } catch (err) {
      // batch en best-effort : si echec, enrichSingleConversation fallback
      // sur les fetchs unitaires existants.
      logger.warn("enrich", "Batch profile warmup failed", err);
    }
  }

  const results = await Promise.all(
    conversations.map((conv) => enrichSingleConversation(conv, currentUserId)),
  );
  return results;
}
