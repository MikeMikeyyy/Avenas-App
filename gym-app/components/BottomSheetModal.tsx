import React, { useEffect, useRef, useState } from 'react';
import { Modal, Animated, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  overlayColor?: string;
  children: React.ReactNode;
}

/**
 * Bottom sheet wrapper with a fading backdrop and sliding sheet.
 * Use this instead of <Modal animationType="slide"> so the grey overlay
 * fades in independently rather than sliding up with the sheet.
 */
export function BottomSheetModal({
  visible,
  onDismiss,
  overlayColor = 'rgba(0,0,0,0.45)',
  children,
}: Props) {
  const [showing, setShowing] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetOffset = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    if (visible) {
      setShowing(true);
      overlayOpacity.setValue(0);
      sheetOffset.setValue(700);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(sheetOffset, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 0 }),
      ]).start();
    } else if (showing) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetOffset, { toValue: 700, duration: 200, useNativeDriver: true }),
      ]).start(() => setShowing(false));
    }
  }, [visible]);

  return (
    <Modal visible={showing} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor, opacity: overlayOpacity }]}
        pointerEvents="none"
      />
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onDismiss} />
      <Animated.View style={{ transform: [{ translateY: sheetOffset }] }}>
        {children}
      </Animated.View>
    </Modal>
  );
}
