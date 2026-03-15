import type { AuthStrategy, OAuthResult } from './auth-strategy';
import { DiscordSDK } from '@discord/embedded-app-sdk';

/**
 * Strategy for Discord Activity (embedded inside Discord).
 * Auto-logs in via the Embedded App SDK — no user interaction needed.
 */
export class DiscordActivityStrategy implements AuthStrategy {
  readonly name = 'discord-activity' as const;
  readonly autoLogin = true;

  async startOAuth(clientId: string): Promise<OAuthResult> {
    const sdk = new DiscordSDK(clientId);
    await sdk.ready();

    const { code } = await sdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });

    return {
      code,
      redirectUri: `https://discord.com/games/${clientId}`,
    };
  }
}
