// Patch ifvms opcodes.js to fix CJS->ESM `this` reference issue
// In CJS, `this` at module scope is `module.exports`. When bundlers convert
// to ESM, `this` becomes undefined, causing `this.e` to throw.
// stack_var is always variable 0 (stack) and never uses the engine ref.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'ifvms', 'src', 'zvm', 'opcodes.js');
let content = fs.readFileSync(file, 'utf8');
const original = 'stack_var = new Variable( this.e, 0 )';
const patched = 'stack_var = new Variable( null, 0 )';

if (content.includes(original)) {
  content = content.replace(original, patched);
  fs.writeFileSync(file, content);
  console.log('Patched ifvms opcodes.js: this.e -> null');
} else if (content.includes(patched)) {
  console.log('ifvms opcodes.js already patched');
} else {
  console.warn('WARNING: Could not find expected pattern in ifvms opcodes.js');
}
