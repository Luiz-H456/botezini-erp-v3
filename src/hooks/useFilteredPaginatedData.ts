import { useState, useMemo, useEffect } from 'react';

export function useFilteredPaginatedData<T extends Record<string, unknown>>(
  data: T[],
  searchTerm: string,
  itemsPerPage: number,
  searchFields?: (keyof T)[]
) {
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      const str = JSON.stringify(
        searchFields
          ? searchFields.map((f) => item[f])
          : Object.values(item)
      ).toLowerCase();
      return str.includes(term);
    });
  }, [data, searchTerm, searchFields]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return {
    filteredData,
    paginatedData,
    totalPages,
    currentPage,
    setCurrentPage,
  };
}
