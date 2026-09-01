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
2. **Toda aresta vem de uma referência declarada.** Uma coluna só liga componentes:
   `consome` (aresta **"consome"**), em que a linha declara o **upstream** — de quem ela
   consome dado. O build não infere ligação nenhuma. O outro lado (a seção "↩ Consome"
   do balão) não é campo: é a **mesma** aresta lida de trás para frente.

As referências guardam o **`id`** do alvo — a chave estável da linha, que **não muda**
quando o componente é renomeado, trocado de nível ou de tipo. É o que faz uma ligação
sobreviver a qualquer edição: "Resultado" (id `resultado`) virar "Resultado consolidado"
no nível `gold` não desfaz nada, porque quem aponta para ele aponta para `resultado`, não
para o rótulo. Uma referência resolve contra **qualquer linha do catálogo**, de qualquer
nível — a cadeia pode ser percorrida em qualquer direção. E como o id é único no arquivo
inteiro, dois componentes com o **mesmo nome** em níveis diferentes (`resultado` e
`resultado-2`) deixam de ser ambíguos numa ligação.

Por compatibilidade (e para quem edita a planilha à mão), a célula também aceita o
**nome** do alvo, sem diferenciar caixa nem acentos: resolve, gera um aviso dizendo que a
ligação por nome quebra ao renomear, e a **próxima gravação troca a célula pelo id**. Nome
ambíguo (o mesmo rótulo em níveis diferentes) gera aviso à parte e vence o nível de
**menor ordem** — ambiguidade que some assim que a célula vira id.

Nome citado em `consome` que não existe em lugar nenhum vira **nó fantasma** (fica no
mapa, com aviso: é justamente o buraco que o mapa precisa mostrar).

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

### Pacote de demonstração (o que você entrega)

```bash
npm run pacote
```

Um comando: gera o HTML autocontido e monta `../entregas/mapa-dados-atacado-demo.zip`
(~160 KB) com esta estrutura:

```
Mapa de Dados do Atacado/
  Mapa de Dados do Atacado.html   # abre por duplo clique, sem instalar nada
  catalogo/
    catalogo.csv                  # cópia do catálogo no momento da geração
    niveis.csv
    verbos.csv                    # só existe se o vocabulário tiver sido editado
  LEIA-ME.txt                     # como navegar e como editar
```

