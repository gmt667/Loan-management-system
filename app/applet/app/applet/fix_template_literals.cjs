const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/ MWK \{/g, ' ${');
content = content.replace(/>MWK \{/g, '>${');
content = content.replace(/"MWK \{/g, '"${');
content = content.replace(/'MWK \{/g, "'${");
content = content.replace(/`MWK \{/g, "`${");
content = content.replace(/\(MWK \{/g, "(${");
content = content.replace(/\[MWK \{/g, "[${");
content = content.replace(/MWK MWK \{/g, "MWK ${");
content = content.replace(/MWK \{/g, "${");

fs.writeFileSync('src/App.tsx', content);
console.log("Done");
