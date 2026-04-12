import { DeviceCodeRequest, IPublicClientApplication, PublicClientApplication } from "@azure/msal-node";

import type { MicrosoftGraphConfig } from "../config.js";
import type { AccessToken, TokenProvider } from "./types.js";

export class DeviceCodeTokenProvider implements TokenProvider {
  private readonly app: IPublicClientApplication;

  constructor(private readonly config: MicrosoftGraphConfig) {
    this.app = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      }
    });
  }

  async getAccessToken(scopes: string[]): Promise<AccessToken> {
    // MSAL maintains an in-memory token cache across calls within the same process.
    // Tokens are not persisted to disk — re-auth is required on each server restart.
    // This is intentional for the pilot: it avoids storing credentials at rest.
    const request: DeviceCodeRequest = {
      deviceCodeCallback: (response) => {
        process.stderr.write(`${response.message}\n`);
      },
      scopes
    };

    const result = await this.app.acquireTokenByDeviceCode(request);
    if (!result?.accessToken) {
      throw new Error("Device code flow completed without an access token.");
    }

    return {
      token: result.accessToken,
      expiresOn: result.expiresOn ?? undefined
    };
  }
}

export function createTokenProvider(config: MicrosoftGraphConfig): TokenProvider {
  return new DeviceCodeTokenProvider(config);
}