Quem recebe abre o HTML e vê o mapa completo. Para **editar**, clica em
"Abrir catálogo", escolhe a pasta `catalogo/` que veio no zip e autoriza — daí em
diante o que salvar é gravado naqueles dois CSVs (Chrome ou Edge; ver "Os três
modos de edição"). Para devolver o trabalho, basta reenviar os dois arquivos.

Os CSVs vão como **cópia**: quem testa a demo não toca no catálogo do repositório,
e várias pessoas podem editar a sua sem conflito. O HTML carrega os dados
embutidos da geração, então **regere o pacote** (`npm run pacote`) sempre que o
catálogo mudar e você for distribuir de novo.

O conteúdo do `LEIA-ME.txt` fica em `scripts/pacote-leia-me.txt` (a data é
preenchida na geração); o empacotamento em si está em `scripts/empacotar.ts`.

### Fonte

Snapshot limpo do repositório, na raiz do repo:

```bash
git archive --format=zip -o entregas/mapa-dados-atacado-fonte.zip HEAD
```

Acrescente um `COMO-RODAR.txt` (Node 20+, `npm install && npm run dev`).

## Os três modos de edição

O app descobre sozinho, ao abrir, **de onde** os dados vêm e **para onde** as edições
vão. O chip no alto da tela sempre diz qual modo está valendo.

| Modo | Quando | Chip | Onde a edição vai parar |
| --- | --- | --- | --- |
| **Dev server** | `npm run dev` | `✎ dev server` | O Vite grava o `catalogo.csv`/`niveis.csv`/`verbos.csv` do projeto e regenera o `graph.json` (API `/api/catalogo`, `/api/niveis` e `/api/verbos`). |
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
   **Deixe a primeira célula (`id`) vazia**: o app gera o id a partir do nome na próxima
   gravação. A lista `consome` separa os alvos por ` | ` (barra
   vertical) e guarda o **id** de cada um — mas você pode escrever o **nome**, que o
   app converte para id ao gravar. Não sabe owner ou centro de custo? Deixe a célula
   vazia — o nó aparece com borda tracejada, sinalizando o gap de governança. Exemplo de
   linha (`observacoes` omitida, e `produto_de_dados` marcando o componente como produto
   de dados):

   ```
   ;Meu Novo Painel;final;Tabela Delta;Risco;gdad | rating;painel de risco da mesa;nao;producao;;;;sim
   ```

   Nunca edite nem reordene um `id` já preenchido: ele é a chave que segura as ligações.
   Trocar o id de uma linha é o mesmo que apagá-la e criar outra — quem apontava para ela
   passa a apontar para o vazio (nó fantasma).

3. `observacoes` é texto livre em Markdown (aparece no balão do nó). `[[Wikilinks]]`
   nele viram links de navegação no balão, mas **não** criam arestas — arestas de
   consumo vêm **só** da coluna `consome`. Célula com quebra de linha ou `;` deve ficar
   entre aspas (o Excel faz isso sozinho ao salvar).

4. Salve mantendo o formato CSV e rode `npm run data` (ou apenas `npm run dev`, que já
   roda antes). Confira o console: o build avisa sobre coluna faltando, `nivel`
   inválido, `id` repetido, nome duplicado, referência escrita por nome (que a próxima
   gravação normaliza) e alvo de `consome` que não existe (vira nó "fantasma"
   tracejado no grafo).

## Colunas do catalogo.csv

Cabeçalho, nesta ordem (13 colunas): `id; nome; nivel; tipo_componente; dominio;
consome; descricao; debito; status; owner;
centro_de_custo; observacoes; produto_de_dados`.

As **mesmas colunas valem em qualquer nível** — não há formato de linha por nível.

| Coluna | Obrigatória | Valores válidos / formato | Observações |
|---|---|---|---|
| `id` | não (o app preenche) | slug em kebab-case, único no arquivo | **chave estável da linha**, e id do nó no mapa (URL `?no=rar-12m`). Célula vazia = o app gera do nome ao gravar ("RAR 12M" → `rar-12m`; em colisão, `rar-12m-2`). Preenchida, é **imutável**: renomear, mudar de nível ou de tipo não mexe nela. Id repetido é erro |
| `nome` | sim | texto livre curto | rótulo do nó, na tela e nas buscas — não é chave: dá para renomear à vontade. Linha sem nome é ignorada com aviso |
| `nivel` | sim | slug de um nível ativo (`raiz`, `dominio`, `final`, `primario`, `fonte`, `origem`… ou qualquer um cadastrado no `niveis.csv`) | é o que define o componente; nível inexistente (ou removido da cadeia) faz a linha ser ignorada com aviso, e é erro no formulário |
| `tipo_componente` | não | `Tabela SQL` \| `Tabela Delta` \| `Excel` \| `Default` | tecnologia do componente; manda no **ícone dentro do nó** (ver abaixo); vazio = `Default`; valor fora da lista vira aviso no build (assume `Default`) e erro no formulário |
| `dominio` | não | texto livre (`Cadastro`, `Mercado`, `Risco`…) | filtro por domínio na UI; é **só um campo** — não cria nó de domínio (para isso, cadastre a linha no nível `dominio`) |
| `consome` | não | **ids** separados por ` \| ` (nome também é aceito) | **a única coluna de relação**: cria as arestas **"consome"** e resolve em **qualquer linha do catálogo**, de qualquer nível. Nome resolve com aviso e vira id na próxima gravação; o que não resolve de jeito nenhum vira nó fantasma + aviso |
| `descricao` | não | uma linha | aparece no balão e na busca |
| `debito` | não | `sim` \| `nao` \| `avaliar` ou vazio | manda na cor do nó (ver abaixo); opcional em qualquer nível, mas preenchido tem de ser um dos três |
| `status` | não | `producao` \| `transicao` \| `investigacao` ou vazio | opcional em qualquer nível |
| `owner` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `centro_de_custo` | sim (aceita vazio) | texto ou vazio | vazio = a definir → nó com borda tracejada |
| `observacoes` | não | Markdown livre (multilinha, entre aspas) | corpo do balão de detalhe; wikilinks só navegam, não criam arestas |
| `produto_de_dados` | não | `sim` \| `nao` ou vazio | marca o componente como **produto de dados**: o nó vira **losango** e ganha o **rótulo em negrito** no mapa (ver abaixo), ganha um chip no balão e entra no filtro "Somente produtos de dados". Vazio = `nao`; valor fora do par vira aviso no build (assume `nao`) e erro no formulário. Vale em **qualquer nível** — a bandeira é ortogonal à camada, como o débito |

`id`, `tipo_componente` e `produto_de_dados` são **opcionais na leitura**: um
`catalogo.csv` antigo, sem essas colunas, abre sem aviso nenhum (elas entram vazias, e os
ids são gerados dos nomes). O serializador sempre grava as 13.

A coluna **`associacoes`** foi aposentada. Ela era a segunda relação declarada (aresta
"vem de") e o modelo passou a ter só uma, o upstream. Um arquivo antigo que ainda a traga
abre sem reclamar de coluna desconhecida, e **o conteúdo não é perdido**: cada referência
dela vira um `consome` na leitura, com aviso, e a próxima gravação escreve o arquivo já
sem a coluna. Consequência a saber: uma associação para um alvo inexistente, que antes só
gerava aviso, agora cria **nó fantasma** — o tratamento único de toda referência que não
resolve. (As colunas `origem`, `fonte_sistema` e `fontes_secundarias` também são
toleradas, mas ali o conteúdo é ignorado: virou nível próprio.)

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
      "id": "rar-12m",              // o id da LINHA do catálogo (coluna `id`)
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
      "produtoDeDados": false,      // coluna `produto_de_dados` = "sim" → losango + negrito
      "fantasma": true              // opcional: citado em `consome`, sem linha própria
                                    // (sem linha, o id vem prefixado: `fantasma-…`)
    }
  ],
  "verbos": [
    // o vocabulário das relações: `label` da aresta → título, sentido e seta.
    // Ausente em builds antigos (toda aresta de lá é "consome").
    { "slug": "consome", "titulo": "Consome", "sentido": "montante", "seta": true, "builtin": true },
    { "slug": "relaciona", "titulo": "Relaciona", "sentido": "nenhum", "seta": false, "builtin": true }, …
  ],
  "links": [ { "source": "…", "target": "…", "label": "consome" } ]
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
`consome` valem igual em todos os níveis. Preencher apenas nome e descrição
continua valendo — o resto fica vazio. Transferir um componente entre níveis muda só o id
(e a coluna em que ele aparece): não quebra quem o consome nem apaga a ficha dele.

