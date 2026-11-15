# Regras de cálculo (v0.16)

O app usa regras do mercado de transporte dos EUA (2026). Cada regra pode ser ligada, desligada ou ajustada.

## Estrutura
- **Carreira**:
  - **Motorista**: dados pessoais, experiência, status migratório, registro de segurança e histórico de empresas.
  - **Contrato**: o ativo (editável) e os anteriores.
  - **Empresas**: lista usada como opção nos contratos.
- **Contrato**:
  - **Vínculo**: empresa, classificação (5, fixas), operação, início, caminhão, trailer e renome.
  - **Condições**: remuneração, extras, bônus da empresa, quem paga cada despesa, benefícios e per diem, custos do caminhão.
  - O tipo fiscal sai da classificação: Company Driver é W-2; as demais são 1099.
- **Ajustes** (regras gerais): início e contas fixas, frete de mercado, bônus das viagens, custos de vida, impostos, viagens de carro, pay lag, jornada, calendário e cidades, tipos de operação, dados.
- **Regras efetivas** = Ajustes + condições do contrato ativo (`effSettings`).

## Tipos de operação (padrão americano)
- **Local (Day Cab)**: volta para casa todo dia; pode usar a isenção de curta distância.
- **Regional**: fica fora alguns dias; regras completas de jornada.
- **Dedicated**: rota fixa para um cliente; regras completas.
- **OTR / Long Haul (Sleeper Cab)**: semanas na estrada; per diem ligado pelo padrão.

## Início e contas fixas
- **Nova carreira**: assistente com nome, empresa, classificação, operação, dia do jogo e saldo inicial.
- **Contas fixas pelo calendário**: no dia escolhido de cada semana saem, se houver, a parcela do caminhão e as licenças, mesmo sem salário. O fechamento não cobra de novo.
- **Aluguel (v0.22)**: a moradia não sai sozinha do saldo. Cada semana do calendário tem um aluguel (Ajustes › Custos de vida › Moradia) que vence no dia das contas fixas; depois desse dia, fica em atraso. O jogador paga na aba Vida, e cada pagamento quita a semana mais antiga em aberto. Ao atualizar uma carreira antiga, as semanas já cobradas contam como pagas. O DRE da semana continua mostrando a moradia como custo; as "Despesas da semana" do fechamento não a incluem.
- **Extrato detalhado (v0.22)**: cada lançamento guarda a conta que chega no total (holerite: salário, comissão, bônus e cada imposto; despesas: combustível, pedágios, refeições com quantidade × preço, hotel, multas, danos e custos do caminhão; aluguel; viagens de carro). Se as linhas não somam o total, aparece a diferença com o motivo (ex.: contas já cobradas pelo calendário).
- **Empréstimo**: parcela mensal (30 dias) ou semanal.
  - Juros = saldo × taxa mensal (semanal = taxa × 7/30).
  - Parcela paga = mín(parcela, saldo + juros). Quitado, desliga sozinho.

## Viagens
- **Caminhão**: grava no lançamento o contrato, quem paga cada despesa e o frete de mercado. Mudanças posteriores só valem para viagens novas.
- **Carro** (fora do contrato):
  - **Emprestado**: 35% de (frete do jogo × 0,40). O dono paga combustível, pedágio e danos.
  - **Próprio**: 100% de (frete do jogo × 0,40) − $0,50/mi − combustível, pedágio, danos, multas e despesas pessoais.

## Predefinições por classificação
- **W-2**:
  - A empresa paga combustível, pedágio e hotel.
  - O motorista paga as multas e a franquia de $1.000.
  - Plano de saúde de $45/semana e bônus de segurança.
- **Lease / Owner / Autoridade / Frota**:
  - O motorista paga tudo.
  - Percentual do frete: 70% / 75% / 100% / 100%.
  - Custos do caminhão ligados.

## Forma de pagamento
- **Fixo semanal**: $1.300 + 5% do frete de mercado. Proporcional aos dias quando a semana mistura contratos.
- **Por hora**: horas × $26 (até 10h/dia e 50h/semana) + 5%. Hora extra opcional (motoristas são isentos pela FLSA).
- **CPM**: milhas × $0,55 + detention ($20/h após 2h) + stop pay ($50).
- **Percentual**: % do frete de mercado.
- Mínimo garantido opcional. Extras: layover ($150/dia), breakdown ($20/h) e lona ($75).

## Frete de mercado (caminhão)
Frete do jogo × 0,10, ou milhas × $/mi.

