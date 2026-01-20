const { NodeHtmlMarkdown } = require('node-html-markdown');
const fs = require('fs/promises');
const path = require('node:path');

(async () => {
  const pageFetch = await fetch('https://locator.riftbound.uvsgames.com/stores/92f30113-dc7b-46de-afa7-702cc5eb705c');

  const pageRaw = await pageFetch.text();

  await fs.writeFile(path.join(__dirname, 'content.html'), pageRaw);

  const markdown = NodeHtmlMarkdown.translate(pageRaw);

  await fs.writeFile(path.join(__dirname, 'content.md'), markdown);
})();