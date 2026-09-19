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

function recordOf(film) {
    return `${film.wins}-${film.losses}`;
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
        .map(film => ({
            ...film,
            wins: 0,
            losses: 0,
            
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

function startNextComparison() {

    const match = getNextComparison();
    if (!match) {
        finishTournament();
        return;
    }

    state.currentMatch = match;
    render.main();
}

function chooseWinner(index) {
    const match = state.currentMatch;

    if (!match) return;

    const winner = match[index];
    const loser = match[1 - index];

    winner.wins++;
    loser.losses++;

    winner.directBeats.add(loser.Id);

    state.history.push({
        winner,
        loser
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

    if (pairs.length === 0) { return null; }

    /*
     * Preferiamo coppie che sembrano vicine
     * nella classifica attuale.
     *
     * beats.size rappresenta quanti film
     * abbiamo già dimostrato essere inferiori.
     */
    pairs.sort((pairA, pairB) => {
        const [filmA1, filmB1] = pairA;
        const [filmA2, filmB2] = pairB;

        const distance1 = Math.abs(filmA1.beats.size - filmB1.beats.size);
        const distance2 = Math.abs(filmA2.beats.size - filmB2.beats.size);

        return distance1 - distance2;
    });

    return pairs[0];
}

function getStandings() {
    return [...state.films].sort((a, b) => {
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

        $(`#record-${suffix}`).textContent =
            recordOf(film);

        $(`#year-${suffix}`).textContent =
            film.year;

        $(`#studio-${suffix}`).textContent =
            film.studio;

        $(`#runtime-${suffix}`).textContent =
            `${film.runtime} min`;

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

        let previousRecord = null;

        getStandings().forEach((film, index) => {
            const record = recordOf(film);
            const isNewRecord = record !== previousRecord;

            const row = document.createElement("tr");

            if (isNewRecord && index > 0) {
                row.classList.add("record-separator");
            }

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(film.title)}</td>
                <td><strong>${record}</strong></td>
                <td>${film.wins}</td>
                <td>${film.losses}</td>
            `;

            body.appendChild(row);

            previousRecord = record;
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
            <td><strong>${recordOf(film)}</strong></td>
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