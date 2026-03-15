import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElectronStrategy } from '../auth/electron-strategy';

describe('ElectronStrategy', () => {
  let strategy: ElectronStrategy;
  const mockInvoke = vi.fn();
  const mockOnDiscordAuth = vi.fn();

  beforeEach(() => {
    strategy = new ElectronStrategy();
    (window as any).electronAPI = {
      invoke: mockInvoke,
      onDiscordAuth: mockOnDiscordAuth,
    };
  });

  afterEach(() => {
    delete (window as any).electronAPI;
    vi.restoreAllMocks();
  });

  it('has correct metadata', () => {
    expect(strategy.name).toBe('electron');
    expect(strategy.autoLogin).toBe(false);
  });

  it('startOAuth invokes IPC and returns null (async code delivery)', async () => {
    mockInvoke.mockResolvedValue({ ok: true, redirectUri: 'https://api.ventured.gg/v1/auth/callback' });
    const result = await strategy.startOAuth('test-client-id');
    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('api:openDiscordOAuth', { clientId: 'test-client-id' });
  });

  it('onCodeReceived registers deep-link listener and passes code', () => {
    let capturedCallback: ((data: { code: string }) => void) | undefined;
    mockOnDiscordAuth.mockImplementation((cb: any) => {
      capturedCallback = cb;
      return () => {};
    });

    const receivedCalls: Array<{ code: string; redirectUri: string }> = [];
    strategy.onCodeReceived!((code, redirectUri) => {
      receivedCalls.push({ code, redirectUri });
    });

    expect(capturedCallback).toBeDefined();
    capturedCallback!({ code: 'my-oauth-code' });

    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].code).toBe('my-oauth-code');
    expect(receivedCalls[0].redirectUri).toBe('https://api.ventured.gg/v1/auth/callback');
  });

  it('onCodeReceived returns cleanup function from electronAPI', () => {
    const cleanup = vi.fn();
    mockOnDiscordAuth.mockReturnValue(cleanup);

    const stop = strategy.onCodeReceived!(() => {});
    stop();

    expect(cleanup).toHaveBeenCalled();
  });

  it('onCodeReceived returns noop if electronAPI.onDiscordAuth is missing', () => {
    delete (window as any).electronAPI!.onDiscordAuth;
    const stop = strategy.onCodeReceived!(() => {});
    expect(stop).toBeTypeOf('function');
    stop(); // should not throw
  });
});
