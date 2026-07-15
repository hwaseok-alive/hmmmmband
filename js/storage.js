/*
========================================================
BAND Chat Backup
storage.js
========================================================
*/


/*========================================================
저장
========================================================*/

function saveSettings(){

    const data={

        myName:state.myName,

        targetSpeaker:state.targetSpeaker,

        showProfile:state.showProfile,

        showName:state.showName,

        showTime:state.showTime,

        showSystem:state.showSystem,

        darkMode:state.darkMode,

        avatars:state.avatars

    };

    localStorage.setItem(

        CONFIG.STORAGE_KEY,

        JSON.stringify(data)

    );

}


/*========================================================
불러오기
========================================================*/

function loadSettings(){

    const json=

        localStorage.getItem(

            CONFIG.STORAGE_KEY

        );

    if(!json){

        return;

    }

    const data=JSON.parse(json);

    state.myName=data.myName || "";

    state.targetSpeaker=data.targetSpeaker || "all";

    state.showProfile=data.showProfile ?? true;

    state.showName=data.showName ?? true;

    state.showTime=data.showTime ?? true;

    state.showSystem=data.showSystem ?? false;

    state.darkMode=data.darkMode ?? false;

    state.avatars=data.avatars || {};

}


/*========================================================
초기화
========================================================*/

function resetStorage(){

    localStorage.removeItem(

        CONFIG.STORAGE_KEY

    );

}


/*========================================================
설정 적용
========================================================*/

function applySettings(){

    document.getElementById(

        "show-profile"

    ).checked=

        state.showProfile;

    document.getElementById(

        "show-name"

    ).checked=

        state.showName;

    document.getElementById(

        "show-time"

    ).checked=

        state.showTime;

    document.getElementById(

        "show-system"

    ).checked=

        state.showSystem;

    document.getElementById(

        "my-speaker"

    ).value=

        state.myName;

    document.getElementById(

        "target-speaker"

    ).value=

        state.targetSpeaker;

}


/*========================================================
자동 저장
========================================================*/

function autoSave(){

    saveSettings();

}