// scripts/build-cache.mjs
// Gera data/cache.json com oportunidades de contratação de MÉDICOS no PNCP.
//
// Estratégia (leve e estável para GitHub Actions):
// - Usa o endpoint de "Propostas em Aberto" (contratações com recebimento de propostas aberto)
// - Filtra por última janela (rangeDays) com base na data de publicação (quando disponível)
// - Aplica filtro de texto para focar em CONTRATAÇÃO de médicos e excluir compras de insumos.
//
// Node 20+ (GitHub Actions). Sem dependências.

const API_PROPOSTAS = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

const MODALIDADES = ["12","9","8","6","7","4","5","3","10","11","2"]; // mesmas do front (inclui Credenciamento e Inexigibilidade)
const RANGE_DAYS = 30;

// Limites de segurança (evita travar/estourar tempo)
const LIMITS = {
  timeoutMs: 25000,
  pageDelayMs: 120,
  maxPagesPerModalidade: 80,
  maxItemsTotal: 12000,          // tamanho final do cache (aprox)
  maxItemsPerModalidade: 6000,   // proteção por modalidade
  maxErrorsToStore: 30
};

// Vocabulário de filtro
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
  "credenciamento", "chamamento publico",
  "processo seletivo", "selecao", "selecionamento",
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

function normalizePtText(s) {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return t;
}

function buildSearchText(it) {
  const parts = [
    pick(it, ["objetoCompra", "objeto", "descricaoObjeto", "objetoContratacao", "objetoAta", "objetoContrato"]),
    pick(it, ["informacaoComplementar", "informacaoComplementarObjeto", "informacoesComplementares"]),
    pick(it, ["processo", "numeroProcesso", "processoCompra"]),
    pick(it, ["tipoInstrumentoConvocatorioNome", "modalidadeNome", "unidadeOrgaoNome", "orgaoNome"])
  ].filter(Boolean);

  return parts.join(" | ");
}


function parsePncpId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  let m = s.match(/(\d{14})-[^-]+-([0-9]+)\/(\d{4})/);
  if (m) return { cnpj: m[1], numero: String(m[2]).replace(/^0+(?=\d)/, ""), ano: m[3] };

  m = s.match(/(\d{14}).*?([0-9]+)\/(\d{4})/);
  if (m) return { cnpj: m[1], numero: String(m[2]).replace(/^0+(?=\d)/, ""), ano: m[3] };

  return null;
}

function normalizePncpNumero(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "");

  let m = s.match(/-([0-9]+)\/(\d{4})$/);
  if (m) return String(m[1]).replace(/^0+(?=\d)/, "");

  m = s.match(/([0-9]+)\/(\d{4})$/);
  if (m) return String(m[1]).replace(/^0+(?=\d)/, "");

  return "";
}

function normalizePncpAno(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return s;

  const m = s.match(/\/(\d{4})$/);
  if (m) return m[1];

  return "";
}

