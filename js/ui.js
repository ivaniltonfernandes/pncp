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

    box.innerHTML = `
      <div class="rm-title">${escapeHtmlAttr(region)}</div>
      <div class="rm-sub"><span data-region-count="${escapeHtmlAttr(region)}">—</span> vagas</div>
    `;

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

async function updateRegionCountsUI() {
  const regions = Object.keys(mapData);
  const counts = Object.fromEntries(regions.map(r => [r, 0]));

  try {
    const cache = await loadPncpCache();
    guard();
    const items = Array.isArray(cache?.items) ? cache.items : [];

    items.forEach(it => {
      const uf = String(resolveUf(it) || "").toUpperCase();
      const region = UF_TO_REGION[uf];
      if (!region) return;
      counts[region] = (counts[region] || 0) + 1;
    });
  } catch (_) {
    // sem cache: mantém 0/placeholder
  }

  regions.forEach(region => {
    const count = counts[region] || 0;
    document.querySelectorAll(`[data-region-count="${region}"]`).forEach(sp => sp.textContent = String(count));
  });
}

// ====== /Mapa por Regiões (SVG real agrupado) ======



// Modalidades consultadas (contratações por data de publicação)
const MODALIDADES_BUSCA = ["12","9","8","6","7","4","5","3","10","11","2"];

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
  "reagente", "laboratorio", "exame", "exames", "tomografia", "ultrassom", "raio x", "radiologia",
  "plano de saude",
  "planos de saude",
  "convenio",
  "convenios",
  "assistencia medica",
  "assistencia medico",
  "assistencia medico hospitalar",
  "assistencia medico-hospitalar",
  "seguro saude",
  "operadora",
  "operadoras",
  "beneficio",
  "beneficios",
];

const SAFETY_LIMITS = {
  maxPages: 80,
  maxItems: 15000,
  pageDelayMs: 120,
  timeoutMs: 20000
};

let currentRegion = "";
let currentState = "";
let currentCitySelected = "";
let currentCitiesData = {};
let currentAbortCtrl = null;
let currentAbortToken = 0;
// === CACHE (GitHub Actions) ===
let _pncpCache = null;
let _pncpCachePromise = null;

async function loadPncpCache() {
  if (_pncpCache) return _pncpCache;
  if (_pncpCachePromise) return _pncpCachePromise;

  _pncpCachePromise = (async () => {
    try {
      const resp = await fetch('./data/cache.json', { cache: 'no-store' });
      if (!resp.ok) return null;
      const json = await resp.json();
      const items = Array.isArray(json?.items) ? json.items : Array.isArray(json?.data) ? json.data : [];
      if (!Array.isArray(items) || items.length === 0) {
        _pncpCache = { meta: json || {}, items: [] };
        return _pncpCache;
      }
      _pncpCache = { meta: json || {}, items };
      return _pncpCache;
    } catch (_) {
      return null;
    } finally {
      _pncpCachePromise = null;
    }
  })();

  return _pncpCachePromise;
}


function normalizePtText(s) {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return t;
}

function buildSearchText(item) {
  // Concatena campos onde a palavra "médico(s)" pode aparecer.
  const parts = [
    ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoContratacao", "objetoAta", "objetoContrato"]),
    ApiPNCP.pick(item, ["informacaoComplementar", "informacaoComplementarObjeto", "informacoesComplementares"]),
    ApiPNCP.pick(item, ["processo", "numeroProcesso", "processoCompra"]),
    ApiPNCP.pick(item, ["tipoInstrumentoConvocatorioNome", "modalidadeNome", "unidadeOrgaoNome", "orgaoNome"])
  ].filter(Boolean);

  return parts.join(" | ");
}


