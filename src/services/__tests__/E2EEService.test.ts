import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import { E2EEService, __testing } from "../E2EEService";
import { TokenService } from "../TokenService";
import { SignalKeysService } from "../SecurityService";

jest.mock("../TokenService", () => ({
  TokenService: {
    getIdentityPrivateKey: jest.fn(),
    getAccessToken: jest.fn(),
    decodeAccessToken: jest.fn(),
  },
}));

jest.mock("../SecurityService", () => ({
  SignalKeysService: {
    listDevices: jest.fn(),
    getKeyBundle: jest.fn(),
  },
}));

const SELF_USER_ID = "11111111-1111-4111-8111-111111111111";
const SELF_DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SELF_OTHER_DEVICE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_DEVICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";

describe("E2EEService.encryptMessageForConversation — RECIPIENT_NO_DEVICES guard", () => {
  beforeEach(() => {
    __testing.resetCache();

    const senderKp = nacl.box.keyPair.fromSecretKey(nacl.randomBytes(32));
    (TokenService.getIdentityPrivateKey as any).mockReset();
    (TokenService.getIdentityPrivateKey as any).mockResolvedValue(
      encodeBase64(senderKp.secretKey),
    );
    (TokenService.getAccessToken as any).mockReset();
    (TokenService.getAccessToken as any).mockResolvedValue("token");
    (TokenService.decodeAccessToken as any).mockReset();
    (TokenService.decodeAccessToken as any).mockReturnValue({
      sub: SELF_USER_ID,
      deviceId: SELF_DEVICE_ID,
    });
    (SignalKeysService.listDevices as any).mockReset();
    (SignalKeysService.getKeyBundle as any).mockReset();
  });

  it("throws RECIPIENT_NO_DEVICES when no counterpart device bundle is fetchable, even if the sender owns other devices", async () => {
    // Recipient lists one device but its bundle fails (expired prekey).
    // Sender owns a secondary device whose bundle does fetch — under the
    // pre-fix logic this incorrectly counted as a recipient and let the
    // message ship without a key_packet for the real interlocutor.
    (SignalKeysService.listDevices as any).mockImplementation(
      async (uid: string) => {
        if (uid === OTHER_USER_ID)
          return { userId: uid, deviceIds: [OTHER_USER_DEVICE_ID] };
        if (uid === SELF_USER_ID)
          return {
            userId: uid,
            deviceIds: [SELF_DEVICE_ID, SELF_OTHER_DEVICE_ID],
          };
        return { userId: uid, deviceIds: [] };
      },
    );

    const myOtherKp = nacl.box.keyPair.fromSecretKey(nacl.randomBytes(32));
    (SignalKeysService.getKeyBundle as any).mockImplementation(
      async (uid: string, _deviceId: string) => {
        if (uid === OTHER_USER_ID) {
          throw new Error("No active signed prekey found");
        }
        return {
          identity_key: encodeBase64(myOtherKp.publicKey),
          signed_prekey: { key_id: 1, public_key: "pk", signature: "sig" },
          one_time_prekeys: [],
        };
      },
    );

    await expect(
      E2EEService.encryptMessageForConversation({
        conversationId: CONVERSATION_ID,
        plaintext: "hello",
        clientRandom: 1,
        recipientUserIds: [OTHER_USER_ID],
      }),
    ).rejects.toThrow("RECIPIENT_NO_DEVICES");
  });

  it("succeeds when at least one counterpart device bundle is fetchable", async () => {
    const otherKp = nacl.box.keyPair.fromSecretKey(nacl.randomBytes(32));

    (SignalKeysService.listDevices as any).mockImplementation(
      async (uid: string) => {
        if (uid === OTHER_USER_ID)
          return { userId: uid, deviceIds: [OTHER_USER_DEVICE_ID] };
        return { userId: uid, deviceIds: [SELF_DEVICE_ID] };
      },
    );
    (SignalKeysService.getKeyBundle as any).mockResolvedValue({
      identity_key: encodeBase64(otherKp.publicKey),
      signed_prekey: { key_id: 1, public_key: "pk", signature: "sig" },
      one_time_prekeys: [],
    });

    const result = await E2EEService.encryptMessageForConversation({
      conversationId: CONVERSATION_ID,
      plaintext: "hello",
      clientRandom: 1,
      recipientUserIds: [OTHER_USER_ID],
    });

    expect(result.content).toContain(`"t":"whispr_e2ee_v1"`);
    expect(typeof result.signature).toBe("string");
    expect(typeof result.sender_public_key).toBe("string");
  });
});
