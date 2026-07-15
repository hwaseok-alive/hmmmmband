pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const fileInput = document.getElementById('pdf-upload');
const uploadLabel = document.getElementById('upload-label');
const cancelBtn = document.getElementById('btn-cancel');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');
const exportBtn = document.getElementById('btn-export');
const speakerSelect = document.getElementById('speaker-select');
const myNameInput = document.getElementById('my-name-input');

let allMessages = []; 
let detectedSpeakers = new Set(); 
let rawExtractedText = ""; 

let isCancelled = false;
let currentWorker = null; 

function setProcessingState(processing) {
    if (processing) {
        uploadLabel.style.display = 'none';
        cancelBtn.style.display = 'inline-block';
        exportBtn.disabled = true;
        isCancelled = false;
    } else {
        uploadLabel.style.display = 'inline-block';
        cancelBtn.style.display = 'none';
    }
}

function resetToInitial(message = "파일 분석이 취소되었습니다.") {
    fileInput.value = "";
    fileNameDisplay.textContent = "선택된 파일 없음";
    chatContainer.innerHTML = `<div class="system-message">${message}</div>`;
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    exportBtn.disabled = true;
    setProcessingState(false);
    currentWorker = null;
}

cancelBtn.addEventListener('click', async function() {
    isCancelled = true;
    if (currentWorker) {
        try { await currentWorker.terminate(); } catch (e) {}
    }
    resetToInitial("⚠️ 파일 분석이 취소되었습니다.");
});

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    chatContainer.innerHTML = '<div class="system-message">분석을 준비하고 있습니다...</div>';
    setProcessingState(true);

    const fileReader = new FileReader();

    if (file.type.startsWith('image/')) {
        fileReader.onload = async function() {
            try {
                if (isCancelled) return;
                chatContainer.innerHTML = '<div class="system-message">이미지 분석 중 (OCR)...</div>';
                currentWorker = await Tesseract.createWorker('kor+eng');
                if (isCancelled) { currentWorker.terminate(); return; }
                const result = await currentWorker.recognize(this.result);
                if (isCancelled) { currentWorker.terminate(); return; }
                rawExtractedText = result.data.text;
                await currentWorker.terminate();
                currentWorker = null;
                processTextAndRender();
            } catch (err) {
                if (!isCancelled) showError("이미지 분석 실패: " + err.message);
            }
        };
        fileReader.readAsDataURL(file);
    } 
    else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        fileReader.onload = async function() {
            try {
                if (isCancelled) return;
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let maxPages = pdf.numPages;
                let combinedText = "";
                currentWorker = await Tesseract.createWorker('kor+eng');

                for (let i = 1; i <= maxPages; i++) {
                    if (isCancelled) { currentWorker.terminate(); return; }
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    if (isCancelled) { currentWorker.terminate(); return; }
                    const result = await currentWorker.recognize(canvas);
                    combinedText += result.data.text + "\n";
                }
                if (isCancelled) { currentWorker.terminate(); return; }
                rawExtractedText = combinedText;
                await currentWorker.terminate();
                currentWorker = null;
                processTextAndRender();
            } catch (error) {
                if (!isCancelled) showError("PDF 분석 실패: " + error.message);
            }
        };
        fileReader.readAsArrayBuffer(file);
    }
});

