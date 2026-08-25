# Mapa de Dados do Atacado

MVP web navegável, estilo grafo do Obsidian, dos produtos e insumos de dados da Diretoria
Comercial Atacado: quem produz e quem consome cada dado, com owner, centro de custo e
status de débito técnico visíveis nó a nó.

O conteúdo vive em arquivos Markdown no diretório `vault/` (um arquivo por dado). Um script
de build transforma o vault em `src/data/graph.json`, que o front-end (React + Vite +
`react-force-graph-2d`) renderiza como grafo interativo. Sem backend, sem banco, sem login.

## Como rodar

```bash
npm install
npm run dev      # regenera o graph.json (predev) e abre o app em http://localhost:5173
```

Outros comandos:

```bash
npm run data     # só regenera src/data/graph.json a partir do vault/
npm test         # testes do build de dados (vitest)
npm run build    # gera o site estático em dist/ (prebuild roda o data antes)
npm run preview  # serve o dist/ localmente
```

O `dist/` é estático puro: pode ser aberto em qualquer hosting interno de arquivos.

## Como adicionar um dado novo (menos de 5 minutos)

1. Copie o template para um novo arquivo com o slug do dado:

   ```bash
   cp vault/_template.md vault/meu-novo-dado.md
   ```

   (Arquivos começando com `_` são ignorados pelo build.)

2. Preencha o frontmatter (bloco YAML entre `---`). Campos e valores válidos na tabela
   abaixo. Não sabe owner ou centro de custo? Deixe `null` — o nó aparece com borda
   tracejada, sinalizando o gap de governança.

3. No corpo (abaixo do segundo `---`), escreva a descrição livre em Markdown e declare as
   conexões com wikilinks — cada `[[Nome do Outro Dado]]` cria uma aresta "este nó consome
   o alvo". Para outro rótulo de aresta, use `[[Alvo|produz]]`.

4. Rode `npm run data` (ou apenas `npm run dev`, que já roda antes). Confira o console:
   o build avisa sobre campo faltando, id duplicado e link quebrado (que vira nó
   "fantasma" tracejado no grafo, como no Obsidian).

O vault também pode ser aberto como vault do Obsidian desktop — os wikilinks funcionam lá.

## Convenções de frontmatter

| Campo | Obrigatório | Valores válidos / formato | Observações |
|---|---|---|---|
| `id` | sim | slug único em kebab-case (ex.: `rar-12m`) | usado na URL (`?no=rar-12m`) e na resolução de links |
| `nome` | sim | texto livre curto | rótulo do nó; wikilinks resolvem por `nome` ou `id`, sem diferenciar caixa |
| `tipo` | sim | `produto` \| `insumo` \| `sistema` \| `dominio` | |
| `dominio` | sim | `Cadastro` \| `Mercado` \| `Risco` \| `Resultado` \| `Regulatorio` \| `A definir` | filtro por domínio na UI |
| `origem` | sim | texto livre | área ou processo de origem |
| `sistema` | sim | texto livre | se contiver "legado" ou "on-premise", o nó fica âmbar |
| `descricao` | sim | uma linha | aparece no painel e na busca |
| `centro_de_custo` | sim (aceita `null`) | texto ou `null` | `null` = a definir → nó com borda tracejada |
| `owner` | sim (aceita `null`) | texto ou `null` | `null` = a definir → nó com borda tracejada |
| `debito` | sim | `sim` \| `nao` \| `avaliar` | manda na cor do nó (ver abaixo) |
| `status` | sim | `producao` \| `transicao` \| `investigacao` | |

Campo obrigatório faltando gera **warning** no build (não erro) — o nó entra mesmo assim,
para o gap ficar visível em vez de escondido.

## Cores e bordas do grafo

Cor do nó, por ordem de precedência (definida em `src/components/palette.ts`):

1. `debito: sim` → **vermelho** `#CC092F`
2. `debito: avaliar` → **cinza** `#8A8A8A`
3. `sistema` contém "legado"/"on-premise" → **âmbar** `#B8860B`
4. default (curado/governado) → **verde** `#3A7D44`

Bordas:

- **Borda branca tracejada** = `owner` ou `centro_de_custo` em `null` (nó incompleto —
  é o que a reunião de governança precisa enxergar).
