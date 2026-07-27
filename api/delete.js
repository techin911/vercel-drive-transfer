// Vercel Serverless Function — Deletes files from YOUR Google Drive

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID || '218914001742-ek6ptsbn8voiuj8da5uqamda57kd9vb.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

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
      return res.status(500).json({ error: 'Missing access credentials' });
    }

    const deleteResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (deleteResp.ok || deleteResp.status === 204) {
      return res.status(200).json({ status: 'deleted' });
    } else {
      const errText = await deleteResp.text();
      return res.status(deleteResp.status).json({ error: errText });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
