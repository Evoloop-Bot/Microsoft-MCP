import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-node";
import type { MicrosoftGraphConfig } from "../config.js";
import { DeviceCodeTokenProvider } from "./device-code-provider.js";

const TEST_CONFIG: MicrosoftGraphConfig = {
  clientId: "client-id",
  tenantId: "tenant-id",
  authFlow: "device_code",
  graphBaseUrl: "https://graph.microsoft.com/v1.0",
  graphScopes: ["User.Read"],
  enabledCapabilities: ["mail"],
  enabledTools: ["mail_list_messages"],
  httpTimeoutMs: 15000,
  maxRetries: 3,
  retryBaseDelayMs: 500,
  tokenCacheUsePlaintextFallback: false
};

function createAccount(homeAccountId: string): AccountInfo {
  return {
    homeAccountId,
    environment: "login.microsoftonline.com",
    tenantId: "tenant-id",
    username: "user@example.com",
    localAccountId: "local-account-id",
    name: "Test User"
  };
}

describe("DeviceCodeTokenProvider", () => {
  it("uses the cached account and silent acquisition before device code", async () => {
    const cachedAccount = createAccount("home-1");
    const mockApp = {
      getTokenCache: () => ({
        getAccountByHomeId: async () => null,
        getAllAccounts: async () => [cachedAccount]
      }),
      acquireTokenSilent: async ({ account }: { account: AccountInfo }) => ({
        accessToken: "silent-token",
        expiresOn: new Date("2026-04-12T12:00:00Z"),
        account
      }),
      acquireTokenByDeviceCode: async () => {
        throw new Error("device code should not run");
      }
    } as unknown as IPublicClientApplication;

    const provider = new DeviceCodeTokenProvider(TEST_CONFIG, mockApp);
    const result = await provider.getAccessToken(["User.Read"]);

    assert.equal(result.token, "silent-token");
    assert.equal(result.expiresOn?.toISOString(), "2026-04-12T12:00:00.000Z");
  });

  it("falls back to device code when the cache is empty", async () => {
    const interactiveAccount = createAccount("home-2");
    let deviceCodeCalls = 0;
    const mockApp = {
      getTokenCache: () => ({
        getAccountByHomeId: async () => null,
        getAllAccounts: async () => []
      }),
      acquireTokenSilent: async () => {
        throw new Error("silent auth should not run");
      },
      acquireTokenByDeviceCode: async () => {
        deviceCodeCalls += 1;
        return {
          accessToken: "interactive-token",
          expiresOn: new Date("2026-04-12T13:00:00Z"),
          account: interactiveAccount
        };
      }
    } as unknown as IPublicClientApplication;

    const provider = new DeviceCodeTokenProvider(TEST_CONFIG, mockApp);
    const result = await provider.getAccessToken(["User.Read"]);

    assert.equal(deviceCodeCalls, 1);
    assert.equal(result.token, "interactive-token");
    assert.equal(result.expiresOn?.toISOString(), "2026-04-12T13:00:00.000Z");
  });
});
