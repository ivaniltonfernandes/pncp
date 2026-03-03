// URLs das fontes do PNCP (API de Consultas)
const API_EDITAIS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const API_ATAS = "https://pncp.gov.br/api/consulta/v1/atas";
const API_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";

const ApiPNCP = {
  onlyDigits: (s) => (s || "").replace(/\D+/g, ""),

  // Retorna datas no formato yyyymmdd (como a API do PNCP costuma usar)
  getDateRange: (daysAgo = 30) => {
  const days = Math.max(0, Math.abs(Number(daysAgo || 0)));

  // Fixamos o horário no meio do dia para reduzir efeitos de fuso/virada de data
  const end = new Date();
  end.setHours(12, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const format = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  let dataInicial = format(start);
  let dataFinal = format(end);

  // Garantia: inicial <= final (evita HTTP 422)
  if (dataInicial > dataFinal) {
    const tmp = dataInicial;
    dataInicial = dataFinal;
    dataFinal = tmp;
  }

  return { dataInicial, dataFinal };
},

  // Monta URL com quaisquer parâmetros (não "trava" em um conjunto fixo)
  buildUrl: (baseUrl, params = {}) => {
    const u = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const s = String(v).trim();
      if (!s) return;
      u.searchParams.set(k, s);
    });
    return u.toString();
  },

  // Fetch com timeout + suporte a AbortSignal externo
  // Fetch com timeout + suporte a AbortSignal externo + retries (para instabilidade do PNCP)
fetchJson: async (
  url,
  {
    timeoutMs = 45000,
    signal,
    retries = 2,
    retryBaseDelayMs = 650,
    retryBackoff = 2,
    retryOnStatuses = [429, 500, 502, 503, 504]
  } = {}
) => {
  const sleep = (ms) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });

  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    const ctrl = new AbortController();
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      try { ctrl.abort(); } catch (_) {}
    }, timeoutMs);

    const onAbort = () => {
      try { ctrl.abort(); } catch (_) {}
    };

    try {
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      let resp;
      let text = "";

      try {
        resp = await fetch(url, { signal: ctrl.signal });
        text = await resp.text().catch(() => "");
      } catch (err) {
        if (didTimeout) {
          const te = new Error("Tempo limite excedido ao consultar o PNCP. Tente novamente.");
          te.name = "TimeoutError";
          te.code = "TIMEOUT";
          throw te;
        }
        throw err;
      }

      if (!resp.ok) {
        // Decide se é erro que vale retry
        const shouldRetry = retryOnStatuses.includes(resp.status);
        const detail = text ? ` - ${text.slice(0, 220)}` : "";
        const he = new Error(`HTTP ${resp.status}${detail}`);
        he.name = "HttpError";
        he.status = resp.status;

        if (shouldRetry && attempt < retries) throw he;
        throw he;
      }

      if (!text || text.trim() === "") return { data: [], meta: {} };
      return JSON.parse(text);

    } catch (err) {
      lastErr = err;

      // Não tenta retry em abort do usuário
      if (err && (err.name === "AbortError" || String(err).includes("AbortError"))) {
        throw err;
      }

      const isTimeout = err && (err.name === "TimeoutError" || err.code === "TIMEOUT" || String(err.message || err).includes("Tempo limite"));
      const isRetryableNet = err && (String(err.message || err).includes("Failed to fetch") || String(err.message || err).includes("NetworkError"));
      const isRetryableHttp = err && err.name === "HttpError" && retryOnStatuses.includes(Number(err.status));

      if ((isTimeout || isRetryableNet || isRetryableHttp) && attempt < retries) {
        const delay = Math.round(retryBaseDelayMs * Math.pow(retryBackoff, attempt));
        attempt += 1;
        // Em timeouts, aumenta um pouco o timeout para a próxima tentativa
        if (isTimeout) timeoutMs = Math.min(90000, Math.round(timeoutMs * 1.35));
        await sleep(delay);
        continue;
      }

      throw err;

    } finally {
      clearTimeout(timer);
      if (signal) {
        try { signal.removeEventListener("abort", onAbort); } catch (_) {}
      }
    }
  }

  throw lastErr || new Error("Falha ao consultar o PNCP.");
},

  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  }),

  // Lida com yyyymmdd, ISO e Date
  parseDateMs: (value) => {
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
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    const dt = new Date(s);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  },

  formatDateBR: (value) => {
    const ms = ApiPNCP.parseDateMs(value);
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("pt-BR");
  },

  pick: (obj, keys) => {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) {
        const s = String(obj[k]).trim();
        if (s !== "") return obj[k];
      }
    }
    return "";
  },

  // Paginação robusta (para endpoints do PNCP que retornam meta com total de páginas)
  fetchAllPages: async (baseUrl, params = {}, options = {}) => {
    const {
      signal,
      timeoutMs = 20000,
      pageDelayMs = 120,
      maxPages = 80,
      maxItems = 15000,
      onProgress
    } = options;

    let page = Number(params.pagina || 1);
    const baseTamanho = params.tamanhoPagina !== undefined ? Number(params.tamanhoPagina) : undefined;

    let totalPages = null;
    let items = [];
    let truncated = false;

    const guessHasMore = (dataArr, tamanho) => {
      const t = Number(tamanho || 0);
      if (!t) return dataArr.length > 0;
      return dataArr.length >= t;
    };

    for (let i = 0; i < maxPages; i++) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

      const pageParams = { ...params, pagina: page };
      let url = ApiPNCP.buildUrl(baseUrl, pageParams);

      let json;
      try {
  json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 2 });
} catch (e) {
  const msg = String(e && e.message ? e.message : e);
  const hasTamanho = pageParams.tamanhoPagina !== undefined && pageParams.tamanhoPagina !== null;

  // 1) Timeout / instabilidade: tenta novamente com timeout maior e/ou página menor
  if ((e && (e.name === "TimeoutError" || e.code === "TIMEOUT")) || msg.includes("Tempo limite")) {
    const retryParams = { ...pageParams };

    // Se a página está grande, reduz
    if (hasTamanho) {
      const tp = Number(retryParams.tamanhoPagina);
      if (!isNaN(tp) && tp > 80) retryParams.tamanhoPagina = 80;
      else if (!isNaN(tp) && tp > 50) retryParams.tamanhoPagina = 50;
    } else {
      // Se não tinha tamanhoPagina, define um moderado
      retryParams.tamanhoPagina = 80;
    }

    url = ApiPNCP.buildUrl(baseUrl, retryParams);
    json = await ApiPNCP.fetchJson(url, { timeoutMs: Math.min(90000, Math.round(timeoutMs * 1.35)), signal, retries: 2 });
  }

  // 2) Fallback comum: alguns endpoints rejeitam tamanhoPagina alto (HTTP 400).
  else if (msg.includes("HTTP 400") && hasTamanho) {
    const retryParams = { ...pageParams };
    // primeiro tenta reduzir
    retryParams.tamanhoPagina = Math.min(100, baseTamanho || 100);
    url = ApiPNCP.buildUrl(baseUrl, retryParams);
    try {
      json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
    } catch (_) {
      // última tentativa: remove tamanhoPagina
      delete retryParams.tamanhoPagina;
      url = ApiPNCP.buildUrl(baseUrl, retryParams);
      json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
    }
  } else {
    throw e;
  }
}