function scoreDoctorVacancy(text) {
  // Regra principal: achar a palavra-chave "médico/medicos/medica/medicas" (sem depender de outros termos).
  // Os termos de contratação apenas aumentam relevância (ranking), mas NÃO bloqueiam o resultado.
  const t = normalizePtText(text);
  if (!t) return { ok: false, score: 0 };

  // Palavra-chave solicitada (medico/medicos/medica/medicas) – evita confundir com "medicamento".
  const hasDoctorKeyword = /\bmedic[oa]s?\b/.test(t);

  // Sinais de contratação (usado para rankear)
  const hasHiring =
    HIRING_TERMS.some(term => t.includes(term)) ||
    /\bcredenciament\w*\b/.test(t) ||
    /\bchamament\w*\b/.test(t) ||
    /\bcontrat\w*\b/.test(t) ||
    /\bpresta\w*\b/.test(t);

  // Exclusões (compras/insumos/planos/benefícios etc.)
  const hasExclude = EXCLUDE_TERMS.some(term => t.includes(term));

  let score = 0;

  // Base: palavra-chave médico
  if (hasDoctorKeyword) score += 4;

  // Relevância por termos de contratação
  if (hasHiring) score += 3;

  if (t.includes("credenciamento")) score += 3;
  if (t.includes("chamamento publico")) score += 3;

  if (t.includes("prestacao de servicos") || t.includes("prestacao de servico")) score += 2;
  if (t.includes("servicos medicos") || t.includes("servico medico")) score += 2;

  if (t.includes("plantao") || t.includes("plantoes") || t.includes("plantonista")) score += 2;
  if (t.includes("vaga") || t.includes("vagas")) score += 1;

  // Especialidades (melhor ranking)
  for (const sp of ["pediatra","psiquiatra","anestesiologista","ginecologista","obstetra","ortopedista","cardiologista","urologista","dermatologista","infectologista","intensivista","urgencista","emergencista"]) {
    if (t.includes(sp)) score += 1;
  }

  // Penalidades fortes para compras/insumos
  if (hasExclude) score -= 9;
  if (t.includes("aquisicao") && !t.includes("servic")) score -= 4;
  if (t.includes("fornecimento") && !t.includes("mao de obra") && !t.includes("servic")) score -= 2;

  const ok = Boolean(hasDoctorKeyword && !hasExclude);
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

// ====== Links oficiais PNCP (Editais/Atas/Contratos) ======

function parsePncpId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  // Formato comum: CNPJ-<algo>-<numero>/<ano>
  let m = s.match(/(\d{14})-[^-]+-([0-9]+)\/(\d{4})/);
  if (m) {
    return {
      cnpj: m[1],
      numero: String(m[2]).replace(/^0+(?=\d)/, ""), // remove zeros à esquerda (mantém '0' se for só zero)
      ano: m[3]
    };
  }

  // Fallback: tenta achar "CNPJ ... numero/ano" em qualquer lugar
  m = s.match(/(\d{14}).*?([0-9]+)\/(\d{4})/);
  if (m) {
    return {
      cnpj: m[1],
      numero: String(m[2]).replace(/^0+(?=\d)/, ""),
      ano: m[3]
    };
  }

  return null;
}

function normalizePncpNumero(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  // já é número puro
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "");

  // tenta extrair "...-<numero>/<ano>"
  let m = s.match(/-([0-9]+)\/(\d{4})$/);
  if (m) return String(m[1]).replace(/^0+(?=\d)/, "");

  // tenta extrair "<numero>/<ano>"
  m = s.match(/([0-9]+)\/(\d{4})$/);
  if (m) return String(m[1]).replace(/^0+(?=\d)/, "");

  return "";
}

function normalizePncpAno(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return s;

  // tenta extrair ano de ".../<ano>"
  const m = s.match(/\/(\d{4})$/);
  if (m) return m[1];

  return "";
}

function isValidPncpPortalLink(url, tipoDocumento) {
  const u = String(url || "").trim();
  if (!u) return false;

  if (tipoDocumento === "edital") return /^https:\/\/pncp\.gov\.br\/app\/editais\/\d{14}\/\d{4}\/\d+/.test(u);
  if (tipoDocumento === "ata") return /^https:\/\/pncp\.gov\.br\/app\/atas\/\d{14}\/\d{4}\/\d+/.test(u);
  if (tipoDocumento === "contrato") return /^https:\/\/pncp\.gov\.br\/app\/contratos\/\d{14}\/\d{4}\/\d+/.test(u);
  return /^https?:\/\//.test(u);
}

function canonicalizeUrlMaybe(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return "https://pncp.gov.br" + s;
  return "https://" + s;
}

