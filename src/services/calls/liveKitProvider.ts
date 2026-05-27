import { Room } from "livekit-client";

export interface LiveKitConfig {
  url: string;
  token: string;
}

/**
 * Thin wrapper around livekit-client's Room to centralise lifecycle (connect,
 * disconnect, mic/camera toggle, camera flip) and keep the rest of the app
 * free of direct LiveKit imports.
 */
export class CallsLiveKit {
  private room: Room | null = null;

  async connect(config: LiveKitConfig): Promise<Room> {
    // Logs explicites pour debug DevTools sur web PWA : sans visibilite cote
    // user, room.connect() echoue en silence et l'UI reste coincee.
    // eslint-disable-next-line no-console
    console.debug("[LiveKit] connecting to", config.url);
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480, frameRate: 24 },
      },
    });
    try {
      await this.room.connect(config.url, config.token);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[LiveKit] room.connect failed", {
        url: config.url,
        name: (err as { name?: string })?.name,
        message: (err as Error)?.message,
        stack: (err as Error)?.stack,
      });
      // Re-throw : on enrichit avec le name pour que callsStore tagge le toast
      // (NotAllowedError / ConnectionError / etc.).
      const original = err as Error & { name?: string };
      const enriched = new Error(
        original.name && original.name !== "Error"
          ? `${original.name}: ${original.message}`
          : original.message,
      );
      (enriched as Error & { cause?: unknown }).cause = err;
      throw enriched;
    }
    // eslint-disable-next-line no-console
    console.debug("[LiveKit] connected, room state:", this.room.state);
    return this.room;
  }

  async enableMic(enable: boolean): Promise<void> {
    await this.room?.localParticipant.setMicrophoneEnabled(enable);
  }

  async enableCamera(enable: boolean): Promise<void> {
    await this.room?.localParticipant.setCameraEnabled(enable);
  }

  async flipCamera(): Promise<void> {
    if (!this.room) return;
    const pub = this.room.localParticipant.getTrackPublication("camera" as any);
    const track = pub?.track;
    if (!track) return;

    const mediaTrack = track.mediaStreamTrack as unknown as {
      _switchCamera?: () => void;
      getSettings?: () => MediaTrackSettings;
    };

    // Native path (@livekit/react-native-webrtc provides _switchCamera)
    if (typeof mediaTrack._switchCamera === "function") {
      mediaTrack._switchCamera();
      return;
    }

    // Web path: read current facingMode, toggle, republish the camera track
    const current = mediaTrack.getSettings?.().facingMode;
    const next: "user" | "environment" =
      current === "user" ? "environment" : "user";
    await this.room.localParticipant.setCameraEnabled(false);
    await this.room.localParticipant.setCameraEnabled(true, {
      facingMode: next,
    });
  }

  disconnect(): void {
    this.room?.disconnect();
    this.room = null;
  }

  get currentRoom(): Room | null {
    return this.room;
  }
}

export const callsLiveKit = new CallsLiveKit();
