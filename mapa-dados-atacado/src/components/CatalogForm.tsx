// Formulário de edição/cadastro de componentes do catálogo (só no dev server,
// com a API /api/catalogo ativa). Modal centrado sobre o mapa; ao salvar, o
// plugin regrava catalogo.csv e regenera graph.json — o graph.json novo chega
// por HMR (react-refresh preserva o estado; a página NÃO recarrega), então o
// submit re-lê o catálogo antes de montar o conjunto completo (as rows da prop
// podem ser as do mount) e o App re-busca as rows após o save (onSaved).
//
// Os dois primeiros campos identificam o componente: "Nível/Camada" (a que
// camada ele pertence — qualquer nível do bloco `niveis`, sem exceção) e
// "Tipo de componente" (o que ele é fisicamente, o que define a forma no
// mapa). Todos os demais campos são iguais em todos os níveis, então trocar de
// nível nunca esconde nem descarta nada.
// Esc cancela (tratado pelo handler global do App, que fecha o form antes dos
// demais estágios).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { CatalogoRow, SaveOk } from './catalog-api'
import { fetchCatalogo, saveCatalogo } from './catalog-api'
import type { Referencia } from './catalog-delete'
import { removerComponente } from './catalog-delete'
import type { RowFormState } from './catalog-form-row'
import { montarRow } from './catalog-form-row'
import type { Debito, NivelDef, TipoComponente } from './graph-types'
import { TIPO_COMPONENTE_PADRAO, TIPOS_COMPONENTE } from './graph-types'

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

/** Opções do select "Nível/Camada": TODOS os níveis do bloco `niveis`, na
 *  ordem das colunas. Nenhum nível é especial — o rótulo é sempre o título
 *  cadastrado, então renomear um nível aparece aqui na hora. */
function nivelOptionsDe(niveis: readonly NivelDef[]): Array<{ value: string; label: string }> {
  return [...niveis]
    .sort((a, b) => a.ordem - b.ordem)
    .map((nv) => ({ value: nv.slug, label: nv.titulo }))
}

const DEBITO_OPTIONS: ReadonlyArray<{ value: Debito; label: string }> = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'avaliar', label: 'A avaliar' },
]

const STATUS_OPTIONS = ['producao', 'transicao', 'investigacao'] as const

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
 *  (identificada por nome + nível) ou cadastro pré-preenchido de um componente
 *  que só existe como fantasma no grafo (citado, mas sem linha). */
export type FormTarget =
  | { modo: 'novo' }
  | { modo: 'editar'; nome: string; nivel: string }
  | { modo: 'cadastrar'; nome: string; nivel: string }

interface CatalogFormProps {
  /** Linhas atuais do catálogo (GET /api/catalogo no mount do App). */
  rows: CatalogoRow[]
  target: FormTarget
  /** Bloco `niveis` do graph.json: monta o select "Nível/Camada". */
  niveis: readonly NivelDef[]
  /** Nomes de todos os componentes que existem no grafo (alvos possíveis de
   *  "Consome/Upstream" e "Associações"). */
  nomesGrafo: string[]
  /** Save confirmado pela API: o App re-busca as rows do catálogo. */
  onSaved(): void
  onClose(): void
}

