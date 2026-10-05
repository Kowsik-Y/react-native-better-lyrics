export interface LyricWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  isInstrumental?: boolean;
  words?: LyricWord[];
  translation?: string;
  romanization?: string;
}

export interface LyricsDocument {
  metadata: Record<string, string>;
  lines: LyricLine[];
  warnings: string[];
}
