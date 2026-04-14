import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { HomeIcon } from "../../components/icons/TabIcons";
import { useRef, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../themeStore";
let LiquidGlassView: any = null;
let LiquidGlassContainerView: any = null;
let isLiquidGlassSupported = false;
try {
  const lg = require("@callstack/liquid-glass");
  LiquidGlassView = lg.LiquidGlassView;
  LiquidGlassContainerView = lg.LiquidGlassContainerView;
  isLiquidGlassSupported = lg.isLiquidGlassSupported ?? false;
} catch {
  // Native module unavailable (Expo Go, iOS < 26) — BlurView fallback is used
}

const TAB_LABELS: Record<string, string> = {
  home: "Home",
  workout: "Workout",
  progress: "Progress",
  community: "Community",
};

const renderIcon = (name: string, size: number, color: string) => {
  switch (name) {
    case "home":
      return <HomeIcon size={size} color={color} />;
    case "workout":
      return <Ionicons name="barbell" size={size} color={color} />;
    case "progress":
      return <Ionicons name="trending-up" size={size} color={color} />;
    case "community":
      return <Ionicons name="people" size={size} color={color} />;
    default:
      return null;
  }
};

function TabItem({
  route,
  focused,
  onPress,
  isDark,
}: {
  route: any;
  focused: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const label = TAB_LABELS[route.name] || route.name;
  const iconColor = isDark ? "#FFFFFF" : "#000000";

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

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.tabItem}
    >
      <Animated.View style={[styles.iconContent, { transform: [{ scale }] }]}>
        {renderIcon(route.name, 28, iconColor)}
        <Text
          style={[styles.label, { color: iconColor, fontWeight: focused ? "600" : "500" }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const BAR_HEIGHT = 72;
const PILL_INSET = 3;

function AnimatedTabBar({
  state,
  navigation,
}: {
  state: any;
  navigation: any;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const [tabWidth, setTabWidth] = useState(0);
  const { isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const barWidth = screenWidth - 40; // left: 20 + right: 20
  const computedTabWidth = (barWidth - 2) / state.routes.length; // subtract 2 for 1px border on each side
  const isFirstRender = useRef(true);

  const pillWidth = tabWidth - PILL_INSET * 2;
  const pillHeight = BAR_HEIGHT - PILL_INSET * 2;

  useEffect(() => {
    if (computedTabWidth > 0) {
      setTabWidth(computedTabWidth);
    }
  }, [computedTabWidth]);

  useEffect(() => {
    if (tabWidth > 0) {
      const toValue = state.index * tabWidth + PILL_INSET;

      if (isFirstRender.current) {
        translateX.setValue(toValue);
        isFirstRender.current = false;
        return;
      }

      Animated.sequence([
        Animated.timing(pillScale, {
          toValue: 0.85,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.spring(pillScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 14,
          bounciness: 16,
        }),
      ]).start();

      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        tension: 68,
        friction: 12,
      }).start();
    }
  }, [state.index, tabWidth]);

  const glassScheme = isDark ? "dark" : "light";

  const tabItems = state.routes.map((route: any, index: number) => (
    <TabItem
      key={route.key}
      route={route}
      focused={state.index === index}
      onPress={() => navigation.navigate(route.name)}
      isDark={isDark}
    />
  ));

  // iOS 26+: real liquid glass with merging pill
  if (isLiquidGlassSupported) {
    return (
      <View style={styles.tabBarWrapper}>
        <LiquidGlassContainerView
          style={{ width: barWidth, height: BAR_HEIGHT }}
          spacing={12}
        >
          {/* Bar background — liquid glass material */}
          <LiquidGlassView
            effect={isDark ? "regular" : "clear"}
            colorScheme={glassScheme}
            style={{
              position: "absolute",
              width: barWidth,
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
            }}
          />
          {/* Sliding pill — merges with bar glass as it moves */}
          {tabWidth > 0 && (
            <Animated.View
              style={{
                position: "absolute",
                top: PILL_INSET,
                left: 0,
                width: pillWidth,
                height: pillHeight,
                transform: [{ translateX }, { scale: pillScale }],
              }}
            >
              <LiquidGlassView
                effect="clear"
                interactive
                colorScheme={glassScheme}
                style={{
                  width: pillWidth,
                  height: pillHeight,
                  borderRadius: pillHeight / 2,
                }}
              />
            </Animated.View>
          )}
        </LiquidGlassContainerView>
        {/* Tab icons/labels sit above the glass layers */}
        <View
          style={{
            position: "absolute",
            flexDirection: "row",
            width: barWidth,
            height: BAR_HEIGHT,
          }}
        >
          {tabItems}
        </View>
      </View>
    );
  }

  // Fallback: BlurView for iOS < 26 and Expo Go
  const blurTint = isDark ? "systemThinMaterialDark" : "light";
  const blurBaseIntensity = 52;
  const blurEdgeIntensity = 98;
  const tabBarBg = isDark ? "rgba(18, 18, 26, 0.58)" : "rgba(255,255,255,0.62)";
  const tabBarBorder = isDark ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.95)";
  const pillBg = isDark ? "rgba(255,255,255,0.17)" : "rgba(255,255,255,0.96)";
  const pillBorder = isDark ? "rgba(255,255,255,0.32)" : "rgba(200,210,220,0.90)";

  return (
    <View style={styles.tabBarWrapper}>
      {/* Base: low-to-moderate blur so center content stays readable */}
      <BlurView
        intensity={blurBaseIntensity}
        tint={blurTint}
        style={StyleSheet.absoluteFill}
      />
      {/* Edges: stronger blur masked to left + right thirds only */}
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={["rgba(255,255,255,1)", "rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,1)"]}
            locations={[0, 0.28, 0.72, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView
          intensity={blurEdgeIntensity}
          tint={blurTint}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
      {/* Chrome: tint overlay + border + pill + icons */}
      <View style={[styles.tabBarInner, { backgroundColor: tabBarBg, borderColor: tabBarBorder }]}>
        <Animated.View
          style={[
            styles.activePill,
            {
              width: tabWidth - PILL_INSET * 2,
              backgroundColor: pillBg,
              borderColor: pillBorder,
              transform: [{ translateX }, { scale: pillScale }],
            },
          ]}
        />
        {tabItems}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        lazy: false,
      }}
      tabBar={(props) => (
        <AnimatedTabBar state={props.state} navigation={props.navigation} />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="workout" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="community" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    height: BAR_HEIGHT,
    borderRadius: 100,
    overflow: "hidden",
  },
  tabBarInner: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 100,
    borderWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: BAR_HEIGHT,
    zIndex: 2,
  },
  activePill: {
    position: "absolute",
    left: 0,
    top: 2,
    height: BAR_HEIGHT - PILL_INSET * 2,
    borderRadius: (BAR_HEIGHT - PILL_INSET * 2) / 2,
    borderWidth: 1,
    zIndex: 1,
  },
  iconContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
  },
});
