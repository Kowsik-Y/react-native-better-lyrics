export interface YouTubePlayerRef {
  seekTo: (seconds: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}

export interface YouTubePlayerProps {
  videoId: string;
  onTimeUpdate: (timeMs: number) => void;
  onDuration?: (durationMs: number) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onError?: (error: any) => void;
  height?: number;
}
