# Mapa de Dados do Atacado

MVP web navegável, estilo grafo do Obsidian, dos produtos e insumos de dados da Diretoria
Comercial Atacado: quem produz e quem consome cada dado, com owner, centro de custo e
status de débito técnico visíveis nó a nó.

O conteúdo vive na planilha **`catalogo.csv`** na raiz do projeto (uma linha por dado —
abra e edite no Excel ou LibreOffice). Um script de build transforma o catálogo em
`src/data/graph.json`, que o front-end (React + Vite + `react-force-graph-2d`) renderiza
como grafo interativo. Sem backend, sem banco, sem login. (Evolução futura prevista:
substituir a edição da planilha por um formulário na própria UI.)

## Modelo em 4 níveis

O catálogo espelha a tabela executiva em cadeias **origem → fonte (sistema) → produto
primário → produto secundário**:

- **Primário** (`nivel: primario`): dado bruto/insumo com rota própria — as colunas
  `origem` e `fonte_sistema` dizem de onde ele vem. Primários deixam a coluna `consome`
  vazia.
- **Secundário** (`nivel: secundario`): produto final montado a partir de primários.
  Deixa `origem` e `fonte_sistema` vazios (não se aplica — a rota vem dos primários) e
  lista na coluna `consome` **todos** os primários que consome (arestas "consome").
- **Ambos** (`nivel: ambos`): produto consumido direto e também insumo de outros
  (ex.: `rating`), sem self-loop.
- **Raiz** (criada **automaticamente pelo build**, sem linha no CSV): o nó único
  **"Atacado — Dados"**, portfólio do domínio e ponto de entrada do mapa. Agrega sozinho
  todos os produtos finais (todo dado de `nivel` `secundario` ou `ambos`). Não é um
  produto de dado: desenhado como **hexágono azul** de tamanho fixo, fica fora dos
  contadores, dos filtros e da tabela, e owner/centro de custo não se aplicam (o balão
  mostra "—", sem ⚠).
- **Fonte secundária** (derivada pelo build, sem linha no CSV): quase toda fonte —
  banco SQL, planilha etc. — é ingerida numa tabela Databricks **UCS** antes de virar
  produto. A coluna opcional `fontes_secundarias` (nomes separados por ` | `)
  materializa essas tabelas como nós `fsec-*` e reescreve a rota para **origem → fonte →
  fonte secundária → produto primário** (a aresta direta dado→fonte é substituída; com a
  fonte ainda desconhecida, a fonte secundária liga direto na origem). O débito técnico
  da rota **permanece no dado** — a ingestão não o resolve. Desenhada como **quadrado de
  cantos bem arredondados teal**, fica com sistemas/origens (toggle "Fontes e origens") e
  fora de contadores, filtros e tabela. O mapeamento é **incremental**: hoje só o Mercado
  Alvo declara as suas; os demais dados seguem com a ligação direta até serem mapeados.
- **Domínio** (derivado pelo build, sem linha no CSV): entre a raiz e os produtos
  finais o build insere um nó por domínio (`dom-cadastro`, `dom-mercado`, `dom-risco`,
  `dom-resultado`, `dom-regulatorio`), reescrevendo cada aresta raiz→produto como
  raiz→domínio→produto. Navegação: **Atacado — Dados → domínio → produto secundário →
  produto primário → fonte → origem**. Desenhado como **quadrado arredondado na cor do
  domínio**, sempre visível no mapa, focável, e — como a raiz — fora de contadores,
  filtros e tabela.

Hoje o `catalogo.csv` tem **35 dados** (22 primários, 11 secundários, 2 "ambos") —
**36 nós de dados contando a raiz automática** — com **25 cadeias "consome"**
primário→secundário e **18 arestas "agrega"** (raiz → 5 domínios → 13 produtos finais);
com os domínios, sistemas, fontes secundárias e origens derivados, o `graph.json` fecha
em **74 nós e 84 arestas**.

## Como rodar

```bash
npm install
npm run dev      # regenera o graph.json (predev) e abre o app em http://localhost:5173
```

Outros comandos:

