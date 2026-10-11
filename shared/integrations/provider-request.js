import https from 'node:https';

import { lookup } from 'node:dns/promises';
import { parseTarget, isPublicAddress } from '../validation/validation.js';
async function resolvePublicTarget(url) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new Error('Provider endpoint must resolve to a public address.');
  return addresses[0];
}

/** Send bounded JSON to a verified public provider address, with no redirect following. */
export async function providerRequest(rawUrl, method, payload, headers = {}) {
  const url = parseTarget(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Provider endpoints require HTTPS.');
  let dnsTimer;
  let target;
  try {
    target = await Promise.race([
      resolvePublicTarget(url),
      new Promise((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error('DNS resolution timed out.')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(dnsTimer);
  }
  return new Promise((resolve, reject) => {
    const data =
      payload === undefined
        ? null
        : Buffer.from(
            payload instanceof URLSearchParams ? payload.toString() : JSON.stringify(payload),
          );
    const request = https.request(
      url,
      {
        method,
        agent: false,
        maxHeaderSize: 16384,
        lookup: (_host, options, callback) =>
          callback(null, options.all ? [target] : target.address, target.family),
        headers: {
          Accept: 'application/json',
          ...(data
            ? {
                'Content-Type':
                  payload instanceof URLSearchParams
                    ? 'application/x-www-form-urlencoded'
                    : 'application/json',
                'Content-Length': data.length,
              }
            : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 262144) request.destroy(new Error('Provider response exceeded the limit.'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300)
            return reject(
              Object.assign(new Error(`Provider returned HTTP ${response.statusCode}.`), {
                statusCode: response.statusCode,
              }),
            );
          const body = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({});
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('Provider request timed out.')),
      10000,
    );
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    request.end(data);
  });
}
