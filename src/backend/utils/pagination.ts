export interface PaginationMeta {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function parsePaginationParams(
  query: Record<string, any>,
  defaultLimit = 50,
  maxLimit = 250
): { page: number; limit: number; offset: number; isPaginatedRequest: boolean } {
  const isPaginatedRequest = query.page !== undefined || query.limit !== undefined;
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? defaultLimit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : defaultLimit;

  const offset = (page - 1) * limit;
  return { page, limit, offset, isPaginatedRequest };
}

export function paginateArray<T>(
  allItems: T[],
  query: Record<string, any>,
  defaultLimit = 250,
  maxLimit = 500
): PaginatedResult<T> {
  const { page, limit, offset } = parsePaginationParams(query, defaultLimit, maxLimit);
  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const items = allItems.slice(offset, offset + limit);

  return {
    items,
    pagination: {
      page,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}
