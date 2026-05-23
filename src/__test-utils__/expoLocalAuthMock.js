// Mock minimal expo-local-authentication pour les tests Jest
// Le package n'est pas installe dans l'env de test (natif uniquement)
module.exports = {
  authenticateAsync: jest.fn().mockResolvedValue({ success: false }),
  hasHardwareAsync: jest.fn().mockResolvedValue(false),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
};