Pelo app (`npm run dev`): botão **≣ Níveis** no topo lista **todos** os níveis, cria
(Título + Ordem), renomeia, reordena, **pinta** e remove — inclusive os padrão. Cada linha
traz dois seletores de cor (fundo e borda da faixa) e um **↺** que devolve o nível à cor
padrão. Remover um nível em uso é recusado, com a lista de linhas que o utilizam. Linhas de nível customizado são
cadastradas pelo **+ Novo componente** (ou pelo **✎ Editar** de um nó) escolhendo o nível
no campo "Tipo de componente"; o campo "Consome/Upstream" liga a linha às demais (coluna
`consome`). Trocar o tipo de uma linha **nunca apaga campo**: o que o nível novo não
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
removidos somem com eles: quem citava a linha removida fica com um `consome` órfão, que
vira nó fantasma. Recriar o nível com o mesmo slug traz tudo de volta.

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

## Vocabulário das relações (`verbos.csv`)

Uma célula da coluna `consome` pode trazer um **prefixo de verbo** —
`envia:rar-grupo` —, e é ele que diz QUAL relação a linha está declarando.
Célula **sem prefixo vale `consome`**, que é o que mantém todo catálogo já
escrito valendo o que valia: uma referência de sempre continua gravada como
`rar-grupo`, byte a byte.

O vocabulário vive num terceiro arquivo, ao lado do `catalogo.csv` e do
`niveis.csv`, com quatro colunas:

