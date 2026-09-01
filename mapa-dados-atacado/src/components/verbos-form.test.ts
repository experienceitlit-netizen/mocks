// Contrato da tela "⇢ Verbos" na parte que dá para testar sem React: o que a
// linha do modal guarda, o que vai no POST e o que a própria tela recusa antes
// de chamar a API.
import { describe, expect, it } from 'vitest'
import type { VerboApiRow } from './catalog-api'
import type { LinhaVerbo } from './verbos-form'
import {
  comoLinhaVerbo,
  errosDeEdicaoVerbos,
  errosDeNovoVerbo,
  payloadVerbos,
  podeRemoverVerbo,
} from './verbos-form'

const linha = (extra: Partial<LinhaVerbo> & { titulo: string }): LinhaVerbo => ({
  slug: '',
  sentido: 'montante',
  seta: true,
  builtin: false,
  ...extra,
})

describe('comoLinhaVerbo', () => {
  it('sentido e seta ausentes caem no padrão (montante, com seta)', () => {
    expect(comoLinhaVerbo({ titulo: 'Consome', slug: 'consome' })).toEqual({
      slug: 'consome',
      titulo: 'Consome',
      sentido: 'montante',
      seta: true,
      builtin: true,
    })
  })

  it('preserva os dois eixos como vieram da API', () => {
    const row: VerboApiRow = {
      titulo: 'Associado',
      slug: 'associado',
      sentido: 'ambos',
      seta: false,
      builtin: true,
    }
    expect(comoLinhaVerbo(row)).toMatchObject({ sentido: 'ambos', seta: false })
  })

  it('sem o campo `builtin` (o bloco do graph.json), a lista de embutidos decide', () => {
    // O graph.json traz os verbos sem declarar a origem no tipo; o slug basta.
    expect(comoLinhaVerbo({ titulo: 'Envia', slug: 'envia' }).builtin).toBe(true)
    expect(comoLinhaVerbo({ titulo: 'Transporta', slug: 'transporta' }).builtin).toBe(false)
  })

  it('verbo cadastrado que o backend marca como não-embutido continua não sendo', () => {
    expect(comoLinhaVerbo({ titulo: 'Envia', slug: 'envia', builtin: false }).builtin).toBe(false)
  })
})

describe('payloadVerbos', () => {
  it('manda a lista COMPLETA, com sentido e seta explícitos', () => {
    const rows = payloadVerbos([
      linha({ slug: 'consome', titulo: 'Consome', builtin: true }),
      linha({ slug: 'relaciona', titulo: 'Relaciona', sentido: 'nenhum', seta: false }),
    ])
    expect(rows).toEqual([
      { titulo: 'Consome', slug: 'consome', sentido: 'montante', seta: true },
      { titulo: 'Relaciona', slug: 'relaciona', sentido: 'nenhum', seta: false },
    ])
  })

  it('slug vazio não vira campo: é o que diz "verbo novo, derive do título"', () => {
    const [row] = payloadVerbos([linha({ titulo: 'Transporta' })])
    expect(row).not.toHaveProperty('slug')
    expect(row.titulo).toBe('Transporta')
  })

  it('o slug preservado é o que faz renomear não reescrever célula nenhuma', () => {
    const [row] = payloadVerbos([linha({ slug: 'envia', titulo: 'Manda', sentido: 'jusante' })])
    expect(row).toEqual({ titulo: 'Manda', slug: 'envia', sentido: 'jusante', seta: true })
  })

  it('o título vai sem espaço em volta', () => {
    expect(payloadVerbos([linha({ titulo: '  Envia  ' })])[0].titulo).toBe('Envia')
  })
})

describe('podeRemoverVerbo', () => {
  it('o `consome` não sai: é o significado de toda referência sem prefixo', () => {
    expect(podeRemoverVerbo({ slug: 'consome' })).toBe(false)
  })

  it('qualquer outro pode, embutido ou não', () => {
    expect(podeRemoverVerbo({ slug: 'envia' })).toBe(true)
    expect(podeRemoverVerbo({ slug: 'transporta' })).toBe(true)
  })
})

describe('errosDeNovoVerbo', () => {
  const atuais = [linha({ slug: 'consome', titulo: 'Consome' }), linha({ slug: 'envia', titulo: 'Envia' })]

  it('título vazio (ou só espaço) é recusado antes do POST', () => {
    expect(errosDeNovoVerbo('', atuais)).toEqual(['Título é obrigatório.'])
    expect(errosDeNovoVerbo('   ', atuais)).toEqual(['Título é obrigatório.'])
  })

  it('título repetido é recusado sem distinguir caixa nem acento', () => {
    expect(errosDeNovoVerbo('envia', atuais)).toHaveLength(1)
    expect(errosDeNovoVerbo('ENVIA', atuais)[0]).toContain('Já existe um verbo')
  })

  it('título novo passa', () => {
    expect(errosDeNovoVerbo('Transporta', atuais)).toEqual([])
  })
})

describe('errosDeEdicaoVerbos', () => {
  it('título apagado na linha é recusado', () => {
    const erros = errosDeEdicaoVerbos([linha({ slug: 'envia', titulo: '  ' })])
    expect(erros).toEqual(['Título de verbo não pode ficar vazio.'])
  })

  it('dois títulos iguais são recusados uma vez só', () => {
    const erros = errosDeEdicaoVerbos([
      linha({ slug: 'consome', titulo: 'Consome' }),
      linha({ slug: 'envia', titulo: 'consome' }),
    ])
    expect(erros).toEqual(['Título repetido: "consome".'])
  })

  it('lista consistente não gera erro local', () => {
    expect(
      errosDeEdicaoVerbos([
        linha({ slug: 'consome', titulo: 'Consome' }),
        linha({ slug: 'envia', titulo: 'Envia', sentido: 'jusante' }),
      ]),
    ).toEqual([])
  })
})
