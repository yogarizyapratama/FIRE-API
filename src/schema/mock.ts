import {
  ArraySchema,
  BaseSchema,
  BooleanSchema,
  EnumSchema,
  NumberSchema,
  ObjectSchema,
  StringSchema,
} from './schema';

export function generateMock(schema: BaseSchema): any {
  if (schema.defaultValue !== undefined) {
    return schema.defaultValue;
  }

  if (schema instanceof StringSchema) {
    if (schema.isEmail) {
      return `user_${Math.random().toString(36).slice(2, 6)}@example.com`;
    }
    const min = schema.minLength || 5;
    const base = 'sample_text';
    if (base.length < min) {
      return base + '_'.repeat(min - base.length);
    }
    if (schema.maxLength && base.length > schema.maxLength) {
      return base.slice(0, schema.maxLength);
    }
    return base;
  }

  if (schema instanceof NumberSchema) {
    const min = schema.minVal !== undefined ? schema.minVal : 1;
    const max = schema.maxVal !== undefined ? schema.maxVal : 100;
    const val = min + (max - min) / 2;
    return schema.isInteger ? Math.round(val) : Math.round(val * 100) / 100;
  }

  if (schema instanceof BooleanSchema) {
    return true;
  }

  if (schema instanceof EnumSchema) {
    return schema.values[0] || 'default';
  }

  if (schema instanceof ArraySchema) {
    const count = schema.minItems || 2;
    return Array.from({ length: count }, () => generateMock(schema.itemSchema));
  }

  if (schema instanceof ObjectSchema) {
    const obj: Record<string, any> = {};
    for (const [key, propSchema] of Object.entries(schema.shape)) {
      obj[key] = generateMock(propSchema as BaseSchema);
    }
    return obj;
  }

  return 'mock_data';
}
