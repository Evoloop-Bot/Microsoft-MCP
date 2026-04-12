import { ConfidentialClientApplication, DeviceCodeRequest, IPublicClientApplication, PublicClientApplication } from "@azure/msal-node";

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

export class ClientCredentialsTokenProvider implements TokenProvider {
  private readonly app: ConfidentialClientApplication;

  constructor(private readonly config: MicrosoftGraphConfig) {
    if (!config.clientSecret) {
      throw new Error("MICROSOFT_CLIENT_SECRET is required for client credentials flow.");
    }

    this.app = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      }
    });
  }

  async getAccessToken(scopes: string[]): Promise<AccessToken> {
    const result = await this.app.acquireTokenByClientCredential({ scopes });
    if (!result?.accessToken) {
      throw new Error("Client credentials flow completed without an access token.");
    }

    return {
      token: result.accessToken,
      expiresOn: result.expiresOn ?? undefined
    };
  }
}

export function createTokenProvider(config: MicrosoftGraphConfig): TokenProvider {
  if (config.authFlow === "client_credentials") {
    return new ClientCredentialsTokenProvider(config);
  }

  if (config.authFlow === "authorization_code") {
    throw new Error("MICROSOFT_AUTH_FLOW=authorization_code is reserved for a hosted bridge and is not implemented in this runtime.");
  }

  return new DeviceCodeTokenProvider(config);
}
