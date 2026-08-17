export default function ColumnPickerModal({ open, title, columns, selectedIds, onToggle, onClose, onSelectAll, hint }) {
  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 18,
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, color: 'var(--text-strong)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>{hint || 'Marca qué columnas mostrar en la vista detallada.'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 12 }}>
            Cerrar
          </button>
        </div>

        <div className="button-row" style={{ marginBottom: 12 }}>
          <button type="button" onClick={onSelectAll} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 12 }}>
            Mostrar todas
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {columns.map((column) => (
            <label key={column.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-strong)' }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(column.id)}
                onChange={() => onToggle(column.id)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
