import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedRef,
  scrollTo,
  useAnimatedScrollHandler,
  useFrameCallback,
  runOnJS,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { LyricsDocument } from '../core/types';
import { LyricLineView } from './LyricLineView';

export interface LyricsViewerProps {
  document: LyricsDocument;
  currentTimeMs: number | SharedValue<number>;
  activeLineStyle?: TextStyle;
  inactiveLineStyle?: TextStyle;
  pastLineStyle?: TextStyle;
  futureLineStyle?: TextStyle;
  lineStyle?: ViewStyle;
  translationStyle?: TextStyle;
  romanizationContainerStyle?: ViewStyle;
  romanizationTextStyle?: TextStyle;
  containerStyle?: ViewStyle;
  autoScrollResyncDelay?: number;
  motionDuration?: number;
  enableWordAnimation?: boolean;
  glowDurationThreshold?: number;
  shadowAmount?: number;
  onLinePress?: (line: LyricsDocument['lines'][0], index: number) => void;
  duetMode?: boolean | 'auto';
  speakerAlignments?: Record<string, 'left' | 'right' | 'center'>;
  getSpeakerAlignment?: (
    speaker?: string,
    index?: number
  ) => 'left' | 'right' | 'center';
  showSpeakerBadge?: boolean;
  speakerTagStyle?: TextStyle;
  instrumentalContainerStyle?: ViewStyle;
  instrumentalTextStyle?: TextStyle;
  renderInstrumentalBreak?: (
    line: LyricsDocument['lines'][0],
    isActive: boolean
  ) => React.ReactNode;
  showResumeAutoscrollButton?: boolean;
  resumeAutoscrollText?: string;
  resumeAutoscrollButtonStyle?: ViewStyle;
  resumeAutoscrollTextStyle?: TextStyle;
}

