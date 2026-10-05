import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import type { LayoutChangeEvent, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { LyricLine, LyricWord } from '../core/types';

export interface LyricLineViewProps {
  line: LyricLine;
  index: number;
  time: SharedValue<number>;
  onLayoutLine: (index: number, y: number, height: number) => void;
  onPress?: () => void;
  activeLineStyle?: TextStyle;
  inactiveLineStyle?: TextStyle;
  pastLineStyle?: TextStyle;
  futureLineStyle?: TextStyle;
  lineStyle?: ViewStyle;
  translationStyle?: TextStyle;
  romanizationContainerStyle?: ViewStyle;
  romanizationTextStyle?: TextStyle;
  motionDuration?: number;
  enableWordAnimation?: boolean;
  glowDurationThreshold?: number;
  shadowAmount?: number;
  alignment?: 'left' | 'right' | 'center';
  speakerTagStyle?: TextStyle;
  showSpeakerBadge?: boolean;
  instrumentalContainerStyle?: ViewStyle;
  instrumentalTextStyle?: TextStyle;
  renderInstrumentalBreak?: (
    line: LyricLine,
    isActive: boolean
  ) => React.ReactNode;
}

const isWeb = (Platform.OS as string) === 'web';

const CustomInstrumentalBreakView = memo(
  function CustomInstrumentalBreakViewComponent({
    line,
    time,
    render,
  }: {
    line: LyricLine;
    time: SharedValue<number>;
    render: (line: LyricLine, isActive: boolean) => React.ReactNode;
  }) {
    const [isActive, setIsActive] = useState(false);

    useAnimatedReaction(
      () => time.value >= line.startMs && time.value < line.endMs,
      (active, prev) => {
        if (active !== prev) {
          runOnJS(setIsActive)(active);
        }
      }
    );

    return <>{render(line, isActive)}</>;
  }
);

const LyricWordView = memo(function LyricWordViewComponent({
  word,
  time,
  line,
  activeColor,
  inactiveColor,
  motionDuration = 300,
  glowDurationThreshold = 750,
  shadowAmount = 8,
  style,
  isPillWord = false,
  hasSpaceAfter = false,
}: {
  word: LyricWord;
  time: SharedValue<number>;
  line: LyricLine;
  activeColor: string;
  inactiveColor: string;
  motionDuration?: number;
  glowDurationThreshold?: number;
  shadowAmount?: number;
  style?: TextStyle;
  isPillWord?: boolean;
  hasSpaceAfter?: boolean;
}) {
  const animatedWordStyle = useAnimatedStyle(() => {
    const isLineActive = time.value >= line.startMs && time.value < line.endMs;

    // Line is not active (past or future line)
    if (!isLineActive) {
      return {
        color: inactiveColor,
        opacity: isPillWord ? 0.8 : 1,
        transform: [{ translateY: 0 }],
        ...(isWeb
          ? ({
              textShadow: 'none',
              backgroundImage: 'none',
              WebkitTextFillColor: inactiveColor,
              filter: 'none',
            } as any)
          : {
              textShadowColor: 'transparent',
              textShadowRadius: 0,
              textShadowOffset: { width: 0, height: 0 },
            }),
      };
    }

    const start = word.startMs;
    const end =
      word.endMs > word.startMs ? word.endMs : word.startMs + motionDuration;

    if (time.value < start) {
      // Future word within active line (waiting to be sung)
      return {
        color: inactiveColor,
        opacity: isPillWord ? 0.7 : 0.55,
        transform: [{ translateY: 0 }],
        ...(isWeb
          ? ({
              textShadow: 'none',
              backgroundImage: 'none',
              WebkitTextFillColor: inactiveColor,
              filter: 'none',
            } as any)
          : {
              textShadowColor: 'transparent',
              textShadowRadius: 0,
              textShadowOffset: { width: 0, height: 0 },
            }),
      };
    } else if (time.value >= end) {
      // Past word within active line (already sung)
      return {
        color: activeColor,
        opacity: 1,
        transform: [{ translateY: 0 }],
        ...(isWeb
          ? ({
              textShadow: 'none',
              backgroundImage: 'none',
              WebkitTextFillColor: activeColor,
              filter: 'none',
            } as any)
          : {
              textShadowColor: 'transparent',
              textShadowRadius: 0,
              textShadowOffset: { width: 0, height: 0 },
            }),
      };
    } else {
      // Word is actively being sung right now!
      const duration = end - start;
      const isLongWord = duration >= glowDurationThreshold;
      const rawProgress = (time.value - start) / Math.max(duration, 1);
      const progress = Number.isNaN(rawProgress) ? 0 : rawProgress;
      const clamped = Math.max(0, Math.min(1, progress));
      const pct = (clamped * 100).toFixed(1);

      // Translate text Y-axis while singing (preserved and distinct)
      const translateY = isPillWord
        ? 0
        : interpolate(
            clamped,
            [0, 0.25, 0.75, 1],
            [0, isLongWord ? -3.5 : -2, isLongWord ? -3 : -1.5, 0],
            Extrapolation.CLAMP
          );

      // Glow effect is ONLY shadow of text (controlled by shadowAmount)
      const glowRadius = isLongWord
        ? isPillWord
          ? Math.round(shadowAmount * 0.6)
          : shadowAmount
        : 0;

      if (isWeb) {
        return {
          color: 'transparent',
          opacity: 1,
          transform: [{ translateY }],
          backgroundImage: `linear-gradient(90deg, ${activeColor} 0%, ${activeColor} ${pct}%, ${inactiveColor} ${pct}%, ${inactiveColor} 100%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter:
            isLongWord && glowRadius > 0
              ? `drop-shadow(0 0 ${glowRadius}px ${activeColor})`
              : 'none',
        } as any;
      } else {
        const color = interpolateColor(
          clamped,
          [0, 0.35, 1],
          [inactiveColor, activeColor, activeColor]
        );
        return {
          color,
          opacity: 1,
          transform: [{ translateY }],
          ...(isWeb
            ? ({
                textShadow:
                  isLongWord && glowRadius > 0
                    ? `0 0 ${glowRadius}px ${activeColor}`
                    : 'none',
              } as any)
            : {
                textShadowColor: isLongWord ? activeColor : 'transparent',
                textShadowRadius: glowRadius,
                textShadowOffset: { width: 0, height: 0 },
              }),
        };
      }
    }
  });

  const cleanWordText = word.text.trim();

  return (
    <Animated.Text style={[styles.wordBase, style, animatedWordStyle]}>
      {cleanWordText}
      {hasSpaceAfter ? ' ' : ''}
    </Animated.Text>
  );
});

export const EqualizerBar = memo(function EqualizerBarComponent({
  time,
  lineStartMs,
  lineEndMs,
  minHeight = 5,
  maxHeight = 18,
  periodMs = 450,
  phase = 0,
  width = 3.5,
  marginHorizontal = 2,
  activeColor,
  inactiveColor,
}: {
  time: SharedValue<number>;
  lineStartMs: number;
  lineEndMs: number;
  minHeight?: number;
  maxHeight?: number;
  periodMs?: number;
  phase?: number;
  width?: number;
  marginHorizontal?: number;
  activeColor: string;
  inactiveColor: string;
}) {
  const animatedBarStyle = useAnimatedStyle(() => {
    const isActive = time.value >= lineStartMs && time.value < lineEndMs;
    if (!isActive) {
      return {
        height: minHeight,
        backgroundColor: inactiveColor,
        opacity: 0.35,
      };
    }
    const elapsed = time.value - lineStartMs;
    const progress =
      (Math.sin(((elapsed + phase) / periodMs) * Math.PI * 2) + 1) / 2;
    const height = minHeight + progress * (maxHeight - minHeight);
    return {
      height,
      backgroundColor: activeColor,
      opacity: 1,
    };
  });

  return (
    <Animated.View
      style={[
        styles.equalizerBar,
        { width, marginHorizontal },
        animatedBarStyle,
      ]}
    />
  );
});

const MUSIC_NOTE_PATH =
  'M12 5v8.55c-.94-.54-2.1-.75-3.33-.32-1.34.48-2.37 1.67-2.61 3.07a4.007 4.007 0 0 0 4.59 4.65c1.96-.31 3.35-2.11 3.35-4.1V7h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2c-1.1 0-2 .9-2 2z';

let RNSvgComponent: any = null;
let RNPathComponent: any = null;
try {
  const svgModule = require('react-native-svg');
  RNSvgComponent = svgModule.Svg || svgModule.default;
  RNPathComponent = svgModule.Path;
} catch {
  // react-native-svg is optional peer
}

function MusicNoteSvg({
  size,
  color,
  isGlow = false,
  shadowAmount = 8,
}: {
  size: number;
  color: string;
  isGlow?: boolean;
  shadowAmount?: number;
}) {
  const glowStyle =
    isGlow && shadowAmount > 0
      ? isWeb
        ? ({ filter: `drop-shadow(0 0 ${shadowAmount}px ${color})` } as any)
        : {
            shadowColor: color,
            shadowRadius: shadowAmount,
            shadowOpacity: 0.9,
            shadowOffset: { width: 0, height: 0 },
            elevation: shadowAmount,
          }
      : {};

  if (isWeb) {
    return (
      <View style={[{ width: size, height: size }, glowStyle]}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <path d={MUSIC_NOTE_PATH} fill={color} />
        </svg>
      </View>
    );
  }

  if (RNSvgComponent && RNPathComponent) {
    const SvgComp = RNSvgComponent;
    const PathComp = RNPathComponent;
    return (
      <View style={[{ width: size, height: size }, glowStyle]}>
        <SvgComp width={size} height={size} viewBox="0 0 24 24">
          <PathComp d={MUSIC_NOTE_PATH} fill={color} />
        </SvgComp>
      </View>
    );
  }

  return (
    <Text
      style={[
        styles.musicNoteText,
        {
          fontSize: size,
          lineHeight: size,
          color,
          ...(isGlow && shadowAmount > 0
            ? isWeb
              ? ({ textShadow: `0 0 ${shadowAmount}px ${color}` } as any)
              : {
                  textShadowColor: color,
                  textShadowRadius: shadowAmount,
                  textShadowOffset: { width: 0, height: 0 },
                }
            : isWeb
              ? ({ textShadow: 'none' } as any)
              : {}),
        },
      ]}
    >
      ♪
    </Text>
  );
}

const InstrumentalBreakView = memo(function InstrumentalBreakViewComponent({
  line,
  time,
  activeColor,
  inactiveColor,
  alignment = 'center',
  containerStyle,
  textStyle,
  activeLineStyle,
  inactiveLineStyle,
  shadowAmount = 8,
}: {
  line: LyricLine;
  time: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  alignment?: 'left' | 'right' | 'center';
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  activeLineStyle?: TextStyle;
  inactiveLineStyle?: TextStyle;
  shadowAmount?: number;
}) {
  const alignSelf =
    alignment === 'left'
      ? 'flex-start'
      : alignment === 'right'
        ? 'flex-end'
        : 'center';

  const flatTextStyle = StyleSheet.flatten(textStyle);
  const flatActiveStyle = StyleSheet.flatten(activeLineStyle);
  const flatInactiveStyle = StyleSheet.flatten(inactiveLineStyle);

  const rawFontSize =
    flatTextStyle?.fontSize ??
    flatActiveStyle?.fontSize ??
    flatInactiveStyle?.fontSize ??
    28;
  const baseFontSize = typeof rawFontSize === 'number' ? rawFontSize : 28;

  const iconSize =
    flatTextStyle?.width && typeof flatTextStyle.width === 'number'
      ? flatTextStyle.width
      : Math.max(18, Math.round(baseFontSize * 1.25));

  const glowPad = Math.max(shadowAmount * 2, 16);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const isActive = time.value >= line.startMs && time.value < line.endMs;
    const isPast = time.value >= line.endMs;
    let targetOpacity = 0.55;
    if (isActive) targetOpacity = 1;
    else if (isPast) targetOpacity = 0.35;

    return {
      opacity: withTiming(targetOpacity, { duration: 300 }),
      transform: [
        {
          translateY: withTiming(isActive ? -2 : 0, { duration: 300 }),
        },
      ],
    };
  }, [line.startMs, line.endMs]);

  const animatedVerticalLoadingStyle = useAnimatedStyle(() => {
    const isActive = time.value >= line.startMs && time.value < line.endMs;
    const isPast = time.value >= line.endMs;

    if (!isActive && !isPast) {
      // Future: 0% loaded
      return {
        height: 0,
        opacity: 0,
      };
    }

    if (isPast) {
      // Past: smoothly fade out active fill so base inactive note remains visible at past opacity
      return {
        height: iconSize + glowPad,
        opacity: withTiming(0, { duration: 300 }),
      };
    }

    // Active: vertical fill/loading from bottom to top based on break progress
    const duration = Math.max(line.endMs - line.startMs, 1);
    const progress = Math.max(
      0,
      Math.min(1, (time.value - line.startMs) / duration)
    );
    const filledHeight = progress * iconSize;

    return {
      height: filledHeight + glowPad,
      opacity: 1,
    };
  }, [iconSize, glowPad, line.startMs, line.endMs]);

  return (
    <Animated.View
      style={[
        styles.musicNoteContainer,
        { alignSelf },
        containerStyle,
        animatedContainerStyle,
      ]}
    >
      <View
        style={{
          width: iconSize,
          height: iconSize,
          position: 'relative',
        }}
      >
        {/* Inactive base SVG icon */}
        <MusicNoteSvg
          size={iconSize}
          color={inactiveColor}
          isGlow={false}
          shadowAmount={0}
        />

        {/* Active glowing SVG loading vertically from bottom to top */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: -glowPad,
              left: -glowPad,
              right: -glowPad,
              overflow: 'hidden',
            },
            animatedVerticalLoadingStyle,
          ]}
        >
          <View
            style={{
              position: 'absolute',
              bottom: glowPad,
              left: glowPad,
              width: iconSize,
              height: iconSize,
            }}
          >
            <MusicNoteSvg
              size={iconSize}
              color={activeColor}
              isGlow={true}
              shadowAmount={shadowAmount}
            />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
});

export const LyricLineView = memo(function LyricLineViewComponent({
  line,
  index,
  time,
  onLayoutLine,
  onPress,
  activeLineStyle,
  inactiveLineStyle,
  pastLineStyle,
  futureLineStyle,
  lineStyle,
  translationStyle,
  romanizationContainerStyle,
  romanizationTextStyle,
  motionDuration = 300,
  enableWordAnimation = true,
  glowDurationThreshold = 750,
  shadowAmount = 8,
  alignment,
  speakerTagStyle,
  showSpeakerBadge,
  instrumentalContainerStyle,
  instrumentalTextStyle,
  renderInstrumentalBreak,
}: LyricLineViewProps) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayoutLine(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height);
    },
    [index, onLayoutLine]
  );

  const activeColor = (activeLineStyle?.color as string) || '#ffffff';
  const inactiveColor =
    (inactiveLineStyle?.color as string) || 'rgba(255, 255, 255, 0.4)';

  const romanizationWords = useMemo(() => {
    if (!line.romanization) return null;
    const split = line.romanization.trim().split(/\s+/);
    if (enableWordAnimation && line.words && line.words.length > 0) {
      return split.map((text, i) => {
        const sourceWord = line.words![Math.min(i, line.words!.length - 1)];
        if (!sourceWord) {
          return { text, startMs: line.startMs, endMs: line.endMs };
        }
        return {
          text,
          startMs: sourceWord.startMs,
          endMs: sourceWord.endMs || sourceWord.startMs + 1000,
        };
      });
    }
    return [
      { text: line.romanization, startMs: line.startMs, endMs: line.endMs },
    ];
  }, [
    line.romanization,
    line.words,
    line.startMs,
    line.endMs,
    enableWordAnimation,
  ]);

  const wordSpaces = useMemo(() => {
    if (!line.words || line.words.length === 0) return [];
    const fullText = (line.text || '').trim();
    let searchIndex = 0;
    return line.words.map((w, idx) => {
      if (idx === line.words!.length - 1) return false;
      const nextW = line.words![idx + 1];
      if (w.text.endsWith(' ') || w.text.endsWith('\u00A0')) return true;
      if (
        nextW &&
        (nextW.text.startsWith(' ') || nextW.text.startsWith('\u00A0'))
      ) {
        return true;
      }

      if (!fullText) return true;

      const clean = w.text.trim();
      if (!clean) return false;

      let foundAt = fullText.indexOf(clean, searchIndex);
      if (foundAt === -1) {
        foundAt = fullText
          .toLowerCase()
          .indexOf(clean.toLowerCase(), searchIndex);
      }

      if (foundAt === -1) {
        return true;
      }

      const afterCharIndex = foundAt + clean.length;
      searchIndex = afterCharIndex;

      if (afterCharIndex < fullText.length) {
        const nextClean = nextW ? nextW.text.trim() : '';
        if (nextClean) {
          let nextFoundAt = fullText.indexOf(nextClean, afterCharIndex);
          if (nextFoundAt === -1) {
            nextFoundAt = fullText
              .toLowerCase()
              .indexOf(nextClean.toLowerCase(), afterCharIndex);
          }
          if (nextFoundAt !== -1) {
            const gap = fullText.slice(afterCharIndex, nextFoundAt);
            return /\s/.test(gap);
          }
        }
        return /\s/.test(fullText[afterCharIndex] || '');
      }
      return false;
    });
  }, [line.words, line.text]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const isActive = time.value >= line.startMs && time.value < line.endMs;
    const isPast = time.value >= line.endMs;

    let targetOpacity = 0.55;
    if (isActive) {
      targetOpacity = 1;
    } else if (isPast) {
      targetOpacity = 0.35;
    }

    return {
      opacity: withTiming(targetOpacity, { duration: motionDuration }),
      transform: [
        {
          translateY: withTiming(isActive ? -2 : 0, {
            duration: motionDuration,
          }),
        },
      ],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const isActive = time.value >= line.startMs && time.value < line.endMs;
    const isPast = time.value >= line.endMs;

    let styleToUse = inactiveLineStyle;
    if (isActive) styleToUse = activeLineStyle;
    else if (isPast && pastLineStyle) styleToUse = pastLineStyle;
    else if (!isPast && !isActive && futureLineStyle)
      styleToUse = futureLineStyle;

    return {
      ...(styleToUse || {}),
      color: withTiming(isActive ? activeColor : inactiveColor, {
        duration: motionDuration,
      }),
    };
  });

  const animatedRomanizationStyle = useAnimatedStyle(() => {
    const isActive = time.value >= line.startMs && time.value < line.endMs;
    return {
      opacity: withTiming(isActive ? 1 : 0.6, { duration: motionDuration }),
      color: withTiming(isActive ? activeColor : 'rgba(255, 255, 255, 0.6)', {
        duration: motionDuration,
      }),
    };
  });

  const resolvedAlign =
    alignment || (activeLineStyle as any)?.textAlign || 'center';
  const alignItems =
    resolvedAlign === 'left'
      ? 'flex-start'
      : resolvedAlign === 'right'
        ? 'flex-end'
        : 'center';
  const textAlign = resolvedAlign;

  if (line.isInstrumental) {
    return (
      <Animated.View
        onLayout={handleLayout}
        style={[styles.container, lineStyle, animatedContainerStyle]}
      >
        <Pressable
          onPress={onPress}
          style={[styles.pressableBlock, { alignItems }]}
        >
          {renderInstrumentalBreak ? (
            <CustomInstrumentalBreakView
              line={line}
              time={time}
              render={renderInstrumentalBreak}
            />
          ) : (
            <InstrumentalBreakView
              line={line}
              time={time}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              alignment={resolvedAlign}
              containerStyle={instrumentalContainerStyle}
              textStyle={instrumentalTextStyle}
              activeLineStyle={activeLineStyle}
              inactiveLineStyle={inactiveLineStyle}
              shadowAmount={shadowAmount}
            />
          )}
        </Pressable>
      </Animated.View>
    );
  }

  const hasWords = enableWordAnimation && line.words && line.words.length > 0;

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[styles.container, lineStyle, animatedContainerStyle]}
    >
      <Pressable
        onPress={onPress}
        style={[styles.pressableBlock, { alignItems }]}
      >
        {line.speaker && (showSpeakerBadge ?? true) ? (
          <View
            style={[styles.speakerBadgeContainer, { alignSelf: alignItems }]}
          >
            <Text
              style={[
                styles.speakerTag,
                speakerTagStyle,
                { color: activeColor },
              ]}
            >
              {line.speaker}
            </Text>
          </View>
        ) : null}

        {hasWords ? (
          <View
            style={[
              styles.wordsRow,
              {
                justifyContent:
                  alignItems === 'center'
                    ? 'center'
                    : alignItems === 'flex-start'
                      ? 'flex-start'
                      : 'flex-end',
              },
            ]}
          >
            {line.words!.map((word, i) => (
              <LyricWordView
                key={i}
                word={word}
                time={time}
                line={line}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                motionDuration={motionDuration}
                glowDurationThreshold={glowDurationThreshold}
                shadowAmount={shadowAmount}
                style={activeLineStyle}
                hasSpaceAfter={wordSpaces[i] ?? false}
              />
            ))}
          </View>
        ) : (
          <Animated.Text
            style={[styles.defaultLine, animatedTextStyle, { textAlign }]}
          >
            {line.text}
          </Animated.Text>
        )}

        {romanizationWords && romanizationWords.length > 0 ? (
          <View
            style={[
              styles.defaultRomanizationContainer,
              romanizationContainerStyle,
              {
                alignSelf:
                  alignItems === 'center'
                    ? 'center'
                    : alignItems === 'flex-start'
                      ? 'flex-start'
                      : 'flex-end',
              },
            ]}
          >
            {hasWords ? (
              romanizationWords.map((rw, i) => (
                <LyricWordView
                  key={`rom-${i}`}
                  word={rw}
                  time={time}
                  line={line}
                  activeColor={activeColor}
                  inactiveColor={inactiveColor}
                  motionDuration={motionDuration}
                  glowDurationThreshold={glowDurationThreshold}
                  shadowAmount={shadowAmount}
                  style={
                    romanizationTextStyle || styles.defaultRomanizationText
                  }
                  isPillWord={true}
                  hasSpaceAfter={i < romanizationWords.length - 1}
                />
              ))
            ) : (
              <Animated.Text
                style={[
                  styles.defaultRomanizationText,
                  romanizationTextStyle,
                  animatedRomanizationStyle,
                ]}
              >
                {line.romanization}
              </Animated.Text>
            )}
          </View>
        ) : null}

        {line.translation ? (
          <Text
            style={[styles.defaultTranslation, { textAlign }, translationStyle]}
          >
            {line.translation}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  pressableBlock: {
    justifyContent: 'center',
    width: '100%',
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    width: '100%',
  },
  wordBase: {
    ...(isWeb
      ? ({
          display: 'inline-block',
          verticalAlign: 'baseline',
        } as any)
      : {}),
  },
  speakerBadgeContainer: {
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  speakerTag: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    opacity: 0.85,
    textTransform: 'uppercase',
  },
  defaultLine: {
    fontSize: 24,
    lineHeight: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  defaultRomanizationContainer: {
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  defaultRomanizationText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  defaultTranslation: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 26,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '500',
  },
  instrumentalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginVertical: 4,
    ...(isWeb
      ? ({
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        } as any)
      : {}),
  },
  musicBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  musicIconText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  equalizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    marginRight: 12,
  },
  equalizerBar: {
    width: 3.5,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  instrumentalLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  musicNoteContainer: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  musicNoteText: {
    fontWeight: '700',
    includeFontPadding: false,
    ...(isWeb
      ? ({
          userSelect: 'none',
        } as any)
      : {}),
  },
});
