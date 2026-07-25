'use client';

import React from 'react';

interface LoadingSkeletonProps {
  type?: 'table' | 'cards' | 'stats';
  rows?: number;
}

export function TableRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs animate-pulse">
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between">
        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
        <div className="h-4 bg-slate-200 rounded w-1/6"></div>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 bg-slate-200 rounded-lg"></div>
              <div className="space-y-1.5 flex-1">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="h-3 bg-slate-100 rounded w-1/5"></div>
              </div>
            </div>
            <div className="h-4 bg-slate-200 rounded w-20 font-mono"></div>
            <div className="h-6 bg-slate-200 rounded-md w-24"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-xs space-y-3 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            <div className="w-8 h-8 bg-slate-100 rounded-xl"></div>
          </div>
          <div className="h-7 bg-slate-200 rounded w-2/3"></div>
          <div className="h-3 bg-slate-100 rounded w-1/3"></div>
        </div>
      ))}
    </div>
  );
}

export default function LoadingSkeleton({ type = 'table', rows = 6 }: LoadingSkeletonProps) {
  if (type === 'stats') return <StatCardsSkeleton count={rows} />;
  return <TableRowSkeleton rows={rows} />;
}
