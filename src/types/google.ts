export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          hasGrantedAllScopes: (response: GoogleTokenResponse, ...scopes: string[]) => boolean;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export type GoogleTokenClientConfig = {
  client_id: string;
  scope?: string;
  include_granted_scopes?: boolean;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: GoogleTokenError) => void;
};

export type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: '' | 'consent' | 'select_account'; scope?: string }) => void;
};

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GoogleTokenError = {
  type?: string;
  message?: string;
};