export default function CatalogForm({
  rows,
  target,
  niveis,
  nomesGrafo,
  onSaved,
  onClose,
}: CatalogFormProps) {
  const initial = useMemo(
    () =>
      target.modo === 'editar'
        ? (rows.find((r) => r.nome === target.nome && r.nivel === target.nivel) ?? null)
        : null,
    [rows, target],
  )

  const nivelOptions = useMemo(() => nivelOptionsDe(niveis), [niveis])
  const nivelPadrao = target.modo === 'cadastrar' ? target.nivel : (nivelOptions[0]?.value ?? '')

  const [nome, setNome] = useState(initial?.nome ?? (target.modo === 'cadastrar' ? target.nome : ''))
  const [nivel, setNivel] = useState<string>(initial?.nivel ?? nivelPadrao)
  const [tipoComponente, setTipoComponente] = useState<TipoComponente>(
    initial?.tipo_componente ?? TIPO_COMPONENTE_PADRAO,
  )
  const [dominio, setDominio] = useState(initial?.dominio ?? '')
  const [novoDominio, setNovoDominio] = useState('')
  const [consome, setConsome] = useState<string[]>(initial?.consome ?? [])
  const [associacoes, setAssociacoes] = useState<string[]>(initial?.associacoes ?? [])
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
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
  // Alvos possíveis de qualquer relação: as linhas do catálogo mais o que já
  // existe no grafo, menos o próprio componente.
  const componentesExistentes = useMemo(
    () => uniaoNomes(nomesGrafo, rows.map((r) => r.nome)),
    [rows, nomesGrafo],
  )
  const componentesConhecidos = useMemo(
    () => new Set(componentesExistentes.map(norm)),
    [componentesExistentes],
  )
  const sugestoes = useMemo(() => {
    const proprio = norm(target.modo === 'editar' ? target.nome : nome)
    return componentesExistentes.filter((n) => norm(n) !== proprio)
  }, [componentesExistentes, target, nome])

  // Status fora do trio padrão (linha antiga): mantém como opção para não
  // perder.
  const statusOptions = useMemo<string[]>(() => {
    const extra =
      initial && initial.status !== '' && !STATUS_OPTIONS.some((s) => s === initial.status)
        ? [initial.status]
        : []
    return [...STATUS_OPTIONS, ...extra]
  }, [initial])

  const nivelLabel = nivelOptions.find((o) => o.value === nivel)?.label ?? nivel

  // Validação viva de nome: obrigatório e único DENTRO do nível escolhido (o
  // mesmo nome em outro nível é outro componente). Na edição, a própria linha
  // é permitida.
  const nomeDuplicado = useMemo(() => {
    const key = norm(nome)
    if (!key) return false
    return rows.some((r) => {
      if (r.nivel !== nivel) return false
      if (target.modo === 'editar' && r.nome === target.nome && r.nivel === target.nivel) {
        return false
      }
      return norm(r.nome) === key
    })
  }, [nome, nivel, rows, target])

  const dominioFinal = dominio === NOVO_DOMINIO ? novoDominio.trim() : dominio

  const estado = useMemo<RowFormState>(
    () => ({
      nome,
      nivel,
      tipoComponente,
      dominio: dominioFinal,
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
      nome, nivel, tipoComponente, dominioFinal, consome, associacoes,
      descricao, observacoes, debito, status, owner, centroDeCusto,
    ],
  )

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving || saved) return
    const locais: string[] = []
    const nomeFinal = nome.trim()
    // Cadastro independente: só nome e nível são obrigatórios (domínio vazio
    // vira "A definir" no build).
    if (!nomeFinal) locais.push('Nome é obrigatório.')
    if (!nivel) locais.push('Nível/Camada é obrigatório.')
    if (nomeDuplicado) {
      locais.push(`Já existe "${nomeFinal}" no nível ${nivelLabel}.`)
    }
    if (locais.length > 0) {
      setErrors(locais)
      return
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
          ? atuais.findIndex((r) => r.nome === target.nome && r.nivel === target.nivel)
          : -1
      const row: CatalogoRow = montarRow(estado, idx >= 0 ? atuais[idx] : null)
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
              <div className="cform__row">
                <div className="cform__field">
                  <label className="cform__label" htmlFor="cf-nivel">
                    Nível/Camada
                  </label>
                  <select id="cf-nivel" value={nivel} onChange={(e) => setNivel(e.target.value)}>
                    {nivelOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cform__field">
                  <label className="cform__label" htmlFor="cf-tipo-componente">
                    Tipo de componente
                  </label>
                  <select
                    id="cf-tipo-componente"
                    value={tipoComponente}
                    onChange={(e) => setTipoComponente(e.target.value as TipoComponente)}
                  >
                    {TIPOS_COMPONENTE.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
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
                    Já existe um componente com este nome no nível {nivelLabel}.
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
                placeholder="buscar componente do catálogo…"
                values={consome}
                suggestions={sugestoes}
                knownNames={componentesConhecidos}
                ghostNote="Nome fora do catálogo: vira nó fantasma no mapa até ganhar linha própria."
                onChange={setConsome}
              />

              <ChipsField
                label="Associações"
                placeholder="buscar componente do catálogo…"
                values={associacoes}
                suggestions={sugestoes}
                knownNames={componentesConhecidos}
                ghostNote="Nome fora do catálogo: vira nó fantasma no mapa até ganhar linha própria."
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
                    value={debito || 'avaliar'}
                    onChange={(e) => setDebito(e.target.value as Debito | '')}
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
                  <select
                    id="cf-status"
                    value={status || 'producao'}
                    onChange={(e) => setStatus(e.target.value)}
                  >
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
