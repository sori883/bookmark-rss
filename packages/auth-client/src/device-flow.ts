export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenSuccess {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export type DeviceTokenPending =
  | { error: "authorization_pending" }
  | { error: "slow_down" }
  | { error: "expired_token" }
  | { error: "access_denied" }
  | { error: "invalid_grant" }
  | { error: "invalid_request" };

export type DeviceTokenResult = DeviceTokenSuccess | DeviceTokenPending;

export class DeviceFlowError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeviceFlowError";
    this.status = status;
  }
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

const isErrorPayload = (
  value: unknown,
): value is { error: string; error_description?: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { error?: unknown }).error === "string";

export const requestDeviceCode = async (
  baseUrl: string,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceCodeResponse> => {
  const res = await fetchImpl(
    `${stripTrailingSlash(baseUrl)}/api/auth/device/code`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    },
  );
  if (!res.ok) {
    throw new DeviceFlowError(
      `Failed to request device code (HTTP ${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as DeviceCodeResponse;
};

export const pollDeviceToken = async (
  baseUrl: string,
  clientId: string,
  deviceCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceTokenResult> => {
  const res = await fetchImpl(
    `${stripTrailingSlash(baseUrl)}/api/auth/device/token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: clientId,
      }),
    },
  );
  if (res.ok) {
    return (await res.json()) as DeviceTokenSuccess;
  }
  if (res.status === 400) {
    const body: unknown = await res.json().catch(() => null);
    if (isErrorPayload(body)) {
      return { error: body.error } as DeviceTokenPending;
    }
  }
  throw new DeviceFlowError(
    `Unexpected response while polling for token (HTTP ${res.status})`,
    res.status,
  );
};
