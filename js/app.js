/*
========================================================
BAND Chat Backup
app.js
프로젝트 시작
========================================================
*/

document.addEventListener(

    "DOMContentLoaded",

    ()=>{

        startApp();

    }

);


/*========================================================
시작
========================================================*/

function startApp(){

    loadSettings();

    initUI();

    initSearch();

    initExport();

    initProfileEvents();

    applySettings();

    applyTheme();

    renderChat();

}


/*========================================================
다크모드 적용
========================================================*/

function applyTheme(){

    document.body.classList.toggle(

        "dark",

        state.darkMode

    );

}


/*========================================================
전체 새로고침
========================================================*/

function refreshApp(){

    filterMessages();

    renderChat();

}


/*========================================================
파일 불러온 후
========================================================*/

function onConversationLoaded(){

    prepareConversation();

    applySettings();

    refreshApp();

}


/*========================================================
에러
========================================================*/

window.addEventListener(

    "error",

    event=>{

        console.error(

            "[BAND Backup]",

            event.error

        );

    }

);