import { checkWebsite } from './monitoring/check.js';
const origin = new URL(process.env.PROBE_APP_URL || '');
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
  throw new Error('Use an application origin without credentials or a path.');
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  throw new Error('Probe API requires HTTPS.');
const probeId = process.env.PROBE_ID,
  token = process.env.PROBE_TOKEN;
if (!/^[a-f\d]{24}$/.test(probeId || '') || !/^[a-f\d]{64}$/.test(token || ''))
  throw new Error('Configure PROBE_ID and PROBE_TOKEN.');
const request = async (path, body) => {
  const response = await fetch(new URL(`/api/probe/v1/${probeId}/${path}`, origin), {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Probe API HTTP ${response.status}`);
  return response.json();
};
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
while (!stopped) {
  try {
    const { job } = await request('jobs', {});
    if (job) {
      const result = await checkWebsite(job.url, {
        method: job.method,
        followRedirects: job.followRedirects,
        keyword: job.keyword,
      });
      await request('results', {
        jobId: job.id,
        leaseId: job.leaseId,
        status: result.status,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
      });
    }
  } catch {
    console.error(
      'Probe check or result submission failed. Check API connectivity and credentials.',
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
