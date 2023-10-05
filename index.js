const fs = require('fs');
const katex = require('katex');
const puppeteer = require('puppeteer');

const data = require('./fullbook.json');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    let combinedHtml = ''; // Variable to store combined HTML content
    let questionCount = 0; // Counter for questions
    let firstChapter = true;
   

    for (const chapter of data.chapters) {
        if(!firstChapter) {
            combinedHtml += '<div style="page-break-after: always;"></div>';
        }
        combinedHtml += `<div class="chapter"><div class="chapter-name">${chapter.name}</div>`;
        firstChapter = false;
        questionCount = 0;
        let firstMaterial = true;
        for (const material of chapter.materials) {
            if(questionCount!= 0 && questionCount % 3 != 0) {
                combinedHtml += '<div style="page-break-after: always;"></div>';
            }

            if(firstMaterial) {
                firstMaterial = false;
                combinedHtml += `<div class="chapter-material">${material.name}</div></div>`;
            } else {
                combinedHtml += `<div class="chapter chapter-material">${material.name}</div>`;
            }

            questionCount = 0;
            for (const question of material.questions) {
                const { question_html } = question;
                questionCount++;

                if (questionCount % 3 === 1) {
                    // Apply top margin to the first question
                    combinedHtml += `<div class="question-text first-question">Question ${questionCount}: ${question_html}</div>`;
                } else {
                    combinedHtml += `<div class="question-text not-first-question">Question ${questionCount}: ${question_html}</div>`;
                }

                combinedHtml += '<div class="answerContainer"> <div> lecture video </div><div> lecture video </div><div> lecture video </div> <div> solution video QR code </div> </div>'
                if(questionCount % 3 != 0) {
                    combinedHtml += `<hr class="question-separator" style="background-color: #333">`;
                }
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

                .chapter {
                    font-size: 30px;
                    text-align: center;
                    page-break-after: always;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    display: flex;
                }

                .chapter-name{
                    font-weight: bold;
                }
                
                .chapter-name,
                .chapter-material {
                    color: #398fe5;
                    margin: 10px 0;
                }

                .question-text {
                    font-size: 20px;
                    color: #555;
                    margin-left: 10%;
                    margin-right: 10%;
                    min-height:38vh;
                    margin-bottom: 20px;
                }

                .question-separator {
                    margin-left: 10%;
                    margin-right: 10%;
                    border: 2px solid;
                }

                .question-text p:first-child {
                    display: inline;
                }

                .answerContainer {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    padding: 0px 40px 0px 40px;
                    margin-left: 10%;
                    margin-right: 10%;
                  }
                 
                .first-question {
                    margin-top: 6%;
                }  

                .not-first-question {
                    margin-top: 3%;
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
    fs.writeFileSync('result.html', finalHtml, 'utf-8');

    const pdfBuffer = await page.pdf({
        printBackground: true,
        colorSpace: 'srgb'
    });
    fs.writeFileSync('fullbook.pdf', pdfBuffer);
    console.log('Combined PDF with three questions per page generated successfully.');

    await browser.close();
})();