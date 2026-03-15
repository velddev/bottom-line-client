import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebStrategy } from '../auth/web-strategy';

describe('WebStrategy', () => {
  let strategy: WebStrategy;

  beforeEach(() => {
    strategy = new WebStrategy('/v1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct metadata', () => {
    expect(strategy.name).toBe('web');
    expect(strategy.autoLogin).toBe(false);
    // Web strategy doesn't implement onCodeReceived (no async code delivery)
    expect((strategy as any).onCodeReceived).toBeUndefined();
  });

  it('rejects when popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(strategy.startOAuth('test-client-id')).rejects.toThrow('Popup blocked');
  });

  it('resolves with code when postMessage arrives from same origin', async () => {
    // Create a mock popup that stays open
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    const promise = strategy.startOAuth('test-client-id');

    // Verify popup was opened with correct Discord OAuth URL
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('discord.com/oauth2/authorize'),
      'discord-oauth',
      expect.any(String),
    );

    // Simulate postMessage from the callback page
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'discord-oauth-code', code: 'abc123' },
    }));

    const result = await promise;
    expect(result.code).toBe('abc123');
    expect(result.redirectUri).toContain('/v1/auth/callback');
  });

  it('resolves with code when postMessage arrives from API origin', async () => {
    // Use a cross-origin API base
    const crossOriginStrategy = new WebStrategy('https://api.ventured.gg/v1');
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    const promise = crossOriginStrategy.startOAuth('test-client-id');

    // Simulate postMessage from the API origin
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://api.ventured.gg',
      data: { type: 'discord-oauth-code', code: 'xyz789' },
    }));

    const result = await promise;
    expect(result.code).toBe('xyz789');
    expect(result.redirectUri).toBe('https://api.ventured.gg/v1/auth/callback');
  });

  it('ignores messages from unknown origins', async () => {
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    const promise = strategy.startOAuth('test-client-id');

    // Message from unknown origin — should be ignored
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://evil.com',
      data: { type: 'discord-oauth-code', code: 'stolen' },
    }));

    // Now send correct message
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'discord-oauth-code', code: 'legit' },
    }));

    const result = await promise;
    expect(result.code).toBe('legit');
  });

  it('ignores messages with wrong type', async () => {
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    const promise = strategy.startOAuth('test-client-id');

    // Wrong message type — should be ignored
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'something-else', code: 'ignored' },
    }));

    // Correct message
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: { type: 'discord-oauth-code', code: 'correct' },
    }));

    const result = await promise;
    expect(result.code).toBe('correct');
  });

  it('rejects when popup is closed before code arrives', async () => {
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    vi.useFakeTimers();
    const promise = strategy.startOAuth('test-client-id');

    // Simulate popup closing
    mockPopup.closed = true;
    vi.advanceTimersByTime(600);

    await expect(promise).rejects.toThrow('Login cancelled');
    vi.useRealTimers();
  });

  it('includes state=origin in OAuth URL for server postMessage targeting', () => {
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    strategy.startOAuth('test-client-id');

    const openUrl = (window.open as any).mock.calls[0][0] as string;
    const params = new URLSearchParams(openUrl.split('?')[1]);
    expect(params.get('state')).toBe(window.location.origin);
  });

  it('uses correct redirect_uri pointing to API callback', () => {
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(mockPopup as any);

    strategy.startOAuth('test-client-id');

    const openUrl = (window.open as any).mock.calls[0][0] as string;
    const params = new URLSearchParams(openUrl.split('?')[1]);
    expect(params.get('redirect_uri')).toContain('/v1/auth/callback');
  });
});
