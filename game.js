(function () {
  // ========== CONFIGURAÇÃO DE SPRITES ==========
  const SPRITE_CONFIG = {
    TREE: "assets/tree.png",
    FRUIT_TREE: "assets/fruit_tree.png",
    APPLE: "assets/apple.png",
    BUSH: "assets/bush.png",
    BUSH2: "assets/bush2.png",
    FENCE: "assets/fence.png",
    LAMPPOST: "assets/lamppost.png",
    WELL: "assets/well.png", // Poço
    TILLED: "assets/till.png",
    WATER: "assets/water.png",
    HOE: "assets/hoe.png",
    // ===== NOVOS SPRITES =====
    SILO: "assets/silo.png", // Silo
    BARN: "assets/barn.png", // Celeiro
    HOUSE: "assets/house.png", // Casa do fazendeiro
    LEASH: "assets/leash.png", // Corda (ícone)
    // Animais
    COW: "assets/cow.png",
    CHICKEN: "assets/chicken.png",
    CHICKEN_BABY: "assets/chick.png",
    PIG: "assets/pig.png",
    RABBIT: "assets/rabbit.png",
    DUCK: "assets/duck.png",
    USE_SPRITES: true,
  };

  const TREE_SCALE = 1.6;
  const FRUIT_SCALE = 1.6;
  const BUSH_SCALE = 1.5;

  const spriteImages = {};
  let spritesLoaded = false;

  function loadSprites() {
    const promises = [];
    for (const [key, url] of Object.entries(SPRITE_CONFIG)) {
      if (key === "USE_SPRITES") continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      const p = new Promise((resolve) => {
        img.onload = () => {
          spriteImages[key] = img;
          resolve();
        };
        img.onerror = () => {
          console.warn(`❌ Falha ao carregar sprite: ${key} (${url})`);
          spriteImages[key] = null;
          resolve();
        };
      });
      img.src = url;
      promises.push(p);
    }
    return Promise.all(promises).then(() => {
      spritesLoaded = true;
      console.log("✅ Sprites carregados!");
    });
  }

  function drawSprite(ctx, key, x, y, size) {
    const img = spriteImages[key];
    if (
      SPRITE_CONFIG.USE_SPRITES &&
      img &&
      img.complete &&
      img.naturalWidth > 0
    ) {
      ctx.drawImage(img, x, y, size, size);
      return true;
    }
    return false;
  }

  // ========== VARIÁVEIS GLOBAIS ==========
  let playerName = "";
  let gameLoopId = null;
  let peer = null;
  let conn = null;
  let isHost = false;
  let remotePlayers = {};
  let myPeerId = null;
  let roomId = "";
  let connectionRetries = 0;
  const MAX_RETRIES = 15;
  let worldReceived = false;
  let gameRunning = false;
  let hostReady = false;
  let guestReady = false;
  let reconnectTimeout = null;

  const loginScreen = document.getElementById("login-screen");
  const lobbyScreen = document.getElementById("lobby-screen");
  const roomDisplay = document.getElementById("room-display");
  const roomCodeText = document.getElementById("room-code-text");
  const roomCodeDisplay = document.getElementById("room-code-display");
  const roomCodeInline = document.getElementById("room-code-inline");
  const loginEmail = document.getElementById("login-email");
  const loginPassword = document.getElementById("login-password");
  const loginBtn = document.getElementById("login-btn");
  const googleBtn = document.getElementById("google-btn");
  const loginError = document.getElementById("login-error");
  const commandInput = document.getElementById("command-input");
  const hintBubble = document.getElementById("hint-bubble");
  const multiplayerStatus = document.getElementById("multiplayer-status");
  const notification = document.getElementById("notification");
  const savedName = localStorage.getItem("codegarden_username");

  // ========== LOBBY DE PRONTIDÃO ==========
  let readyLobby = null;

  function createReadyLobby() {
    if (readyLobby) return;
    readyLobby = document.createElement("div");
    readyLobby.id = "ready-lobby";
    readyLobby.innerHTML = `
      <h3>🎮 LOBBY</h3>
      <div id="ready-players" style="color:#fff;font-family:'Press Start 2P',cursive;font-size:9px;margin-bottom:15px;line-height:2;"></div>
      <div id="ready-status" style="color:#ffa500;font-family:'Press Start 2P',cursive;font-size:8px;margin-bottom:20px;"></div>
      <button id="ready-btn" class="btn" style="font-size:12px;padding:14px 30px;background:#7cfc00;border-bottom-color:#3a7a00;margin:0 auto;">✅ PRONTO</button>
    `;
    document.body.appendChild(readyLobby);
    document.getElementById("ready-btn").addEventListener("click", () => {
      if (isHost) {
        hostReady = true;
        updateReadyButton();
        if (conn && conn.open) {
          conn.send({ type: "ready", from: playerName });
          setTimeout(() => {
            if (conn && conn.open)
              conn.send({ type: "ready_ack", from: "host" });
          }, 100);
        }
        if (guestReady) checkBothReady();
      } else {
        guestReady = true;
        updateReadyButton();
        if (conn && conn.open) conn.send({ type: "ready", from: playerName });
        if (hostReady) checkBothReady();
      }
    });
  }

  function updateReadyButton() {
    const btn = document.getElementById("ready-btn");
    const status = document.getElementById("ready-status");
    const players = document.getElementById("ready-players");
    if (!btn || !status || !players) return;
    const iAmReady = isHost ? hostReady : guestReady;
    const otherReady = isHost ? guestReady : hostReady;
    btn.textContent = iAmReady ? "✅ AGUARDANDO..." : "✅ PRONTO";
    btn.style.background = iAmReady ? "#888" : "#7cfc00";
    btn.style.borderBottomColor = iAmReady ? "#555" : "#3a7a00";
    btn.disabled = iAmReady;
    const hostStatus = isHost ? "Você (Host)" : "Host";
    const guestStatus = isHost ? "Convidado" : "Você";
    players.innerHTML = `
      🧑‍🌾 <span style="color:#7cfc00;">${hostStatus}</span> 
      <span class="${hostReady ? "ready-yes" : "ready-no"}">${hostReady ? "✅" : "⏳"}</span>
      <br>
      👤 <span style="color:#ffa500;">${guestStatus}</span> 
      <span class="${guestReady ? "ready-yes" : "ready-no"}">${guestReady ? "✅" : "⏳"}</span>
    `;
    if (iAmReady && !otherReady) {
      status.textContent = isHost
        ? "Aguardando convidado..."
        : "Aguardando host...";
      status.style.color = "#ffa500";
    } else if (iAmReady && otherReady) {
      status.textContent = "🚀 Iniciando...";
      status.style.color = "#7cfc00";
    } else {
      status.textContent = "Clique PRONTO para começar";
      status.style.color = "#ffd700";
    }
  }

  function showReadyLobby() {
    createReadyLobby();
    readyLobby.style.display = "block";
    hostReady = false;
    guestReady = false;
    updateReadyButton();
  }

  function hideReadyLobby() {
    if (readyLobby) readyLobby.style.display = "none";
  }

  function checkBothReady() {
    if (hostReady && guestReady) {
      setTimeout(() => {
        hideReadyLobby();
        if (isHost) {
          sendWorldState();
          setTimeout(sendWorldState, 300);
          setTimeout(sendWorldState, 600);
        }
        showNotification("🚀 Jogo iniciado!");
      }, 600);
    }
  }

  function copyRoomCode() {
    if (!roomId) return;
    navigator.clipboard
      .writeText(roomId)
      .then(() => showNotification("📋 Copiado: " + roomId))
      .catch(() => showNotification("📋 Sala: " + roomId));
  }
  if (roomCodeDisplay) roomCodeDisplay.addEventListener("click", copyRoomCode);

  function showRoomCodeInGame() {
    if (roomCodeDisplay && roomCodeInline && roomId && isHost) {
      roomCodeInline.textContent = roomId;
      roomCodeDisplay.style.display = "inline-block";
    }
  }
  function hideRoomCodeInGame() {
    if (roomCodeDisplay) roomCodeDisplay.style.display = "none";
  }

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = "block";
    setTimeout(() => (loginError.style.display = "none"), 3000);
  }
  function hideLogin() {
    loginScreen.style.display = "none";
  }
  function showLobby() {
    lobbyScreen.style.display = "flex";
    if (roomDisplay) roomDisplay.style.display = "none";
    document.getElementById("room-id-input").value = "";
  }
  function hideLobby() {
    lobbyScreen.style.display = "none";
  }
  function showGameUI() {
    document
      .querySelectorAll("#gameCanvas, #hud, #top-bar, #hotbar, #command-box")
      .forEach((el) => {
        el.style.display =
          el.tagName === "CANVAS"
            ? "block"
            : el.id === "top-bar"
              ? "flex"
              : "flex";
      });
    showRoomCodeInGame();
  }
  function hideGameUI() {
    document
      .querySelectorAll(
        "#gameCanvas, #hud, #top-bar, #hotbar, #command-box, #hint-bubble, #notification, #levelup-modal, #shop-modal, #editor-modal, #friends-modal, #water-bar-container",
      )
      .forEach((el) => {
        if (el) el.style.display = "none";
      });
    hideRoomCodeInGame();
  }

  function logout() {
    if (gameLoopId) {
      cancelAnimationFrame(gameLoopId);
      gameLoopId = null;
      gameRunning = false;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (conn)
      try {
        conn.close();
      } catch (e) {}
    if (peer)
      try {
        peer.destroy();
      } catch (e) {}
    localStorage.removeItem("codegarden_username");
    hideGameUI();
    hideReadyLobby();
    loginScreen.style.display = "flex";
    lobbyScreen.style.display = "none";
    if (roomDisplay) roomDisplay.style.display = "none";
    loginEmail.value = "";
    loginPassword.value = "";
    playerName = "";
    roomId = "";
    isHost = false;
    document.getElementById("playerNameDisplay").textContent = "";
    multiplayerStatus.style.display = "none";
    remotePlayers = {};
    connectionRetries = 0;
    worldReceived = false;
    hostReady = false;
    guestReady = false;
    hideRoomCodeInGame();
  }
  document.getElementById("logout-btn").addEventListener("click", () => {
    if (confirm("Sair?")) logout();
  });

  function showNotification(msg) {
    notification.textContent = msg;
    notification.style.opacity = "1";
    clearTimeout(notification._timeout);
    notification._timeout = setTimeout(
      () => (notification.style.opacity = "0"),
      3000,
    );
  }

  function initMultiplayer() {
    const roomInput = document.getElementById("room-id-input");
    const lobbyInfo = document.getElementById("lobby-info");
    document.getElementById("host-btn").addEventListener("click", () => {
      roomId =
        roomInput.value.trim() ||
        "garden_" + Math.random().toString(36).slice(2, 8);
      roomInput.value = roomId;
      isHost = true;
      if (roomCodeText) roomCodeText.textContent = roomId;
      if (roomDisplay) roomDisplay.style.display = "block";
      lobbyInfo.textContent = "Código acima!";
      showNotification("🏠 Sala: " + roomId);
      startConnection(roomId);
    });
    document.getElementById("join-btn").addEventListener("click", () => {
      roomId = roomInput.value.trim();
      if (!roomId) {
        lobbyInfo.textContent = "Digite o ID!";
        return;
      }
      isHost = false;
      if (roomDisplay) roomDisplay.style.display = "none";
      lobbyInfo.textContent = "Conectando...";
      startConnection(roomId);
    });
    document.getElementById("solo-btn").addEventListener("click", () => {
      roomId = "";
      isHost = false;
      worldReceived = true;
      hideLobby();
      showGameUI();
      initGameWorld(true);
    });
  }

  function startConnection(room) {
    hideLobby();
    showGameUI();
    multiplayerStatus.style.display = "block";
    multiplayerStatus.textContent = "🟡 Conectando...";
    multiplayerStatus.style.color = "#ffa500";
    if (peer)
      try {
        peer.destroy();
      } catch (e) {}
    conn = null;
    connectionRetries = 0;
    hostReady = false;
    guestReady = false;
    const hostId = "codegarden_" + room + "_host";
    const guestId = "codegarden_" + room + "_guest";
    const myId = isHost ? hostId : guestId;
    console.log("🆔 Meu ID:", myId, isHost ? "(HOST)" : "(GUEST)");
    initGameWorld(isHost);
    peer = new Peer(myId, {
      debug: 1,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });
    peer.on("open", (id) => {
      myPeerId = id;
      console.log("✅ Peer aberto:", id);
      multiplayerStatus.textContent = isHost ? "🏠 Host" : "🔗 Convidado";
      multiplayerStatus.style.color = "#7cfc00";
      if (isHost) {
        showNotification("🏠 Aguardando convidado...");
        showRoomCodeInGame();
        showReadyLobby();
      } else {
        hideRoomCodeInGame();
        setTimeout(() => tryConnect(hostId), 500);
      }
    });
    peer.on("connection", (incoming) => {
      console.log("📞 Conexão recebida:", incoming.peer);
      if (isHost && !conn) {
        conn = incoming;
        setupDataChannel(conn);
        multiplayerStatus.textContent = "🏠 Host - 🟢 Convidado conectado!";
        showNotification("👤 Convidado entrou!");
        updateReadyButton();
      }
    });
    peer.on("error", (err) => {
      console.error("❌ Peer error:", err);
      if (err.type === "unavailable-id") {
        const alt = myId + "_" + Math.random().toString(36).slice(2, 6);
        try {
          peer.destroy();
        } catch (e) {}
        peer = new Peer(alt, { debug: 1 });
        peer.on("open", (id2) => {
          myPeerId = id2;
          if (isHost) {
            showRoomCodeInGame();
            showReadyLobby();
          } else {
            setTimeout(() => tryConnect(hostId), 500);
          }
        });
        peer.on("connection", (inc) => {
          if (isHost && !conn) {
            conn = inc;
            setupDataChannel(conn);
            updateReadyButton();
          }
        });
        peer.on("error", () => {});
      }
    });
  }

  function tryConnect(hostId) {
    if (conn) return;
    connectionRetries++;
    console.log(`🔍 Tentativa ${connectionRetries}/${MAX_RETRIES}: ${hostId}`);
    multiplayerStatus.textContent = `🔗 Buscando... (${connectionRetries}/${MAX_RETRIES})`;
    if (connectionRetries > MAX_RETRIES) {
      multiplayerStatus.textContent = "❌ Host não encontrado";
      showNotification("❌ Sala não encontrada.");
      return;
    }
    const c = peer.connect(hostId, {
      reliable: true,
      metadata: { name: playerName },
    });
    let done = false;
    const timeout = 6000;
    c.on("open", () => {
      if (!done) {
        done = true;
        conn = c;
        setupDataChannel(conn);
        multiplayerStatus.textContent = "🔗 Convidado - 🟢 Conectado!";
        showNotification("🔗 Conectado!");
        showReadyLobby();
      }
    });
    c.on("error", (err) => {
      console.log("❌ Erro conexão:", err);
      if (!done) {
        done = true;
        try {
          c.close();
        } catch (e) {}
        setTimeout(() => tryConnect(hostId), 2000 + connectionRetries * 500);
      }
    });
    setTimeout(() => {
      if (!done) {
        done = true;
        try {
          c.close();
        } catch (e) {}
        setTimeout(() => tryConnect(hostId), 1500);
      }
    }, timeout);
  }

  function sendWorldState() {
    if (!conn || !conn.open) {
      setTimeout(() => sendWorldState(), 500);
      return;
    }
    if (typeof gameMap === "undefined" || typeof gamePlayer === "undefined") {
      setTimeout(() => sendWorldState(), 300);
      return;
    }
    try {
      conn.send({
        type: "worldState",
        map: gameMap,
        crops: gameCrops,
        buildings: gameBuildings,
        fruitTrees: gameFruitTreeTimers,
        wildAnimals: gameWildAnimals.map((a) => ({
          x: a.x,
          y: a.y,
          species: a.species,
          stage: a.stage,
          name: a.name,
          feedCount: a.feedCount || 0,
          isLeashed: a.isLeashed || false,
          growthStart: a.growthStart,
        })),
        hostName: playerName,
        roomCode: roomId,
        hostTileX: gamePlayer.tileX,
        hostTileY: gamePlayer.tileY,
        hostX: gamePlayer.x,
        hostY: gamePlayer.y,
        timeOffset: gameTimeOffset,
        playerCoins: gamePlayerCoins,
        playerWater: gamePlayerWater,
        hasWateringCan: gameHasWateringCan,
        hasBoots: gameHasBoots,
        playerXP: gamePlayerXP,
        playerLevel: gamePlayerLevel,
        unlockedItems: gameUnlockedItems,
      });
      console.log("📤 Mundo enviado.");
    } catch (e) {
      console.error("Erro ao enviar mundo:", e);
    }
  }

  function setupDataChannel(c) {
    conn = c;
    c.on("data", (data) => {
      try {
        if (data.type === "position") {
          if (!remotePlayers[data.id]) {
            remotePlayers[data.id] = {
              x: data.x,
              y: data.y,
              tileX: data.tileX,
              tileY: data.tileY,
              name: data.name || "?",
              dir: "front",
            };
          } else {
            Object.assign(remotePlayers[data.id], {
              x: data.x,
              y: data.y,
              tileX: data.tileX,
              tileY: data.tileY,
            });
          }
        } else if (data.type === "ready") {
          if (data.from) {
            if (isHost) {
              guestReady = true;
              updateReadyButton();
              if (hostReady) checkBothReady();
            } else {
              hostReady = true;
              updateReadyButton();
              if (guestReady) checkBothReady();
            }
          }
        } else if (data.type === "ready_ack") {
          if (!isHost) {
            hostReady = true;
            updateReadyButton();
            if (guestReady) checkBothReady();
          }
        } else if (data.type === "worldState" && !isHost) {
          console.log("📥 RECEBENDO MUNDO...");
          if (data.map && Array.isArray(data.map) && data.map.length > 0)
            gameMap = data.map.map((row) => [...row]);
          if (data.crops) gameCrops = JSON.parse(JSON.stringify(data.crops));
          if (data.buildings)
            gameBuildings = JSON.parse(JSON.stringify(data.buildings));
          if (data.fruitTrees)
            gameFruitTreeTimers = JSON.parse(JSON.stringify(data.fruitTrees));
          if (data.wildAnimals) {
            gameWildAnimals = data.wildAnimals.map((a) => {
              const animal = createGameAnimal(a.species, a.x, a.y);
              animal.stage = a.stage || 0;
              animal.name = a.name || animal.name;
              animal.feedCount = a.feedCount || 0;
              animal.isLeashed = a.isLeashed || false;
              animal.growthStart = a.growthStart || Date.now();
              return animal;
            });
          }
          if (data.timeOffset !== undefined) gameTimeOffset = data.timeOffset;
          if (data.playerXP !== undefined) gamePlayerXP = data.playerXP;
          if (data.playerLevel !== undefined)
            gamePlayerLevel = data.playerLevel;
          if (data.playerCoins !== undefined)
            gamePlayerCoins = data.playerCoins;
          if (data.hasWateringCan !== undefined)
            gameHasWateringCan = data.hasWateringCan;
          if (data.hasBoots !== undefined) gameHasBoots = data.hasBoots;
          if (data.unlockedItems) gameUnlockedItems = [...data.unlockedItems];
          if (data.playerWater !== undefined)
            gamePlayerWater = data.playerWater;
          const hx = data.hostTileX || 25,
            hy = data.hostTileY || 20;
          let placed = false;
          for (let dy = 0; dy < 10 && !placed; dy++)
            for (let dx = -5; dx <= 5 && !placed; dx++) {
              const cx = hx + dx,
                cy = hy + dy;
              if (
                cx >= 0 &&
                cx < MAP_W &&
                cy >= 0 &&
                cy < MAP_H &&
                gameMap[cy] &&
                gameMap[cy][cx] !== TILE_RIVER &&
                gameMap[cy][cx] !== TILE_FENCE
              ) {
                gamePlayer.tileX = cx;
                gamePlayer.tileY = cy;
                gamePlayer.x = cx + 0.5;
                gamePlayer.y = cy + 0.5;
                gamePlayer.destX = gamePlayer.x;
                gamePlayer.destY = gamePlayer.y;
                placed = true;
              }
            }
          if (!placed) {
            gamePlayer.tileX = Math.min(hx + 2, MAP_W - 2);
            gamePlayer.tileY = Math.min(hy, MAP_H - 2);
            gamePlayer.x = gamePlayer.tileX + 0.5;
            gamePlayer.y = gamePlayer.tileY + 0.5;
          }
          worldReceived = true;
          updateGameWaterBar();
          updateGameHotbar();
          updateGameShopUI();
          document.getElementById("xpDisplay").textContent =
            `⭐ Nv.${gamePlayerLevel} | XP: ${gamePlayerXP}/${gamePlayerLevel * XP_PER_LEVEL} 💰${gamePlayerCoins}`;
          multiplayerStatus.textContent =
            "🔗 Convidado - 🟢 Mundo sincronizado!";
          showNotification("🌍 Mundo carregado!");
          hideReadyLobby();
        } else if (data.type === "action") {
          handleRemoteAction(data);
        }
      } catch (e) {
        console.error("Erro processando dados:", e);
      }
    });
    c.on("close", () => {
      multiplayerStatus.textContent = "⚫ Desconectado";
      multiplayerStatus.style.color = "#ff6b6b";
      conn = null;
      if (!isHost && roomId) {
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          if (!conn) {
            multiplayerStatus.textContent = "🔄 Reconectando...";
            multiplayerStatus.style.color = "#ffa500";
            tryConnect("codegarden_" + roomId + "_host");
          }
        }, 3000);
      }
    });
  }

  function broadcastPosition() {
    if (conn && conn.open && typeof gamePlayer !== "undefined") {
      try {
        conn.send({
          type: "position",
          id: myPeerId,
          x: gamePlayer.x,
          y: gamePlayer.y,
          tileX: gamePlayer.tileX,
          tileY: gamePlayer.tileY,
          name: playerName,
        });
      } catch (e) {}
    }
  }
  function broadcastAction(d) {
    if (conn && conn.open)
      try {
        conn.send({ type: "action", ...d });
      } catch (e) {}
  }
  function handleRemoteAction(data) {
    if (typeof gameMap === "undefined" || !worldReceived) return;
    try {
      if (data.action === "till") gameMap[data.tileY][data.tileX] = TILE_TILLED;
      else if (data.action === "plant")
        gameCrops[`${data.tileX},${data.tileY}`] = {
          type: data.cropType,
          timer: 0,
          ready: false,
          growTime: Object.values(CROP_GROW_TIMES)[data.cropType],
        };
      else if (data.action === "harvest")
        delete gameCrops[`${data.tileX},${data.tileY}`];
      else if (data.action === "water") {
        if (gameCrops[`${data.tileX},${data.tileY}`])
          gameCrops[`${data.tileX},${data.tileY}`].timer += 30;
      } else if (data.action === "placeBuilding") {
        if (data.buildingType === "fence")
          gameMap[data.tileY][data.tileX] = TILE_FENCE;
        else if (data.buildingType === "lamppost")
          gameMap[data.tileY][data.tileX] = TILE_LAMPPOST;
        else if (data.buildingType === "well")
          gameMap[data.tileY][data.tileX] = TILE_WELL;
        else
          gameBuildings.push({
            x: data.tileX,
            y: data.tileY,
            type: data.buildingType,
            startTime: Date.now(),
            progress: 0,
            isReady: false,
          });
      }
    } catch (e) {}
  }

  // ========== LOGIN ==========
  loginBtn.addEventListener("click", () => {
    const email = loginEmail.value.trim(),
      password = loginPassword.value.trim();
    if (email.length < 5 || !email.includes("@")) {
      showLoginError("Email inválido.");
      return;
    }
    if (password.length < 3) {
      showLoginError("Senha: 3+ caracteres.");
      return;
    }
    playerName =
      email
        .split("@")[0]
        .replace(/[^a-zA-Z0-9À-ÿ]/g, "")
        .slice(0, 14) || "Fazendeiro";
    localStorage.setItem("codegarden_username", playerName);
    hideLogin();
    showLobby();
  });
  googleBtn.addEventListener("click", () => {
    playerName = ["fazendeiro.dev", "code.garden"][
      Math.floor(Math.random() * 2)
    ];
    localStorage.setItem("codegarden_username", playerName);
    hideLogin();
    showLobby();
  });
  document.getElementById("register-link").addEventListener("click", () => {
    loginEmail.value = "";
    loginPassword.value = "";
    loginEmail.focus();
    showLoginError("Use qualquer email/senha!");
  });
  loginEmail.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginPassword.focus();
  });
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
  if (savedName) {
    playerName = savedName;
    hideLogin();
    showLobby();
  }
  initMultiplayer();

  // ========== AMIGOS ==========
  function getFriends() {
    const d = localStorage.getItem("codegarden_friends_" + playerName);
    return d ? JSON.parse(d) : [];
  }
  function saveFriends(f) {
    localStorage.setItem("codegarden_friends_" + playerName, JSON.stringify(f));
  }
  function renderFriends() {
    const list = document.getElementById("friends-list"),
      friends = getFriends();
    list.innerHTML =
      friends.length === 0
        ? '<div style="color:#888;font-size:7px;padding:10px;">Nenhum amigo.</div>'
        : friends
            .map((f) => {
              const has = isHost && roomId;
              return `<div class="friend-row"><span>🧑‍🌾 ${f.name}</span><span class="${Math.random() > 0.5 ? "online" : "offline"}">${Math.random() > 0.5 ? "🟢" : "⚫"}</span>${has ? `<button class="invite-btn" data-invite="${f.name}">📨</button>` : ""}<button class="btn" style="font-size:6px;padding:4px 6px;" data-remove="${f.name}">✖</button></div>`;
            })
            .join("");
    list.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", (e) => {
        saveFriends(
          getFriends().filter(
            (f) => f.name !== e.target.getAttribute("data-remove"),
          ),
        );
        renderFriends();
      }),
    );
    list.querySelectorAll("[data-invite]").forEach((b) =>
      b.addEventListener("click", (e) => {
        if (!roomId || !isHost) {
          showNotification("❌ Seja host!");
          return;
        }
        copyRoomCode();
        showNotification(
          "📨 Convite para " +
            e.target.getAttribute("data-invite") +
            "! " +
            roomId,
        );
        document.getElementById("friends-modal").style.display = "none";
      }),
    );
  }
  document.getElementById("friends-btn").addEventListener("click", () => {
    document.getElementById("friends-modal").style.display = "block";
    renderFriends();
  });
  document.getElementById("close-friends").addEventListener("click", () => {
    document.getElementById("friends-modal").style.display = "none";
  });
  document.getElementById("add-friend-btn").addEventListener("click", () => {
    const n = document.getElementById("friend-input").value.trim();
    if (n.length < 2) return;
    const f = getFriends();
    if (f.find((x) => x.name === n)) {
      showNotification("❌ Já na lista!");
      return;
    }
    f.push({ name: n, online: true });
    saveFriends(f);
    renderFriends();
    document.getElementById("friend-input").value = "";
    showNotification("👥 " + n + " adicionado!");
  });

  // ========== INICIALIZAÇÃO DO MUNDO DO JOGO ==========
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  loadSprites().then(() => {
    console.log("Sprites prontos para uso.");
  });

  const MAP_W = 50,
    MAP_H = 40;
  const TILE_GRASS = 0,
    TILE_TILLED = 11,
    TILE_TREE = 5,
    TILE_RIVER = 6,
    TILE_FRUIT_TREE = 7,
    TILE_BUSH = 8,
    TILE_FENCE = 9,
    TILE_LAMPPOST = 10,
    TILE_WELL = 12;
  const BUILD_TIME = 10000;
  const MINUTE_MS = 60 * 1000,
    CYCLE_TOTAL = 60 * MINUTE_MS;
  const MOVE_DURATION = 120,
    PLAYER_SPEED = 0.12,
    XP_PER_LEVEL = 100;
  const GROWTH_STAGE1 = 15 * MINUTE_MS,
    GROWTH_STAGE2 = 45 * MINUTE_MS;
  const MAX_WATER = 10;
  let TILE_SIZE = 48;
  const SPECIES_SPEEDS = {
    cow: 0.008,
    pig: 0.015,
    duck: 0.015,
    rabbit: 0.03,
    chicken: 0.012,
    sheep: 0.01,
  };
  const SPECIES_EMOJIS = {
    cow: "🐄",
    pig: "🐖",
    duck: "🦆",
    rabbit: "🐇",
    chicken: "🐔",
    sheep: "🐑",
  };
  const SPECIES_NAMES = {
    cow: "vaca",
    pig: "porco",
    duck: "pato",
    rabbit: "coelho",
    chicken: "galinha",
    sheep: "ovelha",
  };
  const farmHouse = { x: 22, y: 16, w: 3, h: 2 };
  const CROP_NAMES = {
    wheat: "Trigo",
    corn: "Milho",
    carrot: "Cenoura",
    tomato: "Tomate",
  };
  const CROP_EMOJIS = { wheat: "🌾", corn: "🌽", carrot: "🥕", tomato: "🍅" };
  const CROP_GROW_TIMES = { wheat: 160, corn: 240, carrot: 200, tomato: 280 };

  let gameMap = Array(MAP_H)
    .fill()
    .map(() => Array(MAP_W).fill(TILE_GRASS));
  let gameCrops = {},
    gameFruitTreeTimers = {};
  let gamePlayer = {
    tileX: 25,
    tileY: 20,
    x: 25.5,
    y: 20.5,
    moving: false,
    movePath: [],
    moveStartTime: 0,
    moveStartX: 25.5,
    moveStartY: 20.5,
    moveTargetX: 25.5,
    moveTargetY: 20.5,
    actionOnArrival: false,
    dir: "front",
  };
  let gameCamX = gamePlayer.x - canvas.width / TILE_SIZE / 2,
    gameCamY = gamePlayer.y - canvas.height / TILE_SIZE / 2;
  let gameSelectedCrop = -1,
    gameSelectedTool = null,
    gamePlayerXP = 0,
    gamePlayerLevel = 1;
  let gameWildAnimals = [],
    gameBuildings = [],
    gamePendingBuilding = null,
    gamePendingAnimal = null;
  let gameFloatingHearts = [],
    gameTime = 0,
    gameUnlockedItems = ["barn", "silo", "fence"];
  let gameTimeOffset = 0,
    gamePlayerCoins = 0,
    gamePlayerWater = MAX_WATER,
    gameHasWateringCan = false,
    gameHasBoots = false;

  window.CROPS = {
    WHEAT: "wheat",
    CORN: "corn",
    CARROT: "carrot",
    TOMATO: "tomato",
  };
  window.TOOLS = {
    HOE: "hoe",
    LEASH: "leash",
    WATERING_CAN: "wateringcan",
    BOOTS: "boots",
  };
  window.ANIMALS = {
    COW: "cow",
    CHICKEN: "chicken",
    PIG: "pig",
    DUCK: "duck",
    RABBIT: "rabbit",
    SHEEP: "sheep",
  };
  window.BUILDINGS = {
    BARN: "barn",
    SILO: "silo",
    FENCE: "fence",
    LAMPPOST: "lamppost",
    WELL: "well",
  };

  function createGameAnimal(species, x, y) {
    return {
      x,
      y,
      targetX: x,
      targetY: y,
      species,
      name: SPECIES_NAMES[species],
      type: SPECIES_EMOJIS[species],
      speed: SPECIES_SPEEDS[species] || 0.02,
      dir: "front",
      isInteracting: false,
      isLeashed: false,
      fed: false,
      timer: Math.random() * 100,
      stage: 0,
      growthStart: Date.now(),
      promptTimer: 0,
      feedCount: 0,
    };
  }

  function initGameWorld(generateMap) {
    if (gameRunning) return;
    gameRunning = true;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      TILE_SIZE = Math.floor(canvas.width / 15);
    }
    window.addEventListener("resize", resize);
    resize();

    if (generateMap) {
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++) gameMap[y][x] = TILE_GRASS;
      for (let r = 0; r < 2; r++) {
        let cx = 10 + Math.floor(Math.random() * (MAP_W - 20)),
          cy = 0;
        while (cy < MAP_H) {
          if (
            !(
              cx >= farmHouse.x &&
              cx < farmHouse.x + farmHouse.w &&
              cy >= farmHouse.y &&
              cy < farmHouse.y + farmHouse.h
            )
          ) {
            gameMap[cy][cx] = TILE_RIVER;
            if (Math.random() < 0.2 && cx + 1 < MAP_W)
              gameMap[cy][cx + 1] = TILE_RIVER;
          }
          cx += Math.floor(Math.random() * 3) - 1;
          cy += 1;
          cx = Math.max(1, Math.min(MAP_W - 2, cx));
        }
      }
      for (let i = 0; i < 18; i++) {
        let cx = Math.floor(Math.random() * MAP_W),
          cy = Math.floor(Math.random() * MAP_H);
        for (let j = 0; j < 10; j++) {
          let tx = cx + Math.floor(Math.random() * 6 - 3),
            ty = cy + Math.floor(Math.random() * 6 - 3);
          if (
            tx >= 0 &&
            tx < MAP_W &&
            ty >= 0 &&
            ty < MAP_H &&
            gameMap[ty][tx] === TILE_GRASS &&
            !(
              tx >= farmHouse.x &&
              tx < farmHouse.x + farmHouse.w &&
              ty >= farmHouse.y &&
              ty < farmHouse.y + farmHouse.h
            ) &&
            Math.random() < 0.4
          )
            gameMap[ty][tx] = TILE_TREE;
        }
      }
      for (let i = 0; i < 12; i++) {
        let fx = Math.floor(Math.random() * MAP_W),
          fy = Math.floor(Math.random() * MAP_H);
        if (gameMap[fy][fx] === TILE_GRASS) {
          gameMap[fy][fx] = TILE_FRUIT_TREE;
          gameFruitTreeTimers[`${fx},${fy}`] = 0;
        }
      }
      for (let i = 0; i < 25; i++) {
        let cx = Math.floor(Math.random() * MAP_W),
          cy = Math.floor(Math.random() * MAP_H);
        for (let j = 0; j < 4; j++) {
          let bx = cx + Math.floor(Math.random() * 4 - 2),
            by = cy + Math.floor(Math.random() * 4 - 2);
          if (
            bx >= 0 &&
            bx < MAP_W &&
            by >= 0 &&
            by < MAP_H &&
            gameMap[by][bx] === TILE_GRASS
          )
            gameMap[by][bx] = TILE_BUSH;
        }
      }
      const initSpec = [
        "chicken",
        "chicken",
        "cow",
        "pig",
        "duck",
        "rabbit",
        "sheep",
        "chicken",
        "duck",
        "rabbit",
      ];
      initSpec.forEach((spec) => {
        let ax, ay;
        do {
          ax = Math.floor(Math.random() * MAP_W);
          ay = Math.floor(Math.random() * MAP_H);
        } while (!isWalkable(ax, ay) || gameMap[ay][ax] !== TILE_GRASS);
        gameWildAnimals.push(createGameAnimal(spec, ax + 0.5, ay + 0.5));
      });
    }

    function isWalkable(tx, ty) {
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
      const tile = gameMap[ty][tx];
      if (tile === TILE_FENCE) return false;
      if (gameSelectedTool === "boots" && tile === TILE_RIVER) return true;
      if (tile === TILE_LAMPPOST || tile === TILE_WELL || tile === TILE_TILLED)
        return true;
      const inHouse =
        tx >= farmHouse.x &&
        tx < farmHouse.x + farmHouse.w &&
        ty >= farmHouse.y &&
        ty < farmHouse.y + farmHouse.h;
      if (inHouse) return true;
      return tile !== TILE_RIVER;
    }
    function canAnimalMoveTo(animal, nx, ny) {
      const tx = Math.floor(nx),
        ty = Math.floor(ny);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
      const tile = gameMap[ty][tx];
      if (tile === TILE_FENCE) return false;
      if (tile === TILE_RIVER && animal.species !== "duck") return false;
      return true;
    }
    function getAnimalStage(animal) {
      const e = Date.now() - animal.growthStart;
      if (e > GROWTH_STAGE2) return 2;
      if (e > GROWTH_STAGE1) return 1;
      return 0;
    }

    function buildPathTo(destTX, destTY) {
      const sTX = gamePlayer.tileX,
        sTY = gamePlayer.tileY;
      if (sTX === destTX && sTY === destTY) return [];
      const visited = new Set(),
        queue = [[sTX, sTY, []]];
      visited.add(`${sTX},${sTY}`);
      while (queue.length > 0) {
        const [cx, cy, path] = queue.shift();
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx === destTX && ny === destTY)
            return [
              ...path,
              { x: nx + 0.5, y: ny + 0.5, tileX: nx, tileY: ny },
            ];
          const key = `${nx},${ny}`;
          if (!visited.has(key) && isWalkable(nx, ny)) {
            visited.add(key);
            queue.push([
              nx,
              ny,
              [...path, { x: nx + 0.5, y: ny + 0.5, tileX: nx, tileY: ny }],
            ]);
          }
        }
      }
      return [];
    }
    function startMoveAlongPath(path, actionOnEnd) {
      if (gamePlayer.moving || path.length === 0) return;
      gamePlayer.movePath = path;
      gamePlayer.moving = true;
      gamePlayer.actionOnArrival = actionOnEnd;
      advanceToNextTile();
    }
    function advanceToNextTile() {
      if (gamePlayer.movePath.length === 0) {
        gamePlayer.moving = false;
        gamePlayer.tileX = Math.round(gamePlayer.x - 0.5);
        gamePlayer.tileY = Math.round(gamePlayer.y - 0.5);
        gamePlayer.x = gamePlayer.tileX + 0.5;
        gamePlayer.y = gamePlayer.tileY + 0.5;
        if (gamePlayer.actionOnArrival) {
          gamePlayer.actionOnArrival = false;
          executeAction(gamePlayer.tileX, gamePlayer.tileY);
        }
        checkNearbyInteraction();
        return;
      }
      const next = gamePlayer.movePath.shift();
      gamePlayer.moveStartX = gamePlayer.x;
      gamePlayer.moveStartY = gamePlayer.y;
      gamePlayer.moveTargetX = next.x;
      gamePlayer.moveTargetY = next.y;
      gamePlayer.moveStartTime = performance.now();
      gamePlayer.tileX = next.tileX;
      gamePlayer.tileY = next.tileY;
    }

    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect(),
        sx = canvas.width / rect.width,
        sy = canvas.height / rect.height,
        cx = ((e.clientX - rect.left) * sx) / TILE_SIZE + gameCamX,
        cy = ((e.clientY - rect.top) * sy) / TILE_SIZE + gameCamY,
        tx = Math.floor(cx),
        ty = Math.floor(cy);
      if (gamePendingAnimal) {
        if (
          isWalkable(tx, ty) &&
          (gameMap[ty][tx] === TILE_GRASS || gameMap[ty][tx] === TILE_TILLED)
        ) {
          gameWildAnimals.push(
            createGameAnimal(gamePendingAnimal, tx + 0.5, ty + 0.5),
          );
          showNotification(`🐾 ${SPECIES_NAMES[gamePendingAnimal]} solto!`);
        } else showNotification("❌ Local inválido.");
        gamePendingAnimal = null;
        return;
      }
      if (gamePlayer.moving) return;
      if (!isWalkable(tx, ty)) {
        showNotification("🚧 Bloqueado!");
        return;
      }
      if (tx === gamePlayer.tileX && ty === gamePlayer.tileY) {
        executeAction(tx, ty);
        return;
      }
      const path = buildPathTo(tx, ty);
      if (path.length === 0) return;
      startMoveAlongPath(path, true);
    });

    function movePlayerRelative(dRow, dCol) {
      if (gamePlayer.moving) return Promise.resolve();
      const tx = gamePlayer.tileX + dCol,
        ty = gamePlayer.tileY + dRow;
      if (!isWalkable(tx, ty)) {
        showNotification("🚫 Bloqueado!");
        return Promise.resolve();
      }
      const path = buildPathTo(tx, ty);
      if (path.length === 0) return Promise.resolve();
      startMoveAlongPath(path, true);
      return waitForArrival();
    }
    function waitForArrival() {
      return new Promise((res) => {
        const check = () => {
          if (!gamePlayer.moving) res();
          else requestAnimationFrame(check);
        };
        check();
      });
    }

    function getNearestBuilding() {
      let n = null,
        d = 2;
      gameBuildings.forEach((b) => {
        const dist = Math.hypot(
          gamePlayer.x - (b.x + 0.5),
          gamePlayer.y - (b.y + 0.5),
        );
        if (dist < d) {
          d = dist;
          n = b;
        }
      });
      return n;
    }
    function getNearestAnimal() {
      let n = null,
        d = 1.5;
      gameWildAnimals.forEach((a) => {
        const dist = Math.hypot(gamePlayer.x - a.x, gamePlayer.y - a.y);
        if (dist < d) {
          d = dist;
          n = a;
        }
      });
      return n;
    }
    function spawnHearts(wx, wy, count) {
      for (let i = 0; i < count; i++)
        gameFloatingHearts.push({
          x: wx,
          y: wy,
          timer: 60 + Math.random() * 40,
          offsetX: (Math.random() - 0.5) * 0.8,
          offsetY: 0,
        });
    }

    function executeAction(x, y) {
      const tile = gameMap[y][x],
        key = `${x},${y}`;
      if (gameCrops[key] && gameCrops[key].ready) {
        gamePlayerXP += 20;
        updateLevel();
        delete gameCrops[key];
        gamePlayerCoins += 10;
        showNotification("🌾 Colheu!");
        broadcastAction({ action: "harvest", tileX: x, tileY: y });
        return;
      }
      if (tile === TILE_FRUIT_TREE && gameFruitTreeTimers[key] >= 300) {
        gamePlayerXP += 50;
        updateLevel();
        gameFruitTreeTimers[key] = 0;
        gamePlayerCoins += 25;
        showNotification("🍎 Frutas!");
        return;
      }
      if (
        tile === TILE_TILLED &&
        !gameCrops[key] &&
        gameSelectedCrop >= 0 &&
        gameSelectedTool === null
      ) {
        const cn = Object.keys(CROP_NAMES)[gameSelectedCrop];
        gameCrops[key] = {
          type: gameSelectedCrop,
          timer: 0,
          ready: false,
          growTime: Object.values(CROP_GROW_TIMES)[gameSelectedCrop],
        };
        showNotification(`🌱 Plantou ${CROP_NAMES[cn]}!`);
        broadcastAction({
          action: "plant",
          tileX: x,
          tileY: y,
          cropType: gameSelectedCrop,
        });
        return;
      }
      if (
        tile === TILE_GRASS &&
        !gameCrops[key] &&
        gameSelectedTool === "hoe"
      ) {
        gameMap[y][x] = TILE_TILLED;
        showNotification("⛏️ Terra arada!");
        broadcastAction({ action: "till", tileX: x, tileY: y });
        return;
      }
    }

    function updateLevel() {
      const nl = Math.floor(gamePlayerXP / XP_PER_LEVEL) + 1;
      if (nl > gamePlayerLevel) {
        gamePlayerLevel = nl;
        updateGameShopUI();
        showLevelUpModal();
      }
      document.getElementById("xpDisplay").textContent =
        `⭐ Nv.${gamePlayerLevel} | XP: ${gamePlayerXP}/${gamePlayerLevel * XP_PER_LEVEL} 💰${gamePlayerCoins}`;
    }

    function checkNearbyInteraction() {
      const px = gamePlayer.x,
        py = gamePlayer.y,
        tx = gamePlayer.tileX,
        ty = gamePlayer.tileY,
        key = `${tx},${ty}`,
        tile = gameMap[ty] ? gameMap[ty][tx] : null;
      hideHint();
      if (tile === TILE_WELL && gameHasWateringCan) {
        showHint(formatHint("farm.tools.getWater()", "Poço", "true"));
        return;
      }
      if (gamePendingBuilding) {
        showHint(formatHint("farm.buildings.place()", "Item comprado", "true"));
        return;
      }
      if (gameSelectedTool === "hoe" && tile === TILE_GRASS) {
        showHint(formatHint("farm.soil.till()", "Enxada equipada", "true"));
        return;
      }
      if (
        gameSelectedTool === "wateringcan" &&
        gameCrops[key] &&
        !gameCrops[key].ready
      ) {
        showHint(formatHint("farm.crops.water()", "Regador equipado", "true"));
        return;
      }
      if (gameCrops[key] && gameCrops[key].ready) {
        showHint(formatHint("farm.crops.harvest()", "Cultura pronta", "true"));
        return;
      }
      if (tile === TILE_FRUIT_TREE && gameFruitTreeTimers[key] >= 300) {
        showHint(formatHint("farm.crops.harvest()", "Fruta madura", "fruta"));
        return;
      }
      if (
        tile === TILE_TILLED &&
        !gameCrops[key] &&
        gameSelectedCrop >= 0 &&
        gameSelectedTool === null
      ) {
        const cn = Object.keys(CROP_NAMES)[gameSelectedCrop];
        showHint(
          formatHint(
            `farm.crops.plant(CROPS.${cn.toUpperCase()})`,
            "Terra arada",
            "true",
          ),
        );
        return;
      }
      if (gameSelectedTool === "leash") {
        const nearest = getNearestAnimal();
        if (nearest && Math.hypot(px - nearest.x, py - nearest.y) < 1.5) {
          showHint(
            formatHint(
              nearest.isLeashed
                ? "farm.animals.release()"
                : "farm.animals.lead()",
              "Corda equipada",
              nearest.isLeashed ? "true" : "nome",
            ),
          );
          return;
        }
      }
      const na = gameWildAnimals.find(
        (a) =>
          a.isInteracting &&
          a.promptTimer > 30 &&
          Math.hypot(px - a.x, py - a.y) < 1.5,
      );
      if (na && gameSelectedTool !== "leash") {
        showHint(
          formatHint(`farm.animals.feed("${na.name}")`, "Próximo", "true"),
        );
        return;
      }
      const b = getNearestBuilding();
      if (b && Math.hypot(px - (b.x + 0.5), py - (b.y + 0.5)) < 1.5) {
        showHint(
          formatHint(
            b.isReady ? "farm.buildings.use()" : "⏳ Em andamento...",
            b.isReady ? "Pronto" : "Aguardando",
            b.isReady ? "tipo" : "",
          ),
        );
        return;
      }
      if (
        tx >= farmHouse.x &&
        tx < farmHouse.x + farmHouse.w &&
        ty >= farmHouse.y &&
        ty < farmHouse.y + farmHouse.h
      ) {
        showHint(formatHint("farm.weather.sleep()", "Casa", "avança tempo"));
      }
    }

    function formatHint(func, cond, ret) {
      return `${func}<br><span class="hint-detail">${cond ? "Cond: " + cond + ". " : ""}Ret: ${ret}</span>`;
    }
    function showHint(code) {
      hintBubble.innerHTML = code;
      hintBubble.style.display = "block";
    }
    function hideHint() {
      hintBubble.innerHTML = "";
      hintBubble.style.display = "none";
    }
    function showLevelUpModal() {
      const m = document.getElementById("levelup-modal");
      document.getElementById("levelup-level").textContent =
        `Nível ${gamePlayerLevel}`;
      gamePlayerCoins += gamePlayerLevel * 100;
      let u = "";
      if (gamePlayerLevel === 2) u = "🔓 Poste de Luz!";
      if (gamePlayerLevel === 3) u = "🔓 Regador + Poço!";
      if (gamePlayerLevel === 4) u = "🔓 Botas!";
      document.getElementById("levelup-unlock").textContent = u;
      m.style.display = "block";
      document.getElementById("levelup-close").onclick = () => {
        m.style.display = "none";
      };
      clearTimeout(m._timeout);
      m._timeout = setTimeout(() => {
        m.style.display = "none";
      }, 5000);
    }

    function updateGameWaterBar() {
      const c = document.getElementById("water-bar-container");
      if (gameHasWateringCan) {
        c.style.display = "flex";
        document.getElementById("water-bar-inner").style.width =
          (gamePlayerWater / MAX_WATER) * 100 + "%";
        document.getElementById("water-text").textContent =
          gamePlayerWater + "/" + MAX_WATER;
      } else c.style.display = "none";
    }
    function updateGameShopUI() {
      const li = document.getElementById("shop-lamppost");
      if (gamePlayerLevel >= 2) {
        li.classList.remove("locked");
        li.innerHTML =
          '<div class="item-info"><span class="item-name">💡 Poste de Luz</span></div><button class="btn" data-item="lamppost">COMPRAR</button>';
      }
      const wi = document.getElementById("shop-well");
      if (gamePlayerLevel >= 3) {
        wi.classList.remove("locked");
        wi.innerHTML =
          '<div class="item-info"><span class="item-name">🪣 Poço</span></div><button class="btn" data-item="well">COMPRAR</button>';
      }
      const bi = document.getElementById("shop-boots");
      if (gamePlayerLevel >= 4) {
        bi.classList.remove("locked");
        bi.innerHTML =
          '<div class="item-info"><span class="item-name">👢 Botas</span></div><button class="btn" data-item="boots">COMPRAR</button>';
      }
      if (gamePlayerLevel >= 3 && !gameHasWateringCan) {
        gameHasWateringCan = true;
        gamePlayerWater = MAX_WATER;
        updateGameWaterBar();
        document.getElementById("watering-can-slot").classList.remove("locked");
        showNotification("🚿 Regador desbloqueado!");
      }
      if (gamePlayerLevel >= 4 && !gameHasBoots) {
        gameHasBoots = true;
        document.getElementById("boots-slot").classList.remove("locked");
        showNotification("👢 Botas desbloqueadas!");
      }
      bindShopButtons();
    }
    function updateGameHotbar() {
      document.querySelectorAll(".hotbar-slot").forEach((s) => {
        const sv = s.getAttribute("data-slot");
        if (sv === "5")
          s.classList.toggle("active", gameSelectedTool === "leash");
        else if (sv === "6")
          s.classList.toggle("active", gameSelectedTool === "wateringcan");
        else if (sv === "7")
          s.classList.toggle("active", gameSelectedTool === "hoe");
        else if (sv === "8")
          s.classList.toggle("active", gameSelectedTool === "boots");
        else
          s.classList.toggle(
            "active",
            parseInt(sv) === gameSelectedCrop && gameSelectedTool === null,
          );
      });
      document.getElementById("seedDisplay").textContent =
        gameSelectedTool === "leash"
          ? "🧶 Corda"
          : gameSelectedTool === "wateringcan"
            ? "🚿 Regador"
            : gameSelectedTool === "hoe"
              ? "🔧 Enxada"
              : gameSelectedTool === "boots"
                ? "👢 Botas"
                : gameSelectedCrop === -1
                  ? "👐 Mãos vazias"
                  : `🌱 ${Object.values(CROP_EMOJIS)[gameSelectedCrop]} ${Object.values(CROP_NAMES)[gameSelectedCrop]}`;
    }

    function bindShopButtons() {
      document
        .querySelectorAll("#shop-modal .btn[data-item]")
        .forEach((btn) => {
          const nb = btn.cloneNode(true);
          btn.parentNode.replaceChild(nb, btn);
        });
      document
        .querySelectorAll("#shop-modal .btn[data-item]")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const item = e.target.getAttribute("data-item");
            if (["barn", "silo", "fence", "lamppost", "well"].includes(item)) {
              if (item === "lamppost" && gamePlayerLevel < 2) {
                showNotification("🔒 Nv.2");
                return;
              }
              if (item === "well" && gamePlayerLevel < 3) {
                showNotification("🔒 Nv.3");
                return;
              }
              gamePendingBuilding = { type: item };
              showNotification(`🏗️ ${item} comprado! farm.buildings.place()`);
            } else if (item === "boots") {
              if (gamePlayerLevel < 4) {
                showNotification("🔒 Nv.4");
                return;
              }
              gameHasBoots = true;
              document.getElementById("boots-slot").classList.remove("locked");
              showNotification("👢 Botas equipadas!");
            } else if (
              ["cow", "pig", "duck", "rabbit", "chicken", "sheep"].includes(
                item,
              )
            ) {
              gamePendingAnimal = item;
              showNotification(`🐾 ${SPECIES_NAMES[item]} comprado!`);
            }
            document.getElementById("shop-modal").style.display = "none";
          });
        });
    }

    document.querySelectorAll(".shop-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".shop-tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".shop-category")
          .forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        document
          .getElementById("cat-" + tab.getAttribute("data-tab"))
          .classList.add("active");
      });
    });
    document.getElementById("shop-btn").addEventListener("click", () => {
      document.getElementById("shop-modal").style.display = "block";
      updateGameShopUI();
    });
    document.getElementById("close-shop").addEventListener("click", () => {
      document.getElementById("shop-modal").style.display = "none";
    });
    bindShopButtons();

    document.querySelectorAll(".hotbar-slot").forEach((s) => {
      s.addEventListener("click", () => {
        const sv = s.getAttribute("data-slot");
        if (sv === "6" && !gameHasWateringCan) {
          showNotification("🔒 Nível 3");
          return;
        }
        if (sv === "8" && !gameHasBoots) {
          showNotification("🔒 Nível 4");
          return;
        }
        if (sv === "5") {
          gameSelectedTool = gameSelectedTool === "leash" ? null : "leash";
          if (gameSelectedTool === "leash") gameSelectedCrop = -1;
        } else if (sv === "6") {
          gameSelectedTool =
            gameSelectedTool === "wateringcan" ? null : "wateringcan";
          if (gameSelectedTool === "wateringcan") gameSelectedCrop = -1;
        } else if (sv === "7") {
          gameSelectedTool = gameSelectedTool === "hoe" ? null : "hoe";
          if (gameSelectedTool === "hoe") gameSelectedCrop = -1;
        } else if (sv === "8") {
          gameSelectedTool = gameSelectedTool === "boots" ? null : "boots";
          if (gameSelectedTool === "boots") gameSelectedCrop = -1;
        } else {
          gameSelectedTool = null;
          gameSelectedCrop = parseInt(sv);
        }
        updateGameHotbar();
      });
    });

    window.farm = {
      soil: {
        till: () => {
          if (gameSelectedTool !== "hoe") {
            showNotification("❌ Equipe TOOLS.HOE");
            return false;
          }
          const x = gamePlayer.tileX,
            y = gamePlayer.tileY;
          if (gameMap[y][x] === TILE_GRASS) {
            gameMap[y][x] = TILE_TILLED;
            showNotification("⛏️ Terra arada!");
            broadcastAction({ action: "till", tileX: x, tileY: y });
            return true;
          }
          showNotification("❌ Só grama.");
          return false;
        },
        isTilled: () =>
          gameMap[gamePlayer.tileY] &&
          gameMap[gamePlayer.tileY][gamePlayer.tileX] === TILE_TILLED,
      },
      crops: {
        plant: (crop) => {
          const x = gamePlayer.tileX,
            y = gamePlayer.tileY;
          if (gameMap[y][x] !== TILE_TILLED) {
            showNotification("❌ Are primeiro.");
            return false;
          }
          if (gameCrops[`${x},${y}`]) {
            showNotification("❌ Já tem planta.");
            return false;
          }
          const ci = Object.keys(CROP_NAMES).indexOf(crop);
          if (ci === -1) {
            showNotification("❌ Use CROPS.WHEAT etc.");
            return false;
          }
          gameSelectedCrop = ci;
          gameSelectedTool = null;
          updateGameHotbar();
          gameCrops[`${x},${y}`] = {
            type: ci,
            timer: 0,
            ready: false,
            growTime: Object.values(CROP_GROW_TIMES)[ci],
          };
          showNotification(`🌱 Plantou ${CROP_NAMES[crop]}!`);
          broadcastAction({
            action: "plant",
            tileX: x,
            tileY: y,
            cropType: ci,
          });
          return true;
        },
        water: () => {
          if (!gameHasWateringCan) {
            showNotification("❌ Regador Nv.3");
            return false;
          }
          if (gamePlayerWater <= 0) {
            showNotification("💧 Vazio!");
            return false;
          }
          const x = gamePlayer.tileX,
            y = gamePlayer.tileY,
            k = `${x},${y}`;
          if (gameCrops[k] && !gameCrops[k].ready) {
            gameCrops[k].timer += 30;
            gamePlayerWater--;
            updateGameWaterBar();
            showNotification("💦 Regou!");
            broadcastAction({ action: "water", tileX: x, tileY: y });
            return true;
          }
          showNotification("❌ Nada para regar.");
          return false;
        },
        harvest: () => {
          const x = gamePlayer.tileX,
            y = gamePlayer.tileY,
            k = `${x},${y}`;
          if (gameCrops[k] && gameCrops[k].ready) {
            gamePlayerXP += 20;
            updateLevel();
            delete gameCrops[k];
            gamePlayerCoins += 10;
            showNotification("🌾 Colheu! +20 XP");
            broadcastAction({ action: "harvest", tileX: x, tileY: y });
            return true;
          }
          if (
            gameMap[y][x] === TILE_FRUIT_TREE &&
            gameFruitTreeTimers[k] >= 300
          ) {
            gamePlayerXP += 50;
            updateLevel();
            gameFruitTreeTimers[k] = 0;
            gamePlayerCoins += 25;
            showNotification("🍎 Frutas! +50 XP");
            return "fruit";
          }
          showNotification("❌ Nada pronto.");
          return false;
        },
        isReady: () => {
          const k = `${gamePlayer.tileX},${gamePlayer.tileY}`;
          return gameCrops[k] && gameCrops[k].ready;
        },
      },
      animals: {
        feed: (name) => {
          const n = gameWildAnimals.find(
            (a) =>
              a.name === name &&
              Math.hypot(gamePlayer.x - a.x, gamePlayer.y - a.y) < 1.5,
          );
          if (!n) {
            showNotification("❌ Animal não encontrado.");
            return false;
          }
          gamePlayerXP += 30;
          updateLevel();
          n.fed = true;
          n.feedCount++;
          spawnHearts(n.x, n.y, 4);
          showNotification(`🐾 ${n.name} alimentado! +30 XP`);
          if (n.feedCount >= 2 && n.stage < 2) {
            n.stage++;
            n.feedCount = 0;
            n.growthStart =
              Date.now() - (n.stage === 1 ? GROWTH_STAGE1 : GROWTH_STAGE2);
            showNotification(`🌟 ${n.name} cresceu!`);
            spawnHearts(n.x, n.y, 10);
          }
          return true;
        },
        lead: () => {
          const n = getNearestAnimal();
          if (n && Math.hypot(gamePlayer.x - n.x, gamePlayer.y - n.y) < 1.5) {
            n.isLeashed = true;
            showNotification(`🔗 ${n.name} preso!`);
            return n.name;
          }
          return false;
        },
        release: () => {
          let f = false;
          gameWildAnimals.forEach((a) => {
            if (a.isLeashed) {
              a.isLeashed = false;
              a.targetX = a.x;
              a.targetY = a.y;
              f = true;
            }
          });
          showNotification(f ? "🔓 Solto!" : "❌ Nenhum preso.");
          return f;
        },
        collect: () => {
          const n = getNearestAnimal();
          if (
            n &&
            n.stage === 2 &&
            Math.hypot(gamePlayer.x - n.x, gamePlayer.y - n.y) < 1.5
          ) {
            gamePlayerXP += 60;
            updateLevel();
            gamePlayerCoins += 30;
            showNotification("🥚 +60 XP +30💰");
            spawnHearts(n.x, n.y, 5);
            return n.name;
          }
          return false;
        },
        getNearest: () => {
          const n = getNearestAnimal();
          return n ? { name: n.name, stage: n.stage } : null;
        },
      },
      buildings: {
        place: () => {
          if (!gamePendingBuilding) {
            showNotification("❌ Compre algo.");
            return false;
          }
          const tx = gamePlayer.tileX,
            ty = gamePlayer.tileY;
          if (
            !isWalkable(tx, ty) ||
            (gameMap[ty][tx] !== TILE_GRASS && gameMap[ty][tx] !== TILE_TILLED)
          ) {
            showNotification("❌ Local inválido.");
            return false;
          }
          const type = gamePendingBuilding.type;
          if (type === "fence") gameMap[ty][tx] = TILE_FENCE;
          else if (type === "lamppost") gameMap[ty][tx] = TILE_LAMPPOST;
          else if (type === "well") gameMap[ty][tx] = TILE_WELL;
          else
            gameBuildings.push({
              x: tx,
              y: ty,
              type,
              startTime: Date.now(),
              progress: 0,
              isReady: false,
            });
          showNotification(`✅ ${type} colocado!`);
          broadcastAction({
            action: "placeBuilding",
            tileX: tx,
            tileY: ty,
            buildingType: type,
          });
          gamePendingBuilding = null;
          return true;
        },
        use: () => {
          const b = getNearestBuilding();
          if (b && b.isReady) {
            gamePlayerXP += 40;
            updateLevel();
            gamePlayerCoins += 20;
            showNotification("🏠 +40 XP +20💰");
            return b.type;
          }
          return false;
        },
        destroy: () => {
          const b = getNearestBuilding();
          if (b) {
            gameBuildings = gameBuildings.filter((i) => i !== b);
            showNotification("💥 Removida!");
            return b.type;
          }
          return false;
        },
      },
      tools: {
        equip: (tool) => {
          if (tool === "hoe") {
            gameSelectedTool = "hoe";
            gameSelectedCrop = -1;
            updateGameHotbar();
            return true;
          }
          if (tool === "leash") {
            gameSelectedTool = "leash";
            gameSelectedCrop = -1;
            updateGameHotbar();
            return true;
          }
          if (tool === "wateringcan") {
            if (!gameHasWateringCan) {
              showNotification("🔒 Nv.3");
              return false;
            }
            gameSelectedTool = "wateringcan";
            gameSelectedCrop = -1;
            updateGameHotbar();
            return true;
          }
          if (tool === "boots") {
            if (!gameHasBoots) {
              showNotification("🔒 Nv.4");
              return false;
            }
            gameSelectedTool = "boots";
            gameSelectedCrop = -1;
            updateGameHotbar();
            return true;
          }
          return false;
        },
        getWater: () => {
          const nw =
            gameMap[gamePlayer.tileY] &&
            gameMap[gamePlayer.tileY][gamePlayer.tileX] === TILE_WELL;
          const nwb = gameBuildings.some(
            (b) =>
              b.type === "well" &&
              Math.hypot(
                gamePlayer.x - (b.x + 0.5),
                gamePlayer.y - (b.y + 0.5),
              ) < 1.5,
          );
          if (nw || nwb) {
            gamePlayerWater = MAX_WATER;
            updateGameWaterBar();
            showNotification("💧 Cheio!");
            return true;
          }
          return false;
        },
      },
      player: {
        moveRight: () => movePlayerRelative(0, 1),
        moveLeft: () => movePlayerRelative(0, -1),
        moveUp: () => movePlayerRelative(-1, 0),
        moveDown: () => movePlayerRelative(1, 0),
        getPosition: () => ({ x: gamePlayer.tileX, y: gamePlayer.tileY }),
        getLevel: () => gamePlayerLevel,
        getXP: () => gamePlayerXP,
        getCoins: () => gamePlayerCoins,
        isMoving: () => gamePlayer.moving,
      },
      weather: {
        setDay: () => {
          gameTimeOffset = getTimeToPeriod("DIA");
          showNotification("☀️ Dia");
        },
        setAfternoon: () => {
          gameTimeOffset = getTimeToPeriod("TARDE");
          showNotification("🌅 Tarde");
        },
        setNight: () => {
          gameTimeOffset = getTimeToPeriod("NOITE");
          showNotification("🌙 Noite");
        },
        setAuto: () => {
          gameTimeOffset = 0;
          showNotification("🔄 Automático");
        },
        sleep: () => {
          skipToNextPeriod();
        },
        getCurrent: () => getCurrentWeather(),
      },
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    };

    window.till = () => window.farm.soil.till();
    window.water = () => window.farm.crops.water();
    window.plant = (c) => window.farm.crops.plant(c);
    window.harvest = () => window.farm.crops.harvest();
    window.feedAnimal = (n) => window.farm.animals.feed(n);
    window.leadAnimal = () => window.farm.animals.lead();
    window.releaseAnimal = () => window.farm.animals.release();
    window.collectAnimal = () => window.farm.animals.collect();
    window.placeBuilding = () => window.farm.buildings.place();
    window.useBuilding = () => window.farm.buildings.use();
    window.destroyBuilding = () => window.farm.buildings.destroy();
    window.getWater = () => window.farm.tools.getWater();
    window.sleep = () => window.farm.weather.sleep();
    window.wait = (ms) => window.farm.wait(ms);
    window.moveRight = () => window.farm.player.moveRight();
    window.moveLeft = () => window.farm.player.moveLeft();
    window.moveUp = () => window.farm.player.moveUp();
    window.moveDown = () => window.farm.player.moveDown();
    window.setDia = () => window.farm.weather.setDay();
    window.setTarde = () => window.farm.weather.setAfternoon();
    window.setNoite = () => window.farm.weather.setNight();
    window.setAutoClima = () => window.farm.weather.setAuto();

    function getTimeToPeriod(t) {
      const e = (Date.now() + gameTimeOffset) % CYCLE_TOTAL;
      if (t === "DIA") return gameTimeOffset - e;
      if (t === "TARDE") return gameTimeOffset - e + 30 * MINUTE_MS;
      if (t === "NOITE") return gameTimeOffset - e + 40 * MINUTE_MS;
      return gameTimeOffset;
    }
    function getCurrentWeather() {
      const e =
        ((Date.now() % CYCLE_TOTAL) + gameTimeOffset + CYCLE_TOTAL) %
        CYCLE_TOTAL;
      if (e < 30 * MINUTE_MS) return "DIA";
      if (e < 40 * MINUTE_MS) return "TARDE";
      return "NOITE";
    }
    function skipToNextPeriod() {
      const e =
        ((Date.now() % CYCLE_TOTAL) + gameTimeOffset + CYCLE_TOTAL) %
        CYCLE_TOTAL;
      if (e < 30 * MINUTE_MS) gameTimeOffset += 30 * MINUTE_MS - e;
      else if (e < 40 * MINUTE_MS) gameTimeOffset += 40 * MINUTE_MS - e;
      else gameTimeOffset += 60 * MINUTE_MS - e;
      showNotification("💤 Descansou.");
    }

    commandInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const cmd = commandInput.value.trim();
        commandInput.value = "";
        if (cmd) {
          try {
            eval(cmd);
          } catch (err) {
            showNotification("❓ " + cmd);
          }
        }
      }
    });

    window.addEventListener("keydown", (e) => {
      if (document.getElementById("editor-modal").style.display === "block")
        return;
      if (document.getElementById("shop-modal").style.display === "block")
        return;
      if (document.getElementById("friends-modal").style.display === "block")
        return;
      if (document.getElementById("levelup-modal").style.display === "block") {
        if (e.key === "Enter" || e.key === "Escape")
          document.getElementById("levelup-modal").style.display = "none";
        return;
      }
      if (document.activeElement === commandInput) return;
      if (e.key === "0") {
        gameSelectedCrop = -1;
        gameSelectedTool = null;
        updateGameHotbar();
        e.preventDefault();
      }
      if (e.key === "1") {
        gameSelectedCrop = 0;
        gameSelectedTool = null;
        updateGameHotbar();
      }
      if (e.key === "2") {
        gameSelectedCrop = 1;
        gameSelectedTool = null;
        updateGameHotbar();
      }
      if (e.key === "3") {
        gameSelectedCrop = 2;
        gameSelectedTool = null;
        updateGameHotbar();
      }
      if (e.key === "4") {
        gameSelectedCrop = 3;
        gameSelectedTool = null;
        updateGameHotbar();
      }
      if (e.key === "5") {
        gameSelectedTool = gameSelectedTool === "leash" ? null : "leash";
        if (gameSelectedTool === "leash") gameSelectedCrop = -1;
        updateGameHotbar();
        e.preventDefault();
      }
      if (e.key === "6") {
        if (!gameHasWateringCan) {
          showNotification("🔒 Nível 3");
          return;
        }
        gameSelectedTool =
          gameSelectedTool === "wateringcan" ? null : "wateringcan";
        if (gameSelectedTool === "wateringcan") gameSelectedCrop = -1;
        updateGameHotbar();
        e.preventDefault();
      }
      if (e.key === "7") {
        gameSelectedTool = gameSelectedTool === "hoe" ? null : "hoe";
        if (gameSelectedTool === "hoe") gameSelectedCrop = -1;
        updateGameHotbar();
        e.preventDefault();
      }
      if (e.key === "8") {
        if (!gameHasBoots) {
          showNotification("🔒 Nível 4");
          return;
        }
        gameSelectedTool = gameSelectedTool === "boots" ? null : "boots";
        if (gameSelectedTool === "boots") gameSelectedCrop = -1;
        updateGameHotbar();
        e.preventDefault();
      }
    });

    function update() {
      gameTime++;
      if (gamePlayer.moving) {
        const e = performance.now() - gamePlayer.moveStartTime,
          p = Math.min(e / MOVE_DURATION, 1);
        gamePlayer.x =
          gamePlayer.moveStartX +
          (gamePlayer.moveTargetX - gamePlayer.moveStartX) * p;
        gamePlayer.y =
          gamePlayer.moveStartY +
          (gamePlayer.moveTargetY - gamePlayer.moveStartY) * p;
        if (p >= 1) {
          gamePlayer.x = gamePlayer.moveTargetX;
          gamePlayer.y = gamePlayer.moveTargetY;
          advanceToNextTile();
        }
      }
      for (let k in gameCrops) {
        const c = gameCrops[k];
        if (!c.ready && c.timer < c.growTime) c.timer += 1;
        if (c.timer >= c.growTime) c.ready = true;
      }
      for (let k in gameFruitTreeTimers) {
        if (gameFruitTreeTimers[k] < 300) gameFruitTreeTimers[k] += 1;
      }
      gameWildAnimals.forEach((a) => {
        const ns = getAnimalStage(a);
        if (ns !== a.stage) a.stage = ns;
        const d = Math.hypot(gamePlayer.x - a.x, gamePlayer.y - a.y);
        if (a.isLeashed) {
          const dx = gamePlayer.x - a.x,
            dy = gamePlayer.y - a.y,
            od = Math.hypot(dx, dy);
          if (od > 1.8) {
            a.x += (dx / od) * PLAYER_SPEED * 0.85;
            a.y += (dy / od) * PLAYER_SPEED * 0.85;
          } else if (od < 1.3) {
            a.x -= (dx / od) * 0.03;
            a.y -= (dy / od) * 0.03;
          }
          a.targetX = a.x;
          a.targetY = a.y;
          a.isInteracting = false;
          a.promptTimer = 0;
        } else if (d < 1.2 && !gamePlayer.moving) {
          a.isInteracting = true;
          const dx = gamePlayer.x - a.x,
            dy = gamePlayer.y - a.y;
          a.dir =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? "right"
                : "left"
              : dy > 0
                ? "front"
                : "back";
          gamePlayer.dir =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? "left"
                : "right"
              : dy > 0
                ? "back"
                : "front";
          a.promptTimer++;
        } else {
          a.isInteracting = false;
          a.promptTimer = 0;
        }
        if (!a.isLeashed) {
          const ddx = a.targetX - a.x,
            ddy = a.targetY - a.y,
            dd = Math.hypot(ddx, ddy),
            spd = a.speed;
          if (dd > 0.06 && !a.isInteracting) {
            const nax = a.x + (ddx / dd) * spd,
              nay = a.y + (ddy / dd) * spd;
            if (canAnimalMoveTo(a, nax, a.y)) a.x = nax;
            else a.targetX = a.x + (Math.random() * 4 - 2);
            if (canAnimalMoveTo(a, a.x, nay)) a.y = nay;
            else a.targetY = a.y + (Math.random() * 4 - 2);
          } else if (dd < 0.1 && !a.isInteracting) {
            let nx, ny;
            do {
              nx = Math.floor(a.x + (Math.random() * 6 - 3));
              ny = Math.floor(a.y + (Math.random() * 6 - 3));
            } while (!canAnimalMoveTo(a, nx + 0.5, ny + 0.5));
            a.targetX = nx + 0.5;
            a.targetY = ny + 0.5;
          }
        }
        if (a.fed) a.fed = false;
      });
      if (!gamePlayer.moving && !gamePendingBuilding) checkNearbyInteraction();
      gameFloatingHearts.forEach((h) => {
        h.timer--;
        h.offsetY -= 0.02;
      });
      gameFloatingHearts = gameFloatingHearts.filter((h) => h.timer > 0);
      document.getElementById("leashDisplay").textContent =
        gameWildAnimals.some((a) => a.isLeashed) ? "🔗 Animais na corda" : "";
      gameBuildings.forEach((b) => {
        if (!b.isReady) {
          const e = Date.now() - b.startTime;
          b.progress = Math.min(e / BUILD_TIME, 1);
          if (b.progress >= 1) b.isReady = true;
        }
      });
      const tcx = gamePlayer.x - canvas.width / TILE_SIZE / 2,
        tcy = gamePlayer.y - canvas.height / TILE_SIZE / 2;
      gameCamX += (tcx - gameCamX) * 0.12;
      gameCamY += (tcy - gameCamY) * 0.12;
      gameCamX = Math.max(
        0,
        Math.min(MAP_W - canvas.width / TILE_SIZE, gameCamX),
      );
      gameCamY = Math.max(
        0,
        Math.min(MAP_H - canvas.height / TILE_SIZE, gameCamY),
      );
      document.getElementById("timeDisplay").textContent =
        getCurrentWeather() === "DIA"
          ? "☀️ Dia"
          : getCurrentWeather() === "TARDE"
            ? "🌅 Tarde"
            : "🌙 Noite";
      if (Math.floor(gameTime) % 10 === 0) broadcastPosition();
    }

    function draw() {
      const weather = getCurrentWeather();
      let gc, sc, ov;
      if (weather === "DIA") {
        gc = "#7cb342";
        sc = "#87ceeb";
        ov = null;
      } else if (weather === "TARDE") {
        gc = "#5a7d3c";
        sc = "#c47f5a";
        ov = "rgba(0,0,0,0.05)";
      } else {
        gc = "#2d4a1e";
        sc = "#1a1a3e";
        ov = "rgba(0,0,30,0.6)";
      }
      ctx.fillStyle = sc;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = Math.floor(gameCamX),
        sy = Math.floor(gameCamY),
        ex = Math.ceil(gameCamX + canvas.width / TILE_SIZE) + 1,
        ey = Math.ceil(gameCamY + canvas.height / TILE_SIZE) + 1;

      // Primeiro passo: desenhar solo e tiles
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
          const px = (x - gameCamX) * TILE_SIZE,
            py = (y - gameCamY) * TILE_SIZE,
            tile = gameMap[y][x];

          // Solo
          if (tile === TILE_TILLED) {
            if (!drawSprite(ctx, "TILLED", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#8B6914";
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          } else if (tile === TILE_WELL) {
            if (!drawSprite(ctx, "WELL", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#7a7a7a";
              ctx.fillRect(
                px + TILE_SIZE * 0.2,
                py + TILE_SIZE * 0.35,
                TILE_SIZE * 0.6,
                TILE_SIZE * 0.55,
              );
              ctx.fillStyle = "#4488cc";
              ctx.fillRect(
                px + TILE_SIZE * 0.28,
                py + TILE_SIZE * 0.45,
                TILE_SIZE * 0.44,
                TILE_SIZE * 0.35,
              );
            }
          } else if (tile === TILE_RIVER) {
            if (!drawSprite(ctx, "WATER", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#3b7dd8";
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
          } else {
            ctx.fillStyle = gc;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          }

          // Cerca
          if (tile === TILE_FENCE) {
            if (!drawSprite(ctx, "FENCE", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#8B5A2B";
              ctx.fillRect(px + 2, py + TILE_SIZE * 0.3, TILE_SIZE - 4, 4);
              ctx.fillRect(px + 2, py + TILE_SIZE * 0.6, TILE_SIZE - 4, 4);
            }
          }

          // Poste de luz
          if (tile === TILE_LAMPPOST) {
            if (!drawSprite(ctx, "LAMPPOST", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#666";
              ctx.fillRect(
                px + TILE_SIZE * 0.44,
                py + TILE_SIZE * 0.2,
                TILE_SIZE * 0.12,
                TILE_SIZE * 0.4,
              );
              ctx.fillStyle = "#FFD700";
              ctx.fillRect(
                px + TILE_SIZE * 0.57,
                py + TILE_SIZE * 0.04,
                TILE_SIZE * 0.16,
                TILE_SIZE * 0.14,
              );
            }
          }

          // ÁRVORE COMUM
          if (tile === TILE_TREE) {
            const size = TILE_SIZE * TREE_SCALE;
            const offX = (TILE_SIZE - size) / 2;
            const offY = (TILE_SIZE - size) / 2;
            if (!drawSprite(ctx, "TREE", px + offX, py + offY, size)) {
              ctx.fillStyle = "#5C3D1F";
              ctx.fillRect(
                px + TILE_SIZE * 0.35 - (TILE_SIZE * (TREE_SCALE - 1)) / 2,
                py + TILE_SIZE * 0.45,
                TILE_SIZE * 0.3 * TREE_SCALE,
                TILE_SIZE * 0.5 * TREE_SCALE,
              );
              ctx.fillStyle = "#1B5E1B";
              ctx.beginPath();
              ctx.arc(
                px + TILE_SIZE * 0.5,
                py + TILE_SIZE * 0.2 - (TILE_SIZE * (TREE_SCALE - 1)) / 2,
                TILE_SIZE * 0.35 * TREE_SCALE,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
          }

          // ARBUSTO
          if (tile === TILE_BUSH) {
            const size = TILE_SIZE * BUSH_SCALE;
            const offX = (TILE_SIZE - size) / 2;
            const offY = (TILE_SIZE - size) / 2;
            const bushKey = (x + y) % 2 === 0 ? "BUSH" : "BUSH2";
            if (!drawSprite(ctx, bushKey, px + offX, py + offY, size)) {
              ctx.fillStyle = "#3a7d3a";
              ctx.beginPath();
              ctx.arc(
                px + TILE_SIZE * 0.5,
                py + TILE_SIZE * 0.55,
                TILE_SIZE * 0.3 * BUSH_SCALE,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
          }

          // ÁRVORE FRUTÍFERA
          if (tile === TILE_FRUIT_TREE) {
            const size = TILE_SIZE * FRUIT_SCALE;
            const offX = (TILE_SIZE - size) / 2;
            const offY = (TILE_SIZE - size) / 2;
            if (!drawSprite(ctx, "FRUIT_TREE", px + offX, py + offY, size)) {
              ctx.fillStyle = "#5C3D1F";
              ctx.fillRect(
                px + TILE_SIZE * 0.35 - (TILE_SIZE * (FRUIT_SCALE - 1)) / 2,
                py + TILE_SIZE * 0.45,
                TILE_SIZE * 0.3 * FRUIT_SCALE,
                TILE_SIZE * 0.5 * FRUIT_SCALE,
              );
              ctx.fillStyle = "#1B5E1B";
              ctx.beginPath();
              ctx.arc(
                px + TILE_SIZE * 0.5,
                py + TILE_SIZE * 0.2 - (TILE_SIZE * (FRUIT_SCALE - 1)) / 2,
                TILE_SIZE * 0.35 * FRUIT_SCALE,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            // Maçã
            const hasFruit = gameFruitTreeTimers[`${x},${y}`] >= 300;
            if (hasFruit) {
              const appleSize = TILE_SIZE * 0.25 * FRUIT_SCALE;
              const ax =
                px + TILE_SIZE * 0.55 - (appleSize - TILE_SIZE * 0.25) / 2;
              const ay =
                py + TILE_SIZE * 0.05 - (appleSize - TILE_SIZE * 0.25) / 2;
              if (!drawSprite(ctx, "APPLE", ax, ay, appleSize)) {
                ctx.fillStyle = "#ff3333";
                ctx.beginPath();
                ctx.arc(
                  px + TILE_SIZE * 0.6,
                  py + TILE_SIZE * 0.15,
                  TILE_SIZE * 0.12 * FRUIT_SCALE,
                  0,
                  Math.PI * 2,
                );
                ctx.fill();
              }
            }
          }
        }
      }

      // Desenhar a casa (farmHouse) usando sprite
      const houseX = (farmHouse.x - gameCamX) * TILE_SIZE;
      const houseY = (farmHouse.y - gameCamY) * TILE_SIZE;
      const houseW = farmHouse.w * TILE_SIZE;
      const houseH = farmHouse.h * TILE_SIZE;
      if (!drawSprite(ctx, "HOUSE", houseX, houseY, houseW, houseH)) {
        // Fallback: retângulo marrom
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(houseX, houseY, houseW, houseH);
        ctx.fillStyle = "#A0522D";
        ctx.fillRect(houseX + 5, houseY + 5, houseW - 10, houseH - 10);
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(houseX + houseW / 2 - 5, houseY - 5, 10, 10);
      }

      // Culturas
      for (let k in gameCrops) {
        const [x, y] = k.split(",").map(Number),
          px = (x - gameCamX) * TILE_SIZE,
          py = (y - gameCamY) * TILE_SIZE,
          c = gameCrops[k],
          prog = Math.min(c.timer / c.growTime, 1),
          stage = Math.floor(prog * 3);
        ctx.fillStyle = ["#90EE90", "#ADFF2F", "#FFD700", "#FF8C00"][stage];
        ctx.fillRect(
          px + TILE_SIZE * 0.3,
          py + TILE_SIZE * 0.4,
          TILE_SIZE * 0.4,
          TILE_SIZE * 0.5,
        );
        if (c.ready) {
          ctx.fillStyle = "#fff";
          ctx.font = `${TILE_SIZE * 0.3}px "Press Start 2P"`;
          ctx.fillText("★", px + TILE_SIZE * 0.35, py + TILE_SIZE * 0.25);
        }
      }

      // Construções (barn, silo, etc.)
      gameBuildings.forEach((b) => {
        const px = (b.x - gameCamX) * TILE_SIZE,
          py = (b.y - gameCamY) * TILE_SIZE;
        if (!b.isReady) {
          ctx.fillStyle = "gray";
          ctx.fillRect(px, py - 10, TILE_SIZE, 5);
          ctx.fillStyle = "lime";
          ctx.fillRect(px, py - 10, TILE_SIZE * b.progress, 5);
        } else {
          if (b.type === "barn") {
            if (!drawSprite(ctx, "BARN", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#8B4513";
              ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 4);
            }
          } else if (b.type === "silo") {
            if (!drawSprite(ctx, "SILO", px, py, TILE_SIZE)) {
              ctx.fillStyle = "#A9A9A9";
              ctx.fillRect(
                px + TILE_SIZE * 0.2,
                py + TILE_SIZE * 0.1,
                TILE_SIZE * 0.6,
                TILE_SIZE * 0.8,
              );
            }
          } else if (b.type === "well") {
            drawSprite(ctx, "WELL", px, py, TILE_SIZE) ||
              (() => {
                ctx.fillStyle = "#7a7a7a";
                ctx.fillRect(
                  px + TILE_SIZE * 0.2,
                  py + TILE_SIZE * 0.35,
                  TILE_SIZE * 0.6,
                  TILE_SIZE * 0.55,
                );
              })();
          } else {
            // fallback
            ctx.fillStyle = "#A9A9A9";
            ctx.fillRect(
              px + TILE_SIZE * 0.2,
              py + TILE_SIZE * 0.1,
              TILE_SIZE * 0.6,
              TILE_SIZE * 0.8,
            );
          }
        }
      });

      // Animais
      gameWildAnimals.forEach((a) => {
        const px = (a.x - gameCamX) * TILE_SIZE;
        const py = (a.y - gameCamY) * TILE_SIZE;
        const sizeScale = [0.5, 0.75, 1][a.stage];
        const size = TILE_SIZE * 0.5 * sizeScale;

        let spriteKey = null;
        if (a.species === "cow") spriteKey = "COW";
        else if (a.species === "chicken") {
          spriteKey = a.stage === 0 ? "CHICKEN_BABY" : "CHICKEN";
        } else if (a.species === "pig") spriteKey = "PIG";
        else if (a.species === "rabbit") spriteKey = "RABBIT";
        else if (a.species === "duck") spriteKey = "DUCK";

        if (spriteKey && !drawSprite(ctx, spriteKey, px, py, size)) {
          ctx.font = `${size}px "Press Start 2P"`;
          ctx.fillText(a.type, px + TILE_SIZE * 0.15, py + TILE_SIZE * 0.7);
        }

        if (a.isLeashed) {
          ctx.strokeStyle = "#ff69b4";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(
            (gamePlayer.x - gameCamX) * TILE_SIZE + TILE_SIZE / 2,
            (gamePlayer.y - gameCamY) * TILE_SIZE + TILE_SIZE / 2,
          );
          ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      });

      // Jogadores remotos
      for (let id in remotePlayers) {
        const rp = remotePlayers[id];
        const rpx = (rp.x - gameCamX) * TILE_SIZE,
          rpy = (rp.y - gameCamY) * TILE_SIZE;
        ctx.fillStyle = "#ff6347";
        ctx.font = `${TILE_SIZE * 0.6}px "Press Start 2P"`;
        ctx.fillText("👤", rpx + TILE_SIZE * 0.15, rpy + TILE_SIZE * 0.8);
        ctx.fillStyle = "#fff";
        ctx.font = `${TILE_SIZE * 0.2}px "Press Start 2P"`;
        ctx.fillText(rp.name || "?", rpx + TILE_SIZE * 0.1, rpy - 5);
      }

      // Jogador local
      const ppx = (gamePlayer.x - gameCamX) * TILE_SIZE,
        ppy = (gamePlayer.y - gameCamY) * TILE_SIZE;
      ctx.fillStyle = "#3b5998";
      ctx.font = `${TILE_SIZE * 0.7}px "Press Start 2P"`;
      ctx.fillText("🧑‍🌾", ppx + TILE_SIZE * 0.1, ppy + TILE_SIZE * 0.8);

      if (!isHost && roomId && !worldReceived) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffd700";
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = "center";
        ctx.fillText(
          "🟡 Aguardando o host",
          canvas.width / 2,
          canvas.height / 2 - 20,
        );
        ctx.fillText(
          "iniciar o jogo...",
          canvas.width / 2,
          canvas.height / 2 + 20,
        );
        ctx.textAlign = "left";
      }

      if (ov) {
        ctx.fillStyle = ov;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function gameLoop() {
      if (!gameRunning) return;
      update();
      draw();
      gameLoopId = requestAnimationFrame(gameLoop);
    }
    gameLoop();
    updateGameHotbar();
    updateGameWaterBar();
    updateGameShopUI();
    commandInput.focus();
    showRoomCodeInGame();
  }

  // Editor de código
  const editorModal = document.getElementById("editor-modal"),
    codeEditor = document.getElementById("codeEditor");
  document
    .getElementById("open-editor-btn")
    .addEventListener("click", () => (editorModal.style.display = "block"));
  document
    .getElementById("close-editor")
    .addEventListener("click", () => (editorModal.style.display = "none"));
  document.getElementById("runBtn").addEventListener("click", async () => {
    const code = codeEditor.value.trim();
    if (!code) return;
    try {
      await eval(`(async()=>{try{${code}}catch(e){throw e;}})();`);
      document.getElementById("consoleOutput").textContent =
        "✅ Código executado.";
    } catch (e) {
      document.getElementById("consoleOutput").textContent =
        "❌ Erro: " + e.message;
    }
  });
  document.getElementById("exampleBtn").addEventListener("click", () => {
    codeEditor.value = `farm.tools.equip(TOOLS.HOE);\nfor (let i=0;i<3;i++) {\n    farm.soil.till();\n    farm.player.moveRight();\n    await farm.wait(200);\n}\nfarm.player.moveLeft(); farm.player.moveLeft(); farm.player.moveLeft();\nfor (let i=0;i<3;i++) {\n    farm.crops.plant(CROPS.WHEAT);\n    farm.crops.water();\n    farm.player.moveRight();\n    await farm.wait(200);\n}`;
  });
})();