function buildPncpPortalLink(item) {
  const tipo = item?.tipoDocumento || "";

  // 1) se o cache já trouxe um link oficial pronto, use-o
  const fromCache = ApiPNCP.pick(item, ["linkOficial", "linkOficialPncp", "urlOficial"]);
  if (fromCache) {
    const u = canonicalizeUrlMaybe(fromCache);
    if (isValidPncpPortalLink(u, tipo)) return u;
  }

  // 2) cnpj / ano / numero: tenta em várias fontes
  let cnpjRaw = ApiPNCP.pick(item, ["cnpj", "numeroInscricaoCnpj", "cnpjOrgao"]) || (item.orgaoEntidade && item.orgaoEntidade.cnpj) || "";
  let cnpj = ApiPNCP.onlyDigits(cnpjRaw);

  let ano = normalizePncpAno(ApiPNCP.pick(item, ["anoCompra", "anoAta", "anoContrato", "ano"]));
  let numero = "";

  if (tipo === "edital") numero = normalizePncpNumero(ApiPNCP.pick(item, ["numeroCompra", "sequencialCompra", "numero"]));
  else if (tipo === "ata") numero = normalizePncpNumero(ApiPNCP.pick(item, ["numeroAta", "numero"]));
  else if (tipo === "contrato") numero = normalizePncpNumero(ApiPNCP.pick(item, ["numeroContrato", "numero"]));

  // 3) se ainda faltar algo, tenta extrair do id PNCP (quando vier)
  if (!cnpj || !ano || !numero) {
    const idRaw = ApiPNCP.pick(item, [
      "idContratacaoPncp", "idContratacaoPNCP", "idCompraPncp", "idCompraPNCP",
      "idContratacao", "idCompra", "id"
    ]);
    const parsed = parsePncpId(idRaw);
    if (parsed) {
      if (!cnpj) cnpj = parsed.cnpj;
      if (!ano) ano = parsed.ano;
      if (!numero) numero = parsed.numero;
    }
  }

  // 4) monta link oficial do portal
  if (cnpj.length === 14 && /^\d{4}$/.test(ano) && /^\d+$/.test(numero)) {
    if (tipo === "edital") return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${numero}`;
    if (tipo === "ata") return `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${numero}`;
    if (tipo === "contrato") return `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${numero}`;
  }

  // 5) fallback: link do sistema origem / url crua
  const linkBruto = ApiPNCP.pick(item, ["linkSistemaOrigem", "link", "url"]);
  if (linkBruto) {
    const u = canonicalizeUrlMaybe(linkBruto);
    if (u) return u;
  }

  return "";
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

function initDashboard() {
  renderRegionMap();
  updateRegionCountsUI();

  // Card "Vagas Nacionais"
  const natBtn = document.getElementById('nationalVacanciesCard');
  if (natBtn) {
    natBtn.onclick = () => openNationalVacancies();
  }
  updateNationalCardUI();


  showView("regions");
}


// ====== Vagas Nacionais (abrangência nacional) ======

const NATIONAL_CITY_KEY = "__NACIONAL__";

function setVacanciesBack(viewName, labelText) {
  const btn = document.getElementById('vacanciesBackBtn');
  const lbl = document.getElementById('vacanciesBackLabel');
  if (lbl) lbl.textContent = labelText || "Voltar";
  if (btn) btn.onclick = () => showView(viewName);
}

function isNationalItem(item) {
  const uf = String(resolveUf(item) || "").toUpperCase();
  if (!uf || uf === "BR") return true;

  const objeto = ApiPNCP.pick(item, [
    "objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao",
    "informacoesComplementares", "justificativa", "observacao"
  ]) || "";

  const t = normalizePtText(objeto);
  if (!t) return false;

  // heurísticas comuns para abrangência nacional
  return (
    t.includes("abrangencia nacional") ||
    t.includes("ambito nacional") ||
    t.includes("alcance nacional") ||
    t.includes("todo o territorio nacional") ||
    /\bnacional\b/.test(t)
  );
}

async function updateNationalCardUI() {
  const sp = document.getElementById('nationalVacanciesCount');
  if (!sp) return;

  try {
    const cache = await loadPncpCache();
    guard();
    const items = Array.isArray(cache?.items) ? cache.items : [];

    let n = 0;
    items.forEach(item => {
      if (!isNationalItem(item)) return;

      const objetoRaw = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]) || "";
      const scored = scoreDoctorVacancy(objetoRaw);
      if (!scored.ok) return;
      if (!isOpportunityOpen(item)) return;

      n++;
    });

    sp.textContent = String(n);
  } catch (_) {
    sp.textContent = "0";
  }
}

async function openNationalVacancies() {
  // tenta montar lista a partir do cache
  const vTitle = document.getElementById("vacanciesTitle");
  if (vTitle) vTitle.textContent = "Vagas Nacionais";

  setVacanciesBack('regions', 'Voltar às Regiões');

  let items = [];
  try {
    const cache = await loadPncpCache();
    guard();
    const all = Array.isArray(cache?.items) ? cache.items : [];

    all.forEach(item => {
      if (!isNationalItem(item)) return;

      const objetoRaw = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]) || "";
      const scored = scoreDoctorVacancy(objetoRaw);
      if (!scored.ok) return;
      if (!isOpportunityOpen(item)) return;

      item.relevanceScore = item.relevanceScore || scored.score;
      item.tipoDocumento = item.tipoDocumento || "edital"; // cache é de propostas em aberto

      items.push(item);
    });
  } catch (_) {
    items = [];
  }

  currentCitiesData = { [NATIONAL_CITY_KEY]: items };
  currentCitySelected = NATIONAL_CITY_KEY;

  showView('vacancies');
  renderVacancies();
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
  if (citiesSubtitle) citiesSubtitle.textContent = "Buscando por palavra-chave: médico / médicos (últimos 30 dias)...";
  if (citiesGrid) citiesGrid.innerHTML = "";
  if (loadingCities) loadingCities.classList.remove("hidden");

  showView("cities");

  const { dataInicial, dataFinal } = ApiPNCP.getDateRange(30);

  // 0) Tenta usar cache gerado por GitHub Actions (se existir)
  try {
    const cache = await loadPncpCache();
    guard();
    const cacheItems = Array.isArray(cache?.items) ? cache.items : [];
    const ufItems = cacheItems.filter(it => String(resolveUf(it) || '').toUpperCase() === String(stateSigla || '').toUpperCase());

    if (ufItems.length > 0) {
      // Processa e agrupa por município usando o mesmo filtro
      currentCitiesData = {};
      let vacancyCount = 0;

      ufItems.forEach(item => {
        const searchText = buildSearchText(item);
        if (!searchText) return;

        const scored = scoreDoctorVacancy(searchText);
        if (!scored.ok) return;
        if (!isOpportunityOpen(item)) return;

        item.relevanceScore = item.relevanceScore || scored.score;
        item.tipoDocumento = item.tipoDocumento || "edital";

        const municipio = resolveMunicipio(item);
        if (!currentCitiesData[municipio]) currentCitiesData[municipio] = [];
        currentCitiesData[municipio].push(item);
        vacancyCount++;
      });

      guard();

      if (loadingCities) loadingCities.classList.add("hidden");

      const cityNames = Object.keys(currentCitiesData).sort((a, b) => a.localeCompare(b, "pt-BR"));
      const genAt = cache?.meta?.generatedAt ? ` | cache: ${String(cache.meta.generatedAt).replace('T',' ').replace('Z',' UTC')}` : "";

      if (citiesSubtitle) citiesSubtitle.textContent = `${vacancyCount} oportunidade(s) encontrada(s) em ${cityNames.length} município(s).${genAt}`;

      if (cityNames.length === 0) {
        if (citiesGrid) citiesGrid.innerHTML =
          `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            Nenhuma oportunidade de contratação de médicos encontrada neste estado no cache atual.
          </div>`;
        return;
      }

      // Render lista de municípios (mesma UI do fluxo normal)
      if (citiesGrid) citiesGrid.innerHTML = "";
      cityNames.forEach(city => {
        const btn = document.createElement("button");
        const vagas = currentCitiesData[city].length;
        btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
        btn.onclick = () => {
          currentCitySelected = city;
          const vTitle = document.getElementById("vacanciesTitle");
          if (vTitle) vTitle.textContent = `Oportunidades em ${escapeHtmlAttr(city)} - ${escapeHtmlAttr(currentState)}`;
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

      return;
    }
  } catch (_) {
    // se cache falhar, continua com busca ao vivo
  }

  try {
    let rawItems = [];
    let truncatedAny = false;

    // 1) EDITAIS / CONTRATAÇÕES (filtra por UF no endpoint)
    for (let i = 0; i < MODALIDADES_BUSCA.length; i++) {
      guard();
      const mod = MODALIDADES_BUSCA[i];

      if (citiesSubtitle) citiesSubtitle.textContent = `Buscando contratações (modalidade ${mod})...`;

      const res = await ApiPNCP.fetchAllPages(
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

    // Processa e agrupa por município
    currentCitiesData = {};
    let vacancyCount = 0;

    rawItems.forEach(item => {
      // garantia de UF (editais já vieram filtrados por uf)
      const ufEncontrada = resolveUf(item);
      if (ufEncontrada && ufEncontrada !== stateSigla) return;

      const searchText = buildSearchText(item);
        if (!searchText) return;

        const scored = scoreDoctorVacancy(searchText);
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

    const linkSeguro = buildPncpPortalLink(item);

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
          <a href="${escapeHtmlAttr(linkSeguro)}" target="_blank" rel="noopener noreferrer" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm">
            Ver Oficial
          </a>
        ` : '<span class="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded font-medium">Link indisponível</span>'}
      </div>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", initDashboard);
