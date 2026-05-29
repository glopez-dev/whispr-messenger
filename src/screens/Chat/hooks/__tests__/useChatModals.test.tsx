/**
 * Tests for useChatModals — the chat screen's modal-state container hook.
 *
 * Covers the default (all closed) state and that each setter flips its own
 * slice independently without disturbing the others.
 */

import { act, renderHook } from "@testing-library/react-native";
import { useChatModals } from "../useChatModals";
import type { MessageWithRelations } from "../../../../types/messaging";

const msg = (id: string): MessageWithRelations =>
  ({ id, sender_id: "u1", message_type: "text" }) as MessageWithRelations;

describe("useChatModals", () => {
  it("starts with every modal closed and no selection", () => {
    const { result } = renderHook(() => useChatModals());
    expect(result.current.showActionsMenu).toBe(false);
    expect(result.current.selectedMessage).toBeNull();
    expect(result.current.showForwardModal).toBe(false);
    expect(result.current.forwardingMessage).toBeNull();
    expect(result.current.forwardSending).toBe(false);
    expect(result.current.showSchedulePicker).toBe(false);
    expect(result.current.scheduleMessageText).toBe("");
    expect(result.current.showInfoModal).toBe(false);
  });

  it("opens the actions menu with a selected message", () => {
    const { result } = renderHook(() => useChatModals());
    const m = msg("m1");
    act(() => {
      result.current.setSelectedMessage(m);
      result.current.setShowActionsMenu(true);
    });
    expect(result.current.showActionsMenu).toBe(true);
    expect(result.current.selectedMessage).toBe(m);
    // unrelated slices untouched
    expect(result.current.showForwardModal).toBe(false);
    expect(result.current.showInfoModal).toBe(false);
  });

  it("drives the forward modal state independently", () => {
    const { result } = renderHook(() => useChatModals());
    const m = msg("m2");
    act(() => {
      result.current.setForwardingMessage(m);
      result.current.setShowForwardModal(true);
      result.current.setForwardSending(true);
    });
    expect(result.current.forwardingMessage).toBe(m);
    expect(result.current.showForwardModal).toBe(true);
    expect(result.current.forwardSending).toBe(true);
    expect(result.current.showActionsMenu).toBe(false);
  });

  it("holds the schedule picker text and visibility", () => {
    const { result } = renderHook(() => useChatModals());
    act(() => {
      result.current.setScheduleMessageText("see you tomorrow");
      result.current.setShowSchedulePicker(true);
    });
    expect(result.current.scheduleMessageText).toBe("see you tomorrow");
    expect(result.current.showSchedulePicker).toBe(true);
  });

  it("toggles the info modal", () => {
    const { result } = renderHook(() => useChatModals());
    act(() => result.current.setShowInfoModal(true));
    expect(result.current.showInfoModal).toBe(true);
    act(() => result.current.setShowInfoModal(false));
    expect(result.current.showInfoModal).toBe(false);
  });
});
