/** DTOs matching the backend item catalog contract (F07) one to one. */
export interface ItemDto {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  currencyCode: string;
  sortOrder: number;
  isPublished: boolean;
  isAvailable: boolean;
  rowVersion: string;
}

export interface ItemPage {
  page: number;
  pageSize: number;
  items: ItemDto[];
}

export interface ItemInput {
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  currencyCode: string;
  sortOrder: number;
  isPublished: boolean;
  isAvailable: boolean;
}

/** Response of POST /api/v1/admin/items/{id}/images (201). */
export interface ItemImageDto {
  id: string;
  menuItemId: string;
  width: number;
  height: number;
  contentType: string;
  sortOrder: number;
}

export type ItemSaveResult = 'ok' | 'invalid' | 'stale' | 'error';
export type ItemDeleteResult = 'ok' | 'stale' | 'error';
export type ImageUploadResult = 'ok' | 'too-large' | 'unsupported' | 'error';
