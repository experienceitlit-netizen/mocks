// Formulário de edição/cadastro de componentes do catálogo (só no dev server,
// com a API /api/catalogo ativa). Modal centrado sobre o mapa; ao salvar, o
// plugin regrava catalogo.csv e regenera graph.json — o graph.json novo chega
// por HMR (react-refresh preserva o estado; a página NÃO recarrega), então o
// submit re-lê o catálogo antes de montar o conjunto completo (as rows da prop
// podem ser as do mount) e o App re-busca as rows após o save (onSaved).
// O primeiro campo ("Tipo de componente") escolhe o nível da linha; os demais
// são os mesmos em todos os níveis (o formulário é padrão). Origem, fonte e
// fontes secundárias saíram: viraram níveis próprios, e a ligação entre
// componentes é feita por "Consome/Upstream" e "Associações" — em 'fonte' e
// 'fonte-secundaria' a lista de associações mora nas colunas de rota.
// Trocar o tipo nunca apaga campo: o estado carrega a linha inteira e é
// gravado como está (ver catalog-form-row.ts), com aviso do que não couber.
// Esc cancela (tratado pelo handler global do App, que fecha o form antes dos
// demais estágios).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { CatalogoRow, NivelRow, SaveOk } from './catalog-api'
import { fetchCatalogo, isProdutoRow, parseAssocList, saveCatalogo } from './catalog-api'
import type { Referencia } from './catalog-delete'
import { removerComponente } from './catalog-delete'
import type { RowFormState } from './catalog-form-row'
import { avisoTroca, montarRow } from './catalog-form-row'
import type { Debito, NivelDef } from './graph-types'

/** Comparação insensível a caixa e acentos (unicidade de nome, sugestões). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Sentinela do select de domínio: revela o input de domínio novo. */
const NOVO_DOMINIO = '__novo__'

/** Rótulos dos tipos built-in no select (mantidos mesmo com o bloco `niveis`
 *  dinâmico); a raiz não é opção e 'ambos' entra logo após 'primario'. */
const BUILTIN_TIPO_LABEL: Record<string, string> = {
  dominio: 'Domínio',
  origem: 'Origem',
  fonte: 'Fonte (sistema)',
  'fonte-secundaria': 'Fonte secundária',
  primario: 'Produto primário',
  final: 'Produto final',
}

/** Opções do select "Tipo de componente" montadas do bloco `niveis` do
 *  graph.json, na ordem das colunas: built-ins com os rótulos atuais, níveis
 *  customizados pelo título cadastrado. */
function tipoOptionsDe(niveis: readonly NivelDef[]): Array<{ value: NivelRow; label: string }> {
  const opts: Array<{ value: NivelRow; label: string }> = []
  for (const nv of [...niveis].sort((a, b) => a.ordem - b.ordem)) {
    if (nv.slug === 'raiz') continue
    if (nv.builtin) {
      const label = BUILTIN_TIPO_LABEL[nv.slug]
      if (label === undefined) continue
      opts.push({ value: nv.slug, label })
      if (nv.slug === 'primario') opts.push({ value: 'ambos', label: 'Primário e final' })
    } else {
      opts.push({ value: nv.slug, label: nv.titulo })
    }
  }
  return opts
}

const DEBITO_OPTIONS: ReadonlyArray<{ value: Debito; label: string }> = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'avaliar', label: 'A avaliar' },
]

const STATUS_OPTIONS = ['producao', 'transicao', 'investigacao'] as const

/** Nível customizado aceita a linha sem débito/status: é o componente simples
 *  (só identificação), que fica na cor do nível em vez da cor de débito. */
const VAZIO_LABEL = '— não declarado —'

/** Unicidade de nome: global entre produtos, por tipo entre componentes. */
function grupoDe(nivel: NivelRow): string {
  return isProdutoRow(nivel) ? 'produto' : nivel
}