function buildPortalLink(tipoDocumento, cnpj, ano, numero) {
  if (!cnpj || !ano || !numero) return "";
  if (String(cnpj).length !== 14) return "";
  if (!/^\d{4}$/.test(String(ano))) return "";
  if (!/^\d+$/.test(String(numero))) return "";

  if (tipoDocumento === "edital") return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${numero}`;
  if (tipoDocumento === "ata") return `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${numero}`;
  if (tipoDocumento === "contrato") return `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${numero}`;
  return "";
}


function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) {
      const s = String(obj[k]).trim();
      if (s !== "") return obj[k];
    }
  }
  return null;
}

function formatYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parseDateMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const s = String(value).trim();
  if (!s) return 0;

  // yyyymmdd
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

function scoreDoctorVacancy(text) {
  // Regra principal: achar a palavra-chave "médico(s)" (sem depender de outros termos).
  // Termos de contratação apenas aumentam relevância.
  const t = normalizePtText(text);
  if (!t) return { ok: false, score: 0 };

  const hasDoctorKeyword = /\bmedic[oa]s?\b/.test(t);

  const hasHiring =
    HIRING_TERMS.some(term => t.includes(term)) ||
    /\bcredenciament\w*\b/.test(t) ||
    /\bchamament\w*\b/.test(t) ||
    /\bcontrat\w*\b/.test(t) ||
    /\bpresta\w*\b/.test(t);

  const hasExclude = EXCLUDE_TERMS.some(term => t.includes(term));

  let score = 0;
  if (hasDoctorKeyword) score += 4;
  if (hasHiring) score += 3;

  if (t.includes("credenciamento")) score += 3;
  if (t.includes("chamamento publico")) score += 3;
  if (t.includes("prestacao de servicos") || t.includes("prestacao de servico")) score += 2;
  if (t.includes("servicos medicos") || t.includes("servico medico")) score += 2;
  if (t.includes("plantao") || t.includes("plantoes") || t.includes("plantonista")) score += 2;
  if (t.includes("vaga") || t.includes("vagas")) score += 1;

  if (hasExclude) score -= 9;
  if (t.includes("aquisicao") && !t.includes("servic")) score -= 4;
  if (t.includes("fornecimento") && !t.includes("mao de obra") && !t.includes("servic")) score -= 2;

  const ok = Boolean(hasDoctorKeyword && !hasExclude);
  return { ok, score };
}

function resolveUf(item) {
  return (
    pick(item, ["uf", "siglaUf"]) ||
    (item.orgaoEntidade && (item.orgaoEntidade.ufSigla || item.orgaoEntidade.uf)) ||
    (item.unidadeOrgao && (item.unidadeOrgao.ufSigla || item.unidadeOrgao.uf)) ||
    ""
  );
}

function resolveMunicipioNome(item) {
  return (
    pick(item, ["municipioNome", "municipio", "nomeMunicipio"]) ||
    (item.orgaoEntidade && (item.orgaoEntidade.municipioNome || item.orgaoEntidade.municipio)) ||
    ""
  );
}

function resolveStatusLower(item) {
  const raw = pick(item, [
    "situacaoCompraNome", "situacaoCompra", "situacao",
    "status", "statusCompra", "faseCompra",
    "situacaoEdital", "situacaoContratacao", "descricaoSituacao"
  ]);
  return normalizePtText(raw || "");
}

function isOpportunityOpen(item) {
  // Como o endpoint já é de "propostas em aberto", isso é redundante,
  // mas ajuda se algum status vier inconsistentes.
  const st = resolveStatusLower(item);
  if (!st) return true;
  const closed = ["encerr", "finaliz", "cancel", "revog", "anul", "fracass", "desert", "suspens", "conclu", "homolog", "adjud"];
  return !closed.some(x => st.includes(x));
}

function buildUrl(baseUrl, params = {}) {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    u.searchParams.set(k, s);
  }
  return u.toString();
}

async function fetchText(url, { timeoutMs } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || LIMITS.timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { "accept": "application/json" } });
    const text = await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status, text };
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonWithFallback(url, { timeoutMs } = {}) {
  // tenta 1x, com fallback se 400 (tamanhoPagina)
  const first = await fetchText(url, { timeoutMs });
  if (first.ok) return first.text ? JSON.parse(first.text) : { data: [], meta: {} };

  if (first.status === 400) {
    const u = new URL(url);
    if (u.searchParams.has("tamanhoPagina")) {
      // 1) reduzir tamanhoPagina
      u.searchParams.set("tamanhoPagina", "200");
      const second = await fetchText(u.toString(), { timeoutMs });
      if (second.ok) return second.text ? JSON.parse(second.text) : { data: [], meta: {} };

      // 2) remover tamanhoPagina
      u.searchParams.delete("tamanhoPagina");
      const third = await fetchText(u.toString(), { timeoutMs });
      if (third.ok) return third.text ? JSON.parse(third.text) : { data: [], meta: {} };

      throw new Error(`HTTP ${third.status} - ${third.text.slice(0, 220)}`);
    }
  }

  // 429/5xx: pequena espera e tenta mais 1x (best-effort)
  if (first.status === 429 || (first.status >= 500 && first.status <= 599)) {
    await sleep(900);
    const again = await fetchText(url, { timeoutMs });
    if (again.ok) return again.text ? JSON.parse(again.text) : { data: [], meta: {} };
    throw new Error(`HTTP ${again.status} - ${again.text.slice(0, 220)}`);
  }

  throw new Error(`HTTP ${first.status} - ${first.text.slice(0, 220)}`);
}

function extractArray(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

function extractMeta(json) {
  return json?.meta || json?.paginacao || json?.pagination || json || {};
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function toMinimalItem(it, { score, objeto }) {
  // Mantém somente o que o front precisa (e o que ajuda no link oficial).
  const idContratacaoPncp = pick(it, [
    "idContratacaoPncp", "idContratacaoPNCP", "idCompraPncp", "idCompraPNCP",
    "idContratacao", "idCompra", "id"
  ]) || "";

  const parsed = parsePncpId(idContratacaoPncp);

  let cnpjRaw = pick(it, ["cnpj", "numeroInscricaoCnpj", "cnpjOrgao", "orgaoEntidadeCnpj"]) || (it.orgaoEntidade && it.orgaoEntidade.cnpj) || "";
  let cnpj = String(cnpjRaw || "").replace(/\D+/g, "");
  if ((!cnpj || cnpj.length !== 14) && parsed?.cnpj) cnpj = parsed.cnpj;

  let anoCompra = normalizePncpAno(pick(it, ["anoCompra", "ano"])) || (parsed?.ano || "");
  let numeroCompra = normalizePncpNumero(pick(it, ["numeroCompra", "sequencialCompra", "numero"])) || (parsed?.numero || "");

  const linkOficial = buildPortalLink("edital", cnpj, anoCompra, numeroCompra);
  const linkSistemaOrigem = pick(it, ["linkSistemaOrigem", "link", "url"]) || "";

  return {
    tipoDocumento: "edital",
    relevanceScore: score,

    // localização
    uf: resolveUf(it),
    municipioNome: resolveMunicipioNome(it),

    // identificação/link oficial
    idContratacaoPncp,
    cnpj,
    anoCompra,
    numeroCompra,
    linkOficial,

    // conteúdo
    orgaoEntidadeRazaoSocial: pick(it, ["orgaoEntidadeRazaoSocial", "orgaoNome", "nomeRazaoSocial", "nomeOrgao"]) || (it.orgaoEntidade && (it.orgaoEntidade.razaoSocial || it.orgaoEntidade.nome)) || "",
    objetoCompra: objeto || pick(it, ["objetoCompra", "objeto", "descricaoObjeto", "objetoContratacao"]) || "",

    // datas/status
    dataPublicacaoPncp: pick(it, ["dataPublicacaoPncp", "dataPublicacao"]) || "",
    dataAberturaProposta: pick(it, ["dataAberturaProposta", "dataInicioRecebimentoProposta", "dataInicioRecebimento"]) || "",
    dataEncerramentoProposta: pick(it, ["dataEncerramentoProposta", "dataFimRecebimentoProposta", "dataFimRecebimento"]) || "",
    situacaoCompraNome: pick(it, ["situacaoCompraNome", "situacaoCompra", "situacao", "status"]) || "",

    // fallback de link, se vier do retorno
    linkSistemaOrigem
  };
}

async function fetchModalidade(modalidade, dataFinal, cutoffMs, errors) {
  const out = [];
  const seen = new Set();

  let page = 1;
  let totalPages = null;

  for (let i = 0; i < LIMITS.maxPagesPerModalidade; i++) {
    const url = buildUrl(API_PROPOSTAS, {
      dataFinal,
      codigoModalidadeContratacao: modalidade,
      pagina: page,
      tamanhoPagina: 500
    });

    let json;
    try {
      json = await fetchJsonWithFallback(url, { timeoutMs: LIMITS.timeoutMs });
    } catch (e) {
      const msg = `modalidade ${modalidade} página ${page}: ${String(e?.message || e)}`;
      if (errors.length < LIMITS.maxErrorsToStore) errors.push(msg);
      break; // não insiste para não travar
    }

    const arr = extractArray(json);
    const meta = extractMeta(json);

    const tp = Number(meta.totalPaginas ?? meta.totalPages ?? meta.total_pages ?? meta.totalPaginasConsulta);
    if (!Number.isNaN(tp) && tp > 0) totalPages = tp;

    for (const it of arr) {
      const searchText = buildSearchText(it);
      if (!searchText) continue;

      const scored = scoreDoctorVacancy(searchText);
      if (!scored.ok) continue;
      if (!isOpportunityOpen(it)) continue;

      // aplica janela por data de publicação (quando houver)
      const pub = pick(it, ["dataPublicacaoPncp", "dataPublicacao"]);
      const pubMs = parseDateMs(pub);
      if (pubMs && pubMs < cutoffMs) continue;

      const objeto = pick(it, ["objetoCompra", "objeto", "descricaoObjeto", "objetoContratacao", "objetoAta", "objetoContrato"]) || "";
      const minimal = toMinimalItem(it, { score: scored.score, objeto });

      // dedup
      const key = [
        minimal.cnpj || "",
        minimal.anoCompra || "",
        minimal.numeroCompra || "",
        minimal.uf || "",
        minimal.municipioNome || "",
        minimal.objetoCompra || ""
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(minimal);

      if (out.length >= LIMITS.maxItemsPerModalidade) break;
    }

    if (out.length >= LIMITS.maxItemsPerModalidade) break;

    const hasMore = (totalPages !== null)
      ? page < totalPages
      : (meta.paginasRestantes !== undefined && Number(meta.paginasRestantes) > 0)
        ? true
        : arr.length >= 200; // heurística (se não veio meta)

    if (!hasMore) break;

    page += 1;
    if (LIMITS.pageDelayMs) await sleep(LIMITS.pageDelayMs);
  }

  return out;
}

async function main() {
  const today = new Date();
  const dataFinal = formatYYYYMMDD(today);

  const cutoff = new Date();
  cutoff.setDate(today.getDate() - Number(RANGE_DAYS || 0));
  const cutoffMs = cutoff.getTime();

  const errors = [];
  const all = [];
  const globalSeen = new Set();

  for (const mod of MODALIDADES) {
    process.stdout.write(`Modalidade ${mod}... `);
    const items = await fetchModalidade(mod, dataFinal, cutoffMs, errors);

    // merge com dedup global
    for (const it of items) {
      const key = [
        it.cnpj || "",
        it.anoCompra || "",
        it.numeroCompra || "",
        it.uf || "",
        it.municipioNome || "",
        it.objetoCompra || ""
      ].join("|");

      if (globalSeen.has(key)) continue;
      globalSeen.add(key);
      all.push(it);
      if (all.length >= LIMITS.maxItemsTotal) break;
    }

    console.log(`OK (${items.length} encontrados)`);
    if (all.length >= LIMITS.maxItemsTotal) break;

    await sleep(220);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    rangeDays: RANGE_DAYS,
    modalidades: MODALIDADES,
    source: "contratacoes/proposta",
    items: all,
    errors
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(
    new URL("../data/cache.json", import.meta.url),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  console.log(`\nCache gerado: ${all.length} item(ns). Erros: ${errors.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
