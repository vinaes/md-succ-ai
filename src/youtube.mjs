/**
 * YouTube transcript extraction via innertube player API (ANDROID client).
 * Custom implementation — youtube-transcript npm package returns empty arrays.
 */
import { countTokens, scoreMarkdown } from './markdown.mjs';
import { getLog } from './logger.mjs';
import { getProxyPool } from './proxy-pool.mjs';

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

/**
 * Fetch YouTube transcript via innertube player API (ANDROID client).
 * No API key registration needed — uses the public innertube key.
 */
async function fetchYouTubeTranscript(videoId) {
  const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

  const pool = getProxyPool();
  const proxy = pool.getNext();
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US) gzip',
    },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } },
      videoId,
    }),
    signal: AbortSignal.timeout(15000),
  };
  if (proxy) fetchOpts.dispatcher = proxy.dispatcher;
  let playerRes;
  try {
    playerRes = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
      fetchOpts,
    );
  } catch (e) {
    if (proxy) pool.markFailed(proxy.url);
    throw e;
  }
  if (!playerRes.ok) {
    if (proxy) pool.markFailed(proxy.url);
    throw new Error(`Innertube player returned ${playerRes.status}`);
  }
  const playerData = await playerRes.json();

  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error('No caption tracks found');

  // Prefer English, fall back to first track
  const track = tracks.find((t) => t.languageCode === 'en')
    || tracks.find((t) => t.languageCode?.startsWith('en'))
    || tracks[0];
  if (!track?.baseUrl) throw new Error('No caption URL found');

  // SSRF guard: only allow YouTube timedtext URLs
  const captionUrl = new URL(track.baseUrl);
  if (captionUrl.hostname !== 'www.youtube.com' && captionUrl.hostname !== 'youtube.com') {
    throw new Error(`Unexpected caption host: ${captionUrl.hostname}`);
  }

  const captionOpts = { signal: AbortSignal.timeout(10000), redirect: 'manual' };
  if (proxy) captionOpts.dispatcher = proxy.dispatcher;
  let xmlRes;
  try {
    xmlRes = await fetch(track.baseUrl, captionOpts);
  } catch (e) {
    if (proxy) pool.markFailed(proxy.url);
    throw e;
  }
  if (!xmlRes.ok) {
    if (proxy) pool.markFailed(proxy.url);
    throw new Error(`Timedtext returned ${xmlRes.status}`);
  }
  if (proxy) pool.markSuccess(proxy.url);
  const xml = await xmlRes.text();

  // Parse XML — supports both formats:
  // Format 3 (ANDROID): <p t="1360" d="1680">text</p>
  // Legacy: <text start="1.23" dur="4.56">text</text>
  const segments = [];
  const pRegex = /<p\s+(?=[^>]*\bt="(\d+)")(?=[^>]*\bd="(\d+)")[^>]*>([\s\S]*?)<\/p>/g;
  const textRegex = /<text\s+(?=[^>]*\bstart="([^"]*)")[^>]*>([\s\S]*?)<\/text>/g;

  function decodeEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    const offsetMs = parseInt(m[1], 10) || 0;
    const text = decodeEntities(m[3]);
    if (text) segments.push({ offset: offsetMs, text });
  }

  if (!segments.length) {
    while ((m = textRegex.exec(xml)) !== null) {
      const startSec = parseFloat(m[1]) || 0;
      const text = decodeEntities(m[2]);
      if (text) segments.push({ offset: Math.round(startSec * 1000), text });
    }
  }

  return segments;
}

/**
 * Extract title from YouTube page via oEmbed.
 */
async function fetchYouTubeTitle(videoId) {
  const pool = getProxyPool();
  const proxy = pool.getNext();
  try {
    const oEmbedOpts = { signal: AbortSignal.timeout(5000), redirect: 'manual' };
    if (proxy) oEmbedOpts.dispatcher = proxy.dispatcher;
    const oEmbed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtube.com/watch?v=${videoId}`)}&format=json`,
      oEmbedOpts,
    );
    if (oEmbed.ok) {
      const data = await oEmbed.json();
      if (proxy) pool.markSuccess(proxy.url);
      if (data.title) return data.title;
    } else if (proxy) {
      pool.markFailed(proxy.url);
    }
  } catch (e) {
    if (proxy) pool.markFailed(proxy.url);
    getLog().warn({ videoId, err: e.message }, 'oEmbed failed');
  }
  return `YouTube Video ${videoId}`;
}

/**
 * Extract YouTube video transcript as markdown.
 * Returns null if URL is not YouTube or transcript unavailable.
 */
export async function tryYouTube(url) {
  const match = url.match(YOUTUBE_REGEX);
  if (!match) {
    if (url.includes('youtube') || url.includes('youtu.be')) {
      getLog().warn({ url: url.slice(0, 120) }, 'URL looks like YouTube but regex did not match');
    }
    return null;
  }

  const videoId = match[1];
  try {
    const t0 = performance.now();

    const [segments, title] = await Promise.all([
      fetchYouTubeTranscript(videoId),
      fetchYouTubeTitle(videoId),
    ]);
    if (!segments?.length) return null;

    const lines = segments.map((s) => {
      const totalSec = Math.floor(s.offset / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const min = Math.floor((totalSec % 3600) / 60);
      const sec = totalSec % 60;
      const ts = hrs > 0
        ? `${hrs}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${min}:${String(sec).padStart(2, '0')}`;
      return `[${ts}] ${s.text}`;
    });

    const plainText = segments.map((s) => s.text).join(' ');
    const markdown = `# ${title}\n\n**Video:** ${url}\n\n## Transcript\n\n${lines.join('\n')}`;
    const tokens = countTokens(markdown);
    const quality = scoreMarkdown(markdown);

    const ms = Math.round(performance.now() - t0);
    getLog().info({ videoId, title, segments: segments.length, tokens, ms }, 'youtube transcript');

    return {
      title,
      markdown,
      tokens,
      readability: false,
      excerpt: plainText.slice(0, 200),
      byline: '',
      siteName: 'YouTube',
      htmlLength: 0,
      method: 'youtube-transcript',
      quality,
      plainTranscript: plainText,
    };
  } catch (e) {
    getLog().info({ videoId, err: e.message }, 'transcript unavailable');
    return null;
  }
}
