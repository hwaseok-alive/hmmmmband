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
        showError("대화 내용을 추출하지 못했습니다. 이름 인식 조건을 확인해 주세요.");
        return;
    }

    updateSpeakerDropdown();
    renderChat();
    exportBtn.disabled = false;
}

// 완전히 새로 뜯어고친 파싱 엔진 (외계어 차단 및 이름 정밀 검증)
function parseMessages(text) {
    allMessages = [];
    detectedSpeakers.clear();
    
    const currentMyName = myNameInput.value.trim();
    const lines = text.split('\n');
    let currentSpeaker = "";
    let currentMessageAccumulator = [];

    // 대화방 내에 유입되면 안 되는 명백한 특수문자/외계어 패턴
    const garbagePattern = /^[\s\d`~!@#$%^&*()_+=\-[\]\\|{};:'",.<>/?·•¥^/\\—]+$/;
    
    // 절대 이름이 될 수 없는 밴드 UI 단어 및 본문 파편용 블랙리스트
    const invalidNameTokens = ["번역", "답글", "글쓰기", "시간", "보기", "표정", "전체", "이미지", "저장", "선택", "등록", "댓글", "좋아요"];
    const blacklistSuffixes = ["은", "는", "이", "가", "을", "를", "의", "에서", "합니다", "입니다", "있다", "없다", "요", "과", "와", "해", "해라", "한다"];

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;

        // 1. OCR 쓰레기 문자열 전처리 필터링
        if (garbagePattern.test(trimmed) || trimmed.length <= 1) {
            return; 
        }

        // 2. 이름 후보군 추출 및 엄격한 검증
        // 순수한 한국어 또는 영어 알파벳으로만 구성된 2~8자 단어
        const namePattern = /^([가-힣a-zA-Z\s]{2,8})$/;
        const match = trimmed.match(namePattern);

        let isName = false;
        let RawName = "";

        if (match) {
            RawName = match[1].trim();
            
            // 이름 뒤에 동사 어미나 조사가 붙어있는지 엄밀히 판단
            const hasInvalidSuffix = blacklistSuffixes.some(suffix => {
                return RawName.endsWith(suffix) && RawName.length > suffix.length;
            });
            // 금지된 단어가 닉네임에 섞여 있는지 판단
            const hasInvalidToken = invalidNameTokens.some(token => RawName.includes(token));

            if (!hasInvalidSuffix && !hasInvalidToken) {
                isName = true;
            }
        }

        // 3. 고정 등장인물 이름 보정 로직 (오타 구제)
        if (!isName) {
            if (trimmed.includes('알레한드로') || trimmed.includes('골리코프')) {
                isName = true; RawName = '알레한드로 골리코프';
            } else if (trimmed.includes('토르벤') || trimmed.includes('파트로소프')) {
                isName = true; RawName = '토르벤 파트로소프';
            } else if (currentMyName && trimmed === currentMyName) {
                isName = true; RawName = currentMyName;
            }
        }

        // 4. 이름 분기 및 본문 누적 처리
        if (isName) {
            // 새 화자가 나타나면 기존에 쌓아두었던 대화 저장
            if (currentSpeaker && currentMessageAccumulator.length > 0) {
                let textBlock = currentMessageAccumulator.join(' ').trim();
                // 저장하려는 본문이 외계어 덩어리라면 저장하지 않고 버림
                if (textBlock && !garbagePattern.test(textBlock) && textBlock.length > 1) {
                    saveMessage(currentSpeaker, textBlock);
                }
            }

            // 확정된 대화 참여자 이름 표준화 mapping
            if (currentMyName && (RawName.includes(currentMyName.substring(0, 2)) || RawName.includes(currentMyName))) {
                currentSpeaker = currentMyName;
            } else if (RawName.includes('알레한드로')) {
                currentSpeaker = '알레한드로 골리코프';
            } else if (RawName.includes('토르벤')) {
                currentSpeaker = '토르벤 파트로소프';
            } else {
                currentSpeaker = RawName;
            }

            if (currentSpeaker !== currentMyName && currentSpeaker !== "시스템") {
                detectedSpeakers.add(currentSpeaker);
            }

            currentMessageAccumulator = []; 
        } else {
            // 본문 내용 찌꺼기 정제 후 스택에 누적
            // 밴드 UI 요소들 2차 제거
            if (invalidNameTokens.some(t => trimmed.includes(t)) || trimmed.includes("표정짓기")) {
                return;
            }
            
            // 메시지 내부에 포함된 잔여 특수문자 가볍게 정리
            trimmed = trimmed.replace(/[~`^\\_+=[\]{}|;<>]/g, "").trim();
            
            if (currentSpeaker && trimmed) {
                currentMessageAccumulator.push(trimmed);
            }
        }
    });

    // 마지막 남은 잔여 대화 찌꺼기 최종 커밋
    if (currentSpeaker && currentMessageAccumulator.length > 0) {
        let textBlock = currentMessageAccumulator.join(' ').trim();
        if (textBlock && !garbagePattern.test(textBlock) && textBlock.length > 1) {
            saveMessage(currentSpeaker, textBlock);
        }
    }
}

function saveMessage(speaker, text) {
    allMessages.push({
        speaker: speaker,
        message: text
    });
}

function updateSpeakerDropdown() {
    const currentMyName = myNameInput.value.trim();
    speakerSelect.innerHTML = '<option value="all">전체 대화</option>';
    
    detectedSpeakers.forEach(speaker => {
        // 엄격한 드롭다운 정화: 8자 초과 혹은 쓰레기 토큰 유입 원천 차단
        if (speaker !== currentMyName && speaker.length <= 8) {
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
    setProcessingState(false);
    console.error(message);
    chatContainer.innerHTML = `<div class="system-message" style="background-color: #e53e3e; padding: 12px; line-height: 1.5;">⚠️ ${message}</div>`;
}
