/**
 * OpenAI 兼容：POST {baseUrl}/images/generations
 * 与聊天 /chat/completions 解耦；朋友圈、聊天等功能只需传入「图片描述」即可调用。
 */
const ImageGenerationApi = {
  _resolveBaseUrl() {
    const raw = Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '';
    return String(raw || '').trim().replace(/\/$/, '');
  },

  _resolveApiKey() {
    return String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '').trim();
  },

  _resolveDefaultModel() {
    const fromStore = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) || '').trim();
    if (fromStore) return fromStore;
    const fb = CONFIG.DEFAULT_IMAGE_GEN_MODEL;
    return typeof fb === 'string' && fb.trim() ? fb.trim() : 'dall-e-3';
  },

  /**
   * 原始请求：body 为 /v1/images/generations 的 JSON（与官方文档对齐）。
   * @param {Record<string, unknown>} body
   * @param {{ signal?: AbortSignal }} [fetchOpts]
   * @returns {Promise<object>}
   */
  async requestImagesGenerations(body, fetchOpts = {}) {
    const apiKey = this._resolveApiKey();
    const baseUrl = this._resolveBaseUrl();
    if (!apiKey) throw new Error('请先在「API 设置 → 生图设置」中配置 API Key');
    if (!baseUrl) throw new Error('请先在「API 设置 → 生图设置」中配置 API 地址');

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body && typeof body === 'object' ? body : {}),
      signal: fetchOpts.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data?.error && (data.error.message || data.error.msg))) {
      const msg = String(data?.error?.message || data?.error?.msg || response.statusText || 'images/generations 请求失败').trim();
      throw new Error(msg || 'images/generations 请求失败');
    }
    return data;
  },

  /**
   * 将接口返回规范化为业务无关结构（各功能模块只依赖此形状，不解析 raw）。
   * @param {object} data
   * @param {{ formatHint?: string, outputFormatHint?: string }} [hint] 请求体/响应里的 format 或 output_format，用于拼 data URL 的 mime
   * @returns {{
   *   images: Array<{ dataUrl: string|null, b64: string|null, url: string|null, revisedPrompt?: string }>,
   *   usage: object|null,
   *   created: number|null,
   *   raw: object
   * }}
   */
  normalizeGenerationsResponse(data, hint = {}) {
    const raw = data && typeof data === 'object' ? data : {};
    const list = Array.isArray(raw.data) ? raw.data : [];
    const mimeFromOutput = () => {
      const o = String(
        hint.formatHint || hint.outputFormatHint || raw.format || raw.output_format || ''
      ).toLowerCase();
      if (o === 'jpeg' || o === 'jpg') return 'image/jpeg';
      if (o === 'webp') return 'image/webp';
      return 'image/png';
    };
    const mime = mimeFromOutput();
    const images = list.map((item) => {
      const b64 = item && item.b64_json != null ? String(item.b64_json).trim() : '';
      const url = item && item.url != null ? String(item.url).trim() : '';
      const revised = item && item.revised_prompt != null ? String(item.revised_prompt).trim() : '';
      let dataUrl = null;
      if (b64) dataUrl = `data:${mime};base64,${b64}`;
      const out = {
        dataUrl,
        b64: b64 || null,
        url: url || null
      };
      if (revised) out.revisedPrompt = revised;
      return out;
    });
    return {
      images,
      usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : null,
      created: Number.isFinite(Number(raw.created)) ? Number(raw.created) : null,
      raw
    };
  },

  /**
   * 一行描述生成图片（POST images/generations）。
   * @param {string} description 生图提示/描述
   * @param {{
   *   model?: string,
   *   n?: number,
   *   size?: string,
   *   quality?: string,
   *   format?: 'png'|'jpeg'|'webp',
   *   responseFormat?: 'b64_json' | 'url',
   *   signal?: AbortSignal
   * }} [options] 未传 model 时用「生图设置」中的模型；请求体使用网关字段 format（png/jpeg/webp）；response_format 默认 b64_json
   * @returns {Promise<{ images: Array<{ dataUrl: string|null, b64: string|null, url: string|null, revisedPrompt?: string }>, usage: object|null, created: number|null, raw: object }>}
   */
  async generateFromDescription(description, options = {}) {
    const prompt = String(description || '').trim();
    if (!prompt) throw new Error('图片描述不能为空');

    const modelOpt = options.model != null ? String(options.model).trim() : '';
    const model = modelOpt || this._resolveDefaultModel();

    let n = Number.isFinite(Number(options.n)) ? Math.floor(Number(options.n)) : 1;
    n = Math.min(10, Math.max(1, n));

    const body = {
      prompt,
      model,
      n
    };

    if (options.size != null && String(options.size).trim()) body.size = String(options.size).trim();
    if (options.quality != null && String(options.quality).trim()) body.quality = String(options.quality).trim();
    const fmt = options.format != null ? String(options.format).trim().toLowerCase() : '';
    if (fmt === 'png' || fmt === 'jpeg' || fmt === 'webp') body.format = fmt;

    const rf = options.responseFormat != null ? String(options.responseFormat).trim().toLowerCase() : '';
    body.response_format = rf === 'url' ? 'url' : 'b64_json';

    const data = await this.requestImagesGenerations(body, { signal: options.signal });
    const normalized = this.normalizeGenerationsResponse(data, {
      formatHint: body.format
    });
    if (!normalized.images.length) throw new Error('接口未返回图片数据');
    return normalized;
  },

  /**
   * 将垫图地址转为 multipart 文件字段（data URL 或 http(s)）。
   * @param {string} url
   * @param {number} idx
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  async _blobFromEditSource(url, idx) {
    const u = String(url || '').trim();
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(u)) {
      const m = u.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new Error('垫图数据无效');
      const mime = String(m[1]).trim();
      let bin;
      try {
        bin = atob(m[2]);
      } catch (e) {
        throw new Error('垫图 Base64 无效');
      }
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const ext = /webp/i.test(mime) ? 'webp' : /png/i.test(mime) ? 'png' : 'jpg';
      return { blob, filename: `ref_${idx}.${ext}` };
    }
    if (/^https?:\/\//i.test(u)) {
      const r = await fetch(u);
      if (!r.ok) throw new Error('垫图地址无法读取');
      const blob = await r.blob();
      const ct = String(blob.type || r.headers.get('content-type') || '');
      const ext = /webp/i.test(ct) ? 'webp' : /png/i.test(ct) ? 'png' : 'jpg';
      return { blob, filename: `ref_${idx}.${ext}` };
    }
    throw new Error('垫图仅支持本地上传的图片或 http(s) 链接');
  },

  /**
   * POST multipart/form-data（与常见网关 image[] 字段一致）；勿手动设置 Content-Type。
   */
  async requestImagesEditsMultipart(formData, fetchOpts = {}) {
    const apiKey = this._resolveApiKey();
    const baseUrl = this._resolveBaseUrl();
    if (!apiKey) throw new Error('请先在「API 设置 → 生图设置」中配置 API Key');
    if (!baseUrl) throw new Error('请先在「API 设置 → 生图设置」中配置 API 地址');
    if (!(typeof FormData !== 'undefined' && formData instanceof FormData)) {
      throw new Error('images/edits 需使用 FormData');
    }

    const response = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData,
      signal: fetchOpts.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data?.error && (data.error.message || data.error.msg))) {
      const msg = String(data?.error?.message || data?.error?.msg || response.statusText || 'images/edits 请求失败').trim();
      throw new Error(msg || 'images/edits 请求失败');
    }
    return data;
  },

  /**
   * 是否走 GPT Image 系列 edits 语义（多图 `image[]` 等）。
   * 官方：https://developers.openai.com/api/reference/resources/images/methods/edit
   */
  _isGptImageEditModel(model) {
    const m = String(model || '').trim().toLowerCase();
    return m.startsWith('gpt-image') || m.includes('chatgpt-image');
  },

  /**
   * gpt-image-2（含快照如 gpt-image-2-2026-04-21）：与 1.x 不同，勿传 input_fidelity。
   */
  _isGptImage2Model(model) {
    const m = String(model || '').trim().toLowerCase();
    return m === 'gpt-image-2' || m.startsWith('gpt-image-2');
  },

  /**
   * 仅 gpt-image-1 / 1.5 / 1-mini 等 1 系支持 input_fidelity；gpt-image-2、chatgpt-image-* 不传。
   */
  _shouldSendInputFidelityForEdits(model) {
    const raw = String(model || '').trim();
    const m = raw.toLowerCase();
    if (this._isGptImage2Model(model)) return false;
    if (m.includes('chatgpt-image')) return false;
    return /^gpt-image-1(\.|$|-)/i.test(raw);
  },

  /**
   * dall-e-2：仅单张图，multipart 字段名为 `image`（非 image[]）。
   */
  _isDalle2EditModel(model) {
    const m = String(model || '').trim().toLowerCase();
    return m === 'dall-e-2' || m.startsWith('dall-e-2');
  },

  /**
   * OpenAI 文档明确 /images/edits 不支持 dall-e-3（仅 gpt-image-*、chatgpt-image-latest、dall-e-2）。
   */
  _isUnsupportedDalle3ForEdits(model) {
    const m = String(model || '').trim().toLowerCase();
    return m === 'dall-e-3' || m.startsWith('dall-e-3@');
  },

  /**
   * 文 + 参考图（垫图）：POST /v1/images/edits。
   * - GPT Image：multipart 使用 `image[]`；仅 gpt-image-1 / 1.5 / 1-mini 等传 `input_fidelity=high`。gpt-image-2、chatgpt-image-latest 不传。
   * - dall-e-2：仅首张，字段名为 `image`。
   * @param {string} prompt
   * @param {string[]} imageUrls data URL 或 http(s) URL
   * @param {{
   *   model?: string,
   *   n?: number,
   *   responseFormat?: 'b64_json' | 'url',
   *   inputFidelity?: 'low' | 'high' | '',
   *   signal?: AbortSignal
   * }} [options] responseFormat 仅保留签名兼容；multipart /images/edits 多数网关（含 gpt-image-2）不支持该字段，不传，按接口默认（多为 base64）。inputFidelity 仅对 gpt-image-1 / 1.5 / 1-mini 等生效；空字符串时 1 系仍按内部约定传 high（与历史行为一致）；显式 low/high 时按用户选择传参。
   */
  async editFromPromptAndImageUrls(prompt, imageUrls, options = {}) {
    const p = String(prompt || '').trim();
    if (!p) throw new Error('提示词不能为空');

    const urls = Array.isArray(imageUrls) ? imageUrls.map((u) => String(u || '').trim()).filter(Boolean) : [];
    if (!urls.length) throw new Error('请至少上传一张参考图作为垫图');

    const modelOpt = options.model != null ? String(options.model).trim() : '';
    const model = modelOpt || this._resolveDefaultModel();

    if (this._isUnsupportedDalle3ForEdits(model)) {
      throw new Error(
        '图生图（/v1/images/edits）不支持模型 dall-e-3。请在「API 设置 → 生图设置」中改为 gpt-image-2、gpt-image-1.5、gpt-image-1、gpt-image-1-mini、chatgpt-image-latest 或 dall-e-2。详见：https://developers.openai.com/api/reference/resources/images/methods/edit'
      );
    }

    const refCap =
      typeof CONFIG !== 'undefined' && Number(CONFIG.MOMENTS_IMAGE_STUDIO_REF_MAX) > 0
        ? Math.floor(Number(CONFIG.MOMENTS_IMAGE_STUDIO_REF_MAX))
        : 10;
    const slice = urls.slice(0, refCap);

    let n = Number.isFinite(Number(options.n)) ? Math.floor(Number(options.n)) : 1;
    n = Math.min(10, Math.max(1, n));

    const fd = new FormData();
    fd.append('model', model);
    fd.append('n', String(n));
    fd.append('prompt', p);

    const infRaw = options.inputFidelity != null ? String(options.inputFidelity).trim().toLowerCase() : '';
    if (this._shouldSendInputFidelityForEdits(model)) {
      if (infRaw === 'low' || infRaw === 'high') {
        fd.append('input_fidelity', infRaw);
      } else {
        fd.append('input_fidelity', 'high');
      }
    }

    if (this._isDalle2EditModel(model)) {
      const { blob, filename } = await this._blobFromEditSource(slice[0], 0);
      fd.append('image', blob, filename);
      if (slice.length > 1) {
        try {
          console.warn('[ImageGenerationApi] dall-e-2 仅支持单张垫图，已忽略其余参考图');
        } catch (e) {}
      }
    } else {
      for (let i = 0; i < slice.length; i++) {
        const { blob, filename } = await this._blobFromEditSource(slice[i], i);
        fd.append('image[]', blob, filename);
      }
    }

    const data = await this.requestImagesEditsMultipart(fd, { signal: options.signal });
    const normalized = this.normalizeGenerationsResponse(data, {
      formatHint: data && (data.format || data.output_format)
    });
    if (!normalized.images.length) throw new Error('接口未返回图片数据');
    return normalized;
  }
};
