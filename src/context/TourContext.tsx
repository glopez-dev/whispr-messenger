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
};

const TourContext = createContext<TourContextType>({
  isTourActive: false,
  skipTour: () => {},
});

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isTourActive, setIsTourActive] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TOUR_DONE_KEY).then((v) => {
      setIsTourActive(v !== "1");
    });
  }, []);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    AsyncStorage.setItem(TOUR_DONE_KEY, "1");
  }, []);

  return (
    <TourContext.Provider value={{ isTourActive, skipTour }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);
