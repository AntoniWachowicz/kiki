export default async function handler(req, res) {
  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) return res.status(500).json({ error: 'not configured' });

  try {
    const r = await fetch(redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'exhibit-current']),
    });
    const { result: url } = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ url: url ?? null });
  } catch {
    res.status(500).json({ error: 'read failed' });
  }
}
