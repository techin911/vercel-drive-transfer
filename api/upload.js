// Vercel Serverless Function — Pixeldrain Upload Proxy
// Eliminates browser CORS errors 100% by forwarding file uploads server-to-server

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export const config = {
  api: {
    bodyParser: false, // Enable raw streaming for large files
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const filename = req.query.name || 'file_' + Date.now();
    const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`;

    const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');

    const response = await fetch(pixeldrainUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': req.headers['content-type'] || 'application/octet-stream'
      },
      body: req,
      duplex: 'half'
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
