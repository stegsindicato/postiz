/**
 * Facebook Login for Business / Instagram Unified Login helpers.
 * Isolated from NestJS and Prisma so OAuth/account selection can be tested
 * without launching Postiz or contacting Meta.
 */
export type InstagramV3Profile = {
  id: string;
  username: string;
  name: string;
  picture: string;
};

export const INSTAGRAM_V3_CALLBACK = '/integrations/social/instagram-v3';

function required(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Instagram V3: missing ${label}`);
  return trimmed;
}

export function instagramV3RedirectUri(frontendUrl: string): string {
  const origin = new URL(required(frontendUrl, 'FRONTEND_URL'));
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('Instagram V3 requires an HTTPS FRONTEND_URL');
  }
  if (origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('Instagram V3 requires FRONTEND_URL without a path, query or fragment');
  }
  return `${origin.origin}${INSTAGRAM_V3_CALLBACK}`;
}

export function instagramV3LoginUrl(input: {
  appId: string;
  configId: string;
  frontendUrl: string;
  state: string;
  apiVersion: string;
}): string {
  const { appId, configId, frontendUrl, state, apiVersion } = input;
  required(appId, 'INSTAGRAM_V3_APP_ID');
  required(configId, 'INSTAGRAM_V3_CONFIG_ID');
  required(state, 'OAuth state');
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error('Invalid Graph API version');

  // Unified Login uses config_id INSTEAD OF scope. Do not append scope.
  const url = new URL(`https://www.facebook.com/${apiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('config_id', configId);
  url.searchParams.set('redirect_uri', instagramV3RedirectUri(frontendUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('override_default_response_type', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

// Only controlled, fixed Meta hosts are accessed. No paging URL supplied by
// Meta (or user-controlled media URL) is ever followed by these helpers.
export async function instagramV3Json(
  url: URL,
  token?: string,
  http: typeof fetch = fetch
): Promise<any> {
  if (url.protocol !== 'https:' || url.hostname !== 'graph.facebook.com') {
    throw new Error('Instagram V3: rejected unexpected Graph host');
  }
  const response = await http(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Instagram V3: invalid response (HTTP ${response.status})`);
  }
  if (!response.ok || json?.error) {
    const code = json?.error?.code;
    const subcode = json?.error?.error_subcode;
    // Avoid logging secrets, tokens, authorization codes, or Meta's raw body.
    throw new Error(
      `Instagram V3: Graph request failed (HTTP ${response.status}` +
        `${Number.isInteger(code) ? `, code ${code}` : ''}` +
        `${Number.isInteger(subcode) ? `, subcode ${subcode}` : ''})`
    );
  }
  return json;
}

export async function instagramV3ExchangeCode(input: {
  code: string;
  appId: string;
  appSecret: string;
  frontendUrl: string;
  apiVersion: string;
  http?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn?: number }> {
  const { code, appId, appSecret, frontendUrl, apiVersion, http } = input;
  const url = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
  url.searchParams.set('client_id', required(appId, 'INSTAGRAM_V3_APP_ID'));
  url.searchParams.set('client_secret', required(appSecret, 'INSTAGRAM_V3_APP_SECRET'));
  url.searchParams.set('redirect_uri', instagramV3RedirectUri(frontendUrl));
  url.searchParams.set('code', required(code, 'OAuth code'));
  const data = await instagramV3Json(url, undefined, http);
  if (typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error('Instagram V3: Meta did not return an access token');
  }
  // System-user tokens can have no expiration. Do not run fb_exchange_token.
  const expiresIn = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    ...(Number.isFinite(expiresIn) && expiresIn > 0
      ? { expiresIn }
      : {}),
  };
}

export async function instagramV3GraphGet(
  path: string,
  params: Record<string, string>,
  token: string,
  apiVersion: string,
  http?: typeof fetch
): Promise<any> {
  if (!/^v\d+\.\d+$/.test(apiVersion) || !/^\/?[\w/-]+$/.test(path)) {
    throw new Error('Instagram V3: invalid Graph request path');
  }
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return instagramV3Json(url, required(token, 'access token'), http);
}

async function getProfile(
  id: string,
  token: string,
  version: string,
  http?: typeof fetch
): Promise<InstagramV3Profile> {
  if (!/^\d+$/.test(id)) throw new Error('Instagram V3: invalid Instagram account ID');
  const data = await instagramV3GraphGet(
    id,
    { fields: 'id,username,name,profile_picture_url' },
    token,
    version,
    http
  );
  if (String(data.id) !== id || typeof data.username !== 'string' || !data.username) {
    throw new Error('Instagram V3: account is not an accessible Instagram professional account');
  }
  return {
    id,
    username: data.username,
    name: data.name || data.username,
    picture: data.profile_picture_url || '',
  };
}

/**
 * Explicit ID is recommended (a system-user token may not expose /me/accounts).
 * With a business ID, collect Instagram assets directly WITHOUT Facebook Pages.
 * Refuse ambiguous grants instead of silently selecting the first account.
 */
export async function instagramV3ResolveAccount(input: {
  token: string;
  version: string;
  accountId?: string;
  businessId?: string;
  http?: typeof fetch;
}): Promise<InstagramV3Profile> {
  const { token, version, http } = input;
  if (input.accountId?.trim()) {
    return getProfile(input.accountId.trim(), token, version, http);
  }
  const businessId = input.businessId?.trim();
  if (!businessId) {
    throw new Error(
      'Instagram V3: set INSTAGRAM_V3_ACCOUNT_ID (recommended) or INSTAGRAM_V3_BUSINESS_ID'
    );
  }
  if (!/^\d+$/.test(businessId)) {
    throw new Error('Instagram V3: invalid Business Portfolio ID');
  }
  const ids = new Set<string>();
  for (const edge of ['owned_instagram_accounts', 'client_instagram_accounts']) {
    try {
      const result = await instagramV3GraphGet(
        `${businessId}/${edge}`,
        { fields: 'id', limit: '100' },
        token,
        version,
        http
      );
      for (const account of result?.data || []) {
        if (account?.id && /^\d+$/.test(String(account.id))) ids.add(String(account.id));
      }
      // Deliberately refuse an incomplete list: never pick an arbitrary account.
      if (result?.paging?.next) {
        throw new Error('Instagram V3: asset list is paginated; set INSTAGRAM_V3_ACCOUNT_ID');
      }
    } catch {
      // Some Meta configurations expose only owned or only client assets.
    }
  }
  if (ids.size === 0) {
    throw new Error(
      'Instagram V3: no accessible Instagram assets in the portfolio; ' +
        'set INSTAGRAM_V3_ACCOUNT_ID or check Meta asset permissions'
    );
  }
  if (ids.size > 1) {
    throw new Error(
      'Instagram V3: multiple Instagram assets found; set INSTAGRAM_V3_ACCOUNT_ID'
    );
  }
  return getProfile(Array.from(ids)[0], token, version, http);
}