## Impostos e descontos
- **W-2 (retido no contracheque)**:
  - FICA de 7,65% sobre (bruto − per diem − plano de saúde).
  - IR federal pela tabela de 2026, anualizado (dedução padrão de $16.100 solteiro ou $32.200 casado).
  - Imposto estadual: 0% (Nevada).
- **1099 (reserva semanal do imposto estimado)**:
  - Lucro do negócio = receita − combustível, pedágios, danos e custos do caminhão − 80% do per diem.
  - Self-employment tax = 15,3% × 92,35% do lucro. Plano de saúde e 401(k) não reduzem esse imposto.
  - IR federal sobre (lucro − metade do SE − plano de saúde − 401(k)), com a dedução QBI de 20% (Section 199A).
  - Na vida real nada é retido: o autônomo paga o imposto estimado a cada trimestre. O app separa a reserva toda semana.
- Per diem de $80 por noite fora, isento.

## Pagamento
- O holerite (W-2) ou acerto/settlement (1099) deposita o líquido no dia do pagamento.
- **Período do holerite (v0.22)**: vai do início da semana até o dia em que você fecha, no máximo 7 dias. Fechar antes do fim (ex.: na sexta) não muda o dia do jogo: o período novo começa no dia seguinte (sábado), e o que for lançado no fim de semana entra no próximo holerite. A partir daí os períodos seguem de 7 em 7 dias (sábado a sexta). Contas fixas descontadas no fechamento: as cobradas pelo calendário dentro do período.
- **Pay lag**: semana do calendário em que o período termina + 7 × semanas de atraso + dia da semana do pagamento (padrão: sexta, 1 semana). Fechando na sexta, o holerite cai na sexta seguinte.
- No fechamento saem do saldo as despesas de viagem, os custos por milha e as contas fixas ainda não cobradas.
- **Bônus de segurança**: $300 a cada 13 semanas sem multa, dano ou infração de jornada.

## Jornada (FMCSA), infrações e fiscalização
- **Infrações** (alerta vermelho):
  - mais de 11h de direção no dia;
  - mais de 14h de jornada;
  - mais de 8h de direção sem pausa de 30 min (exceto dentro da isenção local);
  - ciclo de 70h/8 dias (ou 60h/7) estourado.
- **Restart de 34h**: um dia inteiro sem viagem de caminhão zera a contagem do ciclo (opção em Ajustes).
- **Aviso** (amarelo): viagem fora do raio local de 150 mi aéreas (~172 mi de estrada). Não é infração, mas a isenção cai naquele dia e a pausa de 30 min passa a ser exigida.
- **Consequências** (ligadas por padrão):
  - Qualquer infração zera o bônus de segurança.
  - No fechamento, cada infração tem 25% de chance de ser pega numa fiscalização, com multa de $1.000.
  - Todas ficam no registro de segurança por 8 semanas. Com 3 ou mais, o motorista aparece "em risco".
- As regras federais de 2026 continuam as mesmas; os programas-piloto de flexibilização só começam em 2027 e valem para poucos motoristas inscritos.

## Planilha (.xlsx)
- O app lê e escreve o modelo da planilha Carreira Realista ATS, com as 9 abas originais, as mesmas colunas, listas, cores e fórmulas.
- **Importar** lê:
  - *Motorista & Carreira*: motorista, saldo, empréstimo, classificação, forma de pagamento, operação, horas, valor, comissão, empresa, renome, caminhão e trailer.
  - *Config*: refeições, hotel, moradia e percentual do carro emprestado. *Parametros*: cidades.
  - *Diário de bordo*, *Historico de fretes* e *Diário de bordo carro*: as viagens. Linhas "Final de semana" e linhas vazias são ignoradas.
  - *Histórioco holerite*: quais semanas já foram pagas.
- O dia atual do jogo passa a ser o dia da última viagem (a planilha não guarda esse dado).
- Qualquer erro de conversão mostra a lista com aba, linha e coluna, e nada é alterado.
- A importação recalcula salário, impostos e despesas com as regras do app e mantém o saldo informado.
- **Exportar** preenche o modelo: semana em aberto no Diário de bordo, semanas fechadas no Historico de fretes (com "Final de semana" entre elas), viagens de carro, holerites e pay lag. As abas Dashboard continuam com as fórmulas da planilha.
- Limites da exportação: multas e danos saem somados numa coluna; horas de direção e de serviço não têm coluna no modelo; classificações e formas de pagamento que não existem nas listas da planilha (Lease, Frota, Percentual) saem com o nome do app.
- Avaliações de entrega: as mesmas 8 do jogo e da planilha (Excelente, Bom trabalho, Satisfatório, Razoável, Tolerável, Danificado, Imprudente, Atrasado).

## Dados
Formato e limites em `esquema-de-dados.md`.
