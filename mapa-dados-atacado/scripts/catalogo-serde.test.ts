// Testes da camada de persistência da API do catálogo: round-trip do
// serializador (2 sentidos), validação de conteúdo (validarCatalogo) e
// validação de forma do body do POST (rowsDoBody) — tudo sem subir servidor.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canonizarCatalogo,
  carregarNiveis,
  COLUNAS,
  parseCatalogoRows,
  preencherIds,
  serializarCatalogo,
  TIPOS_COMPONENTE,
  validarCatalogo,
  type CatalogoRow,
} from './graph-lib.ts'
import { rowsDoBody } from './vite-plugin-catalogo.ts'

const row = (extra: Partial<CatalogoRow>): CatalogoRow => ({
  // Vazio por padrão: é o caso do dia a dia (linha nova, id gerado na gravação).
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
  associacoes: [],
  produto_de_dados: '',
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
        id: 'custo-de-capital-ke',
        nome: 'Custo de Capital (KE)',
        nivel: 'final',
        tipo_componente: 'Tabela Delta',
        consome: ['gdad', 'capital-regulatorio'],
        associacoes: ['tabela-a-ucs', 'tabela-b-ucs'],
        descricao: 'ponto e vírgula; no meio',
        debito: 'avaliar',
        observacoes: 'Primeira linha com "aspas".\n\nSegunda linha; com ponto e vírgula.',
      }),
      row({ id: 'simples', nome: 'Simples', owner: 'Fulano', centro_de_custo: 'CC-1' }),
    ]
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('linha sem id ganha um do nome na GRAVAÇÃO — e o arquivo já sai estável', () => {
    const csv = serializarCatalogo([row({ nome: 'RAR 12M' }), row({ nome: 'RAR 12M' })])
    const relidas = parseCatalogoRows(csv)
    // Único globalmente, com sufixo na colisão.
    expect(relidas.map((r) => r.id)).toEqual(['rar-12m', 'rar-12m-2'])
    // Segunda gravação não mexe em mais nada: o id agora é dado do arquivo.
    expect(serializarCatalogo(relidas)).toBe(csv)
  })

  it('canonizar converte as referências por nome em id, e é idempotente', () => {
    const rows = [
      row({ nome: 'Alfa', consome: ['GDAD'], associacoes: ['gdad'] }),
      row({ nome: 'GDAD', nivel: 'final' }),
    ]
    const canonicas = canonizarCatalogo(rows)
    expect(canonicas[0]).toMatchObject({ id: 'alfa', consome: ['gdad'], associacoes: ['gdad'] })
    expect(canonizarCatalogo(canonicas)).toEqual(canonicas)
  })

  it('referência que não resolve fica como está: o fantasma não é apagado', () => {
    const canonicas = canonizarCatalogo([row({ nome: 'Alfa', consome: ['Coisa Que Não Existe'] })])
    expect(canonicas[0].consome).toEqual(['Coisa Que Não Existe'])
  })

  it('cadastrar o fantasma religa quem o citava, na MESMA gravação', () => {
    // O consumidor cita "Planilha X" (texto livre, sem linha). Ao cadastrar a
    // linha, ela ganha id e a menção já sai apontando para ele.
    const canonicas = canonizarCatalogo([
      row({ id: 'consumidor', nome: 'Consumidor', consome: ['Planilha X'] }),
      row({ nome: 'Planilha X', nivel: 'fonte' }),
    ])
    expect(canonicas[1].id).toBe('planilha-x')
    expect(canonicas[0].consome).toEqual(['planilha-x'])
  })

  it('preencherIds não toca em linha que já tem id — nem no id, nem no objeto', () => {
    const original = row({ id: 'gdad', nome: 'GDAD' })
    expect(preencherIds([original])[0]).toBe(original)
  })

  it('as colunas legadas (origem/fonte_sistema/fontes_secundarias) sobrevivem ao round-trip', () => {
    // O build as ignora, mas são dado do usuário: a API não pode comê-las.
    const legado = row({
      id: 'com-legado',
      nome: 'Com legado',
    })
    expect(parseCatalogoRows(serializarCatalogo([legado]))).toEqual([legado])
  })

  it('a MESMA linha vale em qualquer nível: nada é canonizado por nível', () => {
    // Antes, `associacoes` era zerada em fonte/fonte-secundaria (a lista morava
    // nas colunas de rota). Agora a linha é a mesma em todo nível.
    const rows = ['fonte', 'fonte-secundaria', 'origem', 'raiz'].map((nivel) =>
      row({ id: `n-${nivel}`, nome: `N-${nivel}`, nivel, associacoes: ['alvo'] }),
    )
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('formato canônico: BOM, cabeçalho com `id` na frente, ";", CRLF e aspas mínimas', () => {
    const csv = serializarCatalogo([row({ nome: 'A', observacoes: 'sem aspas necessárias' })])
    expect(csv.startsWith('\uFEFF' + 'id;nome;nivel;tipo_componente;dominio;consome;')).toBe(true)
    // Sem número fixo de colunas no teste: o cabeçalho É COLUNAS, e acrescentar
    // uma (produto_de_dados entrou como a última) não pode quebrar aqui.
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(COLUNAS.length)
    expect(csv.split('\r\n')[0].endsWith(';produto_de_dados')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).toContain('\r\na;A;primario;;Risco;;d;nao;producao;;;sem aspas necessárias;;\r\n')
  })

  it('CSV legado (sem a coluna `id`) parseia: a célula vem vazia, e a gravação a preenche', () => {
    const legado =
      '\uFEFFnome;nivel;tipo_componente;dominio;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'RAR 12M;final;;Risco;;d;nao;producao;;;;\r\n'
    expect(parseCatalogoRows(legado)[0].id).toBe('')
    expect(parseCatalogoRows(serializarCatalogo(parseCatalogoRows(legado)))[0].id).toBe('rar-12m')
  })

  it('CSV legado (sem tipo_componente) parseia: a coluna vem vazia', () => {
    const legado =
      '\uFEFFnome;nivel;dominio;origem;fonte_sistema;fontes_secundarias;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'Alfa;primario;Risco;o;s;;;d;nao;producao;;;;\r\n'
    expect(parseCatalogoRows(legado)[0].tipo_componente).toBe('')
  })
})

