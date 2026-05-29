import { AppState, type AppStateStatus } from "react-native";
import { SignalKeyService } from "@/services/SignalKeyService";
import { SignalKeysService } from "@/services/SecurityService";
import { TokenService } from "@/services/TokenService";
import { logger } from "@/utils/logger";

// WHISPR-1399 - les pre-keys one-time s epuisent au fil des nouvelles
// sessions E2EE. Sans renouvellement, forward secrecy degradee silencieusement.
// Le serveur expose needs_replenishment via /signal/health, on doit le
// consommer cote client : ici au foreground resume, throttle pour eviter
// de spammer le backend a chaque switch d app.
const MIN_INTERVAL_MS = 60_000;
let lastCheckAt = 0;
let inFlight: Promise<void> | null = null;

async function uploadFreshPreKeyBundle(): Promise<void> {
  const bundle = await SignalKeyService.generateKeyBundle();
  await SignalKeysService.uploadSignedPrekey({
    key_id: bundle.signedPreKey.keyId,
    public_key: bundle.signedPreKey.publicKey,
    signature: bundle.signedPreKey.signature,
  });
  await SignalKeysService.uploadPrekeys(
    bundle.preKeys.map((pk) => ({
      key_id: pk.keyId,
      public_key: pk.publicKey,
    })),
  );
}

export async function replenishPreKeysIfNeeded(): Promise<boolean> {
  // pas de session = rien a faire
  const token = await TokenService.getAccessToken().catch(() => null);
  if (!token) return false;

  const payload = TokenService.decodeAccessToken(token);
  if (!payload?.sub || !payload?.deviceId) return false;

  if (inFlight) {
    await inFlight;
    return false;
  }

  const now = Date.now();
  if (now - lastCheckAt < MIN_INTERVAL_MS) return false;
  lastCheckAt = now;

  inFlight = (async () => {
    try {
      // WHISPR-1456 : Check if we have an identity key locally first.
      // If not, we definitely need to initialize.
      const hasLocalIdentity = await TokenService.getIdentityPrivateKey();

      const health = await SignalKeysService.getDeviceHealth(
        payload.sub,
        payload.deviceId,
      );

      if (!health.needs_replenishment && hasLocalIdentity) return;

      logger.info(
        "signalKeyReplenisher",
        hasLocalIdentity
          ? `replenishing pre-keys (remaining=${health.prekeys_remaining})`
          : "initializing E2EE keys for this device",
      );
      await uploadFreshPreKeyBundle();
    } catch (err) {
      // If the device health check fails (e.g. 404), it might mean the device
      // is not registered yet. We should try to upload keys anyway.
      const apiErr = err as { status?: number };
      if (apiErr?.status === 404) {
        logger.info(
          "signalKeyReplenisher",
          "device not registered for Signal, initializing...",
        );
        try {
          await uploadFreshPreKeyBundle();
          return;
        } catch (initErr) {
          logger.warn("signalKeyReplenisher", "initialization failed", initErr);
        }
      }

      logger.warn(
        "signalKeyReplenisher",
        "replenish failed (non-blocking)",
        err,
      );
    } finally {
      inFlight = null;
    }
  })();

  await inFlight;
  return true;
}

export function startSignalKeyReplenisher(): () => void {
  // check au boot une premiere fois (foreground deja actif)
  if (AppState.currentState === "active") {
    replenishPreKeysIfNeeded().catch(() => {});
  }
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      replenishPreKeysIfNeeded().catch(() => {});
    }
  });
  return () => sub.remove();
}

// expose pour les tests
export const __testing = {
  reset: () => {
    lastCheckAt = 0;
    inFlight = null;
  },
};
