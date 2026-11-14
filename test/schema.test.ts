import { describe, expect, it } from 'bun:test';
import { s, Infer } from '../src/schema/schema';
import { validate } from '../src/schema/validator';

describe('FireAPI FireSchema Validation Engine', () => {
  it('validates string constraints (min, max, email)', () => {
    const emailSchema = s.string().email();
    expect(validate(emailSchema, 'user@example.com').success).toBe(true);
    expect(validate(emailSchema, 'invalid-email').success).toBe(false);

    const lengthSchema = s.string().min(3).max(10);
    expect(validate(lengthSchema, 'ab').success).toBe(false);
    expect(validate(lengthSchema, 'valid').success).toBe(true);
    expect(validate(lengthSchema, 'too-long-string-here').success).toBe(false);
  });

  it('validates numbers with int and ranges', () => {
    const ageSchema = s.number().int().min(18).max(120);
    expect(validate(ageSchema, 25).success).toBe(true);
    expect(validate(ageSchema, 17).success).toBe(false);
    expect(validate(ageSchema, 25.5).success).toBe(false);
    expect(validate(ageSchema, '25').success).toBe(false); // strict type
  });

  it('validates nested objects with required and optional fields', () => {
    const userSchema = s.object({
      name: s.string().min(2),
      age: s.number().optional(),
      role: s.enum(['admin', 'user']).default('user'),
    });

    type User = Infer<typeof userSchema>;

    const validResult = validate(userSchema, { name: 'Alice' });
    expect(validResult.success).toBe(true);
    expect(validResult.data?.role).toBe('user'); // default value applied

    const invalidResult = validate(userSchema, { name: 'A' });
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.errors?.[0].field).toBe('name');
  });

  it('validates arrays of schemas', () => {
    const tagsSchema = s.array(s.string().min(1)).min(1);
    expect(validate(tagsSchema, ['tech', 'api']).success).toBe(true);
    expect(validate(tagsSchema, []).success).toBe(false); // min 1
    expect(validate(tagsSchema, ['tech', '']).success).toBe(false); // inner item invalid
  });
});
