export interface AccessToken {
  token: string;
  expiresOn?: Date;
}

export interface TokenProvider {
  getAccessToken(scopes: string[]): Promise<AccessToken>;
}
