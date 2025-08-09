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

let currentRoom = null;
let currentRole = null;
let questionListener = null;
let historyListener = null;

const screens = {
    roomSelection: document.getElementById('roomSelection'),
    roleSelection: document.getElementById('roleSelection'),
    answererView: document.getElementById('answererView'),
    questionerView: document.getElementById('questionerView')
};

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createRoom() {
    const roomId = generateRoomId();
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(roomId);
    
    await roomRef.set({
        created: firebase.firestore.FieldValue.serverTimestamp(),
        currentQuestion: null,
        answerer: null,
        questioners: []
    });
    
    return roomId;
}

async function joinRoom(roomId) {
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(roomId);
    
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) {
        alert('ルームが見つかりません');
        return false;
    }
    
    currentRoom = roomId;
    document.getElementById('currentRoomId').textContent = `ルームID: ${roomId}`;
    showScreen('roleSelection');
    return true;
}

document.getElementById('createRoomBtn').addEventListener('click', async () => {
    const roomId = await createRoom();
    document.getElementById('roomIdInput').value = roomId;
    alert(`ルームを作成しました: ${roomId}`);
    await joinRoom(roomId);
});

document.getElementById('joinRoomBtn').addEventListener('click', async () => {
    const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
    if (!roomId) {
        alert('ルームIDを入力してください');
        return;
    }
    await joinRoom(roomId);
});

document.getElementById('backToRoomBtn').addEventListener('click', () => {
    currentRoom = null;
    currentRole = null;
    if (questionListener) {
        questionListener();
        questionListener = null;
    }
    if (historyListener) {
        historyListener();
        historyListener = null;
    }
    showScreen('roomSelection');
});

document.getElementById('answererBtn').addEventListener('click', async () => {
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(currentRoom);
    
    await roomRef.update({
        answerer: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    currentRole = 'answerer';
    showScreen('answererView');
    setupAnswererListeners();
});

document.getElementById('questionerBtn').addEventListener('click', async () => {
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(currentRoom);
    
    await roomRef.update({
        questioners: firebase.firestore.FieldValue.arrayUnion(firebase.firestore.FieldValue.serverTimestamp())
    });
    
    currentRole = 'questioner';
    showScreen('questionerView');
    setupQuestionerListeners();
});

function setupAnswererListeners() {
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(currentRoom);
    
    questionListener = roomRef.onSnapshot((doc) => {
        const data = doc.data();
        if (data && data.currentQuestion) {
            document.getElementById('currentQuestion').innerHTML = 
                `<p>${data.currentQuestion.text}</p>`;
            document.getElementById('answerSection').classList.remove('hidden');
        } else {
            document.getElementById('currentQuestion').innerHTML = 
                '<p>質問を待っています...</p>';
            document.getElementById('answerSection').classList.add('hidden');
        }
    });
}

function setupQuestionerListeners() {
    const historyRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(currentRoom).collection('history');
    
    historyListener = historyRef.orderBy('timestamp', 'desc').limit(20).onSnapshot((snapshot) => {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const question = document.createElement('div');
            question.className = 'history-question';
            question.textContent = `Q: ${data.question}`;
            
            const answer = document.createElement('div');
            answer.className = data.answer ? 'history-answer' : 'history-answer pending';
            answer.textContent = data.answer ? `A: ${data.answer}` : 'A: 回答待ち...';
            
            item.appendChild(question);
            item.appendChild(answer);
            historyList.appendChild(item);
        });
    });
}

document.getElementById('sendQuestionBtn').addEventListener('click', async () => {
    const questionInput = document.getElementById('questionInput');
    const question = questionInput.value.trim();
    
    if (!question) {
        alert('質問を入力してください');
        return;
    }
    
    const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
        .collection('rooms').doc(currentRoom);
    const historyRef = roomRef.collection('history');
    
    const questionDoc = await historyRef.add({
        question: question,
        answer: null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await roomRef.update({
        currentQuestion: {
            id: questionDoc.id,
            text: question
        }
    });
    
    questionInput.value = '';
});

document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const answer = btn.dataset.answer;
        const roomRef = db.collection('pracClass').doc('nekokazu').collection('apps').doc('akinator')
            .collection('rooms').doc(currentRoom);
        
        const roomDoc = await roomRef.get();
        const data = roomDoc.data();
        
        if (data && data.currentQuestion) {
            const historyRef = roomRef.collection('history').doc(data.currentQuestion.id);
            await historyRef.update({
                answer: answer
            });
            
            await roomRef.update({
                currentQuestion: null
            });
        }
    });
});

document.getElementById('leaveAnswererBtn').addEventListener('click', () => {
    if (questionListener) {
        questionListener();
        questionListener = null;
    }
    currentRole = null;
    showScreen('roleSelection');
});

document.getElementById('leaveQuestionerBtn').addEventListener('click', () => {
    if (historyListener) {
        historyListener();
        historyListener = null;
    }
    currentRole = null;
    showScreen('roleSelection');
});