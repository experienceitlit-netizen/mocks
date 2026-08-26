// Excluir uma linha tira junto toda menção a ela — nada de nó fantasma nem de
// associação apontando para o vazio depois da exclusão.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import { removerComponente } from './catalog-delete'

const row = (extra: Partial<CatalogoRow> & { nome: string }): CatalogoRow => ({
  nivel: 'primario',
  dominio: '',
  origem: null,
  fonte_sistema: null,
  fontes_secundarias: [],
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
  it('tira a linha e as menções em consome, associações e fontes secundárias', () => {
    const rows = [
      row({ nome: 'GDAD', nivel: 'gold' }),
      row({ nome: 'RAR 12M', nivel: 'final', consome: ['GDAD', 'ESTATAG'] }),
      row({ nome: 'Painel', nivel: 'silver', associacoes: ['gdad'] }),
      row({ nome: 'Mercado Alvo', fontes_secundarias: ['GDAD', 'UCS'] }),
    ]
    const r = removerComponente(rows, { nome: 'GDAD', nivel: 'gold' })

    expect(r.encontrada).toBe(true)
    expect(r.rows.map((x) => x.nome)).toEqual(['RAR 12M', 'Painel', 'Mercado Alvo'])
    expect(r.rows[0].consome).toEqual(['ESTATAG'])
    expect(r.rows[1].associacoes).toEqual([]) // menção insensível a caixa
    expect(r.rows[2].fontes_secundarias).toEqual(['UCS'])
    expect(r.referencias).toEqual([
      { nome: 'RAR 12M', campo: 'Consome/Upstream' },
      { nome: 'Painel', campo: 'Associações' },
      { nome: 'Mercado Alvo', campo: 'Fontes secundárias' },
    ])
  })

  it('em "fonte"/"fonte-secundaria" limpa a associação guardada na coluna de rota', () => {
    const rows = [
      row({ nome: 'Receita Federal', nivel: 'origem' }),
      row({ nome: 'Databricks', nivel: 'fonte', origem: 'Receita Federal | RM' }),
      row({ nome: 'Tabela UCS', nivel: 'fonte-secundaria', fonte_sistema: 'Receita Federal' }),
    ]
    const r = removerComponente(rows, { nome: 'Receita Federal', nivel: 'origem' })

    expect(r.rows[0].origem).toBe('RM')
    expect(r.rows[1].fonte_sistema).toBeNull() // lista vazia = célula vazia
    expect(r.referencias).toHaveLength(2)
  })

  it('limpa a rota do dado que citava o excluído como origem ou fonte', () => {
    const rows = [
      row({ nome: 'Salesforce', nivel: 'fonte' }),
      row({ nome: 'Faturamento', origem: 'RM', fonte_sistema: 'Salesforce' }),
    ]
    const r = removerComponente(rows, { nome: 'Salesforce', nivel: 'fonte' })

    expect(r.rows[0]).toMatchObject({ nome: 'Faturamento', origem: 'RM', fonte_sistema: null })
    expect(r.referencias).toEqual([{ nome: 'Faturamento', campo: 'Fonte / sistema' }])
  })

  it('nome igual em nível diferente é outra linha: só a escolhida sai', () => {
    const rows = [
      row({ nome: 'Rating', nivel: 'ambos' }),
      row({ nome: 'Rating', nivel: 'gold' }),
    ]
    const r = removerComponente(rows, { nome: 'Rating', nivel: 'gold' })

    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].nivel).toBe('ambos')
  })

  it('linha inexistente: nada muda e encontrada = false', () => {
    const rows = [row({ nome: 'Alfa' })]
    const r = removerComponente(rows, { nome: 'Beta', nivel: 'primario' })

    expect(r.encontrada).toBe(false)
    expect(r.rows).toEqual(rows)
    expect(r.referencias).toEqual([])
  })
})
