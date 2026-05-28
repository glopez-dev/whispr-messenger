import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  DeviceManagerService,
  SignalKeysService,
  type DeviceInfo,
} from "../../../services/SecurityService";
import { logger } from "../../../utils/logger";

export interface ConnectedDevice {
  id: string;
  name: string;
  type: "mobile" | "tablet" | "desktop" | "web";
  lastActive: string;
  location?: string;
  isCurrent: boolean;
  securityCode?: string;
}

export interface SecurityKey {
  id: string;
  deviceId: string;
  deviceName: string;
  fingerprint: string;
  verified: boolean;
}

function formatFingerprint(hex: string): string {
  const truncated = hex.slice(0, 32);
  return truncated.match(/.{1,4}/g)?.join(" ") ?? hex;
}

function mapPlatformToType(platform?: string): ConnectedDevice["type"] {
  const p = platform?.toLowerCase() ?? "";
  if (p === "ios" || p === "android") return "mobile";
  if (p === "web") return "web";
  if (p === "tablet") return "tablet";
  if (p === "desktop" || p === "macos" || p === "windows" || p === "linux")
    return "desktop";
  return "mobile";
}

export interface UseDeviceKeysOptions {
  userId: string | null;
  currentDeviceId: string | null;
  /** Locale-aware "minutes/hours/days ago" formatter — kept in the screen
   * so it can read the active language from useTheme(). */
  formatLastActive: (isoString: string) => string;
  /** Fired when the API call fails. The screen wires this to its toast. */
  onLoadError: () => void;
}

export interface UseDeviceKeysReturn {
  devices: ConnectedDevice[];
  setDevices: React.Dispatch<React.SetStateAction<ConnectedDevice[]>>;
  loadingDevices: boolean;
  setLoadingDevices: React.Dispatch<React.SetStateAction<boolean>>;
  securityKeys: SecurityKey[];
  setSecurityKeys: React.Dispatch<React.SetStateAction<SecurityKey[]>>;
}

export function useDeviceKeys({
  userId,
  currentDeviceId,
  formatLastActive,
  onLoadError,
}: UseDeviceKeysOptions): UseDeviceKeysReturn {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [securityKeys, setSecurityKeys] = useState<SecurityKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    DeviceManagerService.listDevices()
      .then(async (apiDevices: DeviceInfo[]) => {
        if (cancelled) return;
        const mapped: ConnectedDevice[] = apiDevices.map((d) => ({
          id: d.id,
          name: d.deviceName,
          type: mapPlatformToType(d.deviceType),
          lastActive: formatLastActive(d.lastActive?.toString() ?? ""),
          isCurrent: d.id === currentDeviceId,
        }));
        setDevices(mapped);

        const keys: SecurityKey[] = await Promise.all(
          mapped.map(async (d, i) => {
            let fingerprint = "—";
            if (userId) {
              try {
                const bundle = await SignalKeysService.getKeyBundle(
                  userId,
                  d.id,
                );
                const raw = await Crypto.digestStringAsync(
                  Crypto.CryptoDigestAlgorithm.SHA256,
                  bundle.identity_key + d.id,
                );
                fingerprint = formatFingerprint(raw);
              } catch {
                // keep "—" if bundle unavailable
              }
            }
            return {
              id: String(i + 1),
              deviceId: d.id,
              deviceName: d.name,
              fingerprint,
              verified: d.isCurrent,
            };
          }),
        );
        if (cancelled) return;
        setSecurityKeys(keys);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn("SecurityKeysScreen", "load devices/keys failed", err);
        onLoadError();
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingDevices(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentDeviceId]);

  return {
    devices,
    setDevices,
    loadingDevices,
    setLoadingDevices,
    securityKeys,
    setSecurityKeys,
  };
}
