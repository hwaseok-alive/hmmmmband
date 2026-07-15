/*
========================================================
BAND Chat Backup
renderer.js
Part 1
========================================================
*/


/*========================================================
채팅 출력
========================================================*/

function renderChat(){

    const container=document.getElementById("chat-container");

    container.innerHTML="";

    const messages=getMessages();

    if(messages.length===0){

        container.innerHTML=`

            <div class="system-message">

                표시할 대화가 없습니다.

            </div>

        `;

        return;

    }

    let previousSpeaker=null;

    let currentGroup=null;

    messages.forEach(message=>{

        if(previousSpeaker!==message.speaker){

            currentGroup=createChatGroup(message);

            container.appendChild(currentGroup);

            previousSpeaker=message.speaker;

        }

        appendBubble(currentGroup,message);

    });

}


/*========================================================
대화 그룹 생성
========================================================*/

function createChatGroup(message){

    const group=document.createElement("div");

    const isMine=

        message.speaker===state.myName;

    group.className=

        `chat-group ${isMine?"my":"other"}`;

    group.innerHTML=`

        <div class="message-row">

            <div class="avatar">

                <img src="${getAvatar(message.speaker)}">

            </div>

            <div class="message-body">

                <div class="speaker-name">

                    ${message.speaker}

                </div>

                <div class="message-stack">

                </div>

            </div>

        </div>

    `;

    return group;

}


/*========================================================
말풍선 추가
========================================================*/

function appendBubble(group,message){

    const stack=

        group.querySelector(".message-stack");

    const bubble=

        document.createElement("div");

    bubble.className="message-content";

    bubble.textContent=message.message;

    stack.appendChild(bubble);

}

/*
========================================================
BAND Chat Backup
renderer.js
Part 1
========================================================
*/


/*========================================================
채팅 출력
========================================================*/

function renderChat(){

    const container=document.getElementById("chat-container");

    container.innerHTML="";

    const messages=getMessages();

    if(messages.length===0){

        container.innerHTML=`

            <div class="system-message">

                표시할 대화가 없습니다.

            </div>

        `;

        return;

    }

    let previousSpeaker=null;

    let currentGroup=null;

    messages.forEach(message=>{

        if(previousSpeaker!==message.speaker){

            currentGroup=createChatGroup(message);

            container.appendChild(currentGroup);

            previousSpeaker=message.speaker;

        }

        appendBubble(currentGroup,message);

    });

}


/*========================================================
대화 그룹 생성
========================================================*/

function createChatGroup(message){

    const group=document.createElement("div");

    const isMine=

        message.speaker===state.myName;

    group.className=

        `chat-group ${isMine?"my":"other"}`;

    group.innerHTML=`

        <div class="message-row">

            <div class="avatar">

                <img src="${getAvatar(message.speaker)}">

            </div>

            <div class="message-body">

                <div class="speaker-name">

                    ${message.speaker}

                </div>

                <div class="message-stack">

                </div>

            </div>

        </div>

    `;

    return group;

}


/*========================================================
말풍선 추가
========================================================*/

function appendBubble(group,message){

    const stack=

        group.querySelector(".message-stack");

    const bubble=

        document.createElement("div");

    bubble.className="message-content";

    bubble.textContent=message.message;

    stack.appendChild(bubble);

}