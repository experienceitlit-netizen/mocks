# Mapa de Dados do Atacado

MVP web navegável, estilo grafo do Obsidian, dos produtos e insumos de dados da Diretoria
Comercial Atacado: quem produz e quem consome cada dado, com owner, centro de custo e
status de débito técnico visíveis nó a nó.

O conteúdo vive na planilha **`catalogo.csv`** na raiz do projeto (uma linha por
componente — abra e edite no Excel ou LibreOffice). Um script de build transforma o
catálogo em
`src/data/graph.json`, que o front-end (React + Vite + `react-force-graph-2d`) renderiza
como grafo interativo. Sem backend, sem banco, sem login. (Evolução futura prevista:
substituir a edição da planilha por um formulário na própria UI.)

## O modelo: componentes e níveis

**Todo nó do mapa é um COMPONENTE que pertence a um NÍVEL.** Não existe "produto",
"insumo", "domínio" ou "raiz" como categoria à parte: o que separa um componente de outro
é só o nível dele, e níveis são dados que você edita (`niveis.csv` / botão **≣ Níveis**),
não tipos fixos no código. A raiz do mapa é uma linha do catálogo como qualquer outra; um
domínio também.

Daí saem as duas regras que governam o build inteiro:

1. **Todo nó vem de uma LINHA do `catalogo.csv`.** Nada é derivado de campo: preencher a
   coluna `dominio` não cria um nó de domínio, nenhum campo cria um nó de
   sistema. Quer o componente no mapa? Cadastre a linha dele, no nível dele.
2. **Toda aresta vem de uma referência declarada.** Só duas colunas ligam componentes:
   `consome` (aresta **"consome"**) e `associacoes` (aresta **"vem de"**). O build não
   infere ligação nenhuma.

As referências resolvem por **nome** (sem diferenciar caixa nem acentos) ou pelo **id**,
contra **qualquer linha do catálogo**, de qualquer nível — a cadeia pode ser percorrida
em qualquer direção. Como o mesmo nome pode existir em níveis diferentes, o id é
`<slug do nível>-<slug do nome>`: `final-resultado` e `silver-resultado` são dois
componentes distintos, ambos chamados "Resultado". Nome ambíguo numa referência gera aviso
e vence o nível de **menor ordem**. Mudar um componente de nível muda só o id dele — quem
o cita pelo nome continua achando.

Nome citado em `consome` que não existe em lugar nenhum vira **nó fantasma** (fica no
mapa, com aviso: é justamente o buraco que o mapa precisa mostrar). Em `associacoes`,
gera só o aviso, sem criar nó — não dá para adivinhar em que nível ele existiria.

Um componente está **incompleto** (gap de governança) quando `owner` **ou**
`centro_de_custo` está vazio. A regra é uma só, para todos os níveis: nenhum nível é
dispensado de ter dono.

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
  autocontido que abre por duplo clique, sem Node nem servidor — e que também
  **edita** os CSVs da pasta que o usuário escolher, no Chrome ou no Edge (ver
  "Os três modos de edição"). Zipe os CSVs junto com ele. Regenerar:
  `npm run build:standalone` gera `dist-standalone/index.html`; renomeie para
  `Mapa de Dados do Atacado.html` e zipe junto com um `LEIA-ME.txt`.
- **Fonte** (`mapa-dados-atacado-fonte.zip`): snapshot limpo do repositório.
  Regenerar na raiz do repo: `git archive --format=zip -o entregas/mapa-dados-atacado-fonte.zip HEAD`
  e acrescente um `COMO-RODAR.txt` (Node 20+, `npm install && npm run dev`).

## Os três modos de edição

O app descobre sozinho, ao abrir, **de onde** os dados vêm e **para onde** as edições
vão. O chip no alto da tela sempre diz qual modo está valendo.

| Modo | Quando | Chip | Onde a edição vai parar |
| --- | --- | --- | --- |
| **Dev server** | `npm run dev` | `✎ dev server` | O Vite grava o `catalogo.csv`/`niveis.csv` do projeto e regenera o `graph.json` (API `/api/catalogo` e `/api/niveis`). |
| **Arquivo local** | HTML de arquivo único no Chrome/Edge | `✎ pasta/catalogo.csv` | O próprio navegador grava nos CSVs da pasta que você escolher. Sem servidor e sem instalar nada. |
| **Somente leitura** | nenhum catálogo aberto | `🔒 somente leitura` | Nada é gravado; nenhum controle de edição aparece. |

A ordem é essa: onde a API do dev server responde, ela manda — o modo arquivo local nunca
interfere no fluxo de desenvolvimento.