- **Contorno cinza tracejado sem preenchimento** = nó fantasma: alvo de wikilink que ainda
  não tem arquivo no vault.

Tamanho do nó é proporcional ao número de conexões.

## Estrutura do projeto

```
vault/                      # conteúdo: um .md por dado (frontmatter + corpo markdown)
  _template.md              # copie este para criar um dado novo
scripts/
  build-graph.ts            # CLI: varre vault/ e emite src/data/graph.json
  graph-lib.ts              # lógica pura do build (parse, wikilinks, montagem do grafo)
  graph-lib.test.ts         # testes (npm test)
src/
  data/graph.json           # GERADO pelo build — não editar à mão (mas é commitado)
  components/
    Graph.tsx               # canvas do grafo (react-force-graph-2d)
    DetailPanel.tsx         # drawer de detalhe do nó selecionado
    Filters.tsx             # domínio, débito, "somente sem owner", camada de linhagem, contadores
    FocusBar.tsx            # barra do modo foco: breadcrumb, vista (níveis/força), sair
    lineage.ts              # vista de linhagem em níveis: cadeia montante + layout em colunas
    SearchBox.tsx           # busca por nome/descrição
    TableView.tsx           # visão de tabela dos dados (aba "Tabela")
    table-utils.ts          # helpers puros da tabela: filtro, ordenação, agrupamento
    Legend.tsx              # legenda fixa de cores/bordas
    Markdown.tsx            # renderizador mínimo do corpo dos .md
    palette.ts              # fonte única das cores
    graph-types.ts          # tipos do schema + wrapper tipado da lib de grafo
  App.tsx                   # estado da UI (aba, seleção, hover, filtros, foco, URL ?no= e ?foco=)
FUTURO.md                   # itens fora do MVP (Fase 6)
```

## Navegação

- **Clique** num nó abre o painel de detalhe; `Esc` ou clique fora fecha. Para um dado,
  o painel traz a seção **"Linhagem"**: a árvore indentada de tudo de que ele depende
  (origem / fonte / produto por nível, recursiva), com itens clicáveis.
- **Duplo clique** num nó (ou o botão **"⌖ Focar neste nó"** do painel) entra no **modo
  foco**, com **breadcrumb** do caminho navegado, botão "Ver mapa completo" para sair
  (`Esc` sai em dois estágios: primeiro fecha o painel, depois o foco) e clique em outro
  nó para re-focar nele. O foco tem duas vistas, no switch da barra:
  - **Níveis** (padrão): a linhagem montante **completa** do dado focado, em colunas da
    esquerda para a direita — origem → fonte → produto, com os níveis de produto se
    repetindo até o nó focado na extrema direita. Fonte ou origem ainda desconhecida
    ("a confirmar", "a identificar"…) aparece como **placeholder cinza tracejado**, para
    a cadeia sempre mostrar o nível. Passar o mouse destaca a cadeia inteira do nó.
  - **Força**: a vizinhança em grafo de força, com slider de **profundidade** (1–3).
- O toggle **"Fontes e origens"** liga a camada de linhagem: além dos dados (**círculos**),
  aparecem os **sistemas** (quadrados) e as **origens** (losangos) derivados do
  frontmatter. Fica desligado no mapa global e liga automaticamente ao entrar em foco.
  Contadores e filtros de governança continuam contando só os dados.
- O seletor **Mapa | Tabela** no topo alterna entre o grafo e a **visão de tabela**: as
  mesmas colunas da tabela executiva que originou o projeto (domínio, origem, fonte,
  produto, descrição, centro de custo, owner, débito, status), agrupadas por domínio, com
  filtro rápido e ordenação próprios. Clicar no nome de um dado volta ao mapa com o nó
  selecionado e centralizado; o estado do mapa (foco, filtros, zoom) sobrevive à ida e
  volta. `Esc` na tabela retorna ao mapa.
- A URL reflete o estado e pode ser compartilhada: `?no=rar-12m` seleciona um nó,
  `?foco=rar-12m` abre o foco na vista de níveis, `?foco=rar-12m&vista=forca&prof=2`
  na vista de força com a profundidade escolhida e `?aba=tabela` abre direto na tabela.
- O toggle **"somente sem owner"** nos filtros acende os nós sem responsável definido.
