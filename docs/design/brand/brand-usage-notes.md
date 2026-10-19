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

## Área de respiro e máscara arredondada

- **Tamanho fonte:** 1024 × 1024 px
- **Elementos principais** ficam dentro de uma área segura de **768 × 768 px** centralizada (margem de 128 px em todos os lados).
- Essa margem garante que a máscara arredondada do Windows não corte os elementos visuais nos tamanhos 16–256 px.
- Mantenha o ícone sobre fundo transparente sempre que possível.

## Tamanhos de exportação sugeridos

| Uso | Tamanho | Fonte |
|-----|---------|-------|
| Ícone da loja / installer | 1024 × 1024 px | `icon-source.png` |
| Ícone do app ( Windows ) | 256 × 256 px | redimensionar a partir do SVG/PNG 1024 |
| Taskbar / Start menu | 32–48 px | redimensionar a partir do SVG |
| Favicon / tray | 16 × 16 px | testar legibilidade do play simplificado |

Para tamanhos muito pequenos (16–24 px), o símbolo de play continua legível porque ocupa a área central e tem espessura generosa.

## Direções alternativas

Foram geradas duas variações em 256 px para revisão:

1. **`icon-alt-1-signal-rings-256.png`** — *Signal Bullseye* (teal `#00A3E0`)
   - Leitura: transmissão, broadcast, sinal ao vivo.
   - Risco: em 16 px os anéis podem colapsar visualmente.

2. **`icon-alt-2-channel-dial-256.png`** — *Channel Dial* (índigo `#4F46E5`)
   - Leitura: sintonia de canais, controle clássico de TV.
   - Risco: pode parecer menos digital/menos "streaming".

### Recomendação

Manter **`icon-source`** como principal. Ela é a mais escaneável, a mais distinta dos concorrentes e funciona em todos os tamanhos. As alternativas podem ser usadas como ícones secundários de funcionalidades (live, canais) se o app precisar de variações temáticas no futuro.

## O que evitar

- Não colocar texto, a palavra "NEW" ou a letra "N" no ícone.
- Não usar gradientes pesados, brilho ou reflexos realistas.
- Não inverter a hierarquia de cor (não use branco como fundo do ícone com play azul, pois perde impacto).
- Não esticar o ícone fora da área segura de 768 × 768 px.

## Arquivos entregues

- `icon-source.svg` — vetor de origem da marca principal
- `icon-source.png` — PNG 1024 × 1024 px com transparência
- `icon-alt-1-signal-rings.svg` / `icon-alt-1-signal-rings-256.png`
- `icon-alt-2-channel-dial.svg` / `icon-alt-2-channel-dial-256.png`
- `brand-usage-notes.md` — este arquivo
