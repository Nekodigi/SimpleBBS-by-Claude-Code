// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyChB7eBjMaX_lRpfIgUxQDi39Qh82R4oyQ",
    authDomain: "sandbox-35d1d.firebaseapp.com",
    projectId: "sandbox-35d1d",
    storageBucket: "sandbox-35d1d.appspot.com",
    messagingSenderId: "906287459396",
    appId: "1:906287459396:web:c931c95d943157cae36011",
    measurementId: "G-LE2Q0XC7B6"
};

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 掲示板アプリのコレクションパス
const APP_NAME = '掲示板アプリ';
const COLLECTION_PATH = `pracClass/nekokazu/apps/${APP_NAME}/posts`;

// DOM要素の取得
const postForm = document.getElementById('postForm');
const nameInput = document.getElementById('nameInput');
const messageInput = document.getElementById('messageInput');
const postsContainer = document.getElementById('postsContainer');

// 投稿フォームのイベントリスナー
postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();
    
    if (!name || !message) {
        alert('名前とメッセージを入力してください');
        return;
    }
    
    try {
        // Firestoreに新しい投稿を追加
        await db.collection(COLLECTION_PATH).add({
            name: name,
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString()
        });
        
        // フォームをリセット
        nameInput.value = '';
        messageInput.value = '';
        
    } catch (error) {
        console.error('投稿エラー:', error);
        alert('投稿に失敗しました。もう一度お試しください。');
    }
});

// リアルタイムで投稿を監視
db.collection(COLLECTION_PATH)
    .orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
        // 投稿コンテナをクリア
        postsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            postsContainer.innerHTML = '<div class="empty-state">まだ投稿がありません</div>';
            return;
        }
        
        // 各投稿を表示
        snapshot.forEach((doc) => {
            const post = doc.data();
            const postElement = createPostElement(doc.id, post);
            postsContainer.appendChild(postElement);
        });
    }, (error) => {
        console.error('データ取得エラー:', error);
        postsContainer.innerHTML = '<div class="empty-state">データの取得に失敗しました</div>';
    });

// 投稿要素を作成する関数
function createPostElement(id, post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.dataset.postId = id;
    
    // タイムスタンプの処理
    let timeString = '投稿時刻不明';
    if (post.timestamp) {
        const date = post.timestamp.toDate();
        timeString = formatDate(date);
    } else if (post.createdAt) {
        const date = new Date(post.createdAt);
        timeString = formatDate(date);
    }
    
    postDiv.innerHTML = `
        <div class="post-header">
            <span class="post-name">${escapeHtml(post.name)}</span>
            <div>
                <span class="post-time">${timeString}</span>
                <button class="delete-btn" onclick="deletePost('${id}')">削除</button>
            </div>
        </div>
        <div class="post-message">${escapeHtml(post.message)}</div>
    `;
    
    return postDiv;
}

// 投稿を削除する関数
async function deletePost(postId) {
    if (!confirm('この投稿を削除しますか？')) {
        return;
    }
    
    try {
        await db.collection(COLLECTION_PATH).doc(postId).delete();
    } catch (error) {
        console.error('削除エラー:', error);
        alert('削除に失敗しました');
    }
}

// 日付をフォーマットする関数
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) {
        return 'たった今';
    } else if (minutes < 60) {
        return `${minutes}分前`;
    } else if (hours < 24) {
        return `${hours}時間前`;
    } else if (days < 7) {
        return `${days}日前`;
    } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hour}:${minute}`;
    }
}

// HTMLエスケープ関数
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}