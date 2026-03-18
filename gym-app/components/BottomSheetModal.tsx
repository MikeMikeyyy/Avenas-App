import React, { useEffect, useRef, useState } from 'react';
import { Modal, Animated, TouchableOpacity, StyleSheet, View, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  overlayColor?: string;
  /** Background colour of the sheet — used to fill the gap below the content to the screen bottom */
  sheetBackground?: string;
  /** Rendered in the extension area below the sheet content — use for Cancel/action buttons so they sit at the physical screen bottom */
  footer?: React.ReactNode;
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
  sheetBackground = '#ffffff',
  footer,
  children,
}: Props) {
  const [showing, setShowing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetOffset = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

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
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor, opacity: overlayOpacity }]}
          pointerEvents="none"
        />
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onDismiss} />
        <Animated.View style={{ transform: [{ translateY: sheetOffset }], backgroundColor: sheetBackground }}>
          {children}
          {/* Extension area — fills the gap between sheet content and physical screen bottom.
              When a footer is provided it renders here so buttons sit at the bottom. */}
          <View style={{ backgroundColor: sheetBackground, paddingHorizontal: 20, paddingTop: footer ? 12 : 0, paddingBottom: keyboardVisible ? 8 : 34 }}>
            {footer}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
