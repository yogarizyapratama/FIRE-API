import { describe, expect, it } from 'bun:test';
import { s } from '../src/schema/schema';
import { generateMock } from '../src/schema/mock';

describe('FireAPI Schema-Driven Auto-Mocking Engine', () => {
  it('generates schema-compliant mock data that passes schema validation 100%', () => {
    const ProductSchema = s.object({
      id: s.string().min(3),
      title: s.string().min(2),
      email: s.string().email(),
      price: s.number().min(10).max(500),
      isAvailable: s.boolean(),
      category: s.enum(['electronics', 'books', 'fashion']),
      tags: s.array(s.string().min(1)).min(1),
    });

    const mockData = generateMock(ProductSchema);

    expect(mockData).toBeDefined();
    expect(typeof mockData.title).toBe('string');
    expect(mockData.email).toContain('@');
    expect(mockData.price).toBeGreaterThanOrEqual(10);
    expect(mockData.price).toBeLessThanOrEqual(500);
    expect(typeof mockData.isAvailable).toBe('boolean');
    expect(['electronics', 'books', 'fashion']).toContain(mockData.category);
    expect(Array.isArray(mockData.tags)).toBe(true);
    expect(mockData.tags.length).toBeGreaterThanOrEqual(1);

    // Verify it passes validation
    const validation = ProductSchema.validate(mockData);
    expect(validation.success).toBe(true);
  });
});
