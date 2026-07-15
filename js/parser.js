/*
========================================================
BAND Chat Backup
parser.js
Part 1
OCR 텍스트 정리
========================================================
*/


/*========================================================
OCR 결과 파싱 시작
========================================================*/

function parseText(rawText){

    const text = normalizeText(rawText);

    const lines = splitLines(text);

    const cleaned = removeGarbage(lines);

    parseMessages(cleaned);

}


/*========================================================
줄바꿈 정리
========================================================*/

function normalizeText(text){

    return text

        .replace(/\r/g,"\n")

        .replace(/\n+/g,"\n")

        .replace(/[ \t]+/g," ")

        .trim();

}


/*========================================================
라인 분리
========================================================*/

function splitLines(text){

    return text

        .split("\n")

        .map(line=>line.trim())

        .filter(line=>line.length>0);

}


/*========================================================
OCR 쓰레기 제거
========================================================*/

function removeGarbage(lines){

    const ignoreWords=[

        "답글 보기",

        "답글쓰기",

        "답글 쓰기",

        "좋아요",

        "댓글",

        "공유",

        "삭제",

        "신고",

        "잠금",

        "반응",

        "표정짓기",

        "사진",

        "동영상",

        "원본 보기",

        "GIF",

        "앨범",

        "댓글을 남겨주세요.",

        "댓글 남기기"

    ];

    return lines.filter(line=>{

        if(!line) return false;

        if(ignoreWords.includes(line)){

            return false;

        }

        return true;

    });

}


/*========================================================
시간 여부
========================================================*/

function isTimeLine(line){

    return /(\d+)\s*(초|분|시간|일|주|개월|달|년)\s*전/.test(line);

}


/*========================================================
멘션 여부
========================================================*/

function isMention(line){

    return line.startsWith("@");

}


/*========================================================
이름 후보
========================================================*/

function isSpeakerLine(line){

    line = fixOCR(line);

    if(!line){

        return false;

    }

    if(isTimeLine(line)){

        return false;

    }

    if(isMention(line)){

        return false;

    }

    if(line.startsWith("@")){

        return false;

    }

    if(line.length > 40){

        return false;

    }

    if(/답글|좋아요|댓글|공유|삭제|신고/.test(line)){

        return false;

    }

    return /^[가-힣A-Za-z0-9 .·]+(?:\s+\d+.*)?$/.test(line);

}


/*========================================================
OCR 오류 수정
========================================================*/

function fixOCR(line){

    return line

        .replace(/시 간/g,"시간")

        .replace(/답 글/g,"답글")

        .replace(/좋 아요/g,"좋아요")

        .replace(/\s+,/g,",")

        .trim();

}

/*
========================================================
Part 2
메시지 객체 생성
========================================================
*/


/*========================================================
메시지 파싱
========================================================*/

function parseMessages(lines){

    const messages=[];

    let currentSpeaker="";

    let currentTime="";

    let currentMessage=[];

for(let i=0;i<lines.length;i++){

    let line = fixOCR(lines[i]);

    /* 이름 다음 줄이 직급이면 합치기 */
    if(
        i + 1 < lines.length &&
        /^\d+\s*,/.test(lines[i + 1])
    ){
        line += " " + lines[i + 1];
        i++;
    }

    if(isSpeakerLine(line)){

        saveCurrentMessage();

        currentSpeaker = extractSpeaker(line);

        currentTime = "";

        continue;

    }
        }


        /* 시간 */

        if(isTimeLine(line)){

            currentTime=line;

            continue;

        }


        /* 본문 */

        currentMessage.push(line);

    }


    pushMessage();


    state.messages=messages;

    state.filteredMessages=[...messages];


    buildSpeakerList();


    renderChat();


}



/*========================================================
메시지 저장
========================================================*/

