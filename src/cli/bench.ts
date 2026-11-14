export interface BenchmarkOptions {
  concurrency?: number;
  totalRequests?: number;
  durationSec?: number;
  customFetch?: (url: string) => Promise<Response>;
}

export interface BenchmarkStats {
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationMs: number;
  rps: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export async function runBenchmark(url: string, options: BenchmarkOptions = {}): Promise<BenchmarkStats> {
  const concurrency = options.concurrency || 10;
  const total = options.totalRequests || 200;
  const fetchFn = options.customFetch || globalThis.fetch;

  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let sent = 0;

  const startTime = performance.now();

  async function worker() {
    while (sent < total) {
      sent++;
      const reqStart = performance.now();
      try {
        const res = await fetchFn(url);
        const reqDuration = performance.now() - reqStart;
        latencies.push(reqDuration);
        if (res.ok) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch {
        const reqDuration = performance.now() - reqStart;
        latencies.push(reqDuration);
        failedRequests++;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const durationMs = performance.now() - startTime;
  const rps = Math.round((latencies.length / (durationMs / 1000)) * 100) / 100;

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, val) => acc + val, 0);

  return {
    url,
    totalRequests: latencies.length,
    successfulRequests,
    failedRequests,
    durationMs: Math.round(durationMs),
    rps,
    latency: {
      min: Math.round((latencies[0] || 0) * 100) / 100,
      max: Math.round((latencies[latencies.length - 1] || 0) * 100) / 100,
      avg: Math.round((sum / (latencies.length || 1)) * 100) / 100,
      p50: Math.round(percentile(latencies, 50) * 100) / 100,
      p90: Math.round(percentile(latencies, 90) * 100) / 100,
      p95: Math.round(percentile(latencies, 95) * 100) / 100,
      p99: Math.round(percentile(latencies, 99) * 100) / 100,
    },
  };
}

export function formatBenchmarkReport(stats: BenchmarkStats): string {
  const successRate = stats.totalRequests > 0
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
    : '0';

  return `
==================================================
🔥 FireAPI Benchmark Engine
==================================================
Target:        ${stats.url}
Duration:      ${stats.durationMs} ms
Total Reqs:    ${stats.totalRequests}
Success Rate:  ${successRate}% (${stats.successfulRequests} ok / ${stats.failedRequests} fail)

🚀 Requests/sec: ${stats.rps.toLocaleString()} req/s

Latency (ms):
  Min:  ${stats.latency.min} ms
  P50:  ${stats.latency.p50} ms
  P90:  ${stats.latency.p90} ms
  P95:  ${stats.latency.p95} ms
  P99:  ${stats.latency.p99} ms
  Max:  ${stats.latency.max} ms
==================================================
`;
}
