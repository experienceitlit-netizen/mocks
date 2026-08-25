// Formulário de edição/cadastro de componentes do catálogo (só no dev server,
// com a API /api/catalogo ativa). Modal centrado sobre o mapa; ao salvar, o
// plugin regrava catalogo.csv e regenera graph.json — o graph.json novo chega
// por HMR (react-refresh preserva o estado; a página NÃO recarrega), então o
// submit re-lê o catálogo antes de montar o conjunto completo (as rows da prop
// podem ser as do mount) e o App re-busca as rows após o save (onSaved).
// O primeiro campo ("Tipo de componente") escolhe o nível da linha e adapta os
// demais campos: domínio/origem só têm identificação e governança; fonte ganha
// as origens associadas; fonte secundária, as fontes associadas; produtos
// (primário/final/ambos) mantêm o formulário completo.
// Esc cancela (tratado pelo handler global do App, que fecha o form antes dos
// demais estágios).
// TODO: exclusão de linhas fica para uma próxima fase (o contrato atual da API
// não tem delete).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { CatalogoRow, NivelRow, SaveOk } from './catalog-api'
import { fetchCatalogo, formatAssocList, isProdutoRow, parseAssocList, saveCatalogo } from './catalog-api'
import type { Debito } from './graph-types'

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

const TIPO_OPTIONS: ReadonlyArray<{ value: NivelRow; label: string }> = [
  { value: 'dominio', label: 'Domínio' },
  { value: 'origem', label: 'Origem' },
  { value: 'fonte', label: 'Fonte (sistema)' },
  { value: 'fonte-secundaria', label: 'Fonte secundária' },
  { value: 'primario', label: 'Produto primário' },
  { value: 'final', label: 'Produto final' },
  { value: 'ambos', label: 'Primário e final' },
]

const DEBITO_OPTIONS: ReadonlyArray<{ value: Debito; label: string }> = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'avaliar', label: 'A avaliar' },
]

const STATUS_OPTIONS = ['producao', 'transicao', 'investigacao'] as const

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
  /** Nomes de origens que existem no grafo (nós org-*, mesmo sem linha). */
  origensGrafo: string[]
  /** Nomes de fontes/sistemas que existem no grafo (nós sys-*). */
  fontesGrafo: string[]
  /** Save confirmado pela API: o App re-busca as rows do catálogo. */
  onSaved(): void
  onClose(): void
}

