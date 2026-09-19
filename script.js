const state = {
    films: [],
    history: [],
    currentMatch: null,
    finished: false,
};

const $ = (selector) => document.querySelector(selector);

async function loadFilms() {
    const response = await fetch("./data/films.json");

    if (!response.ok) {
        throw new Error(
            `Errore HTTP ${response.status}`
        );
    }

    return await response.json();
}

function getFilmById(id) {
    return state.films.find(film => film.Id === id);
}
function getFilmByTitle(title) { 
    return state.films.find(film => film.title === title);
} 
function getBeatenTitles(prm) {
    
    let film = null;
    switch (typeof prm) {
        case 'number': film = getFilmById(prm); break;
        case 'string': film = getFilmByTitle(prm); break;
        case 'object': film = prm; break;
        default: return undefined;
    }

    if (!film) { return undefined; }

    const beatenTitles = [...film.beats]
        .map(beatenId => getFilmById(beatenId).title);

    return beatenTitles;
}

function areComparableFilms(filmA, filmB) {
    return (
        filmA.beats.has(filmB.Id) ||
        filmA.beatenBy.has(filmB.Id)
    );
}

function getIncomparablePairs() {
    const pairs = [];

    for (let i = 0; i < state.films.length; i++) {
        for (let j = i + 1; j < state.films.length; j++) {
            const filmA = state.films[i];
            const filmB = state.films[j];

            if (!areComparableFilms(filmA, filmB)) {
                pairs.push([filmA, filmB]);
            }
        }
    }

    return pairs;
}

async function init() {
    
    let FILMS = [];
    try {
        FILMS = await loadFilms(); 
    } catch (error) {
        console.error("Errore caricamento films.json:", error);
        showError("Impossibile caricare il database dei film.");
        return;
    }
    
    state.films = FILMS
        .filter(film => film.include)
        .map((film, index) => ({
            ...film,

            Id: index + 1,
            
            // Relazioni dirette
            directBeats: new Set(),

            // Relazioni dirette + transitive
            beats: new Set(),
            beatenBy: new Set(),
        }));

    if (state.films.length < 2) {
        return showError("Inserisci almeno 2 film nell'array.");
    }

    const titles = state.films.map(f => f.title.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) {
        return showError("Hai inserito almeno un titolo duplicato.");
    }

    const ids = state.films.map(f => f.Id);
    if (new Set(ids).size !== ids.length) {
        return showError("Hai inserito almeno un Id duplicato.");
    }
    if (state.films.some(f => !Number.isInteger(f.Id) || f.Id < 1)) {
        return showError("Tutti gli Id dei film devono essere numeri interi positivi.");
    }

    $("#error").hidden = true;
    startNextComparison();
}

function startNextComparison(pair = null) {

    let match;

    if (pair) {
        const filmA = getFilmById(pair[0]);
        const filmB = getFilmById(pair[1]);

        if (!filmA || !filmB) {
            return;
        }

        match = [filmA, filmB];

    } else {
        match = getNextComparison();

        if (!match) {
            finishTournament();
            return;
        }
    }

    state.currentMatch = match;
    render.main();
}

function chooseWinner(index) {
    const match = state.currentMatch;

    if (!match) return;

    const winner = match[index];
    const loser = match[1 - index];

    winner.directBeats.add(loser.Id);

    state.history.push({
        filmAId: match[0].Id,
        filmBId: match[1].Id,
        winnerId: winner.Id,
        loserId: loser.Id,
    });

    rebuildTransitiveRelations();

    state.currentMatch = null;

    startNextComparison();
}

function rebuildTransitiveRelations() {

    // Azzero i set che includono confronti transitivi
    state.films.forEach(film => {
        film.beats.clear();
        film.beatenBy.clear();
    });

    state.films.forEach(film => {

        const visited = new Set();

        // Visito tutti gli avversari che ho già battuto e aggiungo gli avversari
        // che loro hanno battuto
        const stack = [...film.directBeats];
        while (stack.length > 0) {
            const opponentId = stack.pop();

            if (visited.has(opponentId)) {
                continue;
            }

            visited.add(opponentId);

            const opponent = getFilmById(opponentId);
            if (!opponent) { continue; }

            // Se ho raggiunto un film, vuol dire che sono sicuro che lo batterei
            film.beats.add(opponentId);

            // E viceversa, lui sarebbe sicuramente battuto da me
            opponent.beatenBy.add(film.Id);

            // Se ho sconfitto un avversario A, controllo anche tutti gli avversari che
            // A ha sconfitto, perché significa che batterei anche loro
            opponent.directBeats.forEach(opponentBeatenId => {
                if (!visited.has(opponentBeatenId)) {
                    stack.push(opponentBeatenId);
                }
            })
        }
    });
}

function getNextComparison() {
    const pairs = getIncomparablePairs();

    if (pairs.length === 0) {
        return null;
    }

    pairs.sort((pairA, pairB) => {
        const distanceA =
            Math.abs(pairA[0].beats.size - pairA[1].beats.size);

        const distanceB =
            Math.abs(pairB[0].beats.size - pairB[1].beats.size);

        return distanceA - distanceB;
    });

    const bestDistance =
        Math.abs(pairs[0][0].beats.size - pairs[0][1].beats.size);

    const bestPairs = [];

    for (const pair of pairs) {
        const distance =
            Math.abs(pair[0].beats.size - pair[1].beats.size);

        if (distance !== bestDistance) {
            break;
        }

        bestPairs.push(pair);
    }

    return bestPairs[
        Math.floor(Math.random() * bestPairs.length)
    ];
}

