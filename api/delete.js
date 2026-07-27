// Vercel Serverless Function — Pixeldrain Delete Proxy

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { fileId } = req.query || req.body || {};
    if (!fileId) return res.status(400).json({ success: false, message: 'Missing fileId' });

    const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');

    const response = await fetch(`https://pixeldrain.com/api/file/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });

    const data = await response.json().catch(() => ({ success: response.ok }));
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
