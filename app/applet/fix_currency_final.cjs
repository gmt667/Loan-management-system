const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Replace all `MWK {` with `${`
content = content.replace(/MWK \{/g, '${');

// 2. Restore `>MWK {`
content = content.replace(/>\$\{/g, '>MWK {');

// 3. Restore `Due: MWK {`
content = content.replace(/Due: \$\{/g, 'Due: MWK {');

// 4. Restore `Balance: MWK {`
content = content.replace(/Balance: \$\{/g, 'Balance: MWK {');

// 5. Restore product min/max amount
content = content.replace(/\$\{product\.minAmount/g, 'MWK {product.minAmount');
content = content.replace(/\$\{product\.maxAmount/g, 'MWK {product.maxAmount');

fs.writeFileSync('src/App.tsx', content);
console.log("Done");
