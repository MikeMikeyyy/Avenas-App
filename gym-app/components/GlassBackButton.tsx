import React, { useRef } from "react";
import {
  TouchableOpacity,
  Animated,
  View,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTheme } from "../themeStore";

let LiquidGlassView: any = null;
let isLiquidGlassSupported = false;
try {
  const lg = require("@callstack/liquid-glass");
  LiquidGlassView = lg.LiquidGlassView;
  isLiquidGlassSupported = lg.isLiquidGlassSupported ?? false;
} catch {}

interface GlassBackButtonProps {
  onPress: () => void;
  size?: number;
  style?: ViewStyle;
}

export function GlassBackButton({
  onPress,
  size = 44,
  style,
}: GlassBackButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { isDark } = useTheme();
  const borderRadius = size / 2;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 16,
    }).start();
  };

  const iconColor = isDark ? "#FFFFFF" : "#000000";
  const glassScheme = isDark ? "dark" : "light";

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View
        style={{ width: size, height: size, transform: [{ scale }] }}
      >
        {isLiquidGlassSupported ? (
          <>
            <LiquidGlassView
              effect="regular"
              colorScheme={glassScheme}
              style={[StyleSheet.absoluteFill, { borderRadius }]}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <Ionicons name="chevron-back" size={28} color={iconColor} />
            </View>
          </>
        ) : (
          <View
            style={{
              width: size,
              height: size,
              borderRadius,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: isDark
                ? "rgba(255,255,255,0.18)"
                : "rgba(255,255,255,0.85)",
            }}
          >
            <BlurView
              intensity={isDark ? 55 : 45}
              tint={
                isDark
                  ? "systemUltraThinMaterialDark"
                  : "systemUltraThinMaterialLight"
              }
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(255,255,255,0.50)",
                },
              ]}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { alignItems: "center", justifyContent: "center" },
              ]}
            >
              <Ionicons name="chevron-back" size={28} color={iconColor} />
            </View>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}
