/* ============================================================
   Danny's Reading Platform — Application Logic
   PDF.js rendering + Grok API (Q&A & Chat)
   ============================================================ */

// ---------- PDF.js Worker --------

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ---------- State ----------
let grokApiKey = localStorage.getItem('groq_api_key') || '';
let userName = localStorage.getItem('user_name') || '';
let userAvatar = localStorage.getItem('user_avatar') || ''; // base64 data URL

// ---------- DOM References ----------
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const usernameInput = document.getElementById('usernameInput');
const avatarInput = document.getElementById('avatarInput');
const avatarImg = document.getElementById('avatarImg');
const avatarInitial = document.getElementById('avatarInitial');
const avatarPreview = document.getElementById('avatarPreview');
const removeAvatarBtn = document.getElementById('removeAvatar');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const changeKeyBtn = document.getElementById('changeKeyBtn');

const greetingName = document.getElementById('greetingName');
const headerAvatar = document.getElementById('headerAvatar');
const headerAvatarImg = document.getElementById('headerAvatarImg');
const headerAvatarInitial = document.getElementById('headerAvatarInitial');

// PDF & UI DOM refs
const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const uploadBtn = document.getElementById('uploadBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const changePdfBtn = document.getElementById('changePdfBtn');

const pdfControls = document.getElementById('pdfControls');
const pdfViewerWrapper = document.getElementById('pdfViewerWrapper');
const pdfCanvasContainer = document.getElementById('pdfCanvasContainer');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomLevel = document.getElementById('zoomLevel');

const questionsEmpty = document.getElementById('questionsEmpty');
const questionsLoading = document.getElementById('questionsLoading');
const questionsList = document.getElementById('questionsList');
const newQuestionsBtn = document.getElementById('newQuestionsBtn');
const newQBtnIcon = document.getElementById('newQBtnIcon');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');

// State for profile
let pdfDoc = null;
let currentPage = 1;
let currentScale = 1.4;
let extractedText = '';
let chatHistory = [];

let pendingAvatarDataUrl = '';  // holds preview before save

// ============================================================
// ONBOARDING — PROFILE SETUP
// ============================================================

function checkApiKey() {
    if (!grokApiKey || !userName) showApiKeyModal();
    else {
        hideApiKeyModal();
        applyProfile();
    }
}

function showApiKeyModal() {
    apiKeyModal.classList.remove('hidden');
    // Pre-fill if editing existing profile
    usernameInput.value = userName || '';
    apiKeyInput.value = grokApiKey || '';
    pendingAvatarDataUrl = userAvatar || '';
    updateModalAvatarPreview();
    setTimeout(() => usernameInput.focus(), 100);
}

function hideApiKeyModal() {
    apiKeyModal.classList.add('hidden');
}

function applyProfile() {
    // Update greeting
    greetingName.textContent = userName;

    // Update header avatar
    if (userAvatar) {
        headerAvatarImg.src = userAvatar;
        headerAvatarImg.style.display = 'block';
        headerAvatarInitial.style.display = 'none';
    } else {
        headerAvatarImg.style.display = 'none';
        headerAvatarInitial.style.display = 'flex';
        headerAvatarInitial.textContent = userName.charAt(0).toUpperCase() || '?';
    }
}

function updateModalAvatarPreview() {
    if (pendingAvatarDataUrl) {
        avatarImg.src = pendingAvatarDataUrl;
        avatarImg.style.display = 'block';
        avatarInitial.style.display = 'none';
        removeAvatarBtn.classList.remove('hidden');
        avatarPreview.style.borderColor = 'var(--accent)';
    } else {
        avatarImg.style.display = 'none';
        avatarInitial.style.display = 'flex';
        const n = usernameInput.value.trim();
        avatarInitial.textContent = n ? n.charAt(0).toUpperCase() : '?';
        removeAvatarBtn.classList.add('hidden');
        avatarPreview.style.borderColor = '';
    }
}

// Update initial letter as user types their name
usernameInput.addEventListener('input', () => {
    if (!pendingAvatarDataUrl) {
        const n = usernameInput.value.trim();
        avatarInitial.textContent = n ? n.charAt(0).toUpperCase() : '?';
    }
});

// Handle avatar file selection
avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        pendingAvatarDataUrl = ev.target.result;
        updateModalAvatarPreview();
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be reselected
});

removeAvatarBtn.addEventListener('click', () => {
    pendingAvatarDataUrl = '';
    updateModalAvatarPreview();
});

