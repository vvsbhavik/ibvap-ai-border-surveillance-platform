import { RawFrame } from './types';

/**
 * Bounded circular frame buffer.
 * Enforces a strict ceiling on frame retention to prevent unbounded memory growth
 * while providing short pre-event buffering and real-time frame acquisition metrics.
 */
export class CircularFrameBuffer {
  private buffer: RawFrame[];
  private capacity: number;
  private head: number = 0;
  private count: number = 0;

  constructor(capacity: number = 30) {
    if (capacity < 1) {
      throw new Error('Frame buffer capacity must be at least 1');
    }
    this.capacity = capacity;
    this.buffer = new Array<RawFrame>(capacity);
  }

  /**
   * Pushes a new frame into the buffer, overwriting the oldest entry if full.
   */
  push(frame: RawFrame): void {
    const index = (this.head + this.count) % this.capacity;
    this.buffer[index] = frame;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer full, advance head to evict oldest frame
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Returns the most recent frame, or null if buffer is empty.
   */
  getLatest(): RawFrame | null {
    if (this.count === 0) return null;
    const latestIndex = (this.head + this.count - 1) % this.capacity;
    return this.buffer[latestIndex] || null;
  }

  /**
   * Returns all buffered frames ordered from oldest to newest.
   */
  getAll(): RawFrame[] {
    const result: RawFrame[] = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      if (this.buffer[index]) {
        result.push(this.buffer[index]);
      }
    }
    return result;
  }

  /**
   * Calculates actual moving FPS over the buffered frames window.
   */
  calculateFps(): number {
    if (this.count < 2) return 0;

    const oldest = this.buffer[this.head];
    const latestIndex = (this.head + this.count - 1) % this.capacity;
    const latest = this.buffer[latestIndex];

    if (!oldest || !latest) return 0;

    const tOld = new Date(oldest.timestamp).getTime();
    const tNew = new Date(latest.timestamp).getTime();
    const elapsedSeconds = (tNew - tOld) / 1000;

    if (elapsedSeconds <= 0) return 0;

    const fps = (this.count - 1) / elapsedSeconds;
    return Math.round(fps * 10) / 10;
  }

  /**
   * Total number of frames currently in buffer.
   */
  size(): number {
    return this.count;
  }

  /**
   * Clears the buffer.
   */
  clear(): void {
    this.buffer = new Array<RawFrame>(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}
