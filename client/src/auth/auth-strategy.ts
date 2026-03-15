/**
 * AuthStrategy defines how OAuth flows are handled across different runtimes.
 *
 * Three strategies exist:
 * - DiscordActivity: embedded inside Discord, auto-login via Activity SDK
 * - Electron: desktop app, opens external browser, receives result via deep-link
 * - Web: browser, opens popup, receives result via postMessage
 */
export interface AuthStrategy {
  /** Human-readable name for logging/debugging. */
  readonly name: 'discord-activity' | 'electron' | 'web';

  /** Whether this strategy should auto-login on mount (Discord Activity). */
  readonly autoLogin: boolean;

  /**
   * Start the OAuth flow.
   *
   * Returns an OAuthResult if available synchronously (web popup, Discord Activity).
   * Returns null if the result will arrive asynchronously (Electron deep-link).
   */
  startOAuth(clientId: string): Promise<OAuthResult | null>;

  /**
   * Register a listener for async result delivery (Electron deep-link).
   * Returns a cleanup function. Only meaningful for Electron strategy.
   */
  onResultReceived?(callback: (result: OAuthResult) => void): () => void;
}

/** Either a pre-exchanged token or a code that still needs exchanging. */
export interface OAuthResult {
  /** Set when the server already exchanged the code. */
  api_key?: string;
  player_id?: string;
  /** Set when the client needs to exchange the code itself (Discord Activity). */
  code?: string;
  redirectUri?: string;
}
