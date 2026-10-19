# IPTV Player NEW — Notas de uso da marca

## Direção principal recomendada

**`icon-source.svg` / `icon-source.png`** — *Frame Play*

Forma de tela/TV moderna com cantos arredondados e um símbolo de play central. É a opção mais direta: lembra imediatamente "player de vídeo/TV" sem depender de texto, escudos, mascotes ou letras.

## Paleta

| Papel | Cor | Hex | Uso |
|-------|-----|-----|-----|
| Cor dominante | Azul elétrico | `#0066FF` | Fundo do ícone, acentos da interface |
| Cor de contraste | Branco | `#FFFFFF` | Símbolo de play, ícones sobre o azul |
| Fundo escuro | Grafite | `#0F1115` | Testes de contraste e tema dark |
| Fundo claro | Neve | `#F5F6F8` | Testes de contraste e tema light |

> O azul elétrico foi escolhido para evitar o vermelho do IPTV Smarters, o laranja do IPTVnator e tons genéricos de streaming. Mantém contraste forte tanto em fundos claros quanto escuros.

## Proporção da placa e área de respiro

- **Tamanho fonte:** 1024 × 1024 px.
- A placa azul ocupa **75% do canvas** (**768 × 768 px**), deixando uma margem de **128 px** em todos os lados.
- Cantos arredondados com `rx = 160 px` (~20,8% da largura da placa).
- **Escolha de 75% vs. 80%:** mantivemos 75% porque é a proporção já aprovada e garante folga confortável para as máscaras arredondadas do Windows em todos os exportes (16–256 px). Avaliamos 80% (819 × 819 px); embora não cortasse a placa, o ganho visual não compensou a redução da margem de segurança.
- Mantenha o ícone sobre fundo transparente sempre que possível.

## Ajustes do glifo ótico (versão corrigida)

- **Altura do play:** o triângulo branco, medido com o contorno (`stroke`), passou de ~46,9% da altura da placa (~360/768 px) para **~57,3%** (**~440/768 px**), dentro da meta de 55–60%.
- **Deslocamento para a direita:** o centroide do triângulo estava aproximadamente **40 px à esquerda** do centro geométrico da placa. Deslocamos o path **+22 px** para a direita (~2,1% do canvas). O centroide corrigido fica aproximadamente **2 px à direita** do centro, neutralizando o peso visual à esquerda.
- **Cor:** `#0066FF` para a placa, `#FFFFFF` para o play. Não usar `#00A3E0` nem `#4F46E5` na identidade principal.

## Exportes e legibilidade

| Uso | Tamanho | Fonte |
|-----|---------|-------|
| Ícone da loja / installer | 1024 × 1024 px | `icon-source.png` |
| Ícone do app (Windows) | 256 × 256 px | redimensionar a partir do SVG fonte |
| Taskbar / Start menu | 32–48 px | variantes SVG próprias (`icon-source-32.svg`, `icon-source-48.svg`) |
| Favicon / tray | 16 × 16 px | variante SVG própria (`icon-source-16.svg`) |

- Os tamanhos **16, 32 e 48 px** são renderizados a partir de **variantes SVG dedicadas**, alinhadas ao pixel grid e com traços mais grossos. Isso evita que o play desmorone ou que seus cantos fiquem retos quando se reduz apenas o arquivo de 1024 px.
- A **256 px** continua sendo gerada diretamente do SVG fonte.

## Medições da marca principal

| Propriedade | Valor medido |
|-------------|--------------|
| Canvas fonte | 1024 × 1024 px |
| Placa | 768 × 768 px (**75%** do canvas) |
| Raio dos cantos da placa | 160 px |
| Altura efetiva do play (incl. `stroke`) | ~440 px (**~57,3%** da placa) |
| Deslocamento do path do play | **+22 px** à direita |
| Centroide do play | ~2 px à direita do centro da placa |
| Contraste play/placa (`#FFFFFF` sobre `#0066FF`) | **~4,8 : 1** |

O contraste medido nos exportes de **16, 32 e 48 px** permanece **~4,8 : 1**, já que as cores não mudam.

## Direções alternativas (exploratórias)

Mantidas como alternativas e **não** como identidade principal.

1. **`icon-alt-1-signal-rings-256.png`** — *Signal Bullseye* (`#00A3E0`)
   - Leitura: transmissão, broadcast, sinal ao vivo.
   - **Limitação medida:** sem a placa azul, o `#00A3E0` sobre fundos claros fica com contraste **~2,7 : 1**, abaixo do mínimo de 3 : 1.
   - Risco adicional: em 16 px os anéis podem colapsar visualmente.

2. **`icon-alt-2-channel-dial-256.png`** — *Channel Dial* (`#4F46E5`)
   - Leitura: sintonia de canais, controle clássico de TV.
   - **Limitação medida:** o knob/círculo pequeno superior **evapora em tamanhos < 32 px**.
   - Risco adicional: pode parecer menos digital/menos "streaming".

### Recomendação

Manter **`icon-source`** como principal. Ela é a mais escaneável, a mais distinta dos concorrentes e funciona em todos os tamanhos. As alternativas podem ser usadas como ícones secundários de funcionalidades (live, canais) se o app precisar de variações temáticas no futuro.

## O que evitar

- Não colocar texto, a palavra "NEW" ou a letra "N" no ícone.
- Não usar gradientes pesados, brilho ou reflexos realistas.
- Não inverter a hierarquia de cor (não use branco como fundo do ícone com play azul, pois perde impacto).
- Não esticar o ícone fora da área segura de 768 × 768 px.
- Não alterar a cor principal para `#00A3E0` ou `#4F46E5`.

## Arquivos entregues

- `icon-source.svg` — vetor de origem da marca principal (1024 × 1024 px)
- `icon-source.png` — PNG 1024 × 1024 px com transparência
- `icon-source-16.svg`, `icon-source-32.svg`, `icon-source-48.svg` — variantes otimizadas para tamanhos pequenos
- `icon-source-16.png`, `icon-source-32.png`, `icon-source-48.png`, `icon-source-256.png` — exportes refeitos
- `icon-alt-1-signal-rings.svg` / `icon-alt-1-signal-rings-256.png`
- `icon-alt-2-channel-dial.svg` / `icon-alt-2-channel-dial-256.png`
- `brand-usage-notes.md` — este arquivo
- `render-icons.js` — script de renderização dos PNGs
