const katex = require("katex");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

const jsonfile = require("jsonfile");
const fs = require("fs");

const fileData = jsonfile.readFileSync("input.json");
const equations = fileData.data;

let html = '<div class="page">';

equations.forEach((equation, index) => {
  const latex = equation.question_html.match(/<code>(.*?)<\/code>/)[1];

  // Now htmlStr includes both katex-mathml and katex-html.
  const htmlStr = katex.renderToString(latex);
  const $ = cheerio.load(htmlStr);

  // This will remove katex-html.
  $(".katex-html").remove();
  const outputHtml = $.html();

  // Now substitute the latex code with the htmlStr that no longer includes katex-html.
  const euqation_html = equation.question_html.replace(
    `<code>${latex}</code>`,
    outputHtml
  );

  // Add equation to flex container
  html += '<div class="equation">' + index + euqation_html + "</div>";

  // After three equations, close this div and start a new one
  if ((index + 1) % 3 === 0) {
    html += '</div><div class="page">';
  }
});

html += "</div>";

// CSS for layout
const css = `<style>
.page {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  page-break-after: always;
}
.equation {
  flex: 1;
}
</style>`;

fs.writeFileSync("output.html", css + html);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("file://" + __dirname + "/output.html", {
    waitUntil: "networkidle0",
  });
  await page.pdf({ path: "output.pdf", format: "A4", printBackground: true });

  await browser.close();
})().catch((error) => console.error(error));
