// 消息解析器
// 负责将文本内容解析为结构化消息数组

const MessageParser = {
  /**
   * 解析文本内容，返回消息数组
   * @param {string} text 原始文本内容
   * @param {boolean} isGroup 是否为群聊模式
   * @returns {Array<Object>} 消息数组，每个消息对象包含：
   *   - type: 消息类型（'text', 'image', 'transfer' 等，或 'plain' 表示普通内容）
   *   - characterName: 角色名（群聊时才有）
   *   - content: 消息内容
   *   - style: 渲染样式（'bubble' 或 'plain'）
   *   - 其他类型特定字段（如 amount, remark, blessing 等）
   */
  parse(text, isGroup = false) {
    let raw = String(text || '').trim();
    if (!raw) return [];

    const messages = [];

    // 兼容模型把多种类型“挤在同一行”的输出：
    // 例如：[动作]... [语音]... [消息]...
    // 原解析器是逐行 + ^...$ 匹配；若同一行包含多个标签，后续标签会被当作内容吞掉。
    // 这里在不改动渲染逻辑的前提下，把行内的类型标签“切”成多行。
    const typeNames = ['css美化', '消息', '图片', '表情包', '语音', '转账', '红包', '邀请', '分享', '动作'];
    const tagRe = new RegExp(
      // 不是行首/换行后的位置，且前面不是另一个 '['（避免 [[消息] 之类的极端情况）
      `([^\\n])\\s*(\\[(?:${typeNames.join('|')})(?:\\|[^\\]]+)?\\])`,
      'g'
    );
    raw = raw.replace(tagRe, (_m, p1, tag) => `${p1}\n${tag}`);

    const lines = raw.split('\n');
    let currentPlainText = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 空行处理：如果当前有累积的普通内容，先保存
      if (!trimmed) {
        if (currentPlainText.length > 0) {
          messages.push({
            type: 'plain',
            content: currentPlainText.join('\n'),
            style: 'plain'
          });
          currentPlainText = [];
        }
        continue;
      }

      // [系统]... 是动作协议，不应显示在聊天正文中（兜底屏蔽历史/异常残留）
      if (/^\[系统(?:\|[^\]]+)?\]/.test(trimmed)) {
        if (currentPlainText.length > 0) {
          messages.push({
            type: 'plain',
            content: currentPlainText.join('\n'),
            style: 'plain'
          });
          currentPlainText = [];
        }
        continue;
      }

      // 尝试匹配消息类型
      const matched = MessageTypes.tryMatch(trimmed, isGroup);
      
      if (matched) {
        // 如果当前有累积的普通内容，先保存
        if (currentPlainText.length > 0) {
          messages.push({
            type: 'plain',
            content: currentPlainText.join('\n'),
            style: 'plain'
          });
          currentPlainText = [];
        }

        // 添加匹配到的消息
        // 如果是群聊模式但消息中没有角色名，可能需要从上下文推断
        // 这里先直接使用匹配结果
        messages.push(matched);
      } else {
        // 不匹配任何类型，作为普通内容累积
        currentPlainText.push(line);
      }
    }

    // 处理最后剩余的普通内容
    if (currentPlainText.length > 0) {
      messages.push({
        type: 'plain',
        content: currentPlainText.join('\n'),
        style: 'plain'
      });
    }

    return messages;
  },

  /**
   * 将解析结果中相邻的 plain 合并为一条（content 用 \\n\\n 拼接），便于 Markdown 段落语义。
   * 不改变协议项顺序；仅在协议之间的连续正文合并。
   * @param {Array<Object>} messages parse() 返回值
   * @returns {Array<Object>}
   */
  mergeConsecutivePlain(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return messages || [];
    const out = [];
    for (const m of messages) {
      if (!m) continue;
      if (m.type === 'plain' && out.length > 0 && out[out.length - 1].type === 'plain') {
        const prev = out[out.length - 1];
        const a = String(prev.content || '');
        const b = String(m.content || '');
        prev.content = a ? (b ? `${a}\n\n${b}` : a) : b;
      } else {
        out.push({ ...m });
      }
    }
    return out;
  },

  /**
   * 解析前预处理：同一行内多个 [消息]/[图片]… 前插入换行（与 parse 内逻辑一致，供正则页回显）
   */
  getInlineTagSplitDescriptor() {
    const typeNames = ['css美化', '消息', '图片', '表情包', '语音', '转账', '红包', '邀请', '分享', '动作'];
    const tagRe = new RegExp(
      `([^\\n])\\s*(\\[(?:${typeNames.join('|')})(?:\\|[^\\]]+)?\\])`,
      'g'
    );
    return {
      id: 'parser-inline-tags',
      label: '行内多协议分行',
      hint: '在解析前于同一行内的多个 [类型] 标签前插入换行，便于按行匹配协议。',
      pattern: tagRe.source,
      flags: tagRe.flags || 'g'
    };
  },

  /**
   * 与 parse 内相同的换行预处理，供正则页展示「转换前后」对比
   * @param {string} [sampleText] 示例原文；不传则用内置示例
   */
  previewInlineTagSplit(sampleText) {
    const typeNames = ['css美化', '消息', '图片', '表情包', '语音', '转账', '红包', '邀请', '分享', '动作'];
    const tagRe = new RegExp(
      `([^\\n])\\s*(\\[(?:${typeNames.join('|')})(?:\\|[^\\]]+)?\\])`,
      'g'
    );
    const before =
      sampleText !== undefined && sampleText !== null
        ? String(sampleText)
        : '同一行里 [消息]你好呀 [图片]附图一张';
    const after = before.replace(tagRe, (_m, p1, tag) => `${p1}\n${tag}`);
    return { before, after };
  },

  /**
   * 验证消息格式是否正确
   * @param {string} text 消息文本
   * @returns {Object} {valid: boolean, errors: Array<string>}
   */
  validate(text) {
    const errors = [];
    const raw = String(text || '');
    
    // 检查是否包含非法的 ] 字符（在内容部分）
    // 这里简单检查：如果内容中有 ] 但不在格式标记中，可能有问题
    // 更严格的检查需要在解析时进行
    
    // 检查格式完整性
    const lines = raw.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // 检查是否有未闭合的 [ 标记
      const openBrackets = (trimmed.match(/\[/g) || []).length;
      const closeBrackets = (trimmed.match(/\]/g) || []).length;
      
      if (openBrackets !== closeBrackets) {
        errors.push(`第 ${index + 1} 行：格式标记不匹配（[ 和 ] 数量不一致）`);
      }

      // 检查内容中是否包含 ]（这会导致解析错误）
      // 如果匹配到消息类型，但内容部分包含 ]，则警告
      const matched = MessageTypes.tryMatch(trimmed);
      if (matched) {
        // 已经匹配成功，说明格式正确
        // 但如果内容中包含 ]，建议用户使用 【】
        if (matched.content && matched.content.includes(']')) {
          errors.push(`第 ${index + 1} 行：内容中包含 ] 字符，建议使用 【】 替代`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageParser;
}

