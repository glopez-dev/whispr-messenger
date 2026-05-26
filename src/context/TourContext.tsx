import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const TOUR_STORAGE_KEY = "@whispr:tour_active";

type TourContextType = {
  isTourActive: boolean;
  skipTour: () => void;
  replayTour: () => void;
};

const TourContext = createContext<TourContextType>({
  isTourActive: true,
  skipTour: () => {},
  replayTour: () => {},
});

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TOUR_STORAGE_KEY)
      .then((stored) => {
        // null = premier lancement → activer ; sinon respecter la valeur persistée
        setIsTourActive(stored === null || stored === "true");
      })
      .catch(() => {
        setIsTourActive(true);
      });
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    AsyncStorage.setItem(TOUR_STORAGE_KEY, "false").catch(() => {});
  }, []);

  const replayTour = useCallback(() => {
    setIsTourActive(true);
    AsyncStorage.setItem(TOUR_STORAGE_KEY, "true").catch(() => {});
  }, []);

  return (
    <TourContext.Provider value={{ isTourActive, replayTour, skipTour }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);
