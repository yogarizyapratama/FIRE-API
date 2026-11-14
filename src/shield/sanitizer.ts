export function sanitizePayload<T = any>(data: T): T {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item)) as any;
  }

  // Create clean dictionary with null prototype to prevent prototype poisoning
  const clean: Record<string, any> = {};

  for (const key of Object.keys(data)) {
    // Strip dangerous prototype keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const val = (data as any)[key];
    clean[key] = typeof val === 'object' && val !== null ? sanitizePayload(val) : val;
  }

  return clean as T;
}
