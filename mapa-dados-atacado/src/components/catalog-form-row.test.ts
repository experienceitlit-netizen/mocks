// Contrato do formulário: os campos são os MESMOS em todos os níveis, então
// trocar o "Nível/Camada" só troca a coluna do componente — nada é descartado,
// nem os campos que o formulário não edita.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import type { RowFormState } from './catalog-form-row'
import { montarRow } from './catalog-form-row'

const estado = (extra: Partial<RowFormState> = {}): RowFormState => ({
  nome: 'GDAD',
  nivel: 'primario',
  tipoComponente: 'Tabela Delta',
  dominio: 'Resultado',
  consome: ['PSDC'],
  associacoes: ['Databricks'],
  descricao: 'resultado realizado',
  observacoes: 'corpo',
  debito: 'nao',
  status: 'producao',
  owner: 'Dados Atacado',
  centroDeCusto: 'CC-1',
  ...extra,
})

/** Linha original com colunas que o formulário não edita. */
const base: CatalogoRow = {
  nome: 'GDAD',
  nivel: 'primario',
  tipo_componente: 'Default',
  dominio: 'Resultado',
  consome: [],
  associacoes: [],
  descricao: '',
  debito: '',
  status: '',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
}

describe('montarRow', () => {
  it('grava nível e tipo de componente como campos independentes', () => {
    expect(montarRow(estado({ nivel: 'gold' }))).toMatchObject({
      nivel: 'gold',
      tipo_componente: 'Tabela Delta',
    })
    expect(montarRow(estado({ tipoComponente: 'Excel' })).tipo_componente).toBe('Excel')
  })

  it('trocar de nível preserva todo o resto da linha', () => {
    const antes = montarRow(estado())
    const depois = montarRow(estado({ nivel: 'origem' }))
    expect(depois).toEqual({ ...antes, nivel: 'origem' })
  })

  it('colunas que o formulário não edita viajam intactas da linha original', () => {
    expect(montarRow(estado({ nivel: 'gold' }), base)).toMatchObject({
      nivel: 'gold',
    })
  })

  it('débito e status vazios caem no default, em qualquer nível', () => {
    expect(montarRow(estado({ debito: '', status: '' }))).toMatchObject({
      debito: 'avaliar',
      status: 'producao',
    })
    expect(montarRow(estado({ nivel: 'fonte', debito: '', status: '' }))).toMatchObject({
      debito: 'avaliar',
      status: 'producao',
    })
  })

  it('auto-referência sai de consome e de associações', () => {
    const row = montarRow(estado({ consome: ['gdad', 'PSDC'], associacoes: ['GDAD'] }))
    expect(row.consome).toEqual(['PSDC'])
    expect(row.associacoes).toEqual([])
  })
})
