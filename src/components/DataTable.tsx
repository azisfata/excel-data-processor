import React, { useMemo, useCallback, memo } from 'react';
import { FixedSizeList } from 'react-window';

interface DataTableProps {
  data: any[];
  columns: {
    key: string;
    label: string;
    width?: number;
    align?: 'left' | 'right' | 'center';
    render?: (row: any, index: number) => React.ReactNode;
  }[];
  onRowClick?: (row: any, index: number) => void;
  isLoading?: boolean;
  height?: number;
  itemSize?: number;
  className?: string;
}

const DataTableRow = memo(
  ({
    row,
    index,
    columns,
    onRowClick,
    isOdd,
  }: {
    row: any;
    index: number;
    columns: DataTableProps['columns'];
    onRowClick?: DataTableProps['onRowClick'];
    isOdd: boolean;
  }) => {
    const handleClick = useCallback(() => {
      onRowClick?.(row, index);
    }, [row, index, onRowClick]);

    return (
      <div
        className={`flex items-center border-b border-gray-200 hover:bg-blue-50 transition-colors cursor-pointer ${
          isOdd ? 'bg-white' : 'bg-gray-50'
        }`}
        onClick={handleClick}
        style={{ minHeight: '48px' }}
      >
        {columns.map(column => {
          const value = row[column.key];
          const alignClass =
            column.align === 'right'
              ? 'justify-end'
              : column.align === 'center'
                ? 'justify-center'
                : 'justify-start';

          return (
            <div
              key={column.key}
              className={`px-6 py-3 text-sm text-gray-900 flex-shrink-0 ${alignClass}`}
              style={{ width: column.width || 'auto' }}
            >
              {column.render ? (
                column.render(row, index)
              ) : (
                <span className="truncate">
                  {typeof value === 'number' ? value.toLocaleString('id-ID') : value || '-'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

DataTableRow.displayName = 'DataTableRow';

export const DataTable = memo(
  ({
    data,
    columns,
    onRowClick,
    isLoading = false,
    height = 600,
    itemSize = 48,
    className = '',
  }: DataTableProps) => {
    // Memoize the row data to prevent unnecessary re-renders
    const rowData = useMemo(() => {
      return data.map((row, index) => ({
        row,
        index,
        isOdd: index % 2 === 1,
      }));
    }, [data]);

    const renderRow = useCallback(
      ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const { row, isOdd } = rowData[index];

        return (
          <div style={style}>
            <DataTableRow
              row={row}
              index={index}
              columns={columns}
              onRowClick={onRowClick}
              isOdd={isOdd}
            />
          </div>
        );
      },
      [rowData, columns, onRowClick]
    );

    const headerRow = useMemo(
      () => (
        <div className="flex items-center bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          {columns.map(column => {
            const alignClass =
              column.align === 'right'
                ? 'justify-end'
                : column.align === 'center'
                  ? 'justify-center'
                  : 'justify-start';

            return (
              <div
                key={column.key}
                className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider flex-shrink-0 ${alignClass}`}
                style={{ width: column.width || 'auto' }}
              >
                {column.label}
              </div>
            );
          })}
        </div>
      ),
      [columns]
    );

    if (isLoading) {
      return (
        <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
          {headerRow}
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3 text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-sm">Loading data...</span>
            </div>
          </div>
        </div>
      );
    }

    if (!data.length) {
      return (
        <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
          {headerRow}
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-gray-500">Tidak ada data yang tersedia</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
        {headerRow}
        <div style={{ height }}>
          <FixedSizeList
            height={height}
            itemCount={data.length}
            itemSize={itemSize}
            width="100%"
            itemData={rowData}
            renderItem={renderRow}
          />
        </div>
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';