const data = Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.items) ? json.items
        : Array.isArray(json?.results) ? json.results
        : [];

      items = items.concat(data);

      const meta = json?.meta || json?.paginacao || json?.pagination || json || {};
      const tp = Number(meta.totalPaginas ?? meta.totalPages ?? meta.total_pages ?? meta.totalPaginasConsulta);
      if (!isNaN(tp) && tp > 0) totalPages = tp;

      if (typeof onProgress === "function") {
        onProgress({ page, totalPages, itemsSoFar: items.length, url });
      }

      if (items.length >= maxItems) {
        truncated = true;
        break;
      }

      let hasMore = false;
      if (totalPages !== null) {
        hasMore = page < totalPages;
      } else if (meta.paginasRestantes !== undefined && meta.paginasRestantes !== null) {
        const pr = Number(meta.paginasRestantes);
        hasMore = !isNaN(pr) && pr > 0;
      } else {
        hasMore = guessHasMore(data, pageParams.tamanhoPagina);
      }

      if (!hasMore) break;

      page += 1;
      if (pageDelayMs) await ApiPNCP.sleep(pageDelayMs, signal);
    }

    return {
      data: items,
      meta: { totalPages, truncated }
    };
  },


// Parse do Número de Controle PNCP:
// Contratação: 99999999999999-1-999999/9999
parseNumeroControlePncp: (id) => {
  const s = String(id || "").trim();
  if (!s) return null;
  const m = s.match(/(\d{14})-(\d)-(\d{1,6})\/(\d{4})/);
  if (!m) return null;
  const cnpj = m[1];
  const tipo = m[2]; // 1 contratação, 2 contrato, 0 pca
  const seq = String(parseInt(m[3], 10));
  const ano = m[4];
  return { cnpj, tipo, seq, ano };
},

