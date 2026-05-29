import type { AuthPurpose, DeviceInfo, SignalKeyBundleDto } from "@/types/auth";
import type {
  Report,
  Appeal,
  UserSanction,
  SanctionType,
} from "@/types/moderation";

export type AuthStackParamList = {
  Onboarding: undefined;
  Welcome: undefined;
  PhoneInput: { mode: AuthPurpose };
  Otp: {
    phoneNumber: string;
    verificationId: string;
    purpose: AuthPurpose;
    demoCode?: string;
  };
  ProfileSetup: undefined;
  AccountRecovered: undefined;
  MyProfile: undefined;
  UserProfile: { userId: string };
  Settings: undefined;
  AboutContent: undefined;
  PrivacyPolicy: undefined;
  TermsOfUse: undefined;
  SecurityKeys: undefined;
  Devices: undefined;
  TwoFactorAuth: undefined;
  TwoFactorSetup: undefined;
  TwoFactorVerify: { secret: string };
  TwoFactorBackupCodes: { codes: string[] };
  TwoFactorVerifyLogin: {
    verificationId: string;
    deviceInfo: DeviceInfo;
    signalKeyBundle: SignalKeyBundleDto;
  };
  RecoveryCodes: { mode?: "resume" } | undefined;
  RecoveryCodeEntry: undefined;
  ConversationsList: undefined;
  ArchivedConversations: undefined;
  Chat: { conversationId: string; openSearch?: boolean };
  Contacts: undefined;
  MyQRCode: undefined;
  QRCodeScanner: undefined;
  DevicePairingScanner: undefined;
  BlockedUsers: undefined;
  GroupDetails: {
    groupId: string;
    conversationId: string;
    conversationName?: string;
  };
  GroupManagement: { groupId: string; conversationId: string };
  ScheduledMessages: { conversationId: string };
  Calls: undefined;
  IncomingCall: undefined;
  InCall: undefined;
  CallHistory: undefined;
  ModerationTest: undefined;
  ModerationDecision:
    | {
        decisionId?: string;
        sanctionType?: string;
        reasonLabel?: string;
        incidentDate?: string;
        deadlineDate?: string;
        reference?: string;
      }
    | undefined;
  ModerationAppealForm: { decisionId: string };
  ModerationAppealSubmitted: {
    appealId: string;
    decisionId: string;
    status?: string;
  };
  // Moderation (user-facing)
  ReportHistory: undefined;
  ReportDetail: { report: Report };
  MySanctions: undefined;
  SanctionNotice: { sanctionId: string };
  AppealForm: { sanction: UserSanction };
  AppealStatus: { sanctionId?: string; appealId?: string };
  // Admin screens
  AdminDemos: undefined;
  ModerationDashboard: undefined;
  ReportQueue: undefined;
  ReportReview: { report: Report };
  AppealQueue: undefined;
  AppealReview: { appealId?: string; appeal?: Appeal };
  UserModeration: { userId: string; userName?: string; userAvatar?: string };
  SanctionForm: {
    userId?: string;
    userName?: string;
    defaultType?: SanctionType;
  };
};
