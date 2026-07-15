// 1. 메인 라이브러리 스크립트 빌드와 완전히 같은 3.4.120 버전으로 워커 강제 지정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const fileInput = document.getElementById('pdf-upload');
const fileNameDisplay = document.getElementById('file-name');
const chatContainer = document.getElementById('chat-container');
const exportBtn = document.getElementById('btn-export');
const speakerSelect = document.getElementById('speaker-select');
const myNameInput = document.getElementById('my-name-input');

let allMessages = []; 
let detectedSpeakers = new Set(); 
let rawExtractedText = ""; 

// 파일 업로드 이벤트 핸들러
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    chatContainer.innerHTML = '<div class="system-message">분석을 준비하고 있습니다...</div>';
    exportBtn.disabled = true;
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';

    const fileReader = new FileReader();

    // 이미지 접수 분기
    if (file.type.startsWith('image/')) {
        fileReader.onload = async function() {
            try {
                chatContainer.innerHTML = '<div class="system-message">이미지 분석 중 (OCR)... <br><span style="font-size: 11px; opacity: 0.8;">잠시만 기다려주세요.</span></div>';
                
                const result = await Tesseract.recognize(this.result, 'kor+eng');
                rawExtractedText = result.data.text;
                processTextAndRender();
            } catch (err) {
                showError("이미지 분석 실패: " + err.message);
            }
        };
        fileReader.readAsDataURL(file);
    } 
    // PDF 접수 분기 (3.4.120 버전 스펙 완벽 가동)
    else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        fileReader.onload = async function() {
            try {
                chatContainer.innerHTML = '<div class="system-message">PDF 데이터를 스캔하는 중...</div>';
                const typedarray = new Uint8Array(this.result);
                
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let maxPages = pdf.numPages;
                let combinedText = "";

                for (let i = 1; i <= maxPages; i++) {
                    chatContainer.innerHTML = `<div class="system-message">PDF ${i} / ${maxPages} 페이지 가상 이미지화 중...</div>`;
                    const page = await pdf.getPage(i);
                    
                    const viewport = page.getViewport({ scale: 2.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    chatContainer.innerHTML = `<div class="system-message">글자 추출 판독 중 (OCR): ${i} / ${maxPages} 페이지...<br><span style="font-size: 11px; opacity: 0.8;">문서 해상도에 따라 다소 시간이 걸릴 수 있습니다.</span></div>`;
                    
                    const result = await Tesseract.recognize(canvas, 'kor+eng');
                    combinedText += result.data.text + "\n";
                }

                rawExtractedText = combinedText;
                processTextAndRender();

            } catch (error) {
                showError("PDF 구조 분석 실패: " + error.message);
            }
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        showError("PDF 또는 이미지 파일(.png, .jpg)만 지원합니다.");
    }
});

function processTextAndRender() {
    console.log("=== OCR 판독 최종 결과 ===\n", rawExtractedText);
    parseMessages(rawExtractedText);
    
    if (allMessages.length === 0) {
        showError("분석은 성공했으나, 이름과 대화 구조를 가진 문장을 추출하지 못했습니다.");
        return;
    }

    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    const lines = text.split('\n');
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const namePattern = /^([가-힣a-zA-Z\s]{2,10})\s*(?:\d{2}|형사|검사|현사|학|사|회|부|과|님|$)/;
        const match = trimmed.match(namePattern);

        if (match) {
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
            }

            let RawName = match[1].trim();
            
            if (currentMyName && (RawName.includes(currentMyName.substring(0, 2)) || RawName.includes(currentMyName))) {
                currentSpeaker = currentMyName;
            } else if (RawName.includes('알레한드로') || RawName.includes('알레한') || RawName.includes('열레한') || RawName.includes('글리코프') || RawName.includes('콜리코프')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤') || RawName.includes('토르밴') || RawName.includes('토르')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

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

function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    
    detectedSpeakers.forEach(speaker => {
        if (speaker !== currentMyName) {
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
    console.error(message);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e; padding: 12px; line-height: 1.5;">⚠️ ${message}</div>`;
}
