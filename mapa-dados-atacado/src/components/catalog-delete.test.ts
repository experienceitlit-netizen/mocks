// Excluir uma linha tira junto toda menção a ela — nada de nó fantasma nem de
// associação apontando para o vazio depois da exclusão.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import { removerComponente } from './catalog-delete'

const row = (extra: Partial<CatalogoRow> & { nome: string }): CatalogoRow => ({
  nivel: 'primario',
  tipo_componente: 'Default',
  dominio: '',
  consome: [],
  descricao: '',
  debito: '',
  status: '',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
  associacoes: [],
  ...extra,
})

describe('removerComponente', () => {
  it('tira a linha e as menções em consome e associações', () => {
    const rows = [
      row({ nome: 'GDAD', nivel: 'gold' }),
      row({ nome: 'RAR 12M', nivel: 'final', consome: ['GDAD', 'ESTATAG'] }),
      row({ nome: 'Painel', nivel: 'silver', associacoes: ['gdad'] }),
    ]
    const r = removerComponente(rows, { nome: 'GDAD', nivel: 'gold' })

    expect(r.encontrada).toBe(true)
    expect(r.rows.map((x) => x.nome)).toEqual(['RAR 12M', 'Painel'])
    expect(r.rows[0].consome).toEqual(['ESTATAG'])
    expect(r.rows[1].associacoes).toEqual([]) // menção insensível a caixa
    expect(r.referencias).toEqual([
      { nome: 'RAR 12M', campo: 'Consome/Upstream' },
      { nome: 'Painel', campo: 'Associações' },
    ])
  })

  it('nome igual em nível diferente é outra linha: só a escolhida sai', () => {
    const rows = [row({ nome: 'Rating', nivel: 'final' }), row({ nome: 'Rating', nivel: 'gold' })]
    const r = removerComponente(rows, { nome: 'Rating', nivel: 'gold' })

    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].nivel).toBe('final')
  })

  it('linha inexistente: nada muda e encontrada = false', () => {
    const rows = [row({ nome: 'Alfa' })]
    const r = removerComponente(rows, { nome: 'Beta', nivel: 'primario' })

    expect(r.encontrada).toBe(false)
    expect(r.rows).toEqual(rows)
    expect(r.referencias).toEqual([])
  })
})
