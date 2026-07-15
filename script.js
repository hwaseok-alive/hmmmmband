// PDF.js 워커 경로를 안정적인 CDN 버전으로 강제 지정합니다.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

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
    chatContainer.innerHTML = '<div class="system-message">파일 분석을 준비 중입니다...</div>';
    exportBtn.disabled = true;
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';

    const fileReader = new FileReader();

    // 1. 이미지 파일(.png, .jpg 등)을 감지했을 때의 흐름
    if (file.type.startsWith('image/')) {
        fileReader.onload = async function() {
            try {
                chatContainer.innerHTML = '<div class="system-message">이미지 분석 중 (OCR)... <br><span style="font-size: 11px; opacity: 0.8;">잠시만 기다려주세요.</span></div>';
                
                const result = await Tesseract.recognize(
                    this.result,
                    'kor+eng',
                    { logger: m => console.log(m.status + ": " + Math.round(m.progress * 100) + "%") }
                );

                rawExtractedText = result.data.text;
                processTextAndRender();

            } catch (err) {
                showError("이미지 분석 중 에러가 발생했습니다: " + err.message);
            }
        };
        fileReader.readAsDataURL(file);
    } 
    // 2. PDF 파일을 감지했을 때의 흐름
    else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        fileReader.onload = async function() {
            try {
                chatContainer.innerHTML = '<div class="system-message">PDF 데이터를 읽는 중...</div>';
                const typedarray = new Uint8Array(this.result);
                
                // PDF 문서 로딩
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let maxPages = pdf.numPages;
                let combinedText = "";

                // 모든 페이지 순차적으로 이미지화 -> OCR 처리
                for (let i = 1; i <= maxPages; i++) {
                    chatContainer.innerHTML = `<div class="system-message">PDF 렌더링 중: ${i} / ${maxPages} 페이지...</div>`;
                    
                    const page = await pdf.getPage(i);
                    
                    // 해상도를 높여서 이미지 텍스트 판독률 극대화 (scale: 2.5)
                    const viewport = page.getViewport({ scale: 2.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    chatContainer.innerHTML = `<div class="system-message">글자 분석 중 (OCR): ${i} / ${maxPages} 페이지...<br><span style="font-size: 11px; opacity: 0.8;">텍스트를 판독하는 데 최대 수십 초가 소요될 수 있습니다.</span></div>`;
                    
                    const result = await Tesseract.recognize(
                        canvas, 
                        'kor+eng',
                        { logger: m => console.log(`Page ${i} - ${m.status}: ${Math.round(m.progress * 100)}%`) }
                    );
                    
                    combinedText += result.data.text + "\n";
                }

                rawExtractedText = combinedText;
                processTextAndRender();

            } catch (error) {
                showError("PDF 내부 글자 판독 실패: " + error.message + "<br><br>파일 손상 여부나 PDF.js 차단 정책을 확인해 보세요.");
            }
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        showError("지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일을 선택해 주세요.");
    }
});

// 공통 파싱 결과 처리 및 드롭다운/채팅 그리기
function processTextAndRender() {
    console.log("=== OCR 판독 결과 원본 ===\n", rawExtractedText);
    parseMessages(rawExtractedText);
    
    if (allMessages.length === 0) {
        showError("분석에는 성공했으나, 이름과 메시지 형태를 가진 대화 내용을 찾아내지 못했습니다.");
        return;
    }

    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

// 텍스트에서 이름과 대화 본문을 자동으로 구별해내는 엔진
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

        // 정규표현식: 이름 뒤에 공백이나 나이, 혹은 밴드 관련 쓰레기 단어가 붙은 패턴 탐지
        const namePattern = /^([가-힣a-zA-Z\s]{2,10})\s*(?:\d{2}|형사|검사|현사|학|사|회|부|과|님|$)/;
        const match = trimmed.match(namePattern);

        if (match) {
            // 이전에 쌓인 대화가 있으면 우선 저장
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                saveMessage(currentSpeaker, currentMessageAccumulator.join(' '));
            }

            let RawName = match[1].trim();
            
            // 이름 오타 및 일치 여부 정밀 판정
            if (currentMyName && (RawName.includes(currentMyName.substring(0, 2)) || RawName.includes(currentMyName))) {
                currentSpeaker = currentMyName;
            } else if (RawName.includes('알레한드로') || RawName.includes('알레한') || RawName.includes('열레한') || RawName.includes('글리코프') || RawName.includes('콜리코프')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤') || RawName.includes('토르밴') || RawName.includes('토르')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

            // 상대를 대화 목록 드롭다운에 저장 (본인 제외)
            if (currentSpeaker !== currentMyName && currentSpeaker !== "시스템") {
                detectedSpeakers.add(currentSpeaker);
            }

            currentMessageAccumulator = []; 
        } else {
            // 밴드 UI 단어 필터링
            if (trimmed === "번역 보기" || trimmed === "답글쓰기" || trimmed === "글쓰기" || trimmed === "시간" || trimmed === "보기" || trimmed.includes("표정짓기")) {
                return; 
            }

            if (currentSpeaker) {
                currentMessageAccumulator.push(trimmed);
            }
        }
    });

    // 마지막 남은 메시지 처리
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

        // 멘션(@닉네임) 하이라이팅 효과
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

// 내 이름 실시간 수정 반영
myNameInput.addEventListener('input', function() {
    updateSpeakerDropdown();
    renderChat();
});

speakerSelect.addEventListener('change', renderChat);

// 이미지로 내보내기 기능
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
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e; padding: 15px; line-height: 1.5;">⚠️ ${message}</div>`;
}
