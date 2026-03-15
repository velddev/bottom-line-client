import type { AuthStrategy, OAuthResult } from './auth-strategy';

/**
 * Strategy for web browser.
 * Opens Discord OAuth in a popup window; receives code via postMessage
 * when the server callback page sends it back.
 */
export class WebStrategy implements AuthStrategy {
  readonly name = 'web' as const;
  readonly autoLogin = false;

  private apiBase: string;

  constructor(apiBase?: string) {
    this.apiBase = apiBase ?? ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? '/v1';
  }

  async startOAuth(clientId: string): Promise<OAuthResult> {
    const redirectUri = new URL(`${this.apiBase}/auth/callback`, window.location.origin).href;
    const apiOrigin = this.apiBase.startsWith('http')
      ? new URL(this.apiBase).origin
      : window.location.origin;

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'identify',
      state:         window.location.origin,
    });

    return new Promise<OAuthResult>((resolve, reject) => {
      const popup = window.open(
        `https://discord.com/oauth2/authorize?${params}`,
        'discord-oauth',
        'width=500,height=700,popup=1',
      );
      if (!popup) {
        reject(new Error('Popup blocked — please allow popups for this site'));
        return;
      }

      const onMessage = (ev: MessageEvent<{ type: string; code: string }>) => {
        if (ev.origin !== window.location.origin && ev.origin !== apiOrigin) return;
        if (ev.data?.type !== 'discord-oauth-code') return;
        window.removeEventListener('message', onMessage);
        clearInterval(closedCheck);
        resolve({ code: ev.data.code, redirectUri });
      };

      const closedCheck = setInterval(() => {
        if (popup.closed) {
          clearInterval(closedCheck);
          window.removeEventListener('message', onMessage);
          reject(new Error('Login cancelled'));
        }
      }, 500);

      window.addEventListener('message', onMessage);
    });
  }
}
