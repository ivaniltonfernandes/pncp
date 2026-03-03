const mapData = {
  "Centro-Oeste": [
    { nome: "Goiás", sigla: "GO" },
    { nome: "Mato Grosso", sigla: "MT" },
    { nome: "Mato Grosso do Sul", sigla: "MS" },
    { nome: "Distrito Federal", sigla: "DF" }
  ],
  "Sul": [
    { nome: "Paraná", sigla: "PR" },
    { nome: "Santa Catarina", sigla: "SC" },
    { nome: "Rio Grande do Sul", sigla: "RS" }
  ],
  "Sudeste": [
    { nome: "São Paulo", sigla: "SP" },
    { nome: "Minas Gerais", sigla: "MG" },
    { nome: "Rio de Janeiro", sigla: "RJ" },
    { nome: "Espírito Santo", sigla: "ES" }
  ],
  "Nordeste": [
    { nome: "Bahia", sigla: "BA" }, { nome: "Pernambuco", sigla: "PE" }, { nome: "Ceará", sigla: "CE" },
    { nome: "Maranhão", sigla: "MA" }, { nome: "Paraíba", sigla: "PB" }, { nome: "Rio Grande do Norte", sigla: "RN" },
    { nome: "Alagoas", sigla: "AL" }, { nome: "Piauí", sigla: "PI" }, { nome: "Sergipe", sigla: "SE" }
  ],
  "Norte": [
    { nome: "Amazonas", sigla: "AM" }, { nome: "Pará", sigla: "PA" }, { nome: "Acre", sigla: "AC" },
    { nome: "Roraima", sigla: "RR" }, { nome: "Rondônia", sigla: "RO" }, { nome: "Amapá", sigla: "AP" },
    { nome: "Tocantins", sigla: "TO" }
  ]
};


// ====== Mapa por Regiões (SVG real agrupado) ======

// Mapeamento UF -> Região (para contagens e cores)
const UF_TO_REGION = (() => {
  const out = {};
  Object.keys(mapData).forEach(region => {
    mapData[region].forEach(st => {
      out[String(st.sigla || "").toUpperCase()] = region;
    });
  });
  return out;
})();

// Mapeamento UF -> Nome (para títulos)
const UF_TO_NAME = (() => {
  const out = {};
  Object.keys(mapData).forEach(region => {
    mapData[region].forEach(st => {
      out[String(st.sigla || "").toUpperCase()] = st.nome;
    });
  });
  return out;
})();

function regionSlug(regionName) {
  return normalizePtText(regionName).replaceAll(" ", "-");
}
function regionClass(regionName) {
  return "rm-" + regionSlug(regionName);
}

// ====== SVG do Brasil ======
// 1) Estados (tela de estados)
let _BR_STATES_SVG_MARKUP = null;
let _BR_STATES_SVG_PROMISE = null;

async function getBrazilStatesSvgMarkup() {
  if (_BR_STATES_SVG_MARKUP) return _BR_STATES_SVG_MARKUP;
  if (_BR_STATES_SVG_PROMISE) return _BR_STATES_SVG_PROMISE;

  _BR_STATES_SVG_PROMISE = (async () => {
    try {
      const resp = await fetch('./assets/br-states.svg', { cache: 'force-cache' });
      if (!resp.ok) return null;
      const txt = await resp.text();
      _BR_STATES_SVG_MARKUP = txt;
      return _BR_STATES_SVG_MARKUP;
    } catch (_) {
      return null;
    } finally {
      _BR_STATES_SVG_PROMISE = null;
    }
  })();

  return _BR_STATES_SVG_PROMISE;
}

// 2) Regiões (tela de regiões) – SVG com estados agrupados por região (clique na área da região)
let _BR_REGIONS_SVG_MARKUP = null;
let _BR_REGIONS_SVG_PROMISE = null;

async function getBrazilRegionsSvgMarkup() {
  if (_BR_REGIONS_SVG_MARKUP) return _BR_REGIONS_SVG_MARKUP;
  if (_BR_REGIONS_SVG_PROMISE) return _BR_REGIONS_SVG_PROMISE;

  _BR_REGIONS_SVG_PROMISE = (async () => {
    try {
      const resp = await fetch('./assets/br-regions.svg', { cache: 'force-cache' });
      if (!resp.ok) return null;
      const txt = await resp.text();
      _BR_REGIONS_SVG_MARKUP = txt;
      return _BR_REGIONS_SVG_MARKUP;
    } catch (_) {
      return null;
    } finally {
      _BR_REGIONS_SVG_PROMISE = null;
    }
  })();

  return _BR_REGIONS_SVG_PROMISE;
}

// aplica cores e estados desabilitados (quando filtrado por região)
function applyBrazilStatesMapStyling(rootEl, opts) {
  const paths = rootEl.querySelectorAll('.br-state[data-uf]');
  const onlyRegion = String(opts?.region || '');
  const activeUf = String(opts?.activeUf || '').toUpperCase();

  paths.forEach(p => {
    const uf = String(p.getAttribute('data-uf') || '').toUpperCase();
    const region = UF_TO_REGION[uf] || '';

    if (region) {
      p.dataset.region = region;
      p.classList.add(regionClass(region));
    }

    // dim/desabilita por região (quando estiver na tela de estados)
    const shouldDisable = Boolean(onlyRegion && region && region !== onlyRegion);
    p.classList.toggle('rm-dim', shouldDisable);
    p.classList.toggle('rm-disabled', shouldDisable);

    // seleção de UF
    p.classList.toggle('is-selected', Boolean(activeUf && uf === activeUf));
  });
}


let _BR_STATES_LABEL_RO = null;

function setupBrazilStatesLabels(svgHostDiv, labelsLayer, opts){
  if (!svgHostDiv || !labelsLayer) return;

  const rebuild = () => buildBrazilStatesLabels(svgHostDiv, labelsLayer, opts);

  // limpa observer anterior (para evitar múltiplos)
  try { if (_BR_STATES_LABEL_RO) _BR_STATES_LABEL_RO.disconnect(); } catch(_){}

  // garante 1ª renderização após layout
  requestAnimationFrame(() => {
    rebuild();
  });

  if (window.ResizeObserver) {
    _BR_STATES_LABEL_RO = new ResizeObserver(() => rebuild());
    try { _BR_STATES_LABEL_RO.observe(svgHostDiv); } catch(_){}
  } else {
    // fallback simples
    window.addEventListener('resize', rebuild);
  }
}

