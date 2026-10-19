const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const files = [
  { input: 'icon-source.svg', output: 'icon-source.png', size: 1024 },
  { input: 'icon-alt-1-signal-rings.svg', output: 'icon-alt-1-signal-rings-256.png', size: 256 },
  { input: 'icon-alt-2-channel-dial.svg', output: 'icon-alt-2-channel-dial-256.png', size: 256 },
  // Small-size legibility tests for the primary icon
  { input: 'icon-source.svg', output: 'icon-source-256.png', size: 256 },
  { input: 'icon-source.svg', output: 'icon-source-48.png', size: 48 },
  { input: 'icon-source.svg', output: 'icon-source-32.png', size: 32 },
  { input: 'icon-source.svg', output: 'icon-source-16.png', size: 16 },
];

(async () => {
  for (const { input, output, size } of files) {
    const inputPath = path.join(__dirname, input);
    const outputPath = path.join(__dirname, output);
    const svgBuffer = fs.readFileSync(inputPath);
    await sharp(svgBuffer)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(outputPath);
    console.log(`Rendered ${output} (${size}x${size})`);
  }
})();
