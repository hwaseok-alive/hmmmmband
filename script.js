// 1. PDF.js 라이브러리 구동을 위한 Worker 경로 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// 엘리먼트 가져오기
const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');

// 2. 파일이 선택되었을 때 실행되는 이벤트
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 선택된 파일 이름 화면에 표시
    fileNameDisplay.textContent = file.name;
    
    // 로딩 상태 표시
    chatContainer.innerHTML = '<div class="system-message">PDF 문서 내용을 분석하고 있습니다. 잠시만 기다려주세요...</div>';

    const fileReader = new FileReader();
    
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);

        // PDF 문서 열기
        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
            let maxPages = pdf.numPages;
            let countPromises = [];

            // 각 페이지 돌면서 텍스트 정보 추출하기
            for (let i = 1; i <= maxPages; i++) {
                countPromises.push(
                    pdf.getPage(i).then(function(page) {
                        return page.getTextContent().then(function(textContent) {
                            return textContent.items.map(item => item.str).join(' ');
                        });
                    })
                );
            }

            // 모든 페이지의 텍스트가 전부 수집되면 실행
            Promise.all(countPromises).then(function(pageTexts) {
                const fullText = pageTexts.join('\n');
                
                if (!fullText.trim()) {
                    throw new Error("PDF 내부에서 추출된 텍스트가 없습니다. (이미지 전용 PDF일 가능성이 있습니다.)");
                }

                // 대화창에 그리기 함수 실행
                parseAndRenderChat(fullText);
            }).catch(function(err) {
                showError("텍스트 추출 실패: " + err.message);
            });

        }).catch(function(error) {
            showError("PDF 문서 로딩 실패: " + error.message);
        });
    };

    fileReader.onerror = function() {
        showError("파일을 읽어오는 중에 실패했습니다.");
    };

    fileReader.readAsArrayBuffer(file);
});

// 3. 추출된 전체 텍스트에서 '작성자'와 '내용' 구분하여 대화창 생성하는 로직
function parseAndRenderChat(text) {
    chatContainer.innerHTML = ''; // 화면 비우기

    const lines = text.split('\n');
    let hasMessages = false;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        if (trimmedLine.includes(':')) {
            const separatorIndex = trimmedLine.indexOf(':');
            const speaker = trimmedLine.substring(0, separatorIndex).trim();
            const message = trimmedLine.substring(separatorIndex + 1).trim();

            if (speaker && message) {
                appendMessageHTML(speaker, message);
                hasMessages = true;
            }
        } else {
            appendMessageHTML("이름 없음", trimmedLine);
            hasMessages = true;
        }
    });

    if (!hasMessages) {
        chatContainer.innerHTML = '<div class="system-message">텍스트 분석에 실패했습니다. 형식 일치 여부를 확인해 주세요.</div>';
    }
}

// 4. 대화창에 말풍선 엘리먼트 추가
function appendMessageHTML(speaker, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message-item';
    
    messageElement.innerHTML = `
        <div class="speaker-name"><strong>${speaker}</strong></div>
        <div class="message-content">${message}</div>
    `;
    
    chatContainer.appendChild(messageElement);
    
    const chatWrapper = document.querySelector('.chat-wrapper');
    if (chatWrapper) {
        chatWrapper.scrollTop = chatWrapper.scrollHeight;
    }
}

// 에러 발생 시 공통 처리 함수
function showError(message) {
    console.error(message);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e;">⚠️ ${message}</div>`;
    alert(message);
}