```bash
npm run data     # só regenera src/data/graph.json a partir do catalogo.csv
npm test         # testes do build de dados (vitest)
npm run build    # gera o site estático em dist/ (prebuild roda o data antes)
npm run preview  # serve o dist/ localmente
```

O `dist/` é estático puro: pode ser aberto em qualquer hosting interno de arquivos.

## Distribuição

Dois pacotes ficam em `../entregas/` (fora do git):

- **App pronto para rodar** (`mapa-dados-atacado-app.zip`): um único HTML
  autocontido que abre por duplo clique, sem Node nem servidor. Regenerar:
  `npm run build:standalone` gera `dist-standalone/index.html`; renomeie para
  `Mapa de Dados do Atacado.html` e zipe junto com um `LEIA-ME.txt`.
- **Fonte** (`mapa-dados-atacado-fonte.zip`): snapshot limpo do repositório.
  Regenerar na raiz do repo: `git archive --format=zip -o entregas/mapa-dados-atacado-fonte.zip HEAD`
  e acrescente um `COMO-RODAR.txt` (Node 20+, `npm install && npm run dev`).

## Como editar o catálogo (menos de 5 minutos)

1. Abra o **`catalogo.csv`** no Excel ou LibreOffice (separador `;`, UTF-8 com BOM —
   abre certo por duplo clique no Excel pt-BR). Cada linha é um dado; a raiz
   "Atacado — Dados" **não** tem linha (o build a cria e a liga sozinho).

2. Para um dado novo, acrescente uma linha e preencha as colunas (tabela abaixo).
   Listas (`consome`, `fontes_secundarias`) separam os nomes por ` | ` (barra vertical).
   Não sabe owner ou centro de custo? Deixe a célula vazia — o nó aparece com borda
   tracejada, sinalizando o gap de governança. Exemplo de linha (as duas primeiras e as
   três últimas colunas omitidas):

   ```
   Meu Novo Painel;secundario;Risco;;;;GDAD | Rating;painel de risco da mesa;nao;producao;;;
   ```

3. `observacoes` é texto livre em Markdown (aparece no balão do nó). `[[Wikilinks]]`
   nele viram links de navegação no balão, mas **não** criam arestas — arestas de
   consumo vêm **só** da coluna `consome`. Célula com quebra de linha ou `;` deve ficar
   entre aspas (o Excel faz isso sozinho ao salvar).

4. Salve mantendo o formato CSV e rode `npm run data` (ou apenas `npm run dev`, que já
   roda antes). Confira o console: o build avisa sobre coluna faltando, `nivel`
   inválido, nome duplicado e nome em `consome` que não existe (vira nó "fantasma"
   tracejado no grafo).

## Colunas do catalogo.csv

Cabeçalho, nesta ordem: `nome; nivel; dominio; origem; fonte_sistema;
fontes_secundarias; consome; descricao; debito; status; owner; centro_de_custo;
observacoes`.

| Coluna | Obrigatória | Valores válidos / formato | Observações |
|---|---|---|---|
| `nome` | sim | texto livre curto | rótulo do nó; o `id` é derivado como slug (ex.: "RAR 12M" → `rar-12m`, usado na URL `?no=rar-12m`); linha sem nome é ignorada com aviso |
| `nivel` | sim | `primario` \| `secundario` \| `ambos` | nível na cadeia (ver "Modelo em 4 níveis"); deriva o tipo do nó (primário = insumo, o resto = produto); a raiz não tem linha |
| `dominio` | sim | `Cadastro` \| `Mercado` \| `Risco` \| `Resultado` \| `Regulatorio` \| `A definir` | filtro por domínio na UI; vazio = `A definir` |
| `origem` | primários | texto ou vazio | área ou processo de origem; vazio em secundários = não se aplica (UI mostra "—") |
| `fonte_sistema` | primários | texto ou vazio | sistema/plataforma onde o dado vive; se contiver "legado" ou "on-premise", o nó fica âmbar; vazio em secundários = não se aplica |
| `fontes_secundarias` | não | nomes separados por ` \| ` (ex.: `Mercado Alvo Semanal - UCS \| Mercado Alvo Mensal - UCS`) | tabelas UCS onde a fonte é ingerida; presença substitui a aresta direta dado→sistema por dado→fonte secundária→sistema (dedup global por nome) |
| `consome` | secundários | nomes (ou ids) separados por ` \| `, sem diferenciar caixa | cria as arestas "consome"; nome inexistente vira nó fantasma + aviso |
| `descricao` | sim | uma linha | aparece no balão e na busca |
| `debito` | sim | `sim` \| `nao` \| `avaliar` | manda na cor do nó (ver abaixo) |
| `status` | sim | `producao` \| `transicao` \| `investigacao` | |
| `owner` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `centro_de_custo` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `observacoes` | não | Markdown livre (multilinha, entre aspas) | corpo do balão de detalhe; wikilinks só navegam, não criam arestas |

