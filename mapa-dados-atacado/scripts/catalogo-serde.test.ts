// Testes da camada de persistência da API do catálogo: round-trip do
// serializador (2 sentidos), validação de conteúdo (validarCatalogo) e
// validação de forma do body do POST (rowsDoBody) — tudo sem subir servidor.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  carregarNiveis,
  parseCatalogoRows,
  serializarCatalogo,
  validarCatalogo,
  type CatalogoRow,
} from './graph-lib.ts'
import { rowsDoBody } from './vite-plugin-catalogo.ts'

const row = (extra: Partial<CatalogoRow>): CatalogoRow => ({
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
  associacoes: [],
  ...extra,
})

describe('serializarCatalogo — round-trip', () => {
  it('serialize(parse(catalogo.csv atual)) reproduz o arquivo byte a byte', () => {
    const original = readFileSync(resolve(import.meta.dirname, '..', 'catalogo.csv'), 'utf8')
    expect(serializarCatalogo(parseCatalogoRows(original))).toBe(original)
  })

  it('parse(serialize(rows)) === rows, cobrindo aspas, listas, null e multilinha', () => {
    const rows: CatalogoRow[] = [
      row({
        nome: 'Custo de Capital (KE)',
        nivel: 'final',
        tipo_componente: 'Tabela Delta',
        consome: ['GDAD', 'Capital Regulatório'],
        associacoes: ['Tabela A - UCS', 'Tabela B - UCS'],
        descricao: 'ponto e vírgula; no meio',
        debito: 'avaliar',
        observacoes: 'Primeira linha com "aspas".\n\nSegunda linha; com ponto e vírgula.',
      }),
      row({ nome: 'Simples', owner: 'Fulano', centro_de_custo: 'CC-1' }),
    ]
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('as colunas legadas (origem/fonte_sistema/fontes_secundarias) sobrevivem ao round-trip', () => {
    // O build as ignora, mas são dado do usuário: a API não pode comê-las.
    const legado = row({
      nome: 'Com legado',
    })
    expect(parseCatalogoRows(serializarCatalogo([legado]))).toEqual([legado])
  })

  it('a MESMA linha vale em qualquer nível: nada é canonizado por nível', () => {
    // Antes, `associacoes` era zerada em fonte/fonte-secundaria (a lista morava
    // nas colunas de rota). Agora a linha é a mesma em todo nível.
    const rows = ['fonte', 'fonte-secundaria', 'origem', 'raiz'].map((nivel) =>
      row({ nome: `N-${nivel}`, nivel, associacoes: ['Alvo'] }),
    )
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('formato canônico: BOM, cabeçalho de 12 colunas, ";", CRLF e aspas mínimas', () => {
    const csv = serializarCatalogo([row({ nome: 'A', observacoes: 'sem aspas necessárias' })])
    expect(csv.startsWith('\uFEFF' + 'nome;nivel;tipo_componente;dominio;consome;')).toBe(true)
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(12)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).toContain('\r\nA;primario;;Risco;;d;nao;producao;;;sem aspas necessárias;\r\n')
  })

  it('CSV legado (sem tipo_componente) parseia: a coluna vem vazia', () => {
    const legado =
      '\uFEFFnome;nivel;dominio;origem;fonte_sistema;fontes_secundarias;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'Alfa;primario;Risco;o;s;;;d;nao;producao;;;;\r\n'
    expect(parseCatalogoRows(legado)[0].tipo_componente).toBe('')
  })
})

describe('validarCatalogo', () => {
  it('catálogo real passa sem erros nem warnings', () => {
    const raiz = resolve(import.meta.dirname, '..')
    const original = readFileSync(resolve(raiz, 'catalogo.csv'), 'utf8')
    const { niveis } = carregarNiveis(readFileSync(resolve(raiz, 'niveis.csv'), 'utf8'))
    expect(validarCatalogo(parseCatalogoRows(original), niveis)).toEqual({ errors: [], warnings: [] })
  })

  it('nome duplicado no MESMO nível (case-insensitive) é erro, apontando as duas linhas', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa' }), row({ nome: 'ALFA' })])
    expect(errors).toEqual([
      'linha 3 ("ALFA"): nome duplicado no nível "primario" — colide com "Alfa" (linha 2)',
    ])
  })

  it('o mesmo nome em níveis diferentes é permitido — são componentes diferentes', () => {
    expect(
      validarCatalogo([
        row({ nome: 'Resultado', nivel: 'final' }),
        row({ nome: 'Resultado', nivel: 'primario' }),
        row({ nome: 'Resultado', nivel: 'dominio', debito: '' }),
      ]),
    ).toEqual({ errors: [], warnings: [] })
  })

  it('nome vazio é erro; nenhum nome é reservado a nível nenhum', () => {
    const { errors } = validarCatalogo([
      row({ nome: '  ' }),
      row({ nome: 'Atacado — Dados', nivel: 'raiz', debito: '' }),
      row({ nome: 'Atacado — Dados', nivel: 'primario' }),
    ])
    expect(errors).toEqual(['linha 2: "nome" é obrigatório'])
  })

  it('nivel inexistente é erro e a mensagem lista os níveis da cadeia', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa', nivel: 'inexistente' })])
    expect(errors).toEqual([
      'linha 2 ("Alfa"): nivel "inexistente" inválido (use um destes: raiz, dominio, final, primario, fonte-secundaria, fonte, origem)',
    ])
  })

  it('nivel vazio é erro', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa', nivel: '' })])
    expect(errors[0]).toContain('linha 2 ("Alfa"): "nivel" é obrigatório')
  })

  it('debito e status são opcionais em QUALQUER nível; débito inválido é erro', () => {
    expect(validarCatalogo([row({ nome: 'Alfa', debito: '', status: '' })])).toEqual({
      errors: [],
      warnings: [],
    })
    const { errors } = validarCatalogo([
      row({ nome: 'Alfa', debito: 'talvez' as CatalogoRow['debito'] }),
    ])
    expect(errors).toEqual([
      'linha 2 ("Alfa"): debito "talvez" inválido (use sim, nao, avaliar ou deixe vazio)',
    ])
  })

  it('tipo_componente fora da lista é erro; os quatro valores e o vazio passam', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa', tipo_componente: 'Parquet' })])
    expect(errors).toEqual([
      'linha 2 ("Alfa"): tipo_componente "Parquet" inválido (use "Tabela SQL", "Tabela Delta", "Excel", "Default")',
    ])
    for (const tipo of ['Tabela SQL', 'Tabela Delta', 'Excel', 'Default', '']) {
      expect(validarCatalogo([row({ nome: 'Alfa', tipo_componente: tipo })]).errors).toEqual([])
    }
  })

  it('consome inexistente é WARNING (vira fantasma), não erro; resolve por nome ou id', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Alfa', consome: ['beta', 'final-rar-12m', 'Não Existe'] }),
      row({ nome: 'Beta' }),
      row({ nome: 'RAR 12M', nivel: 'final' }),
    ])
    expect(errors).toEqual([])
    expect(warnings).toEqual([
      '"Alfa": consome "Não Existe", que não existe no catálogo — o build criará um nó fantasma',
    ])
  })

  it('associação inexistente é warning próprio (o build a ignora, sem criar nó)', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Alfa', associacoes: ['Beta', 'Não Existe'] }),
      row({ nome: 'Beta', nivel: 'fonte', debito: '' }),
    ])
    expect(errors).toEqual([])
    expect(warnings).toEqual([
      '"Alfa": associação "Não Existe" não existe no catálogo — o build vai ignorá-la',
    ])
  })

  it('consome/associacoes valem em qualquer nível, cruzando a cadeia livremente', () => {
    expect(
      validarCatalogo([
        row({ nome: 'Fonte X', nivel: 'fonte', debito: '', consome: ['Origem Y'] }),
        row({ nome: 'Origem Y', nivel: 'origem', debito: '', associacoes: ['Raiz Z'] }),
        row({ nome: 'Raiz Z', nivel: 'raiz', debito: '' }),
      ]),
    ).toEqual({ errors: [], warnings: [] })
  })
})

