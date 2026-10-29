// 消息类型注册表
// 定义所有支持的消息类型及其解析规则、转换逻辑

const MessageTypes = {
  /**
   * 消息类型配置
   * @type {Object<string, {pattern: RegExp, converter: Function, style: 'bubble'|'plain'}>}
   */
  registry: {},

  /**
   * 注册消息类型
   * @param {string} typeName 类型名称（如 'text', 'image'）
   * @param {Object} config 配置对象
   * @param {RegExp} config.pattern 正则表达式，用于匹配消息格式
   * @param {Function} config.converter 转换函数 (match, isGroup) => {type, characterName?, content, ...}
   * @param {'bubble'|'plain'} config.style 渲染样式：'bubble' 带气泡，'plain' 普通文本
   */
  register(typeName, config) {
    if (!typeName || typeof typeName !== 'string') {
      throw new Error('消息类型名称必须是字符串');
    }
    if (!config.pattern || !(config.pattern instanceof RegExp)) {
      throw new Error(`消息类型 ${typeName} 必须提供有效的正则表达式`);
    }
    if (typeof config.converter !== 'function') {
      throw new Error(`消息类型 ${typeName} 必须提供转换函数`);
    }
    if (config.style !== 'bubble' && config.style !== 'plain') {
      throw new Error(`消息类型 ${typeName} 的样式必须是 'bubble' 或 'plain'`);
    }

    this.registry[typeName] = {
      pattern: config.pattern,
      converter: config.converter,
      style: config.style || 'bubble',
      priority: config.priority || 0 // 优先级，数字越大越先匹配
    };
  },

  /**
   * 获取所有已注册的类型，按优先级排序
   * @returns {Array<{typeName: string, config: Object}>}
   */
  getAllTypes() {
    return Object.entries(this.registry)
      .map(([typeName, config]) => ({ typeName, config }))
      .sort((a, b) => b.config.priority - a.config.priority);
  },

  /**
   * 尝试匹配消息类型
   * @param {string} text 消息文本
   * @param {boolean} isGroup 是否为群聊模式（可选，用于某些转换逻辑）
   * @returns {Object|null} 匹配结果 {type, characterName?, content, ...} 或 null
   */
  tryMatch(text, isGroup = false) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;

    // 按优先级顺序尝试匹配
    const types = this.getAllTypes();
    for (const { typeName, config } of types) {
      const match = trimmed.match(config.pattern);
      if (match) {
        try {
          const result = config.converter(match, trimmed, isGroup);
          return {
            ...result,
            type: typeName,
            style: config.style
          };
        } catch (e) {
          console.warn(`消息类型 ${typeName} 转换失败:`, e);
          continue;
        }
      }
    }

    return null;
  },

  /** 内置协议类型在「正则」页展示用中文名 */
  SYSTEM_TYPE_LABELS: {
    transfer: '转账',
    redpacket: '红包',
    collect_transfer: '收取转账',
    collect_redpacket: '收取红包',
    css_beautify: 'CSS美化',
    action: '动作',
    suggested_reply: '建议回复',
    invitation: '邀请',
    share: '分享',
    image: '图片',
    sticker: '表情包',
    voice_text: '语音',
    text: '消息',
    dialogue: '对白'
  },

  /** 各内置协议一条示例输入，供正则页「转换预览」 */
  BUILTIN_PREVIEW_LINES: {
    transfer: '[转账]28.00|咖啡',
    redpacket: '[红包]5.20|新春快乐',
    collect_transfer: '[收取转账]28.00|咖啡|a3k9x2|领取',
    collect_redpacket: '[收取红包]5.20|新春快乐|m7p2n1|领取',
    css_beautify: '[css美化]梦幻独角兽（晨雾粉蓝）+ 极光紫（紫粉）',
    action: '[动作]揉了揉眼睛',
    suggested_reply: '[建议回复]好的我知道了|晚点回复你|我们电话聊',
    invitation: '[邀请]明晚八点线上见',
    share:
      '[分享]微信|订单|支付成功|SO001|周末采购|256|已支付|1712707200|浦东新区|🍎|苹果|2|500g|12.5',
    image: '[图片]海边日落',
    sticker: '[表情包]熊猫点赞',
    voice_text: '[语音]记得带伞',
    text: '[消息]马上到|你们到了吗',
    dialogue: '[对白]我在你身边，别紧张'
  },

  /**
   * 单行示例 → tryMatch 结果，用于正则页展示「识别后长什么样」
   * @returns {{ input: string, parsed: Object|null, error?: string }|null}
   */
  getBuiltinProtocolPreview(typeName) {
    const line = this.BUILTIN_PREVIEW_LINES[typeName];
    if (!line) return null;
    try {
      const parsed = this.tryMatch(line, false);
      return { input: line, parsed };
    } catch (e) {
      return { input: line, parsed: null, error: String(e && e.message ? e.message : e) };
    }
  },

  /**
   * 供全局正则页回显：系统级「行首协议」识别规则（只读，非 GlobalRegex 替换）
   * @returns {Array<{ typeName: string, label: string, pattern: string, flags: string, priority: number, style: string }>}
   */
  getBuiltinProtocolDescriptors() {
    return this.getAllTypes().map(({ typeName, config }) => {
      const pat = config.pattern;
      return {
        typeName,
        label: this.SYSTEM_TYPE_LABELS[typeName] || typeName,
        pattern: pat instanceof RegExp ? pat.source : String(pat),
        flags: pat instanceof RegExp ? (pat.flags || '') : 'g',
        priority: config.priority || 0,
        style: config.style || 'bubble'
      };
    });
  }
};

