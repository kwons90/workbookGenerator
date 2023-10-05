const fs = require('fs');
const katex = require('katex');
const puppeteer = require('puppeteer');

const data = require('./fullbook.json');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    let combinedHtml = ''; // Variable to store combined HTML content
    let questionCount = 0; // Counter for questions
   

    for (const chapter of data.chapters) {
        
        combinedHtml += `<h2 class="chapter-name">${chapter.name}</h2>`;
        for (const material of chapter.materials) {
            if(questionCount!= 0 && questionCount % 3 != 0) {
                combinedHtml += '<div style="page-break-after: always;"></div>';
            }
            questionCount = 0;
            combinedHtml += `<h3 class="chapter-material">${"    "+ material.name}</h3>`;
            for (const question of material.questions) {
                const { question_html } = question;
                questionCount++;

                // Add the question HTML to the combined HTML
                combinedHtml += `<div class="question-text">Question ${questionCount}: ${question_html}</div>`;

                // If three questions have been added, start a new page
                if (questionCount % 3 === 0) {
                    combinedHtml += '<div style="page-break-after: always;"></div>';
                }
            }
        }
    }

    const finalHtml = `
    <!DOCTYPE html>
    <html>
        <head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
            <style>
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
                .chapter-name {
                    font-weight: bold;
                    font-size: 24px;
                    text-align: center;
                    padding: 40px;
                }
                .chapter-name h3 {
                    padding: 40px;
                }
                .chapter-material {
                    padding: 40px
                    font-weight: bold;
                    color: #333;
                }

                .question-text {
                    padding: 40px 40px 200px 40px;
                    color: #555;
                }

                .question-text p:first-child {
                    display: inline;
                }
            </style>
        </head>
        <body>
            ${combinedHtml}
            <script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
            <script>
                document.querySelectorAll('.latex').forEach(function(element) {
                    katex.render(element.textContent, element);
                });
            </script>
        </body>
    </html>
`;

    await page.setContent(finalHtml);
    const pdfBuffer = await page.pdf();
    fs.writeFileSync('result.html', finalHtml, 'utf-8');
    fs.writeFileSync('fullbook.pdf', pdfBuffer);
    console.log('Combined PDF with three questions per page generated successfully.');

    await browser.close();
})();