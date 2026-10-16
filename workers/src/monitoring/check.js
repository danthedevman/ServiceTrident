import { monitorKeyword, evaluateKeyword } from '@servicetrident/shared/domain/monitor-keyword';
import { monitorAuthorization } from './auth.js';
import { monitorAuthErrors } from '@servicetrident/shared/domain/monitor-auth';
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import {
  InputError,
  isPublicAddress,
  parseTarget,
  validateMethod,
} from '@servicetrident/shared/validation/validation';
import { captureBody, redactHeaders } from './response.js';
import { userAgentForCheck } from './user-agents.js';

/** @param {string} userAgent @returns {object} Actual request headers saved with the event. */
function headersFor(userAgent) {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };
}

/** Resolve every address and reject mixed public/private answers to prevent SSRF.
 * @param {URL} url @param {Function} [resolve] @returns {Promise<{address: string, family: number}>}
 */
export async function resolvePublicTarget(url, resolve = lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolve(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new InputError('Target resolves to a private or reserved network address.');
  }
  return addresses[0];
}

/** Await DNS within the same deadline as the HTTP requests.
 * @param {Promise} promise @param {AbortSignal} signal @returns {Promise}
 */
async function abortable(promise, signal) {
  signal.throwIfAborted();
  let onAbort;
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/** Capture a response over a fresh socket pinned to the validated DNS address.
 * The original hostname remains in Host and TLS SNI; certificate validation stays on.
 * @param {URL} url @param {AbortSignal} signal @param {Function} [onResponse]
 * @param {{method?: 'GET' | 'HEAD', userAgent?: string}} [options] HEAD never reads the body.
 * @returns {Promise<object>}
 */
export async function requestHeaders(
  url,
  signal,
  onResponse = () => {},
  { method = 'GET', userAgent = userAgentForCheck(), authorization = null } = {},
) {
  validateMethod(method);
  const started = performance.now();
  const target = await abortable(resolvePublicTarget(url), signal);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      url,
      {
        method,
        agent: false,
        rejectUnauthorized: true,
        signal,
        autoSelectFamily: false,
        maxHeaderSize: 16384,
        lookup: (hostname, options, callback) => callback(null, target.address, target.family),
        headers: {
          ...headersFor(userAgent),
          ...(authorization ? { Authorization: authorization } : {}),
        },
      },
      (response) => {
        const snapshot = {
          url: url.href,
          statusCode: response.statusCode,
          statusMessage: authorization
            ? http.STATUS_CODES[response.statusCode] || 'HTTP response'
            : response.statusMessage,
          httpVersion: response.httpVersion,
          location: authorization ? undefined : response.headers.location,
          headers: authorization ? {} : redactHeaders(response.headers),
          remoteAddress: target.address,
          headersMs: Math.round(performance.now() - started),
        };
        onResponse(snapshot);
        if (method === 'HEAD' || authorization) {
          snapshot.body = {
            text: '',
            bytesCaptured: 0,
            truncated: false,
            omitted: authorization
              ? 'Authenticated monitor: response body and headers are not captured.'
              : 'HEAD request: no response body requested.',
            error: null,
          };
          resolve(snapshot);
          response.destroy();
          return;
        }
        captureBody(response, signal, snapshot).then(resolve, reject);
      },
    );
    request.once('error', reject);
    request.end();
  });
}

/** Check a website, validating every redirect within a single ten-second deadline.
 * @param {string} target @param {{fetchHeaders?: Function, timeoutMs?: number, followRedirects?: boolean, method?: 'GET' | 'HEAD', userAgent?: string}} [options]
 * @returns {Promise<object>} Summary plus bounded request/response details for every hop.
 */
export async function checkWebsite(
  target,
  {
    fetchHeaders = requestHeaders,
    timeoutMs = 10000,
    followRedirects = false,
    method = 'GET',
    userAgent = userAgentForCheck(),
    authentication = null,
    keyword = null,
    tokenRequest,
  } = {},
) {
  validateMethod(method);
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Check timed out.')), timeoutMs);
  let statusCode = null;
  const details = {
    method,
    followRedirects: followRedirects === true,
    requestedUrl: target,
    finalUrl: target,
    requestHeaders: headersFor(userAgent),
    responses: [],
  };
  try {
    const auth = typeof authentication === 'function' ? authentication() : authentication;
    const authenticated = !!auth && auth.mode !== 'none';
    if (
      authenticated &&
      Object.keys(monitorAuthErrors(auth, { url: target, followRedirects })).length
    )
      throw new InputError(
        'Invalid authenticated monitor configuration. Use HTTPS without redirects and valid credentials.',
      );
    const keywordRule = monitorKeyword(keyword, { method, authenticated });
    const authorization = authenticated
      ? await abortable(monitorAuthorization(auth, { request: tokenRequest }), controller.signal)
      : null;
    if (authorization) details.requestHeaders.Authorization = '[redacted]';
    let url = parseTarget(target);
    for (let redirects = 0; ; redirects++) {
      details.finalUrl = url.href;
      const response = await abortable(
        fetchHeaders(
          url,
          controller.signal,
          (snapshot) => {
            statusCode = snapshot.statusCode;
            details.responses.push(snapshot);
          },
          { method, userAgent, ...(authorization ? { authorization } : {}) },
        ),
        controller.signal,
      );
      if (!details.responses.includes(response))
        details.responses.push({ url: url.href, ...response });
      statusCode = response.statusCode;
      if (authenticated) {
        for (const snapshot of details.responses) {
          snapshot.headers = {};
          snapshot.statusMessage = http.STATUS_CODES[snapshot.statusCode] || 'HTTP response';
          delete snapshot.location;
          snapshot.body = {
            text: '',
            bytesCaptured: 0,
            truncated: false,
            omitted: 'Authenticated monitor: response body and headers are not captured.',
            error: null,
          };
        }
      }
      if (response.body?.error) throw new InputError(response.body.error);
      if (
        followRedirects === true &&
        [301, 302, 303, 307, 308].includes(statusCode) &&
        response.location
      ) {
        if (redirects >= 3) throw new InputError('Too many redirects (maximum 3).');
        url = parseTarget(new URL(response.location, url).href);
        continue;
      }
      const keywordResult = evaluateKeyword(keywordRule, response.body);
      if (keywordResult) details.keyword = { ...keywordRule, ...keywordResult };
      const successful =
        statusCode >= 200 && statusCode < (authenticated ? 300 : 400) && !keywordResult?.triggered;
      return {
        status: successful ? 'up' : 'down',
        statusCode,
        durationMs: Math.round(performance.now() - start),
        error: successful
          ? null
          : keywordResult?.triggered
            ? keywordResult.error
            : authenticated && statusCode >= 300 && statusCode < 400
              ? `HTTP ${statusCode}: authenticated checks do not accept login or other redirects.`
              : `HTTP ${statusCode}`,
        details,
      };
    }
  } catch (error) {
    const message = controller.signal.aborted
      ? 'Check timed out after 10 seconds.'
      : error instanceof InputError
        ? error.message
        : 'Connection, DNS, or TLS check failed.';
    return {
      status: 'down',
      statusCode,
      durationMs: Math.round(performance.now() - start),
      error: message,
      details,
    };
  } finally {
    clearTimeout(timer);
  }
}
