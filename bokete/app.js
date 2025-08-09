const firebaseConfig = {
    apiKey: "AIzaSyChB7eBjMaX_lRpfIgUxQDi39Qh82R4oyQ",
    authDomain: "sandbox-35d1d.firebaseapp.com",
    projectId: "sandbox-35d1d",
    storageBucket: "sandbox-35d1d.appspot.com",
    messagingSenderId: "906287459396",
    appId: "1:906287459396:web:c931c95d943157cae36011",
    measurementId: "G-LE2Q0XC7B6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const APP_NAME = "bokete";
const BASE_PATH = `pracClass/nekokazu/apps/${APP_NAME}`;

let currentPrompts = [];

async function initializeApp() {
    const appDocRef = db.doc(BASE_PATH);
    const appDoc = await appDocRef.get();
    
    if (!appDoc.exists) {
        await appDocRef.set({
            appName: APP_NAME,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    setupPromptListener();
    setupEventListeners();
}

function setupPromptListener() {
    const promptsRef = db.collection(`${BASE_PATH}/prompts`);
    
    promptsRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        currentPrompts = [];
        snapshot.forEach((doc) => {
            currentPrompts.push({ id: doc.id, ...doc.data() });
        });
        renderPrompts();
    });
}

function renderPrompts() {
    const container = document.getElementById('promptsContainer');
    
    if (currentPrompts.length === 0) {
        container.innerHTML = '<div class="no-prompts">まだお題がありません。最初のお題を追加してください！</div>';
        return;
    }
    
    container.innerHTML = currentPrompts.map(prompt => `
        <div class="prompt-card" data-prompt-id="${prompt.id}">
            <div class="prompt-header">
                <h3>お題</h3>
                <span class="timestamp">${formatDate(prompt.createdAt)}</span>
            </div>
            <div class="prompt-text">${escapeHtml(prompt.text)}</div>
            <div class="response-section">
                <button class="add-response-btn" data-prompt-id="${prompt.id}">回答する</button>
                <div class="responses-container" id="responses-${prompt.id}">
                    <div class="loading-responses">回答を読み込み中...</div>
                </div>
            </div>
        </div>
    `).join('');
    
    currentPrompts.forEach(prompt => {
        setupResponseListener(prompt.id);
    });
    
    document.querySelectorAll('.add-response-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const promptId = e.target.dataset.promptId;
            showResponseModal(promptId);
        });
    });
}

function setupResponseListener(promptId) {
    const responsesRef = db.collection(`${BASE_PATH}/prompts/${promptId}/responses`);
    
    responsesRef.orderBy('likes', 'desc').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        const responsesContainer = document.getElementById(`responses-${promptId}`);
        const responses = [];
        
        snapshot.forEach((doc) => {
            responses.push({ id: doc.id, ...doc.data() });
        });
        
        if (responses.length === 0) {
            responsesContainer.innerHTML = '<div class="no-responses">まだ回答がありません</div>';
        } else {
            responsesContainer.innerHTML = responses.map(response => `
                <div class="response-item">
                    <div class="response-text">${escapeHtml(response.text)}</div>
                    <div class="response-footer">
                        <button class="like-btn ${response.likedBy && response.likedBy.includes(getOrCreateUserId()) ? 'liked' : ''}" 
                                data-prompt-id="${promptId}" 
                                data-response-id="${response.id}">
                            <span class="like-icon">👍</span>
                            <span class="like-count">${response.likes || 0}</span>
                        </button>
                        <span class="response-time">${formatDate(response.createdAt)}</span>
                    </div>
                </div>
            `).join('');
            
            responsesContainer.querySelectorAll('.like-btn').forEach(btn => {
                btn.addEventListener('click', handleLike);
            });
        }
    });
}

function showResponseModal(promptId) {
    const prompt = currentPrompts.find(p => p.id === promptId);
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h2>お題に回答</h2>
            <div class="prompt-preview">${escapeHtml(prompt.text)}</div>
            <textarea id="responseInput" placeholder="面白い回答を入力してください..." maxlength="300"></textarea>
            <button id="submitResponseBtn" class="submit-btn">回答を投稿</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('submitResponseBtn').addEventListener('click', async () => {
        const responseText = document.getElementById('responseInput').value.trim();
        if (responseText) {
            await addResponse(promptId, responseText);
            modal.remove();
        }
    });
}

async function addPrompt(text) {
    const promptsRef = db.collection(`${BASE_PATH}/prompts`);
    await promptsRef.add({
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        userId: getOrCreateUserId()
    });
}

async function addResponse(promptId, text) {
    const responsesRef = db.collection(`${BASE_PATH}/prompts/${promptId}/responses`);
    await responsesRef.add({
        text: text,
        likes: 0,
        likedBy: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        userId: getOrCreateUserId()
    });
}

async function handleLike(e) {
    const btn = e.currentTarget;
    const promptId = btn.dataset.promptId;
    const responseId = btn.dataset.responseId;
    const userId = getOrCreateUserId();
    
    const responseRef = db.doc(`${BASE_PATH}/prompts/${promptId}/responses/${responseId}`);
    const responseDoc = await responseRef.get();
    
    if (responseDoc.exists) {
        const data = responseDoc.data();
        const likedBy = data.likedBy || [];
        
        if (likedBy.includes(userId)) {
            await responseRef.update({
                likes: firebase.firestore.FieldValue.increment(-1),
                likedBy: firebase.firestore.FieldValue.arrayRemove(userId)
            });
        } else {
            await responseRef.update({
                likes: firebase.firestore.FieldValue.increment(1),
                likedBy: firebase.firestore.FieldValue.arrayUnion(userId)
            });
        }
    }
}

function setupEventListeners() {
    const modal = document.getElementById('addPromptModal');
    const addBtn = document.getElementById('addPromptBtn');
    const closeBtn = modal.querySelector('.close');
    const submitBtn = document.getElementById('submitPromptBtn');
    const promptInput = document.getElementById('promptInput');
    
    addBtn.addEventListener('click', () => {
        modal.classList.add('show');
        promptInput.value = '';
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    submitBtn.addEventListener('click', async () => {
        const text = promptInput.value.trim();
        if (text) {
            await addPrompt(text);
            modal.classList.remove('show');
        }
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

function getOrCreateUserId() {
    let userId = localStorage.getItem('bokete-user-id');
    if (!userId) {
        userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('bokete-user-id', userId);
    }
    return userId;
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'たった今';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '時間前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + '日前';
    
    return date.toLocaleDateString('ja-JP');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initializeApp);