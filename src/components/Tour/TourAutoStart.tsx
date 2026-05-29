import React, { useEffect } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useSpotlightTour } from "react-native-spotlight-tour";
import { useTour } from "@/context/TourContext";

export const TourAutoStart: React.FC = () => {
  const { start } = useSpotlightTour();
  const { isTourActive } = useTour();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused || !isTourActive) return;
    const timer = setTimeout(start, 700);
    return () => clearTimeout(timer);
  }, [isFocused, isTourActive, start]);

  return null;
};
