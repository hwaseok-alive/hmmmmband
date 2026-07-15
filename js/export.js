/*
========================================================
BAND Chat Backup
export.js
========================================================
*/


/*========================================================
채팅 영역
========================================================*/

function getExportTarget(){

    return document.getElementById("chat-wrapper");

}


/*========================================================
PNG 저장
========================================================*/

async function exportPNG(){

    const target=getExportTarget();

    document.body.classList.add("export-mode");

    const canvas=await html2canvas(target,{

        scale:CONFIG.EXPORT_SCALE,

        backgroundColor:null,

        useCORS:true

    });

    document.body.classList.remove("export-mode");

    const link=document.createElement("a");

    link.download=

        CONFIG.EXPORT_FILENAME+".png";

    link.href=

        canvas.toDataURL("image/png");

    link.click();

}


/*========================================================
PDF 저장
========================================================*/

async function exportPDF(){

    const target=getExportTarget();

    document.body.classList.add("export-mode");

    const canvas=await html2canvas(target,{

        scale:CONFIG.EXPORT_SCALE,

        backgroundColor:null,

        useCORS:true

    });

    document.body.classList.remove("export-mode");


    const img=

        canvas.toDataURL("image/png");

    const pdf=

        new jspdf.jsPDF({

            orientation:"p",

            unit:"px",

            format:[

                canvas.width,

                canvas.height

            ]

        });

    pdf.addImage(

        img,

        "PNG",

        0,

        0,

        canvas.width,

        canvas.height

    );

    pdf.save(

        CONFIG.EXPORT_FILENAME+".pdf"

    );

}


/*========================================================
HTML 복사
========================================================*/

async function copyHTML(){

    const html=

        document.getElementById(

            "chat-container"

        ).innerHTML;

    await navigator.clipboard.writeText(html);

    alert("HTML이 복사되었습니다.");

}


/*========================================================
이미지 복사
========================================================*/

async function copyImage(){

    const target=getExportTarget();

    const canvas=await html2canvas(target,{

        scale:CONFIG.EXPORT_SCALE,

        backgroundColor:null,

        useCORS:true

    });

    canvas.toBlob(async blob=>{

        await navigator.clipboard.write([

            new ClipboardItem({

                "image/png":blob

            })

        ]);

        alert("이미지가 복사되었습니다.");

    });

}


/*========================================================
저장 메뉴
========================================================*/

function initExport(){

    document

        .getElementById("save-png")

        .addEventListener(

            "click",

            exportPNG

        );


    document

        .getElementById("save-pdf")

        .addEventListener(

            "click",

            exportPDF

        );


    document

        .getElementById("copy-html")

        .addEventListener(

            "click",

            copyHTML

        );


    document

        .getElementById("copy-image")

        .addEventListener(

            "click",

            copyImage

        );

}