Problema no catálogo gera **warning** no build (não erro) — o dado entra mesmo assim,
para o gap ficar visível em vez de escondido.

## Cores e bordas do grafo

Cor do nó, por ordem de precedência (definida em `src/components/palette.ts`):

1. `debito: sim` → **vermelho** `#CC092F`
2. `debito: avaliar` → **cinza** `#8A8A8A`
3. `fonte_sistema` contém "legado"/"on-premise" → **âmbar** `#B8860B`
4. default (curado/governado) → **verde** `#3A7D44`

Bordas:

- **Borda branca tracejada** = `owner` ou `centro_de_custo` vazio (nó incompleto —
  é o que a reunião de governança precisa enxergar).
- **Contorno cinza tracejado sem preenchimento** = nó fantasma: citado na coluna
  `consome`, mas ainda sem linha no catálogo.
- **Anel externo fino** na cor do nó = produto **secundário/final** (`nivel: secundario`
  ou `ambos`).

Tamanho do nó é proporcional ao número de conexões (raiz e domínios têm tamanho fixo).
Formas: **círculo** = dado, **hexágono azul** = raiz, **quadrado arredondado** na cor da
área = domínio, **quadrado** = sistema, **quadrado de cantos bem arredondados teal**
(`#178A94`) = fonte secundária (UCS), **losango** = origem. Sistemas cujo nome contém
"Databricks" e as fontes secundárias (tabelas UCS) levam por cima um **glifo de
"tijolos"** claros empilhados, alusão ao logo do Databricks — desenhado só quando o nó
está grande o suficiente na tela para o glifo ser legível.

## Estrutura do projeto

```
catalogo.csv                # conteúdo: a planilha do catálogo (uma linha por dado)
scripts/
  build-graph.ts            # CLI: lê catalogo.csv e emite src/data/graph.json
  graph-lib.ts              # lógica pura do build (parser CSV, raiz automática, montagem do grafo)
  graph-lib.test.ts         # testes (npm test)
src/
  data/graph.json           # GERADO pelo build — não editar à mão (mas é commitado)
  components/
    Graph.tsx               # canvas do grafo (react-force-graph-2d)
    NodeBalloon.tsx         # balão de detalhe ancorado no nó selecionado
    Filters.tsx             # domínio, débito, nível, "somente sem owner", camada de linhagem, contadores
    FocusBar.tsx            # barra do modo foco: breadcrumb, vista (níveis/força), sair
    lineage.ts              # vista de linhagem em níveis: cadeia montante + layout em colunas
    SearchBox.tsx           # busca por nome/descrição
    TableView.tsx           # visão de tabela dos dados (aba "Tabela")
    table-utils.ts          # helpers puros da tabela: filtro, ordenação, agrupamento
    Legend.tsx              # legenda fixa de cores/bordas
    Markdown.tsx            # renderizador mínimo do texto de observações
    palette.ts              # fonte única das cores
    graph-types.ts          # tipos do schema + wrapper tipado da lib de grafo
  App.tsx                   # estado da UI (aba, seleção, hover, filtros, foco, URL ?no= e ?foco=)
FUTURO.md                   # itens fora do MVP (Fase 6)
```

## Navegação