### Editando pelo pacote HTML (sem servidor)

1. Deixe o `Mapa de Dados do Atacado.html` **na mesma pasta** do `catalogo.csv` e do
   `niveis.csv` (ou anote onde eles estão) e abra o HTML por duplo clique — Chrome ou Edge.
2. Clique em **📂 Abrir catálogo** e escolha essa pasta. O navegador pede autorização
   uma vez ("Permitir editar arquivos?"): é o que dá ao app o direito de gravar.
3. Pronto: **+ Novo componente**, **✎ Editar** e **≣ Níveis** passam a funcionar como no
   dev server. Cada save regrava o CSV inteiro na pasta e remonta o mapa na hora — as
   mesmas validações de sempre (nome duplicado, nível inexistente, nível em uso) valem
   aqui, e nada é gravado quando alguma falha.
4. O `catalogo.csv` continua sendo um CSV comum: abra no Excel quando quiser, e o Git da
   pasta (se houver) segue mostrando o diff de cada edição.

Detalhes que valem saber:

- **Só Chrome/Edge.** O modo arquivo usa a File System Access API. No Firefox e no Safari
  o app oferece **📄 Importar CSV** e **⬇ Baixar CSV**: a edição acontece na memória da
  aba e você grava o arquivo baixado por cima do original. Fechar a aba antes de baixar
  perde as edições.
- **A pasta é lembrada** entre sessões quando o app é servido por `http(s)://` — na volta,
  ele reabre sozinho ou mostra **📂 Reabrir _pasta_** (um clique re-autoriza). Aberto por
  `file://`, o navegador não deixa guardar essa memória: é escolher a pasta de novo a cada
  abertura.
- **A permissão vale enquanto a aba viver.** Se ela expirar no meio, o save avisa e basta
  reabrir a pasta.
- **O mapa vem do CSV que você abriu**, não do `graph.json` embutido no HTML: o pacote
  serve para qualquer catálogo, não só o que foi empacotado junto.
- **Sem trava de concorrência.** Duas pessoas editando a mesma pasta ao mesmo tempo
  sobrescrevem uma à outra — cada save grava o arquivo inteiro.

## Como editar o catálogo (menos de 5 minutos)

1. Abra o **`catalogo.csv`** no Excel ou LibreOffice (separador `;`, UTF-8 com BOM —
   abre certo por duplo clique no Excel pt-BR). Cada linha é um componente, seja qual
   for o nível — inclusive a raiz "Atacado — Dados" e os domínios.

