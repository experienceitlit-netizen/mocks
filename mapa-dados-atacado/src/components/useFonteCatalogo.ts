// Escolha do modo de persistência, no mount, e as ações que o usuário tem para
// mudá-lo. A ordem é sempre a mesma:
//
//   1. GET /api/catalogo respondeu? → modo HTTP (dev server), como sempre foi.
//   2. Senão, o navegador tem File System Access? → o app OFERECE abrir a pasta
//      do catálogo ("📂 Abrir catálogo"); enquanto o usuário não abre, o app
//      segue somente leitura.
//   3. Senão (Firefox/Safari) → oferece importar os CSVs e baixar o resultado.
//
// A pasta escolhida fica guardada no IndexedDB: na sessão seguinte, o app a
// reabre sozinho se a permissão sobreviveu, ou mostra "📂 Reabrir <pasta>" —
// re-pedir permissão exige um clique. Em file:// o IndexedDB não funciona e
// nada disso acontece: o usuário só escolhe a pasta de novo (ver fs-access.ts).
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCatalogo } from './catalog-api'
import type { Capacidade, CatalogStore } from './catalog-store'
import { decidirCapacidade, storeHttp } from './catalog-store'
import { criarStoreLocal, destinoMemoria } from './catalog-store-local'
import type { PastaHandle } from './fs-access'
import {
  ARQUIVO_CATALOGO,
  ARQUIVO_NIVEIS,
  destinoPasta,
  escolherPasta,
  esquecerPasta,
  guardarPasta,
  lerArquivosDaPasta,
  lerPastaGuardada,
  pedirPermissaoDeEscrita,
  permissaoDeEscrita,
  suportaFsAccess,
} from './fs-access'