// ==================== 注册内置消息类型 ====================

/**
 * 创建单聊/群聊通用正则模式
 * @param {string} typeName 类型名称（如 '消息', '图片'）
 * @returns {RegExp} 正则表达式
 */
function createMessagePattern(typeName) {
  // 格式：[类型]内容 或 [类型|角色名]内容
  // 注意：内容部分不能包含 ]，所以用非贪婪匹配
  return new RegExp(`^\\[${typeName}(?:\\|([^\\]]+))?\\](.+)$`);
}

/**
 * 创建带分隔符的正则模式（如转账、红包：金额|备注）
 * @param {string} typeName 类型名称
 * @returns {RegExp} 正则表达式
 */
function createSeparatedPattern(typeName) {
  // 格式：[类型]金额|备注 或 [类型|角色名]金额|备注
  return new RegExp(`^\\[${typeName}(?:\\|([^\\]]+))?\\](.+?)\\|(.+)$`);
}

/**
 * 转账/红包：金额|备注|消息ID(第三段 6 位小写字母+数字，链到原发送卡；UI 不展示)
 */
function createMoneySeparatedPattern(typeName) {
  return new RegExp(`^\\[${typeName}(?:\\|([^\\]]+))?\\]([^|]+)\\|([^|]+)(?:\\|([^|\\]]+))?$`);
}

/** 收取转账/红包：金额|备注或祝福|原消息ID|领取或退还（第四段可省略，默认领取） */
function createCollectMoneyPattern(typeName) {
  return new RegExp(
    `^\\[${typeName}(?:\\|([^\\]]+))?\\]([^|]+)\\|([^|]+)\\|([^|]+)(?:\\|([^|\\]]+))?$`
  );
}

function parseCollectStatusSegment(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'received';
  if (s === '退还' || s === '否' || s === '拒绝' || s === 'refunded') return 'refunded';
  return 'received';
}

// 0. CSS美化 [css美化]标题（标题用于保存为气泡预设名；CSS 内容通过 ```css ... ``` 单独提供）
MessageTypes.register('css_beautify', {
  pattern: createMessagePattern('css美化'),
  priority: 110, // 高于转账红包：避免被更通用的规则抢占
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = String(match[2] || '').trim();
    return {
      characterName,
      content
    };
  }
});

// 1. 转账 [转账]金额|备注|消息ID 或 [转账|角色名]金额|备注|消息ID（第三段消息ID 仅给模型/API，UI 不展示）
MessageTypes.register('transfer', {
  pattern: createMoneySeparatedPattern('转账'),
  priority: 101,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const amount = match[2] || '';
    const remark = match[3] || '';
    const messageId = String(match[4] || '').trim();
    return {
      characterName,
      amount: parseFloat(amount) || 0,
      remark,
      messageId,
      content: `${amount}|${remark}`
    };
  }
});

