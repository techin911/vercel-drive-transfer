// RTMP Stream Server Engine — Node-Media-Server
// Supports RTMP Ingest (Port 1935), HTTP-FLV Sub-Second Low Latency (<1s), HLS, and Multi-push Restreaming

const NodeMediaServer = require('node-media-server');
const express = require('express');
const cors = require('cors');

const RTMP_PORT = process.env.PORT || process.env.RTMP_PORT || 1935;
const HTTP_PORT = process.env.HTTP_PORT || 8000;

const config = {
  rtmp: {
    port: parseInt(RTMP_PORT, 10),
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: parseInt(HTTP_PORT, 10),
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=1:hls_list_size=3:hls_flags=delete_segments]',
        dash: false
      }
    ]
  }
};

const nms = new NodeMediaServer(config);

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent] prePublish stream:', id, StreamPath);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent] postPublish stream active:', id, StreamPath);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent] donePublish stream ended:', id, StreamPath);
});

nms.run();

// Health Check API for Vercel Dashboard & Uptime Monitors
const app = express();
app.use(cors());
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    rtmpPort: RTMP_PORT,
    httpPort: HTTP_PORT,
    streamUrl: `rtmp://localhost:${RTMP_PORT}/live`,
    flvUrl: `http://localhost:${HTTP_PORT}/live/stream.flv`,
    uptime: process.uptime()
  });
});

const API_PORT = process.env.API_PORT || 3001;
app.listen(API_PORT, () => {
  console.log(`[API Engine] Live Stream API listening on port ${API_PORT}`);
});
