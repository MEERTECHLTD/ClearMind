import { describe, it, expect } from 'vitest';
import { detectInstallMode } from './pwa';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  safari17Mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  safari16Mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};
const base = { standalone: false, hasPrompt: false, maxTouchPoints: 0 };

describe('detectInstallMode', () => {
  it('uses the native prompt on Chromium/Edge desktop once it is available', () => {
    expect(detectInstallMode(UA.chromeMac, { ...base, hasPrompt: true })).toBe('prompt');
    expect(detectInstallMode(UA.edgeWin, { ...base, hasPrompt: true })).toBe('prompt');
    expect(detectInstallMode(UA.chromeMac, base)).toBe('none'); // no event (yet, or already installed)
  });
  it('shows Add to Dock steps on Safari 17+ for macOS only', () => {
    expect(detectInstallMode(UA.safari17Mac, base)).toBe('safari-mac');
    expect(detectInstallMode(UA.safari16Mac, base)).toBe('none');
  });
  it('shows Home Screen steps on iPhone and iPadOS (which reports as a Mac)', () => {
    expect(detectInstallMode(UA.iphone, base)).toBe('ios');
    expect(detectInstallMode(UA.ipadOS, { ...base, maxTouchPoints: 5 })).toBe('ios');
  });
  it('offers the store app on Android, even when a web prompt exists', () => {
    expect(detectInstallMode(UA.android, base)).toBe('android-app');
    expect(detectInstallMode(UA.android, { ...base, hasPrompt: true })).toBe('android-app');
  });
  it('has nothing to offer on Firefox desktop or when already installed', () => {
    expect(detectInstallMode(UA.firefoxMac, base)).toBe('none');
    expect(detectInstallMode(UA.chromeMac, { ...base, standalone: true, hasPrompt: true })).toBe('none');
  });
});
