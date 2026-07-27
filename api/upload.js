// Vercel Edge Function Proxy for Pixeldrain Uploads
// Enables Unlimited Streaming Body Uploads with 0 CORS & 0 Buffer Body Limit

export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const filename = url.searchParams.get('name') || 'file_' + Date.now();
    const pixeldrainUrl = `https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`;
    const authHeader = 'Basic ' + btoa(':' + API_KEY);

    const pixeldrainResp = await fetch(pixeldrainUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': req.headers.get('content-type') || 'application/octet-stream',
      },
      body: req.body,
      duplex: 'half'
    });

    const data = await pixeldrainResp.text();

    return new Response(data, {
      status: pixeldrainResp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
