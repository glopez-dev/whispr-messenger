import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOUR_DONE_KEY = "whispr_tour_done";

type TourContextType = {
  isTourActive: boolean;
  skipTour: () => void;
  replayTour: () => void;
};

const TourContext = createContext<TourContextType>({
  isTourActive: false,
  skipTour: () => {},
  replayTour: () => {},
});

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      const v = await AsyncStorage.getItem(TOUR_DONE_KEY);
      setIsTourActive(v !== "1");
    };
    load();
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    AsyncStorage.setItem(TOUR_DONE_KEY, "1");
  }, []);

  const replayTour = useCallback(() => {
    AsyncStorage.removeItem(TOUR_DONE_KEY);
    setIsTourActive(true);
  }, []);

  return (
    <TourContext.Provider value={{ isTourActive, replayTour, skipTour }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);
