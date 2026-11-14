export type SchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum' | 'any';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export abstract class BaseSchema<T = any> {
  public abstract type: SchemaType;
  public isOptional = false;
  public defaultValue?: T;
  public descriptionText?: string;

  public optional(): this {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.isOptional = true;
    return clone;
  }

  public default(val: T): this {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.defaultValue = val;
    return clone;
  }

  public description(desc: string): this {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.descriptionText = desc;
    return clone;
  }

  public abstract validate(value: any, path?: string): ValidationResult<T>;
  public abstract toOpenAPI(): Record<string, any>;
}

export class StringSchema extends BaseSchema<string> {
  public type: SchemaType = 'string';
  public minLength?: number;
  public maxLength?: number;
  public isEmail = false;
  public regexPattern?: RegExp;

  public min(length: number): this {
    this.minLength = length;
    return this;
  }

  public max(length: number): this {
    this.maxLength = length;
    return this;
  }

  public email(): this {
    this.isEmail = true;
    return this;
  }

  public regex(pattern: RegExp): this {
    this.regexPattern = pattern;
    return this;
  }

  public validate(value: any, path = ''): ValidationResult<string> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required string', code: 'REQUIRED' }],
      };
    }

    if (typeof value !== 'string') {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Expected string, received ${typeof value}`, code: 'INVALID_TYPE' }],
      };
    }

    if (this.minLength !== undefined && value.length < this.minLength) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Must be at least ${this.minLength} characters`, code: 'TOO_SHORT' }],
      };
    }

    if (this.maxLength !== undefined && value.length > this.maxLength) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Must be at most ${this.maxLength} characters`, code: 'TOO_LONG' }],
      };
    }

    if (this.isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return {
          success: false,
          errors: [{ field: path || 'value', message: 'Invalid email address', code: 'INVALID_EMAIL' }],
        };
      }
    }

    if (this.regexPattern && !this.regexPattern.test(value)) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'String does not match pattern', code: 'REGEX_MISMATCH' }],
      };
    }

    return { success: true, data: value };
  }

  public toOpenAPI(): Record<string, any> {
    const spec: Record<string, any> = { type: 'string' };
    if (this.minLength !== undefined) spec.minLength = this.minLength;
    if (this.maxLength !== undefined) spec.maxLength = this.maxLength;
    if (this.isEmail) spec.format = 'email';
    if (this.defaultValue !== undefined) spec.default = this.defaultValue;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export class NumberSchema extends BaseSchema<number> {
  public type: SchemaType = 'number';
  public minVal?: number;
  public maxVal?: number;
  public isInteger = false;

  public min(val: number): this {
    this.minVal = val;
    return this;
  }

  public max(val: number): this {
    this.maxVal = val;
    return this;
  }

  public int(): this {
    this.isInteger = true;
    return this;
  }

  public validate(value: any, path = ''): ValidationResult<number> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required number', code: 'REQUIRED' }],
      };
    }

    if (typeof value !== 'number' || isNaN(value)) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Expected number, received ${typeof value}`, code: 'INVALID_TYPE' }],
      };
    }

    if (this.isInteger && !Number.isInteger(value)) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Must be an integer', code: 'NOT_AN_INTEGER' }],
      };
    }

    if (this.minVal !== undefined && value < this.minVal) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Must be >= ${this.minVal}`, code: 'TOO_SMALL' }],
      };
    }

    if (this.maxVal !== undefined && value > this.maxVal) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Must be <= ${this.maxVal}`, code: 'TOO_LARGE' }],
      };
    }

    return { success: true, data: value };
  }

  public toOpenAPI(): Record<string, any> {
    const spec: Record<string, any> = { type: this.isInteger ? 'integer' : 'number' };
    if (this.minVal !== undefined) spec.minimum = this.minVal;
    if (this.maxVal !== undefined) spec.maximum = this.maxVal;
    if (this.defaultValue !== undefined) spec.default = this.defaultValue;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export class BooleanSchema extends BaseSchema<boolean> {
  public type: SchemaType = 'boolean';

  public validate(value: any, path = ''): ValidationResult<boolean> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required boolean', code: 'REQUIRED' }],
      };
    }

    if (typeof value !== 'boolean') {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Expected boolean, received ${typeof value}`, code: 'INVALID_TYPE' }],
      };
    }

    return { success: true, data: value };
  }

  public toOpenAPI(): Record<string, any> {
    const spec: Record<string, any> = { type: 'boolean' };
    if (this.defaultValue !== undefined) spec.default = this.defaultValue;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export class EnumSchema<T extends string> extends BaseSchema<T> {
  public type: SchemaType = 'enum';
  constructor(public values: T[]) {
    super();
  }

  public validate(value: any, path = ''): ValidationResult<T> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required enum', code: 'REQUIRED' }],
      };
    }

    if (!this.values.includes(value)) {
      return {
        success: false,
        errors: [
          {
            field: path || 'value',
            message: `Invalid value. Expected one of: ${this.values.join(', ')}`,
            code: 'INVALID_ENUM',
          },
        ],
      };
    }

    return { success: true, data: value };
  }

  public toOpenAPI(): Record<string, any> {
    const spec: Record<string, any> = { type: 'string', enum: this.values };
    if (this.defaultValue !== undefined) spec.default = this.defaultValue;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export class ArraySchema<T = any> extends BaseSchema<T[]> {
  public type: SchemaType = 'array';
  public minItems?: number;
  public maxItems?: number;

  constructor(public itemSchema: BaseSchema<T>) {
    super();
  }

  public min(count: number): this {
    this.minItems = count;
    return this;
  }

  public max(count: number): this {
    this.maxItems = count;
    return this;
  }

  public validate(value: any, path = ''): ValidationResult<T[]> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required array', code: 'REQUIRED' }],
      };
    }

    if (!Array.isArray(value)) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Expected array, received ${typeof value}`, code: 'INVALID_TYPE' }],
      };
    }

    if (this.minItems !== undefined && value.length < this.minItems) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Array must contain at least ${this.minItems} items`, code: 'TOO_FEW_ITEMS' }],
      };
    }

    if (this.maxItems !== undefined && value.length > this.maxItems) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Array must contain at most ${this.maxItems} items`, code: 'TOO_MANY_ITEMS' }],
      };
    }

    const validatedItems: T[] = [];
    const allErrors: ValidationError[] = [];

    for (let i = 0; i < value.length; i++) {
      const itemRes = this.itemSchema.validate(value[i], `${path}[${i}]`);
      if (!itemRes.success && itemRes.errors) {
        allErrors.push(...itemRes.errors);
      } else {
        validatedItems.push(itemRes.data!);
      }
    }

    if (allErrors.length > 0) {
      return { success: false, errors: allErrors };
    }

    return { success: true, data: validatedItems };
  }

  public toOpenAPI(): Record<string, any> {
    const spec: Record<string, any> = {
      type: 'array',
      items: this.itemSchema.toOpenAPI(),
    };
    if (this.minItems !== undefined) spec.minItems = this.minItems;
    if (this.maxItems !== undefined) spec.maxItems = this.maxItems;
    if (this.defaultValue !== undefined) spec.default = this.defaultValue;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export class ObjectSchema<TShape extends Record<string, BaseSchema> = any> extends BaseSchema {
  public type: SchemaType = 'object';

  constructor(public shape: TShape) {
    super();
  }

  public validate(value: any, path = ''): ValidationResult {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: this.defaultValue };
      if (this.defaultValue !== undefined) return { success: true, data: this.defaultValue };
      return {
        success: false,
        errors: [{ field: path || 'value', message: 'Required object', code: 'REQUIRED' }],
      };
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      return {
        success: false,
        errors: [{ field: path || 'value', message: `Expected object, received ${typeof value}`, code: 'INVALID_TYPE' }],
      };
    }

    const result: Record<string, any> = {};
    const allErrors: ValidationError[] = [];

    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key];
      const fieldPath = path ? `${path}.${key}` : key;
      const fieldRes = fieldSchema.validate(value[key], fieldPath);

      if (!fieldRes.success && fieldRes.errors) {
        allErrors.push(...fieldRes.errors);
      } else if (fieldRes.data !== undefined) {
        result[key] = fieldRes.data;
      }
    }

    if (allErrors.length > 0) {
      return { success: false, errors: allErrors };
    }

    return { success: true, data: result };
  }

  public toOpenAPI(): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      properties[key] = schema.toOpenAPI();
      if (!schema.isOptional && schema.defaultValue === undefined) {
        required.push(key);
      }
    }

    const spec: Record<string, any> = {
      type: 'object',
      properties,
    };
    if (required.length > 0) spec.required = required;
    if (this.descriptionText) spec.description = this.descriptionText;
    return spec;
  }
}

