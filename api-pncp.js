// URLs das 3 fontes diferentes do PNCP (API de Consulta - acesso público)
// Manual (API de Consultas) referencia a base https://pncp.gov.br/api/consulta
// e endpoints /v1/contratacoes/publicacao, /v1/atas, /v1/contratos.
const API_EDITAIS = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";
const API_ATAS = "https://pncp.gov.br/api/consulta/v1/atas";
const API_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";

const ApiPNCP = {
  onlyDigits: (s) => (s || "").toString().replace(/\D+/g, ""),

  getDateRange: (daysAgo = 30) => {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - daysAgo);

    const format = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`; // AAAAMMDD
    };

    return { dataInicial: format(past), dataFinal: format(today) };
  },

  // Constrói URL com params arbitrários (cada endpoint tem params próprios)
  buildUrl: (baseUrl, params = {}) => {
    const u = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const sv = String(v).trim();
      if (sv === "") return;
      u.searchParams.set(k, sv);
    });
    return u.toString();
  },

  // Timeout + cancelamento externo (AbortController)
  fetchJsonWithTimeout: async (url, ms = 20000, externalSignal) => {
    const ctrl = new AbortController();

    const onAbort = () => {
      try {
        ctrl.abort(externalSignal?.reason || new DOMException("Aborted", "AbortError"));
      } catch {
        ctrl.abort();
      }
    };

    if (externalSignal) {
      if (externalSignal.aborted) throw new DOMException("Aborted", "AbortError");
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }

    const t = setTimeout(() => {
      try {
        ctrl.abort(new DOMException("Timeout", "AbortError"));
      } catch {
        ctrl.abort();
      }
    }, ms);

    try {
      const resp = await fetch(url, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: {
          "accept": "application/json, text/plain, */*"
        }
      });

      // 204 No Content
      if (resp.status === 204) return { data: [], empty: true };

      const text = await resp.text();

      if (!resp.ok) {
        // Tenta pegar um detalhe curto do corpo, se houver
        let detail = "";
        const cleaned = (text || "").replace(/\s+/g, " ").trim();
        try {
          const j = JSON.parse(text);
          detail = String(j?.message || j?.erro || j?.error || j?.detail || "").trim();
        } catch {
          // sem JSON
        }
        if (!detail && cleaned) detail = cleaned.slice(0, 200);

        throw new Error(`HTTP ${resp.status}${detail ? " - " + detail : ""} | ${url}`);
      }

      if (!text || text.trim() === "") return { data: [] };

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida (JSON) | ${url}`);
      }
    } finally {
      clearTimeout(t);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
  },

  // Tenta extrair array de dados de respostas padronizadas do PNCP
  extractData: (json) => {
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json)) return json;
    return [];
  },

  // Metadados de paginação (quando o endpoint retorna padronizado)
  extractPaging: (json) => {
    const toInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    return {
      totalRegistros: toInt(json?.totalRegistros),
      totalPaginas: toInt(json?.totalPaginas),
      numeroPagina: toInt(json?.numeroPagina),
      paginasRestantes: toInt(json?.paginasRestantes),
      empty: Boolean(json?.empty)
    };
  },

  // Pega o primeiro valor existente, não vazio
  pick: (obj, keys) => {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null) {
        const v = String(obj[k]).trim();
        if (v !== "") return obj[k];
      }
    }
    return "";
  },

  // Parse robusto de datas (aceita AAAAMMDD ou ISO)
  parseDateMs: (value) => {
    const s = String(value || "").trim();
    if (!s) return 0;

    // AAAAMMDD
    if (/^\d{8}$/.test(s)) {
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6)) - 1;
      const d = Number(s.slice(6, 8));
      const dt = new Date(Date.UTC(y, m, d));
      return Number.isFinite(dt.getTime()) ? dt.getTime() : 0;
    }

    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : 0;
  },

  formatDateBR: (value) => {
    const ms = ApiPNCP.parseDateMs(value);
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("pt-BR");
  },

  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));

    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const t = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  }),

  /**
   * Baixa todas as páginas (até limites) para endpoints com paginação.
   * Observação importante: nem todo endpoint aceita 'tamanhoPagina'.
   * Por isso, só envia 'tamanhoPagina' quando ele foi fornecido explicitamente em params.
   * Retorna { data, meta }.
   */
  fetchAllPages: async (baseUrl, params, options = {}) => {
    const {
      signal,
      timeoutMs = 20000,
      pageDelayMs = 120,
      maxPages = 80,
      maxItems = 15000,
      onProgress
    } = options;

    const baseParams = { ...(params || {}) };

    // pagina é obrigatório nos endpoints de consulta do PNCP.
    let page = baseParams?.pagina ? Number(baseParams.pagina) : 1;

    // Só inclui tamanhoPagina se foi passado explicitamente.
    let includePageSize = Object.prototype.hasOwnProperty.call(baseParams, "tamanhoPagina");
    let pageSize = includePageSize ? Number(baseParams.tamanhoPagina) : undefined;

    const all = [];
    let totalPages = 0;
    let fallbackUsed = false;

    const isHttp400 = (err) => /HTTP\s+400\b/.test(String(err?.message || err));

    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const url = ApiPNCP.buildUrl(baseUrl, {
        ...baseParams,
        pagina: page,
        ...(includePageSize ? { tamanhoPagina: pageSize } : {})
      });

      let json;
      try {
        json = await ApiPNCP.fetchJsonWithTimeout(url, timeoutMs, signal);
      } catch (err) {
        // Fallback: se o endpoint rejeitar 'tamanhoPagina', tenta novamente sem ele.
        if (!fallbackUsed && includePageSize && isHttp400(err)) {
          includePageSize = false;
          fallbackUsed = true;
          continue; // re-tenta a mesma página sem tamanhoPagina
        }
        throw err;
      }

      const data = ApiPNCP.extractData(json);
      const paging = ApiPNCP.extractPaging(json);

      if (!totalPages && paging.totalPaginas) totalPages = paging.totalPaginas;

      all.push(...data);

      if (typeof onProgress === "function") {
        onProgress({
          page,
          totalPages: totalPages || paging.totalPaginas || 0,
          itemsSoFar: all.length,
          lastPageItems: data.length
        });
      }

      // Paradas
      if (data.length === 0) break;
      if (paging.paginasRestantes === 0 && paging.totalPaginas) break;
      if (totalPages && page >= totalPages) break;
      if (page >= maxPages) break;
      if (all.length >= maxItems) break;

      page += 1;
      if (pageDelayMs > 0) await ApiPNCP.sleep(pageDelayMs, signal);
    }

    const truncated = (page >= maxPages) || (all.length >= maxItems);
    return { data: all, meta: { truncated, pagesFetched: page, totalPages, fallbackUsed } };
  }
};
