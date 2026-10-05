import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  YouTubePlayerProps,
  YouTubePlayerRef,
} from './YouTubePlayer.types';

const DEFAULT_ORIGIN = 'https://reactnative.dev';

function buildPlayerHtml(videoId: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; background-color: #000; overflow: hidden; }
    html, body { width: 100%; height: 100%; }
    #player { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    var player;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: '${videoId}',
        playerVars: {
          playsinline: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          autoplay: 1,
          enablejsapi: 1,
          origin: '${DEFAULT_ORIGIN}',
          widget_referrer: '${DEFAULT_ORIGIN}'
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
      window.player = player;
    }

    function sendToRN(type, data) {
      try {
        var msg = JSON.stringify({ type: type, data: data });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(msg);
        }
      } catch(err) {}
    }

    var timeInterval = null;
    function onPlayerReady(event) {
      if (player && typeof player.getDuration === 'function') {
        sendToRN('duration', player.getDuration());
      }
      sendToRN('ready', true);
      startTimer();
    }

    function onPlayerStateChange(event) {
      // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
      sendToRN('state', event.data);
      if (event.data === 1) {
        startTimer();
      } else {
        stopTimer();
      }
    }

    function onPlayerError(event) {
      sendToRN('error', event.data);
    }

    function startTimer() {
      if (timeInterval) clearInterval(timeInterval);
      timeInterval = setInterval(function() {
        if (player && typeof player.getCurrentTime === 'function') {
          var t = player.getCurrentTime();
          sendToRN('time', t);
        }
      }, 50);
    }

    function stopTimer() {
      if (timeInterval) clearInterval(timeInterval);
      timeInterval = null;
    }
  </script>
</body>
</html>`;
}

export const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(
  function YouTubePlayerNative(
    { videoId, onTimeUpdate, onDuration, onStateChange, onError, height = 220 },
    ref
  ) {
    const webViewRef = useRef<WebView | null>(null);
    const callbacksRef = useRef({
      onTimeUpdate,
      onDuration,
      onStateChange,
      onError,
    });
    callbacksRef.current = { onTimeUpdate, onDuration, onStateChange, onError };
    const prevVideoIdRef = useRef(videoId);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if(window.player && typeof window.player.seekTo === 'function') { window.player.seekTo(${seconds}, true); } true;`
          );
        }
      },
      playVideo: () => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if(window.player && typeof window.player.playVideo === 'function') { window.player.playVideo(); } true;`
          );
        }
      },
      pauseVideo: () => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if(window.player && typeof window.player.pauseVideo === 'function') { window.player.pauseVideo(); } true;`
          );
        }
      },
    }));

    // Switch video dynamically without reloading WebView HTML
    useEffect(() => {
      if (prevVideoIdRef.current !== videoId) {
        prevVideoIdRef.current = videoId;
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if(window.player && typeof window.player.loadVideoById === 'function') { window.player.loadVideoById('${videoId}'); } true;`
          );
        }
      }
    }, [videoId]);

    const handleMessage = useCallback((event: any) => {
      try {
        const { type, data } = JSON.parse(event.nativeEvent.data);
        if (type === 'time' && typeof data === 'number' && !isNaN(data)) {
          callbacksRef.current.onTimeUpdate(Math.round(data * 1000));
        } else if (
          type === 'duration' &&
          typeof data === 'number' &&
          callbacksRef.current.onDuration
        ) {
          callbacksRef.current.onDuration(Math.round(data * 1000));
        } else if (type === 'state' && callbacksRef.current.onStateChange) {
          callbacksRef.current.onStateChange(data === 1);
        } else if (type === 'error') {
          callbacksRef.current.onError?.(data);
        }
      } catch {}
    }, []);

    // Memoize source strictly by videoId with baseUrl to satisfy YouTube embedder referrer verification
    const source = useMemo(
      () => ({
        html: buildPlayerHtml(videoId),
        baseUrl: DEFAULT_ORIGIN,
      }),
      [videoId]
    );

    return (
      <View style={[styles.container, { height }]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={source}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          userAgent={
            Platform.OS === 'android'
              ? 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
              : undefined
          }
          scrollEnabled={false}
          bounces={false}
          style={styles.webView}
          onMessage={handleMessage}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
});
