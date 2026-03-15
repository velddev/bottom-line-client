/**
 * Discord Embedded App SDK utilities.
 *
 * When the client is loaded inside a Discord Activity iframe, DiscordSDK.isEmbedded
 * returns true. In that case we skip the manual login screen and authenticate
 * directly via the Activity SDK: the SDK presents Discord's own OAuth consent
 * inside Discord, returns a code, and we exchange that code with our backend.
 *
 * Redirect URI: register "https://discord.com/games/<application_id>" in the
 * Discord Developer Portal → OAuth2 → Redirects for the Activity application.
 */

import { DiscordSDK } from '@discord/embedded-app-sdk';

let _sdk: DiscordSDK | null = null;

/** True when the app is running inside Discord's Activity iframe. */
export function isDiscordActivity(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id');
}

/**
 * Initialise the Discord SDK and run the in-Discord OAuth consent flow.
 * Returns the OAuth authorization code that should be exchanged with the
 * backend via `api.exchangeOAuthCode`.
 *
 * @param clientId  Discord application / client ID (fetched from backend).
 */
export async function getDiscordActivityCode(clientId: string): Promise<string> {
  _sdk = new DiscordSDK(clientId);
  await _sdk.ready();

  const { code } = await _sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  return code;
}
