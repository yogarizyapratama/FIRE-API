import { FireQueue, FireQueueJob } from '../types';

export class FireQueueManager implements FireQueue {
  private jobs: Map<string, FireQueueJob> = new Map();
  private handlers: Map<string, (data: any, job: FireQueueJob) => Promise<void> | void> = new Map();
  private pendingQueue: string[] = [];
  private isProcessing = false;
  private concurrency: number;
  private activeWorkers = 0;

  constructor(options: { concurrency?: number } = {}) {
    this.concurrency = options.concurrency || 5;
  }

  public handle<T = any>(
    name: string,
    worker: (data: T, job: FireQueueJob<T>) => Promise<void> | void
  ): void {
    this.handlers.set(name, worker);
  }

  public async dispatch<T = any>(
    name: string,
    data: T,
    options: { maxAttempts?: number; delayMs?: number } = {}
  ): Promise<FireQueueJob<T>> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: FireQueueJob<T> = {
      id,
      name,
      data,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: Date.now(),
      status: 'pending',
    };

    (job as any).retryDelayMs = options.retryDelayMs ?? 50;

    this.jobs.set(id, job);

    if (options.delayMs && options.delayMs > 0) {
      setTimeout(() => {
        this.pendingQueue.push(id);
        this.processQueue();
      }, options.delayMs);
    } else {
      this.pendingQueue.push(id);
      queueMicrotask(() => this.processQueue());
    }

    return job;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.pendingQueue.length > 0 && this.activeWorkers < this.concurrency) {
        const jobId = this.pendingQueue.shift();
        if (!jobId) break;

        const job = this.jobs.get(jobId);
        if (!job || job.status === 'completed' || job.status === 'failed') continue;

        const handler = this.handlers.get(job.name);
        if (!handler) {
          // No handler registered yet; keep job pending or delay
          this.pendingQueue.push(jobId);
          break;
        }

        this.activeWorkers++;
        job.status = 'processing';
        job.attempts++;

        Promise.resolve(handler(job.data, job))
          .then(() => {
            job.status = 'completed';
          })
          .catch((err) => {
            if (job.attempts < job.maxAttempts) {
              job.status = 'pending';
              const baseDelay = (job as any).retryDelayMs || 50;
              const backoffMs = Math.min(baseDelay * Math.pow(2, job.attempts - 1), 5000);
              setTimeout(() => {
                this.pendingQueue.push(jobId);
                this.processQueue();
              }, backoffMs);
            } else {
              job.status = 'failed';
            }
          })
          .finally(() => {
            this.activeWorkers--;
            this.processQueue();
          });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getJob(id: string): FireQueueJob | undefined {
    return this.jobs.get(id);
  }
}
