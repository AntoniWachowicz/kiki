// Server-side audio proxy — lets the browser load audio from any URL by
// fetching it here where there are no CORS restrictions.
// Deployed as a Vercel serverless function at /api/proxy?url=<encoded-url>.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — stays within Vercel response limits

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).end('Missing url parameter');
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).end('Invalid URL');
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).end('Only http/https URLs are supported');
    return;
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; audio-fetcher/1.0)' },
    });
  } catch (err) {
    res.status(502).end(`Could not reach upstream: ${err.message}`);
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).end(`Upstream returned ${upstream.status}`);
    return;
  }

  const lenHeader = upstream.headers.get('content-length');
  if (lenHeader && parseInt(lenHeader, 10) > MAX_BYTES) {
    res.status(413).end('File too large for proxy (max 5 MB) — download it and upload directly');
    return;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    res.status(413).end('File too large for proxy (max 5 MB) — download it and upload directly');
    return;
  }

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(buf);
}
