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

const GAME_COLLECTION = 'pracClass/nekokazu/apps/mentsuBattle/games';
const WAITING_COLLECTION = 'pracClass/nekokazu/apps/mentsuBattle/waiting';
const MAX_HP = 100;

let currentGame = null;
let currentPlayer = null;
let gameListener = null;
let waitingListener = null;
let openaiApiKey = null;

const screens = {
    title: document.getElementById('title-screen'),
    matching: document.getElementById('matching-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen')
};

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function calculateDamageWithAI(text) {
    if (!openaiApiKey) {
        return { damage: calculateBasicDamage(text), evaluation: null };
    }
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `あなたは煽り言葉バトルゲームの審判です。プレイヤーの煽り言葉を評価して、以下の基準で点数をつけてください：
                        - 創造性（0-20点）: オリジナリティのある煽りか
                        - インパクト（0-20点）: 相手に精神的ダメージを与えそうか
                        - ユーモア（0-10点）: 面白さやウィットに富んでいるか
                        - 合計最大50点
                        
                        必ず以下のJSON形式で回答してください：
                        {"damage": 数値, "evaluation": "短い評価コメント"}`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });
        
        if (!response.ok) {
            throw new Error('API request failed');
        }
        
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        
        return {
            damage: Math.min(Math.max(result.damage, 1), 50),
            evaluation: result.evaluation
        };
    } catch (error) {
        console.error('AI evaluation failed:', error);
        return { damage: calculateBasicDamage(text), evaluation: null };
    }
}

function calculateBasicDamage(text) {
    const baseScore = text.length * 0.5;
    
    const powerWords = {
        '雑魚': 5, 'ザコ': 5, 'ざこ': 5,
        '弱い': 4, 'よわい': 4,
        'noob': 6, 'ヌーブ': 6,
        '下手': 5, 'へた': 5, 'ヘタ': 5,
        'ゴミ': 7, 'ごみ': 7,
        'カス': 8, 'かす': 8,
        '負け': 4, '敗北': 5,
        'ワロタ': 3, 'わろた': 3, 'w': 1,
        '草': 2, 'ｗ': 1,
        'ez': 5, 'easy': 5, 'イージー': 5,
        'gg': 3, 'GG': 3
    };
    
    let powerBonus = 0;
    for (const [word, value] of Object.entries(powerWords)) {
        const regex = new RegExp(word, 'gi');
        const matches = text.match(regex);
        if (matches) {
            powerBonus += value * matches.length;
        }
    }
    
    const exclamationBonus = (text.match(/[!！]/g) || []).length * 2;
    const questionBonus = (text.match(/[?？]/g) || []).length * 1.5;
    const emojiBonus = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length * 3;
    
    const totalDamage = Math.floor(baseScore + powerBonus + exclamationBonus + questionBonus + emojiBonus);
    return Math.min(Math.max(totalDamage, 1), 50);
}

function calculateDamage(text) {
    return calculateBasicDamage(text);
}

