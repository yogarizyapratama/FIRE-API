import { FireDatabase, QueryBuilder } from '../types';

export type { FireDatabase, QueryBuilder };

export interface WhereClause {
  field: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'in';
  value: any;
}
