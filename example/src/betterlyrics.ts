import { parseTTML } from '../../src/ttml/ttmlParser';
import { parseLRC } from 'react-native-better-lyrics';
import type { LyricsDocument } from 'react-native-better-lyrics';

export interface SongPreset {
  id: string;
  title: string;
  artist: string;
  videoId: string;
  albumArt?: string;
}

export const PRESET_SONGS: SongPreset[] = [
  {
    id: 'shape-of-you',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    videoId: 'ah4jxqEUekI', // YouTube Music Topic (Studio Master Track - 0s intro delay)
    albumArt:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1000',
  },
  {
    id: 'blinding-lights',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    videoId: 'H64a2ggVIWc', // YouTube Music Topic (Studio Master Track - 0s intro delay)
    albumArt:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=1000',
  },
  {
    id: 'stay',
    title: 'Stay',
    artist: 'The Kid LAROI',
    videoId: 'Rrnhk9LbDwE', // YouTube Music Topic (Studio Master Track - 0s intro delay)
    albumArt:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000',
  },
  {
    id: 'as-it-was',
    title: 'As It Was',
    artist: 'Harry Styles',
    videoId: 'wa5gkHMqbls', // YouTube Music Topic (Studio Master Track - 0s intro delay)
    albumArt:
      'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000',
  },
];

export interface FetchBetterLyricsOptions {
  song: string;
  artist: string;
  album?: string;
  duration?: number;
  videoId?: string;
  endpoint?: string;
  apiKey?: string;
}

export function extractYouTubeId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(
    /(?:youtu\.be\/|(?:music\.|www\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] || trimmed : trimmed;
}

export async function fetchBetterLyrics(
  options: FetchBetterLyricsOptions
): Promise<LyricsDocument> {
  const endpoint = options.endpoint || '/getLyrics';
  const base = 'https://api.betterlyrics.org';
  const url = new URL(`${base}${endpoint}`);

  url.searchParams.set('s', options.song.trim());
  url.searchParams.set('a', options.artist.trim());
  if (options.album?.trim()) {
    url.searchParams.set('al', options.album.trim());
  }
  if (options.duration) {
    url.searchParams.set('d', String(options.duration));
  }
  if (options.videoId?.trim()) {
    url.searchParams.set('v', extractYouTubeId(options.videoId.trim()));
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.apiKey?.trim()) {
    headers['X-API-Key'] = options.apiKey.trim();
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.message) errorDetail = errJson.message;
      else if (errJson.error) errorDetail = errJson.error;
    } catch {
      const txt = await response.text();
      if (txt) errorDetail = txt;
    }
    throw new Error(errorDetail);
  }

  const data = await response.json();
  if (data.ttml) {
    const doc = parseTTML(data.ttml);
    if (!doc.lines || doc.lines.length === 0) {
      throw new Error('Parsed TTML contains 0 lines.');
    }
    return doc;
  } else if (data.lyrics) {
    const doc = parseLRC(data.lyrics);
    if (!doc.lines || doc.lines.length === 0) {
      throw new Error('Parsed lyrics contain 0 lines.');
    }
    return doc;
  } else if (typeof data === 'string') {
    if (data.includes('<tt')) return parseTTML(data);
    return parseLRC(data);
  }

  throw new Error('No compatible lyrics found in response.');
}
