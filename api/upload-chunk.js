// Vercel Serverless Function — Chunked Upload Handler
// Slices large files (400MB+) into 2.5 MB chunks to bypass Vercel 4.5MB payload limit and timeouts.
// Assembles final file and uploads to Pixeldrain API server-to-server.

import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const { fileId, chunkIndex, totalChunks, filename, content } = req.body || {};
    if (!fileId || content === undefined) {
      return res.status(400).json({ success: false, message: 'Missing parameters' });
    }

    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkDir = path.join('/tmp', `chunks_${safeFileId}`);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    const buffer = Buffer.from(content, 'base64');
    fs.writeFileSync(chunkPath, buffer);

    const uploadedChunks = fs.readdirSync(chunkDir).length;

    if (uploadedChunks < totalChunks) {
      return res.status(200).json({ success: true, status: 'chunk_received', chunkIndex, totalChunks });
    }

    // Final Chunk Arrived: Assemble all chunks into a single file
    const finalFilePath = path.join('/tmp', `final_${safeFileId}_file`);
    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(chunkDir, `chunk_${i}`);
      if (fs.existsSync(partPath)) {
        const partBuffer = fs.readFileSync(partPath);
        writeStream.write(partBuffer);
      }
    }
    writeStream.end();

    await new Promise((resolve) => writeStream.on('finish', resolve));

    // Upload assembled file to Pixeldrain API
    const targetFilename = filename || 'file_' + Date.now();
    const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(targetFilename)}`;
    const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');
    const finalStats = fs.statSync(finalFilePath);
    const readStream = fs.createReadStream(finalFilePath);

    const pdResp = await fetch(pixeldrainUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/octet-stream',
        'Content-Length': finalStats.size.toString()
      },
      body: readStream,
      duplex: 'half'
    });

    const pdData = await pdResp.json().catch(() => ({}));

    // Cleanup temp files
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true });
      fs.unlinkSync(finalFilePath);
    } catch (e) {}

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
        message: pdData.message || 'Pixeldrain upload error'
      });
    }

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