function processTextAndRender() {
    setProcessingState(false); 
    parseMessages(rawExtractedText);
    if (allMessages.length === 0) {
        showError("대화 내용을 추출하지 못했습니다. 이름을 다시 확인해 주세요.");
        return;
    }
    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

// ⚠️ [새로운 매커니즘] 정규식을 활용한 정밀 분할 및 매칭 엔진
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    
    // 타겟팅할 진짜 화자 목록 구성
    const targetSpeakers = ['알레한드로 골리코프', '토르벤 파트로소프'];
    if (currentMyName) {
        targetSpeakers.push(currentMyName);
    }

    // 1. 줄바꿈 노이즈 사전 정제
    let cleanLines = text.split('\n')
        .map(line => line.trim())
        .filter(line => {
            if (!line) return false;
            // 밴드 UI 기능성 노이즈 완전 배제
            if (line.includes("표정짓기") || line.includes("답글쓰기") || line.includes("번역 보기") || line.includes("좋아요")) return false;
            if (/^\d+\s*(시간|분|일)\s*전/.test(line)) return false; // "3시간 전" 같은 시간 라인 삭제
            return true;
        });

    // 2. 단일 대화 묶음을 찾기 위한 탐색 루프
    let tempSpeaker = "";
    let tempBuffer = [];

    for (let i = 0; i < cleanLines.length; i++) {
        let line = cleanLines[i];
        let isRealSpeakerHeader = false;
        let matchedName = "";

        // 진짜 화자 헤더라인인지 엄격히 판정하는 필터
        // 본문 멘션(@)이 포함되지 않은 줄 중에서, 타겟 이름과 매치되는지 확인합니다.
        if (!line.includes('@')) {
            for (let name of targetSpeakers) {
                // 이름이 완전히 일치하거나, "이름 + 나이/직급(예: 콘스탄틴 하벨 50, 형사과)" 패턴일 때
                if (line === name || line.startsWith(name) || (name === '알레한드로 골리코프' && (line.includes('알레한드로') || line.includes('골리코프')))) {
                    isRealSpeakerHeader = true;
                    matchedName = name;
                    break;
                }
            }
        }

        if (isRealSpeakerHeader) {
            // 이전에 쌓인 대화가 있으면 말풍선으로 내보내기
            if (tempSpeaker && tempBuffer.length > 0) {
                pushCleanedMessage(tempSpeaker, tempBuffer);
            }
            // 상태를 새로운 화자로 변경
            tempSpeaker = matchedName;
            if (tempSpeaker !== currentMyName) {
                detectedSpeakers.add(tempSpeaker);
            }
            tempBuffer = [];
        } else {
            // 본문 내용 버퍼에 계속 추가
            if (tempSpeaker) {
                tempBuffer.push(line);
            }
        }
    }

    // 마지막 남은 잔여 대화 처리
    if (tempSpeaker && tempBuffer.length > 0) {
        pushCleanedMessage(tempSpeaker, tempBuffer);
    }
}

// 본문 텍스트 안에 섞여서 들어간 가짜 프로필 텍스트 및 중복 멘션 최종 클리닝 함수
function pushCleanedMessage(speaker, linesArray) {
    const currentMyName = myNameInput.value.trim();
    
    // 각 본문 라인들 중 혹시 섞여 들어간 프로필 찌꺼기나 빈 문자열 2차 정제
    let filteredLines = linesArray.map(l => {
        let temp = l.replace(/[~`^\\_+=[\]{}|;<>]/g, "").trim();
        // 화자 이름이 단독으로 본문 줄에 들어간 노이즈 제거
        if (temp === "알레한드로 골리코프" || temp === "토르벤 파트로소프" || (currentMyName && temp === currentMyName)) {
            return "";
        }
        return temp;
    }).filter(l => l.length > 0);

    if (filteredLines.length > 0) {
        let finalBody = filteredLines.join(' ');
        
        // 멘션 기호 가독성 포맷 정리 (중복 공백 제거)
        finalBody = finalBody.replace(/\s+/g, ' ').trim();
        
        allMessages.push({
            speaker: speaker,
            message: finalBody
        });
    }
}

function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    detectedSpeakers.forEach(speaker => {
        if (speaker !== currentMyName && speaker.length <= 15) {
            const option = document.createElement('option');
            option.value = speaker;
            option.textContent = speaker;
            speakerSelect.appendChild(option);
        }
    });
}

function renderChat() {
    chatContainer.innerHTML = '';
    const selectedSpeaker = speakerSelect.value;
    const currentMyName = myNameInput.value.trim();

    allMessages.forEach(msg => {
        if (selectedSpeaker !== 'all') {
            if (msg.speaker !== currentMyName && msg.speaker !== selectedSpeaker) return;
        }

        const isMyMsg = (msg.speaker === currentMyName);
        const chatClass = isMyMsg ? 'my' : 'other';
        
        let displayMsg = msg.message;
        
        // 본문 안의 @멘션 기호 파란색 하이라이팅
        displayMsg = displayMsg.replace(/(@[^\s]+)/g, '<span style="color: #1a56db; font-weight: bold;">$1</span>');

        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${chatClass}`;
        messageElement.innerHTML = `
            <div class="speaker-name"><strong>${msg.speaker}</strong></div>
            <div class="message-content">${displayMsg}</div>
        `;
        chatContainer.appendChild(messageElement);
    });

    const chatWrapper = document.querySelector('.chat-wrapper');
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
}

myNameInput.addEventListener('input', function() {
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
        alert("이미지 저장 에러: " + err.message);
    });
});

function showError(message) {
    setProcessingState(false);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e; padding: 12px; color: white;">⚠️ ${message}</div>`;
}
