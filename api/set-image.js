export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return res.status(500).json({ error: 'not configured' });

  const { url } = req.body ?? {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });

  try {
    await fetch(redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', 'exhibit-current', url]),
    });
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'write failed' });
  }
}
