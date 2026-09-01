// Testes do vocabulário de verbos: verbos.csv (parse/serialize/validação), a
// regra de que arquivo presente É a lista completa, a leitura de uma célula do
// `consome` (verbo + alvo) e a formatação de volta.
//
// O que estes testes existem para travar, em uma frase cada:
// - trocar o TÍTULO de uma linha com slug não mexe em nenhuma célula do
//   catálogo (a mesma propriedade que faz "Jornada" ser o slug `dominio`);
// - `consome` não pode ser removido — é o significado da célula sem prefixo;
// - uma referência sem prefixo é gravada byte a byte como sempre foi.
import { describe, expect, it } from 'vitest'
import {
  alvoDaReferencia,
  carregarVerbos,
  COLUNAS_VERBOS,
  criarIndiceVerbos,
  defsDeVerbos,
  formatarReferencia,
  parseVerbosRows,
  resolverVerbos,
  SENTIDOS,
  serializarVerbos,
  slugDoVerbo,
  validarVerbos,
  validarVerbosContraCatalogo,
  VERBO_PADRAO,
  VERBOS_BUILTIN,
  VERBOS_PADRAO,
  type CatalogoRow,
  type VerboRow,
} from './graph-lib.ts'
import { verbosDoBody } from './vite-plugin-catalogo.ts'

/** O arquivo canônico do plano: os cinco embutidos, como a tela os grava. */
const CANONICO =
  '﻿titulo;slug;sentido;seta\r\n' +
  'Consome;consome;montante;sim\r\n' +
  'Acessa;acessa;montante;sim\r\n' +
  'Envia;envia;jusante;sim\r\n' +
  'Associado;associado;ambos;nao\r\n' +
  'Relaciona;relaciona;nenhum;nao\r\n'

/** Linha bruta completa, como o serializador a escreve. */
const verboRow = (titulo: string, slug: string, sentido: string, seta: string): VerboRow => ({
  titulo,
  slug,
  sentido,
  seta,
})

/** Linha do catálogo, para os testes de verbo em uso. */
const catalogoRow = (extra: Partial<CatalogoRow>): CatalogoRow => ({
  id: '',
  nome: 'X',
  nivel: 'primario',
  tipo_componente: '',
  dominio: 'Risco',
  consome: [],
  descricao: 'd',
  debito: 'nao',
  status: 'producao',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
  produto_de_dados: '',
  ...extra,
})

describe('verbos.csv — parse e serialize', () => {
  it('formato canônico: BOM, cabeçalho de 4 colunas, ";", CRLF e aspas mínimas', () => {
    const texto = serializarVerbos([
      verboRow('Envia', 'envia', 'jusante', 'sim'),
      verboRow('Manda; entrega', 'manda', 'jusante', 'nao'),
    ])
    expect(texto).toBe(
      '﻿titulo;slug;sentido;seta\r\nEnvia;envia;jusante;sim\r\n"Manda; entrega";manda;jusante;nao\r\n',
    )
    expect(COLUNAS_VERBOS.join(';')).toBe('titulo;slug;sentido;seta')
  })

  it('round-trip byte a byte no arquivo canônico dos cinco embutidos', () => {
    expect(serializarVerbos(parseVerbosRows(CANONICO))).toBe(CANONICO)
  })

  it('round-trip: parse(serialize(rows)) === rows', () => {
    const rows = [
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Associado', 'associado', 'ambos', 'nao'),
    ]
    expect(parseVerbosRows(serializarVerbos(rows))).toEqual(rows)
  })

  it('célula vazia não vira campo — é o que marca "verbo novo, derive o slug"', () => {
    const rows = parseVerbosRows('﻿titulo;slug;sentido;seta\r\nTransporta;;;\r\n')
    expect(rows).toEqual([{ titulo: 'Transporta' }])
    // e volta ao arquivo com as quatro colunas, sem inventar valor nenhum
    expect(serializarVerbos(rows)).toBe('﻿titulo;slug;sentido;seta\r\nTransporta;;;\r\n')
  })

  it('arquivo de 1 coluna parseia (as outras três são opcionais na leitura)', () => {
    const { verbos, warnings } = carregarVerbos('﻿titulo\r\nConsome\r\nTransporta\r\n')
    expect(warnings).toEqual([])
    expect(verbos.map((v) => v.slug)).toEqual(['consome', 'transporta'])
    // Sem sentido nem seta declarados, valem os padrões (o consumo de sempre).
    expect(verbos[1]).toMatchObject({ sentido: 'montante', seta: true, builtin: false })
  })

  it('valor cru segue para a validação: sentido/seta entram sem normalizar', () => {
    expect(parseVerbosRows('﻿titulo;sentido;seta\r\nX;pra cima;talvez\r\n')).toEqual([
      { titulo: 'X', sentido: 'pra cima', seta: 'talvez' },
    ])
  })
})