- **Entrada padrão**: sem parâmetros na URL, o app abre já em **modo foco no nó-raiz
  "Atacado — Dados"**, vista Níveis, balão fechado — as colunas, lidas da esquerda para
  a direita, mostram raiz → domínios → secundários → primários → fontes → origens, o
  portfólio inteiro numa tela. "Ver mapa completo" (ou `Esc`) leva ao mapa global, onde
  a raiz aparece como hexágono azul ligado aos domínios (quadrados arredondados na cor
  da área) e estes aos produtos finais. A URL só ganha `?foco=` quando o estado difere
  dessa entrada padrão; `?no=` sem `?foco=` continua abrindo o mapa global com o nó
  selecionado.
- **Clique com o botão direito** num nó abre um **balão de detalhe** ancorado no próprio
  nó (com seta, mudando de lado para caber na tela) e destaca suas **relações** — nó e
  vizinhos acesos, o resto esmaecido — enquanto o balão estiver aberto; `Esc` ou clique
  no fundo fecha. O balão também abre ao clicar num produto na aba Tabela, nos links de
  relações dentro do próprio balão e via `?no=` na URL. Para um dado, o balão traz a
  seção **"Linhagem"**: a árvore indentada de tudo de que ele depende (origem / fonte /
  produto por nível, recursiva), com itens clicáveis.
- **Clique (botão esquerdo)** num nó **fixa o destaque** do hover: o nó e seus vizinhos
  (na vista Níveis, a cadeia inteira) ficam acesos e o resto esmaece, persistindo até
  `Esc`, clique no fundo ou clique em outro nó (que re-fixa nele; clicar de novo no
  mesmo nó desfixa). Não abre balão nem muda a URL. O hover momentâneo continua
  funcionando e sobrepõe o destaque fixado enquanto durar.
- **Duplo clique** num nó (ou o botão **"⌖ Focar neste nó"** do balão) entra no **modo
  foco** (ou re-foca, empilhando no **breadcrumb** do caminho navegado), com botão
  "Ver mapa completo" para sair (`Esc` sai em estágios: fecha o balão, depois desfixa o
  destaque, depois sai do foco). O clique esquerdo simples, também no foco, só fixa o
  destaque — os detalhes ficam no botão direito.
  O foco tem duas vistas, no switch da barra:
  - **Níveis** (padrão): a linhagem montante **completa** do nó focado, lida da
    **esquerda para a direita** — o focado na extrema esquerda e a cadeia se abrindo à
    direita: produto → insumos → fontes → origens (focar Setorização a põe à esquerda,
    com as origens na última coluna à direita; focar a raiz ou um domínio abre o
    portfólio inteiro). Fonte ou origem ainda desconhecida ("a confirmar",
    "a identificar"…) aparece como **placeholder cinza tracejado**, para a cadeia sempre
    mostrar o nível. Passar o mouse destaca a cadeia inteira do nó.
  - **Força**: a vizinhança em grafo de força, com slider de **profundidade** (1–3).
- O toggle **"Fontes e origens"** liga a camada de linhagem: além dos dados (**círculos**),
  aparecem os **sistemas** (quadrados) e as **origens** (losangos) derivados do
  catálogo. Fica desligado no mapa global e liga automaticamente ao entrar em foco.
  Contadores e filtros de governança continuam contando só os dados.
- O seletor **Mapa | Tabela** no topo alterna entre o grafo e a **visão de tabela**:
  espelho da tabela executiva em cadeias, **uma linha por cadeia primário→secundário**
  (Domínio | Origem | Fonte | Produto primário | Produto secundário | Débito | Status —
  origem, fonte, débito e status vêm do primário; primário sem produto final mostra "—"
  na coluna do secundário), agrupada por domínio, com filtro rápido e ordenação próprios.
  Clicar no nome de um produto volta ao mapa com o nó centralizado e o balão aberto; o estado
  do mapa (foco, filtros, zoom) sobrevive à ida e volta. `Esc` na tabela retorna ao mapa.
- A URL reflete o estado e pode ser compartilhada: `?no=rar-12m` seleciona um nó,
  `?foco=rar-12m` abre o foco na vista de níveis, `?foco=rar-12m&vista=forca&prof=2`
  na vista de força com a profundidade escolhida e `?aba=tabela` abre direto na tabela.
- O toggle **"somente sem owner"** nos filtros acende os nós sem responsável definido.
