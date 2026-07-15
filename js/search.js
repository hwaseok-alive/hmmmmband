/*
========================================================
BAND Chat Backup
search.js
========================================================
*/


/*========================================================
검색 초기화
========================================================*/

function initSearch(){

    const input=document.getElementById("search-box");

    let timer=null;

    input.addEventListener("input",()=>{

        clearTimeout(timer);

        timer=setTimeout(()=>{

            state.searchKeyword=input.value.trim();

            applySearch();

        },CONFIG.SEARCH_DELAY);

    });

}


/*========================================================
검색
========================================================*/

function applySearch(){

    const keyword=state.searchKeyword.toLowerCase();

    if(keyword===""){

        renderChat();

        return;

    }

    state.filteredMessages=

        state.messages.filter(message=>{

            return(

                message.speaker

                .toLowerCase()

                .includes(keyword)

                ||

                message.message

                .toLowerCase()

                .includes(keyword)

            );

        });

    renderChat();

}


/*========================================================
검색 강조
========================================================*/

function highlightKeyword(text){

    const keyword=state.searchKeyword;

    if(keyword===""){

        return text;

    }

    const escaped=

        keyword.replace(

            /[.*+?^${}()|[\]\\]/g,

            "\\$&"

        );

    const regex=

        new RegExp(

            escaped,

            "gi"

        );

    return text.replace(

        regex,

        `<mark>$&</mark>`

    );

}


/*========================================================
검색 초기화
========================================================*/

function clearSearch(){

    state.searchKeyword="";

    document.getElementById(

        "search-box"

    ).value="";

    renderChat();

}