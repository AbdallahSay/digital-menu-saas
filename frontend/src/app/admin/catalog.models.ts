/** DTOs matching the backend catalog contract (F06/F07) one to one. */
export interface CategoryDto {
  id: string;
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
  isPublished: boolean;
  rowVersion: string;
}

export interface CategoryPage {
  page: number;
  pageSize: number;
  items: CategoryDto[];
}

export interface CategoryInput {
  nameAr: string;
  nameEn: string | null;
  sortOrder: number;
  isPublished: boolean;
}

export type SaveResult = 'ok' | 'invalid' | 'stale' | 'error' | 'partial';
export type DeleteResult = 'ok' | 'conflict' | 'stale' | 'error';
