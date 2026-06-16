export default async function handler(req, res) {
  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(errorPage('Redis not configured.'));
  }

  try {
    const r = await fetch(redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'exhibit-current']),
    });
    const { result: imageUrl } = await r.json();

    if (!imageUrl) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(errorPage('The exhibition hasn\'t started yet.<br>Come back soon.'));
    }

    res.redirect(302, `/capture?url=${encodeURIComponent(imageUrl)}`);
  } catch {
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(errorPage('Something went wrong.'));
  }
}

function errorPage(message) {
  return `<!doctype html><html><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><p style="opacity:.35;font-size:11px;letter-spacing:.3em;text-transform:uppercase;margin-bottom:20px">Bouba / Kiki</p><p style="opacity:.2;font-size:11px;line-height:1.8">${message}</p></div></body></html>`;
}