/** União de listas de nomes, sem duplicatas (caixa/acentos à parte), ordenada. */
function uniaoNomes(...listas: string[][]): string[] {
  const vistos = new Map<string, string>()
  for (const lista of listas) {
    for (const nome of lista) {
      const key = norm(nome)
      if (key && !vistos.has(key)) vistos.set(key, nome)
    }
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

interface ChipsFieldProps {
  label: string
  placeholder: string
  values: string[]
  /** Nomes ofertados no dropdown de busca (já sem o próprio nó). */
  suggestions: string[]
  /** Nomes que existem no catálogo; um chip fora deste conjunto (normalizado)
   *  ganha o aviso visual de fantasma. null = sem essa checagem. */
  knownNames: ReadonlySet<string> | null
  ghostNote: string
  onChange(next: string[]): void
}

/** Multi-select por chips: busca dentre os nomes existentes e permite nome
 *  livre (Enter), com aviso visual quando o nome vira fantasma. */
function ChipsField({
  label,
  placeholder,
  values,
  suggestions,
  knownNames,
  ghostNote,
  onChange,
}: ChipsFieldProps) {
  const [text, setText] = useState('')

  const valueKeys = useMemo(() => new Set(values.map(norm)), [values])
  const filtered = useMemo(() => {
    const q = norm(text)
    if (!q) return []
    return suggestions.filter((s) => !valueKeys.has(norm(s)) && norm(s).includes(q)).slice(0, 8)
  }, [text, suggestions, valueKeys])

  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || valueKeys.has(norm(v))) {
      setText('')
      return
    }
    // Nome digitado que já existe no catálogo entra com a grafia oficial.
    const oficial = suggestions.find((s) => norm(s) === norm(v))
    onChange([...values, oficial ?? v])
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault() // não submete o form
      add(filtered[0] && norm(filtered[0]) === norm(text) ? filtered[0] : text)
    } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  const hasGhost =
    knownNames !== null && values.some((v) => !knownNames.has(norm(v)))

  return (
    <div className="cform__field">
      <span className="cform__label">{label}</span>
      <div className="chips-input">
        <div className="chips-input__box">
          {values.map((v) => {
            const ghost = knownNames !== null && !knownNames.has(norm(v))
            return (
              <span
                key={v}
                className={ghost ? 'chips-input__chip chips-input__chip--ghost' : 'chips-input__chip'}
                title={ghost ? 'Não existe no catálogo: vira nó fantasma' : undefined}
              >
                {ghost && '⚠ '}
                {v}
                <button
                  type="button"
                  aria-label={`Remover ${v}`}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                >
                  ×
                </button>
              </span>
            )
          })}
          <input
            type="text"
            value={text}
            placeholder={values.length === 0 ? placeholder : ''}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        {filtered.length > 0 && (
          <ul className="chips-input__menu">
            {filtered.map((s) => (
              <li key={s}>
                {/* onMouseDown: adiciona antes do blur do input fechar o menu */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(s)
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hasGhost && <p className="cform__ghost-note">⚠ {ghostNote}</p>}
    </div>
  )
}

/** O que o form abre: cadastro em branco, edição de uma linha existente
 *  (identificada por nome + grupo do nível) ou cadastro pré-preenchido de um
 *  componente que só existe derivado no grafo (sem linha no catálogo). */
export type FormTarget =
  | { modo: 'novo' }
  | { modo: 'editar'; nome: string; nivel: NivelRow }
  | { modo: 'cadastrar'; nome: string; nivel: NivelRow }

interface CatalogFormProps {
  /** Linhas atuais do catálogo (GET /api/catalogo no mount do App). */
  rows: CatalogoRow[]
  target: FormTarget
  /** Bloco `niveis` do graph.json (built-ins + customs): monta o select de
   *  tipo e identifica os slugs customizados. */
  niveis: readonly NivelDef[]
  /** Nomes de origens que existem no grafo (nós org-*, mesmo sem linha). */
  origensGrafo: string[]
  /** Nomes de fontes/sistemas que existem no grafo (nós sys-*). */
  fontesGrafo: string[]
  /** Nomes de TODOS os componentes não-produto do grafo (alvos possíveis das
   *  associações de um componente de nível customizado). */
  componentesGrafo: string[]
  /** Save confirmado pela API: o App re-busca as rows do catálogo. */
  onSaved(): void
  onClose(): void
}

export default function CatalogForm({
  rows,
  target,
  niveis,
  origensGrafo,
  fontesGrafo,
  componentesGrafo,
  onSaved,
  onClose,
}: CatalogFormProps) {
  const initial = useMemo(
    () =>
      target.modo === 'editar'
        ? (rows.find(
            (r) => r.nome === target.nome && grupoDe(r.nivel) === grupoDe(target.nivel),
          ) ?? null)
        : null,
    [rows, target],
  )

  const [nome, setNome] = useState(initial?.nome ?? (target.modo === 'cadastrar' ? target.nome : ''))
  const [tipo, setTipo] = useState<NivelRow>(
    initial?.nivel ?? (target.modo === 'cadastrar' ? target.nivel : 'primario'),
  )
  const [dominio, setDominio] = useState(initial?.dominio ?? '')
  const [novoDominio, setNovoDominio] = useState('')
  const isProduto = isProdutoRow(tipo)
  const tipoOptions = useMemo(() => tipoOptionsDe(niveis), [niveis])
  // Tipo de nível customizado: slug presente no bloco `niveis` sem builtin.
  const slugsCustom = useMemo(
    () => new Set(niveis.filter((nv) => !nv.builtin).map((nv) => nv.slug)),
    [niveis],
  )
  const isCustom = slugsCustom.has(tipo)
  // Campo único de associação, igual em todos os níveis. A linha guarda a lista
  // na coluna que o nível usa: 'fonte' em `origem`, 'fonte-secundaria' em
  // `fonte_sistema`, os demais em `associacoes`.
  const [associacoes, setAssociacoes] = useState<string[]>(() => {
    if (initial === null) return []
    if (initial.nivel === 'fonte') return parseAssocList(initial.origem)
    if (initial.nivel === 'fonte-secundaria') return parseAssocList(initial.fonte_sistema)
    return initial.associacoes
  })
  // Rota da linha: fora do formulário desde que origem e fonte viraram níveis
  // próprios, mas carregada e regravada — trocar de tipo não apaga a planilha.
  const [origem] = useState(initial?.nivel === 'fonte' ? '' : (initial?.origem ?? ''))
  const [fonteSistema] = useState(
    initial?.nivel === 'fonte-secundaria' ? '' : (initial?.fonte_sistema ?? ''),
  )
  const [fsec] = useState<string[]>(initial?.fontes_secundarias ?? [])
  const [consome, setConsome] = useState<string[]>(initial?.consome ?? [])
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
  // Linha de componente chega com debito/status "" e assim permanece: é um
  // valor legítimo fora dos produtos. Ao gravar produto, montarRow aplica os
  // defaults (avaliar/producao) — nenhum campo é forçado antes disso.
  const [debito, setDebito] = useState<Debito | ''>(initial ? initial.debito : 'avaliar')
  const [status, setStatus] = useState(initial ? initial.status : 'producao')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [centroDeCusto, setCentroDeCusto] = useState(initial?.centro_de_custo ?? '')

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  /** null = exclusão não pedida; lista = menções que sairão junto (confirmação). */
  const [confirmarExclusao, setConfirmarExclusao] = useState<Referencia[] | null>(null)
  const [saved, setSaved] = useState<SaveOk | null>(null)
  const closeTimer = useRef(0)
  // Sem o clear, o timer de um save anterior fecharia um form reaberto logo
  // em seguida (onClose fecha qualquer form aberto, não só este).
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // --- valores existentes para selects/datalists/sugestões ---
  const dominios = useMemo(
    () =>
      [...new Set(rows.map((r) => r.dominio).filter((d) => d !== ''))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [rows],
  )
  // Alvos possíveis das associações, em qualquer nível: as linhas do catálogo
  // (o build resolve produtos e componentes) mais os componentes que só existem
  // derivados no grafo — origens e fontes inclusive —, menos o próprio.
  const componentesExistentes = useMemo(
    () => uniaoNomes(componentesGrafo, origensGrafo, fontesGrafo, rows.map((r) => r.nome)),
    [rows, componentesGrafo, origensGrafo, fontesGrafo],
  )
  const componentesConhecidos = useMemo(
    () => new Set(componentesExistentes.map(norm)),
    [componentesExistentes],
  )
  const assocSugestoes = useMemo(() => {
    const proprio = norm(target.modo === 'editar' ? target.nome : nome)
    return componentesExistentes.filter((n) => norm(n) !== proprio)
  }, [componentesExistentes, target, nome])
  // Candidatos a "consome": qualquer linha do catálogo — desde que níveis
  // customizados são níveis de dado, um produto pode consumir uma linha Gold
  // ou um componente sem virar fantasma. As sugestões priorizam os dados.
  const nomesCatalogo = useMemo(() => new Set(rows.map((r) => norm(r.nome))), [rows])
  const consomeSugestoes = useMemo(() => {
    const proprio = norm(target.modo === 'editar' ? target.nome : nome)
    return rows
      .filter((r) => isProdutoRow(r.nivel) || slugsCustom.has(r.nivel))
      .map((r) => r.nome)
      .filter((n) => norm(n) !== proprio)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rows, slugsCustom, target, nome])

  // Status fora do trio padrão (linha antiga): mantém como opção para não
  // perder ("" de linha de componente não conta — não é um status).
  const statusOptions = useMemo<string[]>(() => {
    const extra =
      initial && initial.status !== '' && !STATUS_OPTIONS.some((s) => s === initial.status)
        ? [initial.status]
        : []
    return [...STATUS_OPTIONS, ...extra]
  }, [initial])

  // Validação viva de nome: obrigatório e único no grupo do tipo escolhido —
  // global entre produtos, por tipo entre componentes (uma fonte e uma origem
  // podem ter o mesmo nome). Na edição, a própria linha é permitida.
  const nomeDuplicado = useMemo(() => {
    const key = norm(nome)
    if (!key) return false
    return rows.some((r) => {
      if (grupoDe(r.nivel) !== grupoDe(tipo)) return false
      if (
        target.modo === 'editar' &&
        r.nome === target.nome &&
        grupoDe(r.nivel) === grupoDe(target.nivel)
      ) {
        return false
      }
      return norm(r.nome) === key
    })
  }, [nome, tipo, rows, target])

  const tipoLabel = tipoOptions.find((o) => o.value === tipo)?.label ?? tipo
  const dominioFinal = dominio === NOVO_DOMINIO ? novoDominio.trim() : dominio

  // Estado completo da linha: todo campo viaja, exibido ou não pelo tipo atual.
  const estado = useMemo<RowFormState>(
    () => ({
      nome,
      tipo,
      custom: isCustom,
      dominio: dominioFinal,
      origem,
      fonteSistema,
      fsec,
      consome,
      associacoes,
      descricao,
      observacoes,
      debito,
      status,
      owner,
      centroDeCusto,
    }),
    [
      nome, tipo, isCustom, dominioFinal, origem, fonteSistema, fsec,
      consome, associacoes, descricao, observacoes, debito, status, owner, centroDeCusto,
    ],
  )

  // O que a troca de tipo faz com os campos já preenchidos (nada some calado).
  const aviso = useMemo(() => avisoTroca(estado), [estado])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving || saved) return
    const locais: string[] = []
    const nomeFinal = nome.trim()
    // Cadastro independente: só nome e tipo são obrigatórios (domínio vazio
    // vira "A definir" no build).
    if (!nomeFinal) locais.push('Nome é obrigatório.')
    if (nomeDuplicado) {
      locais.push(
        isProduto
          ? `Já existe um produto chamado "${nomeFinal}" no catálogo.`
          : `Já existe ${tipoLabel} chamado "${nomeFinal}" no catálogo.`,
      )
    }
    if (locais.length > 0) {
      setErrors(locais)
      return
    }

    const row: CatalogoRow = montarRow(estado)
    setErrors([])
    setSaving(true)
    try {
      // Base FRESCA do catálogo: as rows da prop são as do mount do App e um
      // save anterior nesta mesma sessão não recarrega a página (HMR) — montar
      // o conjunto completo a partir delas apagaria o cadastro anterior.
      const atuais = (await fetchCatalogo()) ?? rows
      const idx =
        target.modo === 'editar'
          ? atuais.findIndex(
              (r) => r.nome === target.nome && grupoDe(r.nivel) === grupoDe(target.nivel),
            )
          : -1
      const next = idx >= 0 ? atuais.map((r, i) => (i === idx ? row : r)) : [...atuais, row]
      const res = await saveCatalogo(next)
      if (res.ok) {
        // CSV e graph.json regravados; o grafo novo chega por HMR e o App
        // re-busca as rows — a confirmação fica visível e o form fecha em 4s.
        onSaved()
        setSaved(res)
        closeTimer.current = window.setTimeout(onClose, 4000)
      } else {
        setErrors(res.errors)
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Falha de rede ao salvar.'])
    } finally {
      setSaving(false)
    }
  }

  // Exclusão em dois passos: o primeiro clique mostra o que sai junto (a linha
  // e cada menção a ela), o segundo grava. Só existe para linha já no catálogo.
  const excluir = async () => {
    if (saving || saved || target.modo !== 'editar') return
    setErrors([])
    setSaving(true)
    try {
      const atuais = (await fetchCatalogo()) ?? rows
      const alvo = { nome: target.nome, nivel: target.nivel }
      const r = removerComponente(atuais, alvo)
      if (!r.encontrada) {
        setErrors([`"${target.nome}" não está mais no catálogo.`])
        return
      }
      if (confirmarExclusao === null) {
        setConfirmarExclusao(r.referencias)
        return
      }
      const res = await saveCatalogo(r.rows)
      if (res.ok) {
        onSaved()
        setSaved(res)
        closeTimer.current = window.setTimeout(onClose, 2500)
      } else {
        setErrors(res.errors)
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Falha de rede ao excluir.'])
    } finally {
      setSaving(false)
    }
  }

  const titulo =
    target.modo === 'editar'
      ? 'Editar componente'
      : target.modo === 'cadastrar'
        ? 'Cadastrar componente'
        : 'Novo componente'
  const subtitulo = target.modo !== 'novo' ? target.nome : null

  return (
    <div className="catalog-overlay">
      <form
        className="catalog-form"
        role="dialog"
        aria-modal="true"
        aria-label={subtitulo !== null ? `${titulo}: ${subtitulo}` : titulo}
        onSubmit={submit}
      >
        <header className="catalog-form__header">
          <h2>{titulo}</h2>
          {subtitulo !== null && <span className="catalog-form__sub">{subtitulo}</span>}
          <button type="button" className="catalog-form__close" aria-label="Cancelar" onClick={onClose}>
            ×
          </button>
        </header>

        {saved ? (
          <div className="catalog-form__done">
            <p className="catalog-form__ok">✓ Salvo no catálogo. O mapa foi atualizado.</p>
            {saved.warnings.length > 0 && (
              <ul className="catalog-form__warnings">
                {saved.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="catalog-form__body">
              <div className="cform__field">
                <label className="cform__label" htmlFor="cf-tipo">
                  Tipo de componente
                </label>
                <select
                  id="cf-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as NivelRow)}
                >
                  {tipoOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cform__field">
                <label className="cform__label" htmlFor="cf-nome">
                  Nome *
                </label>
                <input
                  id="cf-nome"
                  type="text"
                  value={nome}
                  autoFocus
                  className={nomeDuplicado ? 'cform__invalid' : undefined}
                  onChange={(e) => setNome(e.target.value)}
                />
                {nomeDuplicado && (
                  <p className="cform__error-inline">
                    {isProduto
                      ? 'Já existe um produto com este nome.'
                      : `Já existe ${tipoLabel} com este nome.`}
                  </p>
                )}
              </div>

              <div className="cform__field">
                  <label className="cform__label" htmlFor="cf-dominio">
                    Domínio
                  </label>
                  <select
                    id="cf-dominio"
                    value={dominio}
                    onChange={(e) => setDominio(e.target.value)}
                  >
                    <option value="">— escolher —</option>
                    {dominios.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value={NOVO_DOMINIO}>+ Novo domínio…</option>
                  </select>
                  {dominio === NOVO_DOMINIO && (
                    <input
                      type="text"
                      placeholder="nome do novo domínio"
                      value={novoDominio}
                      onChange={(e) => setNovoDominio(e.target.value)}
                    />
                  )}
              </div>

              <ChipsField
                label="Consome/Upstream"
                placeholder="buscar dado do catálogo…"
                values={consome}
                suggestions={consomeSugestoes}
                knownNames={nomesCatalogo}
                ghostNote="Nome fora do catálogo: vira nó fantasma no mapa até ganhar linha própria."
                onChange={setConsome}
              />

              <ChipsField
                label="Associações"
                placeholder="buscar componente existente…"
                values={associacoes}
                suggestions={assocSugestoes}
                knownNames={componentesConhecidos}
                ghostNote="A associação precisa apontar para uma linha que exista no catálogo."
                onChange={setAssociacoes}
              />

              <div className="cform__field">
                <label className="cform__label" htmlFor="cf-descricao">
                  Descrição curta
                </label>
                <textarea
                  id="cf-descricao"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="cform__field">
                <label className="cform__label" htmlFor="cf-obs">
                  Observações (markdown)
                </label>
                <textarea
                  id="cf-obs"
                  rows={6}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>

              <div className="cform__row">
                  <div className="cform__field">
                    <label className="cform__label" htmlFor="cf-debito">
                      Débito técnico
                    </label>
                    <select
                      id="cf-debito"
                      value={isProduto ? debito || 'avaliar' : debito}
                      onChange={(e) => setDebito(e.target.value as Debito | '')}
                    >
                      {/* Fora dos produtos o débito pode não se aplicar. */}
                      {!isProduto && <option value="">{VAZIO_LABEL}</option>}
                      {DEBITO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cform__field">
                    <label className="cform__label" htmlFor="cf-status">
                      Status
                    </label>
                    <select
                      id="cf-status"
                      value={isProduto ? status || 'producao' : status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {!isProduto && <option value="">{VAZIO_LABEL}</option>}
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
              </div>

              <div className="cform__row">
                <div className="cform__field">
                  <label className="cform__label" htmlFor="cf-owner">
                    Owner
                  </label>
                  <input
                    id="cf-owner"
                    type="text"
                    placeholder="vazio = a definir"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  />
                </div>
                <div className="cform__field">
                  <label className="cform__label" htmlFor="cf-cc">
                    Centro de custo
                  </label>
                  <input
                    id="cf-cc"
                    type="text"
                    placeholder="vazio = a definir"
                    value={centroDeCusto}
                    onChange={(e) => setCentroDeCusto(e.target.value)}
                  />
                </div>
              </div>

              {(aviso.mantidos.length > 0 || aviso.perdidos.length > 0) && (
                <ul className="catalog-form__notes">
                  {aviso.mantidos.length > 0 && (
                    <li>
                      ⓘ {aviso.mantidos.join(', ')}: mantido{aviso.mantidos.length > 1 ? 's' : ''} na
                      planilha, mas <strong>{tipoLabel}</strong> não usa {aviso.mantidos.length > 1 ? 'esses campos' : 'esse campo'}.
                    </li>
                  )}
                  {aviso.perdidos.length > 0 && (
                    <li>
                      ⚠ {aviso.perdidos.join(', ')}: <strong>{tipoLabel}</strong> não guarda{' '}
                      {aviso.perdidos.length > 1 ? 'esses campos' : 'esse campo'} — o conteúdo atual
                      será descartado ao salvar.
                    </li>
                  )}
                </ul>
              )}

              {confirmarExclusao !== null && (
                <div className="catalog-form__danger" role="alert">
                  <strong>Excluir "{subtitulo}" do catálogo?</strong>
                  {confirmarExclusao.length === 0 ? (
                    <p>Nenhum outro componente cita este — nada mais será alterado.</p>
                  ) : (
                    <>
                      <p>
                        {confirmarExclusao.length === 1
                          ? 'Uma menção também será removida:'
                          : `${confirmarExclusao.length} menções também serão removidas:`}
                      </p>
                      <ul>
                        {confirmarExclusao.map((r) => (
                          <li key={`${r.nome}-${r.campo}`}>
                            {r.nome} — {r.campo}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p>Não dá para desfazer pelo app (o histórico do Git guarda a versão anterior).</p>
                </div>
              )}

              {errors.length > 0 && (
                <ul className="catalog-form__errors" role="alert">
                  {errors.map((er) => (
                    <li key={er}>✕ {er}</li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="catalog-form__footer">
              {target.modo === 'editar' && (
                <button
                  type="button"
                  className="catalog-form__delete"
                  disabled={saving}
                  onClick={() => void excluir()}
                >
                  {confirmarExclusao === null ? '🗑 Excluir' : 'Confirmar exclusão'}
                </button>
              )}
              <button
                type="button"
                className="catalog-form__cancel"
                onClick={confirmarExclusao === null ? onClose : () => setConfirmarExclusao(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="catalog-form__save"
                disabled={saving || confirmarExclusao !== null}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </footer>
          </>
        )}
      </form>
    </div>
  )
}
