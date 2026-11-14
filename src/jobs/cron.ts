export interface CronTask {
  stop(): void;
  isRunning: boolean;
}

export function parseInterval(expression: string): number {
  const match = expression.trim().toLowerCase().match(/^(\d+)(ms|s|m|h|d)?$/);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2] || 's';
    switch (unit) {
      case 'ms': return val;
      case 's': return val * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': return val * 3600 * 1000;
      case 'd': return val * 86400 * 1000;
      default: return val * 1000;
    }
  }

  // Common cron aliases
  switch (expression.trim().toLowerCase()) {
    case '@hourly': return 3600 * 1000;
    case '@daily':
    case '@midnight': return 86400 * 1000;
    case '@weekly': return 7 * 86400 * 1000;
    default:
      // Default to 1 minute for unknown cron pattern in lightweight engine
      return 60 * 1000;
  }
}

export class FireCronScheduler {
  private activeTimers: Set<any> = new Set();

  public schedule(expression: string, task: () => Promise<void> | void): CronTask {
    const intervalMs = parseInterval(expression);
    let isRunning = true;

    const timer = setInterval(() => {
      if (!isRunning) return;
      try {
        Promise.resolve(task()).catch((e) => {
          console.error('[FireCron Error]', e);
        });
      } catch (err) {
        console.error('[FireCron Error]', err);
      }
    }, intervalMs);

    // Don't keep Node process alive if only cron timers remain
    if (timer && typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }

    this.activeTimers.add(timer);

    const cronTask: CronTask = {
      isRunning: true,
      stop: () => {
        isRunning = false;
        cronTask.isRunning = false;
        clearInterval(timer);
        this.activeTimers.delete(timer);
      },
    };

    return cronTask;
  }

  public stopAll(): void {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
    this.activeTimers.clear();
  }
}
