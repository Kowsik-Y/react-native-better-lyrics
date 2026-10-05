# react-native-better-lyrics

A cinematic lyrics viewer for React Native

## Installation


```sh
npm install react-native-better-lyrics
```


## Usage

```tsx
import { LyricsViewer, parseLRC } from 'react-native-better-lyrics';
import { parseTTML } from 'react-native-better-lyrics/ttml';
import { parseVTT } from 'react-native-better-lyrics/vtt';
import { useSharedValue } from 'react-native-reanimated';

// 1. Parse your lyrics (LRC, enhanced LRC, TTML or VTT)
const doc = parseTTML(ttmlXmlString);

// 2. Drive playback with a Reanimated SharedValue
const currentTimeMs = useSharedValue(0);

// 3. Render the cinematic lyrics viewer
<LyricsViewer
  document={doc}
  currentTimeMs={currentTimeMs}
  onSeek={(ms) => {
    // Seek your audio/video player
  }}
/>
```


## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
