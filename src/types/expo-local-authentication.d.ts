// Stub de types pour expo-local-authentication (package natif non installe en env local/CI)
declare module "expo-local-authentication" {
  export enum AuthenticationType {
    FINGERPRINT = 1,
    FACIAL_RECOGNITION = 2,
    IRIS = 3,
  }

  export enum SecurityLevel {
    NONE = 0,
    SECRET = 1,
    BIOMETRIC_WEAK = 2,
    BIOMETRIC_STRONG = 3,
  }

  export interface LocalAuthenticationResult {
    success: boolean;
    error?: string;
    warning?: string;
  }

  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function supportedAuthenticationTypesAsync(): Promise<
    AuthenticationType[]
  >;
  export function authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
    fallbackLabel?: string;
  }): Promise<LocalAuthenticationResult>;
}
