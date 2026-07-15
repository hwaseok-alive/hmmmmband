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
        try {
            await currentWorker.terminate(); 
        } catch (e) {
            console.log("워커 종료 중 예외 발생: ", e);
        }
    }
    resetToInitial("⚠️ 파일 분석이 사용자에 의해 즉시 취소되었습니다.");
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
                chatContainer.innerHTML = '<div class="system-message">이미지 분석 중 (OCR)... <br><span style="font-size: 11px; opacity: 0.8;">언제든 취소할 수 있습니다.</span></div>';
                
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
                chatContainer.innerHTML = '<div class="system-message">PDF 데이터를 스캔하는 중...</div>';
                
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let maxPages = pdf.numPages;
                let combinedText = "";

                currentWorker = await Tesseract.createWorker('kor+eng');

                for (let i = 1; i <= maxPages; i++) {
                    if (isCancelled) { currentWorker.terminate(); return; }
                    
                    chatContainer.innerHTML = `<div class="system-message">PDF ${i} / ${maxPages} 페이지 가상 이미지화 중...</div>`;
                    const page = await pdf.getPage(i);
                    
                    const viewport = page.getViewport({ scale: 2.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    if (isCancelled) { currentWorker.terminate(); return; }
                    chatContainer.innerHTML = `<div class="system-message">글자 추출 판독 중 (OCR): ${i} / ${maxPages} 페이지...</div>`;
                    
                    const result = await currentWorker.recognize(canvas);
                    combinedText += result.data.text + "\n";
                }

                if (isCancelled) { currentWorker.terminate(); return; }
                rawExtractedText = combinedText;
                
                await currentWorker.terminate();
                currentWorker = null;
                
                processTextAndRender();
            } catch (error) {
                if (!isCancelled) showError("PDF 구조 분석 실패: " + error.message);
            }
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        showError("PDF 또는 이미지 파일만 지원합니다.");
        setProcessingState(false);
    }
});

function processTextAndRender() {
    setProcessingState(false); 
    parseMessages(rawExtractedText);
    
    if (allMessages.length === 0) {
        showError("대화 내용을 추출하지 못했습니다. 이름 입력란을 확인해 주세요.");
        return;
    }

    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

// [핵심] 줄바꿈에 영향을 받지 않는 타겟형 블록 파싱 매커니즘
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    
    // 1. 확실한 고정 화자 키워드 정의
    const targetSpeakers = ['알레한드로 골리코프', '토르벤 파트로소프'];
    if (currentMyName) {
        targetSpeakers.push(currentMyName);
    }

    // 2. 텍스트 전체에서 불필요한 외계어 기호 및 밴드 UI 요소 사전 청소
    let cleanedText = text
        .replace(/[~`^\\_+=[\]{}|;<>]/g, "") 
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
            // UI 부속어 및 완전한 쓰레기 라인 단칼에 컷
            if (!line || line === "번역 보기" || line === "답글쓰기" || line === "글쓰기" || line === "공유하기") return false;
            if (/^[0-9\s.\-:/]+$/.test(line)) return false; // 날짜/시간 스킵
            if (line.length <= 1 && !/[가-힣a-zA-Z]/.test(line)) return false; 
            return true;
        })
        .join('\n');

    // 3. 줄바꿈을 기준으로 배열화하여 화자 탐색 추적
    const lines = cleanedText.split('\n');
    
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    lines.forEach(line => {
        let isSpeakerLine = false;
        let matchedSpeaker = "";

        // 오타 및 부분 일치 강제 보정 매칭
        if (line.includes('알레한드로') || line.includes('골리코프') || line.includes('알레한') || line.includes('열레한')) {
            isSpeakerLine = true;
            matchedSpeaker = '알레한드로 골리코프';
        } else if (line.includes('토르벤') || line.includes('파트로소프') || line.includes('토르밴')) {
            isSpeakerLine = true;
            matchedSpeaker = '토르벤 파트로소프';
        } else if (currentMyName && (line === currentMyName || line.includes(currentMyName))) {
            isSpeakerLine = true;
            matchedSpeaker = currentMyName;
        }

        // 4. 새로운 화자가 감지되었다면
        if (isSpeakerLine) {
            // 이전에 쌓고 있던 본문이 있다면 저장 (말풍선 하나로 병합)
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                let fullBody = currentMessageAccumulator.join(' ').trim();
                // 본문 내부에 숨은 화자 이름 노이즈 제거
                targetSpeakers.forEach(t => { fullBody = fullBody.replace(new RegExp(t, 'g'), ''); });
                fullBody = fullBody.trim();
                
                if (fullBody.length > 1) {
                    saveMessage(currentSpeaker, fullBody);
                }
            }

            // 상태 변경 및 드롭다운 목록 등록
            currentSpeaker = matchedSpeaker;
            if (currentSpeaker !== currentMyName) {
                detectedSpeakers.add(currentSpeaker);
            }
            currentMessageAccumulator = [];
        } else {
            // 화자 줄이 아니면 무조건 현재 화자의 본문 스택으로 편입 (문장 쪼개짐 원천 방쇄)
            if (currentSpeaker) {
                currentMessageAccumulator.push(line);
            }
        }
    });

    // 루프가 끝난 뒤 마지막 잔여 메시지 플러시
    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        let fullBody = currentMessageAccumulator.join(' ').trim();
        targetSpeakers.forEach(t => { fullBody = fullBody.replace(new RegExp(t, 'g'), ''); });
        fullBody = fullBody.trim();
        if (fullBody.length > 1) {
            saveMessage(currentSpeaker, fullBody);
        }
    }
}

function saveMessage(speaker, text) {
    // 멘션 기호(@) 정제 및 본문 가공
    allMessages.push({
        speaker: speaker,
        message: text
    });
}

function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    
    detectedSpeakers.forEach(speaker => {
        // En hr 같은 쓰레기 필터가 드롭다운에 못 나오게 엄격 검증
        if (speaker !== currentMyName && speaker.length <= 12 && !speaker.includes('En')) {
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
            if (msg.speaker !== currentMyName && msg.speaker !== selectedSpeaker) {
                return;
            }
        }

        const isMyMsg = (msg.speaker === currentMyName);
        const chatClass = isMyMsg ? 'my' : 'other';
        
        // 본문 안의 내 이름이나 @ 기호 하이라이팅 처리
        let displayMsg = msg.message;
        if (currentMyName) {
            displayMsg = displayMsg.replace(new RegExp(`@?${currentMyName}`, 'g'), `<span style="color: #1a56db; font-weight: bold;">@${currentMyName}</span>`);
        }
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
        alert("이미지 저장 중 에러: " + err.message);
    });
});

function showError(message) {
    setProcessingState(false);
    console.error(message);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e; padding: 12px; line-height: 1.5;">⚠️ ${message}</div>`;
}
