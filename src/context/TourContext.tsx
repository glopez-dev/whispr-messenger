import React, { createContext, useCallback, useContext, useState } from "react";

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
  const [isTourActive, setIsTourActive] = useState(true);

  const skipTour = useCallback(() => setIsTourActive(false), []);
  const replayTour = useCallback(() => setIsTourActive(true), []);

  return (
    <TourContext.Provider value={{ isTourActive, replayTour, skipTour }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => useContext(TourContext);
