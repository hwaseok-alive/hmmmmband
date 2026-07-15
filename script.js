// 1. PDF.js Worker 고정 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// DOM 요소 정의
const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');
const exportBtn = document.getElementById('btn-export');
const speakerSelect = document.getElementById('speaker-select');

// 내 이름 (우측 정렬용 고정값)
const MY_NAME = '콘스탄틴 하벨';

let allMessages = []; // 파싱된 전체 데이터
let detectedSpeakers = new Set(); // 자동으로 감지한 상대방 목록

// 2. 파일 업로드 이벤트
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    chatContainer.innerHTML = '<div class="system-message">PDF 데이터를 분석하고 있습니다...</div>';
    exportBtn.disabled = true;
    
    // 드롭다운 초기화
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';

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
                            // 줄바꿈이 파편화되는 문제를 막기 위해 줄 구분 문자로 확실하게 결합
                            return textContent.items.map(item => item.str).join('\n');
                        });
                    })
                );
            }

            Promise.all(countPromises).then(function(pageTexts) {
                // PDF 내의 텍스트가 모두 병합됨
                const fullText = pageTexts.join('\n');
                
                // 텍스트 분석 실행
                parseMessages(fullText);
                
                if (allMessages.length === 0) {
                    throw new Error("PDF에서 대화 데이터 형태를 추출할 수 없습니다. 텍스트 레이어를 다시 확인해 주세요.");
                }

                // 3. 상대방 목록을 바탕으로 드롭다운 자동 갱신
                updateSpeakerDropdown();
                
                // 4. 화면 렌더링 및 다운로드 버튼 활성화
                renderChat();
                exportBtn.disabled = false;
                
            }).catch(function(err) {
                showError("분석 실패: " + err.message);
            });
        }).catch(function(error) {
            showError("PDF 로딩 실패: " + error.message);
        });
    };
    fileReader.readAsArrayBuffer(file);
});

// 3. 네이버 밴드 스타일 텍스트 구조 동적 분석 엔진
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const lines = text.split('\n');
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 메신저 이름 분석 패턴 (예: "이름 54, " 또는 "이름 50, 사과" 등)
        // 뒤에 숫자가 오거나 밴드 정보가 붙은 구역을 이름으로 매칭
        const namePattern = /^([가-힣\s]+)\s*(?:\d{2}|형사과|검사가|현사과|학|사)/;
        const match = trimmed.match(namePattern);

        if (match) {
            // 이전에 수집 중이던 대화가 있다면 먼저 큐에 삽입
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
            }

            // 새로운 스피커 감지 및 한글 정제
            let RawName = match[1].trim();
            
            // 이미지 내 오타 보정 처리 (스크랩 텍스트 특징 보강)
            if (RawName.includes('콘스탄틴') || RawName.includes('콘스탄')) {
                currentSpeaker = MY_NAME;
            } else if (RawName.includes('알레한드로') || RawName.includes('알레한') || RawName.includes('열레한드로')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤') || RawName.includes('토르밴')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

            // 나를 제외한 상대방 이름들만 중복 없이 드롭다운 후보로 수집
            if (currentSpeaker !== MY_NAME && currentSpeaker !== "시스템") {
                detectedSpeakers.add(currentSpeaker);
            }

            currentMessageAccumulator = []; // 누적 데이터 초기화
        } else {
            // 텍스트 줄에 불필요하게 껴 있는 밴드 UI 단어 필터링
            if (trimmed === "번역 보기" || trimmed === "답글쓰기" || trimmed === "글쓰기" || trimmed === "시간" || trimmed === "보기" || trimmed.includes("표정짓기")) {
                return; 
            }

            // 대화가 진행 중일 때만 본문을 배열에 추가
            if (currentSpeaker) {
                currentMessageAccumulator.push(trimmed);
            }
        }
    });

    // 마지막 남은 메시지 세트 저장
    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
    }
}

// 메시지 임시 저장 및 포맷 다듬기
function saveMessage(speaker, text) {
    // 멘션 언급 제거 및 텍스트 정리 (예: "@콘스탄틴 하벨 " 부분을 제거하거나 살림)
    let cleanText = text.trim();
    allMessages.push({
        speaker: speaker,
        message: cleanText
    });
}

// 4. 추출된 고유 상대방 목록으로 드롭다운 옵션 자동 생성
function updateSpeakerDropdown() {
    detectedSpeakers.forEach(speaker => {
        const option = document.createElement('option');
        option.value = speaker;
        option.textContent = speaker;
        speakerSelect.appendChild(option);
    });
}

// 5. 선택된 인물에 따라 화면에 대화창 렌더링
function renderChat() {
    chatContainer.innerHTML = '';
    const selectedSpeaker = speakerSelect.value;

    allMessages.forEach(msg => {
        // 드롭다운 필터 적용: 
        // '전체 대화'가 아니고, 내가 쓴 글도 아니고, 선택된 상대방도 아닌 메시지는 거릅니다.
        if (selectedSpeaker !== 'all') {
            if (msg.speaker !== MY_NAME && msg.speaker !== selectedSpeaker) {
                return;
            }
        }

        const isMyMsg = (msg.speaker === MY_NAME);
        const chatClass = isMyMsg ? 'my' : 'other';

        // @이름 멘션에 하늘색 파란 글씨 속성 부여
        const highlightedMsg = msg.message.replace(/(@[^\s]+)/g, '<span style="color: #1a56db; font-weight: bold;">$1</span>');

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${chatClass}`;
        messageElement.innerHTML = `
            <div class="speaker-name"><strong>${msg.speaker}</strong></div>
            <div class="message-content">${highlightedMsg}</div>
        `;
        chatContainer.appendChild(messageElement);
    });

    // 화면 자동 스크롤 하단 이동
    const chatWrapper = document.querySelector('.chat-wrapper');
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
}

// 드롭다운 선택값 변경 이벤트
speakerSelect.addEventListener('change', renderChat);

// 6. 대화창 영역 PNG 파일로 추출하여 다운로드
exportBtn.addEventListener('click', function() {
    const target = document.querySelector('.chat-wrapper');
    const originalHeight = target.style.height;
    target.style.height = 'auto'; // 스크롤바 영역 전체 확보

    html2canvas(target, {
        useCORS: true,
        backgroundColor: '#b2c7da',
        scrollY: -window.scrollY
    }).then(canvas => {
        target.style.height = originalHeight; // 복구

        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `chat_export_${speakerSelect.value}.png`;
        link.href = image;
        link.click();
    }).catch(err => {
        alert("이미지 캡처 중 오류가 발생했습니다: " + err.message);
    });
});

function showError(message) {
    console.error(message);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e;">⚠️ ${message}</div>`;
}