describe('o slug é a chave: renomear não reescreve o catálogo', () => {
  it('slug preenchido vence o título — trocar o título NÃO muda o slug', () => {
    const antes = verboRow('Envia', 'envia', 'jusante', 'sim')
    const depois = { ...antes, titulo: 'Manda para' }
    expect(slugDoVerbo(depois)).toBe('envia')
    expect(slugDoVerbo(depois)).toBe(slugDoVerbo(antes))
    // e o verbo resolvido continua sendo o mesmo, só com outro rótulo
    const vocabulario = resolverVerbos([verboRow('Consome', 'consome', 'montante', 'sim'), depois])
    expect(vocabulario[1]).toMatchObject({ slug: 'envia', titulo: 'Manda para' })
  })

  it('uma célula "envia:x" continua valendo depois da renomeação', () => {
    const vocabulario = resolverVerbos([
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Manda para', 'envia', 'jusante', 'sim'),
    ])
    expect(criarIndiceVerbos(vocabulario).referencia('envia:x')).toEqual({
      verbo: 'envia',
      alvo: 'x',
      prefixoDesconhecido: null,
    })
  })

  it('slug ausente é derivado do título (verbo novo)', () => {
    expect(slugDoVerbo({ titulo: 'Le direto' })).toBe('le-direto')
    expect(defsDeVerbos([{ titulo: 'Le direto' }])).toEqual([
      { slug: 'le-direto', titulo: 'Le direto', sentido: 'montante', seta: true },
    ])
  })
})

