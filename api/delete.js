// Vercel Edge Function Proxy for Pixeldrain Deletions

export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.PIXELDRAIN_API_KEY || '969ca829-a330-44af-a95a-473ae11cd1cb';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    if (!fileId) {
      return new Response(JSON.stringify({ success: false, message: 'Missing fileId' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const authHeader = 'Basic ' + btoa(':' + API_KEY);
    const pixeldrainResp = await fetch(`https://pixeldrain.com/api/file/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader },
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