function pushMessage(){

    if(!currentSpeaker){

        currentMessage=[];

        return;

    }

    const text=currentMessage

        .join("\n")

        .trim();

    if(!text){

        currentMessage=[];

        return;

    }

    const mentions =

    text.match(/@[^\s]+/g) || [];

messages.push({

    speaker: currentSpeaker,

    message: text,

    mentions: mentions,

    time: currentTime,

    avatar: null

});



/*========================================================
이름 추출
========================================================*/

function extractSpeaker(line){

    line = fixOCR(line);

    line = line.replace(/\s+/g," ").trim();

    /* 직급 제거
       예) 50, 형사과
       예) 54, 경위반
    */
    line = line.replace(/\d+\s*,\s*.*$/,"");

    /* OCR이 숫자를 이름 뒤에 붙인 경우 */
    line = line.replace(/\s+\d+$/,"");

    /* 특수문자 제거 */
    line = line.replace(/[|│｜]+/g,"");

    line = line.trim();

    return line;

}


/*========================================================
화자 목록 생성
========================================================*/

function buildSpeakerList(){

    state.speakers=[];

    state.messages.forEach(msg=>{

        if(!state.speakers.includes(msg.speaker)){

            state.speakers.push(msg.speaker);

        }

    });

}



/*========================================================
댓글 개수
========================================================*/

function countSpeakerMessages(name){

    return state.messages.filter(

        msg=>msg.speaker===name

    ).length;

}

/*
========================================================
Part 3
화자 / 드롭다운 / 프로필
========================================================
*/


/*========================================================
드롭다운 생성
========================================================*/

function updateSpeakerSelect(){

    const mySelect=document.getElementById("my-speaker");

    const targetSelect=document.getElementById("target-speaker");

    mySelect.innerHTML="";

    targetSelect.innerHTML="";


    mySelect.appendChild(

        new Option("자동 감지","")

    );


    targetSelect.appendChild(

        new Option("전체 대화","all")

    );


    state.speakers.forEach(name=>{

        const count=countSpeakerMessages(name);

        mySelect.appendChild(

            new Option(

                `${name} (${count})`,

                name

            )

        );

        targetSelect.appendChild(

            new Option(

                `${name} (${count})`,

                name

            )

        );

    });

}


/*========================================================
프로필 목록 생성
========================================================*/

function buildProfileList(){

    const container=

        document.getElementById("profile-list");

    container.innerHTML="";


    state.speakers.forEach(name=>{

        const card=document.createElement("div");

        card.className="profile-setting";


        card.innerHTML=`

            <div class="avatar-preview">

                <img

                    src="${CONFIG.DEFAULT_AVATAR}"

                    data-speaker="${name}">

            </div>

            <div class="profile-info">

                <label>${name}</label>

                <input

                    type="file"

                    accept="image/*"

                    data-speaker="${name}">

            </div>

        `;


        container.appendChild(card);

    });

}


/*========================================================
내 이름 자동 감지
========================================================*/

function detectMyName(){

    if(state.myName){

        return;

    }

}


/*========================================================
필터
========================================================*/

function filterMessages(){

    if(state.targetSpeaker==="all"){

        state.filteredMessages=[

            ...state.messages

        ];

    }

    else{

        state.filteredMessages=

        state.messages.filter(msg=>

            msg.speaker===state.targetSpeaker ||

            msg.speaker===state.myName

        );

    }

}


/*========================================================
초기화
========================================================*/

function prepareConversation(){

    detectMyName();

    updateSpeakerSelect();

    buildProfileList();

    filterMessages();

    renderChat();

}

/*
========================================================
BAND Chat Backup
parser.js
V2 Part 2
메시지 생성
========================================================
*/


/*========================================================
메시지 파싱
========================================================*/

function parseMessages(lines){

    const messages=[];

    let currentSpeaker="";
    let currentRank="";
    let currentTime="";
    let currentMessage=[];

    function saveMessage(){

        if(!currentSpeaker){

            currentMessage=[];

            return;

        }

        const text=currentMessage

            .join("\n")

            .trim();

        if(text.length===0){

            currentMessage=[];

            return;

        }

        messages.push({

            speaker:currentSpeaker,

            rank:currentRank,

            mentions:getMentions(text),

            message:text,

            time:currentTime,

            avatar:null

        });

        currentMessage=[];

    }

    for(let i=0;i<lines.length;i++){

        let line=lines[i];

        /* 이름 */

        if(isSpeakerLine(line)){

            saveMessage();

            currentSpeaker=line;

            currentRank="";

            currentTime="";

            continue;

        }

        /* 직급 */

        if(isRankLine(line)){

            currentRank=line;

            continue;

        }

        /* 시간 */

        if(isTimeLine(line)){

            currentTime=line;

            continue;

        }

        /* 본문 */

        currentMessage.push(line);

    }

    saveMessage();

    state.messages=messages;

    state.filteredMessages=[...messages];

    buildSpeakerList();

    prepareConversation();

}


/*========================================================
멘션
========================================================*/

function getMentions(text){

    return text.match(/@[^\s]+/g) || [];

}


/*========================================================
화자 목록
========================================================*/

function buildSpeakerList(){

    state.speakers=[];

    state.messages.forEach(message=>{

        if(

            !state.speakers.includes(

                message.speaker

            )

        ){

            state.speakers.push(

                message.speaker

            );

        }

    });

}

/*
========================================================
BAND Chat Backup
parser.js
V2 Part 3
드롭다운 / 프로필 / 필터
========================================================
*/


/*========================================================
내 이름
========================================================*/

function detectMyName(){

    if(state.myName){

        return;

    }

}


/*========================================================
드롭다운
========================================================*/

function updateSpeakerSelect(){

    const my=document.getElementById("my-speaker");

    const target=document.getElementById("target-speaker");

    my.innerHTML="";

    target.innerHTML="";


    my.appendChild(

        new Option(

            "내 이름 선택",

            ""

        )

    );


    target.appendChild(

        new Option(

            "전체 대화",

            "all"

        )

    );


    state.speakers.forEach(name=>{

        const count=countSpeakerMessages(name);

        my.appendChild(

            new Option(

                `${name} (${count})`,

                name

            )

        );

        target.appendChild(

            new Option(

                `${name} (${count})`,

                name

            )

        );

    });

}


/*========================================================
댓글 수
========================================================*/

function countSpeakerMessages(name){

    return state.messages.filter(

        message=>

        message.speaker===name

    ).length;

}


/*========================================================
프로필 목록
========================================================*/

function buildProfileList(){

    const container=

        document.getElementById(

            "profile-list"

        );

    container.innerHTML="";


    state.speakers.forEach(name=>{

        const item=

            document.createElement("div");

        item.className=

            "profile-setting";


        item.innerHTML=`

<div class="avatar-preview">

<img

src="${state.avatars[name] || CONFIG.DEFAULT_AVATAR}"

data-speaker="${name}">

</div>

<div class="profile-info">

<label>${name}</label>

<input

type="file"

accept="image/*"

data-speaker="${name}">

</div>

`;


        container.appendChild(item);

    });

}


/*========================================================
필터
========================================================*/

function filterMessages(){

    if(

        state.targetSpeaker==="all"

    ){

        state.filteredMessages=[

            ...state.messages

        ];

        return;

    }


    state.filteredMessages=

        state.messages.filter(

            message=>

                message.speaker===

                state.myName

                ||

                message.speaker===

                state.targetSpeaker

        );

}


/*========================================================
초기화
========================================================*/

function prepareConversation(){

    detectMyName();

    updateSpeakerSelect();

    buildProfileList();

    filterMessages();

    renderChat();

}