describe('carregarVerbos — ausente/vazio = os embutidos, presente = a lista completa', () => {
  it('arquivo ausente (texto vazio) cai nos embutidos, e eles contêm o padrão', () => {
    const { verbos, warnings } = carregarVerbos('')
    expect(warnings).toEqual([])
    expect(verbos).toEqual([...VERBOS_PADRAO])
    expect(verbos.map((v) => v.slug)).toContain(VERBO_PADRAO)
    expect(verbos.every((v) => v.builtin)).toBe(true)
  })

  it('arquivo só com cabeçalho é o mesmo caso do ausente', () => {
    expect(carregarVerbos('﻿titulo;slug;sentido;seta\r\n')).toEqual({
      verbos: [...VERBOS_PADRAO],
      warnings: [],
    })
  })

  it('o arquivo canônico devolve os cinco embutidos, marcados como builtin', () => {
    const { verbos, warnings } = carregarVerbos(CANONICO)
    expect(warnings).toEqual([])
    expect(verbos).toEqual(VERBOS_BUILTIN.map((v) => ({ ...v, builtin: true })))
  })

  it('arquivo presente é a lista COMPLETA: embutido fora dele está removido', () => {
    const { verbos } = carregarVerbos(
      serializarVerbos([
        verboRow('Consome', 'consome', 'montante', 'sim'),
        verboRow('Transporta', 'transporta', 'jusante', 'sim'),
      ]),
    )
    expect(verbos.map((v) => v.slug)).toEqual(['consome', 'transporta'])
    // `relaciona` era embutido e sumiu — o vocabulário é do usuário.
    expect(verbos.map((v) => v.slug)).not.toContain('relaciona')
    expect(verbos.map((v) => v.builtin)).toEqual([true, false])
  })

  it('a ordem é a do arquivo (verbo não tem ordem semântica, só a do select)', () => {
    const { verbos } = carregarVerbos(
      serializarVerbos([
        verboRow('Relaciona', 'relaciona', 'nenhum', 'nao'),
        verboRow('Consome', 'consome', 'montante', 'sim'),
      ]),
    )
    expect(verbos.map((v) => v.slug)).toEqual(['relaciona', 'consome'])
  })

  it('linha inválida vira warning e é descartada — o build não cai', () => {
    const { verbos, warnings } = carregarVerbos(
      '﻿titulo;slug;sentido;seta\r\nConsome;consome;montante;sim\r\n;sem-titulo;;\r\nX;x;pra cima;sim\r\n',
    )
    expect(verbos.map((v) => v.slug)).toEqual(['consome'])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('linha 3: "titulo" é obrigatório')
    expect(warnings[1]).toContain('sentido "pra cima" inválido')
    for (const w of warnings) expect(w).toContain('verbo ignorado')
  })

  it('se o `consome` sumir na leitura, ele volta embutido (com aviso)', () => {
    const { verbos, warnings } = carregarVerbos(
      serializarVerbos([verboRow('Envia', 'envia', 'jusante', 'sim')]),
    )
    expect(verbos.map((v) => v.slug)).toEqual(['consome', 'envia'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`o verbo "${VERBO_PADRAO}" não está na lista`)
  })

  it('coluna obrigatória ausente do cabeçalho vira warning', () => {
    const { warnings } = carregarVerbos('﻿slug;sentido\r\nconsome;montante\r\n')
    expect(warnings.some((w) => w.includes('coluna obrigatória "titulo" ausente'))).toBe(true)
  })

  it('arquivo com TODAS as linhas descartadas cai nos embutidos, não em nada', () => {
    // Cabeçalho sem `titulo`: nenhuma linha resolve. O vocabulário não pode
    // ficar vazio — é dele que sai o verbo de toda referência.
    const { verbos, warnings } = carregarVerbos('﻿slug;sentido\r\nconsome;montante\r\n')
    expect(verbos).toEqual([...VERBOS_PADRAO])
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('validarVerbos — o que impede a gravação', () => {
  const CINCO = parseVerbosRows(CANONICO)

  it('o arquivo canônico passa limpo', () => {
    expect(validarVerbos(CINCO)).toEqual({ errors: [], warnings: [] })
  })

  it('lista SEM `consome` é recusada — é o significado da célula sem prefixo', () => {
    const { errors } = validarVerbos([verboRow('Envia', 'envia', 'jusante', 'sim')])
    expect(errors).toEqual([
      `o verbo "${VERBO_PADRAO}" não pode ser removido — é o que vale para toda` +
        ' referência sem prefixo na coluna "consome"',
    ])
  })

  it('lista vazia passa: um arquivo sem linhas lê de volta como os embutidos', () => {
    expect(validarVerbos([]).errors).toEqual([])
    expect(resolverVerbos([])).toEqual([...VERBOS_PADRAO])
  })

  it('sentido fora do vocabulário é erro, citando o que foi escrito', () => {
    const { errors } = validarVerbos([
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Sobe', 'sobe', 'pra cima', 'sim'),
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('linha 3 ("Sobe"): sentido "pra cima" inválido')
    for (const s of SENTIDOS) expect(errors[0]).toContain(`"${s}"`)
  })

  it('seta fora de sim/nao é erro', () => {
    const { errors } = validarVerbos([
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Talvez', 'talvez', 'montante', 'quem sabe'),
    ])
    expect(errors).toEqual([
      'linha 3 ("Talvez"): seta "quem sabe" inválida (use sim, nao ou deixe vazio)',
    ])
  })

  it('slug fora do kebab-case é erro', () => {
    const { errors } = validarVerbos([
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Envia', 'Envia Já', 'jusante', 'sim'),
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('slug "Envia Já" inválido')
  })

  it('slug duplicado é erro — inclusive quando um vem do título e o outro da coluna', () => {
    const { errors } = validarVerbos([
      verboRow('Consome', 'consome', 'montante', 'sim'),
      verboRow('Envia', 'envia', 'jusante', 'sim'),
      { titulo: 'Envia' },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('linha 4 ("Envia"): verbo duplicado — colide com "Envia" (linha 3)')
  })

  it('título vazio é erro, e sentido/seta vazios não são', () => {
    expect(validarVerbos([{ titulo: '   ' }]).errors[0]).toBe('linha 2: "titulo" é obrigatório')
    expect(validarVerbos([{ titulo: 'Consome' }, { titulo: 'Transporta' }]).errors).toEqual([])
  })

  it('título só de pontuação não gera slug — é erro', () => {
    expect(validarVerbos([{ titulo: '---' }]).errors[0]).toContain('titulo inválido')
  })
})

describe('validarVerbosContraCatalogo — remover verbo em uso', () => {
  const catalogo = [
    catalogoRow({ id: 'job', nome: 'Job', consome: ['envia:bulk', 'bronze-x'] }),
    catalogoRow({ id: 'outro', nome: 'Outro', consome: ['envia:bulk'] }),
  ]

  it('remover um verbo citado pelo catálogo é erro, citando quem o usa', () => {
    const erros = validarVerbosContraCatalogo(
      [verboRow('Consome', 'consome', 'montante', 'sim')],
      catalogo,
    )
    expect(erros).toHaveLength(1)
    expect(erros[0]).toContain('verbo "envia" está em uso por 2 referência(s)')
    expect(erros[0]).toContain('"Job", "Outro"')
  })

  it('manter o verbo (mesmo renomeado) não gera erro nenhum', () => {
    expect(
      validarVerbosContraCatalogo(
        [
          verboRow('Consome', 'consome', 'montante', 'sim'),
          verboRow('Manda para', 'envia', 'jusante', 'sim'),
        ],
        catalogo,
      ),
    ).toEqual([])
  })

  it('prefixo que nunca foi verbo não conta como verbo em uso', () => {
    // "transp:" é referência quebrada, não verbo removido — o build já reclama
    // dela, e ela não pode travar a gravação do vocabulário.
    expect(
      validarVerbosContraCatalogo(
        [verboRow('Consome', 'consome', 'montante', 'sim')],
        [catalogoRow({ nome: 'Alfa', consome: ['transp:x'] })],
      ),
    ).toEqual([])
  })
})

describe('referencia — a leitura de UMA célula do consome', () => {
  const indice = criarIndiceVerbos()

  it('célula sem prefixo: verbo vazio (vale o padrão) e a célula inteira é o alvo', () => {
    expect(indice.referencia('x')).toEqual({ verbo: '', alvo: 'x', prefixoDesconhecido: null })
  })

  it('prefixo cadastrado vira verbo, com espaços à vontade', () => {
    expect(indice.referencia(' envia : x ')).toEqual({
      verbo: 'envia',
      alvo: 'x',
      prefixoDesconhecido: null,
    })
    expect(indice.referencia('envia:x')).toEqual(indice.referencia(' envia : x '))
  })

  it('prefixo NÃO cadastrado não vira consome calado: a célula inteira é o alvo', () => {
    expect(indice.referencia('transp:x')).toEqual({
      verbo: '',
      alvo: 'transp:x',
      prefixoDesconhecido: 'transp',
    })
  })

  it('"RAR: 12 meses" resolve INTEIRO — dois-pontos não é sempre prefixo', () => {
    expect(indice.referencia('RAR: 12 meses')).toEqual({
      verbo: '',
      alvo: 'RAR: 12 meses',
      prefixoDesconhecido: null,
    })
  })

  it('só a forma kebab minúscula tem cara de prefixo', () => {
    for (const celula of ['Envia:x', 'ENVIA:x', '-envia:x', 'envia x:y', ':x']) {
      const ref = indice.referencia(celula)
      expect(ref.verbo).toBe('')
      expect(ref.prefixoDesconhecido).toBeNull()
      expect(ref.alvo).toBe(celula)
    }
  })

  it('o vocabulário é dado: um verbo cadastrado passa a ser lido como prefixo', () => {
    const antes = criarIndiceVerbos()
    expect(antes.referencia('transporta:x').prefixoDesconhecido).toBe('transporta')
    const depois = criarIndiceVerbos(
      resolverVerbos([
        verboRow('Consome', 'consome', 'montante', 'sim'),
        verboRow('Transporta', 'transporta', 'jusante', 'sim'),
      ]),
    )
    expect(depois.referencia('transporta:x')).toEqual({
      verbo: 'transporta',
      alvo: 'x',
      prefixoDesconhecido: null,
    })
  })

  it('def() devolve título, sentido e seta do verbo; slug desconhecido é undefined', () => {
    expect(indice.def('associado')).toMatchObject({
      slug: 'associado',
      titulo: 'Associado',
      sentido: 'ambos',
      seta: false,
    })
    expect(indice.def('transp')).toBeUndefined()
    expect(indice.lista).toEqual(VERBOS_PADRAO)
  })

  it('os cinco embutidos: sentido e seta são eixos independentes', () => {
    const def = (slug: string) => indice.def(slug)
    expect(def('consome')).toMatchObject({ sentido: 'montante', seta: true })
    expect(def('acessa')).toMatchObject({ sentido: 'montante', seta: true })
    expect(def('envia')).toMatchObject({ sentido: 'jusante', seta: true })
    // Sem ponta, mas dentro da linhagem: "sem seta" não é "fora da travessia".
    expect(def('associado')).toMatchObject({ sentido: 'ambos', seta: false })
    expect(def('relaciona')).toMatchObject({ sentido: 'nenhum', seta: false })
  })
})

describe('formatarReferencia — a célula de volta', () => {
  it('verbo vazio e verbo padrão devolvem SÓ o alvo (o catálogo de hoje não muda)', () => {
    expect(formatarReferencia({ verbo: '', alvo: 'x' })).toBe('x')
    expect(formatarReferencia({ verbo: VERBO_PADRAO, alvo: 'x' })).toBe('x')
  })

  it('qualquer outro verbo vira prefixo, na forma canônica sem espaços', () => {
    expect(formatarReferencia({ verbo: 'envia', alvo: 'x' })).toBe('envia:x')
    expect(formatarReferencia({ verbo: ' envia ', alvo: ' x ' })).toBe('envia:x')
  })

  it('formatar(referencia(celula)) é a célula canônica — e é idempotente', () => {
    const indice = criarIndiceVerbos()
    for (const celula of ['x', 'envia:x', ' envia : x ', 'transp:x', 'RAR: 12 meses']) {
      const uma = formatarReferencia(indice.referencia(celula))
      expect(formatarReferencia(indice.referencia(uma))).toBe(uma)
    }
    expect(formatarReferencia(indice.referencia(' envia : x '))).toBe('envia:x')
    // Prefixo desconhecido sobrevive à ida e volta, sem virar consome.
    expect(formatarReferencia(indice.referencia('transp:x'))).toBe('transp:x')
  })
})

describe('alvoDaReferencia — heurística, só para chave de dedup', () => {
  it('tira o prefixo com cara de verbo, esteja ele cadastrado ou não', () => {
    expect(alvoDaReferencia('envia:x')).toBe('x')
    expect(alvoDaReferencia(' envia : x ')).toBe('x')
    expect(alvoDaReferencia('transp:x')).toBe('x')
  })

  it('célula sem prefixo (e nome com dois-pontos) sai inteira', () => {
    expect(alvoDaReferencia('x')).toBe('x')
    expect(alvoDaReferencia(' x ')).toBe('x')
    expect(alvoDaReferencia('RAR: 12 meses')).toBe('RAR: 12 meses')
  })
})

describe('verbosDoBody (forma do body do POST /api/verbos)', () => {
  it('aceita {"rows": [{titulo}]}, com seta boolean ou "sim"/"nao"', () => {
    const { rows, errors } = verbosDoBody({
      rows: [
        { titulo: 'Envia', slug: 'envia', sentido: 'jusante', seta: false },
        { titulo: ' Acessa ', slug: 'acessa', sentido: 'montante', seta: 'sim' },
      ],
    })
    expect(errors).toEqual([])
    expect(rows).toEqual([
      verboRow('Envia', 'envia', 'jusante', 'nao'),
      verboRow('Acessa', 'acessa', 'montante', 'sim'),
    ])
  })

  it('campo vazio não vira campo: slug e sentido ausentes valem os padrões', () => {
    const { rows, errors } = verbosDoBody({
      rows: [{ titulo: 'Transporta', slug: '', sentido: '' }, { titulo: 'Mapeia' }],
    })
    expect(errors).toEqual([])
    expect(rows).toEqual([{ titulo: 'Transporta' }, { titulo: 'Mapeia' }])
    // e o resolver preenche o slug a partir do título (o `consome` volta na
    // frente porque a lista não o trazia — nenhuma célula fica sem verbo)
    expect(resolverVerbos(rows).map((v) => v.slug)).toEqual(['consome', 'transporta', 'mapeia'])
  })

  it('trim em titulo, slug e sentido', () => {
    expect(
      verbosDoBody({ rows: [{ titulo: ' Envia ', slug: ' envia ', sentido: ' jusante ', seta: true }] }).rows,
    ).toEqual([verboRow('Envia', 'envia', 'jusante', 'sim')])
  })

  it('valor fora do vocabulário segue CRU, para a validação recusar citando-o', () => {
    const { rows, errors } = verbosDoBody({
      rows: [{ titulo: 'Consome', slug: 'consome' }, { titulo: 'Torto', sentido: 'lateral', seta: 'talvez' }],
    })
    expect(errors).toEqual([])
    expect(rows[1]).toEqual({ titulo: 'Torto', sentido: 'lateral', seta: 'talvez' })
    const msg = validarVerbos(rows).errors.join(' ')
    expect(msg).toContain('sentido "lateral" inválido')
    expect(msg).toContain('seta "talvez" inválida')
  })

  it('campo de tipo errado é rejeitado na forma do body', () => {
    expect(verbosDoBody({ rows: [{ titulo: 'Envia', slug: 123 }] })).toEqual({
      rows: [],
      errors: ['rows[0].slug: deve ser string'],
    })
    expect(verbosDoBody({ rows: [{ titulo: 'Envia', sentido: [] }] })).toEqual({
      rows: [],
      errors: ['rows[0].sentido: deve ser string'],
    })
    expect(verbosDoBody({ rows: [{ titulo: 'Envia', seta: 1 }] })).toEqual({
      rows: [],
      errors: ['rows[0].seta: deve ser boolean (ou "sim"/"nao")'],
    })
  })

  it('body sem "rows" ou com linha que não é objeto é rejeitado', () => {
    expect(verbosDoBody({}).errors).toEqual(['body deve ser um objeto {"rows": [{titulo}]}'])
    expect(verbosDoBody({ rows: 'nao' }).errors).toEqual(['body deve ser um objeto {"rows": [{titulo}]}'])
    const { rows, errors } = verbosDoBody({ rows: [['Envia'], { titulo: 42 }] })
    expect(errors).toEqual(['rows[0]: deve ser um objeto {titulo}', 'rows[1].titulo: deve ser string'])
    expect(rows).toEqual([])
  })

  it('a volta completa: body → validar → serializar devolve o arquivo canônico', () => {
    const { rows, errors } = verbosDoBody({
      rows: VERBOS_PADRAO.map((v) => ({ titulo: v.titulo, slug: v.slug, sentido: v.sentido, seta: v.seta })),
    })
    expect(errors).toEqual([])
    expect(validarVerbos(rows).errors).toEqual([])
    expect(serializarVerbos(rows)).toBe(CANONICO)
  })
})