describe('rowsDoBody (forma do body do POST)', () => {
  it('aceita {"rows": [...]} completo e preserva os campos', () => {
    const original = row({ nome: 'Alfa', tipo_componente: 'Excel', consome: ['Beta'] })
    const { rows, errors } = rowsDoBody({ rows: [original] })
    expect(errors).toEqual([])
    expect(rows).toEqual([original])
  })

  it('campos ausentes ganham defaults (string vazia, null, lista vazia)', () => {
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'primario', debito: 'nao' }] })
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({
      tipo_componente: '',
      dominio: '',
      owner: null,
      consome: [],
      observacoes: '',
    })
  })

  it('nivel chega como veio: não há apelido de nível nenhum', () => {
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'silver', debito: 'nao' }] })
    expect(errors).toEqual([])
    expect(rows[0].nivel).toBe('silver')
  })

  it('body sem "rows" ou com campo de tipo errado é rejeitado', () => {
    expect(rowsDoBody({}).errors).toEqual(['body deve ser um objeto {"rows": CatalogoRow[]}'])
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 42 }, { nome: 'Ok', consome: 'GDAD' }] })
    expect(errors).toEqual(['rows[0].nome: deve ser string', 'rows[1].consome: deve ser uma lista de strings'])
    expect(rows).toEqual([])
  })

  it('tipo_componente não-string é rejeitado na forma do body', () => {
    const { errors } = rowsDoBody({ rows: [{ nome: 'Alfa', tipo_componente: 7 }] })
    expect(errors).toEqual(['rows[0].tipo_componente: deve ser string'])
  })
})
