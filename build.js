// Builds the single self-contained index.html from src/
// Usage: node build.js
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const script = ['data.js', 'game.js', 'synth.js', 'main.js'].map(src).join('\n');
const html = src('template.html').replace('/*__SCRIPT__*/', () => "'use strict';\n" + script);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html', html.length, 'bytes');