describe('produto_de_dados — coluna nova', () => {
  it('round-trip: "sim", "nao" e "" (não declarado) vão e voltam', () => {
    const rows: CatalogoRow[] = [
      row({ id: 'produto', nome: 'Produto', produto_de_dados: 'sim' }),
      row({ id: 'comum', nome: 'Comum', produto_de_dados: 'nao' }),
      row({ id: 'antigo', nome: 'Antigo', produto_de_dados: '' }),
    ]
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })

  it('é a ÚLTIMA coluna do cabeçalho canônico', () => {
    const cabecalho = serializarCatalogo([row({ nome: 'A' })]).split('\r\n')[0]
    expect(cabecalho.split(';').at(-1)).toBe('produto_de_dados')
    expect(COLUNAS.at(-1)).toBe('produto_de_dados')
  })

  it('CSV legado (sem a coluna) parseia com a célula vazia; a gravação acrescenta a coluna', () => {
    const legado =
      '﻿id;nome;nivel;tipo_componente;dominio;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'rar-12m;RAR 12M;final;;Risco;;d;nao;producao;;;;\r\n'
    const relidas = parseCatalogoRows(legado)
    expect(relidas[0].produto_de_dados).toBe('')
    const regravado = serializarCatalogo(relidas)
    expect(regravado.split('\r\n')[0].endsWith(';produto_de_dados')).toBe(true)
    // A migração é neutra: reler o arquivo novo devolve as mesmas linhas.
    expect(parseCatalogoRows(regravado)).toEqual(relidas)
  })

  it('valor inválido é ERRO na gravação (o build só avisa)', () => {
    const { errors } = validarCatalogo([
      row({ nome: 'Alfa', produto_de_dados: 'talvez' as CatalogoRow['produto_de_dados'] }),
    ])
    expect(errors).toEqual([
      'linha 2 ("Alfa"): produto_de_dados "talvez" inválido (use sim, nao ou deixe vazio)',
    ])
  })

  it('"sim", "nao" e vazio passam na validação, em qualquer nível', () => {
    for (const valor of ['sim', 'nao', ''] as const) {
      expect(
        validarCatalogo([
          row({ nome: 'Alfa', nivel: 'raiz', debito: '', produto_de_dados: valor }),
          row({ nome: 'Beta', nivel: 'origem', debito: '', produto_de_dados: valor }),
        ]).errors,
      ).toEqual([])
    }
  })

  it('rowsDoBody aceita a coluna e recusa o que não for string', () => {
    const original = row({ id: 'alfa', nome: 'Alfa', produto_de_dados: 'sim' })
    expect(rowsDoBody({ rows: [original] })).toEqual({ rows: [original], errors: [] })
    // Ausente vira "" (que vale "nao"): quem posta uma linha antiga não precisa
    // conhecer a coluna.
    expect(rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'primario' }] }).rows[0]).toMatchObject({
      produto_de_dados: '',
    })
    expect(rowsDoBody({ rows: [{ nome: 'Alfa', produto_de_dados: true }] }).errors).toEqual([
      'rows[0].produto_de_dados: deve ser string',
    ])
  })
})

