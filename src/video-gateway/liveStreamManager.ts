/**
 * IBVAP Live Stream Manager (Client-Side)
 * Handles genuine real-time video stream capture, browser MediaStream acquisition,
 * bounded connection lifecycles, and frame ingestion pipeline.
 */

import { api } from '../api/client';

export type LiveConnectionState = 'IDLE' | 'CONNECTING' | 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface CameraLiveState {
  cameraId: string;
  mediaStream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  isStreaming: boolean;
  connectionState: LiveConnectionState;
  error: string | null;
  fps: number;
  framesSent: number;
  lastFrameSentAt: string | null;
  retryCount: number;
}

type LiveStateListener = (states: Map<string, CameraLiveState>) => void;

class LiveStreamManager {
  private states = new Map<string, CameraLiveState>();
  private frameIntervals = new Map<string, number>();
  private listeners = new Set<LiveStateListener>();
  private offscreenCanvas: HTMLCanvasElement | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 640;
      this.offscreenCanvas.height = 360;
    }
  }

  public getState(cameraId: string): CameraLiveState {
    let state = this.states.get(cameraId);
    if (!state) {
      state = {
        cameraId,
        mediaStream: null,
        videoElement: null,
        isStreaming: false,
        connectionState: 'IDLE',
        error: null,
        fps: 0,
        framesSent: 0,
        lastFrameSentAt: null,
        retryCount: 0,
      };
      this.states.set(cameraId, state);
    }
    return state;
  }

  public subscribe(listener: LiveStateListener): () => void {
    this.listeners.add(listener);
    listener(new Map(this.states));
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const copy = new Map(this.states);
    this.listeners.forEach((l) => l(copy));
  }

  /**
   * Starts capturing the operator's local webcam for a specified camera ID.
   * Feeds the live stream directly to the browser DOM and streams raw frames to the backend gateway.
   */
  public async startWebcamStream(
    cameraId: string,
    constraints?: MediaStreamConstraints
  ): Promise<MediaStream> {
    const state = this.getState(cameraId);
    state.connectionState = 'CONNECTING';
    state.error = null;
    this.notify();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser mediaDevices API not available in this environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia(
        constraints || {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        }
      );

      state.mediaStream = stream;
      state.isStreaming = true;
      state.connectionState = 'ONLINE';
      state.fps = 30;
      state.retryCount = 0;
      state.error = null;

      // Create an internal hidden video element to read frames from
      if (!state.videoElement && typeof document !== 'undefined') {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        video.play().catch((err) => console.warn('Autoplay error:', err));
        state.videoElement = video;
      } else if (state.videoElement) {
        state.videoElement.srcObject = stream;
        state.videoElement.play().catch((err) => console.warn('Autoplay error:', err));
      }

      // Handle unexpected track ending
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.handleStreamDisruption(cameraId, 'Camera track stopped or device disconnected');
        };
      }

      // Start periodic frame capture to push to IBVAP backend (1 frame every 600ms = ~1.67 fps for analytics buffer)
      this.startFrameIngestion(cameraId);
      this.notify();

      return stream;
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied by user or browser security policy.'
        : err.name === 'NotFoundError'
        ? 'No video camera input device detected.'
        : err.message || 'Failed to initialize camera video stream.';

      state.connectionState = 'DEGRADED';
      state.error = msg;
      state.isStreaming = false;
      this.notify();
      throw new Error(msg);
    }
  }

  /**
   * Bounded retry logic on stream disruption (max 3 retries)
   */
  private handleStreamDisruption(cameraId: string, reason: string) {
    const state = this.getState(cameraId);
    this.stopFrameIngestion(cameraId);

    if (state.retryCount < 3) {
      state.retryCount += 1;
      state.connectionState = 'DEGRADED';
      state.error = `${reason}. Reconnecting (attempt ${state.retryCount}/3)...`;
      this.notify();

      const backoffMs = Math.min(1000 * Math.pow(2, state.retryCount), 5000);
      setTimeout(() => {
        if (state.isStreaming) {
          this.startWebcamStream(cameraId).catch((err) => {
            console.warn(`Retry ${state.retryCount} failed for camera ${cameraId}:`, err);
          });
        }
      }, backoffMs);
    } else {
      state.connectionState = 'OFFLINE';
      state.error = `${reason}. Maximum reconnect attempts exceeded. Please verify camera hardware.`;
      state.isStreaming = false;
      this.notify();
    }
  }

  private startFrameIngestion(cameraId: string) {
    this.stopFrameIngestion(cameraId);

    const intervalId = window.setInterval(async () => {
      const state = this.states.get(cameraId);
      if (!state || !state.isStreaming || !state.videoElement || !this.offscreenCanvas) {
        return;
      }

      const video = state.videoElement;
      if (video.readyState < 2) return; // HAVE_CURRENT_DATA or higher

      try {
        const ctx = this.offscreenCanvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        const dataUri = this.offscreenCanvas.toDataURL('image/jpeg', 0.65);

        // Submit to IBVAP backend live gateway
        await api.video.submitLiveFrame(cameraId, {
          dataUri,
          width: this.offscreenCanvas.width,
          height: this.offscreenCanvas.height,
          timestamp: new Date().toISOString(),
          metadata: {
            source: 'WEBCAM',
            fps: state.fps,
            resolution: `${video.videoWidth || 1280}x${video.videoHeight || 720}`,
          },
        });

        state.framesSent += 1;
        state.lastFrameSentAt = new Date().toISOString();
        if (state.connectionState !== 'ONLINE') {
          state.connectionState = 'ONLINE';
          this.notify();
        }
      } catch (e) {
        // Suppress transient frame post error
      }
    }, 600);

    this.frameIntervals.set(cameraId, intervalId);
  }

  private stopFrameIngestion(cameraId: string) {
    const id = this.frameIntervals.get(cameraId);
    if (id) {
      clearInterval(id);
      this.frameIntervals.delete(cameraId);
    }
  }

  /**
   * Stops the live webcam stream and releases media hardware tracks
   */
  public stopWebcamStream(cameraId: string) {
    const state = this.states.get(cameraId);
    if (!state) return;

    this.stopFrameIngestion(cameraId);

    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      state.mediaStream = null;
    }

    if (state.videoElement) {
      state.videoElement.srcObject = null;
      state.videoElement = null;
    }

    state.isStreaming = false;
    state.connectionState = 'IDLE';
    state.error = null;
    state.fps = 0;
    this.notify();
  }

  /**
   * Attach existing stream to a target HTML video element (e.g. inside a tile)
   */
  public attachToElement(cameraId: string, element: HTMLVideoElement | null): boolean {
    const state = this.states.get(cameraId);
    if (!state || !state.mediaStream || !element) return false;

    if (element.srcObject !== state.mediaStream) {
      element.srcObject = state.mediaStream;
      element.play().catch((err) => console.warn('Tile video play failed:', err));
    }
    return true;
  }
}

export const liveStreamManager = new LiveStreamManager();
