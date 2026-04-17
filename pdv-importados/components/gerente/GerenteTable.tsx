import type { ReactNode } from 'react'

export type GerenteTableColumn = {
  key: string
  header: ReactNode
  width?: string | number
}

type GerenteTableProps = Readonly<{
  columns: GerenteTableColumn[]
  children: ReactNode
}>

/**
 * Tabela visual padronizada da área gerente (borda, cabeçalho).
 * Linhas vazias: renderize um &lt;tr&gt; com colSpan no próprio children.
 */
export function GerenteTable({ columns, children }: GerenteTableProps) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            {columns.map((column) => (
              <th key={column.key} style={{ padding: 10, width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
