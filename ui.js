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

// Palavras-chave para detectar documentos com possível vaga/serviço médico
const MEDICAL_KEYWORDS = ["médico", "medico", "medicina", "plantão", "plantao", "clínico", "clinico", "psiquiatra", "pediatra", "saúde", "hospitalar"];

// Limites de segurança para não travar o navegador em estados muito volumosos
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

function showView(viewName) {
  ['regions', 'states', 'cities', 'vacancies'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('block');
  });
  const target = document.getElementById(`view-${viewName}`);
  if (!target) return;
  target.classList.remove('hidden');
  target.classList.add('block');
}

function initDashboard() {
  const grid = document.getElementById('regionsGrid');
  grid.innerHTML = '';
  Object.keys(mapData).forEach(region => {
    const btn = document.createElement('button');
    btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
    btn.onclick = () => openRegion(region);
    btn.innerHTML = `
      <div>
        <h3 class="text-lg font-bold text-slate-800">${region}</h3>
        <p class="text-sm text-slate-500 mt-1">${mapData[region].length} estados</p>
      </div>
      <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </div>
    `;
    grid.appendChild(btn);
  });
}

function openRegion(regionName) {
  currentRegion = regionName;
  document.getElementById('statesTitle').textContent = `Estados - ${regionName}`;
  const grid = document.getElementById('statesGrid');
  grid.innerHTML = '';

  mapData[regionName].forEach(state => {
    const btn = document.createElement('button');
    btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group";
    btn.onclick = () => openState(state.nome, state.sigla);
    btn.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-bold text-slate-800">${state.nome}</h3>
          <span class="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded mt-1 inline-block">${state.sigla}</span>
        </div>
        <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </div>
    `;
    grid.appendChild(btn);
  });
  showView('states');
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function resolveObjetoLower(item) {
  const raw = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto", "objetoAta", "objetoContrato", "objetoContratacao"]);
  return String(raw || "").toLowerCase();
}

function computeRelevance(objetoLower) {
  let relScore = 0;
  for (const kw of MEDICAL_KEYWORDS) {
    const regex = new RegExp(kw, "gi");
    const matches = objetoLower.match(regex);
    if (matches) relScore += matches.length;
  }
  return relScore;
}

async function openState(stateName, stateSigla) {
  currentState = stateSigla;

  // Cancela busca anterior (se o usuário clicar rápido em outro estado)
  if (currentAbortCtrl) {
    try { currentAbortCtrl.abort(); } catch {}
  }
  currentAbortCtrl = new AbortController();

  document.getElementById('citiesTitle').textContent = `Documentos em ${stateName}`;
  document.getElementById('citiesSubtitle').textContent = "Buscando Editais, Atas e Contratos médicos (últimos 30 dias)...";
  document.getElementById('citiesGrid').innerHTML = '';
  document.getElementById('loadingCities').classList.remove('hidden');
  showView('cities');

  const { dataInicial, dataFinal } = ApiPNCP.getDateRange(30);

  try {
    let rawItems = [];
    let truncatedAny = false;

    // 1) EDITAIS / CONTRATAÇÕES (já filtrando por UF via parâmetro uf)
    for (let i = 0; i < MODALIDADES_BUSCA.length; i++) {
      const mod = MODALIDADES_BUSCA[i];

      document.getElementById('citiesSubtitle').textContent = `Buscando contratações (modalidade ${mod})...`;

      const res = await ApiPNCP.fetchAllPages(
        API_EDITAIS,
        {
          dataInicial,
          dataFinal,
          codigoModalidadeContratacao: mod,
          uf: stateSigla,
          pagina: 1,
          tamanhoPagina: 500
        },
        {
          signal: currentAbortCtrl.signal,
          timeoutMs: SAFETY_LIMITS.timeoutMs,
          pageDelayMs: SAFETY_LIMITS.pageDelayMs,
          maxPages: SAFETY_LIMITS.maxPages,
          maxItems: SAFETY_LIMITS.maxItems,
          onProgress: (p) => {
            document.getElementById('citiesSubtitle').textContent =
              `Buscando contratações (modalidade ${mod})... página ${p.page}${p.totalPages ? " de " + p.totalPages : ""} (${p.itemsSoFar} itens)`;
          }
        }
      );

      truncatedAny = truncatedAny || Boolean(res.meta?.truncated);

      const items = Array.isArray(res.data) ? res.data : [];
      items.forEach(it => it.tipoDocumento = 'edital');
      rawItems = rawItems.concat(items);

      if (i < MODALIDADES_BUSCA.length - 1) await ApiPNCP.sleep(250, currentAbortCtrl.signal);
    }

    await ApiPNCP.sleep(200, currentAbortCtrl.signal);

    // 2) ATAS DE REGISTRO (a API do manual não expõe filtro uf aqui; filtramos depois)
    document.getElementById('citiesSubtitle').textContent = "Buscando atas de registro de preços...";
    const resAtas = await ApiPNCP.fetchAllPages(
      API_ATAS,
      { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 500 },
      {
        signal: currentAbortCtrl.signal,
        timeoutMs: SAFETY_LIMITS.timeoutMs,
        pageDelayMs: SAFETY_LIMITS.pageDelayMs,
        maxPages: SAFETY_LIMITS.maxPages,
        maxItems: SAFETY_LIMITS.maxItems,
        onProgress: (p) => {
          document.getElementById('citiesSubtitle').textContent =
            `Buscando atas... página ${p.page}${p.totalPages ? " de " + p.totalPages : ""} (${p.itemsSoFar} itens)`;
        }
      }
    );
    truncatedAny = truncatedAny || Boolean(resAtas.meta?.truncated);

    const itemsAtas = Array.isArray(resAtas.data) ? resAtas.data : [];
    itemsAtas.forEach(it => it.tipoDocumento = 'ata');
    rawItems = rawItems.concat(itemsAtas);

    await ApiPNCP.sleep(200, currentAbortCtrl.signal);

    // 3) CONTRATOS (sem filtro uf no endpoint principal; filtramos depois)
    document.getElementById('citiesSubtitle').textContent = "Buscando contratos...";
    const resContratos = await ApiPNCP.fetchAllPages(
      API_CONTRATOS,
      { dataInicial, dataFinal, pagina: 1, tamanhoPagina: 500 },
      {
        signal: currentAbortCtrl.signal,
        timeoutMs: SAFETY_LIMITS.timeoutMs,
        pageDelayMs: SAFETY_LIMITS.pageDelayMs,
        maxPages: SAFETY_LIMITS.maxPages,
        maxItems: SAFETY_LIMITS.maxItems,
        onProgress: (p) => {
          document.getElementById('citiesSubtitle').textContent =
            `Buscando contratos... página ${p.page}${p.totalPages ? " de " + p.totalPages : ""} (${p.itemsSoFar} itens)`;
        }
      }
    );
    truncatedAny = truncatedAny || Boolean(resContratos.meta?.truncated);

    const itemsContratos = Array.isArray(resContratos.data) ? resContratos.data : [];
    itemsContratos.forEach(it => it.tipoDocumento = 'contrato');
    rawItems = rawItems.concat(itemsContratos);

    // Processa e agrupa por município
    currentCitiesData = {};
    let medicalCount = 0;

    rawItems.forEach(item => {
      // Filtra por UF quando necessário (edital já veio filtrado por uf)
      const ufEncontrada = resolveUf(item);
      if (ufEncontrada && ufEncontrada !== stateSigla) return;

      const objetoLower = resolveObjetoLower(item);
      if (!objetoLower) return;

      const isMedical = MEDICAL_KEYWORDS.some(kw => objetoLower.includes(kw));
      if (!isMedical) return;

      item.relevanceScore = computeRelevance(objetoLower);

      const municipio = resolveMunicipio(item);

      if (!currentCitiesData[municipio]) currentCitiesData[municipio] = [];
      currentCitiesData[municipio].push(item);
      medicalCount++;
    });

    document.getElementById('loadingCities').classList.add('hidden');

    const cityNames = Object.keys(currentCitiesData).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const truncMsg = truncatedAny ? " (busca truncada por limite de segurança)" : "";
    document.getElementById('citiesSubtitle').textContent = `${medicalCount} documentos encontrados em ${cityNames.length} municípios${truncMsg}.`;

    if (cityNames.length === 0) {
      document.getElementById('citiesGrid').innerHTML =
        `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          Nenhum documento médico encontrado neste estado nos últimos 30 dias.
        </div>`;
      return;
    }

    cityNames.forEach(city => {
      const btn = document.createElement('button');
      const vagas = currentCitiesData[city].length;
      btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
      btn.onclick = () => {
        currentCitySelected = city;
        document.getElementById('vacanciesTitle').textContent = `Documentos em ${city} - ${currentState}`;
        showView('vacancies');
        renderVacancies();
      };
      btn.innerHTML = `
        <div>
          <h3 class="text-[15px] font-bold text-slate-800">${escapeHtmlAttr(city)}</h3>
          <p class="text-xs text-blue-600 font-semibold mt-1">${vagas} documento(s)</p>
        </div>
        <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      `;
      document.getElementById('citiesGrid').appendChild(btn);
    });

  } catch (error) {
    document.getElementById('loadingCities').classList.add('hidden');

    // Se foi cancelamento, não mostra como erro
    if (error && (error.name === "AbortError" || String(error).includes("AbortError"))) {
      document.getElementById('citiesSubtitle').textContent = "Busca cancelada (você selecionou outro estado).";
      return;
    }

    document.getElementById('citiesSubtitle').innerHTML =
      `<span class="text-red-500 font-medium">Erro ao buscar os dados na API: ${escapeHtmlAttr(error?.message || error)}</span>`;
    console.error(error);
  }
}

// === RENDERIZAR E ORDENAR RESULTADOS ===
function renderVacancies() {
  const grid = document.getElementById('vacanciesGrid');
  grid.innerHTML = '';

  let vacancies = currentCitiesData[currentCitySelected] || [];

  // 1) Filtrar por tipo
  const tipoDoc = document.getElementById('filtroTipoDoc').value;
  if (tipoDoc !== 'todos') {
    vacancies = vacancies.filter(v => v.tipoDocumento === tipoDoc);
  }

  // 2) Ordenação
  const ordenacao = document.getElementById('ordenacaoVagas').value;
  vacancies.sort((a, b) => {
    if (ordenacao === 'relevante') {
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    }

    const dateA = ApiPNCP.parseDateMs(ApiPNCP.pick(a, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));
    const dateB = ApiPNCP.parseDateMs(ApiPNCP.pick(b, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]));

    if (ordenacao === 'recente') return dateB - dateA;
    if (ordenacao === 'antigo') return dateA - dateB;
    return 0;
  });

  if (vacancies.length === 0) {
    grid.innerHTML =
      `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        Nenhum documento encontrado com os filtros selecionados.
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

    const dataPub =
      ApiPNCP.pick(item, ["dataPublicacaoPncp", "dataPublicacao", "dataAssinatura", "dataInclusao", "dataVigenciaInicial", "dataInicioVigencia"]);

    const formatData = dataPub ? ApiPNCP.formatDateBR(dataPub) : "";

    // --- LINKS (normaliza CNPJ para 14 dígitos) ---
    const cnpjRaw = ApiPNCP.pick(item, ["cnpj", "numeroInscricaoCnpj", "cnpjOrgao"]) || (item.orgaoEntidade && item.orgaoEntidade.cnpj) || "";
    const cnpj = ApiPNCP.onlyDigits(cnpjRaw);
    let linkSeguro = "";

    if (item.tipoDocumento === 'edital' && cnpj.length === 14 && item.anoCompra && item.numeroCompra) {
      linkSeguro = `https://pncp.gov.br/app/editais/${cnpj}/${item.anoCompra}/${item.numeroCompra}`;
    } else if (item.tipoDocumento === 'ata' && cnpj.length === 14 && item.anoAta && item.numeroAta) {
      linkSeguro = `https://pncp.gov.br/app/atas/${cnpj}/${item.anoAta}/${item.numeroAta}`;
    } else if (item.tipoDocumento === 'contrato' && cnpj.length === 14 && item.anoContrato && item.numeroContrato) {
      linkSeguro = `https://pncp.gov.br/app/contratos/${cnpj}/${item.anoContrato}/${item.numeroContrato}`;
    } else {
      const linkBruto = ApiPNCP.pick(item, ["linkSistemaOrigem", "link", "url"]);
      if (linkBruto) {
        const s = String(linkBruto).trim();
        if (s.startsWith("http://") || s.startsWith("https://")) {
          linkSeguro = s;
        } else if (s.startsWith("//")) {
          linkSeguro = "https:" + s;
        } else if (s.startsWith("/")) {
          linkSeguro = "https://pncp.gov.br" + s;
        } else {
          linkSeguro = "https://" + s;
        }
      }
    }

    // Identidade visual por tipo de documento
    let badgeColor = "bg-green-50 text-green-700 border-green-100";
    let badgeText = "Edital / Contratação";

    if (item.tipoDocumento === 'ata') {
      badgeColor = "bg-purple-50 text-purple-700 border-purple-100";
      badgeText = "Ata de Registro";
    } else if (item.tipoDocumento === 'contrato') {
      badgeColor = "bg-orange-50 text-orange-700 border-orange-100";
      badgeText = "Contrato Assinado";
    }

    const card = document.createElement('div');
    card.className = "bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between h-full shadow-sm hover:shadow-md transition-all";
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start mb-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeColor}">${badgeText}</span>
          <span class="text-xs text-slate-400 font-medium">${escapeHtmlAttr(formatData)}</span>
        </div>
        <h3 class="text-sm font-bold text-slate-800 mb-2 line-clamp-2" title="${escapeHtmlAttr(orgao)}">${escapeHtmlAttr(orgao)}</h3>
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

document.addEventListener('DOMContentLoaded', initDashboard);
