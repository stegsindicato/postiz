import {
  AuthTokenDetails,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import {
  instagramV3ExchangeCode,
  instagramV3LoginUrl,
  instagramV3ResolveAccount,
} from '@gitroom/nestjs-libraries/integrations/social/instagram.v3.auth';
import { ValidityMedia } from '@gitroom/nestjs-libraries/integrations/social.abstract';

/**
 * Instagram with Meta Unified Login (Facebook Login for Business / SUAT).
 * It is an independent provider: the legacy Instagram providers stay untouched.
 * The InstagramProvider publishing engine already supports graph.facebook.com,
 * media containers, pending states and duplicate-publication safeguards.
 */
export class InstagramV3Provider extends InstagramProvider {
  override identifier = 'instagram-v3';
  override name = 'Instagram V3\n(Unified Login)';
  override toolTip = 'Instagram via Meta Unified Login; no Facebook Page required';
  override isBetweenSteps = false;
  refreshCron = false; // SUAT is non-expiring; revoked access requires re-login.
  override scopes = ['instagram_basic', 'instagram_content_publish'];
  override maxConcurrentJob = 200;

  override async checkValidity(
    posts: Array<ValidityMedia[]>,
    settings: any
  ): Promise<string | true> {
    if (settings?.audio?.id) {
      return 'Instagram V3 does not support attaching licensed Reel audio';
    }
    return super.checkValidity(posts, settings);
  }

  override async generateAuthUrl() {
    const state = makeSecureId(24);
    return {
      url: instagramV3LoginUrl({
        appId: process.env.INSTAGRAM_V3_APP_ID || '',
        configId: process.env.INSTAGRAM_V3_CONFIG_ID || '',
        frontendUrl: process.env.FRONTEND_URL || '',
        apiVersion: META_GRAPH_API_VERSION,
        state,
      }),
      codeVerifier: makeSecureId(24),
      state,
    };
  }

  override async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }): Promise<Awaited<ReturnType<InstagramProvider['authenticate']>>> {
    const { accessToken, expiresIn } = await instagramV3ExchangeCode({
      code: params.code,
      appId: process.env.INSTAGRAM_V3_APP_ID || '',
      appSecret: process.env.INSTAGRAM_V3_APP_SECRET || '',
      frontendUrl: process.env.FRONTEND_URL || '',
      apiVersion: META_GRAPH_API_VERSION,
    });
    const account = await instagramV3ResolveAccount({
      token: accessToken,
      version: META_GRAPH_API_VERSION,
      accountId: process.env.INSTAGRAM_V3_ACCOUNT_ID,
      businessId: process.env.INSTAGRAM_V3_BUSINESS_ID,
    });
    return {
      id: account.id,
      name: account.name,
      username: account.username,
      picture: account.picture,
      accessToken,
      // The SUAT has no refresh token. If Meta returns a time-limited token,
      // Postiz will require reauthorization rather than silently invalidating it.
      refreshToken: '',
      // SUAT can be non-expiring; use the same long-lived fallback as Postiz.
      expiresIn: expiresIn ?? 999999999,
    };
  }

  // Prevent the inherited Facebook Page reconnect method from running.
  override async reConnect(
    id: string,
    requiredId: string,
    token: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    if (String(id) !== String(requiredId)) {
      throw new Error('Instagram V3 reconnect attempted with a different account');
    }
    const account = await instagramV3ResolveAccount({
      token,
      version: META_GRAPH_API_VERSION,
      accountId: requiredId,
    });
    return {
      id: account.id,
      name: account.name,
      username: account.username,
      picture: account.picture,
      accessToken: token,
    };
  }
}
