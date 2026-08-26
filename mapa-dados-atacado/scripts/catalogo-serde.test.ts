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
  dominio: 'Risco',
  origem: 'o',
  fonte_sistema: 's',
  fontes_secundarias: [],
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
        origem: null,
        fonte_sistema: null,
        consome: ['GDAD', 'Capital Regulatório'],
        fontes_secundarias: ['Tabela A - UCS', 'Tabela B - UCS'],
        descricao: 'ponto e vírgula; no meio',
        debito: 'avaliar',
        observacoes: 'Primeira linha com "aspas".\n\nSegunda linha; com ponto e vírgula.',
      }),
      row({ nome: 'Simples', owner: 'Fulano', centro_de_custo: 'CC-1' }),
    ]
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('apelido "secundario" canoniza para "final" nos dois sentidos, sem warning', () => {
    const csv = serializarCatalogo([row({ nome: 'A', nivel: 'secundario' as CatalogoRow['nivel'] })])
    expect(csv).toContain('\r\nA;final;')
    const [lida] = parseCatalogoRows(csv.replace(';final;', ';secundario;'))
    expect(lida.nivel).toBe('final')
    expect(validarCatalogo([row({ nome: 'A', nivel: 'secundario' as CatalogoRow['nivel'] })])).toEqual({
      errors: [],
      warnings: [],
    })
  })

  it('componente com os defaults do form valida sem warning e mantém o débito gravado', () => {
    const comp = row({
      nome: 'Origem Teste',
      nivel: 'origem',
      dominio: '',
      origem: null,
      fonte_sistema: null,
      debito: 'avaliar',
      status: '',
    })
    expect(validarCatalogo([comp])).toEqual({ errors: [], warnings: [] })
    const csv = serializarCatalogo([comp])
    // O formulário é o mesmo em todos os níveis: o débito escolhido fica na
    // linha (round-trip fiel), mesmo num componente.
    expect(csv).toContain('\r\nOrigem Teste;origem;;;;;;d;avaliar;;;;;\r\n')
    expect(parseCatalogoRows(csv)[0]).toEqual(comp)
  })

  it('formato canônico: BOM, cabeçalho padrão, ";", CRLF e aspas mínimas', () => {
    const csv = serializarCatalogo([row({ nome: 'A', observacoes: 'sem aspas necessárias' })])
    expect(csv.startsWith('\uFEFF' + 'nome;nivel;dominio;origem;fonte_sistema;')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).toContain('\r\nA;primario;Risco;o;s;;;d;nao;producao;;;sem aspas necessárias;\r\n')
  })
})

describe('validarCatalogo', () => {
  it('catálogo real passa sem erros nem warnings', () => {
    const raiz = resolve(import.meta.dirname, '..')
    const original = readFileSync(resolve(raiz, 'catalogo.csv'), 'utf8')
    const { niveis } = carregarNiveis(readFileSync(resolve(raiz, 'niveis.csv'), 'utf8'))
    expect(validarCatalogo(parseCatalogoRows(original), niveis)).toEqual({ errors: [], warnings: [] })
  })

  it('nome duplicado (case-insensitive) é erro, apontando as duas linhas', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa' }), row({ nome: 'ALFA' })])
    expect(errors).toEqual(['linha 3 ("ALFA"): nome duplicado — colide com "Alfa" (linha 2)'])
  })

  it('nome vazio e nome reservado ao nó-raiz são erros', () => {
    const { errors } = validarCatalogo([row({ nome: '  ' }), row({ nome: 'Atacado — Dados' })])
    expect(errors).toEqual([
      'linha 2: "nome" é obrigatório',
      'linha 3 ("Atacado — Dados"): nome reservado ao nó-raiz "Atacado — Dados"',
    ])
  })

  it('nivel e debito fora dos valores válidos são erros', () => {
    const { errors } = validarCatalogo([row({ nome: 'Alfa', nivel: 'raiz' as CatalogoRow['nivel'], debito: 'talvez' as CatalogoRow['debito'] })])
    expect(errors).toEqual([
      'linha 2 ("Alfa"): nivel "raiz" inválido (use dominio, origem, fonte, fonte-secundaria, primario, final ou ambos)',
      'linha 2 ("Alfa"): debito "talvez" inválido (use sim, nao ou avaliar)',
    ])
  })

  it('componentes: debito ignorado; nome duplicado só colide DENTRO do mesmo nível', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Databricks', nivel: 'fonte', debito: '', origem: 'área de risco | cadastro corporativo' }),
      row({ nome: 'Databricks', nivel: 'fonte-secundaria', debito: '', fonte_sistema: 'Outra Fonte' }),
      row({ nome: 'Databricks', nivel: 'primario' }),
      row({ nome: 'Risco', nivel: 'dominio', debito: '' }),
    ])
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('dois componentes do mesmo nível com o mesmo slug são erro', () => {
    const { errors } = validarCatalogo([
      row({ nome: 'Área de Risco', nivel: 'origem', debito: '' }),
      row({ nome: 'area de risco', nivel: 'origem', debito: '' }),
    ])
    expect(errors).toEqual([
      'linha 3 ("area de risco"): nome duplicado — colide com "Área de Risco" (linha 2)',
    ])
  })

  it('consome de componente built-in é ignorado; o componente é alvo válido de consome', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Databricks', nivel: 'fonte', debito: '', consome: ['Não Existe'] }),
      row({ nome: 'Alfa', consome: ['Databricks'] }),
    ])
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('consome inexistente é WARNING (vira fantasma), não erro; resolve por nome ou id', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Alfa', consome: ['beta', 'rar-12m', 'Não Existe'] }),
      row({ nome: 'Beta' }),
      row({ nome: 'RAR 12M', nivel: 'final' }),
    ])
    expect(errors).toEqual([])
    expect(warnings).toEqual(['"Alfa": consome "Não Existe", que não existe no catálogo — o build criará um nó fantasma'])
  })
})

describe('rowsDoBody (forma do body do POST)', () => {
  it('aceita {"rows": [...]} completo e preserva os campos', () => {
    const original = row({ nome: 'Alfa', consome: ['Beta'] })
    const { rows, errors } = rowsDoBody({ rows: [original] })
    expect(errors).toEqual([])
    expect(rows).toEqual([original])
  })

  it('campos ausentes ganham defaults (string vazia, null, lista vazia)', () => {
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'primario', debito: 'nao' }] })
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ dominio: '', origem: null, owner: null, consome: [], fontes_secundarias: [], observacoes: '' })
  })

  it('nivel "secundario" no body é canonizado para "final"', () => {
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'secundario', debito: 'nao' }] })
    expect(errors).toEqual([])
    expect(rows[0].nivel).toBe('final')
  })

  it('body sem "rows" ou com campo de tipo errado é rejeitado', () => {
    expect(rowsDoBody({}).errors).toEqual(['body deve ser um objeto {"rows": CatalogoRow[]}'])
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 42 }, { nome: 'Ok', consome: 'GDAD' }] })
    expect(errors).toEqual(['rows[0].nome: deve ser string', 'rows[1].consome: deve ser uma lista de strings'])
    expect(rows).toEqual([])
  })
})
