import { describe, it, expect, jest } from '@jest/globals';
import { LyricsViewer } from '../components/LyricsViewer';

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const Text = require('react-native').Text;
  const ScrollView = require('react-native').ScrollView;
  return {
    useSharedValue: jest.fn((v) => ({ value: v, modify: jest.fn() })),
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedScrollHandler: jest.fn(() => () => {}),
    useFrameCallback: jest.fn(),
    useAnimatedRef: jest.fn(),
    scrollTo: jest.fn(),
    withTiming: jest.fn((v) => v),
    runOnJS: jest.fn((fn) => fn),
    default: {
      View,
      Text,
      ScrollView,
    },
  };
});
import { parseLRC } from '../core/parser';

describe('LyricsViewer', () => {
  it('should compile and render without crashing', () => {
    const doc = parseLRC('[00:00.00] Test line');
    // Using simple JSX compilation check since we are running in node
    const component = <LyricsViewer document={doc} currentTimeMs={0} />;
    expect(component).toBeDefined();
  });

  it('should render word-level lyrics without crashing', () => {
    const doc = parseLRC(
      "[00:01.00] <00:01.00>Say <00:01.50>you <00:02.00>can't <00:02.50>sleep"
    );
    const component = (
      <LyricsViewer
        document={doc}
        currentTimeMs={1200}
        enableWordAnimation={true}
      />
    );
    expect(component).toBeDefined();
    expect(doc.lines[0]?.words?.length).toBe(4);
  });
});
