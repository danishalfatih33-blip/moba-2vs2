const http = require('http');
const { WebSocketServer } = require('ws');

// ==========================================
// TAMPILAN CLIENT GAME (HTML & INTERFACE)
// ==========================================
const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>MOBA 2vs2 Multiplayer</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #11141a; color: #fff; text-align: center; padding: 15px; margin: 0; }
        .container { max-width: 500px; margin: auto; background: #1c2331; padding: 20px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .btn { padding: 16px 20px; font-size: 16px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; margin: 8px; width: 44%; touch-action: manipulation; }
        .btn-attack { background: #e74c3c; color: white; box-shadow: 0 4px #c0392b; }
        .btn-attack:active { transform: translateY(4px); box-shadow: none; }
        .btn-heal { background: #2ecc71; color: white; box-shadow: 0 4px #27ae60; }
        .btn-heal:active { transform: translateY(4px); box-shadow: none; }
        .btn:disabled { background: #444; color: #777; box-shadow: none; cursor: not-allowed; }
        .status-box { background: #0f131c; padding: 12px; border-radius: 8px; margin-top: 20px; text-align: left; height: 160px; overflow-y: auto; font-size: 14px; border: 1px solid #2c3e50; }
        .team-info { display: flex; justify-content: space-between; margin: 20px 0; }
        .team { padding: 12px; border-radius: 6px; font-weight: bold; width: 45%; font-size: 15px; }
        .Blue { background: #2980b9; border: 2px solid #3498db; }
        .Red { background: #c0392b; border: 2px solid #e74c3c; }
        .log-sys { color: #f1c40f; }
        .log-act { color: #ecf0f1; }
    </style>
</head>
<body>
    <div class="container">
        <h2>⚔️ MOBA 2vs2 GAME ⚔️</h2>
        <p id="player-id">Menghubungkan ke server...</p>
        
        <div class="team-info">
            <div class="team Blue">🏰 Blue Base: <br><span id="hp-Blue" style="font-size: 24px;">100</span> HP</div>
            <div class="team Red">🏰 Red Base: <br><span id="hp-Red" style="font-size: 24px;">100</span> HP</div>
        </div>

        <h4 id="game-status">Menunggu Pemain... (<span id="count">0</span>/4)</h4>

        <div style="display: flex; justify-content: center;">
            <button id="btn-attack" class="btn btn-attack" onclick="sendAction('ATTACK_TURRET')" disabled>💥 SERANG</button>
            <button id="btn-heal" class="btn btn-heal" onclick="sendAction('HEAL')" disabled>💚 HEAL (<span id="my-hp">100</span>)</button>
        </div>

        <div class="status-box" id="logs">
            <div class="log-sys">[SISTEM] Selamat datang di Land of Dawn Mobile!</div>
        </div>
    </div>

    <script>
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(\`\${wsProtocol}//\${window.location.host}\`);
        
        let myTeam = "";
        let myHp = 100;

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'INIT') {
                document.getElementById('player-id').innerHTML = \`ID: <strong>\${msg.data.playerId}</strong> | Tim: <strong>\${msg.data.team}</strong>\`;
                myTeam = msg.data.team;
            }

            if (msg.type === 'STATE_UPDATE') {
                document.getElementById('hp-Blue').innerText = msg.state.turrets.Blue;
                document.getElementById('hp-Red').innerText = msg.state.turrets.Red;
                document.getElementById('count').innerText = msg.state.playerCount;

                const isPlaying = msg.state.status === "PLAYING";
                document.getElementById('btn-attack').disabled = !isPlaying;
                document.getElementById('btn-heal').disabled = !isPlaying;

                if (isPlaying) {
                    document.getElementById('game-status').innerText = "⚔️ MATCH DIMULAI! Hancurkan base lawan!";
                    document.getElementById('game-status').style.color = "#e74c3c";
                }
            }

            if (msg.type === 'ACTION' || msg.type === 'SYSTEM' || msg.type === 'GAME_OVER') {
                const logs = document.getElementById('logs');
                const cssClass = msg.type === 'SYSTEM' ? 'log-sys' : 'log-act';
                logs.innerHTML += \`<div class="\${cssClass}">\${msg.message}</div>\`;
                logs.scrollTop = logs.scrollHeight;

                if(msg.type === 'GAME_OVER') {
                    document.getElementById('btn-attack').disabled = true;
                    document.getElementById('btn-heal').disabled = true;
                    document.getElementById('game-status').innerText = "🏁 MATCH BERAKHIR!";
                    document.getElementById('game-status').style.color = "#f1c40f";
                }
            }
        };

        function sendAction(actionType) {
            if (actionType === 'HEAL') {
                myHp = Math.min(100, myHp + 20);
                document.getElementById('my-hp').innerText = myHp;
            }
            ws.send(JSON.stringify({ type: actionType }));
        }
    </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
});

// ==========================================
// CORE LOGIK ENGINE MULTIPLAYER GAME (SERVER)
// ==========================================
const wss = new WebSocketServer({ server });

let players = {};
let gameState = {
    teams: {
        Blue: { towerHP: 100, players: [] },
        Red: { towerHP: 100, players: [] }
    },
    status: "WAITING_FOR_PLAYERS"
};

wss.on('connection', (ws) => {
    if (Object.keys(players).length >= 4) {
        ws.send(JSON.stringify({ type: 'SYSTEM', message: '❌ Room penuh! Maksimal 4 player.' }));
        ws.close();
        return;
    }

    const playerId = `Hero_\${Math.floor(1000 + Math.random() * 9000)}`;
    let team = gameState.teams.Blue.players.length < 2 ? 'Blue' : 'Red';
    
    players[playerId] = { id: playerId, team: team, hp: 100, attack: 10, ws: ws };
    gameState.teams[team].players.push(playerId);
    
    ws.send(JSON.stringify({ type: 'INIT', data: { playerId, team } }));
    broadcast({ type: 'SYSTEM', message: `📢 <strong>\${playerId}</strong> join ke Tim [\${team}]` });

    if (Object.keys(players).length === 4 && gameState.status === "WAITING_FOR_PLAYERS") {
        gameState.status = "PLAYING";
        broadcast({ type: 'SYSTEM', message: '⚔️ <strong>ALL PLAYERS READY! WAR DIMULAI!</strong> ⚔️' });
    }

    broadcastGameState();

    ws.on('message', (message) => {
        if (gameState.status !== "PLAYING") return;
        const action = JSON.parse(message);
        const player = players[playerId];
        const enemyTeam = player.team === 'Blue' ? 'Red' : 'Blue';

        if (action.type === 'ATTACK_TURRET') {
            gameState.teams[enemyTeam].towerHP -= player.attack;
            broadcast({ type: 'ACTION', message: `💥 [\${player.team}] \${player.id} hit base musuh! (-10 HP)` });
            
            if (gameState.teams[enemyTeam].towerHP <= 0) {
                gameState.teams[enemyTeam].towerHP = 0;
                gameState.status = "FINISHED";
                broadcast({ type: 'GAME_OVER', message: `🏆 <strong>VICTORY! TIM [\${player.team}] MENANG!</strong>` });
            }
        }
        broadcastGameState();
    });

    ws.on('close', () => {
        if (players[playerId]) {
            const pTeam = players[playerId].team;
            gameState.teams[pTeam].players = gameState.teams[pTeam].players.filter(id => id !== playerId);
            delete players[playerId];
            broadcast({ type: 'SYSTEM', message: `❌ \${playerId} keluar/afk.` });
        }
        if (gameState.status === "PLAYING") {
            gameState.status = "WAITING_FOR_PLAYERS";
            broadcast({ type: 'SYSTEM', message: '⚠️ Player berkurang. Game di-pause hingga player genap 4 orang.' });
        }
        broadcastGameState();
    });
});

function broadcast(data) {
    Object.values(players).forEach(p => p.ws.readyState === 1 && p.ws.send(JSON.stringify(data)));
}

function broadcastGameState() {
    const cleanState = {
        status: gameState.status,
        turrets: { Blue: gameState.teams.Blue.towerHP, Red: gameState.teams.Red.towerHP },
        playerCount: Object.keys(players).length
    };
    broadcast({ type: 'STATE_UPDATE', state: cleanState });
}

// Menjalankan server di port dinamis (agar kompatibel saat di-deploy)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Game running on port ${PORT}`);
});
