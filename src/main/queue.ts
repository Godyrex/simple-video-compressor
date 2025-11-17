import os from "os";
import { FFmpegManager } from "./ffmpeg/manager";

type JobPayload = any;

export class QueueManager {
  private concurrency: number;
  private running = 0;
  private queue: JobPayload[] = [];
  private ff: FFmpegManager;

  constructor(ffmpegManager: FFmpegManager, concurrency?: number) {
    this.ff = ffmpegManager;
    this.concurrency =
      concurrency || Math.max(1, Math.floor(os.cpus().length / 2));
  }

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n);
    this.tryStartNext();
  }

  add(job: JobPayload, progressCb: (p: any) => void) {
    this.queue.push({ job, progressCb });
    this.tryStartNext();
  }

  private tryStartNext() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.start(item.job, item.progressCb);
    }
  }

  private async start(job: JobPayload, progressCb: (p: any) => void) {
    this.running++;
    try {
      const res = await this.ff.startCompression(job, progressCb);
      try {
        progressCb({ id: job.id, done: true, outputPath: res.outputPath });
      } catch (e) {
        // ignore progress callback errors
      }
    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
      progressCb({ id: job.id, error: String(err) });
    } finally {
      this.running--;
      this.tryStartNext();
    }
  }

  cancel(id: string) {
    const idx = this.queue.findIndex((q: any) => q.job.id === id);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.ff.cancel(id);
  }
}
