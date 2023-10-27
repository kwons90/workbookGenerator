const fs = require("fs");
const puppeteer = require("puppeteer");
const data = require("./algebra1.json");
const axios = require("axios");
const QRCode = require("qrcode");
const PDFParser = require("pdf-parse");
const imgRegex = /<img\s+src="\/qimages\/(\d+)"\s*\/?>/g;

(async () => {
  const browser = await puppeteer.launch({
    protocolTimeout: 0,
  });

  const logoImageSrc = toImageSource("LogoText_Blue.png");
  const instructionImageSrc = toImageSource("instruction.png");

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  const imageDataResponses = await fetchImages(data);

  // Generate chapter and material data
  let combinedHtml = buildBookCover(toImageSource("algebra-1-cover.png"));
  combinedHtml += `
      <div style="display: flex; flex-direction: column; height: 1250px; justify-content: center; align-items: flex-end; background-image: url('${instructionImageSrc}'); 
      background-size: cover; background-position: center; background-repeat: no-repeat;">
      </div>

      <div style="page-break-after: always;"></div>
  `;
  combinedHtml += buildTableOfContent(data);
  let questionCount = 0;
  let questionCountGlobal = 0;
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

      for (const topic of material.topics) {
        const topicQrCodeData = await QRCode.toDataURL(
          `https://prepbox.io/worksheets/${formattedName(
            data.name
          )}/${formattedName(chapter.name)}/${material.name}`
        );
        const maxTopicQuestion = questionCountGlobal + topic.questions.length;
        const topicHeader = `<div class= "topicContainer">
                            <div style="font-size: 20px;">Accompanying lectures for questions ${
                              questionCountGlobal + 1
                            } - ${maxTopicQuestion}</div>
                            <img style="width: 100px; float: right; margin-right: 10%;" src="${topicQrCodeData}"/>
                            </div>
                            <div style="clear: both;"></div>
                            <hr class="question-separator" style="background-color: #333">
                            `;
        if (topic.questions.length > 0) {
          combinedHtml += topicHeader;
        }
        questionCount = 0;
        for (const question of topic.questions) {
          let { question_html } = question;
          questionCount++;
          questionCountGlobal++;
          let imgMatch;
          while ((imgMatch = imgRegex.exec(question_html)) !== null) {
            const imageData = imageDataResponses[imageDataIndex];
            if (imageData && imageData.data) {
              question_html = question_html.replace(
                imgMatch[0],
                `<img style="display:block" src="${imageData.data.imageURL}"/>`
              );
            }
            imageDataIndex++;
          }

          combinedHtml += `<div style="page-break-inside: avoid"><div class="question-text not-first-question">Question ${questionCountGlobal}: ${question_html}</div>`;
          const qrCodeDataURL = await QRCode.toDataURL(
            `https://prepbox.io/worksheets/${formattedName(
              data.name
            )}/${formattedName(chapter.name)}/${formattedName(material.name)}/${
              question.id
            }`
          );
          combinedHtml += `<div class="answerContainer">
                        <div></div>
                        <div></div>
                        <div>Solution Video </div>
                        <div><img style="width:100px" src="${qrCodeDataURL}"/></div>
                    </div></div>`;
          if (questionCount % 3 !== 0) {
            combinedHtml += `<hr class="question-separator" style="background-color: #333">`;
          }
          if (questionCount % 3 === 0) {
            combinedHtml += '<div style="page-break-after: always;"></div>';
            if (questionCountGlobal < maxTopicQuestion) {
              combinedHtml += topicHeader;
            }
          }
        }

        if (questionCount % 3 !== 0) {
          combinedHtml += '<div style="page-break-after: always;"></div>';
          questionCount = 0;
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
                    height: 90vh;
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
                    min-height: 25vh;
                    margin-bottom: 20px;
                }
                      
                .question-separator {
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
                    font-size: 20px;
                }

                .topicContainer {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
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
                      try {
                        katex.render(element.textContent, element);
                      } catch (ex) {
                        // prevent script break when facing invalid expression
                      }
                    });
                </script>
            </body>
        </html>
    `;
  await page.setContent(finalHtml);
  fs.writeFileSync("result.html", finalHtml, "utf-8");
  await page.addStyleTag({
    content: `@page:first {margin-top: -17px; margin-bottom: 0px; margin-right: -10px; margin-left: -10px}
              @page{margin: 100px 80px 40px 80px;}
    `,
  });
  const pdfBuffer = await getPdfConfig(page, logoImageSrc);
  fs.writeFileSync("fullbook.pdf", pdfBuffer);
  const outputPdfPath = "fullbook.pdf";
  const dataBuffer = fs.readFileSync(outputPdfPath);
  let parsedText = await parsePDF(dataBuffer);

  let minPage = 0;
  for (const [chapterIndex, chapter] of data.chapters.entries()) {
    const chapterId = `toc-chapter-${chapterIndex}`;
    const textContent = await page.$eval(`#${chapterId}`, (element) => {
      return element.textContent;
    });
    const res = extractFirstNumberBeforeKeyword(
      parsedText,
      textContent,
      minPage
    );
    const chapterPageNum = res.extractedNumber;
    minPage = chapterPageNum;
    parsedText = res.modifiedText;
    const pageNumElementId = `page-num-chapter-${chapterIndex}`;
    await page.evaluate(
      (pageNumElementId, chapterPageNum) => {
        const spanElement = document.getElementById(pageNumElementId);
        if (spanElement) {
          spanElement.textContent = chapterPageNum;
        }
      },
      pageNumElementId,
      chapterPageNum
    );

    for (const [materialIndex] of chapter.materials.entries()) {
      const materialId = `toc-material-${chapterIndex}-${materialIndex}`;
      const textContent = await page.$eval(`#${materialId}`, (element) => {
        return element.textContent;
      });

      let materialPageNum;
      if (materialIndex === 0) {
        materialPageNum = chapterPageNum;
      } else {
        const resMaterial = extractFirstNumberBeforeKeyword(
          parsedText,
          textContent,
          minPage
        );
        materialPageNum = resMaterial.extractedNumber
        parsedText = resMaterial.modifiedText;
        minPage = materialPageNum;
      }

      const pageNumMaterialId = `page-num-material-${chapterIndex}-${materialIndex}`;
      await page.evaluate(
        (pageNumMaterialId, materialPageNum) => {
          const element = document.getElementById(pageNumMaterialId);
          if (element) {
            element.textContent = materialPageNum;
          }
        },
        pageNumMaterialId,
        materialPageNum
      );
    }
  }
  const pdfBufferWithToc = await getPdfConfig(page, logoImageSrc);
  fs.writeFileSync("fullbook.pdf", pdfBufferWithToc);
  console.log("PDF generated successfully.");
  await browser.close();
})();

