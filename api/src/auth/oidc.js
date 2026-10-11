import * as oidc from 'openid-client';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isPublicAddress } from '@servicetrident/shared/validation/validation';
import { identityUrl } from '@servicetrident/shared/domain/identity-provider';
import { unseal } from '@servicetrident/shared/integrations/secrets';

/** Pin every request to public DNS answers; never follow redirects or forward secrets to private networks. */
export async function publicIdentityTarget(raw, resolve = lookup) {
  const url = new URL(identityUrl(String(raw)));
  const addresses = await resolve(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error('Identity endpoint is not public.');
  return { url, target: addresses[0] };
}

export async function identityFetch(raw, options = {}) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(10000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const { url, target } = await Promise.race([
    publicIdentityTarget(raw),
    new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(new Error('Identity request timed out.')), {
        once: true,
      }),
    ),
  ]);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(options.headers));
    const request = https.request(
      url,
      {
        method: options.method || 'GET',
        headers: { ...headers, 'accept-encoding': 'identity' },
        agent: false,
        signal,
        maxHeaderSize: 16384,
        lookup: (_host, settings, done) =>
          done(null, settings.all ? [target] : target.address, target.family),
      },
      (response) => {
        const chunks = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > 512 * 1024)
            request.destroy(new Error('Identity response exceeded the limit.'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode >= 300 && response.statusCode < 400)
            return reject(new Error('Identity redirects are not allowed.'));
          if (
            response.headers['content-encoding'] &&
            response.headers['content-encoding'] !== 'identity'
          )
            return reject(new Error('Unsupported identity response encoding.'));
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: { 'content-type': response.headers['content-type'] || 'application/json' },
            }),
          );
        });
      },
    );
    request.on('error', reject);
    request.end(options.body === undefined ? undefined : String(options.body));
  });
}

export async function identityConfiguration(provider, fetchImpl = identityFetch) {
  const secret = unseal(provider.secret).clientSecret;
  const config = await oidc.discovery(
    new URL(provider.issuer),
    provider.clientId,
    { client_secret: secret },
    provider.authMethod === 'client_secret_basic'
      ? oidc.ClientSecretBasic(secret)
      : oidc.ClientSecretPost(secret),
    { [oidc.customFetch]: fetchImpl, timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
  );
  const metadata = config.serverMetadata();
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'])
    identityUrl(metadata[field]);
  if (!metadata.response_types_supported?.includes('code'))
    throw new Error('Provider does not support authorization code sign-in.');
  return config;
}
export { oidc };
