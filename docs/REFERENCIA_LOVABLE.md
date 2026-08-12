# Referência Visual — flow-wise-tap.lovable.app

## Tela inicial observada

| Área | Padrão observado |
|---|---|
| Fundo | Fundo liso verde-petróleo muito escuro, sem textura aparente e com foco total no conteúdo funcional. |
| Cabeçalho | Ícone de conectividade no canto superior direito; marca Maverick pequena, centralizada no topo. |
| Produto | Bloco central com rótulo `MAVERICK SMART TAP`, título `Heineken Lager` e subtítulo `Lager Pilsen`. |
| Card da marca | Card horizontal arredondado, logo da Heineken à esquerda, rótulo `Marca`, nome e ícone de copo/torneira à direita. |
| Métricas | Grade de cartões em duas colunas para preço por litro, preço por 100 ml, ABV e IBU; cartão PDV em largura total. |
| Autorização | QR Code central com moldura verde; contador de atualização; ações inferiores `USAR FACE ID`, `COMPRAR COM CARTÃO` e simulação de escaneamento para desenvolvimento. |
| Rodapé | Identificação técnica discreta com nome do produto, `TOTEM_001` e `TORNEIRA_01`. |

## Direção para 7 polegadas verticais

A reconstrução deve conservar a prioridade de informação da referência, mas transformar a composição panorâmica em uma coluna vertical compacta: marca pequena, produto, card de marca, métricas em grade 2×2, QR Code, ações grandes e rodapé técnico. As telas devem evitar enfeites que reduzam a área disponível para toque e leitura em display de 7 polegadas.

## Tela Face ID observada

A tela de captura facial troca a área de produto por um único fluxo centralizado: logo Maverick no topo, rótulo `FACE ID`, título `Captura facial`, círculo luminoso grande com ícone facial, instrução de posicionamento e botão vermelho de cancelar. Não há cards laterais ou textos adicionais. Para a versão vertical de 7 polegadas, este padrão deve ocupar o centro da tela e manter uma área de câmera ampla, com o botão de cancelamento ao alcance do polegar.

## Autorização e sessão ativa observadas

O fluxo de demonstração mostra inicialmente apenas um indicador circular turquesa e os textos `Aguardando autorização` e `Validando saldo na sua Wallet...`. Em seguida, a referência entra em `Sessão ativa` e apresenta `Servindo seu chopp`, o identificador de sessão, volume servido, total acumulado, limite autorizado, ação vermelha `Encerrar agora` e o indicador `Fluxo ativo`. A implementação vertical deve usar esta sequência minimalista para os estados `authorized`, `pouring` e `finishing`, sem inserir elementos decorativos que não existam na referência.

## Encerramento observado

A conclusão mantém o mesmo fundo escuro e concentra o feedback no centro: círculo turquesa com confirmação, título `Sessão encerrada`, texto `Aproveite seu chopp!`, dois cartões compactos para `Volume servido` e `Total debitado`, além da mensagem de retorno automático para a tela inicial. Esta organização deve ser reproduzida sem introduzir um botão de nova compra, pois o comportamento de referência é temporizado.

## Compra com cartão observada

O acesso `COMPRAR COM CARTÃO` abre uma tela de coleta de dados igualmente minimalista: marca pequena no topo, rótulo `COMPRA COM CARTÃO`, título `Seus dados`, três campos lineares para nome completo, CPF e data de nascimento, e botões secundário `Cancelar` e primário `Continuar`. Para a réplica do totem, esta tela será mantida como fluxo de cadastro e preparação de pagamento, sem simular ou processar dados de cartão no navegador.
