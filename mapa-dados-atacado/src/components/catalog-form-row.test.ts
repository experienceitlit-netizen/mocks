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
  produtoDeDados: false,
  ...extra,
})

/** Linha original com colunas que o formulário não edita. */
const base: CatalogoRow = {
  id: 'gdad',
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
  produto_de_dados: '',
}

describe('montarRow — produto de dados', () => {
  it('a caixa marcada grava "sim" e a desmarcada grava "nao" (nunca célula vazia)', () => {
    expect(montarRow(estado({ produtoDeDados: true })).produto_de_dados).toBe('sim')
    expect(montarRow(estado({ produtoDeDados: false })).produto_de_dados).toBe('nao')
  })

  it('vale igual em qualquer nível: a bandeira é ortogonal à camada', () => {
    for (const nivel of ['dominio', 'gold', 'fonte', 'origem']) {
      expect(montarRow(estado({ nivel, produtoDeDados: true })).produto_de_dados).toBe('sim')
    }
  })

  it('a coluna da linha original é substituída pelo que a caixa diz', () => {
    const original: CatalogoRow = { ...base, produto_de_dados: 'sim' }
    expect(montarRow(estado({ produtoDeDados: false }), original).produto_de_dados).toBe('nao')
  })
})

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

  it('o id vem da LINHA e sobrevive a renomear e a trocar de nível', () => {
    const renomeada = montarRow(estado({ nome: 'GDAD (novo)', nivel: 'origem' }), base)
    expect(renomeada.id).toBe('gdad')
  })

  it('componente novo sai sem id: quem gera é a gravação', () => {
    expect(montarRow(estado()).id).toBe('')
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

  it('auto-referência sai de consome e de associações — pelo id e pelo nome', () => {
    const row = montarRow(estado({ consome: ['gdad', 'PSDC'], associacoes: ['GDAD'] }), base)
    expect(row.consome).toEqual(['PSDC'])
    expect(row.associacoes).toEqual([])
  })

  it('id de OUTRO componente homônimo não conta como auto-referência', () => {
    // `gdad` é o id de outro componente com o mesmo nome; a linha em edição é
    // a `gdad-2`, e a ligação entre as duas é legítima.
    const outro: CatalogoRow = { ...base, id: 'gdad-2' }
    const row = montarRow(estado({ consome: ['gdad'] }), outro, new Set(['gdad']))
    expect(row.consome).toEqual(['gdad'])
  })
})
