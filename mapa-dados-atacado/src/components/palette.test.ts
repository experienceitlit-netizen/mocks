// Cor dos nós: níveis customizados são níveis de DADO, então a linha que
// declara débito entra na semântica dos produtos (e transferir um dado entre
// níveis não muda a cor dele); a linha que só se identifica fica na cor do
// nível.
import { describe, expect, it } from 'vitest'
import type { GraphNodeData } from './graph-types'
import {
  COLOR_AVALIAR,
  COLOR_CURADO,
  COLOR_DEBITO,
  COLOR_LEGADO,
  nivelCustomColor,
  nodeColor,
} from './palette'

const custom = (extra: Partial<GraphNodeData>): GraphNodeData => ({
  id: 'niv-gold-x',
  nome: 'X',
  tipo: 'nivel-custom',
  nivelCustom: 'gold',
  derivado: true,
  ...extra,
})

describe('nodeColor em nós de nível customizado', () => {
  it('componente simples (sem débito declarado) fica na cor do nível', () => {
    expect(nodeColor(custom({}))).toBe(nivelCustomColor('gold'))
    expect(nodeColor(custom({ nivelCustom: 'broze' }))).toBe(nivelCustomColor('broze'))
  })

  it('com débito declarado vale a semântica dos dados: sim > avaliar > legado > curado', () => {
    expect(nodeColor(custom({ debito: 'sim' }))).toBe(COLOR_DEBITO)
    expect(nodeColor(custom({ debito: 'avaliar' }))).toBe(COLOR_AVALIAR)
    expect(nodeColor(custom({ debito: 'nao', sistema: 'banco SQL legado (on-premise)' }))).toBe(
      COLOR_LEGADO,
    )
    expect(nodeColor(custom({ debito: 'nao', sistema: 'Databricks (dado curado)' }))).toBe(
      COLOR_CURADO,
    )
  })

  it('transferir o dado de nível não muda a cor: mesma linha, produto ou Gold', () => {
    const campos = { debito: 'nao', sistema: 'Databricks (dado curado)' } as const
    const produto: GraphNodeData = { id: 'gdad', nome: 'GDAD', nivel: 'primario', ...campos }
    expect(nodeColor(custom({ nome: 'GDAD', ...campos }))).toBe(nodeColor(produto))
  })
})