2. Para um componente novo, acrescente uma linha e preencha as colunas (tabela abaixo).
   Listas (`consome`, `associacoes`) separam os nomes por ` | ` (barra vertical).
   Não sabe owner ou centro de custo? Deixe a célula vazia — o nó aparece com borda
   tracejada, sinalizando o gap de governança. Exemplo de linha (as três colunas
   legadas e as duas últimas omitidas):

   ```
   Meu Novo Painel;final;Tabela Delta;Risco;GDAD | Rating;painel de risco da mesa;nao;producao;;
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

Cabeçalho, nesta ordem (12 colunas): `nome; nivel; tipo_componente; dominio;
consome; descricao; debito; status; owner;
centro_de_custo; observacoes; associacoes`.

As **mesmas colunas valem em qualquer nível** — não há formato de linha por nível.

| Coluna | Obrigatória | Valores válidos / formato | Observações |
|---|---|---|---|
| `nome` | sim | texto livre curto | rótulo do nó; o `id` é `<slug do nível>-<slug do nome>` (ex.: "RAR 12M" no nível `final` → `final-rar-12m`, usado na URL `?no=final-rar-12m`); linha sem nome é ignorada com aviso |
| `nivel` | sim | slug de um nível ativo (`raiz`, `dominio`, `final`, `primario`, `fonte`, `origem`… ou qualquer um cadastrado no `niveis.csv`) | é o que define o componente; nível inexistente (ou removido da cadeia) faz a linha ser ignorada com aviso, e é erro no formulário |
| `tipo_componente` | não | `Tabela SQL` \| `Tabela Delta` \| `Excel` \| `Default` | forma/tecnologia do componente; vazio = `Default`; valor fora da lista vira aviso no build (assume `Default`) e erro no formulário |
| `dominio` | não | texto livre (`Cadastro`, `Mercado`, `Risco`…) | filtro por domínio na UI; é **só um campo** — não cria nó de domínio (para isso, cadastre a linha no nível `dominio`) |
| `consome` | não | nomes (ou ids) separados por ` \| `, sem diferenciar caixa nem acentos | cria as arestas **"consome"**; resolve em **qualquer linha do catálogo**, de qualquer nível; nome que não existe em lugar nenhum vira nó fantasma + aviso |
| `descricao` | não | uma linha | aparece no balão e na busca |
| `debito` | não | `sim` \| `nao` \| `avaliar` ou vazio | manda na cor do nó (ver abaixo); opcional em qualquer nível, mas preenchido tem de ser um dos três |
| `status` | não | `producao` \| `transicao` \| `investigacao` ou vazio | opcional em qualquer nível |
| `owner` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `centro_de_custo` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `observacoes` | não | Markdown livre (multilinha, entre aspas) | corpo do balão de detalhe; wikilinks só navegam, não criam arestas |
| `associacoes` | não | nomes (ou ids) separados por ` \| ` | cria as arestas **"vem de"**, em qualquer nível; resolve como `consome`, mas nome inexistente só gera aviso — nenhum nó é criado |

`tipo_componente` e `associacoes` são **opcionais na leitura**: um `catalogo.csv` antigo,
sem essas colunas, abre sem aviso nenhum (elas entram vazias). O serializador sempre grava
as 15.

Problema no catálogo gera **warning** no build (não erro) — o componente entra mesmo
assim, para o gap ficar visível em vez de escondido. A exceção é a linha que o build não
tem como posicionar (sem nome, sem nível ou de nível inexistente): essa é ignorada, com
aviso dizendo por quê.

## O que o build gera (`src/data/graph.json`)

```jsonc
{
  "niveis": [
    { "slug": "raiz", "titulo": "Raiz", "ordem": 0, "builtin": true },
    // corFundo/corBorda só aparecem no nível que declarou cor no niveis.csv
    { "slug": "prata", "titulo": "Prata", "ordem": 44, "builtin": false,
      "corFundo": "#c0c0c0", "corBorda": "#8fa3b8" }, …
  ],
  "nodes": [
    {
      "id": "final-rar-12m",        // <slug do nível>-<slug do nome>
      "nome": "RAR 12M",
      "nivel": "final",             // slug de um nível do bloco `niveis`
      "tipoComponente": "Default",  // Tabela SQL | Tabela Delta | Excel | Default
      "dominio": "Risco",
      "debito": "nao",
      "status": "producao",
      "owner": null,
      "centroDeCusto": null,
      "descricao": "…",
      "corpo": "…",                 // opcional: só quando `observacoes` não está vazia
      "incompleto": true,           // owner OU centroDeCusto vazio
      "fantasma": true              // opcional: citado em `consome`, sem linha própria
    }
  ],
  "links": [ { "source": "…", "target": "…", "label": "consome" | "vem de" } ]
}
```

Todo nó tem essa mesma forma, seja qual for o nível. A saída é **determinística**: nós
ordenados por `id`, arestas por `source`/`target`/`label`, e o resultado não depende da
ordem das linhas no CSV — rodar `npm run data` duas vezes dá o mesmo arquivo byte a byte.

## Níveis da cadeia

Os sete níveis do modelo (Raiz, Domínio, Produto final, Produto primário, Fonte
secundária, Fonte, Origem) são apenas o **padrão**: todos podem ser renomeados,
reordenados e removidos, e dá para criar níveis próprios — por exemplo as camadas
medallion Bronze, Prata e Ouro entre a fonte e a fonte secundária.

Cada nível tem **Título**, **Ordem** e, opcionalmente, duas **cores**; a ordem posiciona a coluna na vista de linhagem,
que é lida da esquerda (produto) para a direita (origem). Os padrão ocupam as ordens 0
(raiz), 10 (domínio), 20 (produto final), 30 (produto primário), 40 (fonte secundária),
50 (fonte) e 60 (origem) — então Ouro 42, Prata 44 e Bronze 46 entram exatamente entre a
fonte secundária e a fonte, do mais refinado ao mais cru.

**Nível cadastrado não é uma classe à parte.** A linha dele tem exatamente as mesmas
colunas de qualquer outra, e o nó tem exatamente os mesmos campos: as regras de cor por
débito, de borda tracejada por owner/centro de custo vazio e de arestas por
`consome`/`associacoes` valem igual em todos os níveis. Preencher apenas nome e descrição
continua valendo — o resto fica vazio. Transferir um componente entre níveis muda só o id
(e a coluna em que ele aparece): não quebra quem o consome nem apaga a ficha dele.

Pelo app (`npm run dev`): botão **≣ Níveis** no topo lista **todos** os níveis, cria
(Título + Ordem), renomeia, reordena, **pinta** e remove — inclusive os padrão. Cada linha
traz dois seletores de cor (fundo e borda da faixa) e um **↺** que devolve o nível à cor
padrão. Remover um nível em uso é recusado, com a lista de linhas que o utilizam. Linhas de nível customizado são
cadastradas pelo **+ Novo componente** (ou pelo **✎ Editar** de um nó) escolhendo o nível
no campo "Tipo de componente"; o campo "Associações" liga a linha às demais (coluna
`associacoes`). Trocar o tipo de uma linha **nunca apaga campo**: o que o nível novo não
usa continua na planilha, e o formulário avisa antes de salvar o que não couber.

### Renomear e remover: o `slug` é a chave

Na planilha, os níveis vivem em **`niveis.csv`**, com cinco colunas:
`titulo;ordem;slug;cor_fundo;cor_borda`. O **slug** é a identidade do nível — é ele que
aparece na coluna `nivel` do `catalogo.csv` (ex.: `bronze`, `final`) e o que amarra as
linhas ao nível:

- **slug vazio** = nível novo; o slug é derivado do título (`Bronze` → `bronze`).
- **slug preenchido** = esta linha *é* aquele nível, com o título que ela disser.
  Renomear "Produto final" para "Produto de dados" mantém `final` e **não mexe em nenhuma
  linha do catálogo** — muda só o rótulo da faixa.

O arquivo tem dois modos, decididos pelo próprio conteúdo (arquivo antigo, de duas
colunas, segue funcionando sem aviso):

- **legado** — nenhuma linha traz slug de nível padrão: os sete padrão valem e as linhas
  do arquivo são os customizados, encaixados pela ordem numérica;
- **explícito** — alguma linha traz slug de nível padrão: o arquivo passa a ser a lista
  **completa**, e nível padrão que não estiver listado está **removido**. É o que o modal
  grava a partir da primeira edição.

Remover um nível **leva junto as linhas dele** — e nenhum nível é exceção, nem a `raiz`.
Por isso o modal recusa remover um nível em uso, listando as linhas que o utilizam: o
caminho é mover essas linhas para outro nível antes. As arestas que apontavam para os nós
removidos somem com eles (uma `associacao` órfã vira aviso; um `consome` órfão vira nó
fantasma). Recriar o nível com o mesmo slug traz tudo de volta.

Uma coluna só vira faixa no grafo quando tem ao menos um componente.

### Cor da faixa: `cor_fundo` e `cor_borda`

As duas últimas colunas do `niveis.csv` pintam a faixa daquele nível na vista de níveis —
útil para dar identidade a uma camada ("Prata" prateado, "Bronze" acobreado). São
**atributo livre do nível**: o app não sabe o que "prata" significa nem deriva cor de nome
nenhum, quem escolhe é você.

- Formato: hexadecimal `#RRGGBB` (a forma curta `#RGB` também vale e é normalizada —
  `#0AF` vira `#00aaff`). **Vazio = cor padrão**, que é o cinza neutro de sempre.
