import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElectronStrategy } from '../auth/electron-strategy';

describe('ElectronStrategy', () => {
  let strategy: ElectronStrategy;
  const mockInvoke = vi.fn();
  const mockOnDiscordAuth = vi.fn();
  const mockOnDiscordResult = vi.fn();

  beforeEach(() => {
    strategy = new ElectronStrategy();
    (window as any).electronAPI = {
      invoke: mockInvoke,
      onDiscordAuth: mockOnDiscordAuth,
      onDiscordResult: mockOnDiscordResult,
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

  it('startOAuth invokes IPC and returns null (async result delivery)', async () => {
    mockInvoke.mockResolvedValue({ ok: true });
    const result = await strategy.startOAuth('test-client-id');
    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('api:openDiscordOAuth', { clientId: 'test-client-id' });
  });

  it('onResultReceived handles new flow with api_key and player_id', () => {
    let capturedCallback: ((data: { api_key: string; player_id: string }) => void) | undefined;
    mockOnDiscordResult.mockImplementation((cb: any) => {
      capturedCallback = cb;
      return () => {};
    });
    mockOnDiscordAuth.mockReturnValue(() => {});

    const results: any[] = [];
    strategy.onResultReceived!((result) => {
      results.push(result);
    });

    expect(capturedCallback).toBeDefined();
    capturedCallback!({ api_key: 'my-key', player_id: 'my-player' });

    expect(results).toHaveLength(1);
    expect(results[0].api_key).toBe('my-key');
    expect(results[0].player_id).toBe('my-player');
    expect(results[0].code).toBeUndefined();
  });

  it('onResultReceived handles legacy flow with code', () => {
    mockOnDiscordResult.mockReturnValue(() => {});
    let capturedCallback: ((data: { code: string }) => void) | undefined;
    mockOnDiscordAuth.mockImplementation((cb: any) => {
      capturedCallback = cb;
      return () => {};
    });

    const results: any[] = [];
    strategy.onResultReceived!((result) => {
      results.push(result);
    });

    expect(capturedCallback).toBeDefined();
    capturedCallback!({ code: 'my-oauth-code' });

    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('my-oauth-code');
    expect(results[0].redirectUri).toBe('https://api.ventured.gg/v1/auth/callback');
  });

  it('onResultReceived returns cleanup function', () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    mockOnDiscordResult.mockReturnValue(cleanup1);
    mockOnDiscordAuth.mockReturnValue(cleanup2);

    const stop = strategy.onResultReceived!(() => {});
    stop();

    expect(cleanup1).toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalled();
  });
});