function buildBrazilStatesLabels(svgHostDiv, labelsLayer, opts){
  const svg = svgHostDiv.querySelector('svg');
  if (!svg) return;

  const selectedRegion = String(opts?.region || '').trim();

  // Preferência: tenta nome completo, mas evita sobreposição (fallback para UF)
  const preferred = String(opts?.label || 'auto'); // 'auto' | 'name' | 'uf'

  labelsLayer.innerHTML = '';

  // viewBox (sistema de coordenadas do SVG)
  const vb = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width)
    ? svg.viewBox.baseVal
    : { x: 0, y: 0, width: 1000, height: 1000 };

  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
  const drawnW = vb.width * scale;
  const drawnH = vb.height * scale;
  const offsetX = (rect.width - drawnW) / 2;
  const offsetY = (rect.height - drawnH) / 2;

  // Helpers de colisão
  const placed = []; // {l,t,r,b}
  const bounds = { w: rect.width, h: rect.height };
  const M = 4; // margem mínima

  function intersects(a, b){
    return !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
  }
  function inside(box){
    return box.l >= M && box.t >= M && box.r <= (bounds.w - M) && box.b <= (bounds.h - M);
  }

  // offsets em "espiral" (px)
  const OFFSETS = (() => {
    const out = [{ dx: 0, dy: 0 }];
    const radii = [10, 16, 22, 28, 34, 40];
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    radii.forEach(r => {
      angles.forEach(a => {
        const rad = (a * Math.PI) / 180;
        out.push({ dx: Math.round(Math.cos(rad) * r), dy: Math.round(Math.sin(rad) * r) });
      });
    });
    out.push({ dx: 0, dy: -48 }, { dx: 0, dy: 48 }, { dx: -48, dy: 0 }, { dx: 48, dy: 0 });
    return out;
  })();

  // coletar paths (somente da região selecionada, quando aplicável)
  const items = Array.from(svg.querySelectorAll('.br-state[data-uf]'))
    .map(p => {
      const uf = String(p.getAttribute('data-uf') || '').toUpperCase();
      if (!uf) return null;

      const region = String(p.dataset.region || UF_TO_REGION[uf] || '');
      if (selectedRegion && region && region !== selectedRegion) return null;

      let bb;
      try { bb = p.getBBox(); } catch(_) { return null; }

      const area = bb.width * bb.height;
      const cx = bb.x + (bb.width / 2);
      const cy = bb.y + (bb.height / 2);
      const x = offsetX + ((cx - vb.x) * scale);
      const y = offsetY + ((cy - vb.y) * scale);
      const name = String(p.getAttribute('data-name') || UF_TO_NAME[uf] || uf);
      const dim = p.classList.contains('rm-dim') || p.classList.contains('rm-disabled');

      return { p, uf, name, region, bb, area, x, y, dim };
    })
    .filter(Boolean);

  // coloca maiores primeiro (reduz colisões)
  items.sort((a,b) => (b.area || 0) - (a.area || 0));

  const frag = document.createDocumentFragment();

  for (const it of items) {
    const uf = it.uf;
    const name = it.name;
    const tiny = (it.area < 1200) || it.bb.width < 28 || it.bb.height < 28;

    // escolha de candidatos (ordem)
    let candidates;
    if (preferred === 'uf') candidates = [uf];
    else if (preferred === 'name') candidates = [name, uf];
    else candidates = tiny ? [uf] : [name, uf]; // auto

    let accepted = null;

    for (const text of candidates) {
      const el = document.createElement('div');
      el.className = 'state-label';
      el.dataset.uf = uf;
      el.textContent = text;
      el.setAttribute('title', name);
      if (it.dim) el.classList.add('dim');
      if (text !== uf) el.classList.add('is-name');
      if (tiny || String(text).length > 12) el.classList.add('small');

      // mede
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.visibility = 'hidden';
      labelsLayer.appendChild(el);
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);

      let ok = false;
      let finalX = it.x;
      let finalY = it.y;

      for (const o of OFFSETS) {
        const cx = it.x + o.dx;
        const cy = it.y + o.dy;
        const box = { l: cx - (w/2), t: cy - (h/2), r: cx + (w/2), b: cy + (h/2) };
        if (!inside(box)) continue;

        let collide = false;
        for (const b of placed) {
          if (intersects(box, b)) { collide = true; break; }
        }
        if (collide) continue;

        ok = true;
        finalX = cx;
        finalY = cy;
        // adiciona pequena folga para evitar textos muito colados
        placed.push({ l: box.l - 3, t: box.t - 3, r: box.r + 3, b: box.b + 3 });
        break;
      }

      if (ok) {
        el.style.left = `${finalX}px`;
        el.style.top = `${finalY}px`;
        el.style.visibility = 'visible';
        accepted = el;
        break;
      }

      // não conseguiu posicionar esse texto -> remove e tenta próximo candidato
      try { labelsLayer.removeChild(el); } catch(_) {}
    }

    if (accepted) frag.appendChild(accepted);
  }

  labelsLayer.innerHTML = '';
  labelsLayer.appendChild(frag);
}


// monta o mapa de estados (tela "Estados") e liga clique -> openState()
async function mountBrazilStatesMapInto(targetDiv, opts) {
  if (!targetDiv) return false;

  const markup = await getBrazilStatesSvgMarkup();
  if (!markup) return false;

  targetDiv.innerHTML = markup;

  const paths = targetDiv.querySelectorAll('.br-state[data-uf]');
  paths.forEach(p => {
    const uf = String(p.getAttribute('data-uf') || '').toUpperCase();
    const stateName = String(p.getAttribute('data-name') || UF_TO_NAME[uf] || uf);

    // acessibilidade básica
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', `Selecionar ${stateName} (${uf})`);

    p.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const region = UF_TO_REGION[uf] || '';
      const onlyRegion = String(opts?.region || '');

      // se houver região selecionada, só permite clique nos estados dela
      if (onlyRegion && region && region !== onlyRegion) return;

      openState(stateName, uf);
    };

    p.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        p.click();
      }
    };
  });

  applyBrazilStatesMapStyling(targetDiv, opts);
  return true;
}

