import { useMemo, useCallback, useEffect, useState } from 'react';
import {
  Platform,
  requireNativeComponent,
  UIManager,
  View,
  StyleSheet,
} from 'react-native';
import type { ViewStyle, NativeSyntheticEvent } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { LyricLine } from '../core/types';
import { LyricsViewer } from './LyricsViewer';
import type { LyricsViewerProps } from './LyricsViewer';

export interface NativeLyricsViewerProps extends Omit<
  LyricsViewerProps,
  'containerStyle'
> {
  containerStyle?: ViewStyle;
  activeColor?: string;
  inactiveColor?: string;
  textSize?: number;
  lineSpacing?: number;
}

interface NativeLyricsViewComponentProps {
  style?: ViewStyle;
  lyricsJson?: string;
  currentTime?: number;
  activeColor?: string;
  inactiveColor?: string;
  textSize?: number;
  lineSpacing?: number;
  enableWordAnimation?: boolean;
  autoScroll?: boolean;
  onLinePress?: (
    event: NativeSyntheticEvent<{ index: number; timeMs: number }>
  ) => void;
}

const isAndroid = Platform.OS === 'android';
const hasNativeComponent =
  isAndroid && Boolean(UIManager.getViewManagerConfig?.('BetterLyricsView'));

const NativeBetterLyricsComponent = hasNativeComponent
  ? requireNativeComponent<NativeLyricsViewComponentProps>('BetterLyricsView')
  : null;

/**
 * NativeLyricsViewer renders Echo-Music's high-performance native Android LRC view on Android,
 * and automatically falls back to the Reanimated LyricsViewer on iOS and Web.
 */
export function NativeLyricsViewer(props: NativeLyricsViewerProps) {
  const {
    document,
    currentTimeMs,
    containerStyle,
    activeColor = '#ffffff',
    inactiveColor = 'rgba(255, 255, 255, 0.45)',
    textSize = 24,
    lineSpacing = 1.15,
    enableWordAnimation = true,
    onLinePress,
    ...rest
  } = props;

  const isSharedValue =
    typeof currentTimeMs === 'object' &&
    currentTimeMs !== null &&
    'value' in currentTimeMs;

  // Track numeric current time for the native prop
  const [numericTime, setNumericTime] = useState<number>(() => {
    if (typeof currentTimeMs === 'number') {
      return currentTimeMs;
    }
    return 0;
  });

  useEffect(() => {
    if (typeof currentTimeMs === 'number') {
      setNumericTime(currentTimeMs);
    }
  }, [currentTimeMs]);

  useAnimatedReaction(
    () => {
      if (!isSharedValue) return 0;
      // Quantize to 200ms: Android native view extrapolates smoothly on every vsync frame (60/120 FPS)
      return (
        Math.floor((currentTimeMs as SharedValue<number>).value / 200) * 200
      );
    },
    (curr, prev) => {
      if (isSharedValue && curr !== prev) {
        runOnJS(setNumericTime)(curr);
      }
    },
    [isSharedValue, currentTimeMs]
  );

  // Serialized JSON for native Android view
  const lyricsJson = useMemo(() => {
    if (!document || !document.lines) return '[]';
    return JSON.stringify(document.lines);
  }, [document]);

  const handleNativeLinePress = useCallback(
    (event: NativeSyntheticEvent<{ index: number; timeMs: number }>) => {
      const { index } = event.nativeEvent;
      const line: LyricLine | undefined = document?.lines[index];
      if (line && onLinePress) {
        onLinePress(line, index);
      }
    },
    [document, onLinePress]
  );

  if (isAndroid && NativeBetterLyricsComponent) {
    return (
      <View style={[styles.container, containerStyle]}>
        <NativeBetterLyricsComponent
          style={styles.nativeView}
          lyricsJson={lyricsJson}
          currentTime={numericTime}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
          textSize={textSize}
          lineSpacing={lineSpacing}
          enableWordAnimation={enableWordAnimation}
          autoScroll={true}
          onLinePress={handleNativeLinePress}
        />
      </View>
    );
  }

  // Graceful fallback to Reanimated LyricsViewer
  return (
    <LyricsViewer
      document={document}
      currentTimeMs={currentTimeMs}
      containerStyle={containerStyle}
      enableWordAnimation={enableWordAnimation}
      onLinePress={onLinePress}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  nativeView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
