import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type {
  YouTubePlayerProps,
  YouTubePlayerRef,
} from './YouTubePlayer.types';

declare const window: any;
declare const document: any;

export const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(
  function YouTubePlayerWeb(
    { videoId, onTimeUpdate, onDuration, onStateChange, onError, height = 220 },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const intervalRef = useRef<any>(null);
    const containerId = useRef(
      `yt-player-${Math.random().toString(36).substring(2, 9)}`
    );
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
        if (
          playerRef.current &&
          typeof playerRef.current.seekTo === 'function'
        ) {
          playerRef.current.seekTo(seconds, true);
        }
      },
      playVideo: () => {
        if (
          playerRef.current &&
          typeof playerRef.current.playVideo === 'function'
        ) {
          playerRef.current.playVideo();
        }
      },
      pauseVideo: () => {
        if (
          playerRef.current &&
          typeof playerRef.current.pauseVideo === 'function'
        ) {
          playerRef.current.pauseVideo();
        }
      },
    }));

    useEffect(() => {
      let isMounted = true;

      function startPolling() {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          if (
            playerRef.current &&
            typeof playerRef.current.getCurrentTime === 'function'
          ) {
            const timeSec = playerRef.current.getCurrentTime();
            if (typeof timeSec === 'number' && !isNaN(timeSec)) {
              callbacksRef.current.onTimeUpdate(Math.round(timeSec * 1000));
            }
          }
        }, 50);
      }

      function stopPolling() {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }

      // If player already exists and only videoId changed, just load the new video!
      if (playerRef.current && prevVideoIdRef.current !== videoId) {
        prevVideoIdRef.current = videoId;
        if (typeof playerRef.current.loadVideoById === 'function') {
          playerRef.current.loadVideoById(videoId);
          return;
        }
      }
      prevVideoIdRef.current = videoId;

      function createPlayer() {
        if (!window.YT || !window.YT.Player) return;
        if (!containerRef.current) return;
        if (playerRef.current) return;

        playerRef.current = new window.YT.Player(containerId.current, {
          height: '100%',
          width: '100%',
          videoId,
          playerVars: {
            playsinline: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            autoplay: 1,
            enablejsapi: 1,
            origin:
              typeof window !== 'undefined'
                ? window.location.origin
                : undefined,
          },
          events: {
            onReady: (e: any) => {
              if (!isMounted) return;
              if (typeof e.target.getDuration === 'function') {
                const dur = e.target.getDuration();
                if (typeof dur === 'number' && !isNaN(dur)) {
                  callbacksRef.current.onDuration?.(Math.round(dur * 1000));
                }
              }
              startPolling();
            },
            onStateChange: (e: any) => {
              if (!isMounted) return;
              const isPlaying = e.data === 1;
              callbacksRef.current.onStateChange?.(isPlaying);
              if (isPlaying) {
                startPolling();
              } else if (e.data === 2 || e.data === 0) {
                stopPolling();
              }
            },
            onError: (e: any) => {
              callbacksRef.current.onError?.(e.data);
            },
          },
        });
      }

      if (!window.YT) {
        const existingScript = document.getElementById('youtube-iframe-api');
        if (!existingScript) {
          const script = document.createElement('script');
          script.id = 'youtube-iframe-api';
          script.src = 'https://www.youtube.com/iframe_api';
          document.body.appendChild(script);
        }
        const prevOnReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prevOnReady) prevOnReady();
          if (isMounted) createPlayer();
        };
      } else {
        createPlayer();
      }

      return () => {
        isMounted = false;
        stopPolling();
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {}
          playerRef.current = null;
        }
      };
    }, [videoId]);

    return (
      <View style={[styles.container, { height }]}>
        <div
          ref={containerRef}
          id={containerId.current}
          style={styles.innerDiv}
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
  innerDiv: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  } as any,
});