// 2. 红包 [红包]金额|祝福语|消息ID
MessageTypes.register('redpacket', {
  pattern: createMoneySeparatedPattern('红包'),
  priority: 101,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const amount = match[2] || '';
    const blessing = match[3] || '';
    const messageId = String(match[4] || '').trim();
    return {
      characterName,
      amount: parseFloat(amount) || 0,
      blessing,
      messageId,
      content: `${amount}|${blessing}`
    };
  }
});

// 2b. 收取红包/转账（正式聊天消息；第三段为原 [转账]/[红包] 的消息ID，第四段 领取|退还）
MessageTypes.register('collect_redpacket', {
  pattern: createCollectMoneyPattern('收取红包'),
  priority: 102,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const amount = match[2] || '';
    const blessing = match[3] || '';
    const linkedMessageId = String(match[4] || '').trim();
    const status = parseCollectStatusSegment(match[5]);
    return {
      characterName,
      amount: parseFloat(amount) || 0,
      blessing,
      messageId: linkedMessageId,
      collectStatus: status,
      content: `${amount}|${blessing}`
    };
  }
});

MessageTypes.register('collect_transfer', {
  pattern: createCollectMoneyPattern('收取转账'),
  priority: 102,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const amount = match[2] || '';
    const remark = match[3] || '';
    const linkedMessageId = String(match[4] || '').trim();
    const status = parseCollectStatusSegment(match[5]);
    return {
      characterName,
      amount: parseFloat(amount) || 0,
      remark,
      messageId: linkedMessageId,
      collectStatus: status,
      content: `${amount}|${remark}`
    };
  }
});

// 3. 动作 [动作]动作描述 或 [动作|发起者]动作描述
MessageTypes.register('action', {
  pattern: createMessagePattern('动作'),
  priority: 90,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = match[2] || '';
    return {
      characterName,
      content
    };
  }
});

// 3.5 建议回复 [建议回复]选项1|选项2|选项3
MessageTypes.register('suggested_reply', {
  pattern: createMessagePattern('建议回复'),
  priority: 89,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = String(match[2] || '').trim();
    const suggestedReplies = content
      .split('|')
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 6);
    return {
      characterName,
      content,
      suggestedReplies
    };
  }
});

// 4. 邀请 [邀请]邀请内容 或 [邀请|角色名]邀请内容
MessageTypes.register('invitation', {
  pattern: createMessagePattern('邀请'),
  priority: 90,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = match[2] || '';
    return {
      characterName,
      content
    };
  }
});

// 4.5 分享（中文协议）
// [分享]应用|资源|动作|主键|标题|金额|状态|时间|地址|图标|名称|数量|规格|单价...
MessageTypes.register('share', {
  pattern: createMessagePattern('分享'),
  priority: 85,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = String(match[2] || '');
    // 新分享消息体（不做旧格式兼容）
    // 固定头 9 段：应用|资源|动作|主键|标题|金额|状态|时间|地址
    // 明细段：每个商品固定 5 段：图标|名称|数量|规格|单价
    const parts = content.split('|');
    const app = String(parts[0] || '');
    const resource = String(parts[1] || '');
    const action = String(parts[2] || '');
    const orderId = String(parts[3] || '');
    const title = String(parts[4] || '');
    const total = Number(parts[5] || 0) || 0;
    const status = String(parts[6] || '');
    const ts = Number(parts[7] || 0) || 0;
    const address = String(parts[8] || '');
    let sharePayloadB64 = '';
    let items = [];

    // 订单详情页依赖 payState/paidBy 来判断“已支付/已代付/未支付”
    // 分享协议只保留了 status，这里把 status 映射回订单结构字段。
    let payState = 'paid';
    let paidBy = 'self';
    if (status === '已代付') {
      payState = 'proxy_paid';
      paidBy = 'proxy';
    } else if (status === '未支付') {
      payState = 'unpaid';
      paidBy = 'unpaid';
    } else if (status === '自己已支付' || status === '已支付' || !status) {
      payState = 'paid';
      paidBy = 'self';
    }

    if (parts.length >= 9) {
      const rest = parts.slice(9);
      let itemRest = rest;
      if (itemRest.length && /^payloadB64:/i.test(String(itemRest[0] || ''))) {
        sharePayloadB64 = String(itemRest[0] || '').replace(/^payloadB64:/i, '');
        itemRest = itemRest.slice(1);
      }
      const CHUNK = 5; // icon|name|qty|specText|unitPrice
      if (itemRest.length >= CHUNK && itemRest.length % CHUNK === 0) {
        items = [];
        for (let i = 0; i < itemRest.length; i += CHUNK) {
          const icon = String(itemRest[i] || '');
          const name = String(itemRest[i + 1] || '');
          const qty = Number(itemRest[i + 2] || 0) || 0;
          const specText = String(itemRest[i + 3] || '');
          const unitPrice = Number(itemRest[i + 4] || 0) || 0;
          items.push({ icon, name, qty, specText, unitPrice });
        }
      }
    }
    const sanitizedContent = [
      app,
      resource,
      action,
      orderId,
      title,
      String(total),
      status,
      String(ts),
      address
    ].join('|');

    return {
      characterName,
      app,
      resource,
      action,
      status,
      orderId,
      title,
      total,
      order: {
        app,
        resource,
        action,
        id: orderId,
        title,
        total,
        address,
        ts,
        status,
        payState,
        paidBy,
        items
      },
      // 兼容字段：后续渲染如果引用这些字段也不会报错
      sharePayloadB64,
      content: sanitizedContent
    };
  }
});

