const fs = require('fs');
const puppeteer = require('puppeteer');
const data = require('./fullbook2.json');
const axios = require('axios');
const QRCode = require('qrcode')
const imgRegex = /<img\s+src="\/qimages\/(\d+)"\s*\/?>/g;

(async () => {
    const browser = await puppeteer.launch({
        protocolTimeout: 0
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    const imageDataResponses = await fetchImages(data);

    // Generate chapter and material data
    let combinedHtml = buildBookCover();
    combinedHtml += buildTableOfContent(data);
    let questionCount = 0;
    let imageDataIndex = 0;
    for (const [chapterIndex, chapter] of data.chapters.entries()) {
        if (chapterIndex !== 0) {
            combinedHtml += '<div style="page-break-after: always;"></div>';
        }
        const chapterId = `chapter-${chapterIndex}`;
        combinedHtml += `<div id="${chapterId}" class="chapter"><div class="chapter-name">${chapter.name}</div>`;
        questionCount = 0;

        for (const [materialIndex, material] of chapter.materials.entries()) {
            if (questionCount !== 0 && questionCount % 3 !== 0) {
                combinedHtml += '<div style="page-break-after: always;"></div>';
            }
            const materialId = `material-${chapterIndex}-${materialIndex}`;
            if (materialIndex === 0) {
                combinedHtml += `<div id="${materialId}" class="chapter-material">${material.name}</div></div>`;
            } else {
                combinedHtml += `<div id="${materialId}" class="chapter chapter-material">${material.name}</div>`;
            }

            questionCount = 0;
            for (const question of material.questions) {
                let { question_html } = question;
                questionCount++;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(question_html)) !== null) {
                    const imageData = imageDataResponses[imageDataIndex];
                    if (imageData && imageData.data) {
                        question_html = question_html.replace(imgMatch[0], `<img src="${imageData.data.imageURL}"/>`);
                    }
                    imageDataIndex++;
                }

                if (questionCount % 3 === 1) {
                    combinedHtml += `<div class="question-text first-question">Question ${questionCount}: ${question_html}</div>`;
                } else {
                    combinedHtml += `<div class="question-text not-first-question">Question ${questionCount}: ${question_html}</div>`;
                }
                const ioURL = `https://prepbox.io/worksheets/${data.name.replace(/\s+/g, '-').toLowerCase()}/${chapter.name.replace(/\s+/g, '-').toLowerCase()}/${material.name.replace(/\s+/g, '-').toLowerCase()}/${question.id}`;
                const lectureURL = `https://prepbox.io/worksheets/${data.name.replace(/\s+/g, '-').toLowerCase()}/${chapter.name.replace(/\s+/g, '-').toLowerCase()}/${material.name.replace(/\s+/g, '-').toLowerCase()}/${question.id}/lectures`;
                const qrCodeDataURL = await QRCode.toDataURL(ioURL);
                const lectureCodeDataURL = await QRCode.toDataURL(lectureURL);
                combinedHtml += `<div class="answerContainer">
                    <div>Lecture Video </div>
                    <div><img style="width:100px" src="${lectureCodeDataURL}"/></div>
                    <div>Solution Video </div>
                    <div><img style="width:100px" src="${qrCodeDataURL}"/></div>
                </div>`;
                if (questionCount % 3 !== 0) {
                    combinedHtml += `<hr class="question-separator" style="background-color: #333">`;
                }
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

                ul li a {
                    color: black;
                    text-decoration: none; 
                }
            
                ul ul li a {
                    color: black;
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
                    min-height: 30vh;
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
                    align-items: center;
                    margin-left: 10%;
                    margin-right: 10%;
                }
                    
                .first-question {
                    margin-top: 6%;
                }
                     
                .not-first-question {
                    margin-top: 3%;
                }

                .qr {
                    width: 50px;
                    width: auto;
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
        colorSpace: 'srgb',
        timeout: 0
    });
    fs.writeFileSync('fullbook.pdf', pdfBuffer);
    console.log('Combined PDF with three questions per page generated successfully.');
    await browser.close();
})();

function fetchImages(data) {
    const imageIds = [];
    for (const chapter of data.chapters) {
        for (const material of chapter.materials) {
            for (const question of material.questions) {
                let imgMatch;
                while ((imgMatch = imgRegex.exec(question.question_html)) !== null) {
                    const imageId = imgMatch[1];
                    imageIds.push(imageId);
                }
            }
        }
    }
    return Promise.all(imageIds.map(imageId => axios.get(`https://app.prepanywhere.com/api/stu/live_classrooms/get_image?id=${imageId}`)));
}

function buildTableOfContent(data) {
    let tableOfContentsHtml = '<div style="padding: 80px;"><h1>Table of Contents</h1><ul>';
    for (const [chapterIndex, chapter] of data.chapters.entries()) {
        const chapterId = `chapter-${chapterIndex}`;
        tableOfContentsHtml += `<li style="padding-bottom: 10px;"><a href="#${chapterId}"><strong>${chapter.name}</strong></a><ul>`;
  
        for (const [materialIndex, material] of chapter.materials.entries()) {
            const materialId = `material-${chapterIndex}-${materialIndex}`;
            tableOfContentsHtml += `<li><a href="#${materialId}">${material.name}</a></li>`;
        }
        tableOfContentsHtml += '</ul></li>';
    }
    tableOfContentsHtml += '</ul></div>';
    tableOfContentsHtml += '<div style="page-break-after: always;"></div>'; 
    return tableOfContentsHtml;
}

function buildBookCover() {
    const imagePath = 'LogoText_Blue.png';
    const image = fs.readFileSync(imagePath);
    const imageBase64 = image.toString('base64');
    const imageSrc = `data:image/png;base64,${imageBase64}`;
    
    return  `<div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh;">
                <img src="${imageSrc}" style="max-width: 50%; max-height: 70%; margin-bottom: 20px;"/>
                <div style="color: #398fe5; font-size: 28px; margin-bottom: 10px;">Subject: ${data.name}</div>
                <div style="color: #398fe5; font-size: 28px;">Curriculum: ${data.curriculum}</div>
            </div>
            <div style="page-break-after: always;"></div>`;
}