padSeq6: (seq) => {
  const n = parseInt(String(seq || "").replace(/\D+/g, ""), 10);
  if (!Number.isFinite(n)) return String(seq || "");
  return String(n).padStart(6, "0");
},

// Lista arquivos (anexos) de uma contratação (compra/edital) no PNCP.
// Observação: muitos PDFs ficam disponíveis via /pncp-api/v1/... (sem autenticação).
listCompraArquivos: async (cnpj, ano, seq, { timeoutMs = 45000, signal } = {}) => {
  const bases = [
    "https://pncp.gov.br/pncp-api/v1",
    "https://pncp.gov.br/api/pncp/v1"
  ];

  const seqNorm = String(seq || "").trim();
  const seqPad = ApiPNCP.padSeq6(seqNorm);
  const seqCandidates = Array.from(new Set([seqNorm, seqPad].filter(Boolean)));

  let lastErr = null;

  for (const base of bases) {
    for (const s of seqCandidates) {
      const url = `${base}/orgaos/${cnpj}/compras/${ano}/${s}/arquivos`;
      try {
        const json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
        // Pode vir como lista direta ou embrulhado
        const arquivos = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
        if (Array.isArray(arquivos)) {
          return { arquivos, base, seqUsed: s };
        }
      } catch (err) {
        lastErr = err;
        // tenta próxima combinação em 404/400/401
        const msg = String(err?.message || err || "");
        if (msg.includes("HTTP 404") || msg.includes("HTTP 400") || msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
          continue;
        }
      }
    }
  }

  if (lastErr) throw lastErr;
  return { arquivos: [], base: bases[0], seqUsed: seqNorm };
},


listCompraItens: async (cnpj, ano, seq, { timeoutMs = 45000, signal } = {}) => {
  const bases = [
    "https://pncp.gov.br/pncp-api/v1",
    "https://pncp.gov.br/api/pncp/v1"
  ];

  const seqNorm = String(seq || "").trim();
  const seqPad = ApiPNCP.padSeq6(seqNorm);
  const seqCandidates = Array.from(new Set([seqNorm, seqPad].filter(Boolean)));

  const qsCandidates = [
    "",
    "?pagina=1&tamanhoPagina=500",
    "?pagina=1"
  ];

  let lastErr = null;

  for (const base of bases) {
    for (const s of seqCandidates) {
      for (const qs of qsCandidates) {
        const url = `${base}/orgaos/${cnpj}/compras/${ano}/${s}/itens${qs}`;
        try {
          const json = await ApiPNCP.fetchJson(url, { timeoutMs, signal, retries: 1 });
          // Pode vir como lista direta ou embrulhado
          const itens = Array.isArray(json)
            ? json
            : (Array.isArray(json?.data) ? json.data : (Array.isArray(json?.itens) ? json.itens : (Array.isArray(json?.items) ? json.items : [])));
          if (Array.isArray(itens) && itens.length >= 0) {
            return { itens, base, seqUsed: s, urlUsed: url };
          }
        } catch (err) {
          lastErr = err;
          const msg = String(err?.message || err || "");
          if (msg.includes("HTTP 404") || msg.includes("HTTP 400") || msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
            continue;
          }
        }
      }
    }
  }

  if (lastErr) throw lastErr;
  throw new Error("Falha ao consultar itens da contratação.");
},


pickBestPdf: (arquivos) => {
  if (!Array.isArray(arquivos) || !arquivos.length) return null;

  const getName = (a) => String(
    a.nomeArquivo || a.nome || a.titulo || a.descricao || a.tipoDocumentoNome || ""
  );

  const isPdf = (a) => {
    const n = getName(a).toLowerCase();
    const mime = String(a.contentType || a.mimeType || "").toLowerCase();
    return n.endsWith(".pdf") || mime.includes("pdf");
  };

  const score = (a) => {
    const n = normalize(getName(a));
    let s = 0;
    if (isPdf(a)) s += 10;
    if (n.includes("edital")) s += 8;
    if (n.includes("aviso")) s += 6;
    if (n.includes("termo de referencia") || n.includes("termo referencia")) s += 5;
    if (n.includes("minuta")) s += 3;
    if (n.includes("anexo")) s += 1;
    return s;
  };

  const normalize = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const pdfs = arquivos.filter(isPdf);
  const pool = pdfs.length ? pdfs : arquivos;

  let best = null;
  let bestScore = -Infinity;
  pool.forEach((a) => {
    const sc = score(a);
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  });

  // Se não for PDF e tiver PDF no conjunto, tenta primeiro PDF
  if (best && !isPdf(best) && pdfs.length) best = pdfs[0];

  return best;
},

