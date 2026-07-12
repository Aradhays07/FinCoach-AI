import { useState } from 'react';
import { SkeletonTable, EmptyState, ErrorState } from './States';
import { Database } from 'lucide-react';
import s from './GenericTable.module.css';

export default function GenericTable({
  columns = [], data = [], loading = false, error = null,
  onRetry, emptyTitle = 'No data', emptyDesc = '',
  keyField = 'id', onRowClick, maxHeight,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...(data || [])].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) return <SkeletonTable rows={5} cols={columns.length || 4} />;
  if (error)   return <ErrorState message={error} onRetry={onRetry} />;
  if (!data?.length) return <EmptyState icon={Database} title={emptyTitle} desc={emptyDesc} />;

  return (
    <div className={s.wrap} style={maxHeight ? { maxHeight, overflowY:'auto' } : {}}>
      <table className={s.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className={`${s.th} ${col.sortable ? s.sortable : ''}`}
                style={{ width:col.width, textAlign:col.align || 'left' }}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}>
                {col.label}
                {col.sortable && sortKey === col.key && <span>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            // Use keyField value if available, otherwise prefix index to avoid collision
            const rowKey = row[keyField] != null ? String(row[keyField]) : `row-${i}`;
            return (
              <tr key={rowKey}
                className={`${s.tr} ${onRowClick ? s.clickable : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map(col => (
                  <td key={col.key} className={s.td} style={{ textAlign:col.align || 'left' }}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
