// === BASE DE DADOS LOCAL (Regiões e Estados) ===
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

// Modalidades da API PNCP mais comuns para contratação médica
const MODALIDADES_BUSCA = ["6", "8", "2", "3", "7"]; 

// Palavras-chave exclusivas para buscar Vagas Médicas
const MEDICAL_KEYWORDS = ["médico", "medico", "medicina", "plantão", "plantao", "clínico", "clinico", "psiquiatra", "pediatra", "saúde", "hospitalar"];

// Estado da Aplicação
let currentRegion = "";
let currentState = "";
let currentCitiesData = {}; 

// === NAVEGAÇÃO ENTRE VISTAS ===
function showView(viewName) {
  ['regions', 'states', 'cities', 'vacancies'].forEach(v => {
    document.getElementById(`view-${v}`).classList.add('hidden');
    document.getElementById(`view-${v}`).classList.remove('block');
  });
  document.getElementById(`view-${viewName}`).classList.remove('hidden');
  document.getElementById(`view-${viewName}`).classList.add('block');
}

// === RENDERIZAR REGIÕES (Tela 1) ===
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

// === RENDERIZAR ESTADOS (Tela 2) ===
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

// === BUSCAR NA API E RENDERIZAR CIDADES (Tela 3) ===
async function openState(stateName, stateSigla) {
  currentState = stateSigla;
  document.getElementById('citiesTitle').textContent = `Vagas em ${stateName}`;
  document.getElementById('citiesSubtitle').textContent = "Buscando editais médicos (últimos 30 dias)...";
  document.getElementById('citiesGrid').innerHTML = '';
  document.getElementById('loadingCities').classList.remove('hidden');
  showView('cities');

  // Ajustado para 30 dias para não estourar o limite de datas da API
  const { dataInicial, dataFinal } = ApiPNCP.getDateRange(30); 
  let rawItems = [];

  try {
    for (let i = 0; i < MODALIDADES_BUSCA.length; i++) {
      const mod = MODALIDADES_BUSCA[i];
      // Tamanho página 500 para trazer mais resultados por requisição
      const url = ApiPNCP.buildUrl({ dataInicial, dataFinal, codigoModalidadeContratacao: mod, tamanhoPagina: 500 });
      
      const json = await ApiPNCP.fetchJsonWithTimeout(url);
      const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      rawItems = rawItems.concat(items);

      // PAUSA DE 300ms ENTRE AS CHAMADAS (Isso evita o Erro 429 - Too Many Requests)
      if (i < MODALIDADES_BUSCA.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    currentCitiesData = {};
    let medicalCount = 0;

    rawItems.forEach(item => {
      const uf = ApiPNCP.pick(item, ["uf", "siglaUf"]);
      if (uf !== stateSigla) return; 

      const objeto = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto"]).toLowerCase();
      
      const isMedical = MEDICAL_KEYWORDS.some(kw => objeto.includes(kw));
      if (!isMedical) return;

      const municipio = ApiPNCP.pick(item, ["municipioNome", "municipio"]) || "Município não informado";
      
      if (!currentCitiesData[municipio]) {
        currentCitiesData[municipio] = [];
      }
      currentCitiesData[municipio].push(item);
      medicalCount++;
    });

    document.getElementById('loadingCities').classList.add('hidden');
    
    const cityNames = Object.keys(currentCitiesData).sort();
    document.getElementById('citiesSubtitle').textContent = `${medicalCount} vagas encontradas em ${cityNames.length} municípios.`;

    if (cityNames.length === 0) {
      document.getElementById('citiesGrid').innerHTML = `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">Nenhuma vaga médica recente encontrada neste estado nos últimos 30 dias.</div>`;
      return;
    }

    cityNames.forEach(city => {
      const btn = document.createElement('button');
      const vagas = currentCitiesData[city].length;
      btn.className = "w-full text-left bg-white rounded-2xl border border-slate-200 p-5 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group flex items-center justify-between";
      btn.onclick = () => openVacancies(city);
      btn.innerHTML = `
        <div>
          <h3 class="text-[15px] font-bold text-slate-800">${city}</h3>
          <p class="text-xs text-blue-600 font-semibold mt-1">${vagas} vaga(s) / edital(is)</p>
        </div>
        <svg class="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      `;
      document.getElementById('citiesGrid').appendChild(btn);
    });

  } catch (error) {
    document.getElementById('loadingCities').classList.add('hidden');
    document.getElementById('citiesSubtitle').innerHTML = `<span class="text-red-500 font-medium">Erro ao buscar os dados na API: ${error.message}</span>`;
    console.error(error);
  }
}

// === RENDERIZAR VAGAS DA CIDADE (Tela 4) ===
function openVacancies(cityName) {
  document.getElementById('vacanciesTitle').textContent = `Vagas em ${cityName} - ${currentState}`;
  const grid = document.getElementById('vacanciesGrid');
  grid.innerHTML = '';

  const vacancies = currentCitiesData[cityName] || [];

  vacancies.forEach(item => {
    const orgao = ApiPNCP.pick(item, ["orgaoNome", "orgaoEntidadeRazaoSocial"]) || "Órgão não informado";
    const objeto = ApiPNCP.pick(item, ["objetoCompra", "objeto", "descricaoObjeto"]) || "Sem descrição.";
    const link = ApiPNCP.pick(item, ["linkSistemaOrigem", "link", "url"]);
    const dataPub = ApiPNCP.pick(item, ["dataPublicacaoPncp", "dataPublicacao"]);
    const formatData = dataPub ? new Date(dataPub).toLocaleDateString('pt-BR') : '';

    const card = document.createElement('div');
    card.className = "bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between h-full shadow-sm hover:shadow-md transition-all";
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start mb-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">Recente</span>
          <span class="text-xs text-slate-400 font-medium">${formatData}</span>
        </div>
        <h3 class="text-sm font-bold text-slate-800 mb-2">${orgao}</h3>
        <p class="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">${objeto}</p>
      </div>
      <div class="mt-4 pt-4 border-t border-slate-100">
        ${link ? `
          <a href="${link}" target="_blank" class="w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-sm inline-block">
            Acessar Edital Oficial
          </a>
        ` : '<span class="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg inline-block font-medium">Link do edital não informado pela prefeitura</span>'}
      </div>
    `;
    grid.appendChild(card);
  });

  showView('vacancies');
}

// Inicializa a primeira tela
document.addEventListener('DOMContentLoaded', initDashboard);
