/*
========================================================
BAND Chat Backup
state.js
프로그램 상태 관리
========================================================
*/

const state = {

    /* 현재 파일 */

    currentFile: null,

    currentFileType: null,


    /* OCR */

    isProcessing: false,

    cancelOCR: false,

    rawText: "",


    /* PDF */

    pageCount: 0,

    currentPage: 0,


    /* 대화 */

    messages: [],

    filteredMessages: [],


    /* 화자 */

    speakers: [],

    myName: "",

    targetSpeaker: "all",


    /* 프로필 */

    avatars: {},


    /* 검색 */

    searchKeyword: "",


    /* UI */

    darkMode: false,

    showProfile: true,

    showName: true,

    showTime: true,

    showSystem: false

};


/*========================================================
상태 초기화
========================================================*/

function resetState(){

    state.currentFile = null;

    state.currentFileType = null;

    state.isProcessing = false;

    state.cancelOCR = false;

    state.rawText = "";

    state.pageCount = 0;

    state.currentPage = 0;

    state.messages = [];

    state.filteredMessages = [];

    state.speakers = [];

    state.myName = "";

    state.targetSpeaker = "all";

    state.avatars = {};

    state.searchKeyword = "";

}


/*========================================================
현재 메시지 반환
========================================================*/

function getMessages(){

    if(state.targetSpeaker === "all"){

        return state.messages;

    }

    return state.filteredMessages;

}