export function LyricsViewer({
  document,
  currentTimeMs,
  activeLineStyle,
  inactiveLineStyle,
  pastLineStyle,
  futureLineStyle,
  lineStyle,
  translationStyle,
  romanizationContainerStyle,
  romanizationTextStyle,
  containerStyle,
  autoScrollResyncDelay = 2000,
  motionDuration = 300,
  enableWordAnimation = true,
  glowDurationThreshold = 750,
  shadowAmount = 8,
  onLinePress,
  duetMode = 'auto',
  speakerAlignments,
  getSpeakerAlignment,
  showSpeakerBadge = false,
  speakerTagStyle,
  instrumentalContainerStyle,
  instrumentalTextStyle,
  renderInstrumentalBreak,
  showResumeAutoscrollButton = true,
  resumeAutoscrollText = 'Resume Autoscroll',
  resumeAutoscrollButtonStyle,
  resumeAutoscrollTextStyle,
}: LyricsViewerProps) {
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [showResumeScroll, setShowResumeScroll] = useState(false);

  // We mirror the time into a SharedValue if it's a plain number
  const isSharedValue =
    typeof currentTimeMs === 'object' &&
    currentTimeMs !== null &&
    'value' in currentTimeMs;

  const numericTimeSharedValue = useSharedValue(
    typeof currentTimeMs === 'number' ? currentTimeMs : 0
  );

  // Sync numeric shared value if a plain number is passed
  useEffect(() => {
    if (typeof currentTimeMs === 'number') {
      numericTimeSharedValue.value = currentTimeMs;
    }
  }, [currentTimeMs, numericTimeSharedValue]);

  const activeTime = isSharedValue
    ? (currentTimeMs as SharedValue<number>)
    : numericTimeSharedValue;

  const lineOffsets = useSharedValue<
    Record<number, { y: number; height: number }>
  >({});
  const isUserScrolling = useSharedValue(false);
  const scrollResumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const offsetsRef = useRef<Record<number, { y: number; height: number }>>({});

  const handleLayoutLine = useCallback(
    (index: number, y: number, height: number) => {
      offsetsRef.current[index] = { y, height };
      lineOffsets.value = { ...offsetsRef.current };
    },
    [lineOffsets]
  );

  const handleScrollBegin = useCallback(() => {
    isUserScrolling.value = true;
    setShowResumeScroll(true);
    if (scrollResumeTimeout.current) {
      clearTimeout(scrollResumeTimeout.current);
    }
  }, [isUserScrolling]);

  const resumeAutoScroll = useCallback(() => {
    isUserScrolling.value = false;
    setShowResumeScroll(false);
  }, [isUserScrolling]);

  const handleScrollEnd = useCallback(() => {
    if (scrollResumeTimeout.current) {
      clearTimeout(scrollResumeTimeout.current);
    }
    scrollResumeTimeout.current = setTimeout(
      resumeAutoScroll,
      autoScrollResyncDelay
    );
  }, [autoScrollResyncDelay, resumeAutoScroll]);

  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      isUserScrolling.value = true;
      runOnJS(handleScrollBegin)();
    },
    onEndDrag: () => {
      'worklet';
      runOnJS(handleScrollEnd)();
    },
    onMomentumEnd: () => {
      'worklet';
      runOnJS(handleScrollEnd)();
    },
  });

  const prevActiveIndex = useSharedValue(-1);

  // Auto-scroll logic
  useFrameCallback(() => {
    if (isUserScrolling.value || scrollViewHeight === 0) return;

    const time = activeTime.value;
    let activeIndex = -1;

    for (let i = 0; i < document.lines.length; i++) {
      const line = document.lines[i];
      if (line && time >= line.startMs && time < line.endMs) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex !== -1 && activeIndex !== prevActiveIndex.value) {
      const offsetData = lineOffsets.value[activeIndex];
      if (offsetData) {
        prevActiveIndex.value = activeIndex;
        const targetY =
          offsetData.y - scrollViewHeight / 2 + offsetData.height / 2;
        scrollTo(scrollViewRef, 0, Math.max(0, targetY), true);
      }
    }
  });

  const handleResumeAutoscrollPress = useCallback(() => {
    isUserScrolling.value = false;
    setShowResumeScroll(false);
    if (scrollResumeTimeout.current) {
      clearTimeout(scrollResumeTimeout.current);
    }

    const time = activeTime.value;
    let activeIndex = -1;

    for (let i = 0; i < document.lines.length; i++) {
      const line = document.lines[i];
      if (line && time >= line.startMs && time < line.endMs) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex === -1) {
      for (let i = 0; i < document.lines.length; i++) {
        const line = document.lines[i];
        if (line && line.startMs >= time) {
          activeIndex = Math.max(0, i - 1);
          break;
        }
      }
    }

    if (activeIndex === -1 && document.lines.length > 0) {
      activeIndex = document.lines.length - 1;
    }

    if (activeIndex !== -1) {
      const offsetData = lineOffsets.value[activeIndex];
      if (offsetData && scrollViewHeight > 0) {
        prevActiveIndex.value = activeIndex;
        const targetY =
          offsetData.y - scrollViewHeight / 2 + offsetData.height / 2;
        scrollTo(scrollViewRef, 0, Math.max(0, targetY), true);
      }
    }
  }, [
    document.lines,
    activeTime,
    isUserScrolling,
    lineOffsets,
    prevActiveIndex,
    scrollViewHeight,
    scrollViewRef,
  ]);

  const handleLinePress = useCallback(
    (line: LyricsDocument['lines'][0], index: number) => {
      isUserScrolling.value = false;
      setShowResumeScroll(false);
      const offsetData = lineOffsets.value[index];
      if (offsetData && scrollViewHeight > 0) {
        prevActiveIndex.value = index;
        const targetY =
          offsetData.y - scrollViewHeight / 2 + offsetData.height / 2;
        scrollTo(scrollViewRef, 0, Math.max(0, targetY), true);
      }
      onLinePress?.(line, index);
    },
    [
      isUserScrolling,
      lineOffsets,
      onLinePress,
      prevActiveIndex,
      scrollViewHeight,
      scrollViewRef,
    ]
  );

  // Duet & Multi-speaker alignment resolution
  const resolvedSpeakerAlignments = useMemo(() => {
    if (speakerAlignments) return speakerAlignments;

    const distinctSpeakers: string[] = [];
    const unisonRegex = /^(?:both|all|together|chorus|unison|duet|everyone)$/i;

    for (const line of document.lines) {
      if (line.speaker) {
        const s = line.speaker.trim();
        if (!unisonRegex.test(s) && !distinctSpeakers.includes(s)) {
          distinctSpeakers.push(s);
        }
      }
    }

    const isDuet =
      duetMode === true ||
      (duetMode === 'auto' && distinctSpeakers.length >= 2);

    if (!isDuet) return null;

    const mapping: Record<string, 'left' | 'right' | 'center'> = {};
    if (distinctSpeakers[0]) {
      mapping[distinctSpeakers[0]] = 'left';
    }
    if (distinctSpeakers[1]) {
      mapping[distinctSpeakers[1]] = 'right';
    }
    for (let i = 2; i < distinctSpeakers.length; i++) {
      mapping[distinctSpeakers[i]!] = i % 2 === 0 ? 'left' : 'right';
    }
    return mapping;
  }, [document.lines, duetMode, speakerAlignments]);

  const getLineAlignment = useCallback(
    (
      line: LyricsDocument['lines'][0],
      index: number
    ): 'left' | 'right' | 'center' => {
      if (getSpeakerAlignment) {
        return getSpeakerAlignment(line.speaker, index);
      }
      if (line.speaker && resolvedSpeakerAlignments) {
        const s = line.speaker.trim();
        const unisonRegex =
          /^(?:both|all|together|chorus|unison|duet|everyone)$/i;
        if (unisonRegex.test(s)) {
          return 'center';
        }
        if (resolvedSpeakerAlignments[s]) {
          return resolvedSpeakerAlignments[s]!;
        }
      }
      const baseAlign = (activeLineStyle as any)?.textAlign;
      return baseAlign === 'right'
        ? 'right'
        : baseAlign === 'center'
          ? 'center'
          : 'left';
    },
    [activeLineStyle, getSpeakerAlignment, resolvedSpeakerAlignments]
  );

  return (
    <View
      style={[styles.container, containerStyle]}
      onLayout={(e) => setScrollViewHeight(e.nativeEvent.layout.height)}
    >
      {showResumeScroll && showResumeAutoscrollButton && (
        <View
          style={[styles.resumeButtonContainer, resumeAutoscrollButtonStyle]}
        >
          <Pressable
            onPress={handleResumeAutoscrollPress}
            style={styles.resumeButtonPressable}
            accessibilityRole="button"
            accessibilityLabel="Resume Autoscroll"
          >
            <Text style={[styles.resumeButtonText, resumeAutoscrollTextStyle]}>
              {resumeAutoscrollText}
            </Text>
          </Pressable>
        </View>
      )}

      <Animated.ScrollView
        ref={scrollViewRef}
        style={[
          styles.scrollView,
          Platform.OS === 'web' ? ({ scrollBehavior: 'smooth' } as any) : {},
        ]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: scrollViewHeight > 0 ? scrollViewHeight / 2 : 300,
          paddingHorizontal: 12,
        }}
        {...(Platform.OS === 'web'
          ? {
              onWheel: () => {
                handleScrollBegin();
                handleScrollEnd();
              },
            }
          : {})}
      >
        {document.lines.map((line, index) => (
          <LyricLineView
            key={index}
            index={index}
            line={line}
            time={activeTime}
            alignment={getLineAlignment(line, index)}
            onLayoutLine={handleLayoutLine}
            onPress={() => handleLinePress(line, index)}
            activeLineStyle={activeLineStyle}
            inactiveLineStyle={inactiveLineStyle}
            pastLineStyle={pastLineStyle}
            futureLineStyle={futureLineStyle}
            lineStyle={lineStyle}
            translationStyle={translationStyle}
            romanizationContainerStyle={romanizationContainerStyle}
            romanizationTextStyle={romanizationTextStyle}
            motionDuration={motionDuration}
            enableWordAnimation={enableWordAnimation}
            glowDurationThreshold={glowDurationThreshold}
            shadowAmount={shadowAmount}
            showSpeakerBadge={showSpeakerBadge}
            speakerTagStyle={speakerTagStyle}
            instrumentalContainerStyle={instrumentalContainerStyle}
            instrumentalTextStyle={instrumentalTextStyle}
            renderInstrumentalBreak={renderInstrumentalBreak}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  resumeButtonContainer: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    zIndex: 999,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.35)',
        } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        }),
  },
  resumeButtonPressable: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(28, 44, 62, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          cursor: 'pointer',
        } as any)
      : {}),
  },
  resumeButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