// Retorna uma lista ordenada de anexos com maior probabilidade de conter informações úteis (PDF primeiro).
// Útil para extração progressiva (Ed. -> TR -> anexos -> minuta).
rankArquivosParaExtracao: (arquivos) => {
  if (!Array.isArray(arquivos) || !arquivos.length) return [];

  const getName = (a) => String(a?.nomeArquivo || a?.nome || a?.titulo || a?.descricao || a?.tipoDocumentoNome || "");
  const normalize = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const isPdf = (a) => {
    const n = getName(a).toLowerCase();
    const mime = String(a?.contentType || a?.mimeType || "").toLowerCase();
    return n.endsWith(".pdf") || mime.includes("pdf");
  };

  const score = (a) => {
    const n = normalize(getName(a));
    let s = 0;

    // Primeiro critério: PDF
    if (isPdf(a)) s += 100;

    // Palavras-chave típicas
    if (n.includes("edital")) s += 60;
    if (n.includes("aviso") || n.includes("chamamento")) s += 45;
    if (n.includes("termo de referencia") || n.includes("termo referencia") || n.includes("tr")) s += 40;
    if (n.includes("projeto basico")) s += 35;
    if (n.includes("minuta")) s += 25;
    if (n.includes("anexo")) s += 10;
    if (n.includes("planilha")) s += 8;

    // Penaliza arquivos muito genéricos
    if (n === "arquivo" || n === "documento") s -= 5;

    return s;
  };

  const pdfs = arquivos.filter(isPdf);
  const pool = pdfs.length ? pdfs : arquivos;

  return pool
    .map((a) => ({ a, sc: score(a) }))
    .sort((x, y) => (y.sc - x.sc))
    .map((x) => x.a);
},

// Fetch binário (PDF) com timeout/retries
fetchBinary: async (
  url,
  {
    timeoutMs = 65000,
    signal,
    retries = 1,
    retryBaseDelayMs = 650,
    retryBackoff = 2,
    retryOnStatuses = [429, 500, 502, 503, 504]
  } = {}
) => {
  const sleep = (ms) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });

  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

    const ctrl = new AbortController();
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      try { ctrl.abort(); } catch (_) {}
    }, timeoutMs);

    const onAbort = () => { try { ctrl.abort(); } catch (_) {} };

    try {
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      let resp;
      try {
        resp = await fetch(url, { signal: ctrl.signal });
      } catch (err) {
        if (didTimeout) {
          const te = new Error("Tempo limite excedido ao baixar o PDF do PNCP. Tente novamente.");
          te.name = "TimeoutError";
          te.code = "TIMEOUT";
          throw te;
        }
        throw err;
      }

      if (!resp.ok) {
        const shouldRetry = retryOnStatuses.includes(resp.status);
        const he = new Error(`HTTP ${resp.status}`);
        he.name = "HttpError";
        he.status = resp.status;
        if (shouldRetry && attempt < retries) throw he;
        throw he;
      }

      const contentType = resp.headers.get("content-type") || "";
      const arrayBuffer = await resp.arrayBuffer();
      return { arrayBuffer, contentType };

    } catch (err) {
      lastErr = err;

      if (err && (err.name === "AbortError" || String(err).includes("AbortError"))) throw err;

      const isTimeout = err && (err.name === "TimeoutError" || err.code === "TIMEOUT" || String(err.message || err).includes("Tempo limite"));
      const isRetryableNet = err && (String(err.message || err).includes("Failed to fetch") || String(err.message || err).includes("NetworkError"));
      const isRetryableHttp = err && err.name === "HttpError" && retryOnStatuses.includes(Number(err.status));

      if ((isTimeout || isRetryableNet || isRetryableHttp) && attempt < retries) {
        const delay = Math.round(retryBaseDelayMs * Math.pow(retryBackoff, attempt));
        await sleep(delay);
        attempt += 1;
        continue;
      }

      throw err;

    } finally {
      clearTimeout(timer);
      if (signal) {
        try { signal.removeEventListener("abort", onAbort); } catch (_) {}
      }
    }
  }

  throw lastErr || new Error("Falha ao baixar o PDF.");
},

};

// expõe no escopo global (para outros scripts)
window.ApiPNCP = ApiPNCP;
window.API_EDITAIS = API_EDITAIS;
window.API_ATAS = API_ATAS;
window.API_CONTRATOS = API_CONTRATOS;