export interface FonteCatalogo {
  /** null = somente leitura (detectando, ou nenhuma fonte editável aberta). */
  store: CatalogStore | null
  /** null enquanto o feature-detect não terminou. */
  capacidade: Capacidade | null
  /** Nome da pasta da sessão anterior à espera de um clique para re-autorizar. */
  pastaPendente: string | null
  erro: string | null
  ocupado: boolean
  /** Escolhe (ou troca) a pasta do catálogo. Exige gesto do usuário. */
  abrirPasta(): void
  /** Re-pede a permissão da pasta guardada. Exige gesto do usuário. */
  reabrirPasta(): void
  /** Carrega CSVs vindos de um <input type="file"> (fallback sem File System
   *  Access): a edição passa a valer em memória. */
  importarArquivos(arquivos: FileList | null): void
  /** Baixa os dois CSVs como estão agora (fallback sem File System Access). */
  baixarCsvs(): void
  descartarErro(): void
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/** A API do dev server só pode existir se a página veio por HTTP. Em file://
 *  o fetch nem sai: o navegador o bloqueia e escreve um erro de CORS no
 *  console — ruído sem informação nenhuma no pacote de arquivo único. */
function podeTerApiHttp(): boolean {
  const protocolo = window.location.protocol
  return protocolo === 'http:' || protocolo === 'https:'
}

/** Dispara o download de um texto como arquivo. */
function baixarTexto(nome: string, texto: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function useFonteCatalogo(): FonteCatalogo {
  const [store, setStore] = useState<CatalogStore | null>(null)
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null)
  const [pasta, setPasta] = useState<PastaHandle | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // O store atual serve de base para uma importação parcial (só o niveis.csv,
  // por exemplo), sem prender os callbacks a cada troca de store.
  const storeRef = useRef<CatalogStore | null>(null)
  useEffect(() => {
    storeRef.current = store
  }, [store])

  /** Abre a pasta como fonte de edição: lê os dois CSVs e monta o store. */
  const usarPasta = useCallback(async (escolhida: PastaHandle, lembrar: boolean) => {
    const arquivos = await lerArquivosDaPasta(escolhida)
    setStore(criarStoreLocal(destinoPasta(escolhida), arquivos))
    setPasta(null)
    setErro(null)
    // Guardar o handle é acessório e pode demorar (em file:// o IndexedDB só
    // responde no prazo): não segura a abertura do catálogo.
    if (lembrar) void guardarPasta(escolhida)
  }, [])

  useEffect(() => {
    let vivo = true
    void (async () => {
      // 1. A API do dev server tem prioridade: onde ela existe, nada muda.
      const rows = podeTerApiHttp() ? await fetchCatalogo() : null
      if (!vivo) return
      if (rows !== null) {
        setCapacidade('http')
        setStore(storeHttp)
        return
      }

      const fsAccess = suportaFsAccess()
      setCapacidade(decidirCapacidade({ apiHttp: false, fsAccess }))
      if (!fsAccess) return

      // 2. Pasta da sessão anterior: reabre sozinha só se a permissão continua
      //    valendo; "prompt" vira o botão de reabrir (precisa de um clique).
      const guardada = await lerPastaGuardada()
      if (!vivo || guardada === null) return
      const permissao = await permissaoDeEscrita(guardada)
      if (!vivo) return
      if (permissao === 'granted') {
        try {
          await usarPasta(guardada, false)
        } catch {
          // Pasta movida, renomeada ou sem o catalogo.csv: volta ao começo.
          await esquecerPasta()
        }
      } else if (permissao === 'prompt') {
        setPasta(guardada)
      } else {
        await esquecerPasta()
      }
    })()
    return () => {
      vivo = false
    }
  }, [usarPasta])

  const abrirPasta = useCallback(() => {
    setErro(null)
    setOcupado(true)
    void (async () => {
      try {
        const escolhida = await escolherPasta()
        if (escolhida !== null) await usarPasta(escolhida, true)
      } catch (err) {
        setErro(mensagem(err))
      } finally {
        setOcupado(false)
      }
    })()
  }, [usarPasta])

  const reabrirPasta = useCallback(() => {
    if (pasta === null) return
    setErro(null)
    setOcupado(true)
    void (async () => {
      try {
        const permissao = await pedirPermissaoDeEscrita(pasta)
        if (permissao === 'granted') {
          await usarPasta(pasta, true)
        } else {
          setErro('Permissão negada — use "📂 Abrir catálogo" para escolher a pasta.')
          setPasta(null)
          await esquecerPasta()
        }
      } catch (err) {
        setErro(mensagem(err))
      } finally {
        setOcupado(false)
      }
    })()
  }, [pasta, usarPasta])

  const importarArquivos = useCallback((lista: FileList | null) => {
    if (lista === null || lista.length === 0) return
    // Cópia SÍNCRONA: o FileList é vivo e o <input> é limpo logo depois da
    // chamada (para permitir reimportar o mesmo arquivo), o que esvaziaria a
    // lista no meio da leitura assíncrona.
    const escolhidos = [...lista]
    setErro(null)
    setOcupado(true)
    void (async () => {
      try {
        // Uma importação parcial (só o niveis.csv) preserva o que já está na
        // memória; o nome do arquivo é o que diz qual é qual.
        const atual = storeRef.current?.arquivos() ?? null
        let catalogo = atual?.catalogo ?? null
        let niveis = atual?.niveis ?? ''
        let origem = ARQUIVO_CATALOGO
        for (const arquivo of escolhidos) {
          const texto = await arquivo.text()
          if (arquivo.name.toLowerCase().includes('niveis')) {
            niveis = texto
          } else {
            catalogo = texto
            origem = arquivo.name
          }
        }
        if (catalogo === null) {
          setErro(`Escolha o ${ARQUIVO_CATALOGO} (o ${ARQUIVO_NIVEIS} é opcional).`)
          return
        }
        setStore(criarStoreLocal(destinoMemoria(origem), { catalogo, niveis }))
      } catch (err) {
        setErro(mensagem(err))
      } finally {
        setOcupado(false)
      }
    })()
  }, [])

  const baixarCsvs = useCallback(() => {
    const arquivos = storeRef.current?.arquivos() ?? null
    if (arquivos === null) return
    baixarTexto(ARQUIVO_CATALOGO, arquivos.catalogo)
    if (arquivos.niveis.trim() !== '') baixarTexto(ARQUIVO_NIVEIS, arquivos.niveis)
  }, [])

  return {
    store,
    capacidade,
    pastaPendente: pasta?.name ?? null,
    erro,
    ocupado,
    abrirPasta,
    reabrirPasta,
    importarArquivos,
    baixarCsvs,
    descartarErro: useCallback(() => setErro(null), []),
  }
}
