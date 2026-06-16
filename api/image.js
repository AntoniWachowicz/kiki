export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('url required');

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).send('invalid url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).send('only http/https supported');
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).send('upstream failed');

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="bouba-kiki.jpg"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).send('proxy error');
  }
}