// monta o mapa de regiões (tela "Regiões") e liga clique -> openRegion()
// OBS: aqui o clique é pela "área" da região (estados agrupados), sem lista/legend clicável
async function mountBrazilRegionsMapInto(targetDiv) {
  if (!targetDiv) return false;

  const markup = await getBrazilRegionsSvgMarkup();
  if (!markup) return false;

  targetDiv.innerHTML = markup;

  // cada grupo de região recebe o click (bubbling dos estados)
  const groups = targetDiv.querySelectorAll('.br-region[data-region]');
  groups.forEach(g => {
    const region = String(g.getAttribute('data-region') || '');
    try {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Abrir região ${region}`);
    } catch(_) {}
    g.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (region) openRegion(region);
    };

    g.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (region) openRegion(region);
      }
    };
  });

  // adiciona data-region e classe de cor em cada estado também (para hover mais consistente)
  const paths = targetDiv.querySelectorAll('.br-state[data-uf]');
  paths.forEach(p => {
    const uf = String(p.getAttribute('data-uf') || '').toUpperCase();
    const region = UF_TO_REGION[uf] || '';
    if (!region) return;
    p.dataset.region = region;
    p.classList.add(regionClass(region));

    // acessibilidade: permitir navegação por teclado no mapa de regiões
    const stateName = String(p.getAttribute('data-name') || UF_TO_NAME[uf] || uf);
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', `Abrir região ${region} (estado ${stateName})`);
    p.onkeydown = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openRegion(region);
      }
    };
  });

  return true;
}

// posição dos cards (somente informativo) no mapa de regiões
const REGION_MAP_LABEL_POS = {
  "Norte":        { x: 34, y: 24 },
  "Nordeste":     { x: 80, y: 38 },
  "Centro-Oeste": { x: 46, y: 58 },
  "Sudeste":      { x: 74, y: 74 },
  "Sul":          { x: 54, y: 92 }
};

function renderRegionMap() {
  const canvas = document.getElementById("regionMapCanvas");
  const legend = document.getElementById("regionMapLegend");
  if (!canvas) return;

  // Legenda (clicável) -> abre a região e também destaca no hover
  if (legend) {
    legend.innerHTML = "";
    Object.keys(mapData).forEach(region => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `rm-pill ${regionClass(region)}`;
      pill.dataset.region = region;
      pill.setAttribute('aria-label', `Abrir região ${region}`);
      pill.innerHTML = `<span class="rm-dot" style="background: var(--rm-color);"></span>${escapeHtmlAttr(region)}`;

      pill.addEventListener('mouseenter', () => {
        // destaque apenas visual
        setActiveRegionOnMap(region);
      });
      pill.addEventListener('mouseleave', () => {
        setActiveRegionOnMap(currentRegion || "");
      });
      pill.addEventListener('click', () => {
        openRegion(region);
      });

      legend.appendChild(pill);
    });
  }

  canvas.innerHTML = `<div class="brmap-svg" id="brmapRegionsSvg" aria-hidden="true"></div>`;
  const svgHost = document.getElementById("brmapRegionsSvg");

  mountBrazilRegionsMapInto(svgHost).then(() => {
    setActiveRegionOnMap(currentRegion || "");
  });

  // cards no mapa (clicáveis) com contagem por região
  Object.keys(mapData).forEach(region => {
    const pos = REGION_MAP_LABEL_POS[region] || { x: 50, y: 50 };
    const box = document.createElement("div");
    box.className = `rm-label ${regionClass(region)}`;
    box.style.left = `${pos.x}%`;
    box.style.top = `${pos.y}%`;
    box.setAttribute("data-region", region);
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-label', `Abrir região ${region}`);

    // Somente o nome da região (sem contagem)
    box.innerHTML = `<div class="rm-title">${escapeHtmlAttr(region)}</div>`;

    box.addEventListener('click', () => openRegion(region));
    box.addEventListener('mouseenter', () => setActiveRegionOnMap(region));
    box.addEventListener('mouseleave', () => setActiveRegionOnMap(currentRegion || ''));
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openRegion(region);
      }
    });

    canvas.appendChild(box);
  });
}

function setActiveRegionOnMap(region) {
  const selected = String(region || "");

  // destaca o grupo da região no mapa de regiões (se presente)
  try {
    const groups = document.querySelectorAll('.br-region[data-region]');
    groups.forEach(g => {
      const r = String(g.getAttribute('data-region') || '');
      g.classList.toggle('rm-active', Boolean(selected && r === selected));
      // não "some" com o resto; só dim leve se houver seleção
      g.classList.toggle('rm-dim', Boolean(selected && r !== selected));
    });
  } catch (_) {}

  // destaca também a legenda (se presente)
  try {
    const pills = document.querySelectorAll('#regionMapLegend .rm-pill[data-region]');
    pills.forEach(p => {
      const r = String(p.dataset.region || '');
      p.classList.toggle('rm-active', Boolean(selected && r === selected));
    });
  } catch (_) {}

  // dim/desabilita estados fora da região selecionada (tela de estados)
  try {
    const states = document.querySelectorAll('.br-state[data-region]');
    states.forEach(p => {
      const r = String(p.dataset.region || '');
      if (!selected) {
        p.classList.remove('rm-dim');
        p.classList.remove('rm-disabled');
        return;
      }
      const disable = r !== selected;
      p.classList.toggle('rm-dim', disable);
      p.classList.toggle('rm-disabled', disable);
    });
  } catch (_) {}
}


// ====== /Mapa por Regiões (SVG real agrupado) ======



// Modalidades consultadas (contratações por data de publicação)
const MODALIDADES_BUSCA = ["12", "9", "8", "6", "7", "10", "11", "3", "2"];

// Foco: oportunidades de contratação de médicos (não compras de insumos)
const INCLUDE_SIGNED_DOCS = false; // manter falso: "vagas disponíveis" = foco em Editais/Contratações

const DOCTOR_TERMS = [
  "medico", "medica", "medicos", "medicas",
  "plantonista", "clinico geral", "clinico", "generalista",
  "pediatra", "psiquiatra", "anestesiologista", "ginecologista", "obstetra",
  "ortopedista", "cardiologista", "urologista", "dermatologista", "infectologista",
  "intensivista", "urgencista", "emergencista",
  "medicina do trabalho", "saude da familia", "psf", "esf"
];

const HIRING_TERMS = [
  "contratacao", "contratar", "contratacao de", "contratacao temporaria",
  "prestacao de servico", "prestacao de servicos", "servico medico", "servicos medicos",
  "mao de obra", "fornecimento de mao de obra", "terceirizacao", "cooperativa medica",
  "credenciamento", "chamamento publico", "processo seletivo", "selecao", "selecionamento",
  "vaga", "vagas", "plantao", "plantoes", "escala de plantao", "carga horaria"
];

const EXCLUDE_TERMS = [
  "medicamento", "medicamentos", "remedio", "farmacia", "farmaceutico",
  "material medico", "materiais medicos", "material hospitalar", "insumo", "insumos",
  "equipamento", "equipamentos", "aparelho", "aparelhos", "pecas", "suprimentos",
  "kit", "luva", "seringa", "agulha", "cateter", "curativo", "gaze", "soro", "ampola",
  "epi", "mascara", "respirador", "oxigenio",
  "reagente", "laboratorio", "exame", "exames", "tomografia", "ultrassom", "raio x", "radiologia"
];

const SAFETY_LIMITS = {
  maxPages: 80,
  maxItems: 15000,
  pageDelayMs: 120,
  timeoutMs: 45000
};

let currentRegion = "";
let currentState = "";
let currentCitySelected = "";
let currentCitiesData = {};
let currentAbortCtrl = null;
let currentAbortToken = 0;

function normalizePtText(s) {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return t;
}

function scoreDoctorVacancy(text) {
  const t = normalizePtText(text);
  if (!t) return { ok: false, score: 0 };

  const hasDoctor =
    /\bmedic[oa]s?\b/.test(t) ||
    DOCTOR_TERMS.some(term => t.includes(term));

  const hasHiring =
    HIRING_TERMS.some(term => t.includes(term)) ||
    /\bcredenciament\w*\b/.test(t) ||
    /\bchamament\w*\b/.test(t) ||
    /\bcontrat\w*\b/.test(t);

  const hasExclude = EXCLUDE_TERMS.some(term => t.includes(term));

  let score = 0;
  if (hasDoctor) score += 3;
  if (hasHiring) score += 3;

  if (t.includes("prestacao de servicos") || t.includes("prestacao de servico")) score += 2;
  if (t.includes("servicos medicos") || t.includes("servico medico")) score += 2;
  if (t.includes("credenciamento")) score += 2;
  if (t.includes("chamamento publico")) score += 2;
  if (t.includes("plantao") || t.includes("plantoes") || t.includes("plantonista")) score += 2;
  if (t.includes("vaga") || t.includes("vagas")) score += 1;

  for (const sp of ["pediatra","psiquiatra","anestesiologista","ginecologista","obstetra","ortopedista","cardiologista","urologista","dermatologista","infectologista","intensivista","urgencista","emergencista"]) {
    if (t.includes(sp)) score += 1;
  }

  if (hasExclude) score -= 6;
  if (t.includes("aquisicao") && !t.includes("servic")) score -= 4;
  if (t.includes("fornecimento") && !t.includes("mao de obra") && !t.includes("servic")) score -= 2;

  const ok = Boolean(hasDoctor && hasHiring && score >= 3);
  return { ok, score };
}

function resolveStatusLower(item) {
  const raw = ApiPNCP.pick(item, [
    "situacaoCompraNome", "situacaoCompra", "situacao",
    "status", "statusCompra", "faseCompra",
    "situacaoEdital", "situacaoContratacao", "descricaoSituacao"
  ]);
  return normalizePtText(raw || "");
}

function isOpportunityOpen(item) {
  const st = resolveStatusLower(item);
  if (!st) return true; // sem status: não bloqueia

  const closed = ["encerr", "finaliz", "cancel", "revog", "anul", "fracass", "desert", "suspens", "conclu", "homolog", "adjud"];
  if (closed.some(x => st.includes(x))) return false;

  return true;
}

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showView(viewName) {
  ["regions", "states", "cities", "vacancies"].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("block");
  });

  const target = document.getElementById(`view-${viewName}`);
  if (!target) return;
  target.classList.remove("hidden");
  target.classList.add("block");
}

// === Controle do botão "Voltar" na tela de Vagas ===
// Em algumas versões, o clique no município não abria porque esta função não existia.
let _vacanciesBackTarget = 'cities';

function setVacanciesBack(targetView, labelText) {
  _vacanciesBackTarget = String(targetView || 'cities');

  const btn = document.getElementById('vacanciesBackBtn');
  const lbl = document.getElementById('vacanciesBackLabel');

  if (lbl) lbl.textContent = String(labelText || 'Voltar');
  if (btn) {
    btn.onclick = () => {
      showView(_vacanciesBackTarget);
    };
  }
}

function initDashboard() {
  renderRegionMap();
  showView("regions");
}


function setActiveStateOnMaps(uf) {
  const target = String(uf || '').toUpperCase();
  try {
    const all = document.querySelectorAll('.br-state[data-uf]');
    all.forEach(p => {
      const puf = String(p.getAttribute('data-uf') || '').toUpperCase();
      if (!target) {
        p.classList.remove('is-selected');
        return;
      }
      p.classList.toggle('is-selected', puf === target);
    });
  } catch (_) {}
}

function renderStateMap(region) {
  const canvas = document.getElementById('stateMapCanvas');
  if (!canvas) return;

  canvas.innerHTML = `
    <div class="brmap-svg" id="brmapStatesSvg" aria-hidden="true"></div>
    <div class="state-label-layer" id="brmapStatesLabels" aria-hidden="true"></div>
  `;
  const host = document.getElementById('brmapStatesSvg');
  const labels = document.getElementById('brmapStatesLabels');

  mountBrazilStatesMapInto(host, { region: region || currentRegion, activeUf: currentState, labelsLayer: labels }).then(() => {
    // garante dim por região e highlight por UF
    setActiveRegionOnMap(region || currentRegion || '');
    setActiveStateOnMaps(currentState || '');

    // labels dos estados (auto: tenta nome e evita sobreposição; cai para UF)
    setupBrazilStatesLabels(host, labels, { region: region || currentRegion, label: 'auto' });
  });
}


function openRegion(region) {
  currentRegion = region;
  // ao entrar na região, não mantém UF antiga selecionada
  currentState = "";
  setActiveRegionOnMap(region);
  const title = document.getElementById("statesTitle");
  if (title) title.textContent = `Estados em ${region}`;

  // mapa real na tela de estados
  renderStateMap(region);

  showView("states");
}

function resolveUf(item) {
  return ApiPNCP.pick(item, ["uf", "siglaUf"])
    || (item.orgaoEntidade && (item.orgaoEntidade.ufSigla || item.orgaoEntidade.uf))
    || (item.unidadeOrgao && (item.unidadeOrgao.ufSigla || item.unidadeOrgao.uf))
    || "";
}

function resolveMunicipio(item) {
  return ApiPNCP.pick(item, ["municipioNome", "municipio", "nomeMunicipio"])
    || (item.orgaoEntidade && (item.orgaoEntidade.municipioNome || item.orgaoEntidade.municipio))
    || "Município não informado";
}

function buildSafeLink(item) {
  // --- Objetivo: gerar link oficial do portal PNCP SEM depender do numeroCompra ---
  // O portal usa o SEQUENCIAL PNCP + ANO (extraídos do numeroControlePNCP).

  const cnpjRaw =
    ApiPNCP.pick(item, ["cnpj", "numeroInscricaoCnpj", "cnpjOrgao"]) ||
    (item.orgaoEntidade && (item.orgaoEntidade.cnpj || item.orgaoEntidade.numeroInscricaoCnpj)) ||
    "";

  const cnpjDigits = ApiPNCP.onlyDigits(cnpjRaw);

  const idAny = String(
    ApiPNCP.pick(item, [
      // Contratações
      "numeroControlePNCP",
      "numeroControlePncp",
      "numeroControlePNCPCompra",
      "numeroControlePNCPCompra",
      // Atas
      "numeroControlePNCPAta",
      // Contratos
      "numeroControlePNCPContrato",
      // legados
      "idContratacaoPncp",
      "idPncp",
      "id"
    ]) ||
      ""
  ).trim();

  const normalizeSeq = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) return String(n);
    // remove zeros à esquerda sem perder o valor
    const z = s.replace(/^0+/, "");
    return z || s;
  };

  const parseContratacaoId = (id) => {
    // Máscara (Manual PNCP API Consultas): 99999999999999-1-999999/9999
    const m = String(id || "").match(/(\d{14})-1-(\d{1,6})\/(\d{4})/);
    if (!m) return null;
    return { cnpj: m[1], seq: normalizeSeq(m[2]), ano: m[3] };
  };

  const parseContratoId = (id) => {
    // Máscara: 99999999999999-2-999999/9999
    const m = String(id || "").match(/(\d{14})-2-(\d{1,6})\/(\d{4})/);
    if (!m) return null;
    return { cnpj: m[1], seq: normalizeSeq(m[2]), ano: m[3] };
  };

  const parseAtaId = (id) => {
    // Máscara (ata): 99999999999999-1-999999/9999-999999
    const m = String(id || "").match(/(\d{14})-1-(\d{1,6})\/(\d{4})-(\d{1,6})/);
    if (!m) return null;
    return { cnpj: m[1], seqCompra: normalizeSeq(m[2]), ano: m[3], seqAta: normalizeSeq(m[4]) };
  };

  const normalizeUrl = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("/")) return "https://pncp.gov.br" + s;
    return "https://" + s;
  };

  const isValidPortalUrl = (u) => {
    const url = String(u || "");
    // Editais/Contratações: /app/editais/{cnpj}/{ano}/{seq}
    if (/^https:\/\/pncp\.gov\.br\/app\/editais\/\d{14}\/\d{4}\/\d+/.test(url)) return true;
    // Atas: /app/atas/{cnpj}/{ano}/{seqCompra}/{seqAta}
    if (/^https:\/\/pncp\.gov\.br\/app\/atas\/\d{14}\/\d{4}\/\d+\/\d+/.test(url)) return true;
    // Contratos: /app\/contratos/{cnpj}/{ano}/{seq}
    if (/^https:\/\/pncp\.gov\.br\/app\/contratos\/\d{14}\/\d{4}\/\d+/.test(url)) return true;
    return false;
  };

  let linkSeguro = "";

  // Primeiro: tenta montar pelo numeroControlePNCP (mais confiável)
  const parsedContr = parseContratacaoId(idAny);
  const parsedContrato = parseContratoId(idAny);
  const parsedAta = parseAtaId(idAny);

  // CNPJ preferencial: do campo; senão do id
  const cnpjOk =
    cnpjDigits.length === 14
      ? cnpjDigits
      : parsedContr?.cnpj || parsedContrato?.cnpj || parsedAta?.cnpj || "";

  if (item.tipoDocumento === "edital") {
    // ⚠️ Para link oficial do portal, usamos o SEQUENCIAL PNCP (do id) — NÃO o numeroCompra.
    if (cnpjOk && parsedContr?.ano && parsedContr?.seq) {
      linkSeguro = `https://pncp.gov.br/app/editais/${cnpjOk}/${parsedContr.ano}/${parsedContr.seq}`;
    } else {
      // fallback só se existir algum campo de SEQUENCIAL PNCP explícito (evita numeroCompra)
      const ano = String(ApiPNCP.pick(item, ["anoCompra", "ano"]) || "").trim();
      const seq = normalizeSeq(ApiPNCP.pick(item, ["sequencialPncp", "sequencialContratacaoPncp", "sequencialContratacao", "sequencial"])) || "";
      if (cnpjOk && ano && seq) linkSeguro = `https://pncp.gov.br/app/editais/${cnpjOk}/${ano}/${seq}`;
    }
  } else if (item.tipoDocumento === "ata") {
    // padrão observado no portal: /app/atas/{cnpj}/{anoCompra}/{seqCompra}/{seqAta}
    if (cnpjOk && parsedAta?.ano && parsedAta?.seqCompra && parsedAta?.seqAta) {
      linkSeguro = `https://pncp.gov.br/app/atas/${cnpjOk}/${parsedAta.ano}/${parsedAta.seqCompra}/${parsedAta.seqAta}`;
    }
  } else if (item.tipoDocumento === "contrato") {
    // portal: /app/contratos/{cnpj}/{anoContrato}/{sequencialContrato(PNCP)}
    if (cnpjOk && parsedContrato?.ano && parsedContrato?.seq) {
      linkSeguro = `https://pncp.gov.br/app/contratos/${cnpjOk}/${parsedContrato.ano}/${parsedContrato.seq}`;
    } else {
      const ano = String(ApiPNCP.pick(item, ["anoContrato", "ano"]) || "").trim();
      const seq = normalizeSeq(ApiPNCP.pick(item, ["sequencialContrato", "sequencial"])) || "";
      if (cnpjOk && ano && seq) linkSeguro = `https://pncp.gov.br/app/contratos/${cnpjOk}/${ano}/${seq}`;
    }
  }

  // Fallback final: link do sistema de origem (mas NÃO aceita link PNCP incompleto)
  if (!linkSeguro) {
    const linkBruto = ApiPNCP.pick(item, ["linkSistemaOrigem", "link", "url"]);
    const normalized = normalizeUrl(linkBruto);
    if (normalized) {
      if (normalized.includes("pncp.gov.br/app/")) {
        // só aceita se for um link de portal no formato correto
        if (isValidPortalUrl(normalized)) linkSeguro = normalized;
      } else {
        linkSeguro = normalized;
      }
    }
  }

  return linkSeguro;
}


// ==========================
// Extração do Edital (PDF)
// ==========================
const PdfExtract = {
  cache: new Map(),
  maxPages: 12,
  ensurePdfJs: () => {
    if (!window.pdfjsLib) return false;
    try {
      // Worker do PDF.js (CDNJS)
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
      }
    } catch (_) {}
    return true;
  }
};