async function findOrCreateGame(playerName) {
    try {
        const waitingSnapshot = await db.collection(WAITING_COLLECTION)
            .where('status', '==', 'waiting')
            .limit(1)
            .get();
        
        if (!waitingSnapshot.empty) {
            const waitingDoc = waitingSnapshot.docs[0];
            const waitingData = waitingDoc.data();
            
            const roomId = waitingData.roomId;
            const gameData = {
                roomId: roomId,
                player1: waitingData.player,
                player2: {
                    id: Date.now().toString(),
                    name: playerName,
                    hp: MAX_HP
                },
                currentTurn: waitingData.player.id,
                status: 'playing',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastAction: null,
                winner: null
            };
            
            await db.collection(GAME_COLLECTION).doc(roomId).set(gameData);
            await waitingDoc.ref.delete();
            
            currentGame = gameData;
            currentPlayer = gameData.player2;
            return roomId;
        } else {
            const roomId = generateRoomId();
            const player = {
                id: Date.now().toString(),
                name: playerName,
                hp: MAX_HP
            };
            
            await db.collection(WAITING_COLLECTION).doc(roomId).set({
                roomId: roomId,
                player: player,
                status: 'waiting',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            currentPlayer = player;
            
            waitingListener = db.collection(GAME_COLLECTION).doc(roomId)
                .onSnapshot((doc) => {
                    if (doc.exists) {
                        const gameData = doc.data();
                        if (gameData.status === 'playing') {
                            currentGame = gameData;
                            if (waitingListener) {
                                waitingListener();
                                waitingListener = null;
                            }
                            startGame(roomId);
                        }
                    }
                });
            
            return roomId;
        }
    } catch (error) {
        console.error('Error in findOrCreateGame:', error);
        alert('ゲームの作成に失敗しました');
    }
}

function startGame(roomId) {
    showScreen('game');
    document.getElementById('room-id').textContent = `Room: ${roomId}`;
    
    const isPlayer1 = currentPlayer.id === currentGame.player1.id;
    
    if (isPlayer1) {
        document.getElementById('player1-name').textContent = currentGame.player1.name + ' (あなた)';
        document.getElementById('player2-name').textContent = currentGame.player2.name;
    } else {
        document.getElementById('player1-name').textContent = currentGame.player1.name;
        document.getElementById('player2-name').textContent = currentGame.player2.name + ' (あなた)';
    }
    
    gameListener = db.collection(GAME_COLLECTION).doc(roomId)
        .onSnapshot((doc) => {
            if (!doc.exists) return;
            
            const gameData = doc.data();
            currentGame = gameData;
            updateGameUI(gameData);
            
            if (gameData.status === 'finished') {
                endGame(gameData);
            }
        });
}

function updateGameUI(gameData) {
    document.getElementById('player1-hp').style.width = `${(gameData.player1.hp / MAX_HP) * 100}%`;
    document.getElementById('player1-hp-text').textContent = `${gameData.player1.hp}/${MAX_HP}`;
    
    document.getElementById('player2-hp').style.width = `${(gameData.player2.hp / MAX_HP) * 100}%`;
    document.getElementById('player2-hp-text').textContent = `${gameData.player2.hp}/${MAX_HP}`;
    
    const isMyTurn = gameData.currentTurn === currentPlayer.id;
    const turnIndicator = document.getElementById('turn-indicator');
    const attackBtn = document.getElementById('attack-btn');
    const attackInput = document.getElementById('attack-text');
    
    if (isMyTurn) {
        turnIndicator.textContent = 'あなたのターン';
        turnIndicator.classList.add('active');
        attackBtn.disabled = false;
        attackInput.disabled = false;
    } else {
        turnIndicator.textContent = '相手のターン';
        turnIndicator.classList.remove('active');
        attackBtn.disabled = true;
        attackInput.disabled = true;
    }
    
    if (gameData.lastAction) {
        addBattleMessage(gameData.lastAction);
    }
}

function addBattleMessage(action) {
    const messagesContainer = document.getElementById('battle-messages');
    const existingMessages = messagesContainer.querySelectorAll('.battle-message');
    
    const messageExists = Array.from(existingMessages).some(msg => 
        msg.dataset.timestamp === action.timestamp?.toString()
    );
    
    if (!messageExists && action.timestamp) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'battle-message';
        messageDiv.dataset.timestamp = action.timestamp;
        
        const attackerName = action.attackerId === currentGame.player1.id ? 
            currentGame.player1.name : currentGame.player2.name;
        
        let evaluationText = '';
        if (action.evaluation) {
            evaluationText = `<div class="ai-comment">AI評価: ${action.evaluation}</div>`;
        }
        
        messageDiv.innerHTML = `
            <strong>${attackerName}:</strong> "${action.text}"
            <span class="damage"> -${action.damage}ダメージ！</span>
            ${evaluationText}
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function performAttack(text) {
    if (!currentGame || !text.trim()) return;
    
    const attackBtn = document.getElementById('attack-btn');
    attackBtn.disabled = true;
    attackBtn.textContent = 'AI評価中...';
    
    const result = await calculateDamageWithAI(text);
    const damage = result.damage;
    
    const isPlayer1 = currentPlayer.id === currentGame.player1.id;
    const targetPlayer = isPlayer1 ? 'player2' : 'player1';
    const nextTurn = isPlayer1 ? currentGame.player2.id : currentGame.player1.id;
    
    const newHp = Math.max(0, currentGame[targetPlayer].hp - damage);
    
    const updateData = {
        [`${targetPlayer}.hp`]: newHp,
        currentTurn: nextTurn,
        lastAction: {
            attackerId: currentPlayer.id,
            text: text,
            damage: damage,
            evaluation: result.evaluation,
            timestamp: Date.now()
        }
    };
    
    if (newHp <= 0) {
        updateData.status = 'finished';
        updateData.winner = currentPlayer.id;
    }
    
    try {
        await db.collection(GAME_COLLECTION).doc(currentGame.roomId).update(updateData);
        document.getElementById('attack-text').value = '';
        document.getElementById('damage-preview').textContent = '0';
        document.getElementById('ai-evaluation').textContent = '';
    } catch (error) {
        console.error('Attack failed:', error);
    } finally {
        attackBtn.textContent = '攻撃！';
        attackBtn.disabled = false;
    }
}

function endGame(gameData) {
    showScreen('result');
    
    const isWinner = gameData.winner === currentPlayer.id;
    const winnerName = gameData.winner === gameData.player1.id ? 
        gameData.player1.name : gameData.player2.name;
    
    document.getElementById('result-title').textContent = isWinner ? 'ざまぁｗｗｗ完全勝利！！！' : 'ボロ負けｗｗｗ雑魚乙ｗｗｗ';
    document.getElementById('result-message').textContent = 
        isWinner ? '相手は泣いて逃げ出したぜｗｗｗ最高に気持ちいいいいい！！！' : `${winnerName}にボコボコにされたなｗｗｗ恥ずかしくないの？ｗｗｗ`;
    
    if (gameListener) {
        gameListener();
        gameListener = null;
    }
}

async function cleanupAndReturn() {
    if (gameListener) {
        gameListener();
        gameListener = null;
    }
    if (waitingListener) {
        waitingListener();
        waitingListener = null;
    }
    
    if (currentGame && currentGame.roomId) {
        try {
            await db.collection(WAITING_COLLECTION).doc(currentGame.roomId).delete();
        } catch (error) {
            console.log('Waiting room already deleted or not found');
        }
    }
    
    currentGame = null;
    currentPlayer = null;
    document.getElementById('player-name').value = '';
    document.getElementById('attack-text').value = '';
    showScreen('title');
}

document.getElementById('start-btn').addEventListener('click', async () => {
    const playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        alert('プレイヤー名を入力してください');
        return;
    }
    
    const apiKey = document.getElementById('openai-key').value.trim();
    if (apiKey) {
        openaiApiKey = apiKey;
        localStorage.setItem('openai-api-key', apiKey);
    }
    
    showScreen('matching');
    const roomId = await findOrCreateGame(playerName);
    
    if (currentGame && currentGame.status === 'playing') {
        startGame(roomId);
    }
});

document.getElementById('cancel-matching').addEventListener('click', async () => {
    if (waitingListener) {
        waitingListener();
        waitingListener = null;
    }
    
    if (currentPlayer && !currentGame) {
        const waitingDocs = await db.collection(WAITING_COLLECTION)
            .where('player.id', '==', currentPlayer.id)
            .get();
        
        waitingDocs.forEach(doc => doc.ref.delete());
    }
    
    cleanupAndReturn();
});

document.getElementById('attack-btn').addEventListener('click', () => {
    const text = document.getElementById('attack-text').value.trim();
    if (text) {
        performAttack(text);
    }
});

document.getElementById('attack-text').addEventListener('input', async (e) => {
    const text = e.target.value;
    if (!text) {
        document.getElementById('damage-preview').textContent = '0';
        document.getElementById('ai-evaluation').textContent = '';
        return;
    }
    
    if (openaiApiKey) {
        document.getElementById('ai-evaluation').textContent = '(AI評価待機中...)';
        clearTimeout(window.aiEvaluationTimeout);
        
        window.aiEvaluationTimeout = setTimeout(async () => {
            const result = await calculateDamageWithAI(text);
            document.getElementById('damage-preview').textContent = result.damage;
            if (result.evaluation) {
                document.getElementById('ai-evaluation').textContent = `(${result.evaluation})`;
            }
        }, 1000);
    } else {
        const damage = calculateDamage(text);
        document.getElementById('damage-preview').textContent = damage;
    }
});

document.getElementById('attack-text').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !document.getElementById('attack-btn').disabled) {
        const text = e.target.value.trim();
        if (text) {
            performAttack(text);
        }
    }
});

document.getElementById('return-btn').addEventListener('click', cleanupAndReturn);

document.getElementById('rematch-btn').addEventListener('click', async () => {
    const playerName = currentPlayer.name;
    await cleanupAndReturn();
    document.getElementById('player-name').value = playerName;
    document.getElementById('start-btn').click();
});

window.addEventListener('beforeunload', () => {
    if (gameListener) gameListener();
    if (waitingListener) waitingListener();
});

window.addEventListener('DOMContentLoaded', () => {
    const savedApiKey = localStorage.getItem('openai-api-key');
    if (savedApiKey) {
        document.getElementById('openai-key').value = savedApiKey;
        openaiApiKey = savedApiKey;
    }
    
    const taunts = [
        'まだやってんの？ｗｗｗ',
        '弱すぎて草',
        'こんなゲームで本気になっちゃって恥ずかしくない？',
        'お前の煽り、小学生レベルだなｗｗｗ',
        'もっと気合い入れろよ雑魚ｗｗｗ',
        'ママに泣きつけよｗｗｗ',
        'そんなんで勝てると思ってんの？',
        '早く負けを認めろよｗｗｗ'
    ];
    
    setInterval(() => {
        const randomTaunt = taunts[Math.floor(Math.random() * taunts.length)];
        console.log('%c' + randomTaunt, 'color: #ff0000; font-size: 20px; font-weight: bold; text-shadow: 2px 2px 0 #00ff00;');
    }, 10000);
});