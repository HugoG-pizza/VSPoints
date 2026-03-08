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
let aliases = {}; // Dictionnaire { "alias_minuscule": "Vrai Nom" }
let currentWeek = ""; 

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

    // Écoute du Dictionnaire
    onValue(ref(db, 'app4/aliases'), (snapshot) => {
        aliases = snapshot.val() || {};
        renderAliasList(); // Met à jour l'UI de la modale Dico si elle est ouverte
    });
}

// ==========================================
// GESTION DES SEMAINES (CRÉER / SUPPRIMER)
// ==========================================

function updateWeekSelector() {
    const select = document.getElementById('weekSelect');
    const weeks = Object.keys(allScores).filter(k => k !== '_init').sort((a, b) => b.localeCompare(a));
    
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

window.openNewWeekModal = function() {
    if (!auth.currentUser) return;
    document.getElementById('newWeekName').value = "INJW"; 
    document.getElementById('newWeekDate').valueAsDate = new Date();
    document.getElementById('newWeekModal').style.display = 'flex';
}

window.closeNewWeekModal = function() { document.getElementById('newWeekModal').style.display = 'none'; }

window.confirmNewWeek = function() {
    if (!auth.currentUser) return;

    const weekName = document.getElementById('newWeekName').value.trim();
    const dateVal = document.getElementById('newWeekDate').value;
    if (!weekName || !dateVal) { alert("Remplissez tous les champs."); return; }

    const selectedDate = new Date(dateVal);
    const dayOfWeek = selectedDate.getDay() || 7; 
    
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - dayOfWeek + 1);
    
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    
    const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}`;
    const dateSuffix = `${formatDate(monday)} au ${formatDate(saturday)}`;
    const safeName = `${weekName} - ${dateSuffix}`;

    if (allScores[safeName]) { alert("Cette semaine existe déjà."); return; }
    
    update(ref(db, `app4/scores/${safeName}`), { _init: true }).then(() => {
        currentWeek = safeName;
        push(ref(db, 'app4/logs'), `[${new Date().toLocaleString()}] Création: ${safeName}`);
        closeNewWeekModal();
    }).catch(error => {
        alert("Erreur. Le nom contient peut-être des caractères interdits (#, $, [, ], .)");
    });
}

window.deleteCurrentWeek = function() {
    if (!auth.currentUser || !currentWeek) return;

    // TRIPLE VÉRIFICATION
    if (!confirm(`⚠️ ATTENTION ⚠️\nVous allez supprimer TOUTE la semaine : ${currentWeek}\nContinuer ?`)) return;
    if (!confirm(`Êtes-vous VRAIMENT sûr ?\nTous les scores de cette semaine seront perdus définitivement.`)) return;
    
    const check = prompt(`Tapez "SUPPRIMER" en majuscules pour confirmer :`);
    if (check === "SUPPRIMER") {
        update(ref(db), { [`app4/scores/${currentWeek}`]: null }).then(() => {
            push(ref(db, 'app4/logs'), `[${new Date().toLocaleString()}] SUPPRESSION SEMAINE: ${currentWeek}`);
            alert(`La semaine ${currentWeek} a été supprimée.`);
            currentWeek = ""; // Forcera la sélection de la semaine suivante
        });
    } else {
        alert("Suppression annulée.");
    }
}

// ==========================================
// EXPORT CSV
// ==========================================
window.exportToCSV = function() {
    if (!currentWeek || !allScores[currentWeek]) {
        alert("Aucune donnée à exporter pour cette semaine.");
        return;
    }

    const weekData = allScores[currentWeek];
    
    // En-têtes CSV (Séparateur ; pour Excel FR)
    let csvContent = "\uFEFF"; // BOM pour forcer Excel à lire l'UTF-8
    csvContent += "Joueur;Rang;J1;J2;J3;J4;J5;J6;TOTAL\n";

    // Préparer les données (avec filtres ABS)
    let exportData = members.filter(m => m.rank !== 'ABS').map(m => {
        const pScores = weekData[m.name] || {};
        let total = 0;
        let rowScores = [];
        DAYS.forEach(d => { 
            let val = pScores[d] || 0;
            total += val; 
            rowScores.push(val);
        });
        return { name: m.name, rank: m.rank, scores: rowScores, total: total };
    });

    // Tri par total
    exportData.sort((a, b) => b.total - a.total);

    // Remplissage CSV
    exportData.forEach(p => {
        csvContent += `${p.name};${p.rank};${p.scores.join(';')};${p.total}\n`;
    });

    // Téléchargement
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Scores_${currentWeek}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// GESTION DU DICTIONNAIRE (ALIAS)
// ==========================================
window.openAliasModal = function() {
    // Remplir le selecteur de Vrais Noms
    const select = document.getElementById('newAliasRealName');
    select.innerHTML = '';
    
    // On trie les membres par ordre alphabétique pour que ce soit facile à trouver
    let sortedMembers = [...members].filter(m => m.rank !== 'ABS').sort((a, b) => a.name.localeCompare(b.name));
    sortedMembers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.innerText = m.name;
        select.appendChild(opt);
    });

    document.getElementById('newAliasName').value = '';
    renderAliasList();
    document.getElementById('aliasModal').style.display = 'flex';
}

window.closeAliasModal = function() { document.getElementById('aliasModal').style.display = 'none'; }

window.addAlias = function() {
    if (!auth.currentUser) return;
    const aliasRaw = document.getElementById('newAliasName').value.trim();
    const realName = document.getElementById('newAliasRealName').value;

    if (!aliasRaw || !realName) return;

    // L'alias est stocké en minuscule pour faciliter la recherche lors de l'import
    const aliasLower = aliasRaw.toLowerCase();

    update(ref(db), { [`app4/aliases/${aliasLower}`]: realName }).then(() => {
        document.getElementById('newAliasName').value = '';
    });
}

window.deleteAlias = function(aliasKey) {
    if (!auth.currentUser) return;
    update(ref(db), { [`app4/aliases/${aliasKey}`]: null });
}

function renderAliasList() {
    const container = document.getElementById('aliasListContainer');
    if (!container) return;
    container.innerHTML = '';

    const keys = Object.keys(aliases);
    if (keys.length === 0) {
        container.innerHTML = '<span style="color:#666; font-size:0.9em;">Le dictionnaire est vide.</span>';
        return;
    }

    keys.forEach(alias => {
        const realName = aliases[alias];
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#333; padding:8px; border-radius:4px; margin-bottom:5px;">
                <div>
                    <span style="color:#aaa; font-style:italic;">"${alias}"</span> ➔ <strong style="color:white;">${realName}</strong>
                </div>
                <button class="btn-delete" style="padding:4px 8px; margin:0;" onclick="deleteAlias('${alias}')">X</button>
            </div>
        `;
    });
}

