# Retomar o trabalho

Documento de passagem entre sessões. Para continuar, comece com:

> Leia `mapa-dados-atacado/docs/CONTINUAR.md` e confirme o estado atual antes de
> propor qualquer coisa.

O que está escrito aqui era verdade quando o documento foi salvo — **confirme
antes de confiar**, porque o catálogo é editado pelo app e o código pode ter
avançado:

```bash
cd mapa-dados-atacado
git log --oneline -5      # último commit conhecido: a29b0e8
git status --short        # o que ficou sem commitar
npm test && npx tsc -b --noEmit
npm run data              # contagens e avisos do catálogo
```

## O que é

MVP de um mapa de dados navegável (estilo grafo do Obsidian) da Diretoria
Comercial Atacado de um banco. O objetivo é validar com o negócio a experiência
de navegar o mapa e **tornar visível o gap de governança** — quem é dono de cada
dado, o que tem débito técnico, o que vem de onde.

Repositório: `experienceitlit-netizen/mocks` (remoto `origin`, push liberado).
O app vive em `mapa-dados-atacado/`; `entregas/` guarda os pacotes distribuíveis.

## Modelo (não rediscuta sem motivo)

Estas decisões foram tomadas com o usuário ao longo de várias rodadas, algumas
revertendo o desenho anterior. Vieram de discussão, não de conveniência técnica:

- **Todo nó é um COMPONENTE que pertence a um NÍVEL.** Não existe "produto",
  "insumo", "raiz" ou "domínio" como categoria especial no código — o que
  classifica um nó é o nível dele. Raiz e Domínio são níveis como Gold e Silver.
- **Nada é inferido.** Todo nó vem de uma linha do catálogo; toda aresta vem de
  uma coluna (`consome` ou `associacoes`). O build não deriva nós de campos nem
  cria ligações automáticas — isso já existiu e foi removido a pedido.
- **Níveis são livres**: qualquer um pode ser criado, renomeado, reordenado,
  colorido e removido (removê-lo é recusado enquanto houver componentes nele).
  O código não conhece "bronze" ou "prata" — a semântica é do usuário.
- **Quatro eixos visuais independentes**: a coluna diz o nível, a cor diz o
  débito técnico, a bandeira de produto de dados diz-se em DOIS canais (losango ×
  círculo, e o rótulo em negrito × normal — a forma some no zoom afastado, o
  texto não) e o ícone interno diz o tipo de componente (Tabela
  SQL/Delta/Excel/Default). O **tamanho** não é eixo de dado: ele é grau de
  conexões mais o ajuste manual da sessão.
- **O CSV precisa continuar legível** para quem abre na planilha. Foi o que
  descartou identificadores opacos (uuid) quando surgiu a necessidade de chave
  estável.

## Como os dados vivem

`catalogo.csv` (uma linha por componente) e `niveis.csv` na raiz do projeto →
`scripts/graph-lib.ts` (funções **puras**, sem I/O) → `src/data/graph.json` →
front-end. O `graph-lib` roda tanto no Node (CLI `npm run data`) quanto no
navegador — é o que permite o pacote HTML gerar o grafo sozinho.

Edição pelo app, em três modos escolhidos por detecção automática:

| Modo | Quando | Grava em |
| --- | --- | --- |
| dev server | `npm run dev` | os CSVs do projeto, via `/api/catalogo` |
| arquivo local | pacote HTML + "Abrir catálogo" | os CSVs da pasta escolhida |
| somente leitura | sem os dois | nada |

## Estado ao salvar este documento

Último commit: `8384d27` (pacote de demonstração regerado). **Tudo abaixo está no
worktree SEM COMMIT, verde** (347 testes, tsc e build limpos) — o usuário ainda
não deu o aval:

- **Flag `produto_de_dados`** (coluna no CSV, campo no formulário, filtro
  "Somente produtos de dados", chip no balão). O destaque visual custou três
  tentativas: anel externo (discreto demais) → octógono (oito lados leem como
  círculo, e a borda tracejada de `incompleto` disfarça os cantos) → **losango +
  rótulo em negrito**, que é o que está valendo. Lição: no zoom de trabalho só
  cor e silhueta grosseira sobrevivem; valide sempre no zoom real, não ampliado.
- **Tipo de componente virou ÍCONE INTERNO** (grade = Tabela SQL, tijolos =
  Tabela Delta, "X" = Excel, Default sem ícone), liberando a forma para a flag.
- **Redimensionar por arraste, só na sessão** (nada persiste): a borda do NÓ
  ajusta o componente (0.5×–3×, `src/components/node-resize.ts`) e a borda da
  FAIXA ajusta a largura da coluna, deslocando as seguintes (0.6×–2.5×,
  `band-resize.ts`). Duplo clique na borda restaura.
- **Largura padrão das faixas reduzida a 70%** (BAND_W 190→133 e NIVEIS_COL_X
  250→193, para o corredor de 60 entre faixas não crescer): as sete colunas
  cabem na tela sem pan lateral.
- **Rótulo escala com o zoom** entre 10px e 26px de tela: fixo em 10px ele
  "encolhia" ao ampliar, porque o nó crescia e o texto não.
- **Filtros e legenda recolhíveis**, com a preferência no navegador.

Dados: o catálogo está pequeno (~13 componentes) porque o usuário vem testando
exclusão e cadastro; o estado cheio (79) está no commit `81c1666`. Dois
componentes podem estar marcados como produto de dados — foram marcados para
demonstrar o losango.

## Como o usuário trabalha

- **Não commite sem o aval dele.** O fluxo é: implementar → verificar →
  apresentar o que testar → ele testa no app → ele pede o commit.
- **Verifique no navegador**, não só nos testes. Chrome headless via CDP tem
  sido usado para abrir a página, simular interação e tirar screenshot; vários
  bugs só apareceram assim (o mais comum: com a página **já aberta**, que é como
  ele usa — não recarregada).
- **Ele edita o catálogo enquanto você trabalha.** Nunca use `git checkout` em
  `catalogo.csv`/`niveis.csv`; faça backup por cópia e restaure por cópia. E
  **nunca fixe contagens do catálogo em teste** — use invariantes, senão a suíte
  quebra a cada cadastro dele.
- **Calibre a orquestração**: mudança pequena é edição direta; feature média é um
  agente; só trabalho grande e paralelizável justifica vários agentes.
- Ele testa em português e o código/documentação seguem em pt-BR.

## Pendências registradas

- `FUTURO.md` — itens fora do MVP, com o que já foi parcialmente atendido.
- `docs/ligacao-por-clique.md` — especificação de criar ligações arrastando de um
  componente ao outro no mapa. As decisões pendentes ali são de produto (qual
  relação o gesto cria, direção, desfazer). A ambiguidade de nomes que o
  documento cita deixa de existir com a chave estável.
- Confirmação de exclusão por um segundo Delete foi **descartada** (a
  auto-repetição do teclado excluiria sem o usuário ler o aviso). Se ele voltar
  ao assunto, a saída é aceitar Delete ignorando eventos repetidos e só depois
  de ~400 ms.

## Distribuição

`npm run pacote` gera `entregas/mapa-dados-atacado-demo.zip`: o HTML autocontido
mais uma **cópia** dos CSVs, para a pessoa abrir por duplo clique e editar sem
tocar no catálogo do repositório. Regere sempre que o catálogo mudar — o HTML
carrega os dados embutidos no momento da geração.