function undoLastComparison() {
    if (state.history.length === 0) {
        return;
    }

    const lastMatch = state.history.pop();

    const winner = getFilmById(lastMatch.winnerId);
    const loser = getFilmById(lastMatch.loserId);

    if (!winner || !loser) {
        return;
    }

    winner.directBeats.delete(loser.Id);

    rebuildTransitiveRelations();

    state.finished = false;

    startNextComparison([
        lastMatch.filmAId,
        lastMatch.filmBId
    ]);
}
$("#undo-comparison").onclick = undoLastComparison;

function getStandings() {
    return [...state.films].sort((a, b) => {

        // Se A ha battuto B, A deve stare sopra B
        if (a.beats.has(b.Id)) {
            return -1;
        }

        // Se B ha battuto A, B deve stare sopra A
        if (b.beats.has(a.Id)) {
            return 1;
        }

        // Se non sono direttamente/transitivamente confrontabili,
        // usiamo il numero di film sicuramente sopra
        return a.beatenBy.size - b.beatenBy.size;
    });
}

const render = {

    main: function() {
        const [a, b] = state.currentMatch;

        $("#match-counter").textContent = `Confronto numero ${state.history.length + 1}`;

        render.filmCard(a, "a");
        render.filmCard(b, "b");

        $("#winner-a").onclick = () => chooseWinner(0);
        $("#winner-b").onclick = () => chooseWinner(1);

        $("#info-a").onclick = () => showFilmInfo(a);
        $("#info-b").onclick = () => showFilmInfo(b);

        render.progress();
        render.standings();

        $("#tournament").hidden = false;
        $("#final").hidden = true;
    },

    filmCard: function(film, suffix) {
        $(`#film-${suffix}`).textContent =
            film.title;

        $(`#year-${suffix}`).textContent =
            film.year;

        $(`#studio-${suffix}`).textContent =
            film.studio;

        $(`#runtime-${suffix}`).textContent =
            `${film.runtime} min`;

        // Gestione locandina
        const poster = $(`#poster-${suffix}`);
        poster.src = film.src;
        poster.alt = `Locandina di ${film.title}`;

        const genres = $(`#genres-${suffix}`);
        genres.innerHTML = "";

        film.genres.forEach(genre => {
            const tag = document.createElement("span");

            tag.className = "genre";
            tag.textContent = genre;

            genres.appendChild(tag);
        });
    },

    progress: function() {

        const films = state.films;
        
        let rankedFilms = 0;
        films.forEach(film => {
            if (film.beats.size + film.beatenBy.size === films.length - 1) {
                rankedFilms++;
            }
        })

        const percentage =
            Math.round((rankedFilms / films.length) * 100);

        $("#progress-bar").style.width =
            `${percentage}%`;

        $("#progress-text").textContent =
            `${rankedFilms} / ${films.length} film classificati`;
    },

    standings: function() {
        const body = $("#standings-body");
        body.innerHTML = "";

        getStandings().forEach((film, index) => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(film.title)}</td>
                <td>${film.beats.size}</td>
                <td>${film.beatenBy.size}</td>
            `;

            body.appendChild(row);
        });
    },

};

function showFilmInfo(film) {
    $("#modal-title").textContent =
        film.title;

    $("#modal-original-title").textContent =
        film.originalTitle;

    $("#modal-year").textContent =
        film.year;

    $("#modal-studio").textContent =
        film.studio;

    $("#modal-production").textContent =
        film.productionCompanies.join(", ");

    $("#modal-country").textContent =
        film.country.join(", ");

    $("#modal-runtime").textContent =
        `${film.runtime} minuti`;

    $("#modal-animation").textContent =
        film.animation;

    $("#modal-director").textContent =
        film.director.join(", ");

    $("#modal-genres").textContent =
        film.genres.join(", ");

    $("#modal-source").textContent =
        film.source;

    $("#film-modal").hidden = false;
}

function closeFilmInfo() {
    $("#film-modal").hidden = true;
}

$("#close-film-modal").onclick = closeFilmInfo;

$("#film-modal").addEventListener("click", function(event) {
    if (event.target === $("#film-modal")) {
        closeFilmInfo();
    }
});


function finishTournament() {
    state.finished = true;

    $("#tournament").hidden = true;
    $("#final").hidden = false;

    const body = $("#final-body");
    body.innerHTML = "";

    getStandings().forEach((film, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHtml(film.title)}</td>
            <td>${film.beats.size}</td>
            <td>${film.beatenBy.size}</td>
        `;

        body.appendChild(row);
    });

    $("#final-rounds").textContent =
        `${state.history.length} confronti effettuati`;
}

function getTopResults(count) {

    const standings = getStandings();

    const limit = Math.min(count, standings.length);

    return standings
        .slice(0, limit)
        .map((film, index) => {
            return `${index + 1}. ${film.title}`;
        })
        .join("\n");
}

$("#copy-top-results").onclick = async function() {

    const count = Number($("#top-count").value);

    if (!Number.isInteger(count) || count < 1) {
        return;
    }

    const results = getTopResults(count);

    await navigator.clipboard.writeText(results);
};

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function resetTournament() {
    location.reload();
}

function showError(message) {
    $("#error").textContent = message;
    $("#error").hidden = false;
    $("#tournament").hidden = true;
    $("#final").hidden = true;
}

window.addEventListener("DOMContentLoaded", init);