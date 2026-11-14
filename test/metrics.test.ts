import { describe, expect, it } from 'bun:test';
import { MetricsCollector } from '../src/metrics/metrics';
import { createApp } from '../src/core/app';

describe('FireAPI Prometheus Metrics & APM Engine (fire-api/metrics)', () => {
  it('records requests and formats standard Prometheus output', () => {
    const collector = new MetricsCollector();

    collector.recordRequest('GET', '/api/users', 200, 1.45);
    collector.recordRequest('GET', '/api/users', 200, 2.10);
    collector.recordRequest('POST', '/api/users', 201, 5.20);
    collector.recordRequest('GET', '/api/secret', 403, 0.80);

    const output = collector.formatPrometheus();

    expect(output).toContain('# HELP http_requests_total');
    expect(output).toContain('# TYPE http_requests_total counter');
    expect(output).toContain('http_requests_total{method="GET",path="/api/users",status="200"} 2');
    expect(output).toContain('http_requests_total{method="POST",path="/api/users",status="201"} 1');
    expect(output).toContain('http_requests_total{method="GET",path="/api/secret",status="403"} 1');
    expect(output).toContain('http_request_duration_ms_count');
    expect(output).toContain('process_resident_memory_bytes');
    expect(output).toContain('process_uptime_seconds');
  });

  it('serves Prometheus metrics at /metrics automatically from FireApp', async () => {
    const app = createApp();

    // Trigger one request to record
    await app.handle(new Request('http://localhost:3000/docs'));

    const metricsRes = await app.handle(new Request('http://localhost:3000/metrics'));
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.headers.get('Content-Type')).toContain('text/plain');

    const text = await metricsRes.text();
    expect(text).toContain('http_requests_total');
    expect(text).toContain('method="GET"');
  });
});
