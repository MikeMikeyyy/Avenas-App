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
import { HomeIcon } from "../../components/icons/TabIcons";
import { useRef, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";

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

function TabItem({ route, focused, onPress }: { route: any; focused: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const label = TAB_LABELS[route.name] || route.name;

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
        {renderIcon(route.name, 28, "#FFFFFF")}
        <Text
          style={[styles.label, focused && styles.labelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const BAR_HEIGHT = 72;
const PILL_INSET = 4; // equal gap on all sides between pill and bar edge
const PILL_HEIGHT = BAR_HEIGHT - PILL_INSET * 2; // 68
const PILL_WIDTH = 86;

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
  const { width: screenWidth } = useWindowDimensions();
  const barWidth = screenWidth - 40; // left:20 + right:20
  const barPadding = 8;
  const computedTabWidth = (barWidth - barPadding * 2) / state.routes.length;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (computedTabWidth > 0) {
      setTabWidth(computedTabWidth);
    }
  }, [computedTabWidth]);

  useEffect(() => {
    if (tabWidth > 0) {
      const toValue =
        state.index * tabWidth + tabWidth / 2 - PILL_WIDTH / 2;

      if (isFirstRender.current) {
        translateX.setValue(toValue);
        isFirstRender.current = false;
        return;
      }

      // Bounce the pill: shrink then spring back
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

  return (
    <View style={styles.tabBarWrapper}>
      <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
        <View style={styles.tabBarInner}>
          {/* Animated sliding pill */}
          <Animated.View
            style={[
              styles.activePill,
              {
                width: PILL_WIDTH,
                transform: [{ translateX }, { scale: pillScale }],
              },
            ]}
          />

          {/* Tab items */}
          {state.routes.map((route: any, index: number) => (
            <TabItem
              key={route.key}
              route={route}
              focused={state.index === index}
              onPress={() => navigation.navigate(route.name)}
            />
          ))}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "fade",
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
  },
  blurContainer: {
    borderRadius: 100,
    overflow: "hidden",
  },
  tabBarInner: {
    flexDirection: "row",
    backgroundColor: "rgba(28, 28, 30, 0.75)",
    height: BAR_HEIGHT,
    alignItems: "center",
    paddingHorizontal: 8,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
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
    left: 8,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    top: (BAR_HEIGHT - PILL_HEIGHT) / 2 - 0.5,
    zIndex: 1,
  },
  iconContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "500",
    color: "#FFFFFF",
    lineHeight: 12,
  },
  labelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
