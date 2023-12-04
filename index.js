const fs = require("fs");
const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const PDFParser = require("pdf-parse");
const axios = require("axios");
const { PDFDocument, rgb } = require("pdf-lib");
const fontKit = require ('@pdf-lib/fontkit')
const imgRegex = /<img\s+src="\/qimages\/(\d+)"\s*\/?>/g;
// const data = require("./book_data/fullbook.avg.json");

(async () => {
  const data = await fetchBookDataFromApi('cd0cb9cd-9eaf-4783-8f80-da4690022cec');
  const logoImageSrc = toImageSource("LogoText_Blue.png");
  const instructionImageSrc = toImageSource("instruction-cover.png");
  const instructionImageSrc2 = toImageSource("instruction-cover2.png");
  const instructionImageSrc3 = toImageSource("instruction-cover3.png");
  const coverImageSrc = toImageSource("./cover_image/SAT-math.png");
  const imageDataResponses = await fetchImages(data);
  const interFontRegularBase64 = fs.readFileSync("./Inter-Regular.txt", "utf8");

  const browser = await puppeteer.launch({
    protocolTimeout: 0,
  });

  // Start build HTML content
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
  const pdfBuffer = await getPdfConfig(page, logoImageSrc);
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
      }`,combinedHtml));
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

  const pdfBufferWithToc = await getPdfConfig(pageFinal,logoImageSrc);
  const pdfDoc = await PDFDocument.load(pdfBufferWithToc);
  pdfDoc.registerFontkit(fontKit);
  const interRegular = fs.readFileSync('./font/Inter-Regular.ttf');
  const interBold = fs.readFileSync('./font/Inter-Bold.ttf');
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
  const image = await pdfDoc.embedPng(coverImageSrc);
  firstPage.drawImage(image, {
    x: 0,
    y: 0,
    width: width,
    height: height,
  });

  const secondPage = pdfDoc.getPage(1);
  const instructionImage = await pdfDoc.embedPng(instructionImageSrc);
  secondPage.drawImage(instructionImage, {
    x: 0,
    y: 0,
    width: width ,
    height: height,
  });

  const thirdPage = pdfDoc.getPage(2);
  const instructionImage2 = await pdfDoc.embedPng(instructionImageSrc2);
  thirdPage.drawImage(instructionImage2, {
    x: 0,
    y: 0,
    width: width ,
    height: height,
  });

  const fourthPage = pdfDoc.getPage(3);
  const instructionImage3 = await pdfDoc.embedPng(instructionImageSrc3);
  fourthPage.drawImage(instructionImage3, {
    x: 0,
    y: 0,
    width: width ,
    height: height,
  });


  // for(let i = 1; i < pdfDoc.getPageCount(); i++) {
  //   const currentPage = pdfDoc.getPage(i);
  //   currentPage.drawText("Let’s practice and review on PrepBox", {
  //     font: interBoldFont,
  //     x: width - 247,
  //     y: height - 47,
  //     size: 10,
  //     fontWeight: 'bold'
  //   });
  // }

  // Save the modified PDF to a buffer
  const modifiedPdfBytes = await pdfDoc.save();
  fs.writeFileSync("fullbook.pdf", modifiedPdfBytes);
  console.log("PDF generated successfully.");
  await browser.close();
})();

function buildBookCover() {
  return `
  <div></div>
  <div style="page-break-after: always;"></div>`;
}

function buildInstructionPage() {
  return `
  <div></div>
  <div style="page-break-after: always;"></div>
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
  let questionCount = 0;
  let questionCountGlobal = 0;
  let imageDataIndex = 0;
  for (const [chapterIndex, chapter] of data.chapters.entries()) {
    if (chapterIndex !== 0) {
      content += '<div style="page-break-after: always;"></div>';
    }
    const chapterId = `chapter-${chapterIndex}`;
    content += `<div id="${chapterId}" class="chapter"><span class="chapter-name">${chapter.name}</span>`;
    questionCount = 0;

    for (const [materialIndex, material] of chapter.materials.entries()) {
      if (questionCount !== 0 && questionCount % 3 !== 0) {
        content += '<div style="page-break-after: always;"></div>';
      }
      const materialId = `material-${chapterIndex}-${materialIndex}`;
      if (materialIndex === 0) {
        content += `<div id="${materialId}" class="chapter-material">${material.name}</div></div>`;
      } else {
        content += `<div id="${materialId}" class="chapter chapter-material">${material.name}</div>`;
      }
      content += `<div id="${materialId}section">`;

      for (const topic of material.topics) {
        const topicUrl = `https://prepbox.io/worksheets/${
          data.common_name
        }/${chapter.common_name}/${material.common_name}/lectures/${
          topic.id
        }/?lookup=qrcode`;
        const topicQrCodeData = await QRCode.toDataURL(topicUrl);
        const maxTopicQuestion = questionCountGlobal + topic.questions.length;
        const topicHeader = `<div class= "topicContainer">
                                <div style="font-size: 20px;">Accompanying lectures for questions ${
                                  questionCountGlobal + 1
                                } - ${maxTopicQuestion}</div>
                                <a target="_blank" href="${topicUrl}" style="float: right; margin-right: 10%;">
                                  <img style="width: 100px;" src="${topicQrCodeData}"/>
                                </a>
                            </div>
                            <div style="clear: both;"></div>
                            <hr class="question-separator" style="background-color: #333">
                            `;
        if (topic.questions.length > 0) {
          content += topicHeader;
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

          content += `<div style="page-break-inside: avoid"><div class="question-text not-first-question">Question ${questionCountGlobal}: ${question_html}</div>`;
          const solutionUrl = `https://prepbox.io/worksheets/${
            data.common_name
          }/${chapter.common_name}/${material.common_name}/${
            question.id
          }/?lookup=qrcode`;
          const qrCodeSolutionDataUrl = await QRCode.toDataURL(solutionUrl);
          content += `<div class="answerContainer">
                        <div></div>
                        <div></div>
                        <div>Solution Video </div>
                        <div>
                          <a target="_blank" href="${solutionUrl}">
                            <img style="width:100px" src="${qrCodeSolutionDataUrl}" />
                          </a>
                        </div>
                    </div></div>`;
          if (questionCount % 3 !== 0) {
            content += `<hr class="question-separator" style="background-color: #333">`;
          }
          if (questionCount % 3 === 0) {
            content += '<div style="page-break-after: always;"></div>';
            if (questionCountGlobal < maxTopicQuestion) {
              content += topicHeader;
            }
          }
          content += "</div>";
        }

        if (questionCount % 3 !== 0) {
          content += '<div style="page-break-after: always;"></div>';
          questionCount = 0;
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
    </div>`,
    footerTemplate: `
    <div style="width: 100%; font-size: 14px;color: #bbb; position: relative;">
        <div style="position: absolute; right: 50px; bottom: 20px;"><span class="pageNumber"></span></div>
    </div>
    `,
    width: 750,
  });
}

function toImageSource(imagePath) {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  return `data:image/png;base64,${imageBase64}`;
}

function formattedName(name) {
  return name.replace(/\s+/g, "-").toLowerCase();
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
    const response = await axios.get(`https://app.prepanywhere.com/api/stu/static_books/get_full_book?id=${id}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching data from the API:", error.message);
    throw error;
  }
}