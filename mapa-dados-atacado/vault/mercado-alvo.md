---
id: mercado-alvo
nome: Mercado Alvo
tipo: insumo
nivel: primario
dominio: Mercado
origem: "base comercial legada"
sistema: "banco SQL legado (on-premise)"
fontes_secundarias: ["Mercado Alvo Semanal - UCS", "Mercado Alvo Mensal - UCS"]
descricao: "lista de clientes-alvo da atuação"
centro_de_custo: null
owner: null
debito: sim
status: producao
---
Lista de clientes-alvo que delimita onde o Atacado atua e prioriza a prospecção comercial. Vive em um banco SQL legado on-premise, o que caracteriza o débito técnico: o dado é vivo, mas a rota precisa migrar para a plataforma corporativa.
