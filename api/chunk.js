// Vercel Serverless Function — Zero-Configuration Chunk Processor
// Accepts 3MB binary chunks, appends to /tmp, and streams to Pixeldrain upon completion.
// Requires ZERO token configuration!

import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false, // Enable raw binary chunk streaming
  },
};

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Id, X-Chunk-Index, X-Total-Chunks, X-File-Name');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const fileId = (req.headers['x-file-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10);
  const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10);
  const rawFileName = req.headers['x-file-name'] || 'file_' + Date.now();
  const filename = decodeURIComponent(rawFileName);

  if (!fileId) return res.status(400).json({ success: false, message: 'Missing X-File-Id' });

  const chunkDir = path.join('/tmp', `chunks_${fileId}`);
  if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

  const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);

  try {
    // Save chunk stream to disk
    const writeStream = fs.createWriteStream(chunkPath);
    await new Promise((resolve, reject) => {
      req.pipe(writeStream);
      req.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const receivedCount = fs.readdirSync(chunkDir).length;

    if (receivedCount < totalChunks) {
      return res.status(200).json({ success: true, status: 'chunk_received', chunkIndex, totalChunks });
    }

    // All chunks received! Combine into final file
    const finalFilePath = path.join('/tmp', `final_${fileId}`);
    const finalStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < totalChunks; i++) {
      const pPath = path.join(chunkDir, `chunk_${i}`);
      if (fs.existsSync(pPath)) {
        finalStream.write(fs.readFileSync(pPath));
      }
    }
    finalStream.end();
    await new Promise((resolve) => finalStream.on('finish', resolve));

    // Upload assembled file to Pixeldrain API
    const targetFilename = filename || 'file_' + Date.now();
    const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(targetFilename)}`;
    const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');
    const fileBuffer = fs.readFileSync(finalFilePath);

    const pdResp = await fetch(pixeldrainUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/octet-stream'
      },
      body: fileBuffer
    });

    const pdData = await pdResp.json().catch((e) => ({ success: false, message: 'JSON parse error: ' + e.message }));

    // Cleanup temp files
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      fs.unlinkSync(finalFilePath);
    } catch (e) {}

    if (pdResp.ok && pdData.success && pdData.id) {
      return res.status(200).json({
        success: true,
        id: pdData.id,
        url: `https://pixeldrain.com/u/${pdData.id}`,
        downloadUrl: `https://pixeldrain.com/api/file/${pdData.id}?download`
      });
    } else {
      return res.status(400).json({
        success: false,
        message: pdData.message || pdData.value || `Pixeldrain HTTP ${pdResp.status}`
      });
    }

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