// Save all profile data
saveApiKeyBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    const key = apiKeyInput.value.trim();
    if (!name) { shake(usernameInput); return; }
    if (!key) { shake(apiKeyInput); return; }

    userName = name;
    grokApiKey = key;
    userAvatar = pendingAvatarDataUrl;

    localStorage.setItem('user_name', userName);
    localStorage.setItem('groq_api_key', grokApiKey);
    localStorage.setItem('user_avatar', userAvatar);

    hideApiKeyModal();
    applyProfile();
});

apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKeyBtn.click();
});

// Header avatar / Profile button both re-open the modal
changeKeyBtn.addEventListener('click', showApiKeyModal);
headerAvatar.addEventListener('click', showApiKeyModal);


// ============================================================
// PDF UPLOAD & RENDERING
// ============================================================

uploadBtn.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('click', (e) => { if (e.target !== uploadBtn) fileInput.click(); });

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadPdf(e.target.files[0]);
});

changePdfBtn.addEventListener('click', () => fileInput.click());

// Drag & Drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') loadPdf(file);
});

async function loadPdf(file) {
    uploadZone.classList.add('hidden');
    pdfViewerWrapper.classList.remove('hidden');
    pdfControls.classList.remove('hidden');
    fileInfo.classList.remove('hidden');
    changePdfBtn.classList.remove('hidden');
    fileName.textContent = file.name.length > 30 ? file.name.slice(0, 28) + '…' : file.name;

    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    currentPage = 1;
    currentScale = 1.4;

    pdfCanvasContainer.innerHTML = '';
    await renderAllPages();
    updatePageInfo();

    // Extract text for Grok
    extractedText = await extractAllText(pdfDoc);

    // Reset chat history
    chatHistory = [];
    addBotMessage(`📄 PDF loaded! I've read **"${file.name}"**. Ask me anything about it.`, true);

    // Auto-generate questions
    generateQuestions();
}

async function renderAllPages() {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: currentScale });

        const canvas = document.createElement('canvas');
        canvas.id = `pdf-page-${i}`;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pdfCanvasContainer.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
    }
    updatePageInfo();
}

async function rerenderPages() {
    const canvases = pdfCanvasContainer.querySelectorAll('canvas');
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: currentScale });
        const canvas = canvases[i - 1];
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
    }
}

function updatePageInfo() {
    if (!pdfDoc) return;
    // Detect visible page by scroll position
    const canvases = pdfCanvasContainer.querySelectorAll('canvas');
    const wrapper = pdfViewerWrapper;
    let visible = 1;
    canvases.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();
        if (rect.top <= wrapRect.top + wrapRect.height / 2 && rect.bottom >= wrapRect.top) {
            visible = i + 1;
        }
    });
    currentPage = visible;
    pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
}

pdfViewerWrapper.addEventListener('scroll', updatePageInfo);

prevPageBtn.addEventListener('click', () => scrollToPage(Math.max(1, currentPage - 1)));
nextPageBtn.addEventListener('click', () => scrollToPage(Math.min(pdfDoc.numPages, currentPage + 1)));

function scrollToPage(n) {
    const canvas = document.getElementById(`pdf-page-${n}`);
    if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    currentPage = n;
    pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
}

zoomInBtn.addEventListener('click', async () => {
    if (currentScale >= 2.5) return;
    currentScale = Math.min(2.5, currentScale + 0.2);
    zoomLevel.textContent = `${Math.round(currentScale / 1.4 * 100)}%`;
    await rerenderPages();
});

zoomOutBtn.addEventListener('click', async () => {
    if (currentScale <= 0.6) return;
    currentScale = Math.max(0.6, currentScale - 0.2);
    zoomLevel.textContent = `${Math.round(currentScale / 1.4 * 100)}%`;
    await rerenderPages();
});

