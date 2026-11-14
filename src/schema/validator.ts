import { BaseSchema, ValidationResult } from './schema';

export function validate<T>(schema: BaseSchema<T>, value: any): ValidationResult<T> {
  return schema.validate(value);
}
