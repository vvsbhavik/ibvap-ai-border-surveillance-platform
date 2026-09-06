/**
 * IBVAP — Gemini Live API Adapter (Preparation & Interface Contract)
 *
 * Section 16 Requirement:
 * "If the current environment cannot safely support the complete Live API, do NOT fake it.
 *  Instead provide a clean adapter/interface so it can be implemented later.
 *  Do not claim Gemini Live is implemented unless a genuine live session is established."
 */

export interface LiveSessionConfig {
  model: string;
  responseModalities: ('AUDIO' | 'TEXT')[];
  systemInstruction?: string;
  voiceName?: string;
  samplingRateHz?: number;
}

export interface LiveFramePacket {
  cameraId: string;
  mimeType: 'image/jpeg' | 'image/png';
  dataBase64: string;
  timestamp: string;
}

export interface LiveAudioPacket {
  mimeType: 'audio/pcm;rate=16000' | 'audio/pcm;rate=24000';
  dataBase64: string;
  timestamp: string;
}

export interface IGeminiLiveSession {
  sessionId: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
  sendRealtimeInput(input: { audio?: LiveAudioPacket; frame?: LiveFramePacket; text?: string }): Promise<void>;
  close(): Promise<void>;
}

export interface GeminiLiveStatusReport {
  isSupported: boolean;
  status: 'NOT_IMPLEMENTED';
  reason: string;
  adapterInterfaceVersion: string;
  requiredInfrastructure: string[];
}

export class GeminiLiveAdapter {
  private static readonly ADAPTER_VERSION = '1.0.0-draft';

  /**
   * Returns authoritative status of the Gemini Live subsystem.
   * Conforms to Section 16 truthfulness: does NOT claim live session is established.
   */
  public static getStatus(): GeminiLiveStatusReport {
    return {
      isSupported: false,
      status: 'NOT_IMPLEMENTED',
      reason:
        'Live bidirectional audio/video streaming requires full-duplex WebRTC/WSS proxy infrastructure not configured in current sandbox environment. The clean adapter contract is prepared for future integration.',
      adapterInterfaceVersion: this.ADAPTER_VERSION,
      requiredInfrastructure: [
        'Bidirectional WebSocket Gateway',
        'WebRTC PCM Audio capture client',
        'Live H.264/JPEG frame streamer',
        'Gemini Multimodal Live API endpoint',
      ],
    };
  }

  /**
   * Placeholder factory that cleanly rejects session creation until genuine streaming backend is provisioned.
   */
  public static async createLiveSession(_config: LiveSessionConfig): Promise<IGeminiLiveSession> {
    const report = this.getStatus();
    throw new Error(`Gemini Live Session cannot be established: ${report.reason}`);
  }
}