- As duas são independentes: dá para pintar só o fundo, só a borda, ou as duas.
- Valor que não for hexadecimal vira **aviso** no `npm run data` (o nível continua valendo,
  sem a cor) e **erro** no formulário — que recusa salvar citando a coluna e o valor.
- Arquivo de três colunas (o formato anterior) continua carregando sem aviso nenhum.

```
titulo;ordem;slug;cor_fundo;cor_borda
Prata;44;prata;#c0c0c0;#8fa3b8
Bronze;46;bronze;;
```

**A cor não vai crua para o mapa.** A faixa é o pano de fundo dos nós, e é a cor do nó
(débito técnico) que carrega a informação — uma cor cheia atrás deles mataria o contraste
do tema escuro. Então a cor do nível entra como uma lâmina translúcida, na mesma proporção
do cinza padrão: **12% de opacidade no preenchimento e 55% na borda**, com o **título da
faixa herdando a cor da borda clareada** (para uma borda escura continuar legível como
texto). Definir só uma das cores colore o título do mesmo jeito, para a faixa ficar
coerente. Os valores vivem em `src/components/band-colors.ts`.

### Visão limpa: "Mostrar associações"

O checkbox **Mostrar associações** (na barra de foco e no painel de filtros) esconde todas
as setas do grafo, deixando só os nós — útil quando o mapa inteiro está na tela. O
destaque continua valendo: ao passar o mouse, fixar um nó com o clique ou abrir o balão
com o botão direito, as ligações **daquele** componente reaparecem (na vista de níveis, a
cadeia inteira dele). Companheiro do **Mostrar níveis**, que esconde as faixas.

