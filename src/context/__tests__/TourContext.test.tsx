/**
 * TourContext persistence tests.
 *
 * Vérification que isTourActive est bien persisté dans AsyncStorage et
 * correctement restauré au montage (WHISPR-XXX).
 */

jest.mock("@react-native-async-storage/async-storage", () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    clear: jest.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
});

import React from "react";
import { act, renderHook } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TourProvider, useTour } from "../TourContext";

const TOUR_KEY = "@whispr:tour_active";

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TourProvider>{children}</TourProvider>
);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("TourContext — persistance AsyncStorage", () => {
  it("isTourActive est true par defaut (aucune valeur stockée)", async () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    // attendre l'effet de chargement
    await act(async () => {});
    expect(result.current.isTourActive).toBe(true);
  });

  it("skipTour passe isTourActive à false et persiste la valeur", async () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.skipTour();
    });

    expect(result.current.isTourActive).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(TOUR_KEY, "false");
  });

  it("replayTour passe isTourActive à true et persiste la valeur", async () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.skipTour();
    });
    await act(async () => {
      result.current.replayTour();
    });

    expect(result.current.isTourActive).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(TOUR_KEY, "true");
  });

  it("lit la valeur persistée au montage — false stocké → isTourActive false", async () => {
    await AsyncStorage.setItem(TOUR_KEY, "false");

    const { result } = renderHook(() => useTour(), { wrapper });
    await act(async () => {});

    expect(result.current.isTourActive).toBe(false);
  });

  it("lit la valeur persistée au montage — true stocké → isTourActive true", async () => {
    await AsyncStorage.setItem(TOUR_KEY, "true");

    const { result } = renderHook(() => useTour(), { wrapper });
    await act(async () => {});

    expect(result.current.isTourActive).toBe(true);
  });
});