export interface FileSchemaOptions {
  maxSize?: number | string; // e.g. 5242880 or '5MB'
  types?: string[]; // e.g. ['image/png', 'image/jpeg']
}

export function parseSizeToBytes(size: number | string): number {
  if (typeof size === 'number') return size;
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) return 10 * 1024 * 1024;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  switch (unit) {
    case 'KB': return num * 1024;
    case 'MB': return num * 1024 * 1024;
    case 'GB': return num * 1024 * 1024 * 1024;
    default: return num;
  }
}

export class FileSchema extends BaseSchema<any> {
  public type: SchemaType = 'any';
  public maxSizeBytes?: number;
  public allowedTypes?: string[];

  constructor(options: FileSchemaOptions = {}) {
    super();
    if (options.maxSize) {
      this.maxSizeBytes = parseSizeToBytes(options.maxSize);
    }
    if (options.types) {
      this.allowedTypes = options.types;
    }
  }

  public validate(value: any, path = 'file'): ValidationResult<any> {
    if (value === undefined || value === null) {
      if (this.isOptional) return { success: true, data: undefined };
      return { success: false, errors: [{ field: path, message: `${path} is required`, code: 'REQUIRED' }] };
    }

    const size = typeof value.size === 'number' ? value.size : 0;
    const type = typeof value.type === 'string' ? value.type : '';

    if (this.maxSizeBytes !== undefined && size > this.maxSizeBytes) {
      return {
        success: false,
        errors: [{
          field: path,
          message: `File size ${size} bytes exceeds maximum allowed size of ${this.maxSizeBytes} bytes`,
          code: 'FILE_TOO_LARGE',
        }],
      };
    }

    if (this.allowedTypes && this.allowedTypes.length > 0) {
      const isAllowed = this.allowedTypes.some((t) =>
        t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t
      );
      if (!isAllowed) {
        return {
          success: false,
          errors: [{
            field: path,
            message: `File type "${type}" is not allowed. Allowed types: ${this.allowedTypes.join(', ')}`,
            code: 'FILE_INVALID_TYPE',
          }],
        };
      }
    }

    return { success: true, data: value };
  }

  public toOpenAPI(): Record<string, any> {
    return {
      type: 'string',
      format: 'binary',
      description: this.descriptionText || 'Binary file upload',
    };
  }
}

export const s = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  enum: <T extends string>(values: T[]) => new EnumSchema<T>(values),
  array: <T>(itemSchema: BaseSchema<T>) => new ArraySchema<T>(itemSchema),
  object: <TShape extends Record<string, BaseSchema>>(shape: TShape) => new ObjectSchema<TShape>(shape),
  file: (options?: FileSchemaOptions) => new FileSchema(options),
};

export type Infer<T> = T extends BaseSchema<infer R> ? R : any;