// 5. 图片 [图片]描述 或 [图片|角色名]描述
MessageTypes.register('image', {
  pattern: createMessagePattern('图片'),
  priority: 80,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = match[2] || '';
    return {
      characterName,
      content
    };
  }
});

// 5.5 表情包 [表情包]描述 或 [表情包|角色名]描述
MessageTypes.register('sticker', {
  pattern: createMessagePattern('表情包'),
  priority: 80,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = match[2] || '';
    return {
      characterName,
      content
    };
  }
});

// 6. 语音 [语音]内容 或 [语音|角色名]内容
MessageTypes.register('voice_text', {
  pattern: createMessagePattern('语音'),
  priority: 80,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    const content = match[2] || '';
    return {
      characterName,
      ...parseBubbleTextBody(content)
    };
  }
});

/**
 * [消息]/[对白] 正文：|| 双语（中文||外语）优先于单 | 引用回复
 */
function parseBubbleTextBody(content) {
  const raw = String(content || '');
  const biIdx = raw.indexOf('||');
  if (biIdx >= 0) {
    const zh = raw.slice(0, biIdx).trim();
    const foreign = raw.slice(biIdx + 2).trim();
    if (zh && foreign) {
      return {
        content: zh,
        foreignText: foreign,
        isBilingual: true,
        isReply: false
      };
    }
  }
  const replyMatch = raw.match(/^([\s\S]+?)\|([\s\S]+)$/);
  if (replyMatch) {
    return {
      content: String(replyMatch[1] || '').trim(),
      replyTo: String(replyMatch[2] || '').trim(),
      isReply: true,
      isBilingual: false
    };
  }
  return {
    content: raw,
    isReply: false,
    isBilingual: false
  };
}

// 7. 消息（文本） [消息]内容 或 [消息|角色名]内容
// 双语：[消息]中文||外语；回复：[消息]回复|引用的内容（单竖线）
MessageTypes.register('text', {
  pattern: createMessagePattern('消息'),
  priority: 70, // 较低优先级，因为格式最通用
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    return {
      characterName,
      ...parseBubbleTextBody(match[2] || '')
    };
  }
});

// 8. 对白（线下常用） [对白]内容 或 [对白|角色名]内容（兼容旧标签 [对话]）
// 显示效果与 [消息] 完全一致
MessageTypes.register('dialogue', {
  pattern: /^\[(?:对白|对话)(?:\|([^\]]+))?\](.+)$/,
  priority: 70,
  style: 'bubble',
  converter: (match, originalText, isGroup) => {
    const characterName = match[1] || null;
    return {
      characterName,
      ...parseBubbleTextBody(match[2] || '')
    };
  }
});

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageTypes;
}

