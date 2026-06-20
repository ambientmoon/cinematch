// CineMatch — 영화 취향 기반 추천 (정적, 브라우저 전용)

let MOVIES = [];

const els = {
  input: document.getElementById("searchInput"),
  suggestions: document.getElementById("suggestions"),
  selectedSection: document.getElementById("selectedSection"),
  selectedCard: document.getElementById("selectedCard"),
  recSection: document.getElementById("recSection"),
  recGrid: document.getElementById("recGrid"),
  resetBtn: document.getElementById("resetBtn"),
};

// 포스터: 외부 이미지에 의존하지 않고 영화별 고유 색상의 카드를 생성.
// (TMDB 등 외부 hotlink는 환경에 따라 차단될 수 있어, 항상 동일하게 뜨도록 자체 생성)
const PALETTES = [
  ["#3a2d5c", "#7b5ea7"], ["#1f3a4d", "#3f8ca8"], ["#4d2a2a", "#a85f5f"],
  ["#2a4d3a", "#5fa87b"], ["#4d422a", "#a8915f"], ["#3a2a4d", "#8a5fa8"],
  ["#2a3a4d", "#5f7ba8"], ["#4d2a42", "#a85f8a"],
];

function hashTitle(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h;
}

function posterImg(movie, cls = "") {
  const [c1, c2] = PALETTES[hashTitle(movie.title) % PALETTES.length];
  const initials = movie.title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("");
  const gid = "g" + (hashTitle(movie.title) % 100000);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 300'>
    <defs><linearGradient id='${gid}' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
    </linearGradient></defs>
    <rect width='200' height='300' fill='url(#${gid})'/>
    <text x='100' y='150' fill='rgba(255,255,255,0.92)' font-family='Bebas Neue, Arial, sans-serif'
      font-size='72' font-weight='bold' text-anchor='middle' dominant-baseline='middle'>${initials}</text>
    <text x='100' y='280' fill='rgba(255,255,255,0.55)' font-family='Arial, sans-serif'
      font-size='13' text-anchor='middle'>${movie.year}</text>
  </svg>`;

  const img = document.createElement("img");
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  img.alt = `${movie.title} 포스터`;
  if (cls) img.className = cls;
  return img;
}

// ---------- 데이터 로드 ----------
async function loadMovies() {
  try {
    const res = await fetch("movies.json");
    if (!res.ok) throw new Error("movies.json을 불러오지 못했습니다.");
    MOVIES = await res.json();
  } catch (err) {
    els.input.disabled = true;
    els.input.placeholder = "영화 데이터를 불러오지 못했어요";
    console.error(err);
  }
}

// ---------- 유사도 계산 ----------
// 겹치는 장르 + 겹치는 키워드 개수로 점수화 (장르 가중치 2, 키워드 1)
function overlap(a, b) {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

function similarity(base, other) {
  const sharedGenres = overlap(base.genres, other.genres);
  const sharedKeywords = overlap(base.keywords, other.keywords);
  const score = sharedGenres.length * 2 + sharedKeywords.length;
  return { score, sharedGenres, sharedKeywords };
}

function recommend(base) {
  return MOVIES.filter((m) => m.title !== base.title)
    .map((m) => ({ movie: m, ...similarity(base, m) }))
    .sort((a, b) => b.score - a.score || b.movie.year - a.movie.year)
    .slice(0, 3);
}

// 추천 이유 한 문장 생성
function reasonText(sharedGenres, sharedKeywords) {
  if (sharedGenres.length && sharedKeywords.length) {
    return `<strong>${sharedGenres.join("·")}</strong> 장르가 겹치고, 분위기도 비슷해요`;
  }
  if (sharedGenres.length) {
    return `<strong>${sharedGenres.join("·")}</strong> 장르가 겹쳐요`;
  }
  if (sharedKeywords.length) {
    return `비슷한 키워드(<strong>${sharedKeywords.slice(0, 2).join(", ")}</strong>)를 공유해요`;
  }
  return "전체 영화 중 가장 가까운 작품이에요";
}

// ---------- 렌더링 ----------
function renderSelected(movie) {
  els.selectedCard.innerHTML = "";
  els.selectedCard.appendChild(posterImg(movie));

  const info = document.createElement("div");
  info.className = "info";
  info.innerHTML = `
    <h3>${movie.title}</h3>
    <p class="meta">${movie.year} · 감독 ${movie.director}</p>
    <p class="overview">${movie.overview}</p>
    <div class="tags">${movie.genres.map((g) => `<span class="tag">${g}</span>`).join("")}</div>
  `;
  els.selectedCard.appendChild(info);
  els.selectedSection.hidden = false;
}

function renderRecommendations(recs) {
  els.recGrid.innerHTML = "";
  recs.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "rec-card";

    card.appendChild(posterImg(r.movie));

    const body = document.createElement("div");
    body.className = "rec-body";
    body.innerHTML = `
      <span class="rec-rank">#${i + 1}</span>
      <h4>${r.movie.title}</h4>
      <p class="rec-why">${reasonText(r.sharedGenres, r.sharedKeywords)}</p>
    `;
    card.appendChild(body);
    els.recGrid.appendChild(card);
  });
  els.recSection.hidden = false;
}

function selectMovie(movie) {
  els.input.value = movie.title;
  closeSuggestions();
  renderSelected(movie);
  renderRecommendations(recommend(movie));
  els.selectedSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 자동완성 ----------
let activeIndex = -1;

function openSuggestions(list) {
  els.suggestions.innerHTML = "";
  activeIndex = -1;

  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "일치하는 영화가 없어요";
    els.suggestions.appendChild(li);
  } else {
    list.forEach((m) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.innerHTML = `<span>${m.title}</span><span class="year">${m.year}</span>`;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); selectMovie(m); });
      els.suggestions.appendChild(li);
    });
  }
  els.suggestions.classList.add("open");
}

function closeSuggestions() {
  els.suggestions.classList.remove("open");
  els.suggestions.innerHTML = "";
  activeIndex = -1;
}

function handleInput() {
  const q = els.input.value.trim().toLowerCase();
  if (!q) { closeSuggestions(); return; }
  const matches = MOVIES.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 8);
  openSuggestions(matches);
}

function handleKeydown(e) {
  const items = [...els.suggestions.querySelectorAll("li:not(.empty)")];
  if (!els.suggestions.classList.contains("open") || items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    const q = els.input.value.trim().toLowerCase();
    const exact = MOVIES.find((m) => m.title.toLowerCase() === q);
    if (activeIndex >= 0) {
      items[activeIndex].dispatchEvent(new Event("mousedown"));
    } else if (exact) {
      selectMovie(exact);
    } else {
      const first = MOVIES.find((m) => m.title.toLowerCase().includes(q));
      if (first) selectMovie(first);
    }
    return;
  } else if (e.key === "Escape") {
    closeSuggestions();
    return;
  } else {
    return;
  }
  items.forEach((it, i) => it.classList.toggle("active", i === activeIndex));
}

// ---------- 초기화 ----------
function init() {
  els.input.addEventListener("input", handleInput);
  els.input.addEventListener("keydown", handleKeydown);
  els.input.addEventListener("focus", handleInput);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) closeSuggestions();
  });
  els.resetBtn.addEventListener("click", () => {
    els.input.value = "";
    els.selectedSection.hidden = true;
    els.recSection.hidden = true;
    els.input.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

loadMovies().then(init);
