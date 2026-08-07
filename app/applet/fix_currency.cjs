const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix JSX text nodes with $
content = content.replace(/>\$\{/g, '>MWK {');
content = content.replace(/ \$\{/g, ' MWK {');
content = content.replace(/"\$\{/g, '"MWK {');
content = content.replace(/'\$\{/g, "'MWK {");
content = content.replace(/\(\$\{/g, "(MWK {");

// Fix template literals where $ is used as currency
// e.g. `MWK ${value}` is correct. If we have `$${value}` it should be `MWK ${value}`
// But wait, the previous script might have changed `MWK ${` to `${`.
// Let's check `grep -n "\`\${" src/App.tsx`

fs.writeFileSync('src/App.tsx', content);
console.log("Done");