async function extractAllText(pdfDocument) {
    let text = '';
    for (let i = 1; i <= Math.min(pdfDocument.numPages, 40); i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim().slice(0, 28000); // Grok context limit buffer
}

// ============================================================
// GROK API HELPER
// ============================================================

async function callGrok(messages, maxTokens = 2048) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${grokApiKey}`,
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            max_tokens: maxTokens,
            temperature: 0.5,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error?.message || JSON.stringify(err) || `API Error ${res.status}`;
        console.error('[Grok API Error]', res.status, errMsg, err);
        throw new Error(errMsg);
    }
    const data = await res.json();
    return data.choices[0].message.content.trim();
}

// ============================================================
// PANEL 2 — AI QUESTIONS
// ============================================================

let questionsData = []; // [{question, answer}]

newQuestionsBtn.addEventListener('click', () => {
    if (!extractedText) {
        flashMessage('Please upload a PDF first!');
        return;
    }
    generateQuestions();
});

async function generateQuestions() {
    if (!extractedText) return;

    // Show loading
    questionsEmpty.classList.add('hidden');
    questionsList.classList.add('hidden');
    questionsLoading.classList.remove('hidden');
    newQuestionsBtn.disabled = true;
    newQBtnIcon.textContent = '⏳';

    try {
        const prompt = `You are a professional exam setter and subject-matter expert. Your task is to generate 40 high-quality, exam-ready questions from the document below.

STRICT RULES:
1. IGNORE all introductory sections, prefaces, forewords, table of contents, acknowledgements, and any "how to use this book" or instruction pages. Focus ONLY on the substantive subject content.
2. Questions must test DEEP understanding of the core concepts, theories, principles, definitions, processes, and applications covered in the main body of the document.
3. Use a variety of exam-style question types:
   - Definition questions ("Define...", "What is meant by...")
   - Explanation questions ("Explain...", "Describe how...")
   - Application questions ("How would...", "Give an example of...")
   - Analysis/evaluation questions ("Why is...", "What are the implications of...", "Compare and contrast...")
   - Cause-and-effect questions ("What causes...", "What are the effects of...")
4. Do NOT ask trivial questions about page numbers, authors, or document structure.
5. Every answer MUST be based strictly and directly on the content of the document — do not use outside knowledge.
6. Each answer must be DETAILED and COMPREHENSIVE — not just a one-liner. Structure each answer with:
   - A clear direct answer to the question
   - Supporting explanation using specific details, examples, or evidence from the document
   - Any relevant sub-points, causes, effects, or implications mentioned in the document
   Aim for 4–8 sentences per answer, or more if the concept warrants it.

Return ONLY a valid JSON array of exactly 40 objects, each with:
- "question": the exam-style question
- "answer": the answer derived strictly from the document

Document Content:
"""
${extractedText}
"""

IMPORTANT: Return ONLY the raw JSON array. No markdown, no code fences, no explanation. Start immediately with [ and end with ].`;

        const response = await callGrok([{ role: 'user', content: prompt }], 8192);

        // Parse JSON
        let parsed;
        try {
            // Strip any accidental markdown fences
            const cleaned = response.replace(/```json|```/gi, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            // Fallback: try to extract JSON array
            const match = response.match(/\[[\s\S]*\]/);
            if (match) parsed = JSON.parse(match[0]);
            else throw new Error('Could not parse questions from Grok response.');
        }

        questionsData = parsed.slice(0, 40);
        renderQuestions();
    } catch (err) {
        questionsLoading.classList.add('hidden');
        questionsEmpty.classList.remove('hidden');
        questionsEmpty.innerHTML = `<div class="empty-icon">⚠️</div><p>Failed to generate questions.<br/><small style="color:var(--text-muted)">${err.message}</small></p>
    <button class="btn-accent" onclick="generateQuestions()">Try Again</button>`;
    } finally {
        newQuestionsBtn.disabled = false;
        newQBtnIcon.textContent = '✨';
    }
}

function renderQuestions() {
    questionsLoading.classList.add('hidden');
    questionsList.innerHTML = '';
    questionsList.classList.remove('hidden');

    questionsData.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'question-item';
        li.style.animationDelay = `${idx * 0.035}s`;
        li.innerHTML = `
      <div class="question-header">
        <span class="question-num">Q${idx + 1}</span>
        <span class="question-text">${escapeHtml(item.question)}</span>
        <button class="view-answer-btn" onclick="toggleAnswer(this, ${idx})">View Answer</button>
      </div>
      <div class="answer-text hidden" id="answer-${idx}">${escapeHtml(item.answer)}</div>
    `;
        questionsList.appendChild(li);
    });
}

function toggleAnswer(btn, idx) {
    const answerEl = document.getElementById(`answer-${idx}`);
    const isHidden = answerEl.classList.contains('hidden');
    answerEl.classList.toggle('hidden', !isHidden);
    btn.textContent = isHidden ? 'Hide Answer' : 'View Answer';
}

// ============================================================
// PANEL 3 — AI CHAT
// ============================================================

sendChatBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (!extractedText) {
        flashMessage('Please upload a PDF first!');
        return;
    }

    // Add user message
    addUserMessage(text);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendChatBtn.disabled = true;

    // Show typing indicator
    const thinkingEl = addThinkingIndicator();

    try {
        // Build questions context if available
        let questionsContext = '';
        if (questionsData.length > 0) {
            const qList = questionsData
                .map((q, i) => `Q${i + 1}: ${q.question}`)
                .join('\n');
            questionsContext = `\n\nThe following 40 exam questions have been generated from this document. If Danny refers to a question by number (e.g. "explain question 5", "elaborate on Q3", "what does question 12 mean"), identify the correct question from this list and give a thorough, detailed explanation based strictly on the document content:\n\n${qList}`;
        }

        // Build messages with PDF system context
        const systemMsg = {
            role: 'system',
            content: `You are a helpful reading assistant for Danny. You ONLY answer questions based on the following document content. If the question cannot be answered from the document, politely say so and do NOT use outside knowledge.

Document content:
"""
${extractedText}
"""${questionsContext}`,
        };

        const messages = [
            systemMsg,
            ...chatHistory,
            { role: 'user', content: text },
        ];

        const response = await callGrok(messages, 1024);

        // Update history
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: response });

        // Keep history manageable (last 10 exchanges)
        if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

        thinkingEl.remove();
        addBotMessage(response);
    } catch (err) {
        thinkingEl.remove();
        addBotMessage(`⚠️ Error: ${err.message}. Please check your API key and try again.`);
    } finally {
        sendChatBtn.disabled = false;
    }
}

function addUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'chat-message-row user-row';
    row.innerHTML = `
    <div class="chat-avatar" style="background:linear-gradient(135deg,#f4c430,#e0730a);font-size:1rem;">👤</div>
    <div class="chat-bubble user-bubble">${escapeHtml(text)}</div>
  `;
    chatMessages.appendChild(row);
    scrollChat();
}

function addBotMessage(text, isMarkdown = false) {
    const row = document.createElement('div');
    row.className = 'chat-message-row';
    const content = isMarkdown ? formatMarkdown(text) : escapeHtml(text);
    row.innerHTML = `
    <div class="chat-avatar">🤖</div>
    <div class="chat-bubble bot-bubble">${content}</div>
  `;
    chatMessages.appendChild(row);
    scrollChat();
}

function addThinkingIndicator() {
    const row = document.createElement('div');
    row.className = 'chat-message-row';
    row.innerHTML = `
    <div class="chat-avatar">🤖</div>
    <div class="chat-thinking">
      <div class="dot-pulse">
        <span></span><span></span><span></span>
      </div>
      Thinking…
    </div>
  `;
    chatMessages.appendChild(row);
    scrollChat();
    return row;
}

function scrollChat() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
}

function shake(el) {
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => el.style.animation = '', 400);
}

function flashMessage(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
    position:fixed; top:90px; left:50%; transform:translateX(-50%);
    background:rgba(46,128,255,0.95); color:#fff; padding:10px 22px;
    border-radius:100px; font-size:0.84rem; font-weight:600;
    z-index:9999; animation:fadeIn 0.2s ease;
    box-shadow:0 4px 16px rgba(46,128,255,0.4);
  `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// Add shake animation to stylesheet dynamically
const shakeSty = document.createElement('style');
shakeSty.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}`;
document.head.appendChild(shakeSty);

// ============================================================
// INIT
// ============================================================

checkApiKey();

// ============================================================
// COLLAPSE / EXPAND CHAT PANEL
// ============================================================

const collapseChatBtn = document.getElementById('collapseChatBtn');
const expandChatTab = document.getElementById('expandChatTab');
const panelsContainer = document.querySelector('.panels-container');
const chatPanel = document.getElementById('chatPanel');

let chatCollapsed = false;

function collapseChat() {
    chatCollapsed = true;
    panelsContainer.classList.add('chat-collapsed');
    // Hide all inner content but keep the panel in the DOM for the grid slot
    chatPanel.querySelectorAll('.chat-messages, .chat-input-area').forEach(el => {
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
    });
    chatPanel.querySelector('.panel-header').style.visibility = 'hidden';
    expandChatTab.classList.add('visible');
}

function expandChat() {
    chatCollapsed = false;
    panelsContainer.classList.remove('chat-collapsed');
    chatPanel.querySelectorAll('.chat-messages, .chat-input-area').forEach(el => {
        el.style.visibility = '';
        el.style.opacity = '';
    });
    chatPanel.querySelector('.panel-header').style.visibility = '';
    expandChatTab.classList.remove('visible');
    // Focus the input
    setTimeout(() => chatInput.focus(), 350);
}

collapseChatBtn.addEventListener('click', () => {
    chatCollapsed ? expandChat() : collapseChat();
});

expandChatTab.addEventListener('click', expandChat);
