import { useState } from "react";
import { MessageWithRelations } from "../../../types/messaging";

/**
 * Owns the local UI state for the chat screen's self-contained modals that
 * are not already managed by a dedicated hook (reactions, search and
 * moderation each have their own). This groups the actions menu, the forward
 * modal, the schedule picker and the info modal under a single named concern
 * so ChatScreen no longer scatters their `useState` calls among unrelated
 * screen state. The business handlers (delete, forward, schedule…) stay in
 * ChatScreen; this hook only holds state and its setters.
 */
export interface UseChatModalsReturn {
  // Actions menu (long-press on a message bubble)
  showActionsMenu: boolean;
  setShowActionsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  selectedMessage: MessageWithRelations | null;
  setSelectedMessage: React.Dispatch<
    React.SetStateAction<MessageWithRelations | null>
  >;
  // Forward modal
  showForwardModal: boolean;
  setShowForwardModal: React.Dispatch<React.SetStateAction<boolean>>;
  forwardingMessage: MessageWithRelations | null;
  setForwardingMessage: React.Dispatch<
    React.SetStateAction<MessageWithRelations | null>
  >;
  forwardSending: boolean;
  setForwardSending: React.Dispatch<React.SetStateAction<boolean>>;
  // Schedule picker
  showSchedulePicker: boolean;
  setShowSchedulePicker: React.Dispatch<React.SetStateAction<boolean>>;
  scheduleMessageText: string;
  setScheduleMessageText: React.Dispatch<React.SetStateAction<string>>;
  // Info modal
  showInfoModal: boolean;
  setShowInfoModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useChatModals(): UseChatModalsReturn {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] =
    useState<MessageWithRelations | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] =
    useState<MessageWithRelations | null>(null);
  const [forwardSending, setForwardSending] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleMessageText, setScheduleMessageText] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);

  return {
    showActionsMenu,
    setShowActionsMenu,
    selectedMessage,
    setSelectedMessage,
    showForwardModal,
    setShowForwardModal,
    forwardingMessage,
    setForwardingMessage,
    forwardSending,
    setForwardSending,
    showSchedulePicker,
    setShowSchedulePicker,
    scheduleMessageText,
    setScheduleMessageText,
    showInfoModal,
    setShowInfoModal,
  };
}
