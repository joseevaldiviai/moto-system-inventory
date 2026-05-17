export default function ProductGridTable({ columns, visibleColumnIds, rows, emptyText = 'Sin resultados.' }) {
  const visibleColumns = columns.filter((column) => visibleColumnIds.includes(column.id))

  return (
    <div className="table-wrap list-scroll">
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
            {visibleColumns.map((column) => (
              <th key={column.id} style={{ padding: '6px 4px' }}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(visibleColumns.length, 1)} style={{ padding: '10px 4px', color: 'var(--text-muted)' }}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.groupKey || row.id} style={{ borderTop: '1px solid var(--divider)' }}>
              {visibleColumns.map((column) => (
                <td key={column.id} style={{ padding: '6px 4px', verticalAlign: 'top' }}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

