import {
  AccountInfo,
  DeviceCodeRequest,
  IPublicClientApplication,
  InteractionRequiredAuthError,
  PublicClientApplication
} from "@azure/msal-node";
import path from "node:path";

import type { MicrosoftGraphConfig } from "../config.js";
import type { AccessToken, TokenProvider } from "./types.js";

export class DeviceCodeTokenProvider implements TokenProvider {
  private readonly app: IPublicClientApplication;
  private preferredHomeAccountId?: string;
  private interactiveTokenPromise?: Promise<AccessToken>;

  constructor(
    private readonly config: MicrosoftGraphConfig,
    app?: IPublicClientApplication
  ) {
    this.app = app ?? new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      }
    });
  }

  async getAccessToken(scopes: string[]): Promise<AccessToken> {
    const cachedAccount = await this.getCachedAccount();
    if (cachedAccount) {
      try {
        const result = await this.app.acquireTokenSilent({
          account: cachedAccount,
          scopes
        });

        if (result.accessToken) {
          this.preferredHomeAccountId = result.account?.homeAccountId ?? cachedAccount.homeAccountId;
          return {
            token: result.accessToken,
            expiresOn: result.expiresOn ?? undefined
          };
        }
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) {
          throw error;
        }
      }
    }

    if (!this.interactiveTokenPromise) {
      this.interactiveTokenPromise = this.acquireInteractiveToken(scopes).finally(() => {
        this.interactiveTokenPromise = undefined;
      });
    }

    return this.interactiveTokenPromise;
  }

  private async getCachedAccount(): Promise<AccountInfo | null> {
    const tokenCache = this.app.getTokenCache();

    if (this.preferredHomeAccountId) {
      const preferredAccount = await tokenCache.getAccountByHomeId(this.preferredHomeAccountId);
      if (preferredAccount) {
        return preferredAccount;
      }
    }

    const cachedAccounts = await tokenCache.getAllAccounts();
    if (cachedAccounts.length === 0) {
      return null;
    }

    this.preferredHomeAccountId = cachedAccounts[0].homeAccountId;
    return cachedAccounts[0];
  }

  private async acquireInteractiveToken(scopes: string[]): Promise<AccessToken> {
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

    this.preferredHomeAccountId = result.account?.homeAccountId;

    return {
      token: result.accessToken,
      expiresOn: result.expiresOn ?? undefined
    };
  }
}

export async function createTokenProvider(config: MicrosoftGraphConfig): Promise<TokenProvider> {
  const {
    DataProtectionScope,
    Environment,
    PersistenceCachePlugin,
    PersistenceCreator
  } = await import("@azure/msal-node-extensions");
  const cachePath = config.tokenCachePath ?? defaultTokenCachePath(Environment);
  const persistence = await PersistenceCreator.createPersistence({
    cachePath,
    dataProtectionScope: DataProtectionScope.CurrentUser,
    serviceName: "m365-mcp-server",
    accountName: `${config.tenantId}.${config.clientId}`,
    usePlaintextFileOnLinux: config.tokenCacheUsePlaintextFallback
  });

  const app = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`
    },
    cache: {
      cachePlugin: new PersistenceCachePlugin(persistence)
    }
  });

  return new DeviceCodeTokenProvider(config, app);
}

function defaultTokenCachePath(Environment: { getUserRootDirectory(): string | null }): string {
  const userRootDirectory = Environment.getUserRootDirectory();
  if (!userRootDirectory) {
    throw new Error("Unable to determine a user-scoped token cache directory.");
  }

  return path.join(userRootDirectory, ".m365-mcp", "msal-cache.json");
}