function fetchImages(data) {
  const imageIds = [];
  for (const chapter of data.chapters) {
    for (const material of chapter.materials) {
      for (const topic of material.topics) {
        for (const question of topic.questions) {
          let imgMatch;
          while ((imgMatch = imgRegex.exec(question.question_html)) !== null) {
            const imageId = imgMatch[1];
            imageIds.push(imageId);
          }
        }
      }
    }
  }
  return Promise.all(
    imageIds.map((imageId) =>
      axios.get(
        `https://app.prepanywhere.com/api/stu/live_classrooms/get_image?id=${imageId}`
      )
    )
  );
}

function buildTableOfContent(data) {
  let tableOfContentsHtml =
    '<div style="font-size: 18px;"><h1>Table of Contents</h1><ul>';
  for (const [chapterIndex, chapter] of data.chapters.entries()) {
    const chapterId = `chapter-${chapterIndex}`;
    tableOfContentsHtml += `<li style="font-size: 20px; page-break-inside: avoid;">
                                    <a id="toc-${chapterId}" href="#${chapterId}"><strong>${chapter.name}</strong></a>
                                    <span id="page-num-${chapterId}" style="display: inline-block; float: right; font-size: 18px"></span>
                                <ul>`;
    for (const [materialIndex, material] of chapter.materials.entries()) {
      const materialId = `material-${chapterIndex}-${materialIndex}`;
      tableOfContentsHtml += `<li style="line-height: 1.5;"><a id="toc-${materialId}" href="#${materialId}">${material.name}</a>
            <span id="page-num-${materialId}" style="display: inline-block; float: right; font-size: 18px"></span></li>`;
    }
    tableOfContentsHtml += "</ul></li>";
  }
  tableOfContentsHtml += "</ul></div>";
  tableOfContentsHtml += '<div style="page-break-after: always;"></div>';
  return tableOfContentsHtml;
}

function buildBookCover(imageSrc) {
  return `
  <div style="background-image: url('${imageSrc}'); background-size: cover; background-position: center; width: 100%; height: 1600px; display: flex; flex-direction: column; align-items: flex-end;">
  </div>
  <div style="page-break-after: always;"></div>`;
}

async function parsePDF(buffer) {
  const data = await PDFParser(buffer);
  return data.text;
}

function extractFirstNumberBeforeKeyword(text, keyword, threshold) {
  const pattern = new RegExp(`(\\d+(\\.\\d+)?)\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const extractedNumber = parseFloat(match[1]); // Use parseFloat instead of parseInt for decimal numbers
    if (extractedNumber > threshold) {
      return {
        extractedNumber: extractedNumber,
        modifiedText:  text.substring(match.index,text.length)
      };
    }
  }
  return {
    extractedNumber: null,
    modifiedText: text
  };
}

async function getPdfConfig(page, imageSrc) {
  return await page.pdf({
    printBackground: true,
    colorSpace: "srgb",
    timeout: 0,
    displayHeaderFooter: true,
    headerTemplate: `<img src="${imageSrc}" style="max-width: 20%; max-height: 20%; position: absolute; left: 89px; top:35px; padding-bottom:10px;"/>`,
    footerTemplate: `
                <div style="width: 100%; font-size: 14px;color: #bbb; position: relative;">
                    <div style="position: absolute; right: 50px; bottom: 20px"><span class="pageNumber"></span></div>
                </div>
            `,
    margin: {
      top: "100px",
      bottom: "40px",
      left: "80px",
      right: "80px",
    },
    height: '1055px'
  });
}

function toImageSource(imagePath) {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  return `data:image/png;base64,${imageBase64}`;
}

function formattedName(name) {
  return name.replace(/\s+/g, "-").toLowerCase();
}