```
titulo;slug;sentido;seta
Consome;consome;montante;sim
Acessa;acessa;montante;sim
Envia;envia;jusante;sim
Associado;associado;ambos;nao
Relaciona;relaciona;nenhum;nao
```

**O arquivo não vem no repositório.** Esses cinco são os **embutidos**, e valem
enquanto o `verbos.csv` não existir — que é o estado normal. Ele nasce na
primeira gravação (`POST /api/verbos`, ou a mesma gravação feita pelo navegador
no modo arquivo local), sempre pelo serializador, **nunca à mão**.

Ao contrário do `niveis.csv`, aqui não há modo legado × explícito: **ausente ou
vazio = os embutidos; presente = a lista COMPLETA** — embutido que não estiver
listado está removido. O único que nunca sai é o `consome`, e a gravação recusa
a lista sem ele: é o significado de toda célula sem prefixo. Remover um verbo
**em uso** por alguma referência também é recusado, com a lista de quem o usa.

- **`slug`** é a chave, como nos níveis: vazio = derivar do título (`Envia` →
  `envia`); preenchido = esta linha *é* aquele verbo, com o título que ela
  disser. Renomear "Envia" para "Manda" **não reescreve nenhuma célula do
  `catalogo.csv`**.
- **`sentido`** (`montante` | `jusante` | `ambos` | `nenhum`; vazio = `montante`)
  responde *"a linhagem sobe, desce, faz os dois ou ignora?"*.
- **`seta`** (`sim`/`nao`; vazia = `sim`) responde *"a aresta desenha ponta?"*.

Os dois são eixos **independentes**, e é de propósito: "Associado" não tem ponta
e mesmo assim carrega o dado — sem ponta ≠ fora da linhagem. A ponta, quando
existe, aponta sempre para o **alvo declarado**; quem lê o `sentido` é a
travessia, nunca o desenho.

Um prefixo com cara de verbo (`transp:`) que **não** está cadastrado não vira
`consome` calado: a célula inteira vira o nome do alvo (um fantasma com
dois-pontos no nome, feio de propósito) e o build avisa citando o prefixo — o
buraco aparece no mapa, e cadastrar o verbo depois conserta retroativamente. Um
componente chamado `RAR: 12 meses` continua resolvendo inteiro, porque só conta
como prefixo o que casa `minúsculas-e-dígitos:`.

### Visão limpa: "Mostrar ligações"

O checkbox **Mostrar ligações** (na barra de foco e no painel de filtros) esconde todas
as setas do grafo, deixando só os nós — útil quando o mapa inteiro está na tela. O
destaque continua valendo: ao passar o mouse, fixar um nó com o clique ou abrir o balão
com o botão direito, as ligações **daquele** componente reaparecem (na vista de níveis, a
cadeia inteira dele). Companheiro do **Mostrar níveis**, que esconde as faixas.

### Alcance do foco: até onde a vista vai

Focar num componente sempre mostrou a **cadeia montante** dele e nada mais — e isso
escondia metade do que ele declara. Um Job que `envia` para uma tabela é a **origem**
daquela aresta, e a travessia montante (que num verbo `jusante` sobe da ponta para a
origem) nunca chega ao alvo: focar no Job trazia só o que ele consome. O alcance é a
resposta — em vez de uma constante, um controle de três posições na barra de foco, válido
na vista **Níveis**:

| Posição | O que entra na vista |
| --- | --- |
| **Montante** | a cadeia de que o componente depende, recursiva — o comportamento de sempre |
| **+ Vizinhos** *(padrão)* | o montante inteiro **mais** todo vizinho de primeiro nível, em qualquer sentido |
| **Dois sentidos** | montante e jusante, os dois recursivos |

As três são uma **escada**: cada posição contém a anterior. É por isso que "Dois sentidos"
também traz os vizinhos diretos — sem isso, andar para a direita esconderia justamente o
vizinho ligado por um verbo de sentido `nenhum`, e um alcance que tira coisa ao ser
aumentado não se explicaria. O padrão é **+ Vizinhos**: é ele que mostra tudo que o
componente declara sem abrir o mapa inteiro.

O alcance vai para a URL (`?alcance=`), junto de `?foco=` e `?vista=` — o link reproduz o
que está na tela. A **linhagem do balão não muda**: ela continua sendo a cadeia montante,
que é a leitura certa para "de onde vem este dado".

