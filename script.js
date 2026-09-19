let FILMS = [];
const ROUNDS = null;
const state = {
    films: [],
    round: 1,
    totalRounds: 0,
    currentMatches: [],
    currentMatchIndex: 0,
    history: [],
    finished: false,
};

const $ = (selector) => document.querySelector(selector);

function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function isPowerOfTwo(n) {
    return n >= 2 && (n & (n - 1)) === 0;
}

function recordOf(film) {
    return `${film.wins}-${film.losses}`;
}

function init() {
    state.films = FILMS.filter(f => f.include);

    if (state.films.length < 2) {
        return showError("Inserisci almeno 2 film nell'array FILMS con include = true.");
    }

    if (!isPowerOfTwo(state.films.length)) {
        return showError(
            `Hai inserito ${state.films.length} film. Il numero deve essere una potenza di 2: 2, 4, 8, 16, 32...`
        );
    }

    const titles = state.films.map(f => f.title.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) {
        return showError("Hai inserito almeno un titolo duplicato.");
    }

    state.totalRounds = ROUNDS ?? Math.log2(state.films.length);
    if (!Number.isInteger(state.totalRounds) || state.totalRounds < 1) {
        return showError("ROUNDS deve essere un numero intero positivo.");
    }

    const ids = state.films.map(f => f.Id);
    if (new Set(ids).size !== ids.length) {
        return showError("Hai inserito almeno un Id duplicato.");
    }
    if (state.films.some(f => !Number.isInteger(f.Id) || f.Id < 1)) {
        return showError("Tutti gli Id dei film devono essere numeri interi positivi.");
    }

    state.films.forEach(film => {
        film.wins = 0;
        film.losses = 0;
        film.opponents = new Set();
    });

    $("#error").hidden = true;
    startRound();
}

function startRound() {
    if (state.round > state.totalRounds) {
        finishTournament();
        return;
    }

    state.currentMatches = makeSwissPairings();
    state.currentMatchIndex = 0;

    render.main();
}

function makeSwissPairings() {
    // Primo round: casuale.
    if (state.round === 1) {
        const shuffled = shuffle(state.films);
        const matches = [];

        for (let i = 0; i < shuffled.length; i += 2) {
            matches.push([shuffled[i], shuffled[i + 1]]);
        }

        return matches;
    }

    // Swiss standard:
    // raggruppiamo per record e proviamo ad accoppiare
    // squadre/film con lo stesso record evitando rematch.
    const groups = new Map();

    for (const film of state.films) {
        const record = recordOf(film);

        if (!groups.has(record)) {
            groups.set(record, []);
        }

        groups.get(record).push(film);
    }

    const records = [...groups.keys()].sort((a, b) => {
        const [aw, al] = a.split("-").map(Number);
        const [bw, bl] = b.split("-").map(Number);

        // Prima più vittorie, poi meno sconfitte.
        if (bw !== aw) return bw - aw;
        return al - bl;
    });

    const working = new Map();

    for (const record of records) {
        working.set(record, shuffle(groups.get(record)));
    }

    // Se un gruppo è dispari, trasferiamo un "floater"
    // al record immediatamente inferiore.
    for (let i = 0; i < records.length - 1; i++) {
        const current = working.get(records[i]);
        const next = working.get(records[i + 1]);

        if (current.length % 2 === 1) {
            let candidateIndex = current.length - 1;

            // Preferiamo un film che non abbia già affrontato
            // nessuno del gruppo successivo.
            for (let j = current.length - 1; j >= 0; j--) {
                const candidate = current[j];

                const hasRematch = next.some(opponent =>
                    candidate.opponents.has(opponent.Id)
                );

                if (!hasRematch) {
                    candidateIndex = j;
                    break;
                }
            }

            const [floater] = current.splice(candidateIndex, 1);
            next.push(floater);
        }
    }

    const matches = [];

    // Accoppiamento dentro ogni gruppo.
    for (const record of records) {
        const group = working.get(record);

        while (group.length >= 2) {
            const a = group.shift();

            // Cerchiamo il primo avversario mai affrontato.
            let opponentIndex = group.findIndex(
                film => !a.opponents.has(film.Id)
            );

            // Se non esiste, usiamo comunque un avversario.
            if (opponentIndex === -1) {
                opponentIndex = 0;
            }

            const [b] = group.splice(opponentIndex, 1);
            matches.push([a, b]);
        }
    }

    return matches;
}

function chooseWinner(index) {
    const match = state.currentMatches[state.currentMatchIndex];

    if (!match) return;

    const winner = match[index];
    const loser = match[1 - index];

    winner.wins++;
    loser.losses++;
    winner.opponents.add(loser.Id);
    loser.opponents.add(winner.Id);

    state.history.push({
        round: state.round,
        winner,
        loser
    });

    state.currentMatchIndex++;

    if (state.currentMatchIndex >= state.currentMatches.length) {
        state.round++;

        if (state.round > state.totalRounds) {
            finishTournament();
        } else {
            startRound();
        }
    } else {
        render.main();
    }
}

function getStandings() {
    return [...state.films].sort((a, b) => {
        const winDifference = b.wins - a.wins;

        if (winDifference !== 0) {
            return winDifference;
        }

        return a.losses - b.losses;
    });
}

const render = {

    main: function() {
        const [a, b] =
            state.currentMatches[state.currentMatchIndex];

        $("#round").textContent =
            `Round ${state.round} / ${state.totalRounds}`;

        $("#match-counter").textContent =
            `Match ${state.currentMatchIndex + 1} di ${state.currentMatches.length}`;

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
        const totalMatches =
            state.films.length * state.totalRounds / 2;

        const completed = state.history.length;
        const percentage =
            Math.round((completed / totalMatches) * 100);

        $("#progress-bar").style.width =
            `${percentage}%`;

        $("#progress-text").textContent =
            `${completed} / ${totalMatches} partite completate`;
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
        `${state.totalRounds} round completati · ${state.history.length} partite disputate`;
}

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