function openPdfModal(title) {
  const modal = document.getElementById("pdfModal");
  const ttl = document.getElementById("pdfModalTitle");
  const body = document.getElementById("pdfModalBody");
  if (!modal || !ttl || !body) return;

  ttl.textContent = title || "Extrair do edital (PDF)";
  body.innerHTML = `
    <div class="flex items-center gap-3 text-slate-700">
      <div class="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
      <div id="pdfModalStatus" class="text-sm font-medium">Preparando...</div>
    </div>
    <div class="mt-4 text-xs text-slate-500">
      Observação: se o PDF estiver hospedado fora do PNCP, o navegador pode bloquear a leitura automática (CORS).
    </div>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closePdfModal() {
  const modal = document.getElementById("pdfModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function setPdfModalStatus(msg) {
  const el = document.getElementById("pdfModalStatus");
  if (el) el.textContent = msg || "";
}

function setPdfModalHtml(html) {
  const body = document.getElementById("pdfModalBody");
  if (body) body.innerHTML = html;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeForMatch(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractInfoFromTextByPage(pages) {
  // pages: [{page, text}]
  const results = {
    plantao: null,
    cargaHoraria: null,
    escala: null,
    valor: null,
    prazo: null
  };

  const moneyRe = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
  const dateRe = /\b\d{2}\/\d{2}\/\d{4}\b/g;

  const choose = (current, candidate) => {
    if (!candidate) return current;
    if (!current) return candidate;
    // Preferir candidato com palavra-chave contextual
    const score = (c) => (c && c.score ? c.score : 0);
    return score(candidate) > score(current) ? candidate : current;
  };

  const contextScore = (ctx, keywords) => {
    const t = normalizeForMatch(ctx);
    let s = 0;
    keywords.forEach(k => { if (t.includes(k)) s += 2; });
    return s;
  };

  pages.forEach(({ page, text }) => {
    const raw = String(text || "");
    const t = normalizeForMatch(raw);

    // Plantão
    if (!results.plantao && t.includes("plantao")) {
      results.plantao = { value: "Sim", page, snippet: raw.slice(0, 240), score: 1 };
    }

    // Valor (R$...) com contexto
    const moneyMatches = raw.match(moneyRe) || [];
    if (moneyMatches.length) {
      // pega a primeira ocorrência com melhor contexto
      let best = null;
      for (const m of moneyMatches.slice(0, 10)) {
        const idx = raw.indexOf(m);
        const ctx = raw.slice(Math.max(0, idx - 80), Math.min(raw.length, idx + 140));
        const sc = contextScore(ctx, ["plantao", "hora", "remuneracao", "valor", "pagamento", "preco", "honorario"]);
        const cand = { value: m, page, snippet: ctx.trim(), score: sc };
        best = choose(best, cand);
      }
      results.valor = choose(results.valor, best);
    }

    // Carga horária / horas
    if (!results.cargaHoraria) {
      const hourMatch = raw.match(/\b(\d{1,2})\s*(?:h\b|horas?\b)/i);
      if (hourMatch) {
        const idx = raw.toLowerCase().indexOf(hourMatch[0].toLowerCase());
        const ctx = raw.slice(Math.max(0, idx - 90), Math.min(raw.length, idx + 160));
        const sc = contextScore(ctx, ["carga", "horaria", "plantao", "jornada", "escala", "semana", "mensal"]);
        results.cargaHoraria = { value: hourMatch[0], page, snippet: ctx.trim(), score: sc };
      }
    }

    // Escala (12x36 etc.)
    if (!results.escala) {
      const escalaMatch = raw.match(/\b(\d{1,2})\s*x\s*(\d{1,2})\b/);
      if (escalaMatch) {
        const idx = raw.indexOf(escalaMatch[0]);
        const ctx = raw.slice(Math.max(0, idx - 90), Math.min(raw.length, idx + 160));
        const sc = contextScore(ctx, ["escala", "plantao", "jornada", "revezamento"]);
        results.escala = { value: escalaMatch[0].replace(/\s+/g, ""), page, snippet: ctx.trim(), score: sc };
      }
    }

    // Prazo (data dd/mm/aaaa com contexto)
    const dates = raw.match(dateRe) || [];
    if (dates.length) {
      let best = null;
      for (const d of dates.slice(0, 12)) {
        const idx = raw.indexOf(d);
        const ctx = raw.slice(Math.max(0, idx - 90), Math.min(raw.length, idx + 180));
        const sc = contextScore(ctx, ["proposta", "inscric", "encerr", "prazo", "credenci", "sessao", "abertura"]);
        const cand = { value: d, page, snippet: ctx.trim(), score: sc };
        best = choose(best, cand);
      }
      results.prazo = choose(results.prazo, best);
    }
  });

  return results;
}

async function extractFromEditalPdf(item) {
  try {
    openPdfModal("Extrair do edital (PDF)");
    setPdfModalStatus("Preparando...");

    if (!PdfExtract.ensurePdfJs()) {
      setPdfModalHtml(`
        <div class="text-sm text-red-700 font-semibold">Não foi possível carregar o leitor de PDF.</div>
        <div class="text-xs text-slate-600 mt-2">Verifique sua conexão e tente novamente.</div>
      `);
      return;
    }

    const key = String(
      ApiPNCP.pick(item, ["numeroControlePNCP", "numeroControlePncp", "idContratacaoPncp", "idPncp", "id"]) || ""
    ).trim();

    if (key && PdfExtract.cache.has(key)) {
      const cached = PdfExtract.cache.get(key);
      setPdfModalHtml(cached);
      return;
    }

    // Identifica compra (CNPJ/ANO/SEQ PNCP)
    const parsed = ApiPNCP.parseNumeroControlePncp(key);
    if (!parsed || !parsed.cnpj || !parsed.ano || !parsed.seq) {
      const link = buildSafeLink(item);
      setPdfModalHtml(`
        <div class="text-sm text-slate-800 font-semibold">Não consegui identificar o número de controle PNCP desta contratação.</div>
        <div class="text-xs text-slate-600 mt-2">Abra no portal e consulte os anexos pelo botão “Ver Oficial”.</div>
        ${link ? `<div class="mt-3"><a class="text-blue-700 underline text-sm" target="_blank" rel="noopener noreferrer" href="${escapeHtml(link)}">Abrir no portal PNCP</a></div>` : ""}
      `);
      return;
    }

    setPdfModalStatus("Consultando anexos do PNCP...");

    // Busca lista de documentos
    const arquivosResp = await ApiPNCP.listCompraArquivos(parsed.cnpj, parsed.ano, parsed.seq, { timeoutMs: 45000 });
    const arquivos = arquivosResp?.arquivos || [];
    const base = arquivosResp?.base || "https://pncp.gov.br/pncp-api/v1";
    const seqUsed = arquivosResp?.seqUsed || parsed.seq;

    if (!arquivos.length) {
      const link = buildSafeLink(item);
      setPdfModalHtml(`
        <div class="text-sm text-slate-800 font-semibold">Nenhum anexo (PDF) retornou pela API para esta contratação.</div>
        <div class="text-xs text-slate-600 mt-2">Em alguns casos, o edital fica somente no sistema de origem do órgão.</div>
        ${link ? `<div class="mt-3"><a class="text-blue-700 underline text-sm" target="_blank" rel="noopener noreferrer" href="${escapeHtml(link)}">Abrir no portal PNCP</a></div>` : ""}
      `);
      return;
    }

    // Escolhe o melhor PDF
    const chosen = ApiPNCP.pickBestPdf(arquivos);
    if (!chosen) {
      setPdfModalHtml(`
        <div class="text-sm text-slate-800 font-semibold">Não encontrei nenhum PDF entre os anexos retornados.</div>
        <div class="text-xs text-slate-600 mt-2">Verifique se há anexos em outros formatos.</div>
      `);
      return;
    }

    const seqDoc = ApiPNCP.onlyDigits(chosen.sequencialDocumento || chosen.sequencial || chosen.id || "");
    const pdfUrl =
      chosen.documentoUri ||
      chosen.uri ||
      chosen.url ||
      (seqDoc ? `${base}/orgaos/${parsed.cnpj}/compras/${parsed.ano}/${seqUsed}/arquivos/${seqDoc}` : "");

    if (!pdfUrl) {
      setPdfModalHtml(`
        <div class="text-sm text-slate-800 font-semibold">Não consegui montar o link do PDF.</div>
      `);
      return;
    }

    setPdfModalStatus("Baixando PDF...");

    const bin = await ApiPNCP.fetchBinary(pdfUrl, { timeoutMs: 65000 });
    const data = bin?.arrayBuffer;
    if (!data) throw new Error("Falha ao baixar o PDF.");

    setPdfModalStatus("Lendo PDF...");

    const task = pdfjsLib.getDocument({ data });
    const pdf = await task.promise;

    const totalPages = pdf.numPages || 0;
    const maxPages = Math.min(PdfExtract.maxPages, totalPages || PdfExtract.maxPages);

    const pages = [];
    for (let p = 1; p <= maxPages; p++) {
      setPdfModalStatus(`Extraindo texto (página ${p}/${maxPages})...`);
      const page = await pdf.getPage(p);
      const txt = await page.getTextContent();
      const strings = (txt.items || []).map((it) => it.str).join(" ");
      pages.push({ page: p, text: strings });
    }

    const extracted = extractInfoFromTextByPage(pages);

    const fmt = (obj, label) => {
      if (!obj) return `<div class="text-xs text-slate-500">Não localizado.</div>`;
      return `
        <div class="text-sm font-semibold text-slate-900">${escapeHtml(obj.value)}</div>
        <div class="text-[11px] text-slate-500 mt-1">Página ${obj.page}</div>
        <div class="text-[11px] text-slate-600 mt-2 bg-slate-50 border border-slate-100 rounded-lg p-3">${escapeHtml(obj.snippet || "").slice(0, 500)}</div>
      `;
    };

    const nomeArquivo = chosen.nomeArquivo || chosen.nome || chosen.titulo || "PDF do edital";
    const html = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-base font-bold text-slate-900">Extração do edital (PDF)</div>
          <div class="text-xs text-slate-500 mt-1">${escapeHtml(nomeArquivo)}</div>
        </div>
        <button type="button" class="text-slate-500 hover:text-slate-700 text-sm" onclick="closePdfModal()">✕</button>
      </div>

      <div class="mt-4">
        <a class="inline-flex items-center gap-2 text-blue-700 hover:text-blue-800 underline text-sm" target="_blank" rel="noopener noreferrer" href="${escapeHtml(pdfUrl)}">
          Abrir PDF em nova aba
        </a>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Valor / remuneração</div>
          ${fmt(extracted.valor)}
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Plantão</div>
          ${fmt(extracted.plantao)}
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Carga horária</div>
          ${fmt(extracted.cargaHoraria)}
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Escala</div>
          ${fmt(extracted.escala)}
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 md:col-span-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Prazo / data no edital</div>
          ${fmt(extracted.prazo)}
        </div>
      </div>

      <div class="mt-5 text-xs text-slate-500">
        Dica: se algum campo não aparecer, ele pode estar em anexo diferente (Termo de Referência, etc.) ou em PDF escaneado.
      </div>
    `;

    PdfExtract.cache.set(key, html);
    setPdfModalHtml(html);

  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    setPdfModalHtml(`
      <div class="text-sm text-red-700 font-semibold">Falha ao extrair do edital (PDF).</div>
      <div class="text-xs text-slate-600 mt-2">${escapeHtml(msg)}</div>
      <div class="text-xs text-slate-500 mt-3">Se o documento estiver fora do PNCP, pode haver bloqueio de leitura automática.</div>
    `);
  }
}