// ==========================================
// SAISIE INDIVIDUELLE ET BULK
// ==========================================
window.openScoreModal = function(playerName, day) {
    if (!auth.currentUser || !currentWeek) return;
    const pScores = (allScores[currentWeek] && allScores[currentWeek][playerName]) ? allScores[currentWeek][playerName] : {};
    document.getElementById('editScorePlayer').innerText = playerName;
    document.getElementById('editScoreDay').innerText = day;
    document.getElementById('editScoreValue').value = pScores[day] || "";
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

    update(ref(db), updates);
    closeScoreModal();
}

// ==========================================
// SAISIE GLOBALE (BULK) AVEC CALCUL J6
// ==========================================

// Affiche ou cache le toggle de calcul selon le jour
window.toggleBulkMode = function() {
    const day = document.getElementById('bulkScoreDay').value;
    const container = document.getElementById('bulkTotalModeContainer');
    if (day === 'J6') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
        document.getElementById('bulkTotalModeToggle').checked = false;
    }
}

window.openBulkScoreModal = function() {
    if (!currentWeek) { alert("Sélectionnez ou créez une semaine d'abord."); return; }
    document.getElementById('bulkScoreTextarea').value = '';
    document.getElementById('bulkScoreDay').value = 'J1'; // Remet J1 par défaut
    window.toggleBulkMode(); // Cache le toggle
    document.getElementById('bulkScoreModal').style.display = 'flex';
}

window.closeBulkScoreModal = function() { document.getElementById('bulkScoreModal').style.display = 'none'; }

