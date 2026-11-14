import { describe, expect, it } from 'bun:test';
import { runBenchmark, formatBenchmarkReport } from '../src/cli/bench';

describe('FireAPI Built-in Benchmark Harness CLI', () => {
  it('measures throughput and percentiles from mock load', async () => {
    // Simulated fast API endpoint returning in 0.5ms - 1ms
    const mockEndpoint = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return new Response(JSON.stringify({ status: 'ok' }));
    };

    const stats = await runBenchmark('http://localhost:3000/mock', {
      concurrency: 5,
      totalRequests: 50,
      customFetch: mockEndpoint,
    });

    expect(stats.totalRequests).toBe(50);
    expect(stats.successfulRequests).toBe(50);
    expect(stats.failedRequests).toBe(0);
    expect(stats.rps).toBeGreaterThan(0);
    expect(stats.latency.p50).toBeGreaterThanOrEqual(0);
    expect(stats.latency.p99).toBeGreaterThanOrEqual(stats.latency.p50);

    const report = formatBenchmarkReport(stats);
    expect(report).toContain('FireAPI Benchmark Engine');
    expect(report).toContain('Requests/sec:');
    expect(report).toContain('P50:');
    expect(report).toContain('P99:');
  });
});
