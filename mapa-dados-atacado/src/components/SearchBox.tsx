interface SearchBoxProps {
  query: string
  /** Nº de nós que batem com a busca atual (mostrado como dica). */
  matchCount: number
  onQueryChange(query: string): void
  /** Enter: centraliza e seleciona o 1º resultado. */
  onSubmit(): void
}

export default function SearchBox({ query, matchCount, onQueryChange, onSubmit }: SearchBoxProps) {
  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <input
        type="search"
        placeholder="Buscar dado por nome ou descrição…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Buscar dado"
      />
      {query && (
        <span className="search-box__count">
          {matchCount} resultado{matchCount === 1 ? '' : 's'}
        </span>
      )}
    </form>
  )
}
