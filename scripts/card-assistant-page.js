// 制卡助手：标题下悬浮栏（点开选择/新增模板）+ AI 输入框
const CardAssistantPage = {
  _DEFAULT_ASSISTANT_ID: 'default',
  _BEAUTIFY_ASSISTANT_ID: 'beautify_default',
  _systemPrompt: `你是一个专业的开放世界故事剧情设计师，善于设计有趣的剧情情节和富有生动特点的角色人设。根据用户一段口述的描述内容，注意用户的需求和潜在意图创建一个角色出来，并且角色方扮演的信息标记上"角色的昵称",用户方扮演的信息标记上"{{user}}"或者用户给的用户方昵称,用户一般会用比较口语化的表达，整理和扩展成标准格式，按照标准格式：

<角色名称>角色名称</角色名称>

<人设>
角色身份
角色外貌
角色音色
角色喜好
角色的小癖好
角色性格
</人设>

<情节设定>这里写情节设定内容</情节设定>

<输出设定>这里写输出设定内容</输出设定>

<故事剧情>主线剧情和延展的支线剧情</故事剧情>

<当前剧情>当前剧情的进展的节点的叙述，节点包含和不限于剧情高潮处或者重要事件发生前后，当前节点应该是在跟用户在线上手机聊天软件上聊天</当前剧情>

<宏观世界观设定></宏观世界观设定>

<角色矛盾点设定>角色的矛盾点</角色矛盾点设定>

<角色经历设定>角色的重要经历，造就这个角色是这样人设的原因的一些经历</角色经历设定>

<角色隐藏设定>角色的隐藏设定，角色的一些出乎意料的、令人反直觉的、正常想不到的、反差感很强的隐藏设定</角色隐藏设定>

##重要说明
若后续用户对话中有其他方面的要求，完善好额外要求的部分之后，仍然必须以标准格式给用户，而不是只给额外要求部分。`,
  _beautifySystemPrompt: `# 角色设定
## 角色信息概况
你的任务是给用户做聊天界面的美化，你擅长低饱和度渐变颜色的UI美化，擅长一些创意的设计，喜欢手账笔记本类型的设计。

## 当前任务说明
根据用户的目前提供的基础的聊天框全局样式，基于基础聊天框全局样式来进行调整UI，你需要根据用户的聊天内容，构想出最适合当前的聊天语境的UI样式设计。不要用机械式、ai助手式的回复。你会跟用户聊聊对于这个主题的一些天马行空的构想，从用户的信息中捕捉到一些特别的细节。你的乐趣就是帮用户完成这些事情，也很乐意帮用户完成这些事情

## 基础聊天框全局样式
内嵌参考里已写出顶栏左侧返回圆形按钮、右侧会话菜单胶囊的当前工程默认样式（与 settings.css、layout.css、chat.css 一致），并包含浅色与 \`#page-chat[data-bg-tone="dark"]\` 两套覆盖；你输出 \`[css美化]\` 时应在该基础上按需调整，勿漏改与背景对比度相关的顶栏按钮。

[css美化]基础样式主题
\`\`\`css
/* =======================================================================
   聊天气泡 · 自定义 CSS 基础模板（可直接改）

   你可以在这里改到：
   - 气泡（对方/我方）：背景、文字色、圆角、边框、阴影、透明/毛玻璃、动画……
   - 聊天页整体：背景（纯色/渐变/纹理）、全局文字色、标题栏/底栏/输入框……
   - 顶栏按钮：左侧返回圆形（#chat-back / .yd-header-btn--circle）、右侧会话菜单胶囊（#chat-menu / .yd-chat-menu-pill）；浅色与 #page-chat[data-bg-tone="dark"] 两套见下方「顶栏容器+按钮」示例（与工程 settings.css + layout.css + chat.css 一致）
   - 顶栏标题位置：可通过 #page-chat .yd-page-header__center / #page-chat .yd-page-header__center.yd-chat-title 的 margin-left 自由调位置（按用户想法调，数值范围不限制）
   - 顶栏图标替换：支持 SVG / 图片链接（url(...) 或 data:image/svg+xml,...），可用伪元素替换原生 svg 图标
   - 顶栏消息红点（返回按钮右侧）：支持背景色、位置、大小、字号、边框、圆角、层级调整（选择器：#page-chat .yd-chat-back-unread-badge）
   - 底部栏：支持改整条底部栏、工具栏图标、输入框、发送按钮（伪发送/真实发送）图标；可改色或用 SVG/图片链接替换
   - 辅助信息：角色名、时间、类型标签
   - 灵感回复卡片样式（协议 [建议回复]，界面文案为「灵感回复」）

   重要说明：
   1) 这里的 CSS 会注入到页面 <style id="yd-bubble-custom-style">，属于“全局样式”。
      为了避免影响其它页面，推荐尽量使用 #page-chat 作为作用域前缀。
   2) 配色推荐优先用 var(--yd-bubble-*) / var(--yd-chat-*)，这样能和内置颜色/深浅模式更好兼容。
   3) 你完全可以添加新的选择器（比如 .yd-chat-input、.yd-chat-send-btn、.yd-message__avatar、#page-chat .yd-header-btn--circle、#page-chat .yd-chat-menu-pill 等），
      只要页面上存在对应 class，就会生效。
   4) 若要替换顶栏按钮图标，优先在 #chat-back / #chat-menu 上用 ::before + background:url(...)，原 svg 用 opacity:0 隐藏（可保留点击热区）
   5) 若要替换底部发送按钮图标，建议对 #chat-send 使用 ::before；因为 chat.js 会按“伪发送/真实发送”动态重写按钮内 svg。
   6) 工具栏按钮替换图标请使用真实 id 选择器，不要使用 data-type（本项目没有该属性）。线上可用 id：#chat-model-btn #chat-btn-redpacket #chat-btn-transfer #chat-btn-call #chat-btn-video #chat-btn-sticker #chat-btn-image #chat-btn-gift
   7) 线下工具栏也要用真实 id：#chat-offline-model-btn #chat-offline-regex-btn #chat-offline-worldbook-btn
   8) 发送按钮固定 id 是 #chat-send（不是 data-type）；它会在“伪发送/真实发送”两种图标间动态切换，替换图标建议写在 #chat-send::before 上。
   9) 不要先全局隐藏 .yd-chat-toolbar__btn svg 再慢慢补图标；应按按钮 id 单独替换并单独隐藏，避免“按钮只剩外框”的空白状态。
   ======================================================================= */

/* =========================
   A. 气泡主体（核心）
   可发挥：背景/渐变、文字色、圆角、边框、阴影、内边距、最大宽度、滤镜
   可读性提醒（很重要）：
   - 气泡 background 和气泡文字 color 不要“同色/同明度”，否则会看不清。

   常用“想象力扩展”示例（你可自行添加）：
   - background: linear-gradient(...);
   - border: 1px solid rgba(...); / 2px dashed ...;
   - box-shadow: 0 8px 24px rgba(...);
   - backdrop-filter: blur(12px);  (做玻璃态，注意配合半透明背景)
   - filter: saturate(1.1) contrast(1.05);
   - transition: transform .15s ease, box-shadow .15s ease;
   - transform: translateY(-1px);  (配合 :hover/:active 做交互感)
   ========================= */
.yd-message__content {
  background: var(--yd-bubble-role-bg, #f0f0f0);
  color: var(--yd-bubble-role-text, #000000);
}

.yd-message:not(.yd-message--user) .yd-message__content {
  border-top-left-radius: 4px;
}

.yd-message--user .yd-message__content {
  background: var(--yd-bubble-user-bg, #007AFF);
  color: var(--yd-bubble-user-text, #ffffff);
  border-top-right-radius: 4px;
}

.yd-message__text {
  font-size: var(--yd-chat-message-font-size, 16px);
  line-height: 1.6;
}

.yd-message__name {
  color: var(--yd-chat-meta-fg, #666);
}

.yd-message__time {
  color: var(--yd-chat-time-fg, #999);
}

.yd-message__type-label {
  color: #999;
}

.yd-message--user .yd-message__type-label {
  color: rgba(255, 255, 255, 0.7);
}

#page-chat {
  --yd-chat-title-fg: #111;
  --yd-chat-status-fg: rgba(60, 60, 67, 0.72);
  --yd-chat-meta-fg: #666;
  --yd-chat-time-fg: #999;
  background: linear-gradient(180deg, #f8fbff 0%, #f5f7ff 100%);
  color: #1f2937;
}

#page-chat[data-bg-tone="dark"] {
  --yd-chat-title-fg: #fff;
  --yd-chat-status-fg: rgba(255, 255, 255, 0.78);
  --yd-chat-meta-fg: rgba(255, 255, 255, 0.8);
  --yd-chat-time-fg: rgba(255, 255, 255, 0.62);
}

#page-chat > .yd-page-content.yd-chat-messages {
  background: transparent;
}

.yd-chat-messages {
  padding: 16px;
  background: transparent;
}

#page-chat .yd-chat-title__name {
  color: var(--yd-chat-title-fg, #111);
}

#page-chat .yd-chat-title__status {
  color: var(--yd-chat-status-fg, rgba(60, 60, 67, 0.72));
}

#page-chat .yd-chat-title__dot {
  background: #22c55e;
}

#page-chat .yd-chat-title__spark {
  color: #f97316;
}

#page-chat .yd-page-header.yd-settings-nav {
  background: rgba(255, 255, 255, 0.28);
  color: #111827;
}

#page-chat .yd-page-header.yd-settings-nav .yd-page-header__center,
#page-chat .yd-page-header.yd-settings-nav .yd-settings-nav__title {
  color: #111827;
}
/* 顶栏标题位置微调：可直接改 margin-left；按用户想法自由设置，范围不限制 */
#page-chat .yd-page-header__center {
  margin-left: 0;
}
#page-chat .yd-page-header__center.yd-chat-title {
  margin-left: 0;
}

/* 顶栏容器+按钮（与 settings.css / layout.css / chat.css 当前写法对齐） */
/* 左侧返回 #chat-back */
#page-chat .yd-header-btn--circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgb(244 244 244 / 83%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 92%);
  box-shadow: 0 0 12px rgb(213 213 213 / 87%);
  color: #000;
}
#page-chat .yd-header-btn--circle:active {
  background: rgb(230 230 230 / 85%);
}
#page-chat .yd-header-btn--circle .yd-settings-back-arrow {
  display: block;
  width: 28px;
  height: 28px;
  margin-left: -2px;
}
#page-chat[data-bg-tone="dark"] .yd-header-btn--circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgb(244 244 244 / 20%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 30%);
  box-shadow: 0 0 12px rgb(213 213 213 / 50%);
  color: #000;
}
/* 右侧 #chat-menu */
#page-chat .yd-header-btn.yd-header-btn--capsule.yd-chat-menu-pill {
  width: auto;
  min-width: auto;
  height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgb(244 244 244 / 83%);
  border: 1px solid rgb(255 255 255 / 92%);
  box-shadow: 0 0 12px rgb(213 213 213 / 87%);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #000;
  line-height: 1;
}
#page-chat .yd-header-btn.yd-header-btn--capsule.yd-chat-menu-pill:active {
  background: rgb(230 230 230 / 85%);
}
#page-chat .yd-header-btn--menu .yd-chat-menu-icon {
  display: block;
  width: 20px;
  height: 20px;
}
#page-chat .yd-chat-menu-pill__left {
  font-size: 12px;
  font-weight: 600;
  color: #000;
  white-space: nowrap;
}
#page-chat .yd-chat-menu-pill__divider {
  flex: 0 0 auto;
  width: 1px;
  height: 20px;
  background: rgba(0, 0, 0, 0.08);
}
#page-chat .yd-chat-menu-pill .yd-chat-menu-icon {
  margin-left: 0;
}
#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill {
  background: rgb(244 244 244 / 20%);
  border: 1px solid rgb(255 255 255 / 30%);
  box-shadow: 0 0 12px rgb(213 213 213 / 50%);
  color: #000;
}
#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill__left {
  color: #000;
}
#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill__divider {
  background: rgb(255 255 255 / 30%);
}

/* 顶栏消息红点（返回按钮右侧）：位置 / 大小 / 颜色 / 字号都可自由改 */
#page-chat .yd-chat-back-unread-badge {
  position: absolute;
  left: 52px;
  top: calc(env(safe-area-inset-top) + 19px);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff3b30;
  color: #fff;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 图标替换示例（SVG / 图片链接）
   注意：下面示例默认注释，不会生效；按需取消注释再用。
   #page-chat #chat-back { position: relative; }
   #page-chat #chat-back .yd-settings-back-arrow { opacity: 0; }
   #page-chat #chat-back::before {
     content: "";
     width: 22px;
     height: 22px;
     display: block;
     background: center / contain no-repeat url("https://example.com/icons/back.svg");
   }
   #page-chat #chat-menu { position: relative; }
   #page-chat #chat-menu .yd-chat-menu-icon { opacity: 0; }
   #page-chat #chat-menu::before {
     content: "";
     width: 18px;
     height: 18px;
     display: block;
     flex: 0 0 auto;
     background: center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M5 12h14M5 6h14M5 18h14'/%3E%3C/svg%3E");
   }
*/

#page-chat > .yd-page-footer.yd-chat-input-wrapper {
  background: rgba(255, 255, 255, 0.2);
  color: #111827;
}

#page-chat .yd-chat-input-container {
  color: #111827;
}

#page-chat .yd-chat-input {
  color: inherit;
}

#page-chat .yd-chat-send-btn {
  color: #333;
}

/* 底部栏工具栏图标改色示例（默认注释，不生效）
   注意：很多图标是 stroke-only 或 fill-only，强行同时改 fill+stroke 会改变线条观感。
   #page-chat .yd-chat-toolbar__btn svg,
   #page-chat .yd-chat-sticker-strip__add svg {
     color: #333;
   }
   #page-chat .yd-chat-toolbar__btn svg path,
   #page-chat .yd-chat-sticker-strip__add svg path {
     stroke: currentColor;
   }
*/

/* 发送按钮图标替换示例（默认注释，不生效）
   #page-chat #chat-send {
     position: absolute;
     right: 8px;
     bottom: 8px;
   }
   #page-chat #chat-send > svg {
     opacity: 0;
   }
   #page-chat #chat-send::before {
     content: "";
     width: 20px;
     height: 20px;
     display: block;
     background: center / contain no-repeat url("https://example.com/icons/send.svg");
   }
*/
/* #page-chat #chat-send svg path { fill: #80B7F9; } */

#page-chat .yd-suggested-reply {
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
}

#page-chat .yd-suggested-reply__title,
#page-chat .yd-suggested-reply__item {
  color: #111827;
}
\`\`\`
## 禁止事项
1.禁止先对用户刨根问底的问各种设计细节后才开始设计样式，而是最好每次回答都能带上你设计好的这次方案，然后再引导用户询问补充细节和改进建议这样。
2.你除了需要给用户提供主题样式设计以外，在用户不需要提供样式主题的时候需要陪用户聊天唠嗑解闷，需要主动引导话题。
3.在输出消息的时候，其他每段都是2个换行，只有在[css美化]样式标题和\`\`\`css css内容\`\`\`之间，只有一个换行，每次输出的时候注意一下这个格式。
4.禁止跟用户说话的时候，聊到padding、margin...或者其他html的专业术语，如果需要使用，需要换成任何一个人都能听懂的大白话。`,

  _apiMessages: null,
  _currentAssistantList: [],
  _currentAssistantId: 'default',
  _currentDefaultPrompt: '',
  _currentBeautifyPrompt: '',

  // 制卡助手：会话历史（存 IndexedDB/kv），每次打开加载该助手对应历史
  _sessionHistoryKey() {
    return 'card_assistant_sessions_v1';
  },

  _maxTurnsToLoad() {
    return 20;
  },

  _extractConversationFromApiMessages() {
    const msgs = Array.isArray(this._apiMessages) ? this._apiMessages : [];
    return msgs
      .filter((m) => m && m.role && String(m.role) !== 'system')
      .map((m) => ({ role: String(m.role || '').trim(), content: String(m.content || '') }));
  },

  _trimConversationByUserTurns(messages, maxTurns) {
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) return [];
    const userIdx = [];
    for (let i = 0; i < list.length; i++) {
      if (String(list[i]?.role || '') === 'user') userIdx.push(i);
    }
    if (!userIdx.length) {
      // 没有 user 时，按末尾保留一定数量
      const keep = Math.min(list.length, maxTurns * 2);
      return list.slice(-keep);
    }
    if (userIdx.length <= maxTurns) return list;
    // 保留最后 maxTurns 次 user（以及这些 user 之后的 assistant）
    const startUserIndex = userIdx[userIdx.length - maxTurns];
    return list.slice(Math.max(0, startUserIndex));
  },

  async _loadConversationForAssistant(assistantId) {
    const aid = String(assistantId || this._DEFAULT_ASSISTANT_ID).trim();
    try {
      const raw = await Storage.kvGet(this._sessionHistoryKey());
      const map = raw && typeof raw === 'object' ? raw : {};
      const entry = map[aid];
      const msgs = Array.isArray(entry?.messages) ? entry.messages : [];
      return this._trimConversationByUserTurns(msgs, this._maxTurnsToLoad());
    } catch (e) {
      return [];
    }
  },

  async _saveConversationForAssistant(assistantId, messages) {
    const aid = String(assistantId || this._DEFAULT_ASSISTANT_ID).trim();
    const msgs = this._trimConversationByUserTurns(messages, this._maxTurnsToLoad());
    const prev = await (async () => {
      try {
        const raw = await Storage.kvGet(this._sessionHistoryKey());
        return raw && typeof raw === 'object' ? raw : {};
      } catch (e) {
        return {};
      }
    })();
    prev[aid] = { updatedAt: Date.now(), messages: msgs };
    await Storage.kvSet(this._sessionHistoryKey(), prev);
  },

  async _clearConversationForAssistant(assistantId) {
    const aid = String(assistantId || this._DEFAULT_ASSISTANT_ID).trim();
    const prev = await (async () => {
      try {
        const raw = await Storage.kvGet(this._sessionHistoryKey());
        return raw && typeof raw === 'object' ? raw : {};
      } catch (e) {
        return {};
      }
    })();
    prev[aid] = { updatedAt: Date.now(), messages: [] };
    await Storage.kvSet(this._sessionHistoryKey(), prev);
  },

  _outputsKey() {
    return 'card_assistant_outputs';
  },

  _storageListKey() {
    try {
      return (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CARD_ASSISTANT_LIST)
        ? CONFIG.STORAGE_KEYS.CARD_ASSISTANT_LIST
        : 'card_assistant_list';
    } catch (e) {
      return 'card_assistant_list';
    }
  },

  _storageSelectedKey() {
    try {
      return (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CARD_ASSISTANT_SELECTED_ID)
        ? CONFIG.STORAGE_KEYS.CARD_ASSISTANT_SELECTED_ID
        : 'card_assistant_selected_id';
    } catch (e) {
      return 'card_assistant_selected_id';
    }
  },

  _storageDefaultPromptKey() {
    return 'card_assistant_default_prompt';
  },

  _storageBeautifyPromptKey() {
    return 'card_assistant_beautify_prompt';
  },

  _getDefaultPromptContent() {
    const fallback = String(this._systemPrompt || '').trim();
    try {
      const v = Storage.get(this._storageDefaultPromptKey());
      const t = String(v || '').trim();
      return t || fallback;
    } catch (e) {
      return fallback;
    }
  },

  _getBeautifyPromptContent() {
    const fallback = String(this._beautifySystemPrompt || '').trim();
    try {
      const v = Storage.get(this._storageBeautifyPromptKey());
      const t = String(v || '').trim();
      return t || fallback;
    } catch (e) {
      return fallback;
    }
  },

  init() {
    document.getElementById('card-assistant-back')?.addEventListener('click', () => {
      if (State && typeof State.backToHome === 'function') State.backToHome();
      else State.switchPage?.('page-homescreen');
    });

    document.getElementById('card-assistant-send')?.addEventListener('click', () => {
      void this.handleSend();
    });

    document.getElementById('card-assistant-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend();
      }
    });

    document.getElementById('card-assistant-picker-btn')?.addEventListener('click', () => {
      void this.openAssistantPickerModal();
    });

    document.getElementById('card-assistant-new-chat')?.addEventListener('click', () => {
      void this._onNewChatClicked();
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-card-assistant') void this.onShow();
    });
  },

  _getFloatingBarTextEl() {
    return document.getElementById('card-assistant-picker-btn-name');
  },

  _setFloatingBarTitle(title) {
    const el = this._getFloatingBarTextEl();
    if (!el) return;
    el.textContent = String(title || '角色卡制卡的预设').trim();
  },

  _isBuiltInAssistantId(id) {
    const s = String(id || '').trim();
    return s === this._DEFAULT_ASSISTANT_ID || s === this._BEAUTIFY_ASSISTANT_ID;
  },

  async onShow() {
    // 进入页面就加载模板，并重置对话（system prompt 可能随模板变化）
    this._currentDefaultPrompt = this._getDefaultPromptContent();
    this._currentBeautifyPrompt = this._getBeautifyPromptContent();
    const list = await this._loadAssistantList();
    this._currentAssistantList = Array.isArray(list) ? list : [];

    const savedId = this._getSelectedAssistantId();
    const normalizedId = this._normalizeAssistantId(savedId, this._currentAssistantList);
    this._currentAssistantId = normalizedId;

    const title = this._getAssistantTitle(normalizedId, this._currentAssistantList);
    this._setFloatingBarTitle(title);

    await this._resetPageForAssistant(normalizedId);
  },

  _normalizeAssistantId(id, list) {
    const raw = String(id || '').trim();
    if (!raw) return this._DEFAULT_ASSISTANT_ID;
    if (this._isBuiltInAssistantId(raw)) return raw;
    if (Array.isArray(list) && list.some((x) => String(x?.id) === raw)) return raw;
    return this._DEFAULT_ASSISTANT_ID;
  },

  _getSelectedAssistantId() {
    try {
      const v = Storage.get(this._storageSelectedKey());
      if (v == null) return this._DEFAULT_ASSISTANT_ID;
      const s = String(v || '').trim();
      return s || this._DEFAULT_ASSISTANT_ID;
    } catch (e) {
      return this._DEFAULT_ASSISTANT_ID;
    }
  },

  _setSelectedAssistantId(id) {
    try {
      Storage.set(this._storageSelectedKey(), id);
    } catch (e) {}
  },

  async _loadAssistantList() {
    try {
      const raw = await Storage.kvGet(this._storageListKey());
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      return [];
    } catch (e) {
      return [];
    }
  },

  _getAssistantTitle(assistantId, list) {
    const sid = String(assistantId || '').trim();
    if (sid === this._DEFAULT_ASSISTANT_ID) return '角色卡制卡的预设';
    if (sid === this._BEAUTIFY_ASSISTANT_ID) return '美化的预设';
    const row = Array.isArray(list) ? list.find((x) => String(x?.id) === String(assistantId)) : null;
    const t = String(row?.title || '').trim();
    return t || '自定义助手';
  },

  _buildSystemPrompt(assistantId, list) {
    const base = String(this._currentDefaultPrompt || this._systemPrompt || '').trim();
    const id = String(assistantId || '').trim();
    if (!id || id === this._DEFAULT_ASSISTANT_ID) return base;
    if (id === this._BEAUTIFY_ASSISTANT_ID) return String(this._currentBeautifyPrompt || this._beautifySystemPrompt || '').trim();

    const row = Array.isArray(list) ? list.find((x) => String(x?.id) === id) : null;
    const content = String(row?.content || '').trim();
    // 选择了自定义预设时，只使用该预设内容，不再混入通用预设
    return content || '';
  },

  _getOuterScrollWrap() {
    return document.getElementById('card-assistant-messages');
  },

  _getScrollEl() {
    return document.getElementById('card-assistant-scroll');
  },

  _scrollToBottom() {
    const wrap = this._getOuterScrollWrap();
    if (!wrap) return;
    requestAnimationFrame(() => {
      try {
        wrap.scrollTop = wrap.scrollHeight;
      } catch (e) {}
    });
  },

  _appendMarkdownBlock(raw) {
    const scroll = this._getScrollEl();
    if (!scroll) return null;

    const node = document.createElement('div');
    node.className = 'yd-message__plain yd-message__plain--md';

    const text = String(raw ?? '');
    if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
      try {
        node.innerHTML = MarkdownPlain.renderAssistantPlainMarkdown(text).html;
      } catch (e) {
        node.textContent = text;
      }
    } else {
      node.textContent = text;
    }

    scroll.appendChild(node);
    this._scrollToBottom();
    return node;
  },

  _renderMarkdownHtml(raw) {
    const text = String(raw ?? '');
    if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
      try {
        return String(MarkdownPlain.renderAssistantPlainMarkdown(text).html || '');
      } catch (e) {}
    }
    const esc = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return esc.replace(/\n/g, '<br>');
  },

  _extractCssBeautifyForPreview(raw) {
    let s = String(raw || '');
    if ((s.includes('[css美化]') || s.includes('【css美化】') || s.includes('```')) && s.includes('\\n')) {
      s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    }
    s = s
      .replace(/(\[css美化\][^\n\r]*)\n{2,}(```)/gi, '$1\n$2')
      .replace(/(【css美化】[^\n\r]*)\n{2,}(```)/gi, '$1\n$2');

    let title = '';
    let titleFromNextLine = false;
    const titleSameLine =
      s.match(/^\s*\[css美化\]\s*(.+)\s*$/mi) ||
      s.match(/^\s*【css美化】\s*(.+)\s*$/mi);
    if (titleSameLine && String(titleSameLine[1] || '').trim()) {
      title = String(titleSameLine[1] || '').trim();
    } else {
      const titleNextLine =
        s.match(/\[css美化\]\s*(?:\r?\n)\s*([^\r\n]+?)(?=\r?\n|$)/i) ||
        s.match(/【css美化】\s*(?:\r?\n)\s*([^\r\n]+?)(?=\r?\n|$)/i);
      if (titleNextLine && String(titleNextLine[1] || '').trim()) {
        title = String(titleNextLine[1] || '').trim();
        titleFromNextLine = true;
      }
    }

    let cssText = '';
    const cssBlocks = [];
    const reCss = /```\s*css\b[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/ig;
    let m;
    while ((m = reCss.exec(s)) !== null) {
      const one = String(m[1] || '').trim();
      if (one) cssBlocks.push(one);
    }
    cssText = cssBlocks.join('\n').trim();
    if (!cssText) {
      const anyFence = s.match(/```\s*[a-zA-Z0-9_-]*[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/);
      if (anyFence && anyFence[1]) cssText = String(anyFence[1] || '').trim();
    }

    const hasTag = /\[css美化\]|【css美化】/i.test(s);
    let plain = s;
    plain = plain
      .replace(/```\s*css\b[\s\S]*?```/ig, '')
      .replace(/```\s*[a-zA-Z0-9_-]*[\s\S]*?```/g, '')
      .replace(/^\s*(?:\[css美化\]|【css美化】)[^\n\r]*\s*$/gmi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (titleFromNextLine && title) {
      const escTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      plain = plain.replace(new RegExp(`^\\s*${escTitle}\\s*$\\n?`, 'm'), '').trim();
    }

    return { hasTag, title, cssText, plain };
  },

  _renderAssistantReplyHtml(raw) {
    const text = String(raw || '');
    const parsed = this._extractCssBeautifyForPreview(text);
    if (!parsed.hasTag) {
      return this._renderMarkdownHtml(`**小助手：**\n${text}`);
    }

    const title = String(parsed.title || 'CSS 美化方案').trim();
    const code = String(parsed.cssText || '').trim();
    const plainPart = String(parsed.plain || '').trim();
    const headHtml = this._renderMarkdownHtml(plainPart ? `**小助手：**\n${plainPart}` : '**小助手：**');
    const esc = (v) => String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const cardHtml = code
      ? `
        <div class="yd-message__block yd-message__block--css-beautify">
          <div class="yd-css-beautify-summary">
            <span class="yd-css-beautify-summary__title">${esc(title)}</span>
            <span class="yd-css-beautify-summary__action" role="button" tabindex="0" data-css-save-btn="1" data-css-save-title="${esc(title)}" data-css-save-content="${esc(code)}">保存到美化预设</span>
          </div>
        </div>
      `
      : `
        <div class="yd-message__block yd-message__block--css-beautify">
          <div class="yd-css-beautify-summary yd-css-beautify-summary--no-code">
            <span class="yd-css-beautify-summary__title">${esc(title)}</span>
            <span class="yd-css-beautify-summary__action" role="button" tabindex="0" data-css-save-btn="1" data-css-save-title="${esc(title)}" data-css-save-content="">保存到美化预设</span>
          </div>
        </div>
      `;
    return `${headHtml}${cardHtml}`;
  },

  _genPresetSuffix3Letters() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let out = '';
    for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  },

  _goToBubbleBeautifyPage() {
    try {
      if (typeof State !== 'undefined') {
        State.bubbleSettingsReturnPage = 'page-card-assistant';
      }
    } catch (e) {}
    try {
      if (typeof State !== 'undefined' && typeof State.switchPage === 'function') {
        State.switchPage('page-bubble-settings');
      }
    } catch (e) {}
  },

  _bindCssBeautifySaveButtons(root) {
    const host = root && root.querySelectorAll ? root : null;
    if (!host) return;
    const btns = Array.from(host.querySelectorAll('[data-css-save-btn="1"]'));
    btns.forEach((btn) => {
      if (!btn || btn.dataset.boundSave === '1') return;
      btn.dataset.boundSave = '1';
      const onSave = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 已保存后再次点击：直接跳转查看
        if (btn.dataset.savedPreset === '1') {
          this._goToBubbleBeautifyPage();
          return;
        }
        const cssText = String(btn.getAttribute('data-css-save-content') || '').trim();
        const title = String(btn.getAttribute('data-css-save-title') || '').trim();
        if (!cssText) {
          if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('没有可保存的美化代码');
          return;
        }
        if (typeof BubbleSettings === 'undefined' || !BubbleSettings || typeof BubbleSettings.applyCustomCssAsNewPreset !== 'function') {
          if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('保存失败：未找到气泡预设模块');
          return;
        }
        const presetName = `${title || 'CSS 美化方案'}-${this._genPresetSuffix3Letters()}`;
        try {
          const pid = await BubbleSettings.applyCustomCssAsNewPreset(cssText, presetName);
          if (!pid) {
            if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('保存失败');
            return;
          }
          if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('已保存');
          btn.dataset.savedPreset = '1';
          btn.dataset.savedPresetId = String(pid);
          btn.textContent = '已保存，去查看';
        } catch (err) {
          if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('保存失败');
        }
      };
      btn.addEventListener('click', onSave);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') void onSave(e);
      });
    });
  },

  _appendAssistantBlock(raw) {
    const scroll = this._getScrollEl();
    if (!scroll) return null;
    const node = document.createElement('div');
    node.className = 'yd-message__plain yd-message__plain--md';
    node.innerHTML = this._renderAssistantReplyHtml(raw);
    this._bindCssBeautifySaveButtons(node);
    scroll.appendChild(node);
    this._scrollToBottom();
    return node;
  },

  _renderLoading() {
    return this._appendMarkdownBlock('**小助手：**\n正在生成中…');
  },

  _replaceNodeText(node, raw) {
    if (!node) return;
    const text = String(raw ?? '');
    if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
      try {
        node.innerHTML = MarkdownPlain.renderAssistantPlainMarkdown(text).html;
        return;
      } catch (e) {}
    }
    node.textContent = text;
  },

  _replaceAssistantNode(node, raw) {
    if (!node) return;
    node.innerHTML = this._renderAssistantReplyHtml(raw);
    this._bindCssBeautifySaveButtons(node);
  },

  _generateOutputId() {
    try {
      if (State && typeof State.generateId === 'function') return String(State.generateId());
    } catch (e) {}
    return `out_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  },

  _hashStringFNV1a(str) {
    const s = String(str || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  },

  _stableOutputId(respText, assistantId) {
    const t = String(respText || '').trim();
    const aid = String(assistantId || this._currentAssistantId || this._DEFAULT_ASSISTANT_ID).trim();
    if (!t) return '';
    return `out_${aid}_${this._hashStringFNV1a(t).slice(0, 10)}`;
  },

  async _saveAssistantOutput(outputId, respText) {
    const key = this._outputsKey();
    const text = String(respText || '').trim();
    if (!outputId || !text) return;

    const existing = await (typeof Storage?.kvGet === 'function' ? Storage.kvGet(key) : null);
    const list = Array.isArray(existing) ? existing : [];

    if (list.some((x) => x && String(x.id) === String(outputId))) {
      if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('已保存');
      return;
    }

    const entry = {
      id: String(outputId),
      createdAt: Date.now(),
      assistantId: String(this._currentAssistantId || this._DEFAULT_ASSISTANT_ID),
      content: text
    };
    const next = [...list, entry].slice(-100); // 只保留最近 100 条，避免无限增长
    await Storage.kvSet(key, next);

    if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast('已保存');
  },

  async _copyTextToClipboard(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (e) {}

    try {
      const textarea = document.createElement('textarea');
      textarea.value = t;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = !!document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (e) {
      return false;
    }
  },

  _appendSaveButtonAfterNode(node, outputId, respText) {
    if (!node || !node.parentNode) return null;
    const parent = node.parentNode;

    // 避免重复插入（同一个 node 可能被二次触发）
    const next = node.nextSibling;
    if (next && next.nodeType === 1 && next.classList && next.classList.contains('yd-card-assistant-save-btn')) return next;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'yd-card-assistant-save-btn';
    btn.textContent = '复制本次内容';
    btn.dataset.outputId = String(outputId || '');
    btn.dataset.content = String(respText || '');

    btn.addEventListener('click', async () => {
      try {
        const ok = await this._copyTextToClipboard(respText);
        if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') {
          Chat._toast(ok ? '已复制' : '复制失败，请手动复制');
        }
      } catch (e) {
        if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') {
          Chat._toast('复制失败，请手动复制');
        }
      }
    });

    parent.insertBefore(btn, node.nextSibling);
    return btn;
  },

  async _initBackgroundIfNeeded() {
    const dst = document.getElementById('card-assistant-background');
    if (!dst) return;
    dst.style.backgroundImage = 'none';
    dst.style.backgroundColor = '#ffffff';
    dst.style.backgroundSize = '';
    dst.style.backgroundPosition = '';
    dst.style.backgroundRepeat = '';
  },

  _resetApiMessages(assistantId) {
    this._apiMessages = [
      { role: 'system', content: this._buildSystemPrompt(assistantId, this._currentAssistantList) }
    ];
  },

  async _resetPageForAssistant(assistantId) {
    const aid = assistantId || this._DEFAULT_ASSISTANT_ID;
    this._currentAssistantId = aid;
    this._resetApiMessages(aid);

    const input = document.getElementById('card-assistant-input');
    if (input) input.value = '';

    const scroll = this._getScrollEl();
    if (scroll) scroll.innerHTML = '';

    // 初始化背景（只有在进入页面时做一次即可）
    await this._initBackgroundIfNeeded();

    // 加载并展示历史会话（最多 20 轮）
    const history = await this._loadConversationForAssistant(aid);
    if (Array.isArray(history) && history.length) {
      this._apiMessages = [
        ...(Array.isArray(this._apiMessages) ? this._apiMessages : []),
        ...history.map((m) => ({
          role: String(m?.role || '').trim(),
          content: String(m?.content || '')
        }))
      ];
      history.forEach((m) => {
        const role = String(m?.role || '').trim();
        const content = String(m?.content || '');
        if (!content) return;
        if (role === 'user') {
          this._appendMarkdownBlock(`**用户：**\n${content}`);
        } else if (role === 'assistant') {
          const node = this._appendAssistantBlock(content);
          const outId = this._stableOutputId(content, aid);
          this._appendSaveButtonAfterNode(node, outId, content);
        }
      });
      return;
    }

    this._appendMarkdownBlock('提示：点击上方“角色卡制卡的预设/模板名”选择或新增模板；然后输入你的制卡需求，点击“发送”。');
  },

  _extractAssistantContent(data) {
    try {
      return String(
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.output?.text ??
        ''
      ).trim();
    } catch (e) {
      return '';
    }
  },

  async handleSend() {
    const input = document.getElementById('card-assistant-input');
    const sendBtn = document.getElementById('card-assistant-send');
    if (!input) return;

    const text = String(input.value || '').trim();
    if (!text) return;

    if (sendBtn) sendBtn.disabled = true;

    // 本页输入清空：避免用户在等待时误触
    input.value = '';

    // 展示用户输入（更像“对话”）
    this._apiMessages.push({ role: 'user', content: text });
    this._appendMarkdownBlock(`**用户：**\n${text}`);

    // 持久化用户输入（避免刷新/异常丢失）
    try {
      await this._saveConversationForAssistant(this._currentAssistantId, this._extractConversationFromApiMessages());
    } catch (e) {}

    const loadingNode = this._renderLoading();

    try {
      if (!Chat || typeof Chat.requestChatCompletions !== 'function') {
        throw new Error('缺少 Chat.requestChatCompletions 封装');
      }

      // 限制消息长度，避免越聊越大
      const maxMsgs = 20; // system + (user/assistant) 最大 19 条
      if (Array.isArray(this._apiMessages) && this._apiMessages.length > maxMsgs) {
        const sys = this._apiMessages[0];
        const rest = this._apiMessages.slice(-1 * (maxMsgs - 1));
        this._apiMessages = [sys, ...rest];
      }

      const data = await Chat.requestChatCompletions(this._apiMessages);
      const respText = this._extractAssistantContent(data);
      if (!respText) throw new Error('未得到有效回复');

      this._apiMessages.push({ role: 'assistant', content: respText });
      this._replaceAssistantNode(loadingNode, respText);

      // 在每次 AI 回复内容下方追加“复制本次内容”
      const outputId = this._stableOutputId(respText, this._currentAssistantId);
      this._appendSaveButtonAfterNode(loadingNode, outputId, respText);

      // 持久化 AI 回复
      try {
        await this._saveConversationForAssistant(this._currentAssistantId, this._extractConversationFromApiMessages());
      } catch (e) {}
    } catch (e) {
      const msg = e && e.message ? String(e.message) : '生成失败';
      this._replaceNodeText(loadingNode, `**错误：**${msg}`);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      this._scrollToBottom();
    }
  },

  async _onNewChatClicked() {
    const aid = String(this._currentAssistantId || this._DEFAULT_ASSISTANT_ID).trim();
    const ok = window.confirm('开启新对话会覆盖当前历史，是否继续？');
    if (!ok) return;
    try {
      await this._clearConversationForAssistant(aid);
    } catch (e) {}

    // 清空内存 + UI
    this._resetApiMessages(aid);
    const input = document.getElementById('card-assistant-input');
    if (input) input.value = '';
    const scroll = this._getScrollEl();
    if (scroll) scroll.innerHTML = '';

    // 初始化背景（确保一致）
    await this._initBackgroundIfNeeded();

    this._appendMarkdownBlock('提示：已开启新对话。输入你的制卡需求，点击“发送”。');
  },

  async _applyAssistantSelectionAndReset(assistantId, { persistSelected = true, reloadList = false } = {}) {
    if (persistSelected) this._setSelectedAssistantId(assistantId);

    this._currentAssistantId = assistantId;
    if (reloadList) this._currentAssistantList = await this._loadAssistantList();

    const title = this._getAssistantTitle(assistantId, this._currentAssistantList);
    this._setFloatingBarTitle(title);

    await this._resetPageForAssistant(assistantId);
  },

  async openAssistantPickerModal() {
    const modalId = 'yd-card-assistant-picker-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const list = await this._loadAssistantList();
    this._currentAssistantList = Array.isArray(list) ? list : [];

    let selectedId = this._normalizeAssistantId(this._getSelectedAssistantId(), this._currentAssistantList);
    this._currentAssistantId = selectedId;

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content yd-card-assistant-picker" role="dialog" aria-modal="true" aria-label="制卡助手列表" style="max-width:680px;">
        <div class="yd-modal-header">
          <div style="font-size:18px;font-weight:700;color:#000;">制卡助手</div>
          <button type="button" class="yd-btn-close" aria-label="关闭" id="yd-card-assistant-picker-close">×</button>
        </div>

        <div style="margin:8px 0 0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
            <div style="font-size:14px;font-weight:600;color:rgba(0,0,0,0.75);">选择</div>
            <button
              type="button"
              id="yd-card-assistant-picker-add-toggle"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(0,0,0,0.14);background:#fff;color:#111;cursor:pointer;font-size:13px;font-weight:600;"
              aria-label="新增制卡助手"
            >
              <span aria-hidden="true" style="font-size:16px;line-height:1;">+</span>新增
            </button>
          </div>
          <div id="yd-card-assistant-picker-list-wrap" style="max-height:56vh;overflow-y:auto;padding:2px 2px 2px 0;">
            <div id="yd-card-assistant-picker-list" style="display:flex;flex-direction:column;gap:8px;"></div>
          </div>
          <div id="yd-card-assistant-action-menu" style="display:none;position:fixed;width:max-content;min-width:0;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.14);padding:4px;z-index:1200;">
            <button type="button" data-action="edit" style="display:block;width:auto;min-width:0;text-align:left;padding:6px 8px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:13px;line-height:1.2;white-space:nowrap;">编辑</button>
            <button type="button" data-action="delete" style="display:block;width:auto;min-width:0;text-align:left;padding:6px 8px;border:none;background:transparent;border-radius:6px;cursor:pointer;color:#d93025;font-size:13px;line-height:1.2;white-space:nowrap;">删除</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };

    const closeBtn = modal.querySelector('#yd-card-assistant-picker-close');
    closeBtn?.addEventListener('click', close);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    window.addEventListener('keydown', onKeyDown);

    const listEl = modal.querySelector('#yd-card-assistant-picker-list');
    if (!listEl) return;

    const addToggleBtn = modal.querySelector('#yd-card-assistant-picker-add-toggle');
    const showToast = (msg) => {
      if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') Chat._toast(String(msg || ''));
      else window.alert(String(msg || ''));
    };

    const openDetailModal = ({ mode, assistantId = '', title = '', content = '' }) => {
      const page = document.createElement('div');
      page.className = 'yd-modal yd-modal--active';
      page.style.zIndex = '1100';
      page.innerHTML = `
        <div class="yd-modal-content" role="dialog" aria-modal="true" style="max-width:760px;padding:0;overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.08);">
            <div style="font-size:16px;font-weight:700;color:#111;">${mode === 'add' ? '新增预设' : '编辑预设'}</div>
            <button type="button" data-detail-close="1" style="border:none;background:transparent;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
          </div>
          <div style="padding:14px 16px 16px;">
            <div style="font-size:12px;color:rgba(0,0,0,0.45);margin-bottom:6px;">标题</div>
            <input data-detail-title="1" type="text" value="${this.escapeHtml(String(title || ''))}" style="width:100%;height:40px;box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#fff;color:#111;">
            <div style="font-size:12px;color:rgba(0,0,0,0.45);margin:12px 0 6px;">内容</div>
            <textarea data-detail-content="1" rows="14" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);resize:vertical;background:#fff;color:#111;">${this.escapeHtml(String(content || ''))}</textarea>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
              <button type="button" data-detail-close="1" style="min-width:90px;height:36px;border:1px solid rgba(0,0,0,0.14);border-radius:10px;background:#fff;cursor:pointer;">取消</button>
              <button type="button" data-detail-save="1" style="min-width:110px;height:36px;border:none;border-radius:10px;background:#0a84ff;color:#fff;cursor:pointer;">保存</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(page);

      const closePage = () => {
        if (page && page.parentNode) page.parentNode.removeChild(page);
      };
      page.addEventListener('click', (evt) => {
        if (evt.target === page) closePage();
      });
      page.querySelectorAll('[data-detail-close="1"]').forEach((el) => {
        el.addEventListener('click', closePage);
      });

      const saveBtn = page.querySelector('[data-detail-save="1"]');
      if (!saveBtn) return;
      saveBtn.addEventListener('click', async () => {
        const titleEl = page.querySelector('[data-detail-title="1"]');
        const contentEl = page.querySelector('[data-detail-content="1"]');
        const nextTitle = String(titleEl?.value || '').trim();
        const nextContent = String(contentEl?.value || '').trim();
        if (!nextTitle) {
          showToast('请先输入标题');
          return;
        }
        if (!nextContent) {
          showToast('请先输入内容');
          return;
        }

        if (mode === 'add') {
          const now = Date.now();
          const currentList = Array.isArray(this._currentAssistantList) ? this._currentAssistantList : [];
          const newId = (State && typeof State.generateId === 'function') ? State.generateId() : String(Date.now());
          const next = [
            ...currentList,
            {
              id: newId,
              title: nextTitle,
              content: nextContent,
              createdAt: now,
              updatedAt: now
            }
          ];
          try {
            await Storage.kvSet(this._storageListKey(), next);
          } catch (err) {
            showToast('保存失败，请稍后重试');
            return;
          }
          this._currentAssistantList = next;
          renderList();
          showToast('已新增');
          closePage();
          close();
          await this._applyAssistantSelectionAndReset(newId, { persistSelected: true, reloadList: true });
          return;
        }

        if (assistantId === this._DEFAULT_ASSISTANT_ID) {
          try {
            Storage.set(this._storageDefaultPromptKey(), nextContent);
          } catch (err) {
            showToast('保存失败，请稍后重试');
            return;
          }
          this._currentDefaultPrompt = nextContent;
          showToast('已保存');
          closePage();
          if (String(this._currentAssistantId || '').trim() === this._DEFAULT_ASSISTANT_ID) {
            await this._applyAssistantSelectionAndReset(this._DEFAULT_ASSISTANT_ID, { persistSelected: true, reloadList: true });
          }
          return;
        }

        if (assistantId === this._BEAUTIFY_ASSISTANT_ID) {
          try {
            Storage.set(this._storageBeautifyPromptKey(), nextContent);
          } catch (err) {
            showToast('保存失败，请稍后重试');
            return;
          }
          this._currentBeautifyPrompt = nextContent;
          showToast('已保存');
          closePage();
          if (String(this._currentAssistantId || '').trim() === this._BEAUTIFY_ASSISTANT_ID) {
            await this._applyAssistantSelectionAndReset(this._BEAUTIFY_ASSISTANT_ID, { persistSelected: true, reloadList: true });
          }
          return;
        }

        const now = Date.now();
        const currentList = Array.isArray(this._currentAssistantList) ? this._currentAssistantList : [];
        const next = currentList.map((x) => {
          if (String(x?.id) !== String(assistantId)) return x;
          return {
            ...x,
            title: nextTitle,
            content: nextContent,
            updatedAt: now
          };
        });
        try {
          await Storage.kvSet(this._storageListKey(), next);
        } catch (err) {
          showToast('保存失败，请稍后重试');
          return;
        }
        this._currentAssistantList = next;
        renderList();
        showToast('已保存');
        closePage();
        if (String(this._currentAssistantId || '').trim() === String(assistantId)) {
          await this._applyAssistantSelectionAndReset(assistantId, { persistSelected: true, reloadList: true });
        }
      });
    };

    addToggleBtn?.addEventListener('click', () => {
      openDetailModal({ mode: 'add', title: '', content: '' });
    });

    const renderList = () => {
      const items = [
        { id: this._DEFAULT_ASSISTANT_ID, title: '角色卡制卡的预设', content: String(this._currentDefaultPrompt || this._systemPrompt || '').trim() },
        { id: this._BEAUTIFY_ASSISTANT_ID, title: '美化的预设', content: String(this._currentBeautifyPrompt || this._beautifySystemPrompt || '').trim() },
        ...(Array.isArray(this._currentAssistantList) ? this._currentAssistantList : [])
      ];

      listEl.innerHTML = items.map((it) => {
        const id = String(it?.id || '').trim();
        const title = String(it?.title || '').trim() || (id === this._DEFAULT_ASSISTANT_ID ? '角色卡制卡的预设' : (id === this._BEAUTIFY_ASSISTANT_ID ? '美化的预设' : '自定义助手'));
        const isActive = id === selectedId;
        const contentRaw = String(it?.content || '').trim();
        const desc = contentRaw ? contentRaw.replace(/\s+/g, ' ').slice(0, 56) : '内置基础提示';
        const actionMenu = `
          <button
            type="button"
            class="yd-card-assistant-picker__more-btn"
            data-action-trigger="1"
            data-assistant-id="${this.escapeHtml(id)}"
            style="position:absolute;right:8px;top:8px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(0,0,0,0.08);background:#fff;color:#444;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;"
            aria-label="更多操作"
          >⋯</button>
        `;

        return `
          <div
            class="yd-card-assistant-picker__item ${isActive ? 'yd-card-assistant-picker__item--active' : ''}"
            style="position:relative;text-align:left;width:100%;padding:0;border-radius:14px;border:1px solid rgba(0,0,0,0.08);background:${isActive ? 'rgba(10,132,255,0.10)' : '#f7f7f8'};"
          >
            <button
              type="button"
              data-assistant-id="${this.escapeHtml(id)}"
              style="text-align:left;width:100%;padding:12px 44px 12px 14px;border:none;background:transparent;cursor:pointer;border-radius:14px;"
            >
              <div style="font-size:15px;font-weight:700;color:#111;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(title)}</span>
                ${isActive ? '<span style="font-size:12px;color:rgba(0,0,0,0.35);flex-shrink:0;">当前</span>' : ''}
              </div>
              <div style="margin-top:6px;font-size:12.5px;color:rgba(0,0,0,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${this.escapeHtml(desc)}
              </div>
            </button>
            ${actionMenu}
          </div>
        `;
      }).join('');
    };

    // 需要一个 escape，避免模板内容注入 HTML
    this.escapeHtml = this.escapeHtml || ((s) => String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;'));

    renderList();

    const actionMenuEl = modal.querySelector('#yd-card-assistant-action-menu');
    let actionMenuAssistantId = '';

    const closeAllActionMenus = () => {
      actionMenuAssistantId = '';
      if (actionMenuEl) actionMenuEl.style.display = 'none';
    };

    listEl.addEventListener('click', async (e) => {
      const target = e.target;
      const menuTrigger = target && target.closest ? target.closest('[data-action-trigger="1"]') : null;
      if (menuTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const aid = String(menuTrigger.getAttribute('data-assistant-id') || '').trim();
        if (!aid) return;
        if (!actionMenuEl) return;
        const show = actionMenuEl.style.display !== 'block' || actionMenuAssistantId !== aid;
        closeAllActionMenus();
        if (!show) return;
        actionMenuAssistantId = aid;
        const rect = menuTrigger.getBoundingClientRect();
        const top = rect.bottom + 4;
        const left = rect.right - 76;
        actionMenuEl.style.top = `${Math.max(8, top)}px`;
        actionMenuEl.style.left = `${Math.max(8, left)}px`;
        actionMenuEl.style.display = 'block';
        return;
      }

      const actionBtn = target && target.closest ? target.closest('#yd-card-assistant-action-menu [data-action]') : null;
      if (actionBtn && actionMenuAssistantId) {
        e.preventDefault();
        e.stopPropagation();
        const action = String(actionBtn.getAttribute('data-action') || '').trim();
        const aid = String(actionMenuAssistantId || '').trim();
        if (!action || !aid) return;
        closeAllActionMenus();

        const isBuiltIn = this._isBuiltInAssistantId(aid);
        const isDefault = aid === this._DEFAULT_ASSISTANT_ID;
        const row = isBuiltIn
          ? {
              id: aid,
              title: this._getAssistantTitle(aid, this._currentAssistantList),
              content: isDefault
                ? String(this._currentDefaultPrompt || this._systemPrompt || '')
                : String(this._currentBeautifyPrompt || this._beautifySystemPrompt || '')
            }
          : (Array.isArray(this._currentAssistantList) ? this._currentAssistantList.find((x) => String(x?.id) === aid) : null);
        if (!row) return;

        if (action === 'edit') {
          openDetailModal({
            mode: 'edit',
            assistantId: aid,
            title: row.title,
            content: row.content
          });
          return;
        }

        if (action === 'delete') {
          if (isBuiltIn) {
            showToast('内置预设不可删除');
            return;
          }
          const ok = window.confirm('确定删除这个预设吗？删除后无法恢复。');
          if (!ok) return;
          const next = (Array.isArray(this._currentAssistantList) ? this._currentAssistantList : [])
            .filter((x) => String(x?.id) !== aid);
          try {
            await Storage.kvSet(this._storageListKey(), next);
          } catch (err) {
            showToast('删除失败，请稍后重试');
            return;
          }
          this._currentAssistantList = next;
          if (selectedId === aid) selectedId = this._DEFAULT_ASSISTANT_ID;
          renderList();
          showToast('已删除');
          return;
        }
      }

      const btn = e.target && e.target.closest ? e.target.closest('button[data-assistant-id]') : null;
      if (!btn) return;
      closeAllActionMenus();

      const aid = String(btn.getAttribute('data-assistant-id') || '').trim();
      if (!aid) return;
      close();
      await this._applyAssistantSelectionAndReset(aid, { persistSelected: true, reloadList: false });
    });

    listEl.addEventListener('mouseleave', () => {
      // 保留菜单，避免鼠标移向菜单时闪退
    });

    actionMenuEl?.addEventListener('click', async (e) => {
      const actionBtn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!actionBtn || !actionMenuAssistantId) return;
      e.preventDefault();
      e.stopPropagation();
      const action = String(actionBtn.getAttribute('data-action') || '').trim();
      const aid = String(actionMenuAssistantId || '').trim();
      if (!action || !aid) return;

      closeAllActionMenus();

      const isBuiltIn = this._isBuiltInAssistantId(aid);
      const isDefault = aid === this._DEFAULT_ASSISTANT_ID;
      const row = isBuiltIn
        ? {
            id: aid,
            title: this._getAssistantTitle(aid, this._currentAssistantList),
            content: isDefault
              ? String(this._currentDefaultPrompt || this._systemPrompt || '')
              : String(this._currentBeautifyPrompt || this._beautifySystemPrompt || '')
          }
        : (Array.isArray(this._currentAssistantList) ? this._currentAssistantList.find((x) => String(x?.id) === aid) : null);
      if (!row) return;

      if (action === 'edit') {
        openDetailModal({
          mode: 'edit',
          assistantId: aid,
          title: row.title,
          content: row.content
        });
        return;
      }

      if (action === 'delete') {
        if (isBuiltIn) {
          showToast('内置预设不可删除');
          return;
        }
        const ok = window.confirm('确定删除这个预设吗？删除后无法恢复。');
        if (!ok) return;
        const next = (Array.isArray(this._currentAssistantList) ? this._currentAssistantList : [])
          .filter((x) => String(x?.id) !== aid);
        try {
          await Storage.kvSet(this._storageListKey(), next);
        } catch (err) {
          showToast('删除失败，请稍后重试');
          return;
        }
        this._currentAssistantList = next;
        if (selectedId === aid) selectedId = this._DEFAULT_ASSISTANT_ID;
        renderList();
        showToast('已删除');
      }
    });

    modal.addEventListener('click', (e) => {
      const isTrigger = e.target && e.target.closest ? e.target.closest('[data-action-trigger="1"]') : null;
      const isMenu = e.target && e.target.closest ? e.target.closest('#yd-card-assistant-action-menu') : null;
      if (!isTrigger && !isMenu) closeAllActionMenus();
    });
  }
};

CardAssistantPage.init();

