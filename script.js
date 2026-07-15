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

// 🛠️ 밴드 텍스트 추출용 단어 쪼개기 매커니즘
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    if (!currentMyName) return;

    // 화자 판별 리스트
    const targetSpeakers = ['알레한드로 골리코프', '토르벤 파트로소프', currentMyName];

    // 전체 텍스트에서 밴드 기능성 UI 단어 및 시간 정보 사전에 삭제
    let cleanedText = text.split('\n')
        .filter(line => {
            let l = line.trim();
            if (l.includes("표정짓기") || l.includes("답글쓰기") || l.includes("번역 보기") || l.includes("좋아요")) return false;
            if (/^\d+\s*(시간|분|일)\s*전/.test(l)) return false;
            return true;
        })
        .join('\n');

    // 진짜 프로필 헤더라인을 찾기 위한 정규식 패턴 생성
    // 본문 안의 멘션(@)은 제외하고, 줄 시작 부분에 이름이 단독 혹은 나이/직급과 오는 패턴 매칭
    const targetPattern = new RegExp(`(^|\\n)(알레한드로 골리코프|토르벤 파트로소프|${currentMyName})[^\\n@]*`, 'g');

    let match;
    let matches = [];

    // 1단계: 전체 텍스트에서 진짜 이름이 들어간 헤더 위치를 전부 탐색
    while ((match = targetPattern.exec(cleanedText)) !== null) {
        matches.push({
            index: match.index,
            speaker: match[2],
            headerLength: match[0].length
        });
    }

    // 2단계: 찾아낸 화자 위치 기점으로 본문 덩어리 슬라이싱
    for (let i = 0; i < matches.length; i++) {
        let currentMatch = matches[i];
        let speaker = currentMatch.speaker;
        
        // 본문 시작점 계산 (이름 헤더 바로 뒷부분부터)
        let textStart = currentMatch.index + currentMatch.headerLength;
        // 본문 끝점 계산 (다음 화자 헤더가 나타나기 전까지 혹은 텍스트 끝까지)
        let textEnd = (i + 1 < matches.length) ? matches[i + 1].index : cleanedText.length;

        let messageBody = cleanedText.substring(textStart, textEnd).trim();

        if (messageBody) {
            // 본문 내부의 자잘한 줄바꿈은 공백으로 합치고 특수문자 찌꺼기 청소
            let cleanBody = messageBody.split('\n')
                .map(l => l.replace(/[~`^\\_+=[\]{}|;<>]/g, "").trim())
                .filter(l => l.length > 0)
                .join(' ');

            // 여러 개로 쪼개진 공백 단일화
            cleanBody = cleanBody.replace(/\s+/g, ' ').trim();

            if (cleanBody.length > 0) {
                allMessages.push({ speaker: speaker, message: cleanBody });
                if (speaker !== currentMyName) {
                    detectedSpeakers.add(speaker);
                }
            }
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
        
        // 멘션(@이름) 파란색 강조 처리
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
