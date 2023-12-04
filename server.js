const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const puppeteer = require("puppeteer");
const PDFParser = require("pdf-parse");
const axios = require("axios");
const { PDFDocument, rgb } = require("pdf-lib");
const fontKit = require("@pdf-lib/fontkit");
const imgRegex = /<img\s+src="\/qimages\/(\d+)"\s*\/?>/g;

const app = express();
const port = 3000;

app.use(bodyParser.json());

app.post("/generate-pdf", async (req, res) => {
  try {
    const { bookId, logoImageSrc, instructionImageSrc, coverImageSrc } =req.body;
    const data = await fetchBookDataFromApi(bookId);
    const instructionImageBuffer = await toImageSource(instructionImageSrc);
    const coverImageBuffer = await toImageSource(coverImageSrc);
    const logoImageBuffer = await toImageSource(logoImageSrc);
    const imageDataResponses = await fetchImages(data);
    const interFontRegularBase64 = fs.readFileSync(
      "./Inter-Regular.txt",
      "utf8"
    );

    const browser = await puppeteer.launch({
      protocolTimeout: 0,
    });

    let combinedHtml;
    combinedHtml += buildBookCover();
    combinedHtml += buildInstructionPage();
    combinedHtml += buildInstructionPage();
    combinedHtml += buildInstructionPage();
    combinedHtml += buildTableOfContent(data);
    combinedHtml += await buildBookContent(imageDataResponses, data);

    const finalHtml = buildFinalHtml("", combinedHtml);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setContent(finalHtml);
    await page.addStyleTag({
      content: `@page:first {margin-top: -17px; margin-bottom: 0px; margin-right: -10px; margin-left: -10px}
              @page{margin: 90px 80px 50px 80px;}
    `,
    });

    const pdfBuffer = await getPdfConfig(page, logoImageBuffer);
    fs.writeFileSync("fullbook.pdf", pdfBuffer);
    const outputPdfPath = "fullbook.pdf";
    const dataBuffer = fs.readFileSync(outputPdfPath);
    let parsedText = await parsePDF(dataBuffer);
    const mapMaterialPage = {};
    const pageFinal = await browser.newPage();
    pageFinal.setDefaultNavigationTimeout(0);
    await pageFinal.setContent(
      buildFinalHtml(
        `@font-face {
        font-family: 'Inter';
        src: url(${interFontRegularBase64}) format('truetype');
      }
      body {
        font-family: 'Inter', sans-serif;
      }`,
        combinedHtml
      )
    );
    await pageFinal.addStyleTag({
      content: `@page:first {margin-top: -17px; margin-bottom: 0px; margin-right: -10px; margin-left: -10px}
              @page{margin: 90px 80px 50px 80px;}
    `,
    });

    for (const [chapterIndex, chapter] of data.chapters.entries()) {
      const chapterId = `toc-chapter-${chapterIndex}`;
      const textContent = await page.$eval(`#${chapterId}`, (element) => {
        return element.textContent;
      });
      const res = extractFirstNumberBeforeKeyword(parsedText, textContent);
      const chapterPageNum = res.extractedNumber;
      parsedText = res.modifiedText;
      const pageNumElementId = `page-num-chapter-${chapterIndex}`;
      await pageFinal.evaluate(
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
            textContent
          );
          materialPageNum = resMaterial.extractedNumber;
          parsedText = resMaterial.modifiedText;
        }

        const pageNumMaterialId = `page-num-material-${chapterIndex}-${materialIndex}`;
        await pageFinal.evaluate(
          (pageNumMaterialId, materialPageNum) => {
            const element = document.getElementById(pageNumMaterialId);
            if (element) {
              element.textContent = materialPageNum;
            }
          },
          pageNumMaterialId,
          materialPageNum
        );

        mapMaterialPage[materialPageNum] = textContent;
      }
    }

    const pdfBufferWithToc = await getPdfConfig(pageFinal, logoImageBuffer);
    const pdfDoc = await PDFDocument.load(pdfBufferWithToc);
    pdfDoc.registerFontkit(fontKit);
    const interRegular = fs.readFileSync("./font/Inter-Regular.ttf");
    const interBold = fs.readFileSync("./font/Inter-Bold.ttf");
    const interRegularFont = await pdfDoc.embedFont(interRegular);
    const interBoldFont = await pdfDoc.embedFont(interBold);
    let prevText = "";
    let prevKey = 0;
    mapMaterialPage[pdfDoc.getPageCount() + 1] = "";
    for (let key in mapMaterialPage) {
      const numericKey = parseInt(key, 10);
      if (prevKey != 0) {
        for (let i = prevKey; i < numericKey - 1; i++) {
          const page = pdfDoc.getPage(i);
          page.drawText(prevText, {
            font: interRegularFont,
            x: 65,
            y: 32,
            size: 10,
            color: rgb(103 / 255, 103 / 255, 103 / 255),
          });
        }
      }
      prevText = mapMaterialPage[key];
      prevKey = numericKey;
    }

    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    const image = await pdfDoc.embedPng(coverImageBuffer);
    firstPage.drawImage(image, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    const secondPage = pdfDoc.getPage(1);

    const instructionImage = await pdfDoc.embedPng(instructionImageBuffer);
    secondPage.drawImage(instructionImage, {
      x: width / 8,
      y: height / 6,
      width: width / 1.3,
      height: height / 1.35,
    });

    for (let i = 1; i < pdfDoc.getPageCount(); i++) {
      const currentPage = pdfDoc.getPage(i);
      currentPage.drawText("Let’s practice and review on PrepBox", {
        font: interBoldFont,
        x: width - 247,
        y: height - 47,
        size: 10,
        fontWeight: "bold",
      });
    }

    // Save the modified PDF to a buffer
    const modifiedPdfBytes = await pdfDoc.save();
    const bufferData = Buffer.from(modifiedPdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=fullbook.pdf');
    res.setHeader('Content-Length', bufferData.length);
    res.send(bufferData);
    console.log("PDF generated and sent successfully.");
    await browser.close();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

function buildBookCover() {
  return `
    <div></div>
    <div style="page-break-after: always;"></div>`;
}

function buildInstructionPage() {
  return `
    <div></div><div style="page-break-after: always;"></div>
    `;
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

async function buildBookContent(imageDataResponses, data) {
  let content = "";
  let questionCountGlobal = 0;
  let imageDataIndex = 0;
  for (const [chapterIndex, chapter] of data.chapters.entries()) {
    if (chapterIndex !== 0) {
      content += '<div style="page-break-after: always;"></div>';
    }
    const chapterId = `chapter-${chapterIndex}`;
    content += `<div id="${chapterId}" class="chapter"><span class="chapter-name">${chapter.name}</span>`;
    for (const [materialIndex, material] of chapter.materials.entries()) {
      const materialId = `material-${chapterIndex}-${materialIndex}`;
      if (materialIndex === 0) {
        content += `<div id="${materialId}" class="chapter-material">${material.name}</div></div>`;
      } else {
        content += '<div style="page-break-after: always;"></div>';
        content += `<div id="${materialId}" class="chapter chapter-material">${material.name}</div>`;
      }
      content += `<div id="${materialId}section">`;

      for (const topic of material.topics) {
        for (const question of topic.questions) {
          let { question_html } = question;
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
          content += `<div style="page-break-inside: avoid; margin-bottom: 30px;"><div class="question-text">Question ${questionCountGlobal}: ${question_html}</div>`;
          content += "</div>";
        }
      }
    }
  }
  return content;
}

function extractFirstNumberBeforeKeyword(text, keyword) {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(\\d+(\\.\\d+)?)\\s*${escapedKeyword}`);

  if (pattern.test(text)) {
    const match = text.match(pattern);
    const extractedNumber = parseFloat(match[1]);
    return {
      extractedNumber: extractedNumber,
      modifiedText: text.substring(match.index, text.length),
    };
  }

  return {
    extractedNumber: null,
    modifiedText: text,
  };
}

async function getPdfConfig(page, imageSrc) {
  return await page.pdf({
    printBackground: true,
    colorSpace: "srgb",
    timeout: 0,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width: 100%; position: relative; font-size: 14px;margin-left: 89px; margin-top: 20px; line-height: 20%; margin-right: 89px;">
        <img src="${imageSrc}" style="max-width: 20%;"/>
        <a href="https://prepbox.io" style="position: absolute; right: 0; top: 54%; transform: translateY(-50%); 
        text-decoration: none; color: transparent">Let’s practice and review on PrepBoxx</a>
      </div>`,
    footerTemplate: `
      <div style="width: 100%; font-size: 14px;color: #bbb; position: relative;">
          <div style="position: absolute; right: 50px; bottom: 20px;"><span class="pageNumber"></span></div>
      </div>
      `,
    width: 750,
  });
}

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

async function parsePDF(buffer) {
  const data = await PDFParser(buffer);
  return data.text;
}

function buildFinalHtml(customStyle, contentHtml, link) {
  return `
    <!DOCTYPE html>
    <html>
        <head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
            <style>
            ${customStyle}
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
            ${contentHtml}
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
}

async function fetchBookDataFromApi(id) {
  try {
    const response = await axios.get(
      `https://app.prepanywhere.com/api/stu/static_books/get_full_book?id=${id}`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching data from the API:", error.message);
    throw error;
  }
}

async function toImageSource(imagePath) {
  try {
    const response = await axios.get(imagePath, {
      responseType: "arraybuffer",
    });
    const imageBase64 = Buffer.from(response.data, "binary").toString("base64");
    return `data:${response.headers["content-type"]};base64,${imageBase64}`;
  } catch (error) {
    console.error("Error converting image to base64:", error.message);
    throw error;
  }
}
