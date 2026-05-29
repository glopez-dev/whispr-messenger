import { useState, useEffect } from "react";
import { E2EEService } from "@/services/E2EEService";
import { logger } from "@/utils/logger";

/**
 * useE2EEMedia - Hook to decrypt media content on the fly
 */
export function useE2EEMedia(
  uri: string | undefined,
  e2ee: { key: string; nonce: string } | undefined,
) {
  const [decryptedUri, setDecryptedUri] = useState<string | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uri || !e2ee) {
      setDecryptedUri(uri);
      return;
    }

    let isMounted = true;
    setLoading(true);

    void (async () => {
      try {
        const decrypted = await E2EEService.decryptMediaFile(
          uri,
          e2ee.key,
          e2ee.nonce,
        );
        if (isMounted) {
          setDecryptedUri(decrypted);
          setLoading(false);
        }
      } catch (err) {
        logger.error("useE2EEMedia", "Failed to decrypt media", err);
        if (isMounted) {
          setError("DECRYPT_FAILED");
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      // We should probably delete the temporary decrypted file here,
      // but it might be used by the component that is still unmounting.
    };
  }, [uri, e2ee?.key, e2ee?.nonce]);

  return { decryptedUri, loading, error };
}
