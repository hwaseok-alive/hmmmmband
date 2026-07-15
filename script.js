// 1. PDF.js Worker 버전을 라이브러리와 동일한 3.4.120으로 설정
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
                    chatContainer.innerHTML = `<div class="system-message">글자 추출 판독 중 (OCR): ${i} / ${maxPages} 페이지...</div>`;
                    
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
    parseMessages(rawExtractedText);
    
    if (allMessages.length === 0) {
        showError("대화 내용을 추출하지 못했습니다. 이름 인식 조건을 확인해 주세요.");
        return;
    }

    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

// 문장 오인 버그를 잡은 핵심 파싱 엔진
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    const lines = text.split('\n');
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    // 문장이 이름으로 오인되는 것을 방지하기 위한 제외 단어/조사 패턴
    const blacklistWords = ["은", "는", "이", "가", "을", "를", "의", "에서", "합니다", "입니다", "있다", "없다", "요", "과", "와"];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 1. 이름 매칭 규칙 엄격화: 2~8자 사이의 순수 알파벳/한글/공백만 허용하고 특수문자나 문장형 어미 차단
        // 뒤에 조사나 문장형 어미가 붙어있으면 이름이 아니라 대화 본문 문장으로 판정합니다.
        const namePattern = /^([가-힣a-zA-Z\s]{2,8})$/; 
        const match = trimmed.match(namePattern);

        let isName = false;
        let RawName = "";

        if (match) {
            RawName = match[1].trim();
            // 단어 뒤에 명백한 조사나 어미가 붙어있는지 더블 체크
            const hasBlacklist = blacklistWords.some(word => {
                return RawName.endsWith(word) && RawName.length > word.length;
            });
            // 대화방 UI용 텍스트 필터링
            const isUiText = (RawName === "번역 보기" || RawName === "답글쓰기" || RawName === "전체 대화" || RawName === "이미지 저장");

            if (!hasBlacklist && !isUiText) {
                isName = true;
            }
        }

        // 2. 강제 닉네임 매칭 보정 규칙 (오타 대응 포함)
        if (!isName) {
            if (trimmed.includes('알레한드로') || trimmed.includes('골리코프')) {
                isName = true; RawName = '알레한드로 골리코프';
            } else if (trimmed.includes('토르벤') || trimmed.includes('파트로소프')) {
                isName = true; RawName = '토르벤 파트로소프';
            } else if (currentMyName && trimmed.includes(currentMyName)) {
                isName = true; RawName = currentMyName;
            }
        }

        // 3. 이름으로 최종 판정된 경우 분기 처리
        if (isName) {
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
            }

            // 이름 맵핑 정규화
            if (currentMyName && (RawName.includes(currentMyName.substring(0, 2)) || RawName.includes(currentMyName))) {
                currentSpeaker = currentMyName;
            } else if (RawName.includes('알레한드로')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

            // 드롭다운 등록 (본인 및 시스템 멘트 제외)
            if (currentSpeaker !== currentMyName && currentSpeaker !== "시스템") {
                detectedSpeakers.add(currentSpeaker);
            }

            currentMessageAccumulator = []; 
        } else {
            // 본문 내용 쌓기
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
    if (!cleanText) return;
    allMessages.push({
        speaker: speaker,
        message: cleanText
    });
}

function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    
    detectedSpeakers.forEach(speaker => {
        if (speaker !== currentMyName && speaker.length <= 8) { // 비정상적으로 긴 이름 차단
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