function getCurrentFilteredVacancies() {
  let vacancies = (currentCitiesData[currentCitySelected] || []).slice();

  const tipoEl = document.getElementById("filtroTipoDoc");
  const ordEl = document.getElementById("ordenacaoVagas");
  const tipoDoc = tipoEl ? String(tipoEl.value || "todos") : "todos";
  const ordenacao = ordEl ? String(ordEl.value || "recente") : "recente";

  if (tipoDoc !== "todos") {
    vacancies = vacancies.filter(v => v.tipoDocumento === tipoDoc);
  }

  vacancies.sort((a, b) => {
    if (ordenacao === "relevante") {
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    }
    const dateA = ApiPNCP.parseDateMs(ApiPNCP.pick(a, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));
    const dateB = ApiPNCP.parseDateMs(ApiPNCP.pick(b, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));
    if (ordenacao === "recente") return dateB - dateA;
    if (ordenacao === "antigo") return dateA - dateB;
    return 0;
  });

  return { vacancies, tipoDoc, ordenacao };
}

function safeFilename(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function openState(stateName, stateSigla) {
  currentState = stateSigla;
  setActiveStateOnMaps(currentState);

  // cancela busca anterior (troca de estado)
  if (currentAbortCtrl) {
    try { currentAbortCtrl.abort(); } catch (_) {}
  }

  const myCtrl = new AbortController();
  currentAbortCtrl = myCtrl;

  // token para ignorar resultados "atrasados"
  const myToken = ++currentAbortToken;
  const isStale = () => myToken !== currentAbortToken;

  const guard = () => {
    if (isStale()) throw new DOMException("Aborted", "AbortError");
    if (myCtrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
  };

  const citiesTitle = document.getElementById("citiesTitle");
  const citiesSubtitle = document.getElementById("citiesSubtitle");
  const citiesGrid = document.getElementById("citiesGrid");
  const loadingCities = document.getElementById("loadingCities");

  if (citiesTitle) citiesTitle.textContent = `Oportunidades em ${escapeHtmlAttr(stateName)}`;
  if (citiesSubtitle) citiesSubtitle.textContent = "Buscando oportunidades de contratação de médicos (últimos 30 dias)...";
  if (citiesGrid) citiesGrid.innerHTML = "";
  if (loadingCities) loadingCities.classList.remove("hidden");

  showView("cities");

  const { dataInicial, dataFinal } = ApiPNCP.getDateRange(30);

  try {
    let rawItems = [];
    let truncatedAny = false;
    let modalityErrors = [];

    // 1) EDITAIS / CONTRATAÇÕES (filtra por UF no endpoint)
    for (let i = 0; i < MODALIDADES_BUSCA.length; i++) {
      guard();
      const mod = MODALIDADES_BUSCA[i];

      if (citiesSubtitle) citiesSubtitle.textContent = `Buscando contratações (modalidade ${mod})...`;

      let res;
      try {
        res = await ApiPNCP.fetchAllPages(
        API_EDITAIS,
        {
          dataInicial,
          dataFinal,
          codigoModalidadeContratacao: mod,
          uf: stateSigla,
          pagina: 1,
          tamanhoPagina: 200
        },
        {
          signal: myCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems,
          onProgress: (p) => {
            if (!citiesSubtitle) return;
            citiesSubtitle.textContent =
              `Buscando contratações (modalidade ${mod})... página ${p.page}${p.totalPages ? " de " + p.totalPages : ""} (${p.itemsSoFar} itens)`;
          }
        }
      );
      } catch (e) {
        // Se o usuário cancelou (mudou de estado/voltou), propaga o abort
        if (e && (e.name === "AbortError" || String(e).includes("AbortError"))) throw e;
        modalityErrors.push(e);
        // Falha em uma modalidade não deve derrubar toda a busca; seguimos para a próxima
        continue;
      }

      truncatedAny = truncatedAny || Boolean(res.meta?.truncated);

      const items = Array.isArray(res.data) ? res.data : [];
      items.forEach(it => it.tipoDocumento = "edital");
      rawItems = rawItems.concat(items);
      guard();

      if (i < MODALIDADES_BUSCA.length - 1) {
        await ApiPNCP.sleep(220, myCtrl.signal);
        guard();
      }
    }

    // 2) (Opcional) Atas e Contratos (histórico) — desativado por padrão
    if (INCLUDE_SIGNED_DOCS) {
      if (citiesSubtitle) citiesSubtitle.textContent = "Buscando atas de registro de preços...";
      const resAtas = await ApiPNCP.fetchAllPages(
        API_ATAS,
        { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 200 },
        {
          signal: myCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems
        }
      );
      truncatedAny = truncatedAny || Boolean(resAtas.meta?.truncated);
      guard();
      const itemsAtas = Array.isArray(resAtas.data) ? resAtas.data : [];
      itemsAtas.forEach(it => it.tipoDocumento = "ata");
      rawItems = rawItems.concat(itemsAtas);

      if (citiesSubtitle) citiesSubtitle.textContent = "Buscando contratos...";
      const resContratos = await ApiPNCP.fetchAllPages(
        API_CONTRATOS,
        { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 200 },
        {
          signal: myCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems
        }
      );
      truncatedAny = truncatedAny || Boolean(resContratos.meta?.truncated);
      guard();
      const itemsContratos = Array.isArray(resContratos.data) ? resContratos.data : [];
      itemsContratos.forEach(it => it.tipoDocumento = "contrato");
      rawItems = rawItems.concat(itemsContratos);
    }

    // Se a busca de contratações falhou em todas as modalidades, mostra o último erro
    if ((!rawItems || rawItems.length === 0) && modalityErrors.length) {
      throw modalityErrors[modalityErrors.length - 1];
    }

    // Processa e agrupa por município
    currentCitiesData = {};
    let vacancyCount = 0;

    rawItems.forEach(item => {
      // garantia de UF (editais já vieram filtrados por uf)
      const ufEncontrada = resolveUf(item);
      if (ufEncontrada && ufEncontrada !== stateSigla) return;

      const objetoRaw = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]);
      if (!objetoRaw) return;

      const scored = scoreDoctorVacancy(objetoRaw);
      if (!scored.ok) return;

      if (!isOpportunityOpen(item)) return;

      item.relevanceScore = scored.score;

      const municipio = resolveMunicipio(item);
      if (!currentCitiesData[municipio]) currentCitiesData[municipio] = [];
      currentCitiesData[municipio].push(item);
      vacancyCount++;
    });

    guard();

    if (loadingCities) loadingCities.classList.add("hidden");

    const cityNames = Object.keys(currentCitiesData).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const truncMsg = truncatedAny ? " (busca truncada por limite de segurança)" : "";

    if (citiesSubtitle) citiesSubtitle.textContent = `${vacancyCount} oportunidade(s) encontrada(s) em ${cityNames.length} município(s)${truncMsg}.`;

    if (cityNames.length === 0) {
      citiesGrid.innerHTML =
        `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          Nenhuma oportunidade de contratação de médicos encontrada neste estado nos últimos 30 dias.
        </div>`;
      return;
    }

    cityNames.forEach(city => {
      const btn = document.createElement("button");
      const vagas = currentCitiesData[city].length;
      btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
      btn.onclick = () => {
        currentCitySelected = city;
        const vTitle = document.getElementById("vacanciesTitle");
        if (vTitle) vTitle.textContent = `Oportunidades em ${escapeHtmlAttr(city)} - ${escapeHtmlAttr(currentState)}`;
        setVacanciesBack('cities', 'Voltar aos Municípios');
        showView("vacancies");
        renderVacancies();
      };

      btn.innerHTML = `
        <div>
          <h3 class="text-[15px] font-bold text-slate-800">${escapeHtmlAttr(city)}</h3>
          <p class="text-xs text-blue-600 font-semibold mt-1">${vagas} oportunidade(s)</p>
        </div>
        <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      `;
      citiesGrid.appendChild(btn);
    });

  } catch (error) {
    if (loadingCities) loadingCities.classList.add("hidden");

    if (error && (error.name === "AbortError" || String(error).includes("AbortError"))) {
      // Cancelamento esperado (troca rápida de estado/retorno) — não exibe mensagem
      return;
    }

    if (citiesSubtitle) citiesSubtitle.innerHTML =
      `<span class="text-red-500 font-medium">Erro ao buscar os dados na API: ${escapeHtmlAttr(error?.message || error)}</span>`;
    console.error(error);
  }
}

