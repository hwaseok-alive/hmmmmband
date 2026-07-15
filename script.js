// 1. PDF.js Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// DOM 요소 정의
const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');
const exportBtn = document.getElementById('btn-export');
const speakerSelect = document.getElementById('speaker-select');
const myNameInput = document.getElementById('my-name-input'); // 내 이름 입력창 추가

let allMessages = []; 
let detectedSpeakers = new Set(); 

// 2. 파일 업로드 이벤트
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    chatContainer.innerHTML = '<div class="system-message">이미지 분석(OCR)을 준비하고 있습니다...</div>';
    exportBtn.disabled = true;
    
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);

        try {
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let maxPages = pdf.numPages;
            let combinedOcrText = "";

            for (let i = 1; i <= maxPages; i++) {
                chatContainer.innerHTML = `<div class="system-message">PDF ${i} / ${maxPages} 페이지 이미지 렌더링 중...</div>`;
                
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                await page.render(renderContext).promise;

                chatContainer.innerHTML = `<div class="system-message">진행 중: ${i} / ${maxPages} 페이지 글자 읽는 중 (OCR)... <br><span style="font-size: 11px; opacity: 0.8;">시간이 약간 걸릴 수 있습니다.</span></div>`;

                const result = await Tesseract.recognize(
                    canvas,
                    'kor+eng',
                    { logger: m => console.log(m) }
                );

                combinedOcrText += result.data.text + "\n";
            }

            // 텍스트 분석 실행
            parseMessages(combinedOcrText);
            
            if (allMessages.length === 0) {
                throw new Error("이미지 판독 결과 대화 데이터를 감지하지 못했습니다.");
            }

            // 상대방 목록으로 드롭다운 갱신
            updateSpeakerDropdown();
            
            // 화면 렌더링 및 다운로드 버튼 활성화
            renderChat();
            exportBtn.disabled = false;

        } catch (error) {
            showError("분석 실패: " + error.message);
        }
    };
    fileReader.readAsArrayBuffer(file);
});

// 3. 네이버 밴드 스타일 텍스트 구조 동적 분석 엔진
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    // 사용자가 현재 입력창에 입력해 둔 내 이름을 실시간으로 가져옵니다.
    const currentMyName = myNameInput.value.trim();
    
    const lines = text.split('\n');
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 이름 매칭용 정규식
        const namePattern = /^([가-힣\s]+)\s*(?:\d{2}|형사과|검사가|현사과|학|사)/;
        const match = trimmed.match(namePattern);

        if (match) {
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
            }

            let RawName = match[1].trim();
            
            // 이름 보정 테이블 (OCR 오탈자 방지)
            if (currentMyName && (RawName.includes(currentMyName.substring(0, 2)) || RawName.includes(currentMyName))) {
                currentSpeaker = currentMyName;
            } else if (RawName.includes('알레한드로') || RawName.includes('알레한') || RawName.includes('열레한') || RawName.includes('글리코프') || RawName.includes('콜리코프')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤') || RawName.includes('토르밴') || RawName.includes('토르')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

            // 내 이름을 제외한 상대방 이름들만 드롭다운 세트에 저장
            if (currentSpeaker !== currentMyName && currentSpeaker !== "시스템") {
                detectedSpeakers.add(currentSpeaker);
            }

            currentMessageAccumulator = []; 
        } else {
            if (trimmed === "번역 보기" || trimmed === "답글쓰기" || trimmed === "글쓰기" || trimmed === "시간" || trimmed === "보기" || trimmed.includes("표정짓기")) {
                return; 
            }

            if (currentSpeaker) {
                currentMessageAccumulator.push(trimmed);
            }
        }
    });

    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
    }
}

function saveMessage(speaker, text) {
    let cleanText = text.trim();
    allMessages.push({
        speaker: speaker,
        message: cleanText
    });
}

// 4. 드롭다운 옵션 자동 생성
function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    
    detectedSpeakers.forEach(speaker => {
        // 드롭다운 목록에 혹시라도 내 이름이 중복해서 들어가는 걸 방지
        if (speaker !== currentMyName) {
            const option = document.createElement('option');
            option.value = speaker;
            option.textContent = speaker;
            speakerSelect.appendChild(option);
        }
    });
}

// 5. 대화창 렌더링 (내 이름을 기준으로 실시간 좌우 구분)
function renderChat() {
    chatContainer.innerHTML = '';
    const selectedSpeaker = speakerSelect.value;
    const currentMyName = myNameInput.value.trim(); // 실시간 입력된 내 이름 가져오기

    allMessages.forEach(msg => {
        if (selectedSpeaker !== 'all') {
            if (msg.speaker !== currentMyName && msg.speaker !== selectedSpeaker) {
                return;
            }
        }

        // 동적으로 사용자가 입력한 내 이름과 일치하는지 비교하여 정렬 결정
        const isMyMsg = (msg.speaker === currentMyName);
        const chatClass = isMyMsg ? 'my' : 'other';

        const highlightedMsg = msg.message.replace(/(@[^\s]+)/g, '<span style="color: #1a56db; font-weight: bold;">$1</span>');

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${chatClass}`;
        messageElement.innerHTML = `
            <div class="speaker-name"><strong>${msg.speaker}</strong></div>
            <div class="message-content">${highlightedMsg}</div>
        `;
        chatContainer.appendChild(messageElement);
    });

    const chatWrapper = document.querySelector('.chat-wrapper');
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
}

// 6. 이름이 실시간으로 변경될 때 갱신되는 반응형 이벤트
myNameInput.addEventListener('input', function() {
    // 입력 중인 이름 기준으로 드롭다운 목록 필터링 재정리 및 렌더링
    updateSpeakerDropdown();
    renderChat();
});

speakerSelect.addEventListener('change', renderChat);

exportBtn.addEventListener('click', function() {
    const target = document.querySelector('.chat-wrapper');
    const originalHeight = target.style.height;
    target.style.height = 'auto'; 

    html2canvas(target, {
        useCORS: true,
        backgroundColor: '#b2c7da',
        scrollY: -window.scrollY
    }).then(canvas => {
        target.style.height = originalHeight; 

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
