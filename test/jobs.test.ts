import { describe, expect, it } from 'bun:test';
import { FireQueueManager } from '../src/jobs/queue';
import { FireCronScheduler } from '../src/jobs/cron';

describe('FireAPI Zero-Redis Background Jobs & Cron Scheduler', () => {
  it('dispatches and processes background jobs asynchronously', async () => {
    const queue = new FireQueueManager();
    let processedData: any = null;

    queue.handle('send-welcome', async (data) => {
      processedData = data;
    });

    const job = await queue.dispatch('send-welcome', { to: 'yoga@fire.dev', name: 'Yoga' });
    expect(job.id).toBeDefined();
    expect(job.name).toBe('send-welcome');

    // Wait briefly for in-process worker to consume
    await new Promise((r) => setTimeout(r, 30));

    expect(processedData).toEqual({ to: 'yoga@fire.dev', name: 'Yoga' });
    expect(job.status).toBe('completed');
  });

  it('retries failed jobs up to maxAttempts', async () => {
    const queue = new FireQueueManager();
    let attemptCount = 0;

    queue.handle('unstable-task', async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Temporary glitch');
      }
    });

    const job = await queue.dispatch('unstable-task', {}, { maxAttempts: 3 });

    await new Promise((r) => setTimeout(r, 60));

    expect(attemptCount).toBe(2);
    expect(job.status).toBe('completed');
  });

  it('executes scheduled cron tasks periodically and supports stopping', async () => {
    const cron = new FireCronScheduler();
    let ticks = 0;

    const task = cron.schedule('20ms', () => {
      ticks++;
    });

    await new Promise((r) => setTimeout(r, 55));
    expect(ticks).toBeGreaterThanOrEqual(2);

    task.stop();
    const recordedTicks = ticks;
    await new Promise((r) => setTimeout(r, 40));
    expect(ticks).toBe(recordedTicks); // stopped, ticks didn't increase
  });
});
