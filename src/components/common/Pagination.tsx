import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}) => {
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex justify-between items-center p-4 border-t border-zinc-800 bg-zinc-900">
      <span className="text-xs text-zinc-500">
        Mostrando {start}-{end} de {totalItems}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-sm text-xs font-bold text-zinc-300 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-3 py-1 text-xs font-mono text-zinc-400 flex items-center bg-zinc-950 rounded-sm border border-zinc-800">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-sm text-xs font-bold text-zinc-300 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
