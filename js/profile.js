/*
========================================================
BAND Chat Backup
profile.js
========================================================
*/


/*========================================================
프로필 이벤트
========================================================*/

function initProfileEvents(){

    document

        .getElementById("profile-list")

        .addEventListener(

            "change",

            onProfileChange

        );

}


/*========================================================
프로필 업로드
========================================================*/

function onProfileChange(event){

    const input=event.target;

    if(input.type!=="file"){

        return;

    }

    const file=input.files[0];

    if(!file){

        return;

    }

    const speaker=input.dataset.speaker;

    const reader=new FileReader();

    reader.onload=function(e){

        state.avatars[speaker]=e.target.result;

        saveAvatar(speaker);

        refreshAvatar(speaker);

    };

    reader.readAsDataURL(file);

}


/*========================================================
프로필 새로고침
========================================================*/

function refreshAvatar(speaker){

    document

        .querySelectorAll(

            `img[data-speaker="${speaker}"]`

        )

        .forEach(img=>{

            img.src=state.avatars[speaker];

        });


    renderChat();

}


/*========================================================
프로필 저장
========================================================*/

function saveAvatar(speaker){

    const data=

        JSON.parse(

            localStorage.getItem(

                CONFIG.STORAGE_KEY

            ) || "{}"

        );

    data[speaker]=state.avatars[speaker];

    localStorage.setItem(

        CONFIG.STORAGE_KEY,

        JSON.stringify(data)

    );

}


/*========================================================
프로필 불러오기
========================================================*/

function loadAvatars(){

    const data=

        JSON.parse(

            localStorage.getItem(

                CONFIG.STORAGE_KEY

            ) || "{}"

        );

    Object.keys(data).forEach(name=>{

        state.avatars[name]=data[name];

    });

}


/*========================================================
프로필 삭제
========================================================*/

function removeAvatar(name){

    delete state.avatars[name];

    saveAvatar(name);

    renderChat();

}