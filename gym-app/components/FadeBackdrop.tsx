import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  onPress: () => void;
  color?: string;
}

/**
 * A full-screen touchable backdrop that fades in when mounted.
 * Drop this inside static overlay views (not Modal-based) to give
 * the grey background a fade-in effect independent of the sheet.
 */
export function FadeBackdrop({ onPress, color = 'rgba(0,0,0,0.45)' }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, { backgroundColor: color }]}
        activeOpacity={1}
        onPress={onPress}
      />
    </Animated.View>
  );
}