window.processBulkScores = function() {
    if (!currentWeek) return;
    const text = document.getElementById('bulkScoreTextarea').value;
    const day = document.getElementById('bulkScoreDay').value;
    const isTotalMode = document.getElementById('bulkTotalModeToggle').checked;
    
    if (!text.trim()) return;

    const updates = {};
    let count = 0;
    let notFoundList = [];

    // Regex pour trouver ("Pseudo", Score) ou (Pseudo, Score)
    const regex = /(?:"([^"]+)"|([^",\n]+))\s*,\s*([\d\s,]+)/g;
    const matches = [...text.matchAll(regex)];

    matches.forEach(match => {
        let pseudoStr = (match[1] || match[2]).trim().toLowerCase();
        let scoreStr = match[3].replace(/[\s,]/g, ''); // Nettoie le score
        let importedScore = parseInt(scoreStr, 10);
        
        if (!isNaN(importedScore)) {
            let targetName = null;

            // 1. Recherche Directe
            const directMatch = members.find(x => x.name.toLowerCase() === pseudoStr);
            if (directMatch) {
                targetName = directMatch.name;
            } 
            // 2. Recherche Dictionnaire (Alias)
            else if (aliases[pseudoStr]) {
                targetName = aliases[pseudoStr];
            }

            // Enregistrement
            if (targetName) {
                let finalScoreToSave = importedScore;

                // LOGIQUE J6 : CALCUL INVERSÉ
                if (isTotalMode && day === 'J6') {
                    const pScores = (allScores[currentWeek] && allScores[currentWeek][targetName]) ? allScores[currentWeek][targetName] : {};
                    let sumJ1toJ5 = 0;
                    ["J1", "J2", "J3", "J4", "J5"].forEach(d => { 
                        sumJ1toJ5 += (pScores[d] || 0); 
                    });
                    
                    finalScoreToSave = importedScore - sumJ1toJ5;
                    if (finalScoreToSave < 0) finalScoreToSave = 0; // Sécurité anti-négatif
                }

                updates[`app4/scores/${currentWeek}/${targetName}/${day}`] = finalScoreToSave;
                count++;
            } else {
                notFoundList.push(pseudoStr);
            }
        }
    });

    if (Object.keys(updates).length > 0) {
        updates[`app4/scores/${currentWeek}/_init`] = null;
        update(ref(db), updates).then(() => {
            push(ref(db, 'app4/logs'), `[${new Date().toLocaleString()}] BULK: ${count} scores (${day}${isTotalMode ? ' via Total' : ''})`);
            
            let msg = `${count} scores enregistrés.`;
            if (notFoundList.length > 0) {
                msg += `\n\n⚠️ ${notFoundList.length} pseudos non reconnus :\n` + notFoundList.slice(0, 10).join(', ');
                if (notFoundList.length > 10) msg += " ...";
                msg += "\n\n-> Pensez à les ajouter dans le Dico !";
            }
            alert(msg);
            closeBulkScoreModal();
        });
    } else {
        alert("Aucun score valide trouvé.");
    }
}

// ==========================================
// TRI ET RENDU
// ==========================================
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

    // 2. CALCULS PUIS FILTRAGE INTELLIGENT DES ABS
    let playersData = members.map(m => {
        // On calcule d'abord les scores de tout le monde
        const pScores = weekData[m.name] || {};
        let total = 0;
        DAYS.forEach(d => { total += (pScores[d] || 0); });
        return { member: m, scores: pScores, total: total };
    }).filter(p => {
        // Filtre Recherche
        if (search && !p.member.name.toLowerCase().includes(search)) return false;
        
        // NOUVEAU Filtre ABS : on cache le joueur s'il est ABS ET qu'il a 0 point
        if (p.member.rank === 'ABS' && p.total === 0) return false;
        
        return true;
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

    // 4. Affichage
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
                    <span class="rank-mini-badge ${m.rank === 'ABS' ? 'abs-badge' : ''}">${m.rank}</span>
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

// ==========================================
// SAUVEGARDE AUTO DISCORD
// ==========================================
function silentAutoBackupApp4() {
    const sysRef = ref(db, 'app4/system/lastBackupDate');
    get(sysRef).then(async (snapshot) => {
        const lastDate = snapshot.val();
        const today = new Date().toISOString().split('T')[0];
        if (lastDate !== today) {
            const backupName = `scores_snap_${today}`;
            set(ref(db, `app4/backups/${backupName}`), { scores: allScores, savedAt: new Date().toLocaleString() });

            const backupData = { type: "Automatique", date: new Date().toLocaleString(), scores: allScores };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const formData = new FormData();
            formData.append('file', blob, `backup_app4_${today}.json`);
            formData.append('payload_json', JSON.stringify({ content: `🏆 **Backup App 4 (Scores)**` }));
            
            try { await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData }); } catch(e){}
            set(sysRef, today);
        }
    }).catch(console.error);
}