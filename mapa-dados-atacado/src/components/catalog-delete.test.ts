// Excluir uma linha tira junto toda menção a ela — nada de nó fantasma nem de
// associação apontando para o vazio depois da exclusão.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import { removerComponente } from './catalog-delete'

const row = (extra: Partial<CatalogoRow> & { nome: string }): CatalogoRow => ({
  id: '',
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
  it('tira a linha e as menções (por id) em consome e associações', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'rar-12m', nome: 'RAR 12M', nivel: 'final', consome: ['gdad', 'estatag'] }),
      row({ id: 'painel', nome: 'Painel', nivel: 'silver', associacoes: ['gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })

    expect(r.encontrada).toBe(true)
    expect(r.rows.map((x) => x.nome)).toEqual(['RAR 12M', 'Painel'])
    expect(r.rows[0].consome).toEqual(['estatag'])
    expect(r.rows[1].associacoes).toEqual([])
    expect(r.referencias).toEqual([
      { nome: 'RAR 12M', campo: 'Consome/Upstream' },
      { nome: 'Painel', campo: 'Associações' },
    ])
  })

  it('menção ainda por NOME (catálogo antigo) também sai, sem distinguir caixa', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'painel', nome: 'Painel', consome: ['gdad'], associacoes: ['gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })
    expect(r.rows[0].consome).toEqual([])
    expect(r.rows[0].associacoes).toEqual([])
  })

  it('a limpeza por nome não leva junto o ID de outro componente homônimo', () => {
    // "GDAD" do silver sai; quem aponta para o id `gdad` (o do gold, outro
    // componente com o mesmo nome) continua apontando.
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'gdad-2', nome: 'GDAD', nivel: 'silver' }),
      row({ id: 'painel', nome: 'Painel', consome: ['gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad-2', nome: 'GDAD' })

    expect(r.rows.map((x) => x.id)).toEqual(['gdad', 'painel'])
    expect(r.rows[1].consome).toEqual(['gdad'])
    expect(r.referencias).toEqual([])
  })

  it('mesmo nome em outro nível é outra linha: só a do id escolhido sai', () => {
    const rows = [
      row({ id: 'rating', nome: 'Rating', nivel: 'final' }),
      row({ id: 'rating-2', nome: 'Rating', nivel: 'gold' }),
    ]
    const r = removerComponente(rows, { id: 'rating-2', nome: 'Rating' })

    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].nivel).toBe('final')
  })

  it('linha inexistente: nada muda e encontrada = false', () => {
    const rows = [row({ id: 'alfa', nome: 'Alfa' })]
    const r = removerComponente(rows, { id: 'beta', nome: 'Beta' })

    expect(r.encontrada).toBe(false)
    expect(r.rows).toEqual(rows)
    expect(r.referencias).toEqual([])
  })
})
