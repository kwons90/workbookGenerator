const katex = require("katex");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios")

const jsonfile = require("jsonfile");
const fs = require("fs");

const fileData = jsonfile.readFileSync("input.json");
const workbookData = jsonfile.readFileSync("fullbook.json");
const chapters = workbookData.chapters;
const equations = fileData.data;

// This adds the main title page of each book
let html = '<div class="titlePage">';
html += `<h1>${workbookData.name}</h1>`
html += '</div><div class="page">';

chapters.forEach((chapter) => {
  html += '<div class="titlePage">'
  html += `<h1>${chapter.name} </h1>`
  html += '</div><div class="page">';
  chapter.materials.forEach((material) => {
    material.questions.forEach((question, index) => {
      const latex = index + question.question_html;
    
      // // Now htmlStr includes bothuy
      // Add equation to flex container
      html += '<div class="equationContainer"> <div class="equation">' + latex + "</div> </div>";
    
      html += '<div class="answerContainer"> <div> lecture video </div><div> lecture video </div><div> lecture video </div> <div> solution video QR code </div> </div>'
      // After three equations, close this div and start a new one
      if ((index + 1) % 3 === 0) {
        html += '</div><div class="page">';
      }
    });
  })
})

html += "</div>";

// CSS for layout
const css = `<style>
body {
  font-family: 'Inter', sans-serif;
}
.page {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 95%;
  page-break-after: always;
}
.titlePage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  justify-content: center;
  font: helvetica;
  height: 95%;
  page-break-after: always;
}
.titlePage h1 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  font: helvetica;
  height: 95%;
  page-break-after: always;
}
.answerContainer {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 0px 40px 0px 40px;
}
.equationContainer {
  height: 2500px;
}
.equation {
  padding: 40px;
  flex: 1;
}
</style>`;

const finalHtml = `
    <!DOCTYPE html>
    <html>
        <head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
            <style>
                .chapter-name {
                    font-weight: bold;
                    font-size: 24px;
                    text-align: center;
                }
                .chapter-material {
                    font-weight: bold;
                    color: #333;
                }

                .question-text {
                    color: #555;
                }

                .question-text p:first-child {
                    display: inline;
                }
            </style>
        </head>
        <body>
            ${html}
            <script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
            <script>
                document.querySelectorAll('.latex').forEach(function(element) {
                    katex.render(element.textContent, element);
                });
            </script>
        </body>
    </html>
`;

fs.writeFileSync("output.html", css + finalHtml);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("file://" + __dirname + "/output.html", {
    waitUntil: "networkidle0",
  });
  await page.pdf({ path: "output.pdf", format: "A4", printBackground: true });

  await browser.close();
})().catch((error) => console.error(error));
