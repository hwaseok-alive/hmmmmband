/*
========================================================
BAND Chat Backup
ui.js
========================================================
*/


/*========================================================
초기화
========================================================*/

function initUI(){

    bindFileEvent();

    bindSelectEvent();

    bindCheckBox();

    bindTheme();

    bindCancelButton();

}


/*========================================================
파일 업로드
========================================================*/

function bindFileEvent(){

    document

        .getElementById("pdf-upload")

        .addEventListener(

            "change",

            event=>{

                const file=

                    event.target.files[0];

                if(file){

                    openFile(file);

                }

            }

        );

}


/*========================================================
내 이름
========================================================*/

function bindSelectEvent(){

    document

        .getElementById("my-speaker")

        .addEventListener(

            "change",

            event=>{

                state.myName=

                    event.target.value;

                filterMessages();

                renderChat();

                saveSettings();

            }

        );

    document

        .getElementById("target-speaker")

        .addEventListener(

            "change",

            event=>{

                state.targetSpeaker=

                    event.target.value;

                filterMessages();

                renderChat();

                saveSettings();

            }

        );

}


/*========================================================
체크박스
========================================================*/

function bindCheckBox(){

    document

        .getElementById("show-profile")

        .addEventListener(

            "change",

            event=>{

                state.showProfile=

                    event.target.checked;

                updateProfileVisible();

                saveSettings();

            }

        );


    document

        .getElementById("show-name")

        .addEventListener(

            "change",

            event=>{

                state.showName=

                    event.target.checked;

                updateNameVisible();

                saveSettings();

            }

        );


    document

        .getElementById("show-time")

        .addEventListener(

            "change",

            event=>{

                state.showTime=

                    event.target.checked;

                updateTimeVisible();

                saveSettings();

            }

        );


    document

        .getElementById("show-system")

        .addEventListener(

            "change",

            event=>{

                state.showSystem=

                    event.target.checked;

                renderChat();

                saveSettings();

            }

        );

}


/*========================================================
다크모드
========================================================*/

function bindTheme(){

    document

        .getElementById("theme-toggle")

        .addEventListener(

            "click",

            ()=>{

                state.darkMode=

                    !state.darkMode;

                document.body.classList.toggle(

                    "dark",

                    state.darkMode

                );

                saveSettings();

            }

        );

}


/*========================================================
OCR 취소
========================================================*/

function bindCancelButton(){

    document

        .getElementById("cancel-btn")

        .addEventListener(

            "click",

            ()=>{

                cancelOCR();

            }

        );

}