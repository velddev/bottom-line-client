import type { AuthStrategy, OAuthResult } from './auth-strategy';

/**
 * Strategy for Electron desktop app.
 * Opens external browser for Discord OAuth; receives result back via
 * ventured:// deep-link handled by Electron's protocol handler.
 */
export class ElectronStrategy implements AuthStrategy {
  readonly name = 'electron' as const;
  readonly autoLogin = false;

  async startOAuth(clientId: string): Promise<OAuthResult | null> {
    await window.electronAPI!.invoke('api:openDiscordOAuth', { clientId });
    return null;
  }

  onResultReceived(callback: (result: OAuthResult) => void): () => void {
    const cleanups: Array<() => void> = [];

    // New flow: server exchanges code and sends api_key + player_id via deep-link
    if (window.electronAPI?.onDiscordResult) {
      cleanups.push(window.electronAPI.onDiscordResult(({ api_key, player_id }) => {
        callback({ api_key, player_id });
      }));
    }

    // Legacy fallback: server sends just the code
    if (window.electronAPI?.onDiscordAuth) {
      cleanups.push(window.electronAPI.onDiscordAuth(({ code }) => {
        callback({ code, redirectUri: 'https://api.ventured.gg/v1/auth/callback' });
      }));
    }

    return () => cleanups.forEach((fn) => fn());
  }
}
