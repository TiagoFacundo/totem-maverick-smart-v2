# Validação Visual — Totem Maverick

## Critérios avaliados

| Dimensão | Resultado | Avaliação registrada |
|---|---|---|
| 1280 × 720, quiosque horizontal | Aprovado | A área de decisão fica em duas colunas: instruções, autenticação e contexto à esquerda; QR Code com contraste alto à direita. O status e a parada de emergência permanecem visíveis no cabeçalho. |
| 886 × 1949, referência de totem vertical | Aprovado | O conteúdo se reorganiza em coluna, preservando a leitura sequencial de marca, instrução, autenticação e QR Code sem sobreposição. |
| 375 × 812, viewport compacto | Aprovado | A marca, o título, a explicação e os CTAs são legíveis. O CTA primário de leitura de QR ocupa linha própria, enquanto Face ID e PIN se distribuem em seguida. O QR Code permanece dentro do cartão, com margem lateral adequada, sem cortes ou rolagem horizontal. |

## Conclusão de revisão

O layout compacto preserva hierarquia, legibilidade e prioridade operacional: o botão dourado conduz à leitura do QR da Wallet, os fluxos alternativos continuam acessíveis e o QR exibido na tela possui contraste suficiente para leitura. O rodapé foi mantido deliberadamente discreto por conter apenas identificação técnica da torneira e do totem; não compete com a ação principal. Não foram identificados problemas de overflow, CTAs ocultos ou conflito entre os elementos do cabeçalho e o conteúdo em nenhuma das dimensões verificadas.

## Revisão da reconstrução baseada na referência

No viewport vertical de 7 polegadas, a tela inicial reconstruída reproduz a organização de referência: marca compacta, produto e estilo centralizados, ficha de marca, métricas em grade, PDV, QR Code central e ações laterais. O estado de Face ID preserva o padrão minimalista de título, círculo de captura e única ação de cancelar. Após a resposta de Face ID, a confirmação segura mantém o mesmo fundo e tipografia compacta, com um único controle de pressionar e segurar antes da autorização. Todos os controles examinados nesta revisão respeitam a altura mínima de 48 pixels.

O estado de sessão ativa também foi revisado. Ele mantém a composição central de referência: rótulo de sessão ativa, título de dispensação, identificador curto da sessão, dois cartões de volume e valor, limite autorizado, ação de encerramento e indicação discreta de fluxo. O estado continua consumindo o comando operacional por polling, mas não expõe essa complexidade na experiência de autoatendimento.

Após o encerramento, a tela de conclusão apresenta confirmação visual, texto curto de agradecimento, cartões de volume servido e total debitado, sem uma ação adicional que distraia o cliente. O retorno automático à tela inicial ocorreu após quatro segundos, restaurando um novo QR Code e o contador de validade.

A tela de compra com cartão foi conferida com três campos verticalmente organizados — nome, CPF e data de nascimento — e ações de cancelar e continuar em uma linha inferior. Os campos, botões e espaçamentos permanecem adequados ao toque em 7 polegadas; o botão de continuar fica desabilitado até que o cadastro mínimo esteja preenchido.

Na revisão do evento de perda de conectividade em `idle`, foi identificado que o fluxo permanecia corretamente bloqueado para novas operações, mas o indicador visual não refletia a indisponibilidade. A interface passou a manter o estado de conectividade separado do estado de sessão, exibindo o ícone offline também durante a tela inicial, sem forçar o cliente para uma tela de erro antes de iniciar uma compra.

A correção foi verificada em execução: após o evento offline, o ícone de conectividade no cabeçalho mudou de verde para o estado visual de indisponibilidade, enquanto a tela `idle` e o QR Code permaneceram visíveis para não interromper a informação ao cliente.
