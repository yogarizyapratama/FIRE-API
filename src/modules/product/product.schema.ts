import { s } from 'fire-api';

export const CreateProductSchema = s.object({
  name: s.string().min(2).description('Product title or name'),
  status: s.enum(['active', 'draft']).default('active'),
});

export const ProductIdSchema = s.object({
  id: s.string().min(1),
});
