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

// Modalidades consultadas (contratações por data de publicação)
const MODALIDADES_BUSCA = ["6", "8", "2", "3", "7"];

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
  timeoutMs: 20000
};

let currentRegion = "";
let currentState = "";
let currentCitySelected = "";
let currentCitiesData = {};
let currentAbortCtrl = null;
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

function initDashboard() {
  const grid = document.getElementById("regionsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  Object.keys(mapData).forEach(region => {
    const btn = document.createElement("button");
    btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
    btn.onclick = () => openRegion(region);

    btn.innerHTML = `
      <div>
        <h3 class="text-lg font-bold text-slate-800">${escapeHtmlAttr(region)}</h3>
        <p class="text-sm text-slate-500 mt-1">${mapData[region].length} estados</p>
      </div>
      <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    `;
    grid.appendChild(btn);
  });

  showView("regions");
}

function openRegion(region) {
  currentRegion = region;
  const title = document.getElementById("statesTitle");
  if (title) title.textContent = `Estados em ${region}`;

  const grid = document.getElementById("statesGrid");
  grid.innerHTML = "";

  mapData[region].forEach(st => {
    const btn = document.createElement("button");
    btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
    btn.onclick = () => openState(st.nome, st.sigla);

    btn.innerHTML = `
      <div>
        <h3 class="text-[15px] font-bold text-slate-800">${escapeHtmlAttr(st.nome)}</h3>
        <p class="text-xs text-slate-500 mt-1">UF: ${escapeHtmlAttr(st.sigla)}</p>
      </div>
      <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    `;
    grid.appendChild(btn);
  });

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

  // cancela busca anterior
  if (currentAbortCtrl) {
    try { currentAbortCtrl.abort(); } catch (_) {}
  }
  currentAbortCtrl = new AbortController();

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

  // 0) Tenta usar cache gerado por GitHub Actions (se existir)
  try {
    const cache = await loadPncpCache();
    const cacheItems = Array.isArray(cache?.items) ? cache.items : [];
    const ufItems = cacheItems.filter(it => String(resolveUf(it) || '').toUpperCase() === String(stateSigla || '').toUpperCase());

    if (ufItems.length > 0) {
      // Processa e agrupa por município usando o mesmo filtro
      currentCitiesData = {};
      let vacancyCount = 0;

      ufItems.forEach(item => {
        const objetoRaw = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]);
        if (!objetoRaw) return;

        const scored = scoreDoctorVacancy(objetoRaw);
        if (!scored.ok) return;
        if (!isOpportunityOpen(item)) return;

        item.relevanceScore = item.relevanceScore || scored.score;

        const municipio = resolveMunicipio(item);
        if (!currentCitiesData[municipio]) currentCitiesData[municipio] = [];
        currentCitiesData[municipio].push(item);
        vacancyCount++;
      });

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
          signal: currentAbortCtrl.signal,
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

      if (i < MODALIDADES_BUSCA.length - 1) await ApiPNCP.sleep(220, currentAbortCtrl.signal);
    }

    // 2) (Opcional) Atas e Contratos (histórico) — desativado por padrão
    if (INCLUDE_SIGNED_DOCS) {
      if (citiesSubtitle) citiesSubtitle.textContent = "Buscando atas de registro de preços...";
      const resAtas = await ApiPNCP.fetchAllPages(
        API_ATAS,
        { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 200 },
        {
          signal: currentAbortCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems
        }
      );
      truncatedAny = truncatedAny || Boolean(resAtas.meta?.truncated);
      const itemsAtas = Array.isArray(resAtas.data) ? resAtas.data : [];
      itemsAtas.forEach(it => it.tipoDocumento = "ata");
      rawItems = rawItems.concat(itemsAtas);

      if (citiesSubtitle) citiesSubtitle.textContent = "Buscando contratos...";
      const resContratos = await ApiPNCP.fetchAllPages(
        API_CONTRATOS,
        { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 200 },
        {
          signal: currentAbortCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems
        }
      );
      truncatedAny = truncatedAny || Boolean(resContratos.meta?.truncated);
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
      if (citiesSubtitle) citiesSubtitle.textContent = "Busca cancelada (você selecionou outro estado).";
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

    const cnpjRaw = ApiPNCP.pick(item, ["cnpj", "numeroInscricaoCnpj", "cnpjOrgao"]) || (item.orgaoEntidade && item.orgaoEntidade.cnpj) || "";
    const cnpj = ApiPNCP.onlyDigits(cnpjRaw);
    let linkSeguro = "";

    if (item.tipoDocumento === "edital" && cnpj.length === 14 && item.anoCompra && item.numeroCompra) {
      linkSeguro = `https://pncp.gov.br/app/editais/${cnpj}/${item.anoCompra}/${item.numeroCompra}`;
    } else if (item.tipoDocumento === "ata" && cnpj.length === 14 && item.anoAta && item.numeroAta) {
      linkSeguro = `https://pncp.gov.br/app/atas/${cnpj}/${item.anoAta}/${item.numeroAta}`;
    } else if (item.tipoDocumento === "contrato" && cnpj.length === 14 && item.anoContrato && item.numeroContrato) {
      linkSeguro = `https://pncp.gov.br/app/contratos/${cnpj}/${item.anoContrato}/${item.numeroContrato}`;
    } else {
      const linkBruto = ApiPNCP.pick(item, ["linkSistemaOrigem", "link", "url"]);
      if (linkBruto) {
        const s = String(linkBruto).trim();
        if (s.startsWith("http://") || s.startsWith("https://")) linkSeguro = s;
        else if (s.startsWith("//")) linkSeguro = "https:" + s;
        else if (s.startsWith("/")) linkSeguro = "https://pncp.gov.br" + s;
        else linkSeguro = "https://" + s;
      }
    }

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
