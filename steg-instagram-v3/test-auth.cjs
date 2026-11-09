/* Standalone regression tests for the pure OAuth / Graph helpers.
 * Run: bash steg-instagram-v3/test.sh
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  instagramV3LoginUrl,
  instagramV3RedirectUri,
  instagramV3ExchangeCode,
  instagramV3ResolveAccount,
} = require('./_build/instagram.v3.auth.js');

const base = {
  appId: '123456789012345',
  configId: '987654321098765',
  frontendUrl: 'https://social.steg.gal',
  state: 'state_test_123',
  apiVersion: 'v25.0',
};

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test('builds Facebook Login for Business URL using config_id, never scope', () => {
  const url = new URL(instagramV3LoginUrl(base));
  assert.equal(url.hostname, 'www.facebook.com');
  assert.equal(url.searchParams.get('config_id'), base.configId);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://social.steg.gal/integrations/social/instagram-v3');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('override_default_response_type'), 'true');
  assert.equal(url.searchParams.get('state'), base.state);
  assert.equal(url.searchParams.has('scope'), false);
});

test('requires secure public callback URL', () => {
  assert.throws(() => instagramV3RedirectUri('http://example.com'));
  assert.throws(() => instagramV3RedirectUri('https://example.com/subpath'));
});

test('exchanges OAuth code for SUAT without attempting a refresh exchange', async () => {
  let calls = 0;
  const http = async (url) => {
    calls++;
    const u = new URL(url);
    assert.equal(u.pathname, '/v25.0/oauth/access_token');
    assert.equal(u.searchParams.get('code'), 'auth-code');
    return jsonResponse({ access_token: 'suat-never-expires' });
  };
  const result = await instagramV3ExchangeCode({
    code: 'auth-code', appId: base.appId, appSecret: 'example-secret',
    frontendUrl: base.frontendUrl, apiVersion: base.apiVersion, http,
  });
  assert.deepEqual(result, { accessToken: 'suat-never-expires' });
  assert.equal(calls, 1);
});

test('rejects an error response without leaking Meta response contents', async () => {
  await assert.rejects(
    instagramV3ExchangeCode({
      code: 'auth-code', appId: base.appId, appSecret: 'private-value',
      frontendUrl: base.frontendUrl, apiVersion: base.apiVersion,
      http: async () => jsonResponse({error:{message:'sensitive-message', code:190}}, 400),
    }),
    (e) => !e.message.includes('sensitive-message') && !e.message.includes('private-value')
  );
});

test('uses an explicitly selected Instagram ID (not /me/accounts)', async () => {
  let reqs = 0;
  const http = async (url, options) => {
    reqs++;
    assert.equal(new URL(url).pathname, '/v25.0/1234567890');
    assert.equal(options.headers.Authorization, 'Bearer mock-SUAT');
    return jsonResponse({id:'1234567890',username:'stegsindicato',name:'STEG',profile_picture_url:'https://images.example/photo.jpg'});
  };
  const profile = await instagramV3ResolveAccount({
    token:'mock-SUAT',version:'v25.0',accountId:'1234567890',http,
  });
  assert.equal(profile.username, 'stegsindicato');
  assert.equal(reqs, 1);
});

test('discovers a single account by portfolio without using a Page', async () => {
  const http = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/owned_instagram_accounts')) return jsonResponse({data:[{id:'98765'}]});
    if (path.endsWith('/client_instagram_accounts')) return jsonResponse({data:[]});
    if (path.endsWith('/98765')) return jsonResponse({id:'98765',username:'steg'});
    throw new Error('Unexpected graph path: '+path);
  };
  const profile = await instagramV3ResolveAccount({
    token:'token',version:'v25.0',businessId:'112233',http,
  });
  assert.equal(profile.id,'98765');
});

test('refuses ambiguous asset grants to avoid publishing to the wrong account', async () => {
  const http = async (url) =>
    jsonResponse(new URL(url).pathname.includes('owned_instagram_accounts')
      ? {data:[{id:'1'},{id:'2'}]} : {data:[]});
  await assert.rejects(
    instagramV3ResolveAccount({token:'test',version:'v25.0',businessId:'999',http}),
    /multiple Instagram assets/
  );
});

test('refuses a mismatched or inaccessible Instagram account', async () => {
  await assert.rejects(
    instagramV3ResolveAccount({
      token:'test',version:'v25.0',accountId:'123',
      http:async () => jsonResponse({id:'555',username:'other'}),
    }),
    /not an accessible Instagram professional account/
  );
});