// === RENDERIZAR E ORDENAR RESULTADOS ===
function renderVacancies() {
  const grid = document.getElementById("vacanciesGrid");
  grid.innerHTML = "";

  let vacancies = currentCitiesData[currentCitySelected] || [];

  // 1) Filtrar por tipo
  const tipoDoc = document.getElementById("filtroTipoDoc").value;
  if (tipoDoc !== "todos") {
    vacancies = vacancies.filter(v => v.tipoDocumento === tipoDoc);
  }

  // 2) Ordenação
  const ordenacao = document.getElementById("ordenacaoVagas").value;
  vacancies.sort((a, b) => {
    if (ordenacao === "relevante") {
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    }

    const dateA = ApiPNCP.parseDateMs(ApiPNCP.pick(a, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));
    const dateB = ApiPNCP.parseDateMs(ApiPNCP.pick(b, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));

    if (ordenacao === "recente") return dateB - dateA;
    if (ordenacao === "antigo") return dateA - dateB;
    return 0;
  });

  // botão exportar
  const exportBtn = document.getElementById('btnExportExcel');
  if (exportBtn) {
    const disabled = vacancies.length === 0;
    exportBtn.disabled = disabled;
    exportBtn.classList.toggle('opacity-50', disabled);
    exportBtn.classList.toggle('cursor-not-allowed', disabled);
    exportBtn.title = disabled ? 'Não há itens para exportar com os filtros atuais.' : 'Exportar resultados para Excel.';
  }

  if (vacancies.length === 0) {
    grid.innerHTML =
      `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        Nenhuma oportunidade encontrada com os filtros selecionados.
      </div>`;
    return;
  }

  vacancies.forEach(item => {
    const orgao =
      ApiPNCP.pick(item, ["orgaoNome", "orgaoEntidadeRazaoSocial", "nomeRazaoSocial", "nomeOrgao"])
      || (item.orgaoEntidade && (item.orgaoEntidade.razaoSocial || item.orgaoEntidade.nome))
      || "Órgão não informado";

    const objeto =
      ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"])
      || "Sem descrição.";

    const status = resolveStatusLower(item);
    const dataPub = ApiPNCP.pick(item, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]);
    const formatData = dataPub ? ApiPNCP.formatDateBR(dataPub) : "";

    const linkSeguro = buildSafeLink(item);

    let badgeColor = "bg-green-50 text-green-700 border-green-100";
    let badgeText = "Oportunidade (Edital)";
    if (item.tipoDocumento === "ata") {
      badgeColor = "bg-purple-50 text-purple-700 border-purple-100";
      badgeText = "Ata (Histórico)";
    } else if (item.tipoDocumento === "contrato") {
      badgeColor = "bg-orange-50 text-orange-700 border-orange-100";
      badgeText = "Contrato (Histórico)";
    }

    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between h-full shadow-sm hover:shadow-md transition-all";
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start mb-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeColor}">${badgeText}</span>
          <span class="text-xs text-slate-400 font-medium">${escapeHtmlAttr(formatData)}</span>
        </div>

        <h3 class="text-sm font-bold text-slate-800 mb-2 line-clamp-2" title="${escapeHtmlAttr(orgao)}">${escapeHtmlAttr(orgao)}</h3>

        ${status ? `<p class="text-[11px] text-slate-500 mb-2"><span class="font-semibold">Status:</span> ${escapeHtmlAttr(status)}</p>` : ""}

        <p class="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4 line-clamp-4" title="${escapeHtmlAttr(objeto)}">${escapeHtmlAttr(objeto)}</p>
      </div>

      <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Relevância: ${Number(item.relevanceScore || 0)}</span>
        ${linkSeguro ? `
          <div class="flex items-center gap-2">
            <button type="button" data-action="extract-pdf" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all shadow-sm">
              Extrair do edital
            </button>
            <a href="${escapeHtmlAttr(linkSeguro)}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm">
              Ver Oficial
            </a>
          </div>
        ` : `
          <div class="flex items-center gap-2">
            <button type="button" data-action="extract-pdf" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all shadow-sm">
              Extrair do edital
            </button>
            <span class="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded font-medium">Link indisponível</span>
          </div>
        `}
      </div>
    `;

    const btnPdf = card.querySelector('[data-action="extract-pdf"]');
    if (btnPdf) {
      btnPdf.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        extractFromEditalPdf(item);
      });
    }

    grid.appendChild(card);
  });
}

function exportVacanciesExcel() {
  const { vacancies, tipoDoc, ordenacao } = getCurrentFilteredVacancies();

  if (!vacancies || vacancies.length === 0) {
    alert('Não há itens para exportar com os filtros atuais.');
    return;
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const stateTag = safeFilename(currentState || currentRegion || 'BR');
  const cityTag = safeFilename(currentCitySelected || 'resultados');
  const baseName = `vagas_medicos_${stateTag}_${cityTag}_${dateTag}`;

  const rows = vacancies.map((item, idx) => {
    const orgao =
      ApiPNCP.pick(item, ["orgaoNome", "orgaoEntidadeRazaoSocial", "nomeRazaoSocial", "nomeOrgao"]) ||
      (item.orgaoEntidade && (item.orgaoEntidade.razaoSocial || item.orgaoEntidade.nome)) ||
      "Órgão não informado";

    const objeto =
      ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]) ||
      "";

    const dataPub = ApiPNCP.pick(item, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]);
    const dataFmt = dataPub ? ApiPNCP.formatDateBR(dataPub) : "";

    const uf = String(resolveUf(item) || currentState || "").toUpperCase();
    const municipio = resolveMunicipio(item);

    const status = resolveStatusLower(item);
    const link = buildSafeLink(item);

    const tipo = item.tipoDocumento === 'edital'
      ? 'Edital/Contratação'
      : (item.tipoDocumento === 'ata' ? 'Ata' : (item.tipoDocumento === 'contrato' ? 'Contrato' : String(item.tipoDocumento || '')));

    return {
      "#": idx + 1,
      "Tipo": tipo,
      "UF": uf,
      "Município": municipio,
      "Órgão": orgao,
      "Data": dataFmt,
      "Status": status,
      "Descrição": objeto,
      "Relevância": Number(item.relevanceScore || 0),
      "Link": link
    };
  });

  const metaAoa = [
    ["Exportado em", now.toLocaleString('pt-BR')],
    ["Região", currentRegion || ""],
    ["Estado (UF)", currentState || ""],
    ["Município", currentCitySelected || ""],
    ["Período", "Últimos 30 dias"],
    ["Filtro (tipo)", tipoDoc],
    ["Ordenação", ordenacao],
    ["Total itens", rows.length]
  ];

  // XLSX (se disponível) — caso contrário, CSV
  if (window.XLSX && window.XLSX.utils) {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);
    ws1['!cols'] = [
      { wch: 5 },  // #
      { wch: 18 }, // Tipo
      { wch: 6 },  // UF
      { wch: 22 }, // Município
      { wch: 42 }, // Órgão
      { wch: 12 }, // Data
      { wch: 18 }, // Status
      { wch: 70 }, // Descrição
      { wch: 10 }, // Relevância
      { wch: 55 }  // Link
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resultados');

    const ws2 = XLSX.utils.aoa_to_sheet(metaAoa);
    ws2['!cols'] = [{ wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Consulta');

    XLSX.writeFile(wb, `${baseName}.xlsx`, { compression: true });
    return;
  }

  // Fallback CSV (Excel abre normalmente)
  const sep = ';';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? '');
    const q = s.replaceAll('"', '""');
    return `"${q}"`;
  };
  const csv = [
    '\uFEFF'.replace('\\uFEFF','\uFEFF') + headers.map(esc).join(sep),
    ...rows.map(r => headers.map(h => esc(r[h])).join(sep))
  ].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

document.addEventListener("DOMContentLoaded", initDashboard);
