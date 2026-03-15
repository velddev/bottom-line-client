/**
 * AuthStrategy defines how OAuth flows are handled across different runtimes.
 *
 * Three strategies exist:
 * - DiscordActivity: embedded inside Discord, auto-login via Activity SDK
 * - Electron: desktop app, opens external browser, receives code via deep-link
 * - Web: browser, opens popup, receives code via postMessage
 */
export interface AuthStrategy {
  /** Human-readable name for logging/debugging. */
  readonly name: 'discord-activity' | 'electron' | 'web';

  /** Whether this strategy should auto-login on mount (Discord Activity). */
  readonly autoLogin: boolean;

  /**
   * Start the OAuth flow.
   *
   * Returns the code + redirectUri if available synchronously (web popup, Discord Activity).
   * Returns null if the code will arrive asynchronously (Electron deep-link).
   */
  startOAuth(clientId: string): Promise<OAuthResult | null>;

  /**
   * Register a listener for async code delivery (Electron deep-link).
   * Returns a cleanup function. Only meaningful for Electron strategy.
   */
  onCodeReceived?(callback: (code: string, redirectUri: string) => void): () => void;
}

export interface OAuthResult {
  code: string;
  redirectUri: string;
}