export default function CatalogForm({
  rows,
  target,
  origensGrafo,
  fontesGrafo,
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
  const [origem, setOrigem] = useState(initial && isProdutoRow(initial.nivel) ? (initial.origem ?? '') : '')
  const [fonteSistema, setFonteSistema] = useState(
    initial && isProdutoRow(initial.nivel) ? (initial.fonte_sistema ?? '') : '',
  )
  // Associações das linhas de componente: fonte → origens (campo `origem`),
  // fonte secundária → fontes (campo `fonte_sistema`), separadas por " | ".
  const [origensAssoc, setOrigensAssoc] = useState<string[]>(
    initial !== null && initial.nivel === 'fonte' ? parseAssocList(initial.origem) : [],
  )
  const [fontesAssoc, setFontesAssoc] = useState<string[]>(
    initial !== null && initial.nivel === 'fonte-secundaria'
      ? parseAssocList(initial.fonte_sistema)
      : [],
  )
  const [fsec, setFsec] = useState<string[]>(initial?.fontes_secundarias ?? [])
  const [consome, setConsome] = useState<string[]>(initial?.consome ?? [])
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
  // "||" (não "??"): linha de componente chega com debito/status "" — se o
  // usuário trocar o tipo para produto, os defaults valem.
  const [debito, setDebito] = useState<Debito>(initial?.debito || 'avaliar')
  const [status, setStatus] = useState(initial?.status || 'producao')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [centroDeCusto, setCentroDeCusto] = useState(initial?.centro_de_custo ?? '')

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
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
  // Origens conhecidas: nós org-* do grafo + linhas 'origem' do catálogo +
  // origens citadas em produtos e em fontes (campo assoc).
  const origensExistentes = useMemo(
    () =>
      uniaoNomes(
        origensGrafo,
        rows.filter((r) => r.nivel === 'origem').map((r) => r.nome),
        rows
          .filter((r) => isProdutoRow(r.nivel))
          .map((r) => r.origem)
          .filter((o): o is string => o !== null && o !== ''),
        rows.filter((r) => r.nivel === 'fonte').flatMap((r) => parseAssocList(r.origem)),
      ),
    [rows, origensGrafo],
  )
  // Fontes conhecidas: nós sys-* do grafo + linhas 'fonte' + fontes citadas
  // em produtos e em fontes secundárias (campo assoc).
  const fontesExistentes = useMemo(
    () =>
      uniaoNomes(
        fontesGrafo,
        rows.filter((r) => r.nivel === 'fonte').map((r) => r.nome),
        rows
          .filter((r) => isProdutoRow(r.nivel))
          .map((r) => r.fonte_sistema)
          .filter((s): s is string => s !== null && s !== ''),
        rows
          .filter((r) => r.nivel === 'fonte-secundaria')
          .flatMap((r) => parseAssocList(r.fonte_sistema)),
      ),
    [rows, fontesGrafo],
  )
  const fsecExistentes = useMemo(
    () =>
      uniaoNomes(
        rows.filter((r) => r.nivel === 'fonte-secundaria').map((r) => r.nome),
        rows.flatMap((r) => r.fontes_secundarias),
      ),
    [rows],
  )
  // Candidatos a "consome": os produtos do catálogo, menos o próprio nó.
  const nomesProdutos = useMemo(
    () => new Set(rows.filter((r) => isProdutoRow(r.nivel)).map((r) => norm(r.nome))),
    [rows],
  )
  const consomeSugestoes = useMemo(() => {
    const proprio = norm(target.modo === 'editar' ? target.nome : nome)
    return rows
      .filter((r) => isProdutoRow(r.nivel))
      .map((r) => r.nome)
      .filter((n) => norm(n) !== proprio)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rows, target, nome])

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

  const tipoLabel = TIPO_OPTIONS.find((o) => o.value === tipo)?.label ?? tipo

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving || saved) return
    const locais: string[] = []
    const nomeFinal = nome.trim()
    const dominioFinal = dominio === NOVO_DOMINIO ? novoDominio.trim() : dominio
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

    const row: CatalogoRow = {
      nome: nomeFinal,
      nivel: tipo,
      dominio: isProduto ? dominioFinal : '',
      origem: isProduto
        ? origem.trim() === ''
          ? null
          : origem.trim()
        : tipo === 'fonte'
          ? formatAssocList(origensAssoc)
          : null,
      fonte_sistema: isProduto
        ? fonteSistema.trim() === ''
          ? null
          : fonteSistema.trim()
        : tipo === 'fonte-secundaria'
          ? formatAssocList(fontesAssoc)
          : null,
      fontes_secundarias: isProduto ? fsec : [],
      consome: isProduto ? consome.filter((c) => norm(c) !== norm(nomeFinal)) : [],
      descricao: descricao.trim(),
      debito: isProduto ? debito : 'avaliar',
      status: isProduto ? status : '',
      owner: owner.trim() === '' ? null : owner.trim(),
      centro_de_custo: centroDeCusto.trim() === '' ? null : centroDeCusto.trim(),
      observacoes,
    }
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
                  {TIPO_OPTIONS.map((o) => (
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

              {isProduto && (
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
              )}

              {isProduto && (
                <div className="cform__row">
                  <div className="cform__field">
                    <label className="cform__label" htmlFor="cf-origem">
                      Origem
                    </label>
                    <input
                      id="cf-origem"
                      type="text"
                      list="cf-origens"
                      placeholder="vazio = não se aplica"
                      value={origem}
                      onChange={(e) => setOrigem(e.target.value)}
                    />
                    <datalist id="cf-origens">
                      {origensExistentes.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </div>
                  <div className="cform__field">
                    <label className="cform__label" htmlFor="cf-sistema">
                      Fonte / sistema
                    </label>
                    <input
                      id="cf-sistema"
                      type="text"
                      list="cf-sistemas"
                      placeholder="vazio = não se aplica"
                      value={fonteSistema}
                      onChange={(e) => setFonteSistema(e.target.value)}
                    />
                    <datalist id="cf-sistemas">
                      {fontesExistentes.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}

              {tipo === 'fonte' && (
                <ChipsField
                  label="Origens associadas"
                  placeholder="buscar origem existente ou digitar nova…"
                  values={origensAssoc}
                  suggestions={origensExistentes}
                  knownNames={null}
                  ghostNote=""
                  onChange={setOrigensAssoc}
                />
              )}

              {tipo === 'fonte-secundaria' && (
                <ChipsField
                  label="Fontes associadas"
                  placeholder="buscar fonte existente ou digitar nova…"
                  values={fontesAssoc}
                  suggestions={fontesExistentes}
                  knownNames={null}
                  ghostNote=""
                  onChange={setFontesAssoc}
                />
              )}

              {isProduto && (
                <ChipsField
                  label="Fontes secundárias"
                  placeholder="buscar tabela existente ou digitar nova…"
                  values={fsec}
                  suggestions={fsecExistentes}
                  knownNames={null}
                  ghostNote=""
                  onChange={setFsec}
                />
              )}

              {isProduto && (
                <ChipsField
                  label="Consome"
                  placeholder="buscar dado do catálogo…"
                  values={consome}
                  suggestions={consomeSugestoes}
                  knownNames={nomesProdutos}
                  ghostNote="Nome fora do catálogo: vira nó fantasma no mapa até ganhar linha própria."
                  onChange={setConsome}
                />
              )}

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

              {isProduto && (
                <div className="cform__row">
                  <div className="cform__field">
                    <label className="cform__label" htmlFor="cf-debito">
                      Débito técnico
                    </label>
                    <select
                      id="cf-debito"
                      value={debito}
                      onChange={(e) => setDebito(e.target.value as Debito)}
                    >
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
                    <select id="cf-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

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

              {errors.length > 0 && (
                <ul className="catalog-form__errors" role="alert">
                  {errors.map((er) => (
                    <li key={er}>✕ {er}</li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="catalog-form__footer">
              <button type="button" className="catalog-form__cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="catalog-form__save" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </footer>
          </>
        )}
      </form>
    </div>
  )
}
