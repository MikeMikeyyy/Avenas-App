import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  FlatList,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { Asset } from 'expo-asset';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { IBMPlexSans_400Regular, IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

const { width, height } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
}

interface OnboardingScreenProps {
  onContinue?: () => void;
}

const slides: OnboardingSlide[] = [
  {
    id: '0',
    title: '',
    description: '',
  },
  {
    id: '1',
    title: 'Workout',
    description: 'Build, log, and track your workouts in one place',
  },
  {
    id: '2',
    title: 'Connect',
    description: 'Connect with others to share programs, get feedback, and stay consistent',
  },
  {
    id: '3',
    title: 'Progress',
    description: 'Understand your progress through simple, meaningful insights',
  },
];

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onContinue }) => {
  const [fontsLoaded] = useFonts({
    Arimo_400Regular,
    Arimo_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_700Bold,
    Nunito_700Bold,
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const continueScale = useRef(new Animated.Value(1)).current;

  // Workout page animations
  const set1Reps = useRef(new Animated.Value(0)).current;
  const set1Weight = useRef(new Animated.Value(0)).current;
  const set1Check = useRef(new Animated.Value(0)).current;
  const set2Reps = useRef(new Animated.Value(0)).current;
  const set2Weight = useRef(new Animated.Value(0)).current;
  const set2Check = useRef(new Animated.Value(0)).current;
  const set3Reps = useRef(new Animated.Value(0)).current;
  const set3Weight = useRef(new Animated.Value(0)).current;
  const set3Check = useRef(new Animated.Value(0)).current;

  // Workout page finish button animations
  const finishButtonScale = useRef(new Animated.Value(1)).current;
  const finishTextOpacity = useRef(new Animated.Value(1)).current;
  const finishCheckOpacity = useRef(new Animated.Value(0)).current;

  // Connect page animations
  const shareButtonScale = useRef(new Animated.Value(1)).current;
  const shareIconOpacity = useRef(new Animated.Value(1)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;

  // Preload assets
  useEffect(() => {
    const loadAssets = async () => {
      await Asset.loadAsync([
        require('../assets/images/app-title3.png'),
        require('../assets/images/av-logo.png'),
      ]);
      setAssetsLoaded(true);
    };
    loadAssets();
  }, []);

  useEffect(() => {
    if (!assetsLoaded) return;

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Combined workout and button animation sequence
    Animated.loop(
      Animated.sequence([
        // Set 1: Fill reps, weight, then check
        Animated.timing(set1Reps, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set1Weight, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set1Check, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(400),

        // Set 2: Fill reps, weight, then check
        Animated.timing(set2Reps, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set2Weight, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set2Check, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(400),

        // Set 3: Fill reps, weight, then check
        Animated.timing(set3Reps, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set3Weight, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.delay(200),
        Animated.timing(set3Check, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(400),

        // Button press animation - scale down
        Animated.timing(finishButtonScale, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),

        // Button release and text change
        Animated.parallel([
          Animated.timing(finishButtonScale, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(finishTextOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(finishCheckOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),

        // Show "Finished" for 4.7 seconds
        Animated.delay(4700),

        // Fade out workout data and button text together
        Animated.parallel([
          Animated.timing(set1Reps, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set1Weight, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set1Check, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(set2Reps, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set2Weight, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set2Check, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(set3Reps, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set3Weight, { toValue: 0, duration: 600, useNativeDriver: false }),
          Animated.timing(set3Check, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(finishTextOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(finishCheckOpacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),

        Animated.delay(500),
      ])
    ).start();

    // Connect page share animation - single unified sequence
    Animated.loop(
      Animated.sequence([
        // Wait before pressing
        Animated.delay(2500),

        // Button press down
        Animated.timing(shareButtonScale, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),

        // Button release + text transition together
        Animated.parallel([
          Animated.timing(shareButtonScale, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(shareIconOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(checkmarkOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),

        // Hold "Shared" state
        Animated.delay(3000),

        // Fade back to "Share Program" (no button press)
        Animated.parallel([
          Animated.timing(shareIconOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(checkmarkOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),

        // Pause before loop restarts
        Animated.delay(2000),
      ])
    ).start();
  }, [assetsLoaded]);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    }
  };

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const isFirstSlide = index === 0;

    return (
      <View style={styles.slide}>
        {isFirstSlide ? (
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Image
              source={require('../assets/images/av-logo.png')}
              style={styles.avLogo}
              resizeMode="contain"
            />
            <Image
              source={require('../assets/images/app-title3.png')}
              style={styles.appTitleImage}
              resizeMode="contain"
            />
          </Animated.View>
        ) : (
          <View style={styles.featureContainer}>
            <MaskedView
              style={{ flexDirection: 'row', paddingBottom: 10 }}
              maskElement={
                <View style={{ paddingBottom: 10 }}>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                </View>
              }
            >
              <LinearGradient
                colors={['#FFFFFF', '#f0f7ff', '#ddecff']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.featureTitle, { opacity: 0 }]}>{item.title}</Text>
              </LinearGradient>
            </MaskedView>
            <MaskedView
              style={{ flexDirection: 'row' }}
              maskElement={
                <Text style={styles.featureDescription}>{item.description}</Text>
              }
            >
              <LinearGradient
                colors={['#FFFFFF', '#f0f7ff', '#ddecff']}
                locations={
                  item.id === '1' ? [0, 0.6, 1] :   // Workout - text goes far right, gradient starts later
                  item.id === '2' ? [0, 0.4, 1] :   // Connect - wraps earlier, gradient starts sooner
                  item.id === '3' ? [0, 0.3, 1] :   // Progress - wraps earliest, gradient starts soonest
                  [0, 0.5, 1]                       // Default
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.featureDescription, { opacity: 0 }]}>{item.description}</Text>
              </LinearGradient>
            </MaskedView>

            {/* Workout page animation */}
            {item.id === '1' && (
              <View style={styles.workoutVisualization}>
                <View style={styles.glassCard}>
                  <Text style={styles.exerciseName}>Bench Press</Text>

                  {/* Header Row */}
                  <View style={styles.headerRow}>
                    <Text style={styles.headerCell}>Set</Text>
                    <Text style={styles.headerCell}>Reps</Text>
                    <Text style={styles.headerCell}>Weight</Text>
                    <View style={styles.headerCheckbox} />
                  </View>

                  {/* Set 1 */}
                  <View style={styles.setRow}>
                    <Text style={styles.setNumber}>1</Text>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set1Reps }]}>
                      <Text style={styles.inputValue}>8</Text>
                    </Animated.View>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set1Weight }]}>
                      <Text style={styles.inputValue}>80</Text>
                    </Animated.View>
                    <View style={styles.checkboxOutline}>
                      <Animated.View
                        style={[
                          styles.checkboxFill,
                          {
                            opacity: set1Check,
                          },
                        ]}
                      >
                        <Animated.View style={{ transform: [{ scale: set1Check }] }}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </Animated.View>
                      </Animated.View>
                    </View>
                  </View>

                  {/* Set 2 */}
                  <View style={styles.setRow}>
                    <Text style={styles.setNumber}>2</Text>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set2Reps }]}>
                      <Text style={styles.inputValue}>6</Text>
                    </Animated.View>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set2Weight }]}>
                      <Text style={styles.inputValue}>80</Text>
                    </Animated.View>
                    <View style={styles.checkboxOutline}>
                      <Animated.View
                        style={[
                          styles.checkboxFill,
                          {
                            opacity: set2Check,
                          },
                        ]}
                      >
                        <Animated.View style={{ transform: [{ scale: set2Check }] }}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </Animated.View>
                      </Animated.View>
                    </View>
                  </View>

                  {/* Set 3 */}
                  <View style={styles.setRow}>
                    <Text style={styles.setNumber}>3</Text>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set3Reps }]}>
                      <Text style={styles.inputValue}>8</Text>
                    </Animated.View>
                    <Animated.View style={[styles.inputValueContainer, { opacity: set3Weight }]}>
                      <Text style={styles.inputValue}>75</Text>
                    </Animated.View>
                    <View style={styles.checkboxOutline}>
                      <Animated.View
                        style={[
                          styles.checkboxFill,
                          {
                            opacity: set3Check,
                          },
                        ]}
                      >
                        <Animated.View style={{ transform: [{ scale: set3Check }] }}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </Animated.View>
                      </Animated.View>
                    </View>
                  </View>

                  <Animated.View
                    style={[
                      styles.finishButton,
                      {
                        transform: [{ scale: finishButtonScale }],
                      },
                    ]}
                  >
                    <Animated.View style={[{ opacity: finishTextOpacity, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Text style={styles.finishButtonText}>Finish Workout</Text>
                      <Ionicons name="arrow-forward" size={20} color="#1C1C1E" />
                    </Animated.View>
                    <Animated.View style={[{ opacity: finishCheckOpacity, position: 'absolute', flexDirection: 'row', alignItems: 'center' }]}>
                      <Text style={styles.finishButtonText}>Finished </Text>
                      <Text style={styles.checkmark}>✓</Text>
                    </Animated.View>
                  </Animated.View>
                </View>
              </View>
            )}

            {/* Connect page animation */}
            {item.id === '2' && (
              <View style={styles.workoutVisualization}>
                <View style={styles.glassCard}>
                  <Text style={styles.exerciseName}>Upper/Lower Workout Program</Text>
                  <Text style={styles.programSubtitle}>8-Week Program</Text>

                  <View style={styles.shareSection}>
                    <Text style={styles.shareTo}>Share to:</Text>
                    <View style={styles.clientCard}>
                      <View style={[styles.clientAvatar, { backgroundColor: '#ffd676' }]}>
                        <Text style={styles.clientInitial}>EJ</Text>
                      </View>
                      <Text style={styles.clientName}>Eric Josibop</Text>
                    </View>
                    <View style={[styles.clientCard, { marginTop: 8 }]}>
                      <View style={[styles.clientAvatar, { backgroundColor: '#00EBAC' }]}>
                        <Text style={styles.clientInitial}>JF</Text>
                      </View>
                      <Text style={styles.clientName}>Jaden Food</Text>
                    </View>
                  </View>

                  <Animated.View
                    style={[
                      styles.shareButton,
                      {
                        transform: [{ scale: shareButtonScale }],
                      },
                    ]}
                  >
                    <Animated.View style={[{ opacity: shareIconOpacity, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Text style={styles.shareButtonText}>Share Program</Text>
                      <Ionicons name="arrow-forward" size={20} color="#1C1C1E" />
                    </Animated.View>
                    <Animated.View style={[{ opacity: checkmarkOpacity, position: 'absolute', flexDirection: 'row', alignItems: 'center' }]}>
                      <Text style={styles.shareButtonText}>Shared </Text>
                      <Text style={styles.checkmark}>✓</Text>
                    </Animated.View>
                  </Animated.View>
                </View>
              </View>
            )}

            {/* Progress page */}
            {item.id === '3' && (
              <View style={styles.workoutVisualization}>
                <View style={styles.glassCard}>
                  <Text style={styles.exerciseName}>Bench Press Progress</Text>
                  <Text style={styles.programSubtitle}>Last 6 Weeks</Text>

                  <View style={styles.chartContainer}>
                    <LineChart
                      data={[
                        { value: 70, label: 'W1' },
                        { value: 73, label: 'W2' },
                        { value: 75, label: 'W3' },
                        { value: 78, label: 'W4' },
                        { value: 80.5, label: 'W5' },
                        { value: 82, label: 'W6' },
                      ]}
                      data2={[
                        { value: 70 },
                        { value: 73 },
                        { value: 75 },
                        { value: 78 },
                        { value: 80.5 },
                        { value: 82 },
                      ]}
                      width={195}
                      height={120}
                      spacing={34}
                      initialSpacing={15}
                      endSpacing={10}
                      color="#47DDFF"
                      color2="transparent"
                      thickness={3}
                      thickness2={0}
                      areaChart
                      startFillColor="#47DDFF"
                      endFillColor="#47DDFF"
                      startOpacity={0.3}
                      endOpacity={0}
                      dataPointsColor="#FFFFFF"
                      dataPointsRadius={6}
                      dataPointsColor2="#47DDFF"
                      dataPointsRadius2={4}
                      curved
                      yAxisColor="#5a6c7d4d"
                      xAxisColor="#5a6c7d4d"
                      yAxisTextStyle={{ color: '#5a6c7d', fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: '#5a6c7d', fontSize: 10 }}
                      yAxisLabelSuffix="kg"
                      yAxisLabelWidth={35}
                      noOfSections={4}
                      maxValue={20}
                      yAxisOffset={65}
                      stepValue={5}
                      hideRules
                      disableScroll
                    />
                  </View>

                  <View style={styles.statsSummary}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>+12.5kg</Text>
                      <Text style={styles.statLabel}>Total Gain</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>+2.5kg</Text>
                      <Text style={styles.statLabel}>Avg/Week</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderDots = () => {
    return (
      <View style={styles.pagination}>
        {slides.map((_, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];

          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 16, 8],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  width: dotWidth,
                  opacity,
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <LinearGradient
      colors={['#abbac4', '#FFFFFF']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#b1bdcc" />

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(item) => item.id}
        scrollEventThrottle={16}
        style={{ backgroundColor: 'transparent' }}
      />

      {renderDots()}

      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => {
          Animated.spring(continueScale, {
            toValue: 0.92,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(continueScale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 14,
            bounciness: 16,
          }).start();
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          handleContinue();
        }}
      >
        <Animated.View style={[styles.continueButton, { transform: [{ scale: continueScale }] }]}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </Animated.View>
      </TouchableOpacity>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width,
    height,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -75,
  },
  logoPlaceholder: {
    marginBottom: 20,
  },
  logoShape: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: '#ffffff66',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  appTitleImage: {
    width: 280,
    height: 120,
    marginTop: 10,
  },
  avLogo: {
    width: 190,
    height: 190,
  },
  featureContainer: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    position: 'absolute',
    top: 150,
    left: 40,
    right: 40,
  },
  featureTitle: {
    fontSize: 48,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: 12,
    letterSpacing: -1,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 58,
    includeFontPadding: false,
  },
  featureDescription: {
    fontSize: 18,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
    textAlign: 'left',
    lineHeight: 26,
    letterSpacing: -0.3,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  pagination: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 130 : 90,
    alignSelf: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#505a64b3',
    marginHorizontal: 4,
  },
  continueButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    height: 56,
    backgroundColor: '#1C1C1E',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.4,
  },
  workoutVisualization: {
    marginTop: 40,
    width: '100%',
  },
  glassCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  exerciseName: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  headerCell: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    textAlign: 'center',
  },
  headerCheckbox: {
    width: 24,
    marginLeft: 16,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#ffffff80',
    borderRadius: 12,
    padding: 14,
  },
  setNumber: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    flex: 1,
    textAlign: 'center',
  },
  inputValueContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputValue: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  checkboxOutline: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  checkboxFill: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
    backgroundColor: '#00EBAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: 'bold',
  },
  programSubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginBottom: 24,
    marginTop: -8,
  },
  shareSection: {
    marginBottom: 20,
  },
  shareTo: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff80',
    borderRadius: 12,
    padding: 12,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#47DDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  clientInitial: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
  },
  clientName: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  shareButton: {
    backgroundColor: '#47DDFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  sharedText: {
    color: '#FFFFFF',
  },
  finishButton: {
    backgroundColor: '#47DDFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  finishButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  chartContainer: {
    marginTop: 16,
    marginBottom: 8,
    alignItems: 'center',
    paddingLeft: 12,
  },
  statsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#5a6c7d33',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#00EBAC',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default OnboardingScreen;
