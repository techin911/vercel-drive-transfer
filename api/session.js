// Vercel Serverless Function — Creates Google Drive upload sessions on YOUR Drive
// Zero login required for visitors on any PC/phone

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID || '218914001742-ek6ptsbn8voiuj8da5uqamda57kd9vb.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN || '';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, size, type } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Missing file name' });

    // Step 1: Get Access Token using Refresh Token or Server Key
    let accessToken = process.env.GDRIVE_ACCESS_TOKEN || '';

    if (REFRESH_TOKEN && CLIENT_SECRET) {
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: REFRESH_TOKEN,
          grant_type: 'refresh_token'
        })
      });
      const tokenData = await tokenResp.json();
      if (tokenData.access_token) accessToken = tokenData.access_token;
    }

    if (!accessToken) {
      return res.status(500).json({ 
        error: 'GDRIVE_REFRESH_TOKEN or GDRIVE_ACCESS_TOKEN environment variable not set on Vercel.' 
      });
    }

    // Step 2: Create Resumable Upload Session on YOUR Google Drive
    const driveResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': type || 'application/octet-stream',
        'X-Upload-Content-Length': size || 0
      },
      body: JSON.stringify({
        name: name,
        mimeType: type || 'application/octet-stream',
        appProperties: { app: 'DriveTransfer', uploadedAt: new Date().toISOString() }
      })
    });

    if (!driveResp.ok) {
      const errText = await driveResp.text();
      return res.status(driveResp.status).json({ error: 'Google Drive API error: ' + errText });
    }

    const uploadUrl = driveResp.headers.get('Location');
    return res.status(200).json({ uploadUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
