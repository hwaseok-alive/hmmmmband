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

// 밴드 댓글 UI 맞춤형 파싱 엔진
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    const lines = text.split('\n');
    
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;

        // 시스템 쓰레기 라인 1차 컷
        if (trimmed.includes("표정짓기") || trimmed.includes("답글쓰기") || trimmed.includes("번역 보기") || trimmed.includes("좋아요")) {
            return;
        }
        // 시간 정보 라인 (예: 3시간 전, 11분 전) 스킵
        if (/^\d+\s*(시간|분|일)\s*전/.test(trimmed)) {
            return;
        }

        let isSpeakerLine = false;
        let matchedSpeaker = "";

        // ⚠️ 핵심: 골뱅이(@)가 맨 앞에 붙은 라인은 '진짜 이름 라인'이 아니라 본문(멘션)이므로 화자 전환을 안 합니다!
        if (!trimmed.startsWith('@')) {
            if (trimmed.includes('알레한드로') || trimmed.includes('골리코프')) {
                isSpeakerLine = true;
                matchedSpeaker = '알레한드로 골리코프';
            } else if (trimmed.includes('토르벤') || trimmed.includes('파트로소프')) {
                isSpeakerLine = true;
                matchedSpeaker = '토르벤 파트로소프';
            } else if (currentMyName && trimmed.includes(currentMyName)) {
                isSpeakerLine = true;
                matchedSpeaker = currentMyName;
            }
        }

        // 새로운 화자가 확정되었다면
        if (isSpeakerLine) {
            // 기존 누적된 대화 내용이 있다면 먼저 말풍선으로 묶어서 저장
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                let bodyText = currentMessageAccumulator.join(' ').trim();
                if (bodyText.length > 0) {
                    saveMessage(currentSpeaker, bodyText);
                }
            }
            // 화자 교체
            currentSpeaker = matchedSpeaker;
            if (currentSpeaker !== currentMyName) {
                detectedSpeakers.add(currentSpeaker);
            }
            currentMessageAccumulator = [];
        } else {
            // 일반 본문 라인인 경우
            if (currentSpeaker) {
                // OCR 찌꺼기 특수문자들 가볍게 청소
                let cleanLine = trimmed.replace(/[~`^\\_+=[\]{}|;<>]/g, "").trim();
                if (cleanLine) {
                    currentMessageAccumulator.push(cleanLine);
                }
            }
        }
    });

    // 마지막 대화 덩어리 flush
    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        let bodyText = currentMessageAccumulator.join(' ').trim();
        if (bodyText.length > 0) {
            saveMessage(currentSpeaker, bodyText);
        }
    }
}

function saveMessage(speaker, text) {
    allMessages.push({ speaker: speaker, message: text });
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
        
        // 본문 안의 멘션 기호(@알레한드로 등) 파란색 하이라이트 처리
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
