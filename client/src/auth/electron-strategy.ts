import type { AuthStrategy, OAuthResult } from './auth-strategy';

const REDIRECT_URI = 'https://api.ventured.gg/v1/auth/callback';

/**
 * Strategy for Electron desktop app.
 * Opens external browser for Discord OAuth; receives code back via
 * ventured:// deep-link handled by Electron's protocol handler.
 */
export class ElectronStrategy implements AuthStrategy {
  readonly name = 'electron' as const;
  readonly autoLogin = false;

  async startOAuth(clientId: string): Promise<OAuthResult | null> {
    // Ask Electron main process to open the Discord OAuth URL in external browser
    await window.electronAPI!.invoke('api:openDiscordOAuth', { clientId });
    // Code arrives later via deep-link → onCodeReceived
    return null;
  }

  onCodeReceived(callback: (code: string, redirectUri: string) => void): () => void {
    if (!window.electronAPI?.onDiscordAuth) return () => {};
    return window.electronAPI.onDiscordAuth(({ code }) => {
      callback(code, REDIRECT_URI);
    });
  }
}
