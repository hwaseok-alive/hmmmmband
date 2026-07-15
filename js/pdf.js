/*
========================================================
BAND Chat Backup
pdf.js
PDF / Image / OCR
========================================================
*/

pdfjsLib.GlobalWorkerOptions.workerSrc =
"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";


/*========================================================
파일 열기
========================================================*/

async function openFile(file){

    if(!file) return;

    resetState();

    state.currentFile = file;

    document.getElementById("file-name").textContent = file.name;

    const ext = file.name.split(".").pop().toLowerCase();

    if(ext === "pdf"){

        state.currentFileType = "pdf";

        await openPDF(file);

    }else{

        state.currentFileType = "image";

        await openImage(file);

    }

}


/*========================================================
PDF
========================================================*/

async function openPDF(file){

    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({

        data:buffer

    }).promise;

    state.pageCount = pdf.numPages;

    let text = "";

    for(let pageNum=1; pageNum<=pdf.numPages; pageNum++){

        if(state.cancelOCR){

            break;

        }

        state.currentPage = pageNum;

        updateProgress(

            pageNum,

            pdf.numPages,

            `페이지 ${pageNum}/${pdf.numPages}`

        );

        const page = await pdf.getPage(pageNum);

        const viewport = page.getViewport({

            scale:CONFIG.PDF_SCALE

        });

        const canvas = document.createElement("canvas");

        const ctx = canvas.getContext("2d");

        canvas.width = viewport.width;

        canvas.height = viewport.height;

        await page.render({

            canvasContext:ctx,

            viewport

        }).promise;

        const processedCanvas = preprocessCanvas(canvas);

const pageText = await runOCR(processedCanvas);

        text += pageText + "\n";

    }

    state.rawText = text;

    finishOCR();

}


/*========================================================
이미지
========================================================*/

async function openImage(file){

    const img = new Image();

    img.src = URL.createObjectURL(file);

    await new Promise(resolve=>{

        img.onload = resolve;

    });

    const canvas = document.createElement("canvas");

    canvas.width = img.width;

    canvas.height = img.height;

    canvas.getContext("2d").drawImage(img,0,0);

    const processedCanvas = preprocessCanvas(canvas);

state.rawText = await runOCR(processedCanvas);

    finishOCR();

}


/*========================================================
OCR
========================================================*/

async function runOCR(canvas){

    state.isProcessing = true;

    const result = await Tesseract.recognize(

        canvas,

        CONFIG.OCR_LANGUAGE,

        {

            logger(message){

                if(message.status==="recognizing text"){

                    updateProgress(

                        message.progress,

                        1,

                        "OCR 분석 중..."

                    );

                }

            }

        }

    );

    return result.data.text;

}


/*========================================================
OCR 완료
========================================================*/

function finishOCR(){

    state.isProcessing = false;

    updateProgress(

        1,

        1,

        "분석 완료"

    );

    parseText(state.rawText);

}


/*========================================================
OCR 취소
========================================================*/

function cancelOCR(){

    state.cancelOCR = true;

    state.isProcessing = false;

    document.getElementById("progress-text").textContent =

        "취소됨";

}


/*========================================================
진행률
========================================================*/

function updateProgress(value,max,text){

    const percent =

        Math.round(value/max*100);

    document.getElementById("progress-bar").style.width =

        percent+"%";

    document.getElementById("progress-text").textContent =

        text;

}

/*========================================================
Canvas 전처리
========================================================*/

function preprocessCanvas(sourceCanvas){

    const canvas = document.createElement("canvas");

    const ctx = canvas.getContext("2d");

    canvas.width = sourceCanvas.width;

    canvas.height = sourceCanvas.height;

    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const data = imageData.data;

    for(let i = 0; i < data.length; i += 4){

        const gray =
            data[i] * 0.299 +
            data[i + 1] * 0.587 +
            data[i + 2] * 0.114;

        const value = gray > 170 ? 255 : 0;

        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas;

}