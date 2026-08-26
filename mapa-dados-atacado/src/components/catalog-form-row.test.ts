// Contrato do formulário: trocar o "Tipo de componente" NUNCA apaga campo da
// linha, e o que não couber no nível escolhido é avisado antes de salvar.
import { describe, expect, it } from 'vitest'
import type { CatalogoRow, NivelRow } from './catalog-api'
import type { RowFormState } from './catalog-form-row'
import { avisoTroca, montarRow, usaCamposDeDado } from './catalog-form-row'

/** Estado do form carregado com uma linha de produto completa (o caso do
 *  GDAD: domínio, rota, débito e status preenchidos). */
const estadoProduto = (extra: Partial<RowFormState> = {}): RowFormState => ({
  nome: 'GDAD',
  tipo: 'primario',
  custom: false,
  dominio: 'Resultado',
  origem: 'resultado gerencial',
  fonteSistema: 'Databricks (dado curado)',
  fsec: ['Tabela UCS'],
  consome: ['PSDC'],
  associacoes: [],
  descricao: 'resultado realizado',
  observacoes: 'corpo',
  debito: 'nao',
  status: 'producao',
  owner: 'Dados Atacado',
  centroDeCusto: 'CC-1',
  ...extra,
})

const paraNivel = (tipo: NivelRow, custom: boolean): CatalogoRow =>
  montarRow(estadoProduto({ tipo, custom }))

describe('montarRow — troca de tipo não apaga campo', () => {
  it('produto → nível customizado mantém domínio, rota, consome, débito e status', () => {
    const row = paraNivel('gold', true)
    expect(row).toMatchObject({
      nome: 'GDAD',
      nivel: 'gold',
      dominio: 'Resultado',
      origem: 'resultado gerencial',
      fonte_sistema: 'Databricks (dado curado)',
      fontes_secundarias: ['Tabela UCS'],
      consome: ['PSDC'],
      debito: 'nao',
      status: 'producao',
      owner: 'Dados Atacado',
      centro_de_custo: 'CC-1',
    })
  })

  it('produto → componente built-in guarda os campos de dado na linha', () => {
    // O serializador zera só `debito` nessas linhas; o resto continua lá.
    const row = paraNivel('dominio', false)
    expect(row).toMatchObject({
      nivel: 'dominio',
      dominio: 'Resultado',
      origem: 'resultado gerencial',
      fonte_sistema: 'Databricks (dado curado)',
      fontes_secundarias: ['Tabela UCS'],
      consome: ['PSDC'],
      status: 'producao',
    })
  })

  it('em linha "fonte"/"fonte-secundaria" as associações vão para as colunas de rota', () => {
    const fonte = montarRow(estadoProduto({ tipo: 'fonte', associacoes: ['RM', 'Cadastro'] }))
    expect(fonte.origem).toBe('RM | Cadastro')
    expect(fonte.associacoes).toEqual([])
    const fsec = montarRow(estadoProduto({ tipo: 'fonte-secundaria', associacoes: ['ADAT'] }))
    expect(fsec.fonte_sistema).toBe('ADAT')
    expect(fsec.associacoes).toEqual([])
  })

  it('produto exige débito e status; fora dos produtos o vazio é preservado', () => {
    expect(montarRow(estadoProduto({ debito: '', status: '' }))).toMatchObject({
      debito: 'avaliar',
      status: 'producao',
    })
    expect(
      montarRow(estadoProduto({ tipo: 'gold', custom: true, debito: '', status: '' })),
    ).toMatchObject({ debito: '', status: '' })
  })

  it('nível customizado e produtos usam os campos de dado; componente built-in não', () => {
    expect(usaCamposDeDado({ tipo: 'gold', custom: true })).toBe(true)
    expect(usaCamposDeDado({ tipo: 'ambos', custom: false })).toBe(true)
    expect(usaCamposDeDado({ tipo: 'fonte', custom: false })).toBe(false)
  })

  it('auto-referência sai de consome e de associações', () => {
    const row = montarRow(
      estadoProduto({ tipo: 'gold', custom: true, consome: ['gdad', 'PSDC'], associacoes: ['GDAD'] }),
    )
    expect(row.consome).toEqual(['PSDC'])
    expect(row.associacoes).toEqual([])
  })
})

describe('avisoTroca — o que o nível escolhido não usa', () => {
  it('nível customizado usa tudo: nenhum aviso', () => {
    expect(avisoTroca(estadoProduto({ tipo: 'gold', custom: true }))).toEqual({
      mantidos: [],
      perdidos: [],
    })
  })

  it('componente built-in: campos de dado mantidos, débito descartado', () => {
    expect(avisoTroca(estadoProduto({ tipo: 'origem' }))).toEqual({
      mantidos: ['Domínio', 'Consome/Upstream', 'Status', 'Fontes secundárias'],
      perdidos: ['Débito técnico'],
    })
  })

  it('linha "fonte" avisa que a origem preenchida dá lugar às origens associadas', () => {
    expect(avisoTroca(estadoProduto({ tipo: 'fonte' })).perdidos).toContain('Origem')
    expect(avisoTroca(estadoProduto({ tipo: 'fonte-secundaria' })).perdidos).toContain(
      'Fonte / sistema',
    )
  })

  it('associações valem em qualquer nível: nunca são descartadas', () => {
    expect(avisoTroca(estadoProduto({ associacoes: ['ADAT'] })).perdidos).toEqual([])
    expect(
      avisoTroca(estadoProduto({ tipo: 'gold', custom: true, associacoes: ['ADAT'] })).perdidos,
    ).toEqual([])
  })
})
