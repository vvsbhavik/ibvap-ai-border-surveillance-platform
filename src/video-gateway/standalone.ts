/**
 * IBVAP Video Gateway Standalone Service Entrypoint
 * Can be deployed and executed as an independent microservice container.
 */
import express from 'express';
import { videoGateway } from './video-gateway';

const app = express();
const PORT = process.env.GATEWAY_PORT ? parseInt(process.env.GATEWAY_PORT, 10) : 8554;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'ibvap-video-gateway',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activeStreamsCount: videoGateway.getAllStreams().length,
  });
});

// List all active streams
app.get('/streams', (req, res) => {
  res.json({
    streams: videoGateway.getAllStreams(),
    count: videoGateway.getAllStreams().length,
    timestamp: new Date().toISOString(),
  });
});

// Get single stream telemetry
app.get('/streams/:cameraId', (req, res) => {
  const stream = videoGateway.getStream(req.params.cameraId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found for camera', cameraId: req.params.cameraId });
  }
  res.json({ stream });
});

// Stream health endpoint
app.get('/streams/:cameraId/health', (req, res) => {
  const stream = videoGateway.getStream(req.params.cameraId);
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found for camera', cameraId: req.params.cameraId });
  }
  res.json({
    cameraId: stream.cameraId,
    healthState: stream.healthState,
    connectionState: stream.connectionState,
    currentFps: stream.currentFps,
    currentLatencyMs: stream.currentLatencyMs,
    lastHeartbeatAt: stream.lastHeartbeatAt,
    lastError: stream.lastError,
  });
});

// Test connection
app.post('/streams/:cameraId/test', async (req, res) => {
  try {
    const result = await videoGateway.testConnection(req.params.cameraId, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Stream test failure' });
  }
});

// Reconnect stream
app.post('/streams/:cameraId/reconnect', async (req, res) => {
  const success = await videoGateway.reconnectStream(req.params.cameraId);
  if (!success) {
    return res.status(404).json({ error: 'Stream session not found for camera' });
  }
  const stream = videoGateway.getStream(req.params.cameraId);
  res.json({ success: true, stream });
});

// Latest frame
app.get('/streams/:cameraId/frame', (req, res) => {
  const frame = videoGateway.getLatestFrame(req.params.cameraId);
  if (!frame) {
    return res.status(404).json({ error: 'No frame available for camera' });
  }
  res.json({ frame });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VideoGateway Standalone] Microservice running on port ${PORT}`);
  });
}

export default app;
