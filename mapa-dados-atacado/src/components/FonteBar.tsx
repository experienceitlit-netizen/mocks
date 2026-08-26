// Controles da fonte de dados na barra superior: o chip que diz em que modo o
// app está e o(s) botão(ões) para mudar de modo.
//
//   dev server      → chip "✎ dev server", sem botão (o catálogo é o do projeto)
//   File System     → "📂 Abrir catálogo" / "📂 Reabrir <pasta>" / "📂 Trocar pasta"
//   sem File System → "📄 Importar CSV" e "⬇ Baixar CSV" (edição em memória)
//
// Sem nenhuma fonte aberta, o chip diz "🔒 somente leitura" — que é como o
// pacote HTML sempre se comportou até o usuário abrir uma pasta.
import { useRef } from 'react'
import type { FonteCatalogo } from './useFonteCatalogo'

interface FonteBarProps {
  fonte: FonteCatalogo
}

export default function FonteBar({ fonte }: FonteBarProps) {
  const { store, capacidade, pastaPendente, erro, ocupado } = fonte
  const inputRef = useRef<HTMLInputElement>(null)

  // Enquanto o feature-detect não terminou não há modo a anunciar.
  if (capacidade === null) return null

  const chip =
    store === null
      ? {
          // O estado inicial do pacote HTML confunde se não disser o caminho:
          // "somente leitura" sozinho parece definitivo, e não é.
          texto: '🔒 leitura — abra o catálogo para editar',
          titulo:
            'Os dados vieram embutidos no arquivo. Clique em "Abrir catálogo" e escolha a pasta com catalogo.csv e niveis.csv para editar.',
        }
      : store.modo === 'http'
        ? { texto: '✎ dev server', titulo: `Editando ${store.rotulo}` }
        : { texto: `✎ ${store.rotulo}`, titulo: `Editando ${store.rotulo}` }

  return (
    <div className="fonte">
      <span
        className={store === null ? 'fonte__chip fonte__chip--leitura' : 'fonte__chip'}
        title={chip.titulo}
      >
        {chip.texto}
      </span>

      {capacidade === 'arquivo' && (
        <button
          type="button"
          className="topbar__new"
          disabled={ocupado}
          onClick={pastaPendente !== null ? fonte.reabrirPasta : fonte.abrirPasta}
          title="Escolher a pasta com catalogo.csv e niveis.csv. O app grava direto nesses arquivos."
        >
          {store !== null
            ? '📂 Trocar pasta'
            : pastaPendente !== null
              ? `📂 Reabrir ${pastaPendente}`
              : '📂 Abrir catálogo'}
        </button>
      )}

      {capacidade === 'importar' && (
        <>
          <button
            type="button"
            className="topbar__new"
            disabled={ocupado}
            onClick={() => inputRef.current?.click()}
            title="Carregar catalogo.csv (e niveis.csv) para editar nesta aba."
          >
            📄 Importar CSV
          </button>
          {store !== null && (
            <button
              type="button"
              className="topbar__new"
              onClick={fonte.baixarCsvs}
              title="Baixar os CSVs com as edições desta aba."
            >
              ⬇ Baixar CSV
            </button>
          )}
          <input
            ref={inputRef}
            className="fonte__input"
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(e) => {
              fonte.importarArquivos(e.target.files)
              // Permite reimportar o MESMO arquivo depois de salvá-lo por fora.
              e.target.value = ''
            }}
          />
        </>
      )}

      {erro !== null && (
        <button type="button" className="fonte__erro" role="alert" onClick={fonte.descartarErro}>
          ✕ {erro}
        </button>
      )}
    </div>
  )
}
