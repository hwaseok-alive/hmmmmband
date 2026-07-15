// 1. PDF.js Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// DOM 요소 정의
const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');
const exportBtn = document.getElementById('btn-export');

// 필터 버튼들
const btnAll = document.getElementById('btn-all');
const btnAlejandro = document.getElementById('btn-alejandro');
const btnTorben = document.getElementById('btn-torben');

// 파싱된 전체 대화 데이터를 저장할 배열
let allMessages = []; 
let currentFilter = 'all'; // 'all', 'alejandro', 'torben'

// 내 이름 설정 (나와 상대를 구분하는 기준)
const MY_NAME = '콘스탄틴 하벨';

// 2. 파일 업로드 이벤트
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    chatContainer.innerHTML = '<div class="system-message">PDF 문서 분석 중...</div>';
    exportBtn.disabled = true;

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
            let maxPages = pdf.numPages;
            let countPromises = [];

            for (let i = 1; i <= maxPages; i++) {
                countPromises.push(
                    pdf.getPage(i).then(function(page) {
                        return page.getTextContent().then(function(textContent) {
                            // 줄바꿈 보존을 위해 각 텍스트 객체의 위치를 고려하여 병합
                            return textContent.items.map(item => item.str).join('\n');
                        });
                    })
                );
            }

            Promise.all(countPromises).then(function(pageTexts) {
                const fullText = pageTexts.join('\n');
                if (!fullText.trim()) {
                    throw new Error("PDF에서 텍스트를 추출하지 못했습니다.");
                }
                
                // 텍스트 분석하여 메모리에 저장
                parseMessages(fullText);
                
                // 화면에 렌더링
                renderChat();
                
                // 이미지 저장 버튼 활성화
                exportBtn.disabled = false;
            }).catch(function(err) {
                showError("분석 실패: " + err.message);
            });
        }).catch(function(error) {
            showError("PDF 로드 실패: " + error.message);
        });
    };
    fileReader.readAsArrayBuffer(file);
});

// 3. 추출된 텍스트 구조 분석 (이름과 메시지 매칭)
function parseMessages(text) {
    allMessages = []; // 초기화
    const lines = text.split('\n');

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // "이름 내용" 혹은 "이름: 내용" 패턴 분석
        if (trimmed.includes('@') || trimmed.includes(':')) {
            // 정규식이나 특정 문자 분할을 통해 파싱
            let speaker = "";
            let message = trimmed;

            if (trimmed.includes(':')) {
                const idx = trimmed.indexOf(':');
                speaker = trimmed.substring(0, idx).trim();
                message = trimmed.substring(idx + 1).trim();
            } else if (trimmed.startsWith('@')) {
                // 언급 형태 처리
                speaker = "시스템";
                message = trimmed;
            }

            // 언급 문자나 본문 정돈
            if (speaker) {
                allMessages.push({ speaker, message });
                return;
            }
        }

        // 특정 핵심 인물 이름이 포함되어 있는 줄 분석 (스크랩 텍스트 구조 맞춤)
        if (trimmed.startsWith('콘스탄틴 하벨') || trimmed.startsWith('콘스탄틴 하별')) {
            allMessages.push({ speaker: MY_NAME, message: trimmed.replace(/콘스탄틴\s*하[벨별]/, '').trim() });
        } else if (trimmed.startsWith('알레한드로 골리코프') || trimmed.startsWith('알레한드로 콜리코프') || trimmed.startsWith('열레한드로 골려코프')) {
            allMessages.push({ speaker: '알레한드로 골리코프', message: trimmed.replace(/알레한드로\s*골리코프|알레한드로\s*콜리코프|열레한드로\s*골려코프/, '').trim() });
        } else if (trimmed.startsWith('토르벤') || trimmed.startsWith('토르밴')) {
            allMessages.push({ speaker: '토르벤 파트로소프', message: trimmed.replace(/토르벤|토르밴\s*파트로소프/, '').trim() });
        } else {
            // 이외의 줄들은 이전 메시지에 이어 붙이거나 일반 텍스트로 임시 저장
            if (allMessages.length > 0) {
                allMessages[allMessages.length - 1].message += " " + trimmed;
            } else {
                allMessages.push({ speaker: "알 수 없음", message: trimmed });
            }
        }
    });
}

// 4. 필터링 상태에 따른 대화창 화면 그리기
function renderChat() {
    chatContainer.innerHTML = '';

    if (allMessages.length === 0) {
        chatContainer.innerHTML = '<div class="system-message font-red">데이터가 없습니다.</div>';
        return;
    }

    allMessages.forEach(msg => {
        // 필터링 적용
        if (currentFilter === 'alejandro' && msg.speaker !== '알레한드로 골리코프' && msg.speaker !== MY_NAME) return;
        if (currentFilter === 'torben' && msg.speaker !== '토르벤 파트로소프' && msg.speaker !== MY_NAME) return;

        // 나(my) 또는 상대방(other) 클래스 지정
        const isMyMessage = msg.speaker.includes(MY_NAME);
        const messageClass = isMyMessage ? 'my' : 'other';

        // 멘션 문자(@이름) 링크 스타일 입히기
        const formattedMessage = msg.message.replace(/(@[^\s]+)/g, '<span style="color: #1e40af; font-weight: bold;">$1</span>');

        const msgElement = document.createElement('div');
        msgElement.className = `message-item ${messageClass}`;
        msgElement.innerHTML = `
            <div class="speaker-name"><strong>${msg.speaker}</strong></div>
            <div class="message-content">${formattedMessage}</div>
        `;
        chatContainer.appendChild(msgElement);
    });

    // 스크롤 아래로 내리기
    const chatWrapper = document.querySelector('.chat-wrapper');
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
}

// 5. 필터 버튼 이벤트 설정
btnAll.addEventListener('click', () => { setActiveFilter('all', btnAll); });
btnAlejandro.addEventListener('click', () => { setActiveFilter('alejandro', btnAlejandro); });
btnTorben.addEventListener('click', () => { setActiveFilter('torben', btnTorben); });

function setActiveFilter(filter, activeBtn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
    renderChat();
}

// 6. 대화창 영역 이미지(PNG) 파일로 다운로드 추출 기능
exportBtn.addEventListener('click', function() {
    const target = document.querySelector('.chat-wrapper');
    
    // 캡처를 위해 잠시 스크롤 제한을 풀고 전체 화면 크기 확보
    const originalHeight = target.style.height;
    target.style.height = 'auto';

    html2canvas(target, {
        useCORS: true, // 외부 이미지 로딩 대비
        backgroundColor: '#b2c7da', // 카톡 배경 고정
        scrollY: -window.scrollY
    }).then(canvas => {
        // 복원
        target.style.height = originalHeight;

        // 이미지 파일 다운로드 링크 생성
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `chat_export_${currentFilter}.png`;
        link.href = image;
        link.click();
    }).catch(err => {
        alert("이미지 저장 중 오류가 발생했습니다: " + err.message);
    });
});

function showError(message) {
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e;">⚠️ ${message}</div>`;
}
