const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/\$\$\{/g, 'MWK ${');
content = content.replace(/\$([0-9])/g, 'MWK $1');
content = content.replace(/>\$/g, '>MWK ');
content = content.replace(/"\$/g, '"MWK ');
content = content.replace(/'\$/g, "'MWK ");
content = content.replace(/`\$/g, "`MWK ");
content = content.replace(/ \$/g, " MWK ");
content = content.replace(/\(\$/g, "(MWK ");
content = content.replace(/\[\$/g, "[MWK ");

fs.writeFileSync('src/App.tsx', content);
console.log("Done");
