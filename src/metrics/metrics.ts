export class MetricsCollector {
  private requestCounters: Map<string, number> = new Map();
  private requestDurations: Map<string, { count: number; sum: number }> = new Map();
  private dbQueriesCount = 0;
  private startTime: number = Date.now();

  public recordRequest(method: string, path: string, status: number, durationMs: number): void {
    // 1. Counter: http_requests_total
    const counterKey = `method="${method}",path="${path}",status="${status}"`;
    const currentCount = this.requestCounters.get(counterKey) || 0;
    this.requestCounters.set(counterKey, currentCount + 1);

    // 2. Summary: http_request_duration_ms
    const durationKey = `method="${method}",path="${path}"`;
    const currentDuration = this.requestDurations.get(durationKey) || { count: 0, sum: 0 };
    this.requestDurations.set(durationKey, {
      count: currentDuration.count + 1,
      sum: currentDuration.sum + durationMs,
    });
  }

  public recordDbQuery(): void {
    this.dbQueriesCount++;
  }

  public formatPrometheus(): string {
    const lines: string[] = [];

    // HTTP Requests Total
    lines.push('# HELP http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE http_requests_total counter');
    for (const [labels, count] of this.requestCounters.entries()) {
      lines.push(`http_requests_total{${labels}} ${count}`);
    }

    // HTTP Request Duration
    lines.push('# HELP http_request_duration_ms Total request processing time in milliseconds');
    lines.push('# TYPE http_request_duration_ms summary');
    for (const [labels, stats] of this.requestDurations.entries()) {
      lines.push(`http_request_duration_ms_sum{${labels}} ${stats.sum.toFixed(3)}`);
      lines.push(`http_request_duration_ms_count{${labels}} ${stats.count}`);
    }

    // DB Queries Total
    lines.push('# HELP fire_db_queries_total Total database queries executed');
    lines.push('# TYPE fire_db_queries_total counter');
    lines.push(`fire_db_queries_total ${this.dbQueriesCount}`);

    // Process Memory
    let memoryBytes = 0;
    if (typeof process !== 'undefined' && process.memoryUsage) {
      memoryBytes = process.memoryUsage().rss;
    }
    lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${memoryBytes}`);

    // Process Uptime
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptimeSeconds}`);

    return lines.join('\n') + '\n';
  }
}
