import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  TextInput,
  Switch,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { LyricsViewer, parseLRC } from 'react-native-better-lyrics';
import { parseTTML } from '../../src/ttml/ttmlParser';
import { parseVTT } from '../../src/vtt/vttParser';
import type { LyricsDocument } from 'react-native-better-lyrics';
import {
  PRESET_SONGS,
  fetchBetterLyrics,
  extractYouTubeId,
  type SongPreset,
} from './betterlyrics';
import { YouTubePlayer, type YouTubePlayerRef } from './YouTubePlayer';

function formatTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function App() {
  const currentTime = useSharedValue(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSettings, setIsSettings] = useState(false);

  // Song and YouTube sync state
  const [currentSong, setCurrentSong] = useState<SongPreset>(PRESET_SONGS[0]!);
  const [showVideo, setShowVideo] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerRef>(null);

  // Search & API Form State
  const [searchSong, setSearchSong] = useState(PRESET_SONGS[0]!.title);
  const [searchArtist, setSearchArtist] = useState(PRESET_SONGS[0]!.artist);
  const [searchVideoId, setSearchVideoId] = useState(PRESET_SONGS[0]!.videoId);
  const [searchEndpoint, setSearchEndpoint] = useState<string>('/getLyrics');
  const [searchApiKey, setSearchApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<'presets' | 'search' | 'paste'>(
    'presets'
  );
  const [customRawText, setCustomRawText] = useState('');
  const [customRawFormat, setCustomRawFormat] = useState<
    'TTML' | 'LRC' | 'VTT'
  >('TTML');

  // Lyrics Document
  const [doc, setDoc] = useState<LyricsDocument>({
    metadata: {
      title: PRESET_SONGS[0]!.title,
      artist: PRESET_SONGS[0]!.artist,
    },
    lines: [],
    warnings: [],
  });

  // Visual & Feature Toggles
  const [showBlurBg, setShowBlurBg] = useState(false);
  const [showControls] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showRomanization, setShowRomanization] = useState(true);
  const [duetMode, setDuetMode] = useState<boolean | 'auto'>('auto');
  const [showSpeakerBadge, setShowSpeakerBadge] = useState(true);
  const [syncOffset, setSyncOffset] = useState(0);
  const [theme, setTheme] = useState<'Ambient' | 'Fluid' | 'Classic'>(
    'Ambient'
  );
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(
    'left'
  );

  // Typography overrides
  const [fontSize, setFontSize] = useState(30);
  const [lineGap, setLineGap] = useState(16);
  const [fontFamily, setFontFamily] = useState('System');
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [inactiveOpacity, setInactiveOpacity] = useState(0.4);

  // Romanization customization
  const [pillBorderColor] = useState('rgba(255, 255, 255, 0.2)');
  const [pillBorderWidth] = useState(1);
  const [pillBorderRadius] = useState(14);
  const [pillBgColor] = useState('rgba(0, 0, 0, 0.35)');
  const [pillFontSize] = useState(14);

  // Translation customization
  const [translationColor] = useState('rgba(255, 255, 255, 0.7)');
  const [translationFontSize] = useState(18);

  // Animation Props
  const [motionDuration, setMotionDuration] = useState(400);
  const [resyncDelay, setResyncDelay] = useState(1500);
  const [glowThreshold, setGlowThreshold] = useState(750);
  const [shadowAmount, setShadowAmount] = useState(8);

  // Background Animation Loop
  const bgRotation = useSharedValue(0);
  const bgScale = useSharedValue(1);

  useEffect(() => {
    bgRotation.value = withRepeat(
      withTiming(360, { duration: 30000, easing: Easing.linear }),
      -1,
      false
    );
    bgScale.value = withRepeat(
      withTiming(1.3, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [bgRotation, bgScale]);

  // Initial load from betterlyrics.org
  useEffect(() => {
    let isMounted = true;
    setIsLoadingLyrics(true);
    setLyricsError(null);

    fetchBetterLyrics({
      song: PRESET_SONGS[0]!.title,
      artist: PRESET_SONGS[0]!.artist,
      videoId: PRESET_SONGS[0]!.videoId,
    })
      .then((loadedDoc) => {
        if (isMounted) {
          setDoc(loadedDoc);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLyricsError(err.message || 'Failed to fetch lyrics');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingLyrics(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectPreset = async (preset: SongPreset) => {
    setIsLoadingLyrics(true);
    setLyricsError(null);
    setPlayerError(null);
    currentTime.value = 0;
    setCurrentTimeMs(0);

    try {
      const loadedDoc = await fetchBetterLyrics({
        song: preset.title,
        artist: preset.artist,
        videoId: preset.videoId,
      });
      setDoc(loadedDoc);
      setCurrentSong(preset);
      setSearchSong(preset.title);
      setSearchArtist(preset.artist);
      setSearchVideoId(preset.videoId);
      setIsEditing(false);
      setIsPlaying(true);
      ytPlayerRef.current?.seekTo(0);
      ytPlayerRef.current?.playVideo();
    } catch (err: any) {
      setLyricsError(
        err.message || 'Failed to fetch lyrics from api.betterlyrics.org'
      );
    } finally {
      setIsLoadingLyrics(false);
    }
  };

  const handleSearchSong = async () => {
    if (!searchSong.trim() || !searchArtist.trim()) {
      setLyricsError('Song and Artist names are required.');
      return;
    }

    setIsLoadingLyrics(true);
    setLyricsError(null);
    setPlayerError(null);
    currentTime.value = 0;
    setCurrentTimeMs(0);

    try {
      const cleanVideoId = extractYouTubeId(searchVideoId);
      const loadedDoc = await fetchBetterLyrics({
        song: searchSong.trim(),
        artist: searchArtist.trim(),
        videoId: cleanVideoId,
        endpoint: searchEndpoint,
        apiKey: searchApiKey.trim() || undefined,
      });

      setDoc(loadedDoc);
      setCurrentSong({
        id: cleanVideoId || `${searchSong}-${searchArtist}`,
        title: searchSong.trim(),
        artist: searchArtist.trim(),
        videoId: cleanVideoId || currentSong.videoId,
      });
      setIsEditing(false);
      setIsPlaying(true);
      ytPlayerRef.current?.seekTo(0);
      ytPlayerRef.current?.playVideo();
    } catch (err: any) {
      setLyricsError(
        err.message || 'Failed to fetch lyrics from api.betterlyrics.org'
      );
    } finally {
      setIsLoadingLyrics(false);
    }
  };

  const handleApplyCustomLyrics = () => {
    try {
      let parsed: LyricsDocument;
      if (customRawFormat === 'TTML') parsed = parseTTML(customRawText);
      else if (customRawFormat === 'VTT') parsed = parseVTT(customRawText);
      else parsed = parseLRC(customRawText);

      if (!parsed.lines || parsed.lines.length === 0) {
        setLyricsError('Parsed lyrics contained 0 lines.');
        return;
      }

      setDoc(parsed);
      setIsEditing(false);
      currentTime.value = 0;
      setCurrentTimeMs(0);
      ytPlayerRef.current?.seekTo(0);
    } catch (err: any) {
      setLyricsError(err.message || 'Failed to parse raw lyrics text.');
    }
  };

  const lastTimeUpdateRef = useRef(0);
  const handleTimeUpdate = useCallback(
    (timeMs: number) => {
      currentTime.value = timeMs;
      const now = Date.now();
      if (now - lastTimeUpdateRef.current >= 400) {
        lastTimeUpdateRef.current = now;
        setCurrentTimeMs(timeMs);
      }
    },
    [currentTime]
  );

  const handleDuration = useCallback((durMs: number) => {
    setDurationMs(durMs);
  }, []);

  const handleStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const handlePlayerError = useCallback((errCode: any) => {
    let msg = `Playback error code: ${errCode}`;
    if (errCode === 150 || errCode === 101) {
      msg =
        'The video owner blocks embedded playback. Please choose the YouTube Music Topic track or audio upload.';
    } else if (errCode === 153) {
      msg =
        'Video player configuration error (identity verification failed). YouTube Music Topic tracks work best.';
    } else if (errCode === 100) {
      msg = 'Video not found or removed.';
    }
    setPlayerError(msg);
  }, []);

  const maxTime =
    durationMs > 0
      ? durationMs
      : doc.lines.length > 0
        ? doc.lines[doc.lines.length - 1]!.endMs ||
          doc.lines[doc.lines.length - 1]!.startMs + 5000
        : 30000;

  const animatedProgressStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, currentTime.value / maxTime));
    return {
      width: `${progress * 100}%`,
    };
  });

  const timeWithOffset = useDerivedValue(() => {
    return currentTime.value + syncOffset;
  });

  const getInactiveColor = () => {
    if (activeColor === '#ffffff')
      return `rgba(255, 255, 255, ${inactiveOpacity})`;
    if (activeColor === '#f6c358')
      return `rgba(246, 195, 88, ${inactiveOpacity})`;
    if (activeColor === '#00D1B2')
      return `rgba(0, 209, 178, ${inactiveOpacity})`;
    if (activeColor === '#FF69B4')
      return `rgba(255, 105, 180, ${inactiveOpacity})`;
    if (activeColor === '#10B981')
      return `rgba(16, 185, 129, ${inactiveOpacity})`;
    return `rgba(255, 255, 255, ${inactiveOpacity})`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            theme === 'Ambient'
              ? '#180f0a'
              : theme === 'Fluid'
                ? '#0d0d18'
                : '#000000',
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      {showBlurBg ? (
        <Animated.Image
          source={{
            uri:
              currentSong.albumArt ||
              'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000',
          }}
          style={[StyleSheet.absoluteFill]}
          blurRadius={50}
        />
      ) : (
        <>
          <View
            style={[
              styles.ambientOrb1,
              theme === 'Ambient' && styles.ambientOrbAmbient1,
              theme === 'Classic' && styles.hiddenOrb,
            ]}
          />
          <View
            style={[
              styles.ambientOrb2,
              theme === 'Ambient' && styles.ambientOrbAmbient2,
              theme === 'Classic' && styles.hiddenOrb,
            ]}
          />
        </>
      )}

      {showControls && (
        <View style={styles.header}>
          <Text style={styles.title}>Now Playing</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {currentSong.title} • {currentSong.artist}
          </Text>
          <View style={styles.headerButtons}>
            <Pressable
              onPress={() => setShowVideo(!showVideo)}
              style={[styles.headerBtn, showVideo && styles.headerBtnActive]}
            >
              <Text style={styles.headerBtnText}>
                {showVideo ? '📺 Video On' : '📺 Video Off'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsEditing(true)}
              style={styles.headerBtn}
            >
              <Text style={styles.headerBtnText}>🔍 Songs & API</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* YouTube Video Player (Synchronized) */}
      <View
        style={[
          styles.videoContainer,
          !showVideo && {
            height: 0,
            overflow: 'hidden',
            paddingTop: 0,
            paddingBottom: 0,
            opacity: 0,
          },
        ]}
      >
        <View style={styles.videoWrapper}>
          <YouTubePlayer
            ref={ytPlayerRef}
            videoId={currentSong.videoId}
            height={210}
            onTimeUpdate={handleTimeUpdate}
            onDuration={handleDuration}
            onStateChange={handleStateChange}
            onError={handlePlayerError}
          />
        </View>
      </View>

      {/* Loading & Error Status Badges */}
      {isLoadingLyrics && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator color="#f6c358" size="small" />
          <Text style={styles.loadingText}>
            Fetching lyrics from api.betterlyrics.org...
          </Text>
        </View>
      )}

      {lyricsError && !isLoadingLyrics && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {lyricsError}</Text>
        </View>
      )}

      {playerError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {playerError}</Text>
        </View>
      )}

      {isEditing ? (
        <ScrollView style={styles.editorContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Select Song & BetterLyrics API
            </Text>
            <Pressable
              onPress={() => setIsEditing(false)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.tabSelector}>
            <Pressable
              onPress={() => setActiveTab('presets')}
              style={[
                styles.tabBtn,
                activeTab === 'presets' && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'presets' && styles.tabBtnTextActive,
                ]}
              >
                Hit Presets
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('search')}
              style={[
                styles.tabBtn,
                activeTab === 'search' && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'search' && styles.tabBtnTextActive,
                ]}
              >
                API Search
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('paste')}
              style={[
                styles.tabBtn,
                activeTab === 'paste' && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'paste' && styles.tabBtnTextActive,
                ]}
              >
                Paste Raw
              </Text>
            </Pressable>
          </View>

          {activeTab === 'presets' && (
            <View style={styles.tabContent}>
              <Text style={styles.inputHelper}>
                Verified songs with syllable-level TTML on api.betterlyrics.org
                synced to official YouTube Music Topic tracks (studio audio,
                zero intro delay):
              </Text>
              <View style={styles.presetList}>
                {PRESET_SONGS.map((song) => {
                  const isCurrent = currentSong.videoId === song.videoId;
                  return (
                    <Pressable
                      key={song.id}
                      onPress={() => handleSelectPreset(song)}
                      style={[
                        styles.presetCard,
                        isCurrent && styles.presetCardActive,
                      ]}
                    >
                      <View style={styles.presetInfo}>
                        <Text style={styles.presetTitle}>{song.title}</Text>
                        <Text style={styles.presetArtist}>{song.artist}</Text>
                        <Text style={styles.presetVideoId}>
                          YT Music Topic: {song.videoId}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.presetBadge,
                          isCurrent && styles.presetBadgeActive,
                        ]}
                      >
                        <Text style={styles.presetBadgeText}>
                          {isCurrent ? 'Playing' : 'Load'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {activeTab === 'search' && (
            <View style={styles.tabContent}>
              <Text style={styles.inputLabel}>Song Title (s):</Text>
              <TextInput
                style={styles.textInputSingle}
                value={searchSong}
                onChangeText={setSearchSong}
                placeholder="e.g. Shape of You"
                placeholderTextColor="#777"
              />

              <Text style={styles.inputLabel}>Artist Name (a):</Text>
              <TextInput
                style={styles.textInputSingle}
                value={searchArtist}
                onChangeText={setSearchArtist}
                placeholder="e.g. Ed Sheeran"
                placeholderTextColor="#777"
              />

              <Text style={styles.inputLabel}>
                YouTube Video ID or URL (v):
              </Text>
              <TextInput
                style={styles.textInputSingle}
                value={searchVideoId}
                onChangeText={setSearchVideoId}
                placeholder="e.g. ah4jxqEUekI or https://music.youtube.com/watch?v=..."
                placeholderTextColor="#777"
                autoCapitalize="none"
              />

              <Pressable
                onPress={() => {
                  const q = encodeURIComponent(
                    `${searchSong || ''} ${searchArtist || ''} Topic`
                  );
                  Linking.openURL(`https://music.youtube.com/search?q=${q}`);
                }}
                style={styles.ytSearchBtn}
              >
                <Text style={styles.ytSearchBtnText}>
                  🔍 Find Topic Audio on YouTube Music
                </Text>
              </Pressable>

              <Text style={styles.inputLabel}>Provider Endpoint:</Text>
              <View style={styles.endpointRow}>
                {[
                  { label: 'Default (TTML)', val: '/getLyrics' },
                  { label: 'TTML Syllable', val: '/ttml/getLyrics' },
                  { label: 'Kugou (Line)', val: '/kugou/getLyrics' },
                  { label: 'QQ Provider', val: '/qq/getLyrics' },
                ].map((ep) => (
                  <Pressable
                    key={ep.val}
                    onPress={() => setSearchEndpoint(ep.val)}
                    style={[
                      styles.endpointBtn,
                      searchEndpoint === ep.val && styles.endpointBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.endpointBtnText,
                        searchEndpoint === ep.val &&
                          styles.endpointBtnTextActive,
                      ]}
                    >
                      {ep.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>
                Optional API Key (X-API-Key):
              </Text>
              <TextInput
                style={styles.textInputSingle}
                value={searchApiKey}
                onChangeText={setSearchApiKey}
                placeholder="Required only if uncached on server"
                placeholderTextColor="#777"
                autoCapitalize="none"
                secureTextEntry
              />

              <Pressable
                style={[styles.playButton, styles.fetchButton]}
                onPress={handleSearchSong}
                disabled={isLoadingLyrics}
              >
                {isLoadingLyrics ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.playButtonText}>
                    Fetch Lyrics & Sync Video
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {activeTab === 'paste' && (
            <View style={styles.tabContent}>
              <View style={styles.formatSelector}>
                {(['TTML', 'LRC', 'VTT'] as const).map((fmt) => (
                  <Pressable
                    key={fmt}
                    style={[
                      styles.formatBtn,
                      customRawFormat === fmt && styles.formatBtnActive,
                    ]}
                    onPress={() => setCustomRawFormat(fmt)}
                  >
                    <Text
                      style={[
                        styles.formatBtnText,
                        customRawFormat === fmt && styles.formatBtnTextActive,
                      ]}
                    >
                      {fmt}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.textInput}
                multiline
                value={customRawText}
                onChangeText={setCustomRawText}
                placeholder={`Paste your raw ${customRawFormat} here...`}
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
              <Pressable
                style={[styles.playButton, styles.saveButton]}
                onPress={handleApplyCustomLyrics}
              >
                <Text style={styles.playButtonText}>Save & Play</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          <LyricsViewer
            document={doc}
            currentTimeMs={timeWithOffset}
            containerStyle={styles.lyricsContainer}
            lineStyle={{ marginVertical: lineGap }}
            duetMode={duetMode}
            showSpeakerBadge={showSpeakerBadge}
            activeLineStyle={{
              ...(theme === 'Fluid'
                ? styles.activeLineFluid
                : theme === 'Ambient'
                  ? styles.activeLineAmbient
                  : styles.activeLineClassic),
              textAlign,
              fontSize,
              lineHeight: Math.round(fontSize * 1.35),
              color: activeColor,
              fontFamily: fontFamily === 'System' ? undefined : fontFamily,
            }}
            inactiveLineStyle={{
              ...(theme === 'Fluid'
                ? styles.inactiveLineFluid
                : theme === 'Ambient'
                  ? styles.futureLineAmbient
                  : styles.inactiveLineClassic),
              textAlign,
              fontSize,
              lineHeight: Math.round(fontSize * 1.35),
              color: getInactiveColor(),
              fontFamily: fontFamily === 'System' ? undefined : fontFamily,
            }}
            pastLineStyle={
              theme === 'Ambient'
                ? {
                    ...styles.pastLineAmbient,
                    textAlign,
                    fontSize,
                    lineHeight: Math.round(fontSize * 1.35),
                    fontFamily:
                      fontFamily === 'System' ? undefined : fontFamily,
                  }
                : undefined
            }
            futureLineStyle={
              theme === 'Ambient'
                ? {
                    ...styles.futureLineAmbient,
                    textAlign,
                    fontSize,
                    lineHeight: Math.round(fontSize * 1.35),
                    fontFamily:
                      fontFamily === 'System' ? undefined : fontFamily,
                  }
                : undefined
            }
            romanizationContainerStyle={{
              display: showRomanization ? 'flex' : 'none',
              borderColor: pillBorderColor,
              borderWidth: pillBorderWidth,
              borderRadius: pillBorderRadius,
              backgroundColor: pillBgColor,
              alignSelf:
                textAlign === 'left'
                  ? 'flex-start'
                  : textAlign === 'right'
                    ? 'flex-end'
                    : 'center',
            }}
            romanizationTextStyle={{
              fontSize: pillFontSize,
              textAlign,
            }}
            translationStyle={{
              display: showTranslation ? 'flex' : 'none',
              color: translationColor,
              fontSize: translationFontSize,
              textAlign,
            }}
            enableWordAnimation={theme === 'Fluid' || theme === 'Ambient'}
            autoScrollResyncDelay={resyncDelay}
            motionDuration={motionDuration}
            glowDurationThreshold={glowThreshold}
            shadowAmount={shadowAmount}
            onLinePress={(line) => {
              currentTime.value = line.startMs;
              setCurrentTimeMs(line.startMs);
              ytPlayerRef.current?.seekTo(line.startMs / 1000);
            }}
          />

          {showControls && (
            <View style={styles.playerControls}>
              {/* Inline Settings Dock above Play Button */}
              {isSettings && (
                <ScrollView
                  style={styles.inlineSettings}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.settingSectionTitle}>
                    Theme & Visuals
                  </Text>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Theme</Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setTheme('Ambient')}
                        style={[
                          styles.editButton,
                          theme === 'Ambient' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Ambient</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTheme('Fluid')}
                        style={[
                          styles.editButton,
                          theme === 'Fluid' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Fluid</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTheme('Classic')}
                        style={[
                          styles.editButton,
                          theme === 'Classic' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Classic</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Album Art Blur</Text>
                    <Switch value={showBlurBg} onValueChange={setShowBlurBg} />
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>
                      Sync Offset:{' '}
                      {syncOffset > 0 ? `+${syncOffset}` : syncOffset}ms
                    </Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setSyncOffset((s) => s - 250)}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>-250ms</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setSyncOffset((s) => s - 50)}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>-50ms</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setSyncOffset(0)}
                        style={[
                          styles.editButton,
                          syncOffset === 0 && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>0ms</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setSyncOffset((s) => s + 50)}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>+50ms</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setSyncOffset((s) => s + 250)}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>+250ms</Text>
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.settingSectionTitle}>
                    Text & Typography
                  </Text>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Active Color</Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setActiveColor('#ffffff')}
                        style={[
                          styles.editButton,
                          activeColor === '#ffffff' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>White</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setActiveColor('#f6c358')}
                        style={[
                          styles.editButton,
                          activeColor === '#f6c358' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Gold</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setActiveColor('#00D1B2')}
                        style={[
                          styles.editButton,
                          activeColor === '#00D1B2' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Cyan</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setActiveColor('#FF69B4')}
                        style={[
                          styles.editButton,
                          activeColor === '#FF69B4' && styles.formatBtnActive,
                        ]}
                      >
                        <Text style={styles.editButtonText}>Pink</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Inactive Opacity</Text>
                    <View style={styles.buttonRow}>
                      {[0.25, 0.4, 0.6].map((op) => (
                        <Pressable
                          key={op}
                          onPress={() => setInactiveOpacity(op)}
                          style={[
                            styles.editButton,
                            inactiveOpacity === op && styles.formatBtnActive,
                          ]}
                        >
                          <Text style={styles.editButtonText}>
                            {Math.round(op * 100)}%
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>
                      Font Size: {fontSize}
                    </Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setFontSize((s) => Math.max(16, s - 2))}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>-</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setFontSize((s) => Math.min(64, s + 2))}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>
                      Line Gap: {lineGap}px
                    </Text>
                    <View style={styles.buttonRow}>
                      <Pressable
                        onPress={() => setLineGap((g) => Math.max(4, g - 2))}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>-</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setLineGap((g) => Math.min(40, g + 2))}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Alignment</Text>
                    <View style={styles.buttonRow}>
                      {(['left', 'center', 'right'] as const).map((al) => (
                        <Pressable
                          key={al}
                          onPress={() => setTextAlign(al)}
                          style={[
                            styles.editButton,
                            textAlign === al && styles.formatBtnActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.editButtonText,
                              { textTransform: 'capitalize' },
                            ]}
                          >
                            {al}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Font Family</Text>
                    <View style={styles.buttonRow}>
                      {[
                        'System',
                        'sans-serif',
                        'serif',
                        'monospace',
                        Platform.OS === 'ios'
                          ? 'Helvetica Neue'
                          : 'sans-serif-medium',
                      ].map((ff) => (
                        <Pressable
                          key={ff}
                          onPress={() => setFontFamily(ff)}
                          style={[
                            styles.editButton,
                            fontFamily === ff && styles.formatBtnActive,
                          ]}
                        >
                          <Text style={styles.editButtonText}>{ff}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <Text style={styles.settingSectionTitle}>
                    Multi-Layer & Duet
                  </Text>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Show Romanization</Text>
                    <Switch
                      value={showRomanization}
                      onValueChange={setShowRomanization}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Show Translation</Text>
                    <Switch
                      value={showTranslation}
                      onValueChange={setShowTranslation}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Show Speaker Badge</Text>
                    <Switch
                      value={showSpeakerBadge}
                      onValueChange={setShowSpeakerBadge}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>Duet Mode</Text>
                    <View style={styles.buttonRow}>
                      {(['auto', true, false] as const).map((dm) => (
                        <Pressable
                          key={String(dm)}
                          onPress={() => setDuetMode(dm)}
                          style={[
                            styles.editButton,
                            duetMode === dm && styles.formatBtnActive,
                          ]}
                        >
                          <Text style={styles.editButtonText}>
                            {dm === 'auto'
                              ? 'Auto'
                              : dm === true
                                ? 'Split L/R'
                                : 'Off'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              )}

              <View style={styles.tweakRow}>
                <Pressable
                  onPress={() => setIsSettings(!isSettings)}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>
                    {isSettings ? 'Close Settings' : 'Settings & Customize'}
                  </Text>
                </Pressable>
              </View>

              {/* Time display row */}
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>
                  {formatTime(currentTimeMs)}
                </Text>
                <Text style={styles.timeLabel}>{formatTime(maxTime)}</Text>
              </View>

              {/* Custom Time Scrubber */}
              <View
                style={styles.scrubberContainer}
                onStartShouldSetResponder={() => true}
                onResponderMove={(e) => {
                  const ratio = Math.max(
                    0,
                    Math.min(1, e.nativeEvent.locationX / 320)
                  );
                  const targetMs = ratio * maxTime;
                  currentTime.value = targetMs;
                  setCurrentTimeMs(targetMs);
                  ytPlayerRef.current?.seekTo(targetMs / 1000);
                }}
                onResponderGrant={(e) => {
                  const ratio = Math.max(
                    0,
                    Math.min(1, e.nativeEvent.locationX / 320)
                  );
                  const targetMs = ratio * maxTime;
                  currentTime.value = targetMs;
                  setCurrentTimeMs(targetMs);
                  ytPlayerRef.current?.seekTo(targetMs / 1000);
                }}
              >
                <View style={styles.scrubberTrack}>
                  <Animated.View
                    style={[styles.scrubberFill, animatedProgressStyle]}
                  />
                </View>
              </View>

              {/* Prop Tweakers */}
              <View style={styles.tweakRow}>
                <View style={styles.tweakGroup}>
                  <Text style={styles.tweakLabel}>
                    Motion: {motionDuration}ms
                  </Text>
                  <View style={styles.tweakButtons}>
                    <Pressable
                      onPress={() =>
                        setMotionDuration(Math.max(0, motionDuration - 100))
                      }
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>-</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMotionDuration(motionDuration + 100)}
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.tweakGroup}>
                  <Text style={styles.tweakLabel}>Resync: {resyncDelay}ms</Text>
                  <View style={styles.tweakButtons}>
                    <Pressable
                      onPress={() =>
                        setResyncDelay(Math.max(0, resyncDelay - 500))
                      }
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>-</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setResyncDelay(resyncDelay + 500)}
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.tweakGroup}>
                  <Text style={styles.tweakLabel}>Glow: {glowThreshold}ms</Text>
                  <View style={styles.tweakButtons}>
                    <Pressable
                      onPress={() =>
                        setGlowThreshold(Math.max(200, glowThreshold - 100))
                      }
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>-</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setGlowThreshold(glowThreshold + 100)}
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.tweakGroup}>
                  <Text style={styles.tweakLabel}>
                    Shadow: {shadowAmount}px
                  </Text>
                  <View style={styles.tweakButtons}>
                    <Pressable
                      onPress={() => setShadowAmount((s) => Math.max(0, s - 2))}
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>-</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setShadowAmount((s) => Math.min(30, s + 2))
                      }
                      style={styles.tweakBtn}
                    >
                      <Text style={styles.tweakBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Playback Transport Controls */}
              <View style={styles.playbackControlsRow}>
                <Pressable
                  onPress={() => {
                    const targetSec = Math.max(
                      0,
                      (currentTimeMs - 5000) / 1000
                    );
                    currentTime.value = targetSec * 1000;
                    setCurrentTimeMs(targetSec * 1000);
                    ytPlayerRef.current?.seekTo(targetSec);
                  }}
                  style={styles.skipButton}
                >
                  <Text style={styles.skipButtonText}>-5s</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (isPlaying) {
                      ytPlayerRef.current?.pauseVideo();
                      setIsPlaying(false);
                    } else {
                      ytPlayerRef.current?.playVideo();
                      setIsPlaying(true);
                    }
                  }}
                  style={styles.playButton}
                >
                  <Text style={styles.playButtonText}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    const targetSec = Math.min(
                      maxTime / 1000,
                      (currentTimeMs + 5000) / 1000
                    );
                    currentTime.value = targetSec * 1000;
                    setCurrentTimeMs(targetSec * 1000);
                    ytPlayerRef.current?.seekTo(targetSec);
                  }}
                  style={styles.skipButton}
                >
                  <Text style={styles.skipButtonText}>+5s</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#180f0a',
  },
  ambientOrb1: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(102, 51, 153, 0.4)',
    top: -50,
    left: -100,
    transform: [{ scale: 1.5 }],
    opacity: 0.8,
  },
  ambientOrb2: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(233, 79, 100, 0.3)',
    bottom: '20%',
    right: -80,
    transform: [{ scale: 1.5 }],
    opacity: 0.6,
  },
  ambientOrbAmbient1: {
    backgroundColor: 'rgba(120, 60, 20, 0.45)',
  },
  ambientOrbAmbient2: {
    backgroundColor: 'rgba(70, 30, 10, 0.5)',
  },
  hiddenOrb: {
    opacity: 0,
  },
  header: {
    marginTop: 48,
    alignItems: 'center',
    zIndex: 10,
    paddingHorizontal: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#A0AEC0',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  headerBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  headerBtnActive: {
    backgroundColor: 'rgba(246, 195, 88, 0.25)',
    borderColor: '#f6c358',
  },
  headerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  videoContainer: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
    zIndex: 5,
  },
  videoWrapper: {
    width: '100%',
    maxWidth: 520,
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000000',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
        } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
          elevation: 8,
        }),
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: 'rgba(246, 195, 88, 0.15)',
    borderRadius: 20,
    marginHorizontal: 30,
    marginTop: 6,
  },
  loadingText: {
    color: '#f6c358',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
    borderRadius: 12,
    marginHorizontal: 30,
    marginTop: 6,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  lyricsContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    marginTop: 6,
  },
  activeLineFluid: {
    fontWeight: 'bold',
    color: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0 2px 4px rgba(0,0,0,0.4)' } as any)
      : {
          textShadowColor: 'rgba(0,0,0,0.4)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 4,
        }),
  },
  inactiveLineFluid: {
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  activeLineClassic: {
    fontWeight: '700',
    color: '#ffffff',
  },
  inactiveLineClassic: {
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  activeLineAmbient: {
    fontWeight: '800',
    color: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0 0 6px rgba(255,255,255,0.3)' } as any)
      : {
          textShadowColor: 'rgba(255,255,255,0.3)',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 6,
        }),
  },
  futureLineAmbient: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  pastLineAmbient: {
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
    ...(Platform.OS === 'web'
      ? ({
          textShadow: '0 0 2px rgba(255, 255, 255, 0.15)',
          filter: 'none',
        } as any)
      : {
          textShadowColor: 'rgba(255, 255, 255, 0.15)',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 2,
        }),
  },
  playerControls: {
    paddingBottom: 26,
    paddingTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 10, 8, 0.88)',
    zIndex: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  inlineSettings: {
    width: 330,
    maxHeight: 280,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  settingSectionTitle: {
    color: '#f6c358',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
    letterSpacing: 0.8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  timeRow: {
    width: 320,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 6,
  },
  timeLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  scrubberContainer: {
    width: 320,
    height: 24,
    justifyContent: 'center',
    marginBottom: 10,
  },
  scrubberTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2.5,
  },
  tweakRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  tweakGroup: {
    alignItems: 'center',
    gap: 4,
  },
  tweakLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  tweakButtons: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  tweakBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tweakBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  playbackControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 4,
  },
  skipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  skipButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  playButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 30,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 10px rgba(255, 255, 255, 0.3)',
        } as any)
      : {
          shadowColor: '#FFFFFF',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          elevation: 5,
        }),
  },
  playButtonText: {
    color: '#0A0D14',
    fontSize: 17,
    fontWeight: 'bold',
  },
  editorContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0d0d12',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#f6c358',
  },
  tabBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#000000',
  },
  tabContent: {
    paddingBottom: 40,
  },
  inputHelper: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  presetList: {
    gap: 10,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  presetCardActive: {
    backgroundColor: 'rgba(246, 195, 88, 0.15)',
    borderColor: '#f6c358',
  },
  presetInfo: {
    flex: 1,
  },
  presetTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  presetArtist: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    marginTop: 2,
  },
  presetVideoId: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  presetBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  presetBadgeActive: {
    backgroundColor: '#f6c358',
  },
  presetBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  textInputSingle: {
    backgroundColor: '#1A1D24',
    color: '#ffffff',
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 6,
  },
  endpointRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  endpointBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  endpointBtnActive: {
    backgroundColor: 'rgba(246, 195, 88, 0.25)',
    borderColor: '#f6c358',
  },
  endpointBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  endpointBtnTextActive: {
    color: '#f6c358',
  },
  fetchButton: {
    marginTop: 18,
    alignSelf: 'center',
    backgroundColor: '#f6c358',
  },
  formatSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  formatBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#2A2E39',
  },
  formatBtnActive: {
    backgroundColor: '#f6c358',
  },
  formatBtnText: {
    color: '#A0AEC0',
    fontWeight: '600',
    fontSize: 12,
  },
  formatBtnTextActive: {
    color: '#0A0D14',
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: '#1A1D24',
    color: '#ffffff',
    padding: 16,
    borderRadius: 12,
    height: 250,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    borderWidth: 1,
    borderColor: '#333',
  },
  saveButton: {
    alignSelf: 'center',
    marginBottom: 30,
  },
  ytSearchBtn: {
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    borderColor: 'rgba(255, 68, 68, 0.4)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  ytSearchBtnText: {
    color: '#ff6b6b',
    fontSize: 13,
    fontWeight: '700',
  },
});
