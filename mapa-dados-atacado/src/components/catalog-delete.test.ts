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
  produto_de_dados: '',
  ...extra,
})

describe('removerComponente', () => {
  it('tira a linha e as menções (por id) em consome', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'rar-12m', nome: 'RAR 12M', nivel: 'final', consome: ['gdad', 'estatag'] }),
      row({ id: 'painel', nome: 'Painel', nivel: 'silver', consome: ['gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })

    expect(r.encontrada).toBe(true)
    expect(r.rows.map((x) => x.nome)).toEqual(['RAR 12M', 'Painel'])
    expect(r.rows[0].consome).toEqual(['estatag'])
    expect(r.rows[1].consome).toEqual([])
    expect(r.referencias).toEqual([
      { nome: 'RAR 12M', campo: 'Consome/Upstream' },
      { nome: 'Painel', campo: 'Consome/Upstream' },
    ])
  })

  it('menção ainda por NOME (catálogo antigo) também sai, sem distinguir caixa', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'painel', nome: 'Painel', consome: ['gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })
    expect(r.rows[0].consome).toEqual([])
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

// A menção é ao ALVO da referência: quem cita "envia:gdad" cita o `gdad` tanto
// quanto quem escreveu "gdad". Sem isto, excluir um componente deixaria
// "envia:<id-morto>" na linha de quem o citava — um fantasma no mapa que
// ninguém pediu.
describe('removerComponente — referência com verbo', () => {
  it('limpa a menção com verbo, pelo id e pelo nome', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'job', nome: 'Job', consome: ['envia:gdad', 'estatag'] }),
      row({ id: 'painel', nome: 'Painel', consome: ['acessa:GDAD'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })

    expect(r.rows[0].consome).toEqual(['estatag'])
    expect(r.rows[1].consome).toEqual([])
    expect(r.referencias).toEqual([
      { nome: 'Job', campo: 'Consome/Upstream' },
      { nome: 'Painel', campo: 'Consome/Upstream' },
    ])
  })

  it('a linha que cita o mesmo alvo com dois verbos conta UMA menção', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'job', nome: 'Job', consome: ['gdad', 'envia:gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' })

    expect(r.rows[0].consome).toEqual([])
    expect(r.referencias).toEqual([{ nome: 'Job', campo: 'Consome/Upstream' }])
  })

  it('a limpeza por nome não leva junto o verbo apontado para o ID de um homônimo', () => {
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'gdad-2', nome: 'GDAD', nivel: 'silver' }),
      row({ id: 'job', nome: 'Job', consome: ['envia:gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad-2', nome: 'GDAD' })

    expect(r.rows[1].consome).toEqual(['envia:gdad'])
    expect(r.referencias).toEqual([])
  })

  it('prefixo que não é verbo cadastrado é parte do nome, e não vira menção', () => {
    // Só o vocabulário passado decide o que é prefixo: com apenas o `consome`
    // cadastrado, "envia:gdad" é o nome inteiro de um fantasma.
    const rows = [
      row({ id: 'gdad', nome: 'GDAD', nivel: 'gold' }),
      row({ id: 'job', nome: 'Job', consome: ['envia:gdad'] }),
    ]
    const r = removerComponente(rows, { id: 'gdad', nome: 'GDAD' }, [
      { slug: 'consome', titulo: 'Consome', sentido: 'montante', seta: true },
    ])

    expect(r.rows[0].consome).toEqual(['envia:gdad'])
    expect(r.referencias).toEqual([])
  })
})