### Filtrar por tipo de ligação

Ao lado do "Mostrar ligações", um **chip por verbo** do vocabulário (`Consome`, `Acessa`,
`Envia`… — a lista vem do bloco `verbos`, então verbo cadastrado em **⇢ Verbos** ganha
chip sozinho). Chip aceso = aquelas arestas aparecem; apagado = somem do mapa.

Os **nós continuam onde estão**: esconder um tipo de ligação não esconde quem ela liga.
E o chip vence o destaque — com "Envia" apagado, nem a aresta do nó sob o cursor volta,
senão o hover ressuscitaria justamente o que se acabou de tirar da tela. É estado de
sessão, como o próprio "Mostrar ligações": não vai para a URL nem para o CSV.

### Excluir um componente

Há dois caminhos, com a **mesma** confirmação: ela nomeia o componente e lista o que sai
junto — a linha e **cada menção a ela** na coluna que gera aresta (`Consome/Upstream`).
Limpar as menções é o ponto: sem isso, quem consumia o componente ficaria
apontando para um nó fantasma. (Wikilink em `observacoes` não gera aresta e não é mexido.)

- **Pelo formulário**: o **✎ Editar** de uma linha já cadastrada traz o botão **🗑
  Excluir**. O primeiro clique mostra o painel de confirmação, o segundo grava.
