import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCyag9xRPwQ_abIWO7Ng-paqdUg5sIjqHk",
  authDomain: "train-manager-83516.firebaseapp.com",
  databaseURL: "https://train-manager-83516-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "train-manager-83516",
  storageBucket: "train-manager-83516.firebasestorage.app",
  messagingSenderId: "877276977784",
  appId: "1:877276977784:web:839e7f2f234139a3692b8d"
};

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1464903308761235693/N6jEKVsxfjV7w5Pz8oswq9lNnsd6wlT2ELD0oBoNGquoVSaBte4yMQpEXwD8K_S0fPtU";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

// --- CONSTANTES ---
const DAYS = ["J1", "J2", "J3", "J4", "J5", "J6"];
const RANK_POWER = { 'R5': 5, 'R4': 4, 'R3': 3, 'R2': 2, 'R1': 1, 'ABS': 0 };

// --- DONNÉES ---
let members = [];
let allScores = {}; 
let currentWeek = ""; 

// TRI : 3 états (DESC -> ASC -> NONE)
let sortCol = "TOTAL"; 
let sortState = "DESC"; 

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            startDatabaseListener();
            setTimeout(silentAutoBackupApp4, 4000);
        } else {
            signInAnonymously(auth).catch(console.error);
        }
    });
});

function startDatabaseListener() {
    onValue(ref(db, 'members'), (snapshot) => {
        const val = snapshot.val();
        members = val ? Object.values(val) : [];
        renderGrid();
    });

    onValue(ref(db, 'app4/scores'), (snapshot) => {
        allScores = snapshot.val() || {};
        updateWeekSelector();
        renderGrid();
    });
}

// --- GESTION DES SEMAINES ---
function updateWeekSelector() {
    const select = document.getElementById('weekSelect');
    const weeks = Object.keys(allScores).sort((a, b) => b.localeCompare(a));
    
    select.innerHTML = '';
    
    if (weeks.length === 0) {
        select.innerHTML = '<option value="">Aucune semaine</option>';
        currentWeek = "";
        return;
    }

    weeks.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.innerText = w;
        select.appendChild(opt);
    });

    if (!currentWeek || !weeks.includes(currentWeek)) {
        currentWeek = weeks[0];
    }
    select.value = currentWeek;
}

window.changeWeek = function() {
    currentWeek = document.getElementById('weekSelect').value;
    renderGrid();
}

// --- CRÉATION DE SEMAINE AVEC CALENDRIER ---

window.openNewWeekModal = function() {
    if (!auth.currentUser) return;
    
    // Préremplir avec un nom par défaut et la date du jour
    document.getElementById('newWeekName').value = "BSGI"; 
    document.getElementById('newWeekDate').valueAsDate = new Date();
    
    document.getElementById('newWeekModal').style.display = 'flex';
}

window.closeNewWeekModal = function() {
    document.getElementById('newWeekModal').style.display = 'none';
}

