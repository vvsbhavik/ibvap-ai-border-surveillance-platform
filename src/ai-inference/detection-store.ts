import { DetectionFilter, NormalizedDetection } from './types';

/**
 * Bounded in-memory store for normalized detection events.
 * Enforces strict memory caps with FIFO eviction.
 */
export class DetectionStore {
  private readonly capacity: number;
  private detections: NormalizedDetection[] = [];

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
  }

  /**
   * Adds a new detection event, evicting oldest if capacity is reached.
   */
  public add(detection: NormalizedDetection): void {
    if (this.detections.length >= this.capacity) {
      this.detections.shift();
    }
    this.detections.push(detection);
  }

  /**
   * Adds multiple detection events.
   */
  public addBatch(batch: NormalizedDetection[]): void {
    for (const item of batch) {
      this.add(item);
    }
  }

  /**
   * Retrieves a detection by ID.
   */
  public getById(detectionId: string): NormalizedDetection | null {
    return this.detections.find((d) => d.detectionId === detectionId) || null;
  }

  /**
   * Retrieves detections matching filter criteria.
   */
  public query(filter: DetectionFilter = {}): NormalizedDetection[] {
    let result = [...this.detections];

    if (filter.cameraId) {
      const cid = filter.cameraId;
      result = result.filter((d) => d.cameraId === cid);
    }

    if (filter.objectType) {
      result = result.filter((d) => d.objectType === filter.objectType);
    }

    if (filter.minConfidence !== undefined) {
      result = result.filter((d) => d.confidence >= (filter.minConfidence || 0));
    }

    if (filter.startTime) {
      const start = new Date(filter.startTime).getTime();
      result = result.filter((d) => new Date(d.timestamp).getTime() >= start);
    }

    if (filter.endTime) {
      const end = new Date(filter.endTime).getTime();
      result = result.filter((d) => new Date(d.timestamp).getTime() <= end);
    }

    // Sort descending by timestamp (newest first)
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filter.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  /**
   * Retrieves recent active detections for a camera within a time window (e.g. last 4 seconds)
   * used for rendering overlays on active live video streams.
   */
  public getActiveForCamera(cameraId: string, windowMs: number = 4000): NormalizedDetection[] {
    const now = Date.now();
    return this.detections
      .filter((d) => d.cameraId === cameraId && now - new Date(d.inferenceTimestamp).getTime() <= windowMs)
      .sort((a, b) => new Date(b.inferenceTimestamp).getTime() - new Date(a.inferenceTimestamp).getTime());
  }

  /**
   * Retrieves the most recent detection for a specific camera.
   */
  public getLatestForCamera(cameraId: string): NormalizedDetection | null {
    const cameraDetections = this.detections.filter((d) => d.cameraId === cameraId);
    if (cameraDetections.length === 0) return null;
    return cameraDetections[cameraDetections.length - 1];
  }

  /**
   * Clears all detections.
   */
  public clear(): void {
    this.detections = [];
  }

  /**
   * Returns current count of stored detections.
   */
  public count(): number {
    return this.detections.length;
  }
}

export const detectionStore = new DetectionStore(1000);
