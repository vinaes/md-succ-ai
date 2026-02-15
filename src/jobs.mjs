/**
 * Redis-backed async job queue with webhook delivery.
 *
 * Jobs are stored in Redis with 1-hour TTL.
 * Webhook callbacks support 3 retries with exponential backoff.
 */
import { nanoid } from 'nanoid';
import { getCache, setCache } from './redis.mjs';
import { getLog } from './logger.mjs';
import { webhookDeliveriesTotal } from './metrics.mjs';

const JOB_TTL = 3600; // 1 hour
const WEBHOOK_RETRIES = 3;
const WEBHOOK_BACKOFF = [1000, 5000, 25000]; // 1s, 5s, 25s

/**
 * Create a new async job.
 * @param {string} url - Target URL to convert
 * @param {object} options - Conversion options (mode, links, max_tokens)
 * @param {string} [callbackUrl] - Webhook URL for result delivery
 * @returns {Promise<{id: string, status: string}>}
 */
export async function createJob(url, options, callbackUrl) {
  const id = nanoid(8);
  const job = {
    id,
    url,
    options: options || {},
    callbackUrl: callbackUrl || null,
    status: 'processing',
    createdAt: Date.now(),
  };
  await setCache(`job:${id}`, job, JOB_TTL);
  return job;
}

/** Get job by ID */
export async function getJob(id) {
  return getCache(`job:${id}`);
}

/** Mark job as completed and deliver webhook if configured */
export async function completeJob(id, result) {
  const job = await getCache(`job:${id}`);
  if (!job) return;

  const q = result.quality || { score: 0, grade: 'F' };
  job.status = 'completed';
  job.result = {
    title: result.title,
    url: result.url,
    content: result.markdown,
    tokens: result.tokens,
    tier: result.tier,
    quality: q,
    time_ms: result.totalMs,
    method: result.method || 'unknown',
  };
  job.completedAt = Date.now();
  await setCache(`job:${id}`, job, JOB_TTL);

  if (job.callbackUrl) {
    deliverWebhook(job).catch(() => {});
  }
}

/** Mark job as failed and deliver webhook if configured */
export async function failJob(id, error) {
  const job = await getCache(`job:${id}`);
  if (!job) return;

  job.status = 'failed';
  job.error = error;
  job.completedAt = Date.now();
  await setCache(`job:${id}`, job, JOB_TTL);

  if (job.callbackUrl) {
    deliverWebhook(job).catch(() => {});
  }
}

/** Deliver webhook with retry (exponential backoff) */
async function deliverWebhook(job) {
  const log = getLog();
  const payload = JSON.stringify({
    job_id: job.id,
    status: job.status,
    result: job.result || undefined,
    error: job.error || undefined,
  });

  for (let attempt = 0; attempt < WEBHOOK_RETRIES; attempt++) {
    try {
      const res = await fetch(job.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        webhookDeliveriesTotal.inc({ status: 'success' });
        log.info({ jobId: job.id, attempt }, 'webhook delivered');
        return;
      }
      log.warn({ jobId: job.id, attempt, httpStatus: res.status }, 'webhook failed');
    } catch (err) {
      log.warn({ jobId: job.id, attempt, err: err.message }, 'webhook error');
    }
    if (attempt < WEBHOOK_RETRIES - 1) {
      await new Promise(r => setTimeout(r, WEBHOOK_BACKOFF[attempt]));
    }
  }
  webhookDeliveriesTotal.inc({ status: 'failed' });
  log.error({ jobId: job.id, callbackUrl: job.callbackUrl }, 'webhook delivery exhausted');
}
