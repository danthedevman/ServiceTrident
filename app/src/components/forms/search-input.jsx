import React, { forwardRef } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

/** Shared list search keeps its decorative icon clear of text and native controls. */
export const SearchInput = forwardRef(function SearchInput({ className = '', ...props }, ref) {
  return (
    <span className="list-search-input relative block min-w-0">
      <input {...props} ref={ref} type="search" className={`!mt-0 !pr-10 ${className}`} />
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400"
      />
    </span>
  );
});
