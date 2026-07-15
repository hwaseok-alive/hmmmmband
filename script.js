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

// 🛠️ 한 줄씩 분석하는 초정밀 화자/본문 스캐너
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    if (!currentMyName) return;

    // 타겟팅할 진짜 화자 목록
    const targetSpeakers = ['알레한드로 골리코프', '토르벤 파트로소프', currentMyName];

    // 줄 단위 쪼개기 및 1차 가비지 필터링
    const lines = text.split('\n').map(line => line.trim()).filter(line => {
        if (!line) return false;
        // 밴드 UI 기능성 노이즈 완전 배제
        if (line.includes("표정짓기") || line.includes("답글쓰기") || line.includes("번역 보기") || line.includes("좋아요")) return false;
        if (/^\d+\s*(시간|분|일)\s*전/.test(line)) return false; // 시간 라인 스킵
        return true;
    });

    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let isSpeakerHeader = false;
        let matchedName = "";

        // 🔥 핵심 필터링: 본문 내부의 @멘션 기호가 해당 줄에 없는 경우에만 화자 라인 후보로 삼습니다.
        if (!line.includes('@')) {
            for (let name of targetSpeakers) {
                // 이름이 완전히 들어가 있는지 체크 (공백이나 나이/직급 찌꺼기 허용)
                if (line.includes(name) || (name === '알레한드로 골리코프' && (line.includes('알레한드로') || line.includes('골리코프')))) {
                    isSpeakerHeader = true;
                    matchedName = name;
                    break;
                }
            }
        }

        if (isSpeakerHeader) {
            // 이전에 수집 중이던 메시지가 있다면 안전하게 flush
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveCleanedMessage(currentSpeaker, currentMessageAccumulator);
            }
            // 새로운 화자로 상태 전환
            currentSpeaker = matchedName;
            if (currentSpeaker !== currentMyName) {
                detectedSpeakers.add(currentSpeaker);
            }
            currentMessageAccumulator = [];
        } else {
            // 본문 라인 수집
            if (currentSpeaker) {
                currentMessageAccumulator.push(line);
            }
        }
    }

    // 루프가 끝난 뒤 남아있는 잔여 버퍼 비우기
    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        saveCleanedMessage(currentSpeaker, currentMessageAccumulator);
    }
}

// 추출된 본문 텍스트 내 자잘한 OCR 특수문자 및 공백 찌꺼기 최종 교정기
function saveCleanedMessage(speaker, linesArray) {
    const currentMyName = myNameInput.value.trim();
    
    let filteredLines = linesArray.map(l => {
        // OCR 오작동으로 인한 자잘한 가비지 문자열 정제
        let temp = l.replace(/[~`^\\_+=[\]{}|;<>]/g, "").trim();
        // 본문에 이름만 덩그러니 남는 비정상적인 라인은 스킵
        if (temp === "알레한드로 골리코프" || temp === "토르벤 파트로소프" || temp === currentMyName) {
            return "";
        }
        return temp;
    }).filter(l => l.length > 0);

    if (filteredLines.length > 0) {
        let finalBody = filteredLines.join(' ');
        
        // 다중 공백 처리
        finalBody = finalBody.replace(/\s+/g, ' ').trim();

        if (finalBody.length > 0) {
            allMessages.push({
                speaker: speaker,
                message: finalBody
            });
        }
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
        
        // 본문 안의 멘션 표시 파란색 하이라이팅
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
