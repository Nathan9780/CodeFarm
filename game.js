(function() {
    let playerName = '';
    let gameLoopId = null;
    let peer = null;
    let conn = null;
    let isHost = false;
    let remotePlayers = {};
    let myPeerId = null;
    let roomId = '';
    let connectionRetries = 0;
    const MAX_RETRIES = 8;

    const loginScreen = document.getElementById('login-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const roomDisplay = document.getElementById('room-display');
    const roomCodeText = document.getElementById('room-code-text');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const roomCodeInline = document.getElementById('room-code-inline');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const googleBtn = document.getElementById('google-btn');
    const loginError = document.getElementById('login-error');
    const commandInput = document.getElementById('command-input');
    const hintBubble = document.getElementById('hint-bubble');
    const multiplayerStatus = document.getElementById('multiplayer-status');
    const savedName = localStorage.getItem('codegarden_username');

    // ========== COPIAR CÓDIGO DA SALA ==========
    function copyRoomCode() {
        if (!roomId) return;
        const code = roomId;
        try {
            navigator.clipboard.writeText(code).then(() => {
                showNotification('📋 Código copiado: ' + code);
            });
        } catch (e) {
            const input = document.createElement('input');
            input.value = code;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showNotification('📋 Código copiado: ' + code);
        }
    }

    if (roomCodeDisplay) {
        roomCodeDisplay.addEventListener('click', copyRoomCode);
    }

    function showRoomCodeInGame() {
        if (roomCodeDisplay && roomCodeInline && roomId && isHost) {
            roomCodeInline.textContent = roomId;
            roomCodeDisplay.style.display = 'inline-block';
        }
    }

    function hideRoomCodeInGame() {
        if (roomCodeDisplay) {
            roomCodeDisplay.style.display = 'none';
        }
    }

    function showLoginError(msg) { loginError.textContent = msg; loginError.style.display = 'block'; setTimeout(() => loginError.style.display = 'none', 3000); }
    function hideLogin() { loginScreen.style.display = 'none'; }
    function showLobby() { 
        lobbyScreen.style.display = 'flex'; 
        if (roomDisplay) roomDisplay.style.display = 'none';
        document.getElementById('room-id-input').value = '';
    }
    function hideLobby() { lobbyScreen.style.display = 'none'; }
    function showGame() { 
        document.querySelectorAll('#gameCanvas, #hud, #top-bar, #hotbar, #command-box').forEach(el => {
            el.style.display = el.tagName === 'CANVAS' ? 'block' : (el.id === 'top-bar' ? 'flex' : 'flex');
        });
        showRoomCodeInGame();
    }
    function hideGame() { 
        document.querySelectorAll('#gameCanvas, #hud, #top-bar, #hotbar, #command-box, #hint-bubble, #notification, #levelup-modal, #shop-modal, #editor-modal, #friends-modal, #water-bar-container').forEach(el => { if(el) el.style.display = 'none'; });
        hideRoomCodeInGame();
    }

    function logout() {
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        if (conn) conn.close();
        if (peer) peer.destroy();
        localStorage.removeItem('codegarden_username');
        hideGame();
        loginScreen.style.display = 'flex';
        lobbyScreen.style.display = 'none';
        if (roomDisplay) roomDisplay.style.display = 'none';
        loginEmail.value = '';
        loginPassword.value = '';
        playerName = '';
        roomId = '';
        isHost = false;
        document.getElementById('playerNameDisplay').textContent = '';
        document.getElementById('multiplayer-status').style.display = 'none';
        remotePlayers = {};
        connectionRetries = 0;
        hideRoomCodeInGame();
    }

    document.getElementById('logout-btn').addEventListener('click', () => { if (confirm('Tem certeza que deseja sair?')) logout(); });

    // ========== MULTIPLAYER CORRIGIDO ==========
    function initMultiplayer() {
        const roomInput = document.getElementById('room-id-input');
        const lobbyInfo = document.getElementById('lobby-info');

        document.getElementById('host-btn').addEventListener('click', () => {
            roomId = roomInput.value.trim() || ('garden_' + Math.random().toString(36).slice(2, 8));
            roomInput.value = roomId;
            isHost = true;
            if (roomCodeText) roomCodeText.textContent = roomId;
            if (roomDisplay) roomDisplay.style.display = 'block';
            lobbyInfo.textContent = 'Compartilhe o código acima!';
            showNotification('🏠 Sala criada! Código: ' + roomId);
            // Pequeno delay para garantir que o lobby suma antes de iniciar
            setTimeout(() => startPeer(roomId), 300);
        });

        document.getElementById('join-btn').addEventListener('click', () => {
            roomId = roomInput.value.trim();
            if (!roomId) { lobbyInfo.textContent = 'Digite o ID da sala!'; return; }
            isHost = false;
            if (roomDisplay) roomDisplay.style.display = 'none';
            lobbyInfo.textContent = 'Conectando...';
            startPeer(roomId);
        });

        document.getElementById('solo-btn').addEventListener('click', () => {
            roomId = '';
            isHost = false;
            hideLobby();
            showGame();
            startGame();
        });
    }

    function startPeer(room) {
        hideLobby();
        showGame();
        
        // Destruir peer anterior se existir
        if (peer) {
            try { peer.destroy(); } catch(e) {}
        }

        // ID FIXO baseado na sala (sem timestamp)
        // Isso garante que o guest consiga encontrar o host
        const hostPeerId = 'codegarden_' + room + '_host';
        const guestPeerId = 'codegarden_' + room + '_guest';
        const myId = isHost ? hostPeerId : guestPeerId;
        
        console.log('🆔 Meu ID PeerJS:', myId, '| Host:', isHost);
        
        peer = new Peer(myId, { 
            debug: 0,
            // Configurações para melhorar conexão
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            myPeerId = id;
            console.log('✅ Peer aberto com sucesso:', id);
            
            if (isHost) {
                multiplayerStatus.textContent = '🏠 Host - Aguardando...';
                multiplayerStatus.style.color = '#ffd700';
                showNotification('🏠 Aguardando jogador...');
                showRoomCodeInGame();
            } else {
                multiplayerStatus.textContent = '🔗 Convidado - Conectando...';
                multiplayerStatus.style.color = '#ffa500';
                hideRoomCodeInGame();
                // Guest tenta conectar ao host imediatamente
                setTimeout(() => connectToHost(room, hostPeerId), 500);
            }
            
            startGame();
        });

        // Host: listener para conexões recebidas
        peer.on('connection', (incomingConn) => {
            console.log('📞 Conexão recebida de:', incomingConn.peer);
            if (isHost && !conn) {
                conn = incomingConn;
                setupConnection(conn);
                multiplayerStatus.textContent = '🏠 Host - Jogador conectado';
                multiplayerStatus.style.color = '#7cfc00';
                showNotification('👤 Jogador entrou na sala!');
                
                // Enviar estado do mundo
                setTimeout(() => {
                    if (conn && conn.open && typeof map !== 'undefined') {
                        try {
                            conn.send({
                                type: 'worldState',
                                map: map,
                                crops: crops,
                                buildings: buildings,
                                wildAnimals: wildAnimals.map(a => ({
                                    x: a.x, y: a.y, species: a.species,
                                    stage: a.stage, name: a.name
                                })),
                                hostName: playerName,
                                roomCode: roomId
                            });
                            console.log('📤 Estado do mundo enviado ao guest');
                        } catch(e) {
                            console.error('Erro ao enviar estado:', e);
                        }
                    }
                }, 500);
            }
        });

        peer.on('error', (err) => {
            console.error('❌ Peer error:', err);
            if (err.type === 'unavailable-id') {
                // O ID já está em uso - tenta com um sufixo
                const fallbackId = myId + '_' + Math.random().toString(36).slice(2, 6);
                console.log('🔄 Tentando ID alternativo:', fallbackId);
                try { peer.destroy(); } catch(e) {}
                peer = new Peer(fallbackId, { debug: 0 });
                // Reconfigurar eventos no novo peer
                setupPeerEvents(peer, room, fallbackId);
            } else {
                multiplayerStatus.textContent = '❌ Erro de conexão';
                multiplayerStatus.style.color = '#ff6b6b';
            }
        });
        
        peer.on('disconnected', () => {
            console.log('🔌 Peer desconectado, tentando reconectar...');
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        });
    }
    
    function setupPeerEvents(newPeer, room, peerId) {
        newPeer.on('open', (id) => {
            myPeerId = id;
            console.log('✅ Peer alternativo aberto:', id);
            if (isHost) {
                multiplayerStatus.textContent = '🏠 Host - Aguardando...';
                showRoomCodeInGame();
            } else {
                setTimeout(() => connectToHost(room, 'codegarden_' + room + '_host'), 500);
            }
        });
        
        newPeer.on('connection', (incomingConn) => {
            if (isHost && !conn) {
                conn = incomingConn;
                setupConnection(conn);
                multiplayerStatus.textContent = '🏠 Host - Jogador conectado';
                multiplayerStatus.style.color = '#7cfc00';
                showNotification('👤 Jogador entrou!');
            }
        });
        
        newPeer.on('error', (err) => {
            console.error('❌ Erro no peer alternativo:', err);
        });
    }

    function connectToHost(room, hostPeerId) {
        if (conn) return; // Já está conectado
        
        connectionRetries++;
        console.log(`🔍 Tentativa ${connectionRetries}/${MAX_RETRIES} de conectar a: ${hostPeerId}`);
        
        if (connectionRetries > MAX_RETRIES) {
            multiplayerStatus.textContent = '❌ Sala não encontrada';
            multiplayerStatus.style.color = '#ff6b6b';
            showNotification('❌ Não foi possível conectar. Verifique o código da sala.');
            return;
        }

        try {
            const connection = peer.connect(hostPeerId, { 
                reliable: true,
                metadata: { guestName: playerName }
            });
            
            let resolved = false;
            
            connection.on('open', () => {
                if (!resolved) {
                    resolved = true;
                    console.log('✅ Conectado ao host!');
                    conn = connection;
                    setupConnection(conn);
                    multiplayerStatus.textContent = '🔗 Convidado - Conectado';
                    multiplayerStatus.style.color = '#7cfc00';
                    showNotification('🔗 Conectado ao host!');
                }
            });
            
            connection.on('error', (err) => {
                console.log('❌ Erro na tentativa de conexão:', err);
                if (!resolved) {
                    resolved = true;
                    // Tentar novamente após delay
                    setTimeout(() => {
                        if (!conn) connectToHost(room, hostPeerId);
                    }, 2000);
                }
            });
            
            // Timeout: se não conectar em 3 segundos, tenta de novo
            setTimeout(() => {
                if (!resolved && !conn) {
                    resolved = true;
                    console.log('⏰ Timeout na conexão, tentando novamente...');
                    try { connection.close(); } catch(e) {}
                    connectToHost(room, hostPeerId);
                }
            }, 3000);
            
        } catch(e) {
            console.error('Erro ao tentar conectar:', e);
            setTimeout(() => connectToHost(room, hostPeerId), 2000);
        }
    }

    function setupConnection(connection) {
        conn = connection;
        
        conn.on('data', (data) => {
            try {
                if (data.type === 'position') {
                    if (!remotePlayers[data.id]) {
                        remotePlayers[data.id] = {
                            x: data.x, y: data.y,
                            tileX: data.tileX, tileY: data.tileY,
                            name: data.name || 'Jogador',
                            dir: 'front'
                        };
                        showNotification('👤 ' + (data.name || 'Jogador') + ' entrou!');
                    } else {
                        Object.assign(remotePlayers[data.id], {
                            x: data.x, y: data.y,
                            tileX: data.tileX, tileY: data.tileY
                        });
                    }
                } else if (data.type === 'worldState') {
                    console.log('📥 Recebendo estado do mundo...');
                    if (data.map && Array.isArray(data.map)) map = data.map;
                    if (data.crops) crops = data.crops;
                    if (data.buildings && Array.isArray(data.buildings)) buildings = data.buildings;
                    if (data.wildAnimals && Array.isArray(data.wildAnimals)) {
                        wildAnimals = data.wildAnimals.map(a => createAnimal(a.species, a.x, a.y));
                    }
                    if (data.roomCode && !isHost) {
                        roomId = data.roomCode;
                        multiplayerStatus.textContent = '🔗 Convidado - ' + roomId;
                    }
                    if (data.hostName) showNotification('🌍 Mundo de ' + data.hostName + ' carregado!');
                } else if (data.type === 'action') {
                    handleRemoteAction(data);
                }
            } catch(e) {
                console.error('Erro ao processar dados:', e);
            }
        });
        
        conn.on('close', () => {
            console.log('🔌 Conexão fechada');
            showNotification('🔌 Conexão perdida.');
            multiplayerStatus.textContent = '⚫ Desconectado';
            multiplayerStatus.style.color = '#888';
            conn = null;
        });
        
        conn.on('error', (err) => {
            console.error('Erro na conexão:', err);
        });
    }

    function broadcastPosition() {
        if (conn && conn.open && typeof player !== 'undefined') {
            try {
                conn.send({
                    type: 'position',
                    id: myPeerId,
                    x: player.x, y: player.y,
                    tileX: player.tileX, tileY: player.tileY,
                    name: playerName
                });
            } catch(e) {}
        }
    }

    function broadcastAction(actionData) {
        if (conn && conn.open) {
            try { conn.send({ type: 'action', ...actionData }); } catch(e) {}
        }
    }

    function handleRemoteAction(data) {
        if (typeof map === 'undefined') return;
        try {
            if (data.action === 'till') map[data.tileY][data.tileX] = TILE_TILLED;
            else if (data.action === 'plant') crops[`${data.tileX},${data.tileY}`] = { type: data.cropType, timer: 0, ready: false, growTime: Object.values(CROP_GROW_TIMES)[data.cropType] };
            else if (data.action === 'harvest') delete crops[`${data.tileX},${data.tileY}`];
            else if (data.action === 'water') { if (crops[`${data.tileX},${data.tileY}`]) crops[`${data.tileX},${data.tileY}`].timer += 30; }
            else if (data.action === 'placeBuilding') {
                if (data.buildingType === 'fence') map[data.tileY][data.tileX] = TILE_FENCE;
                else if (data.buildingType === 'lamppost') map[data.tileY][data.tileX] = TILE_LAMPPOST;
                else if (data.buildingType === 'well') map[data.tileY][data.tileX] = TILE_WELL;
                else buildings.push({ x: data.tileX, y: data.tileY, type: data.buildingType, startTime: Date.now(), progress: 0, isReady: false });
            }
        } catch(e) {}
    }

    // ========== LOGIN ==========
    loginBtn.addEventListener('click', () => {
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();
        if (email.length < 5 || !email.includes('@')) { showLoginError('Digite um email válido.'); return; }
        if (password.length < 3) { showLoginError('A senha deve ter pelo menos 3 caracteres.'); return; }
        playerName = email.split('@')[0].replace(/[^a-zA-Z0-9À-ÿ]/g, '').slice(0, 14) || 'Fazendeiro';
        localStorage.setItem('codegarden_username', playerName);
        hideLogin();
        showLobby();
    });

    googleBtn.addEventListener('click', () => {
        const emails = ['fazendeiro.dev@gmail.com', 'code.garden@gmail.com'];
        playerName = emails[Math.floor(Math.random() * emails.length)].split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
        localStorage.setItem('codegarden_username', playerName);
        hideLogin();
        showLobby();
    });

    document.getElementById('register-link').addEventListener('click', () => { 
        loginEmail.value = ''; loginPassword.value = ''; loginEmail.focus(); 
        showLoginError('Use qualquer email e senha!'); 
    });
    loginEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginPassword.focus(); });
    loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });

    if (savedName) { playerName = savedName; hideLogin(); showLobby(); }

    initMultiplayer();

    // ========== AMIGOS COM CONVITE ==========
    function getFriends() { 
        const data = localStorage.getItem('codegarden_friends_' + playerName); 
        return data ? JSON.parse(data) : []; 
    }
    function saveFriends(friends) { 
        localStorage.setItem('codegarden_friends_' + playerName, JSON.stringify(friends)); 
    }
    function renderFriends() { 
        const list = document.getElementById('friends-list'); 
        const friends = getFriends(); 
        list.innerHTML = friends.length === 0 
            ? '<div style="color:#888;font-size:7px;padding:10px;">Nenhum amigo ainda.</div>' 
            : friends.map(f => {
                const hasRoom = isHost && roomId;
                return `<div class="friend-row">
                    <span>🧑‍🌾 ${f.name}</span>
                    <span class="${Math.random() > 0.5 ? 'online' : 'offline'}">${Math.random() > 0.5 ? '🟢 Online' : '⚫ Offline'}</span>
                    ${hasRoom ? `<button class="invite-btn" data-invite="${f.name}" title="Convidar para o mundo">📨</button>` : ''}
                    <button class="btn" style="font-size:6px;padding:4px 6px;" data-remove="${f.name}">✖</button>
                </div>`;
            }).join(''); 
        
        list.querySelectorAll('[data-remove]').forEach(btn => { 
            btn.addEventListener('click', (e) => { 
                saveFriends(getFriends().filter(f => f.name !== e.target.getAttribute('data-remove'))); 
                renderFriends(); 
            }); 
        });
        list.querySelectorAll('[data-invite]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const friendName = e.target.getAttribute('data-invite');
                inviteFriend(friendName);
            });
        });
    }

    function inviteFriend(friendName) {
        if (!roomId || !isHost) {
            showNotification('❌ Você precisa ser o host de uma sala!');
            return;
        }
        copyRoomCode();
        showNotification('📨 Convite enviado para ' + friendName + '! Código: ' + roomId);
        document.getElementById('friends-modal').style.display = 'none';
        const invites = JSON.parse(localStorage.getItem('codegarden_invites_' + friendName) || '[]');
        if (!invites.find(i => i.from === playerName && i.roomId === roomId)) {
            invites.push({ from: playerName, roomId: roomId, time: Date.now() });
            localStorage.setItem('codegarden_invites_' + friendName, JSON.stringify(invites));
        }
    }

    function checkInvites() {
        const invites = JSON.parse(localStorage.getItem('codegarden_invites_' + playerName) || '[]');
        if (invites.length > 0) {
            const recentInvite = invites[invites.length - 1];
            const timeSinceInvite = Date.now() - recentInvite.time;
            if (timeSinceInvite < 5 * 60 * 1000) {
                showNotification('📨 Convite de ' + recentInvite.from + '! Sala: ' + recentInvite.roomId);
            }
            localStorage.setItem('codegarden_invites_' + playerName, '[]');
        }
    }

    document.getElementById('friends-btn').addEventListener('click', () => { 
        document.getElementById('friends-modal').style.display = 'block'; 
        renderFriends(); 
    });
    document.getElementById('close-friends').addEventListener('click', () => { 
        document.getElementById('friends-modal').style.display = 'none'; 
    });
    document.getElementById('add-friend-btn').addEventListener('click', () => { 
        const input = document.getElementById('friend-input'); 
        const name = input.value.trim(); 
        if (name.length < 2) return; 
        const friends = getFriends(); 
        if (friends.find(f => f.name === name)) { showNotification('❌ Já está na lista!'); return; } 
        friends.push({ name, online: true }); 
        saveFriends(friends); 
        renderFriends(); 
        input.value = ''; 
        showNotification(`👥 ${name} adicionado!`); 
    });

    function showNotification(msg) { 
        const el = document.getElementById('notification'); 
        el.textContent = msg; el.style.opacity = '1'; 
        clearTimeout(el._timeout); 
        el._timeout = setTimeout(() => el.style.opacity = '0', 2500); 
    }

    function startGame() { 
        initGame(); 
        checkInvites();
    }

    function initGame() {
        const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const MAP_W = 50, MAP_H = 40;
        const TILE_GRASS = 0, TILE_TILLED = 11, TILE_TREE = 5, TILE_RIVER = 6, TILE_FRUIT_TREE = 7, TILE_BUSH = 8, TILE_FENCE = 9, TILE_LAMPPOST = 10, TILE_WELL = 12;
        const BUILD_TIME = 10000; const MINUTE_MS = 60 * 1000, CYCLE_TOTAL = 60 * MINUTE_MS;
        const MOVE_DURATION = 120, PLAYER_SPEED = 0.12, XP_PER_LEVEL = 100;
        const GROWTH_STAGE1 = 15 * MINUTE_MS, GROWTH_STAGE2 = 45 * MINUTE_MS; const MAX_WATER = 10;
        let TILE_SIZE = 48;
        const SPECIES_SPEEDS = { cow: 0.008, pig: 0.015, duck: 0.015, rabbit: 0.03, chicken: 0.012, sheep: 0.01 };
        const SPECIES_EMOJIS = { cow: '🐄', pig: '🐖', duck: '🦆', rabbit: '🐇', chicken: '🐔', sheep: '🐑' };
        const SPECIES_NAMES = { cow: 'vaca', pig: 'porco', duck: 'pato', rabbit: 'coelho', chicken: 'galinha', sheep: 'ovelha' };
        const farmHouse = { x: 22, y: 16, w: 3, h: 2 };
        let timeOffset = 0, playerCoins = 0, playerWater = MAX_WATER, hasWateringCan = false, hasBoots = false;
        let map = Array(MAP_H).fill().map(() => Array(MAP_W).fill(TILE_GRASS));
        let crops = {}, fruitTreeTimers = {};
        let player = { tileX: 25, tileY: 20, x: 25.5, y: 20.5, moving: false, movePath: [], moveStartTime: 0, moveStartX: 25.5, moveStartY: 20.5, moveTargetX: 25.5, moveTargetY: 20.5, actionOnArrival: false, dir: 'front' };
        let camX = player.x - canvas.width / TILE_SIZE / 2, camY = player.y - canvas.height / TILE_SIZE / 2;
        let selectedCrop = -1, selectedTool = null, playerXP = 0, playerLevel = 1;
        let wildAnimals = [], buildings = [], pendingBuilding = null, pendingAnimal = null;
        let floatingHearts = [], time = 0, unlockedItems = ['barn', 'silo', 'fence'];
        const CROP_NAMES = { wheat: 'Trigo', corn: 'Milho', carrot: 'Cenoura', tomato: 'Tomate' };
        const CROP_EMOJIS = { wheat: '🌾', corn: '🌽', carrot: '🥕', tomato: '🍅' };
        const CROP_GROW_TIMES = { wheat: 160, corn: 240, carrot: 200, tomato: 280 };

        window.CROPS = { WHEAT: 'wheat', CORN: 'corn', CARROT: 'carrot', TOMATO: 'tomato' };
        window.TOOLS = { HOE: 'hoe', LEASH: 'leash', WATERING_CAN: 'wateringcan', BOOTS: 'boots' };
        window.ANIMALS = { COW: 'cow', CHICKEN: 'chicken', PIG: 'pig', DUCK: 'duck', RABBIT: 'rabbit', SHEEP: 'sheep' };
        window.BUILDINGS = { BARN: 'barn', SILO: 'silo', FENCE: 'fence', LAMPPOST: 'lamppost', WELL: 'well' };

        window.farm = {
            soil: { till: () => { if (selectedTool !== 'hoe') { showNotification('❌ Equipe TOOLS.HOE primeiro.'); return false; } const x = player.tileX, y = player.tileY; if (map[y][x] === TILE_GRASS) { map[y][x] = TILE_TILLED; showNotification('⛏️ Terra arada!'); broadcastAction({ action: 'till', tileX: x, tileY: y }); return true; } showNotification('❌ Só pode arar grama.'); return false; }, isTilled: () => map[player.tileY] && map[player.tileY][player.tileX] === TILE_TILLED },
            crops: { plant: (crop) => { const x = player.tileX, y = player.tileY; if (map[y][x] !== TILE_TILLED) { showNotification('❌ Precisa arar primeiro.'); return false; } if (crops[`${x},${y}`]) { showNotification('❌ Já tem planta aqui.'); return false; } const ci = Object.keys(CROP_NAMES).indexOf(crop); if (ci === -1) { showNotification('❌ Use CROPS.WHEAT, etc.'); return false; } selectedCrop = ci; selectedTool = null; updateHotbar(); crops[`${x},${y}`] = { type: ci, timer: 0, ready: false, growTime: Object.values(CROP_GROW_TIMES)[ci] }; showNotification(`🌱 Plantou ${CROP_NAMES[crop]}!`); broadcastAction({ action: 'plant', tileX: x, tileY: y, cropType: ci }); return true; }, water: () => { if (!hasWateringCan) { showNotification('❌ Precisa do regador (Nv.3).'); return false; } if (playerWater <= 0) { showNotification('💧 Regador vazio!'); return false; } const x = player.tileX, y = player.tileY, k = `${x},${y}`; if (crops[k] && !crops[k].ready) { crops[k].timer += 30; playerWater--; updateWaterBar(); showNotification('💦 Regou!'); broadcastAction({ action: 'water', tileX: x, tileY: y }); return true; } showNotification('❌ Nada para regar aqui.'); return false; }, harvest: () => { const x = player.tileX, y = player.tileY, k = `${x},${y}`; if (crops[k] && crops[k].ready) { playerXP += 20; updateLevel(); delete crops[k]; playerCoins += 10; showNotification('🌾 Colheu! +20 XP +10💰'); broadcastAction({ action: 'harvest', tileX: x, tileY: y }); return true; } if (map[y][x] === TILE_FRUIT_TREE && fruitTreeTimers[k] >= 300) { playerXP += 50; updateLevel(); fruitTreeTimers[k] = 0; playerCoins += 25; showNotification('🍎 Frutas! +50 XP +25💰'); return 'fruit'; } showNotification('❌ Nada pronto para colher.'); return false; }, isReady: () => { const k = `${player.tileX},${player.tileY}`; return crops[k] && crops[k].ready; } },
            animals: { feed: (name) => { const nearest = wildAnimals.find(a => a.name === name && Math.hypot(player.x - a.x, player.y - a.y) < 1.5); if (!nearest) { showNotification('❌ Animal não encontrado.'); return false; } const xpG = 30; playerXP += xpG; updateLevel(); nearest.fed = true; nearest.feedCount++; spawnHearts(nearest.x, nearest.y, 4); showNotification(`🐾 ${nearest.name} alimentado! +${xpG} XP`); if (nearest.feedCount >= 2 && nearest.stage < 2) { nearest.stage++; nearest.feedCount = 0; nearest.growthStart = Date.now() - (nearest.stage === 1 ? GROWTH_STAGE1 : GROWTH_STAGE2); showNotification(`🌟 ${nearest.name} cresceu!`); spawnHearts(nearest.x, nearest.y, 10); } return true; }, lead: () => { const n = getNearestAnimal(); if (n && Math.hypot(player.x - n.x, player.y - n.y) < 1.5) { n.isLeashed = true; showNotification(`🔗 ${n.name} preso!`); return n.name; } return false; }, release: () => { let f = false; wildAnimals.forEach(a => { if (a.isLeashed) { a.isLeashed = false; a.targetX = a.x; a.targetY = a.y; f = true; } }); showNotification(f ? '🔓 Solto!' : '❌ Nenhum preso.'); return f; }, collect: () => { const n = getNearestAnimal(); if (n && n.stage === 2 && Math.hypot(player.x - n.x, player.y - n.y) < 1.5) { playerXP += 60; updateLevel(); playerCoins += 30; showNotification(`🥚 +60 XP +30💰`); spawnHearts(n.x, n.y, 5); return n.name; } return false; }, getNearest: () => { const n = getNearestAnimal(); return n ? { name: n.name, stage: n.stage } : null; } },
            buildings: { place: () => { if (!pendingBuilding) { showNotification('❌ Compre algo primeiro.'); return false; } const tx = player.tileX, ty = player.tileY; if (!isWalkable(tx, ty) || (map[ty][tx] !== TILE_GRASS && map[ty][tx] !== TILE_TILLED)) { showNotification('❌ Local inválido.'); return false; } const type = pendingBuilding.type; if (type === 'fence') map[ty][tx] = TILE_FENCE; else if (type === 'lamppost') map[ty][tx] = TILE_LAMPPOST; else if (type === 'well') map[ty][tx] = TILE_WELL; else buildings.push({ x: tx, y: ty, type, startTime: Date.now(), progress: 0, isReady: false }); showNotification(`✅ ${type} colocado!`); broadcastAction({ action: 'placeBuilding', tileX: tx, tileY: ty, buildingType: type }); pendingBuilding = null; return true; }, use: () => { const b = getNearestBuilding(); if (b && b.isReady) { playerXP += 40; updateLevel(); playerCoins += 20; showNotification('🏠 +40 XP +20💰'); return b.type; } return false; }, destroy: () => { const b = getNearestBuilding(); if (b) { buildings = buildings.filter(i => i !== b); showNotification('💥 Removida!'); return b.type; } return false; } },
            tools: { equip: (tool) => { if (tool === 'hoe') { selectedTool = 'hoe'; selectedCrop = -1; updateHotbar(); return true; } if (tool === 'leash') { selectedTool = 'leash'; selectedCrop = -1; updateHotbar(); return true; } if (tool === 'wateringcan') { if (!hasWateringCan) { showNotification('🔒 Nível 3'); return false; } selectedTool = 'wateringcan'; selectedCrop = -1; updateHotbar(); return true; } if (tool === 'boots') { if (!hasBoots) { showNotification('🔒 Nível 4'); return false; } selectedTool = 'boots'; selectedCrop = -1; updateHotbar(); return true; } return false; }, getWater: () => { const nw = map[player.tileY] && map[player.tileY][player.tileX] === TILE_WELL; const nwb = buildings.some(b => b.type === 'well' && Math.hypot(player.x - (b.x + 0.5), player.y - (b.y + 0.5)) < 1.5); if (nw || nwb) { playerWater = MAX_WATER; updateWaterBar(); showNotification('💧 Regador cheio!'); return true; } return false; } },
            shop: { buy: (item) => { if (['barn','silo','fence','lamppost','well'].includes(item)) { if (item === 'lamppost' && playerLevel < 2) { showNotification('🔒 Nv.2'); return false; } if (item === 'well' && playerLevel < 3) { showNotification('🔒 Nv.3'); return false; } pendingBuilding = { type: item }; showNotification(`🏗️ ${item} comprado! Use farm.buildings.place()`); return true; } if (item === 'boots') { if (playerLevel < 4) { showNotification('🔒 Nv.4'); return false; } hasBoots = true; document.getElementById('boots-slot').classList.remove('locked'); showNotification('👢 Botas equipadas!'); return true; } if (['cow','pig','duck','rabbit','chicken','sheep'].includes(item)) { pendingAnimal = item; showNotification(`🐾 ${SPECIES_NAMES[item]} comprado! Clique no mapa.`); return true; } return false; } },
            player: { moveRight: () => movePlayerRelative(0, 1), moveLeft: () => movePlayerRelative(0, -1), moveUp: () => movePlayerRelative(-1, 0), moveDown: () => movePlayerRelative(1, 0), getPosition: () => ({ x: player.tileX, y: player.tileY }), getLevel: () => playerLevel, getXP: () => playerXP, getCoins: () => playerCoins, isMoving: () => player.moving },
            weather: { setDay: () => { timeOffset = getTimeToPeriod('DIA'); showNotification('☀️ Dia'); }, setAfternoon: () => { timeOffset = getTimeToPeriod('TARDE'); showNotification('🌅 Tarde'); }, setNight: () => { timeOffset = getTimeToPeriod('NOITE'); showNotification('🌙 Noite'); }, setAuto: () => { timeOffset = 0; showNotification('🔄 Automático'); }, sleep: () => { skipToNextPeriod(); }, getCurrent: () => getCurrentWeather() },
            wait: (ms) => new Promise(r => setTimeout(r, ms))
        };

        window.till = () => farm.soil.till(); window.water = () => farm.crops.water(); window.plant = (c) => farm.crops.plant(c); window.harvest = () => farm.crops.harvest();
        window.feedAnimal = (n) => farm.animals.feed(n); window.leadAnimal = () => farm.animals.lead(); window.releaseAnimal = () => farm.animals.release();
        window.collectAnimal = () => farm.animals.collect(); window.placeBuilding = () => farm.buildings.place(); window.useBuilding = () => farm.buildings.use();
        window.destroyBuilding = () => farm.buildings.destroy(); window.getWater = () => farm.tools.getWater(); window.sleep = () => farm.weather.sleep();
        window.wait = (ms) => farm.wait(ms); window.moveRight = () => farm.player.moveRight(); window.moveLeft = () => farm.player.moveLeft();
        window.moveUp = () => farm.player.moveUp(); window.moveDown = () => farm.player.moveDown();
        window.setDia = () => farm.weather.setDay(); window.setTarde = () => farm.weather.setAfternoon(); window.setNoite = () => farm.weather.setNight(); window.setAutoClima = () => farm.weather.setAuto();

        function getTimeToPeriod(t) { const e = (Date.now() + timeOffset) % CYCLE_TOTAL; if (t === 'DIA') return timeOffset - e; if (t === 'TARDE') return timeOffset - e + 30 * MINUTE_MS; if (t === 'NOITE') return timeOffset - e + 40 * MINUTE_MS; return timeOffset; }
        function getCurrentWeather() { const e = ((Date.now() % CYCLE_TOTAL) + timeOffset + CYCLE_TOTAL) % CYCLE_TOTAL; if (e < 30 * MINUTE_MS) return 'DIA'; if (e < 40 * MINUTE_MS) return 'TARDE'; return 'NOITE'; }
        function skipToNextPeriod() { const e = ((Date.now() % CYCLE_TOTAL) + timeOffset + CYCLE_TOTAL) % CYCLE_TOTAL; if (e < 30 * MINUTE_MS) timeOffset += 30 * MINUTE_MS - e; else if (e < 40 * MINUTE_MS) timeOffset += 40 * MINUTE_MS - e; else timeOffset += 60 * MINUTE_MS - e; showNotification('💤 Você descansou.'); }
        function updateWaterBar() { const c = document.getElementById('water-bar-container'); if (hasWateringCan) { c.style.display = 'flex'; document.getElementById('water-bar-inner').style.width = (playerWater / MAX_WATER * 100) + '%'; document.getElementById('water-text').textContent = playerWater + '/' + MAX_WATER; } else { c.style.display = 'none'; } }
        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; TILE_SIZE = Math.floor(canvas.width / 15); }
        window.addEventListener('resize', resize); resize();
        function tileCenterX(tx) { return tx + 0.5; } function tileCenterY(ty) { return ty + 0.5; }

        document.querySelectorAll('.shop-tab').forEach(tab => { tab.addEventListener('click', () => { document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.shop-category').forEach(c => c.classList.remove('active')); tab.classList.add('active'); document.getElementById('cat-' + tab.getAttribute('data-tab')).classList.add('active'); }); });
        function updateShopUI() { const li = document.getElementById('shop-lamppost'); if (playerLevel >= 2) { li.classList.remove('locked'); li.innerHTML = '<div class="item-info"><span class="item-name">💡 Poste de Luz</span></div><button class="btn" data-item="lamppost">COMPRAR</button>'; } const wi = document.getElementById('shop-well'); if (playerLevel >= 3) { wi.classList.remove('locked'); wi.innerHTML = '<div class="item-info"><span class="item-name">🪣 Poço</span></div><button class="btn" data-item="well">COMPRAR</button>'; } const bi = document.getElementById('shop-boots'); if (playerLevel >= 4) { bi.classList.remove('locked'); bi.innerHTML = '<div class="item-info"><span class="item-name">👢 Botas</span></div><button class="btn" data-item="boots">COMPRAR</button>'; } if (playerLevel >= 3 && !hasWateringCan) { hasWateringCan = true; playerWater = MAX_WATER; updateWaterBar(); document.getElementById('watering-can-slot').classList.remove('locked'); showNotification('🚿 Regador desbloqueado!'); } if (playerLevel >= 4 && !hasBoots) { hasBoots = true; document.getElementById('boots-slot').classList.remove('locked'); showNotification('👢 Botas desbloqueadas!'); } bindShopButtons(); }
        function bindShopButtons() { document.querySelectorAll('#shop-modal .btn[data-item]').forEach(btn => { const nb = btn.cloneNode(true); btn.parentNode.replaceChild(nb, btn); }); document.querySelectorAll('#shop-modal .btn[data-item]').forEach(btn => { btn.addEventListener('click', (e) => { farm.shop.buy(e.target.getAttribute('data-item')); document.getElementById('shop-modal').style.display = 'none'; }); }); }
        function updateHotbar() { document.querySelectorAll('.hotbar-slot').forEach(s => { const sv = s.getAttribute('data-slot'); if (sv === '5') s.classList.toggle('active', selectedTool === 'leash'); else if (sv === '6') s.classList.toggle('active', selectedTool === 'wateringcan'); else if (sv === '7') s.classList.toggle('active', selectedTool === 'hoe'); else if (sv === '8') s.classList.toggle('active', selectedTool === 'boots'); else s.classList.toggle('active', parseInt(sv) === selectedCrop && selectedTool === null); }); document.getElementById('seedDisplay').textContent = selectedTool === 'leash' ? '🧶 Corda' : selectedTool === 'wateringcan' ? '🚿 Regador' : selectedTool === 'hoe' ? '🔧 Enxada' : selectedTool === 'boots' ? '👢 Botas' : selectedCrop === -1 ? '👐 Mãos vazias' : `🌱 ${Object.values(CROP_EMOJIS)[selectedCrop]} ${Object.values(CROP_NAMES)[selectedCrop]}`; }
        document.querySelectorAll('.hotbar-slot').forEach(s => { s.addEventListener('click', () => { const sv = s.getAttribute('data-slot'); if (sv === '6' && !hasWateringCan) { showNotification('🔒 Nível 3'); return; } if (sv === '8' && !hasBoots) { showNotification('🔒 Nível 4'); return; } if (sv === '5') { selectedTool = selectedTool === 'leash' ? null : 'leash'; if (selectedTool === 'leash') selectedCrop = -1; } else if (sv === '6') { selectedTool = selectedTool === 'wateringcan' ? null : 'wateringcan'; if (selectedTool === 'wateringcan') selectedCrop = -1; } else if (sv === '7') { selectedTool = selectedTool === 'hoe' ? null : 'hoe'; if (selectedTool === 'hoe') selectedCrop = -1; } else if (sv === '8') { selectedTool = selectedTool === 'boots' ? null : 'boots'; if (selectedTool === 'boots') selectedCrop = -1; } else { selectedTool = null; selectedCrop = parseInt(sv); } updateHotbar(); }); });

        function formatHint(func, condition, returnInfo) { return `${func}<br><span class="hint-detail">${condition ? 'Cond: '+condition+'. ' : ''}Ret: ${returnInfo}</span>`; }
        function showHint(code) { hintBubble.innerHTML = code; hintBubble.style.display = 'block'; }
        function hideHint() { hintBubble.innerHTML = ''; hintBubble.style.display = 'none'; }
        function showLevelUpModal() { const m = document.getElementById('levelup-modal'); document.getElementById('levelup-level').textContent = `Nível ${playerLevel}`; playerCoins += playerLevel * 100; let u = ''; if (playerLevel === 2) u = '🔓 Poste de Luz!'; if (playerLevel === 3) u = '🔓 Regador + Poço!'; if (playerLevel === 4) u = '🔓 Botas!'; document.getElementById('levelup-unlock').textContent = u; m.style.display = 'block'; document.getElementById('levelup-close').onclick = () => { m.style.display = 'none'; }; clearTimeout(m._timeout); m._timeout = setTimeout(() => { m.style.display = 'none'; }, 5000); }

        commandInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const cmd = commandInput.value.trim(); commandInput.value = ''; if (cmd) executeFreeCommand(cmd); } });
        window.addEventListener('keydown', (e) => {
            if (document.getElementById('editor-modal').style.display === 'block') return;
            if (document.getElementById('shop-modal').style.display === 'block') return;
            if (document.getElementById('friends-modal').style.display === 'block') return;
            if (document.getElementById('levelup-modal').style.display === 'block') { if (e.key === 'Enter' || e.key === 'Escape') document.getElementById('levelup-modal').style.display = 'none'; return; }
            if (document.activeElement === commandInput) return;
            if (e.key === '0') { selectedCrop = -1; selectedTool = null; updateHotbar(); e.preventDefault(); }
            if (e.key === '1') { selectedCrop = 0; selectedTool = null; updateHotbar(); }
            if (e.key === '2') { selectedCrop = 1; selectedTool = null; updateHotbar(); }
            if (e.key === '3') { selectedCrop = 2; selectedTool = null; updateHotbar(); }
            if (e.key === '4') { selectedCrop = 3; selectedTool = null; updateHotbar(); }
            if (e.key === '5') { selectedTool = selectedTool === 'leash' ? null : 'leash'; if (selectedTool === 'leash') selectedCrop = -1; updateHotbar(); e.preventDefault(); }
            if (e.key === '6') { if (!hasWateringCan) { showNotification('🔒 Nível 3'); return; } selectedTool = selectedTool === 'wateringcan' ? null : 'wateringcan'; if (selectedTool === 'wateringcan') selectedCrop = -1; updateHotbar(); e.preventDefault(); }
            if (e.key === '7') { selectedTool = selectedTool === 'hoe' ? null : 'hoe'; if (selectedTool === 'hoe') selectedCrop = -1; updateHotbar(); e.preventDefault(); }
            if (e.key === '8') { if (!hasBoots) { showNotification('🔒 Nível 4'); return; } selectedTool = selectedTool === 'boots' ? null : 'boots'; if (selectedTool === 'boots') selectedCrop = -1; updateHotbar(); e.preventDefault(); }
        });

        function executeFreeCommand(cmd) { if (!cmd) return; try { eval(cmd); } catch (e) { showNotification('❓ ' + cmd); } }

        function getNearestBuilding() { let n = null, d = 2; buildings.forEach(b => { const dist = Math.hypot(player.x - (b.x + 0.5), player.y - (b.y + 0.5)); if (dist < d) { d = dist; n = b; } }); return n; }
        function getNearestAnimal() { let n = null, d = 1.5; wildAnimals.forEach(a => { const dist = Math.hypot(player.x - a.x, player.y - a.y); if (dist < d) { d = dist; n = a; } }); return n; }
        function spawnHearts(wx, wy, count) { for (let i = 0; i < count; i++) floatingHearts.push({ x: wx, y: wy, timer: 60 + Math.random() * 40, offsetX: (Math.random() - 0.5) * 0.8, offsetY: 0 }); }

        document.getElementById('shop-btn').addEventListener('click', () => { document.getElementById('shop-modal').style.display = 'block'; updateShopUI(); });
        document.getElementById('close-shop').addEventListener('click', () => document.getElementById('shop-modal').style.display = 'none');
        bindShopButtons();

        function initializeMap() { for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) map[y][x] = TILE_GRASS; for (let r = 0; r < 2; r++) { let cx = 10 + Math.floor(Math.random() * (MAP_W - 20)), cy = 0; while (cy < MAP_H) { if (!(cx >= farmHouse.x && cx < farmHouse.x + farmHouse.w && cy >= farmHouse.y && cy < farmHouse.y + farmHouse.h)) { map[cy][cx] = TILE_RIVER; if (Math.random() < 0.2 && cx + 1 < MAP_W) map[cy][cx + 1] = TILE_RIVER; } cx += Math.floor(Math.random() * 3) - 1; cy += 1; cx = Math.max(1, Math.min(MAP_W - 2, cx)); } } for (let i = 0; i < 18; i++) { let cx = Math.floor(Math.random() * MAP_W), cy = Math.floor(Math.random() * MAP_H); for (let j = 0; j < 10; j++) { let tx = cx + Math.floor(Math.random() * 6 - 3), ty = cy + Math.floor(Math.random() * 6 - 3); if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H && map[ty][tx] === TILE_GRASS && !(tx >= farmHouse.x && tx < farmHouse.x + farmHouse.w && ty >= farmHouse.y && ty < farmHouse.y + farmHouse.h) && Math.random() < 0.4) map[ty][tx] = TILE_TREE; } } for (let i = 0; i < 25; i++) { let cx = Math.floor(Math.random() * MAP_W), cy = Math.floor(Math.random() * MAP_H); for (let j = 0; j < 4; j++) { let bx = cx + Math.floor(Math.random() * 4 - 2), by = cy + Math.floor(Math.random() * 4 - 2); if (bx >= 0 && bx < MAP_W && by >= 0 && by < MAP_H && map[by][bx] === TILE_GRASS) map[by][bx] = TILE_BUSH; } } for (let i = 0; i < 12; i++) { let fx = Math.floor(Math.random() * MAP_W), fy = Math.floor(Math.random() * MAP_H); if (map[fy][fx] === TILE_GRASS) { map[fy][fx] = TILE_FRUIT_TREE; fruitTreeTimers[`${fx},${fy}`] = 0; } } const initSpec = ['chicken','chicken','cow','pig','duck','rabbit','sheep','chicken','duck','rabbit']; initSpec.forEach(spec => { let ax, ay; do { ax = Math.floor(Math.random() * MAP_W); ay = Math.floor(Math.random() * MAP_H); } while (!isWalkable(ax, ay) || map[ay][ax] !== TILE_GRASS); wildAnimals.push(createAnimal(spec, ax + 0.5, ay + 0.5)); }); }
        function createAnimal(species, x, y) { return { x, y, targetX: x, targetY: y, species, name: SPECIES_NAMES[species], type: SPECIES_EMOJIS[species], speed: SPECIES_SPEEDS[species] || 0.02, dir: 'front', isInteracting: false, isLeashed: false, fed: false, timer: Math.random() * 100, stage: 0, growthStart: Date.now(), promptTimer: 0, feedCount: 0 }; }
        initializeMap();

        function isWalkable(tx, ty) { if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false; const tile = map[ty][tx]; if (tile === TILE_FENCE) return false; if (selectedTool === 'boots' && tile === TILE_RIVER) return true; if (tile === TILE_LAMPPOST || tile === TILE_WELL || tile === TILE_TILLED) return true; const inHouse = tx >= farmHouse.x && tx < farmHouse.x + farmHouse.w && ty >= farmHouse.y && ty < farmHouse.y + farmHouse.h; if (inHouse) return true; return tile !== TILE_RIVER; }
        function canAnimalMoveTo(animal, nx, ny) { const tx = Math.floor(nx), ty = Math.floor(ny); if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false; const tile = map[ty][tx]; if (tile === TILE_FENCE) return false; if (tile === TILE_RIVER && animal.species !== 'duck') return false; return true; }
        function getAnimalStage(animal) { const e = Date.now() - animal.growthStart; if (e > GROWTH_STAGE2) return 2; if (e > GROWTH_STAGE1) return 1; return 0; }

        function buildPathTo(destTX, destTY) { const sTX = player.tileX, sTY = player.tileY; if (sTX === destTX && sTY === destTY) return []; const visited = new Set(), queue = [[sTX, sTY, []]]; visited.add(`${sTX},${sTY}`); while (queue.length > 0) { const [cx, cy, path] = queue.shift(); for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) { if (nx === destTX && ny === destTY) return [...path, { x: tileCenterX(nx), y: tileCenterY(ny), tileX: nx, tileY: ny }]; const key = `${nx},${ny}`; if (!visited.has(key) && isWalkable(nx, ny)) { visited.add(key); queue.push([nx, ny, [...path, { x: tileCenterX(nx), y: tileCenterY(ny), tileX: nx, tileY: ny }]]); } } } return []; }
        function startMoveAlongPath(path, actionOnEnd) { if (player.moving || path.length === 0) return; player.movePath = path; player.moving = true; player.actionOnArrival = actionOnEnd; advanceToNextTile(); }
        function advanceToNextTile() { if (player.movePath.length === 0) { player.moving = false; player.tileX = Math.round(player.x - 0.5); player.tileY = Math.round(player.y - 0.5); player.x = tileCenterX(player.tileX); player.y = tileCenterY(player.tileY); if (player.actionOnArrival) { player.actionOnArrival = false; executeAction(player.tileX, player.tileY); } checkNearbyInteraction(); return; } const next = player.movePath.shift(); player.moveStartX = player.x; player.moveStartY = player.y; player.moveTargetX = next.x; player.moveTargetY = next.y; player.moveStartTime = performance.now(); player.tileX = next.tileX; player.tileY = next.tileY; const dx = player.moveTargetX - player.moveStartX, dy = player.moveTargetY - player.moveStartY; if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? 'right' : 'left'; else player.dir = dy > 0 ? 'front' : 'back'; }

        canvas.addEventListener('mousedown', (e) => { const rect = canvas.getBoundingClientRect(), sx = canvas.width / rect.width, sy = canvas.height / rect.height, cx = (e.clientX - rect.left) * sx / TILE_SIZE + camX, cy = (e.clientY - rect.top) * sy / TILE_SIZE + camY, tx = Math.floor(cx), ty = Math.floor(cy); if (pendingAnimal) { if (isWalkable(tx, ty) && (map[ty][tx] === TILE_GRASS || map[ty][tx] === TILE_TILLED)) { wildAnimals.push(createAnimal(pendingAnimal, tx + 0.5, ty + 0.5)); showNotification(`🐾 ${SPECIES_NAMES[pendingAnimal]} solto!`); } else showNotification('❌ Local inválido.'); pendingAnimal = null; return; } if (player.moving) return; if (!isWalkable(tx, ty)) { showNotification('🚧 Bloqueado!'); return; } if (tx === player.tileX && ty === player.tileY) { executeAction(tx, ty); return; } const path = buildPathTo(tx, ty); if (path.length === 0) return; startMoveAlongPath(path, true); });

        function movePlayerRelative(dRow, dCol) { if (player.moving) return Promise.resolve(); const tx = player.tileX + dCol, ty = player.tileY + dRow; if (!isWalkable(tx, ty)) { showNotification('🚫 Bloqueado!'); return Promise.resolve(); } const path = buildPathTo(tx, ty); if (path.length === 0) return Promise.resolve(); startMoveAlongPath(path, true); return waitForArrival(); }
        function waitForArrival() { return new Promise(res => { const check = () => { if (!player.moving) res(); else requestAnimationFrame(check); }; check(); }); }

        function updateLevel() { const nl = Math.floor(playerXP / XP_PER_LEVEL) + 1; if (nl > playerLevel) { playerLevel = nl; updateShopUI(); showLevelUpModal(); } document.getElementById('xpDisplay').textContent = `⭐ Nv.${playerLevel} | XP: ${playerXP}/${playerLevel * XP_PER_LEVEL} 💰${playerCoins}`; }
        function setFacing(entity, target) { const dx = target.x - entity.x, dy = target.y - entity.y; entity.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back'); }

        function checkNearbyInteraction() {
            const px = player.x, py = player.y, tx = player.tileX, ty = player.tileY, key = `${tx},${ty}`, tile = map[ty] ? map[ty][tx] : null; hideHint();
            if (tile === TILE_WELL && hasWateringCan) { showHint(formatHint('farm.tools.getWater()', 'Próximo a poço', 'true se cheio')); return; }
            if (pendingBuilding) { showHint(formatHint('farm.buildings.place()', 'Item comprado', 'true se colocado')); return; }
            if (selectedTool === 'hoe' && tile === TILE_GRASS) { showHint(formatHint('farm.soil.till()', 'TOOLS.HOE equipado', 'true se arado')); return; }
            if (selectedTool === 'wateringcan' && crops[key] && !crops[key].ready) { showHint(formatHint('farm.crops.water()', 'Regador equipado', 'true se regou')); return; }
            if (crops[key] && crops[key].ready) { showHint(formatHint('farm.crops.harvest()', 'Cultura pronta', 'true ou false')); return; }
            if (tile === TILE_FRUIT_TREE && fruitTreeTimers[key] >= 300) { showHint(formatHint('farm.crops.harvest()', 'Fruta madura', "'fruit' ou false")); return; }
            if (tile === TILE_TILLED && !crops[key] && selectedCrop >= 0 && selectedTool === null) { const cn = Object.keys(CROP_NAMES)[selectedCrop]; showHint(formatHint(`farm.crops.plant(CROPS.${cn.toUpperCase()})`, 'Terra arada', 'true se plantou')); return; }
            if (selectedTool === 'leash') { const nearest = getNearestAnimal(); if (nearest && Math.hypot(px - nearest.x, py - nearest.y) < 1.5) { showHint(formatHint(nearest.isLeashed ? 'farm.animals.release()' : 'farm.animals.lead()', 'TOOLS.LEASH equipado', nearest.isLeashed ? 'true se solto' : 'nome do animal')); return; } }
            const na = wildAnimals.find(a => a.isInteracting && a.promptTimer > 30 && Math.hypot(px - a.x, py - a.y) < 1.5);
            if (na && selectedTool !== 'leash') { showHint(formatHint(`farm.animals.feed("${na.name}")`, 'Próximo ao animal', 'true se alimentado')); return; }
            const b = getNearestBuilding(); if (b && Math.hypot(px - (b.x + 0.5), py - (b.y + 0.5)) < 1.5) { showHint(formatHint(b.isReady ? 'farm.buildings.use()' : '⏳ Em andamento...', b.isReady ? 'Construção pronta' : 'Aguardando', b.isReady ? 'tipo da construção' : 'nenhum')); return; }
            const inHouse = tx >= farmHouse.x && tx < farmHouse.x + farmHouse.w && ty >= farmHouse.y && ty < farmHouse.y + farmHouse.h;
            if (inHouse) { showHint(formatHint('farm.weather.sleep()', 'Dentro da casa', 'avança o tempo')); }
        }

        function executeAction(x, y) { const tile = map[y][x], key = `${x},${y}`; if (crops[key] && crops[key].ready) { playerXP += 20; updateLevel(); delete crops[key]; playerCoins += 10; showNotification('🌾 Colheu!'); broadcastAction({ action: 'harvest', tileX: x, tileY: y }); return; } if (tile === TILE_FRUIT_TREE && fruitTreeTimers[key] >= 300) { playerXP += 50; updateLevel(); fruitTreeTimers[key] = 0; playerCoins += 25; showNotification('🍎 Frutas!'); return; } if (tile === TILE_TILLED && !crops[key] && selectedCrop >= 0 && selectedTool === null) { const cn = Object.keys(CROP_NAMES)[selectedCrop]; crops[key] = { type: selectedCrop, timer: 0, ready: false, growTime: Object.values(CROP_GROW_TIMES)[selectedCrop] }; showNotification(`🌱 Plantou ${CROP_NAMES[cn]}!`); broadcastAction({ action: 'plant', tileX: x, tileY: y, cropType: selectedCrop }); return; } if (tile === TILE_GRASS && !crops[key] && selectedTool === 'hoe') { map[y][x] = TILE_TILLED; showNotification('⛏️ Terra arada!'); broadcastAction({ action: 'till', tileX: x, tileY: y }); return; } }

        function update() {
            time++; if (player.moving) { const e = performance.now() - player.moveStartTime, p = Math.min(e / MOVE_DURATION, 1.0); player.x = player.moveStartX + (player.moveTargetX - player.moveStartX) * p; player.y = player.moveStartY + (player.moveTargetY - player.moveStartY) * p; if (p >= 1.0) { player.x = player.moveTargetX; player.y = player.moveTargetY; advanceToNextTile(); } }
            for (let k in crops) { const c = crops[k]; if (!c.ready && c.timer < c.growTime) c.timer += 1; if (c.timer >= c.growTime) c.ready = true; }
            for (let k in fruitTreeTimers) { if (fruitTreeTimers[k] < 300) fruitTreeTimers[k] += 1; }
            wildAnimals.forEach(a => { const ns = getAnimalStage(a); if (ns !== a.stage) a.stage = ns; const d = Math.hypot(player.x - a.x, player.y - a.y); if (a.isLeashed) { const dx = player.x - a.x, dy = player.y - a.y, od = Math.hypot(dx, dy); if (od > 1.8) { a.x += (dx / od) * PLAYER_SPEED * 0.85; a.y += (dy / od) * PLAYER_SPEED * 0.85; } else if (od < 1.3) { a.x -= (dx / od) * 0.03; a.y -= (dy / od) * 0.03; } a.targetX = a.x; a.targetY = a.y; a.isInteracting = false; a.promptTimer = 0; } else if (d < 1.2 && !player.moving) { a.isInteracting = true; setFacing(player, a); setFacing(a, player); a.promptTimer++; } else { a.isInteracting = false; a.promptTimer = 0; } if (!a.isLeashed) { const ddx = a.targetX - a.x, ddy = a.targetY - a.y, dd = Math.hypot(ddx, ddy), spd = a.speed; if (dd > 0.06 && !a.isInteracting) { const nax = a.x + (ddx / dd) * spd, nay = a.y + (ddy / dd) * spd; if (canAnimalMoveTo(a, nax, a.y)) a.x = nax; else a.targetX = a.x + (Math.random() * 4 - 2); if (canAnimalMoveTo(a, a.x, nay)) a.y = nay; else a.targetY = a.y + (Math.random() * 4 - 2); } else if (dd < 0.1 && !a.isInteracting) { let nx, ny; do { nx = Math.floor(a.x + (Math.random() * 6 - 3)); ny = Math.floor(a.y + (Math.random() * 6 - 3)); } while (!canAnimalMoveTo(a, nx + 0.5, ny + 0.5)); a.targetX = nx + 0.5; a.targetY = ny + 0.5; } } if (a.fed) a.fed = false; });
            if (!player.moving && !pendingBuilding) checkNearbyInteraction();
            floatingHearts.forEach(h => { h.timer--; h.offsetY -= 0.02; });
            floatingHearts = floatingHearts.filter(h => h.timer > 0);
            document.getElementById('leashDisplay').textContent = wildAnimals.some(a => a.isLeashed) ? '🔗 Animais na corda' : '';
            buildings.forEach(b => { if (!b.isReady) { const e = Date.now() - b.startTime; b.progress = Math.min(e / BUILD_TIME, 1); if (b.progress >= 1) b.isReady = true; } });
            const tcx = player.x - (canvas.width / TILE_SIZE) / 2, tcy = player.y - (canvas.height / TILE_SIZE) / 2;
            camX += (tcx - camX) * 0.12; camY += (tcy - camY) * 0.12;
            camX = Math.max(0, Math.min(MAP_W - canvas.width / TILE_SIZE, camX));
            camY = Math.max(0, Math.min(MAP_H - canvas.height / TILE_SIZE, camY));
            document.getElementById('timeDisplay').textContent = getCurrentWeather() === 'DIA' ? '☀️ Dia' : (getCurrentWeather() === 'TARDE' ? '🌅 Tarde' : '🌙 Noite');
            if (Math.floor(time) % 12 === 0) broadcastPosition();
        }

        function draw() { const weather = getCurrentWeather(); let gc, sc, ov; if (weather === 'DIA') { gc = '#7cb342'; sc = '#87ceeb'; ov = null; } else if (weather === 'TARDE') { gc = '#5a7d3c'; sc = '#c47f5a'; ov = 'rgba(0,0,0,0.05)'; } else { gc = '#2d4a1e'; sc = '#1a1a3e'; ov = 'rgba(0,0,30,0.6)'; }
        ctx.fillStyle = sc; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const sx = Math.floor(camX), sy = Math.floor(camY), ex = Math.ceil(camX + canvas.width / TILE_SIZE) + 1, ey = Math.ceil(camY + canvas.height / TILE_SIZE) + 1;
        for (let y = sy; y < ey; y++) for (let x = sx; x < ex; x++) { if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue; const px = (x - camX) * TILE_SIZE, py = (y - camY) * TILE_SIZE, tile = map[y][x]; if (tile === TILE_TILLED) { ctx.fillStyle = '#8B6914'; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); } else if (tile === TILE_WELL) { drawWell(px, py); } else { ctx.fillStyle = tile === TILE_RIVER ? '#3b7dd8' : gc; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE); } if (tile === TILE_FENCE) { ctx.fillStyle = '#8B5A2B'; ctx.fillRect(px + 2, py + TILE_SIZE * 0.3, TILE_SIZE - 4, 4); ctx.fillRect(px + 2, py + TILE_SIZE * 0.6, TILE_SIZE - 4, 4); } if (tile === TILE_LAMPPOST) { drawLamppost(px, py, weather); } if (tile === TILE_TREE && tile !== TILE_TILLED) { drawTree(px, py); } if (tile === TILE_BUSH && tile !== TILE_TILLED) drawBush(px, py); if (tile === TILE_FRUIT_TREE) { drawFruitTree(px, py, `${x},${y}`); } if (tile === TILE_RIVER) drawRiver(px, py); }
        for (let k in crops) { const [x, y] = k.split(',').map(Number), px = (x - camX) * TILE_SIZE, py = (y - camY) * TILE_SIZE, c = crops[k], prog = Math.min(c.timer / c.growTime, 1), stage = Math.floor(prog * 3); ctx.fillStyle = ['#90EE90','#ADFF2F','#FFD700','#FF8C00'][stage]; ctx.fillRect(px + TILE_SIZE * 0.3, py + TILE_SIZE * 0.4, TILE_SIZE * 0.4, TILE_SIZE * 0.5); if (c.ready) { ctx.fillStyle = '#fff'; ctx.font = `${TILE_SIZE*0.3}px "Press Start 2P"`; ctx.fillText('★', px + TILE_SIZE * 0.35, py + TILE_SIZE * 0.25); } }
        buildings.forEach(b => { const px = (b.x - camX) * TILE_SIZE, py = (b.y - camY) * TILE_SIZE; if (!b.isReady) { ctx.fillStyle = 'gray'; ctx.fillRect(px, py - 10, TILE_SIZE, 5); ctx.fillStyle = 'lime'; ctx.fillRect(px, py - 10, TILE_SIZE * b.progress, 5); } else { if (b.type === 'well') drawWell(px, py); else drawBarnOrSilo(px, py, b.type); } });
        wildAnimals.forEach(a => { const px = (a.x - camX) * TILE_SIZE, py = (a.y - camY) * TILE_SIZE, sizeScale = [0.5,0.75,1.0][a.stage]; ctx.font = `${TILE_SIZE*0.5*sizeScale}px "Press Start 2P"`; ctx.fillText(a.type, px + TILE_SIZE * 0.15, py + TILE_SIZE * 0.7); if (a.isLeashed) { ctx.strokeStyle = '#ff69b4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo((player.x - camX) * TILE_SIZE + TILE_SIZE / 2, (player.y - camY) * TILE_SIZE + TILE_SIZE / 2); ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE / 2); ctx.stroke(); ctx.lineWidth = 1; } });
        for (let id in remotePlayers) { const rp = remotePlayers[id]; const rpx = (rp.x - camX) * TILE_SIZE, rpy = (rp.y - camY) * TILE_SIZE; ctx.fillStyle = '#ff6347'; ctx.font = `${TILE_SIZE*0.6}px "Press Start 2P"`; ctx.fillText('👤', rpx + TILE_SIZE * 0.15, rpy + TILE_SIZE * 0.8); ctx.fillStyle = '#fff'; ctx.font = `${TILE_SIZE*0.2}px "Press Start 2P"`; ctx.fillText(rp.name || '?', rpx + TILE_SIZE * 0.1, rpy - 5); }
        const ppx = (player.x - camX) * TILE_SIZE, ppy = (player.y - camY) * TILE_SIZE; ctx.fillStyle = '#3b5998'; ctx.font = `${TILE_SIZE*0.7}px "Press Start 2P"`; ctx.fillText('🧑‍🌾', ppx + TILE_SIZE * 0.1, ppy + TILE_SIZE * 0.8);
        if (ov) { ctx.fillStyle = ov; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        }

        function drawWell(px, py) { const s = TILE_SIZE; ctx.fillStyle = '#7a7a7a'; ctx.fillRect(px + s * 0.2, py + s * 0.35, s * 0.6, s * 0.55); ctx.fillStyle = '#4488cc'; ctx.fillRect(px + s * 0.28, py + s * 0.45, s * 0.44, s * 0.35); ctx.fillStyle = '#5C3D1F'; ctx.fillRect(px + s * 0.18, py + s * 0.1, s * 0.08, s * 0.3); ctx.fillRect(px + s * 0.74, py + s * 0.1, s * 0.08, s * 0.3); ctx.fillStyle = '#A0522D'; ctx.beginPath(); ctx.moveTo(px + s * 0.1, py + s * 0.1); ctx.lineTo(px + s * 0.5, py - s * 0.1); ctx.lineTo(px + s * 0.9, py + s * 0.1); ctx.fill(); }
        function drawLamppost(px, py, weather) { const s = TILE_SIZE; ctx.fillStyle = '#666'; ctx.fillRect(px + s * 0.44, py + s * 0.2, s * 0.12, s * 0.4); ctx.fillStyle = '#FFD700'; ctx.fillRect(px + s * 0.57, py + s * 0.04, s * 0.16, s * 0.14); if (weather === 'NOITE') { const glow = ctx.createRadialGradient(px + s * 0.65, py + s * 0.1, s * 0.05, px + s * 0.65, py + s * 0.1, s * 3.5); glow.addColorStop(0, 'rgba(255,255,160,0.8)'); glow.addColorStop(0.2, 'rgba(255,255,120,0.5)'); glow.addColorStop(0.5, 'rgba(255,220,60,0.15)'); glow.addColorStop(1, 'rgba(255,200,50,0)'); ctx.fillStyle = glow; ctx.fillRect(px - s * 3, py - s * 3, s * 7, s * 7); } }
        function drawBarnOrSilo(px, py, type) { if (type === 'barn') { ctx.fillStyle = '#8B4513'; ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 4); ctx.fillStyle = '#A0522D'; ctx.fillRect(px + 6, py + 6, TILE_SIZE - 12, TILE_SIZE - 10); ctx.fillStyle = '#CD853F'; ctx.beginPath(); ctx.moveTo(px, py + 6); ctx.lineTo(px + TILE_SIZE / 2, py - TILE_SIZE * 0.35); ctx.lineTo(px + TILE_SIZE, py + 6); ctx.fill(); } else { ctx.fillStyle = '#A9A9A9'; ctx.fillRect(px + TILE_SIZE * 0.2, py + TILE_SIZE * 0.1, TILE_SIZE * 0.6, TILE_SIZE * 0.8); ctx.fillStyle = '#C0C0C0'; ctx.beginPath(); ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE * 0.1, TILE_SIZE * 0.3, Math.PI, 0); ctx.fill(); } }
        function drawTree(sx, sy) { const s = TILE_SIZE; ctx.fillStyle = '#5C3D1F'; ctx.fillRect(sx + s * 0.35, sy + s * 0.45, s * 0.3, s * 0.5); ctx.fillStyle = '#1B5E1B'; ctx.beginPath(); ctx.arc(sx + s * 0.5, sy + s * 0.2, s * 0.35, 0, Math.PI * 2); ctx.fill(); }
        function drawBush(sx, sy) { const s = TILE_SIZE; ctx.fillStyle = '#3a7d3a'; ctx.beginPath(); ctx.arc(sx + s * 0.5, sy + s * 0.55, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
        function drawFruitTree(sx, sy, key) { drawTree(sx, sy); const r = fruitTreeTimers[key] >= 300; ctx.fillStyle = r ? '#ff3333' : '#888'; ctx.beginPath(); ctx.arc(sx + TILE_SIZE * 0.6, sy + TILE_SIZE * 0.15, TILE_SIZE * 0.12, 0, Math.PI * 2); ctx.fill(); }
        function drawRiver(sx, sy) { ctx.fillStyle = '#5aa9e6'; ctx.fillRect(sx + TILE_SIZE * 0.1, sy + TILE_SIZE * 0.1, TILE_SIZE * 0.8, TILE_SIZE * 0.8); }

        const editorModal = document.getElementById('editor-modal'), codeEditor = document.getElementById('codeEditor');
        document.getElementById('open-editor-btn').addEventListener('click', () => editorModal.style.display = 'block');
        document.getElementById('close-editor').addEventListener('click', () => editorModal.style.display = 'none');
        document.getElementById('runBtn').addEventListener('click', async () => { const code = codeEditor.value.trim(); if (!code) return; try { await eval(`(async()=>{try{${code}}catch(e){throw e;}})();`); logToConsole('✅ Código executado.'); } catch (e) { logToConsole('❌ Erro: ' + e.message); } });
        document.getElementById('exampleBtn').addEventListener('click', () => { codeEditor.value = `farm.tools.equip(TOOLS.HOE);\nfor (let i = 0; i < 3; i++) {\n    farm.soil.till();\n    farm.player.moveRight();\n    await farm.wait(200);\n}\nfarm.player.moveLeft(); farm.player.moveLeft(); farm.player.moveLeft();\nfor (let i = 0; i < 3; i++) {\n    farm.crops.plant(CROPS.WHEAT);\n    farm.crops.water();\n    farm.player.moveRight();\n    await farm.wait(200);\n}`; });
        function logToConsole(msg) { document.getElementById('consoleOutput').textContent = msg; }

        function gameLoop() { update(); draw(); gameLoopId = requestAnimationFrame(gameLoop); }
        gameLoop();
        updateHotbar();
        updateWaterBar();
        updateShopUI();
        commandInput.focus();
        showRoomCodeInGame();
    }
})();