window.confirmNewWeek = function() {
    if (!auth.currentUser) return;

    const weekName = document.getElementById('newWeekName').value.trim();
    const dateVal = document.getElementById('newWeekDate').value;

    if (!weekName || !dateVal) {
        alert("Veuillez remplir le nom et choisir une date.");
        return;
    }

    // Calcul magique du Lundi et du Samedi
    const selectedDate = new Date(dateVal);
    const dayOfWeek = selectedDate.getDay() || 7; 
    
    // Trouver le Lundi
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - dayOfWeek + 1);
    
    // Trouver le Samedi (+5 jours après le Lundi)
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    
    // --- CORRECTION ICI : On utilise des tirets (-) car Firebase refuse les points (.) ---
    const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}`;
    
    // Format final : 23-02 au 28-02
    const dateSuffix = `${formatDate(monday)} au ${formatDate(saturday)}`;
    const safeName = `${weekName} - ${dateSuffix}`;

    if (allScores[safeName]) {
        alert("Cette semaine existe déjà dans la liste.");
        return;
    }
    
    // Création dans la base de données de manière sécurisée (avec gestion d'erreur)
    const updates = {};
    updates[`app4/scores/${safeName}/_init`] = true;
    
    update(ref(db), updates).then(() => {
        currentWeek = safeName;
        push(ref(db, 'app4/logs'), `[${new Date().toLocaleString()}] Création semaine: ${safeName}`);
        
        // On ferme la modale uniquement si la base de données a accepté l'enregistrement
        closeNewWeekModal();
        
    }).catch(error => {
        console.error("Erreur Firebase:", error);
        alert("Erreur lors de la création. Le nom contient peut-être des caractères interdits (#, $, [, ], .)");
    });
}

// --- LOGIQUE SAISIE INDIVIDUELLE ---
window.openScoreModal = function(playerName, day) {
    if (!auth.currentUser || !currentWeek) return;
    const playerScore = (allScores[currentWeek] && allScores[currentWeek][playerName]) ? allScores[currentWeek][playerName] : {};
    document.getElementById('editScorePlayer').innerText = playerName;
    document.getElementById('editScoreDay').innerText = day;
    document.getElementById('editScoreValue').value = playerScore[day] || "";
    document.getElementById('scoreModal').style.display = 'flex';
    document.getElementById('editScoreValue').focus();
}

window.closeScoreModal = function() { document.getElementById('scoreModal').style.display = 'none'; }

window.confirmScoreEdit = function() {
    if (!currentWeek) return;
    const playerName = document.getElementById('editScorePlayer').innerText;
    const day = document.getElementById('editScoreDay').innerText;
    const rawVal = document.getElementById('editScoreValue').value;
    const finalVal = isNaN(parseInt(rawVal)) ? 0 : parseInt(rawVal); 

    const updates = {};
    updates[`app4/scores/${currentWeek}/${playerName}/${day}`] = finalVal;
    updates[`app4/scores/${currentWeek}/_init`] = null;

    update(ref(db), updates).catch(console.error);
    closeScoreModal();
}

// --- LOGIQUE SAISIE GLOBALE (BULK) INTELLIGENTE ---
window.openBulkScoreModal = function() {
    if (!currentWeek) { alert("Sélectionnez ou créez une semaine d'abord."); return; }
    document.getElementById('bulkScoreTextarea').value = '';
    document.getElementById('bulkScoreModal').style.display = 'flex';
}

window.closeBulkScoreModal = function() { document.getElementById('bulkScoreModal').style.display = 'none'; }

window.processBulkScores = function() {
    if (!currentWeek) return;
    const text = document.getElementById('bulkScoreTextarea').value;
    const day = document.getElementById('bulkScoreDay').value;
    if (!text.trim()) return;

    const updates = {};
    let count = 0;

    // Cette Regex trouve toutes les occurrences de : "Pseudo", Nombre ou Pseudo, Nombre (même sur une seule ligne)
    const regex = /(?:"([^"]+)"|([^",\n]+))\s*,\s*([\d\s,]+)/g;
    const matches = [...text.matchAll(regex)];

    matches.forEach(match => {
        // match[1] = Pseudo avec guillemets, match[2] = Pseudo sans guillemets, match[3] = Score brut
        let pseudoStr = (match[1] || match[2]).trim().toLowerCase();
        
        // Supprime les espaces ET les virgules dans le nombre (ex: 16,161,755 -> 16161755)
        let scoreStr = match[3].replace(/[\s,]/g, ''); 
        let score = parseInt(scoreStr, 10);
        
        if (!isNaN(score)) {
            // Tolérance pour faire le lien avec la base de données
            const m = members.find(x => x.name.toLowerCase() === pseudoStr);
            if (m) {
                updates[`app4/scores/${currentWeek}/${m.name}/${day}`] = score;
                count++;
            }
        }
    });

    if (Object.keys(updates).length > 0) {
        updates[`app4/scores/${currentWeek}/_init`] = null;
        update(ref(db), updates).then(() => {
            push(ref(db, 'app4/logs'), `[${new Date().toLocaleString()}] IMPORT GLOBAL: ${count} scores ajoutés sur ${day} (${currentWeek})`);
            alert(`${count} scores enregistrés avec succès pour le ${day}.`);
            closeBulkScoreModal();
        }).catch(console.error);
    } else {
        alert("Aucun score valide trouvé.\nVérifiez le format : \"Pseudo\", 1500000");
    }
}

// --- TRI ET RENDU ---
window.setSort = function(col) {
    if (sortCol === col) {
        if (sortState === "DESC") sortState = "ASC";
        else if (sortState === "ASC") { sortState = "NONE"; sortCol = null; }
        else { sortCol = col; sortState = "DESC"; }
    } else {
        sortCol = col;
        sortState = "DESC";
    }
    renderGrid();
}

function formatScore(num) {
    if (!num || num === 0) return `<span style="opacity:0.3">-</span>`;
    if (num >= 1000000) return (num / 1000000).toFixed(2).replace(/\.00$/, '') + " M";
    if (num >= 1000) return (num / 1000).toFixed(0) + " k";
    return num.toString();
}

function getScoreClass(num) {
    if (!num || num === 0) return '';
    if (num >= 15000000) return 'score-dark-green'; 
    if (num >= 7200000) return 'score-green';       
    if (num >= 3600000) return 'score-yellow';      
    return 'score-red';                             
}

function getSortIcon(col) {
    if (sortCol !== col || sortState === "NONE") return '';
    return sortState === "ASC" ? ' ↑' : ' ↓';
}

window.renderGrid = function() {
    const tableHeader = document.getElementById('scoreTableHeader');
    const tableBody = document.getElementById('tableBody');
    const search = document.getElementById('searchPlayer').value.toLowerCase();

    // 1. En-têtes avec icônes de tri dynamiques
    let theadHTML = `<tr>
        <th class="sticky-col sortable-th" onclick="setSort('RANK')">Joueur${getSortIcon('RANK')}</th>`;
    DAYS.forEach(d => {
        theadHTML += `<th class="sortable-th" onclick="setSort('${d}')">${d}${getSortIcon(d)}</th>`;
    });
    theadHTML += `<th class="sortable-th" style="color: var(--vip-color);" onclick="setSort('TOTAL')">TOTAL${getSortIcon('TOTAL')}</th></tr>`;
    tableHeader.innerHTML = theadHTML;

    tableBody.innerHTML = '';

    if (!currentWeek || !allScores[currentWeek]) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">Sélectionnez ou créez une semaine.</td></tr>`;
        return;
    }

    const weekData = allScores[currentWeek];

    // 2. Filtrage (Exclusion des ABS) et calculs
    let playersData = members
        .filter(m => m.rank !== 'ABS' && (!search || m.name.toLowerCase().includes(search)))
        .map(m => {
            const pScores = weekData[m.name] || {};
            let total = 0;
            DAYS.forEach(d => { total += (pScores[d] || 0); });
            return { member: m, scores: pScores, total: total };
        });

    // 3. Logique de tri 3 états
    playersData.sort((a, b) => {
        if (sortCol && sortState !== "NONE") {
            let valA, valB;
            if (sortCol === 'TOTAL') { valA = a.total; valB = b.total; }
            else if (sortCol === 'RANK') { valA = RANK_POWER[a.member.rank]; valB = RANK_POWER[b.member.rank]; }
            else { valA = a.scores[sortCol] || 0; valB = b.scores[sortCol] || 0; }

            if (valA !== valB) {
                return sortState === 'ASC' ? valA - valB : valB - valA;
            }
        }
        // Tri par défaut (Rang puis Alphabétique)
        const diffRank = RANK_POWER[b.member.rank] - RANK_POWER[a.member.rank];
        return diffRank !== 0 ? diffRank : a.member.name.localeCompare(b.member.name);
    });

    if(playersData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">Aucun joueur trouvé.</td></tr>`;
        return;
    }

    playersData.forEach(p => {
        const m = p.member;
        const isActive = p.total > 0 ? "color: white;" : "color: #888;";

        let rowHTML = `
            <tr>
                <td class="player-cell sticky-col">
                    <span class="rank-mini-badge">${m.rank}</span>
                    <span class="player-name" style="${isActive}">${m.name}</span>
                </td>
        `;

        DAYS.forEach(d => {
            const val = p.scores[d] || 0;
            const colorClass = getScoreClass(val);
            rowHTML += `
                <td>
                    <div class="score-cell ${colorClass}" onclick="openScoreModal('${m.name}', '${d}')">
                        ${formatScore(val)}
                    </div>
                </td>
            `;
        });

        rowHTML += `
            <td style="font-weight:bold; font-size:1.1em; background: rgba(255, 215, 0, 0.05); color: var(--vip-color);">
                ${formatScore(p.total)}
            </td>
        </tr>`;

        tableBody.innerHTML += rowHTML;
    });
}

// --- SAUVEGARDE AUTO SILENCIEUSE DISCORD ---
function silentAutoBackupApp4() {
    const sysRef = ref(db, 'app4/system/lastBackupDate');
    get(sysRef).then(async (snapshot) => {
        const lastDate = snapshot.val();
        const today = new Date().toISOString().split('T')[0];
        if (lastDate !== today) {
            
            // Écrit un snapshot statique dans Firebase (totalement invisible)
            const backupName = `scores_snap_${today}`;
            set(ref(db, `app4/backups/${backupName}`), { scores: allScores, savedAt: new Date().toLocaleString() });

            // Envoi le fichier JSON sur Discord
            const backupData = {
                type: "Automatique",
                date: new Date().toLocaleString(),
                scores: allScores
            };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const formData = new FormData();
            formData.append('file', blob, `backup_app4_${today}.json`);
            formData.append('payload_json', JSON.stringify({ content: `🏆 **Backup App 4 (Scores)**` }));
            
            try { await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData }); } catch(e){}
            
            set(sysRef, today);
        }
    }).catch(console.error);
}