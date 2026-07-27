// Vercel Serverless Function — Vercel Blob Client Upload Handler
// Generates client upload token and handles background transfer to Pixeldrain

import { handleUpload } from '@vercel/blob/client';

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: [
            'application/octet-stream',
            'application/x-msdownload',
            'application/zip',
            'application/x-zip-compressed',
            'image/*',
            'video/*',
            'audio/*',
            'text/*',
            '*/*'
          ],
          tokenPayload: JSON.stringify({ filename: pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = JSON.parse(tokenPayload || '{}');
          const filename = payload.filename || 'file_' + Date.now();

          const blobResp = await fetch(blob.url);
          if (!blobResp.ok) return;

          const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`;
          const authHeader = 'Basic ' + Buffer.from(':' + API_KEY).toString('base64');

          await fetch(pixeldrainUrl, {
            method: 'PUT',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/octet-stream'
            },
            body: blobResp.body,
            duplex: 'half'
          });
        } catch (err) {
          console.error('Pixeldrain sync error:', err);
        }
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
