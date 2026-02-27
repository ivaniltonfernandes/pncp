// scripts/build-cache.mjs
// Gera data/cache.json com oportunidades de contratação de MÉDICOS (PNCP)
// Node 20+ (GitHub Actions). Sem dependências.

const API_EDITAIS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

const MODALIDADES_BUSCA = ["6", "8", "2", "3", "7"]; // mesmas do front
const RANGE_DAYS = 30;

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

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

const LIMITS = {
  timeoutMs: 25000,
  pageDelayMs: 120,
  maxPagesPerRequest: 30,     // segurança por UF+modalidade
  maxMatchedTotal: 25000      // segurança total do cache
};

function normalizePtText(s) {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return t;
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

function resolveStatusLower(item) {
  const raw = pick(item, [
    "situacaoCompraNome", "situacaoCompra", "situacao",
    "status", "statusCompra", "faseCompra",
    "situacaoEdital", "situacaoContratacao", "descricaoSituacao"
  ]);
  return normalizePtText(raw || "");
}

function isOpportunityOpen(item) {
  const st = resolveStatusLower(item);
  if (!st) return true;
  const closed = ["encerr", "finaliz", "cancel", "revog", "anul", "fracass", "desert", "suspens", "conclu", "homolog", "adjud"];
  return !closed.some(x => st.includes(x));
}

function scoreDoctorVacancy(text) {
  const t = normalizePtText(text);
  if (!t) return { ok: false, score: 0 };

  const hasDoctor = /\bmedic[oa]s?\b/.test(t) || DOCTOR_TERMS.some(term => t.includes(term));
  const hasHiring = HIRING_TERMS.some(term => t.includes(term)) || /\bcredenciament\w*\b/.test(t) || /\bchamament\w*\b/.test(t) || /\bcontrat\w*\b/.test(t);
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

  return { ok: Boolean(hasDoctor && hasHiring && score >= 3), score };
}

function formatYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getDateRange(daysAgo) {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - Number(daysAgo || 0));
  return {
    dataInicial: formatYYYYMMDD(past),
    dataFinal: formatYYYYMMDD(today)
  };
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
  const first = await fetchText(url, { timeoutMs });
  if (first.ok) {
    return first.text ? JSON.parse(first.text) : { data: [], meta: {} };
  }
  // fallback para HTTP 400 (geralmente por tamanhoPagina)
  if (first.status === 400) {
    const u = new URL(url);
    if (u.searchParams.has("tamanhoPagina")) {
      // 1) reduzir
      u.searchParams.set("tamanhoPagina", "100");
      const second = await fetchText(u.toString(), { timeoutMs });
      if (second.ok) return second.text ? JSON.parse(second.text) : { data: [], meta: {} };

      // 2) remover
      u.searchParams.delete("tamanhoPagina");
      const third = await fetchText(u.toString(), { timeoutMs });
      if (third.ok) return third.text ? JSON.parse(third.text) : { data: [], meta: {} };

      throw new Error(`HTTP ${third.status} - ${third.text.slice(0, 200)}`);
    }
  }
  throw new Error(`HTTP ${first.status} - ${first.text.slice(0, 200)}`);
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

async function fetchPagesForUFModal({ uf, modalidade, dataInicial, dataFinal }) {
  let page = 1;
  let totalPages = null;
  let matched = [];

  for (let i = 0; i < LIMITS.maxPagesPerRequest; i++) {
    const url = buildUrl(API_EDITAIS, {
      dataInicial,
      dataFinal,
      codigoModalidadeContratacao: modalidade,
      uf,
      pagina: page,
      tamanhoPagina: 200
    });

    const json = await fetchJsonWithFallback(url, { timeoutMs: LIMITS.timeoutMs });
    const arr = extractArray(json);
    const meta = extractMeta(json);

    const tp = Number(meta.totalPaginas ?? meta.totalPages ?? meta.total_pages ?? meta.totalPaginasConsulta);
    if (!Number.isNaN(tp) && tp > 0) totalPages = tp;

    for (const it of arr) {
      // filtra cedo para reduzir tamanho
      const objeto = pick(it, ["objetoCompra","objeto","descricaoObjeto","objetoAta","objetoContrato","objetoContratacao"]);
      if (!objeto) continue;

      const scored = scoreDoctorVacancy(objeto);
      if (!scored.ok) continue;
      if (!isOpportunityOpen(it)) continue;

      it.tipoDocumento = "edital";
      it.relevanceScore = scored.score;
      matched.push(it);

      if (matched.length >= 5000) break; // segurança local
    }

    const hasMore = (totalPages !== null)
      ? page < totalPages
      : (meta.paginasRestantes !== undefined && Number(meta.paginasRestantes) > 0)
        ? true
        : arr.length >= 100; // heurística (quando não há meta)

    if (!hasMore) break;

    page += 1;
    await sleep(LIMITS.pageDelayMs);
  }

  return matched;
}

async function main() {
  const { dataInicial, dataFinal } = getDateRange(RANGE_DAYS);

  const all = [];
  const seen = new Set();

  for (const uf of UFS) {
    for (const mod of MODALIDADES_BUSCA) {
      process.stdout.write(`UF ${uf} | modalidade ${mod}... `);
      try {
        const matched = await fetchPagesForUFModal({ uf, modalidade: mod, dataInicial, dataFinal });

        // dedup por idCompra + ano/numero (ou fallback do JSON)
        for (const it of matched) {
          const key = String(
            pick(it, ["idCompra","id", "compraId"]) ||
            `${pick(it,["anoCompra","ano"])||""}-${pick(it,["numeroCompra","numero"])||""}-${uf}-${mod}-${pick(it,["objetoCompra","objeto"])||""}`
          );
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(it);

          if (all.length >= LIMITS.maxMatchedTotal) break;
        }

        console.log(`OK (${matched.length} encontrados)`);
      } catch (e) {
        console.log(`ERRO (${String(e?.message || e).slice(0, 140)})`);
      }

      if (all.length >= LIMITS.maxMatchedTotal) break;
      await sleep(180);
    }
    if (all.length >= LIMITS.maxMatchedTotal) break;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    rangeDays: RANGE_DAYS,
    modalidades: MODALIDADES_BUSCA,
    items: all
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(new URL("../data/cache.json", import.meta.url), JSON.stringify(payload, null, 2), "utf8");

  console.log(`\nCache gerado: ${all.length} item(ns).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
