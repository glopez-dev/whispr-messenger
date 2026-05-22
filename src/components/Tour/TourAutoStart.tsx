import React, { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSpotlightTour } from "react-native-spotlight-tour";
import { useTour } from "../../context/TourContext";

export const TourAutoStart: React.FC = () => {
  const { start } = useSpotlightTour();
  const { isTourActive } = useTour();

  useFocusEffect(
    useCallback(() => {
      if (!isTourActive) return;
      const timer = setTimeout(start, 700);
      return () => clearTimeout(timer);
    }, [isTourActive, start]),
  );

  return null;
};
