const fs = require("fs");
const path = require("path");

function scan(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const full = path.join(dir, file);

    if (fs.statSync(full).isDirectory()) {
      scan(full);
    } else if (full.endsWith(".js")) {
      const content = fs.readFileSync(full, "utf8");

      const matches = content.match(/process\.env\.[A-Z0-9_]+/g);

      if (matches) {
        console.log("\nFILE:", full);
        console.log([...new Set(matches)]);
      }
    }
  });
}

scan(".");