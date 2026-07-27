// Vercel Serverless Function — Temp Storage + Hidden Pixeldrain Transfer
// Step 1: Stores file temporarily in Vercel /tmp
// Step 2: Hidden server-to-server transfer to Pixeldrain using protected API Key
// Step 3: Cleans up Vercel /tmp storage automatically

import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false, // Enable raw streaming to /tmp
  },
};

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const rawFileName = req.headers['x-file-name'] || 'file_' + Date.now();
  const filename = decodeURIComponent(rawFileName);
  const tempPath = path.join('/tmp', `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  try {
    // Step 1: Receive file into Vercel /tmp storage
    const writeStream = fs.createWriteStream(tempPath);
    await new Promise((resolve, reject) => {
      req.pipe(writeStream);
      req.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Step 2: Hidden Background Server Transfer (Vercel /tmp -> Pixeldrain)
    const fileStats = fs.statSync(tempPath);
    const readStream = fs.createReadStream(tempPath);
    const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`;
    const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');

    const pdResp = await fetch(pixeldrainUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'Content-Length': fileStats.size.toString()
      },
      body: readStream,
      duplex: 'half'
    });

    const pdData = await pdResp.json().catch(() => ({}));

    // Step 3: Clean up Vercel /tmp storage
    try { fs.unlinkSync(tempPath); } catch (e) {}

    if (pdResp.ok && pdData.success) {
      return res.status(200).json({
        success: true,
        id: pdData.id,
        url: `https://pixeldrain.com/u/${pdData.id}`,
        downloadUrl: `https://pixeldrain.com/api/file/${pdData.id}?download`
      });
    } else {
      return res.status(pdResp.status || 500).json({
        success: false,
        message: pdData.message || 'Background transfer failed'
      });
    }

  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
    return res.status(500).json({ success: false, message: err.message });
  }
}