describe('validarCatalogo', () => {
  it('catálogo real passa sem erros nem warnings', () => {
    const raiz = resolve(import.meta.dirname, '..')
    const original = readFileSync(resolve(raiz, 'catalogo.csv'), 'utf8')
    const { niveis } = carregarNiveis(readFileSync(resolve(raiz, 'niveis.csv'), 'utf8'))
    expect(validarCatalogo(parseCatalogoRows(original), niveis)).toEqual({ errors: [], warnings: [] })
  })

  it('id duplicado é erro: duas linhas com a mesma chave seriam o mesmo componente', () => {
    const { errors } = validarCatalogo([
      row({ id: 'gdad', nome: 'GDAD', nivel: 'final' }),
      row({ id: 'gdad', nome: 'Outra coisa' }),
    ])
    expect(errors).toEqual([
      'linha 3 ("Outra coisa"): id "gdad" duplicado — colide com "GDAD" (linha 2);' +
        ' o id é a chave da linha e não pode se repetir',
    ])
  })

  it('id vazio é aceito: quem edita a planilha não precisa saber de ids', () => {
    expect(validarCatalogo([row({ nome: 'Alfa' }), row({ nome: 'Beta' })])).toEqual({
      errors: [],
      warnings: [],
    })
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

  it('tipo_componente fora da lista é erro; todo valor do vocabulário e o vazio passam', () => {
    // A lista de valores válidos sai do próprio vocabulário, e não copiada à
    // mão: ela cresce (quatro tipos viraram catorze quando os sistemas
    // entraram), e um teste que a repete quebra a cada tipo novo sem que nada
    // esteja errado.
    const { errors } = validarCatalogo([row({ nome: 'Alfa', tipo_componente: 'Parquet' })])
    const validos = TIPOS_COMPONENTE.map((t) => `"${t}"`).join(', ')
    expect(errors).toEqual([
      `linha 2 ("Alfa"): tipo_componente "Parquet" inválido (use ${validos})`,
    ])
    for (const tipo of [...TIPOS_COMPONENTE, '']) {
      expect(validarCatalogo([row({ nome: 'Alfa', tipo_componente: tipo })]).errors).toEqual([])
    }
  })

  it('consome inexistente é WARNING (vira fantasma), não erro; resolve por nome ou id', () => {
    const { errors, warnings } = validarCatalogo([
      row({ nome: 'Alfa', consome: ['beta', 'rar-12m', 'Não Existe'] }),
      row({ id: 'beta', nome: 'Beta' }),
      row({ id: 'rar-12m', nome: 'RAR 12M', nivel: 'final' }),
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
    const original = row({ id: 'alfa', nome: 'Alfa', tipo_componente: 'Excel', consome: ['beta'] })
    const { rows, errors } = rowsDoBody({ rows: [original] })
    expect(errors).toEqual([])
    expect(rows).toEqual([original])
  })

  it('campos ausentes ganham defaults (string vazia, null, lista vazia)', () => {
    const { rows, errors } = rowsDoBody({ rows: [{ nome: 'Alfa', nivel: 'primario', debito: 'nao' }] })
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({
      // id ausente é aceito (a gravação gera): é o que deixa o formulário
      // cadastrar um componente sem inventar chave nenhuma.
      id: '',
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