- **Pelo teclado**: `Delete` (ou `Backspace`) com um componente em evidência no mapa abre a
  mesma confirmação dentro do balão dele; **`Enter` confirma** e **`Esc` cancela**. Ver
  [Navegação](#navegação) para as regras de quando a tecla vale.

A exclusão não tem desfazer no app — o histórico do Git guarda a versão anterior do
`catalogo.csv`.

## Eixos visuais do grafo

Cada eixo diz uma coisa só, e nenhum depende do outro — é o que deixa ler quatro
atributos de um componente sem clicar nele.

| Eixo | O que diz | Onde mora |
|---|---|---|
| **Coluna** | o `nivel` do componente | vista em níveis (`lineage.ts`) |
| **Cor do preenchimento** | o `debito` técnico | `src/components/palette.ts` |
| **Forma** | `produto_de_dados` | `src/components/shapes.ts` |
| **Ícone interno** | o `tipo_componente` | `src/components/shapes.ts` |

**Cor**, por ordem de precedência:

1. nó fantasma → **cinza escuro** `#5A5A5A` (sem preenchimento sólido)
2. `debito: sim` → **vermelho** `#CC092F`
3. `debito: avaliar` (ou não declarado) → **cinza** `#8A8A8A`
4. nome ou descrição citando "legado"/"on-premise"/"planilha" → **âmbar** `#B8860B`
5. default (curado/governado) → **verde** `#3A7D44`

**Forma** = `produto_de_dados`: **losango** quando é produto de dados, **círculo** para
todo o resto. A forma é o canal que se enxerga de longe, no mapa inteiro, sem ler nada —
por isso ela ficou com a leitura de reunião ("o que, disto tudo, é produto?") e não com o
tipo de componente. O losango tem **pontas** em cima, embaixo e nos dois lados: não é uma
variação do círculo, é a silhueta girada 45°, e por isso continua reconhecível no nó
pequeno. Ele é maior que o círculo em **toda** direção (a ponta chega a 1.45 do raio, e
mesmo o ponto mais apertado, no meio da aresta, fica em 1.025) — a marca nunca lê como
"um nó comum encolhido". Mas o degrau de **tamanho** é modesto de propósito, ~1.34 do
círculo em área: tamanho quer dizer grau de conexões mais o ajuste manual da sessão, e não
a bandeira. O **halo** branco de seleção é sempre um círculo, mais fino e por fora de tudo,
então os dois nunca se confundem; e a borda tracejada de nó incompleto corre **sobre** a
silhueta, acompanhando as quatro arestas — as duas leituras convivem no mesmo nó, porque o
tracejado pode comer um pedaço de aresta e as quatro pontas continuam apontando.

**Rótulo em negrito** = `produto_de_dados`, o *segundo* canal da mesma bandeira. O nome do
componente é desenhado em tamanho de tela, então é a única marca do nó que não encolhe com
o zoom: quando o mapa inteiro cabe na janela e os nós viram pontos de poucos pixels,
nenhuma silhueta se lê mais e o texto ainda se lê. O negrito atravessa esse piso. Não há
marcador (◆, ●) antes do nome — no zoom afastado ele viraria mais um ponto grudado na
primeira letra, deslocaria o nome do eixo do nó e dependeria de um glifo que a fonte da
máquina pode não ter; o negrito engrossa todo traço da palavra e não depende de caractere
nenhum. O esmaecimento de foco é ortogonal: um produto fora do destaque esmaece como
qualquer nó, mas esmaece em negrito.

> As duas tentativas anteriores de marcar a bandeira falharam em tela e valem como
> registro: o **anel externo** era a marca mais fraca do nó carregando a informação mais
> importante; o **octógono** tinha só 8% de variação entre a aresta e o vértice e lia como
> círculo no zoom de trabalho, além de perder os cantos justamente sob a borda tracejada de
> "incompleto" — só funcionava inflado a 1.5 do raio, e aí quem destacava era o tamanho.

**Ícone interno** = `tipo_componente`, um glifo claro desenhado dentro do nó: **grade 2×2**
= `Tabela SQL` (tabela: linhas *e* colunas), **tijolos** empilhados = `Tabela Delta`
(alusão ao logo do Databricks), **"X"** = `Excel`, e `Default` **sem ícone** — nó liso é
tipo não declarado, que é o caso mais comum do catálogo. Onde a tecnologia tem marca, o
glifo é a marca; onde não tem, é o objeto. As três famílias de traço (blocos ortogonais,
barras inclinadas, diagonais cruzadas) são deliberadamente diferentes entre si, porque é
o que sobrevive ao tamanho pequeno. O ícone só é desenhado quando o nó tem **raio
suficiente na tela** (8 px); abaixo disso ele some — o tipo continua no balão e na tabela.

Marcas sobre a silhueta, independentes de tudo acima:

- **Borda branca tracejada** = `owner` ou `centro_de_custo` vazio (nó incompleto —
  é o que a reunião de governança precisa enxergar).
- **Contorno cinza tracejado sem preenchimento** = nó fantasma: citado na coluna
  `consome`, mas ainda sem linha no catálogo.
- **Halo branco externo** = seleção, hover ou destaque fixado pelo clique (temporário).

Tamanho do nó é proporcional ao número de conexões; um componente recém-cadastrado, ainda
sem aresta, nasce do tamanho dos pares em vez de encolhido no raio mínimo.

## Estrutura do projeto

```
catalogo.csv                # conteúdo: a planilha do catálogo (uma linha por componente)
niveis.csv                  # níveis da cadeia (titulo;ordem;slug;cor_fundo;cor_borda) — vazio = só os padrão
verbos.csv                  # vocabulário das relações (titulo;slug;sentido;seta) — AUSENTE = só os embutidos
scripts/
  build-graph.ts            # CLI: lê os três CSVs e emite src/data/graph.json
  graph-lib.ts              # lógica pura do build (parser CSV, níveis, montagem do grafo)
  graph-lib.test.ts         # testes do build (npm test)
  niveis.test.ts            # testes dos níveis dinâmicos
  verbos.test.ts            # testes do vocabulário de verbos e da leitura das células
  catalogo-serde.test.ts    # testes do round-trip CSV e da validação da API
  vite-plugin-catalogo.ts   # API do dev server: /api/catalogo, /api/niveis e /api/verbos (grava os CSVs)
src/
  data/graph.json           # GERADO pelo build — não editar à mão (mas é commitado)
  components/
    Graph.tsx               # canvas do grafo (react-force-graph-2d)
    NodeBalloon.tsx         # balão de detalhe ancorado no nó selecionado
    Filters.tsx             # domínio, débito, nível, "somente sem owner", camada de linhagem, contadores
    FocusBar.tsx            # barra do modo foco: breadcrumb, vista (níveis/força), alcance, chips por verbo, sair
    lineage.ts              # vista de linhagem em níveis: cadeia montante, alcance do foco + layout em colunas
    arestas-visiveis.ts     # quais arestas o mapa desenha: "Mostrar ligações" + chips por verbo
    SearchBox.tsx           # busca por nome/descrição
    TableView.tsx           # visão de tabela dos dados (aba "Tabela")
    table-utils.ts          # helpers puros da tabela: filtro, ordenação, agrupamento
    Legend.tsx              # legenda fixa de cores/bordas
    Markdown.tsx            # renderizador mínimo do texto de observações
    palette.ts              # fonte única das cores dos nós (semântica de débito)
    band-colors.ts          # cor da faixa de cada nível: o alpha que a cor escolhida recebe
    graph-types.ts          # tipos do schema + wrapper tipado da lib de grafo
    catalog-api.ts          # cliente da API do dev server (/api/catalogo, /api/niveis, /api/verbos)
    catalog-store.ts        # interface de persistência + store HTTP (o modo de sempre)
    catalog-store-local.ts  # store que grava CSV sem servidor: valida, grava, remonta o grafo
    catalog-delete.ts       # exclusão pura: tira a linha (pelo id) e as menções a ela
    DeleteConfirm.tsx       # painel de confirmação da exclusão (formulário e atalho de teclado)
    delete-shortcut.ts      # regras do atalho Delete/Backspace: qual componente e quando vale
    fs-access.ts            # File System Access: escolher pasta, ler/gravar os três CSVs, lembrar o handle
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
  a raiz aparece ligada aos domínios e estes aos produtos finais. A URL só ganha
  `?foco=` quando o estado difere
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
  "Ver mapa completo" para sair (`Esc` sai em estágios: cancela a exclusão pendente, fecha
  o formulário, fecha o balão, depois desfixa o destaque, depois sai do foco). O clique
  esquerdo simples, também no foco, só fixa o destaque — os detalhes ficam no botão direito.
- **`Delete` (ou `Backspace`)** com um componente **em evidência** — o do balão aberto e,
  na falta dele, o fixado pelo clique — pede a **exclusão** dele: o balão abre junto com a
  confirmação (nome + as menções que saem junto, ver [Excluir um
  componente](#excluir-um-componente)), `Enter` grava e `Esc` cancela. A tecla só age
  **onde ela não atrapalha nada**: fica quieta enquanto o cursor está num campo de texto
  (aí ela apaga texto, como sempre), com o formulário, o modal de níveis ou a aba Tabela
  abertos, no modo somente leitura e em componente **fantasma** (citado, sem linha própria
  no catálogo — não há o que excluir).
  O foco tem duas vistas, no switch da barra:
  - **Níveis** (padrão): a linhagem montante **completa** do nó focado, lida da
    **esquerda para a direita** — o focado na extrema esquerda e a cadeia se abrindo à
    direita: produto → insumos → fontes → origens (focar Setorização a põe à esquerda,
    com as origens na última coluna à direita; focar a raiz ou um domínio abre o
    portfólio inteiro). Fonte ou origem ainda desconhecida ("a confirmar",
    "a identificar"…) aparece como **placeholder cinza tracejado**, para a cadeia sempre
    mostrar o nível. Passar o mouse destaca a cadeia inteira do nó.
  - **Força**: a vizinhança em grafo de força, com slider de **profundidade** (1–3).
- O toggle **"Fontes e origens"** liga a camada de linhagem: além dos dados, aparecem os
  **sistemas** e as **origens** derivados do
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
  `?foco=rar-12m&vista=niveis&alcance=vizinhos` abre o foco na vista de níveis com o
  alcance escolhido, `?foco=rar-12m&vista=forca&prof=2` na vista de força com a
  profundidade escolhida e `?aba=tabela` abre direto na tabela. Cada vista leva só o seu
  regulador de amplitude (`&prof=` na de força, `&alcance=` na de níveis); link antigo sem
  `&alcance=` abre no padrão **+ Vizinhos**.
- O toggle **"Somente sem owner"** nos filtros acende os nós sem responsável definido, e
  o **"Somente produtos de dados"** acende só os losangos
  (`produto_de_dados: sim`) — a leitura de reunião "o que, disto tudo, é produto?".
  Ambos esmaecem o resto em vez de escondê-lo: o contexto continua na tela.