### Excluir um componente

O **✎ Editar** de uma linha já cadastrada traz o botão **🗑 Excluir**. O primeiro clique
mostra o que sai junto: a linha e **cada menção a ela** nas outras linhas (`Consome/
Upstream`, `Associações`, `Fontes secundárias` e a rota de quem a citava como origem ou
fonte). O segundo confirma e grava. Limpar as menções é o ponto: sem isso, quem consumia o
componente ficaria apontando para um nó fantasma. A exclusão não tem desfazer no app — o
histórico do Git guarda a versão anterior do `catalogo.csv`.

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
- **Anel externo fino** na cor do nó = produto **final** (`nivel: final` — legado
  `secundario` — ou `ambos`).

Tamanho do nó é proporcional ao número de conexões (raiz e domínios têm tamanho fixo).
Formas: **círculo** = dado, **hexágono azul** = raiz, **quadrado arredondado** na cor da
área = domínio, **quadrado** = sistema, **quadrado de cantos bem arredondados teal**
(`#178A94`) = fonte secundária (UCS), **losango** = origem. Sistemas cujo nome contém
"Databricks" e as fontes secundárias (tabelas UCS) levam por cima um **glifo de
"tijolos"** claros empilhados, alusão ao logo do Databricks — desenhado só quando o nó
está grande o suficiente na tela para o glifo ser legível.

## Estrutura do projeto

```
catalogo.csv                # conteúdo: a planilha do catálogo (uma linha por componente)
niveis.csv                  # níveis da cadeia (titulo;ordem;slug;cor_fundo;cor_borda) — vazio = só os padrão
scripts/
  build-graph.ts            # CLI: lê catalogo.csv e emite src/data/graph.json
  graph-lib.ts              # lógica pura do build (parser CSV, níveis, montagem do grafo)
  graph-lib.test.ts         # testes do build (npm test)
  niveis.test.ts            # testes dos níveis dinâmicos
  catalogo-serde.test.ts    # testes do round-trip CSV e da validação da API
  vite-plugin-catalogo.ts   # API do dev server: /api/catalogo e /api/niveis (grava os CSVs)
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
    palette.ts              # fonte única das cores dos nós (semântica de débito)
    band-colors.ts          # cor da faixa de cada nível: o alpha que a cor escolhida recebe
    graph-types.ts          # tipos do schema + wrapper tipado da lib de grafo
    catalog-api.ts          # cliente da API do dev server (/api/catalogo, /api/niveis)
    catalog-store.ts        # interface de persistência + store HTTP (o modo de sempre)
    catalog-store-local.ts  # store que grava CSV sem servidor: valida, grava, remonta o grafo
    fs-access.ts            # File System Access: escolher pasta, ler/gravar, lembrar o handle
    graph-build.ts          # re-export de scripts/graph-lib.ts para o bundle do front-end
    useFonteCatalogo.ts     # escolha do modo no mount (HTTP → arquivo local → importar)
    FonteBar.tsx            # chip do modo ativo + "Abrir catálogo" / "Importar CSV"
  App.tsx                   # estado da UI (aba, seleção, hover, filtros, foco, URL ?no= e ?foco=)
FUTURO.md                   # itens fora do MVP (Fase 6)
```

## Navegação

- **Entrada padrão**: sem parâmetros na URL, o app abre já em **modo foco no nó-raiz
  "Atacado — Dados"**, vista Níveis, balão fechado — as colunas, lidas da esquerda para
  a direita, mostram raiz → domínios → produtos finais → primários → fontes → origens, o
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
  espelho da tabela executiva em cadeias, **uma linha por cadeia primário→final**
  (Domínio | Origem | Fonte | Produto primário | Produto final | Débito | Status —
  origem, fonte, débito e status vêm do primário; primário sem produto final mostra "—"
  na coluna do produto final), agrupada por domínio, com filtro rápido e ordenação próprios.
  Clicar no nome de um produto volta ao mapa com o nó centralizado e o balão aberto; o estado
  do mapa (foco, filtros, zoom) sobrevive à ida e volta. `Esc` na tabela retorna ao mapa.
- A URL reflete o estado e pode ser compartilhada: `?no=rar-12m` seleciona um nó,
  `?foco=rar-12m` abre o foco na vista de níveis, `?foco=rar-12m&vista=forca&prof=2`
  na vista de força com a profundidade escolhida e `?aba=tabela` abre direto na tabela.
- O toggle **"somente sem owner"** nos filtros acende os nós sem responsável definido.
