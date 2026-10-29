// 美化小助手
const Beautify = {
  generatedCss: '',
  
  // 初始化
  init() {
    this.setupEvents();
    this.loadThemes();
  },
  
  // 设置事件
  setupEvents() {
    // 返回按钮
    document.getElementById('beautify-back').addEventListener('click', () => {
      State.backToHome();
    });
    
    // 生成CSS
    document.getElementById('generate-css').addEventListener('click', () => {
      this.generateCss();
    });
    
    // 保存主题
    document.getElementById('save-theme').addEventListener('click', () => {
      this.saveTheme();
    });
    
    // 应用主题
    document.getElementById('apply-theme').addEventListener('click', () => {
      this.applyCurrentCss();
    });
  },
  
  // 生成CSS（调用AI）
  async generateCss() {
    const input = document.getElementById('beautify-input').value.trim();
    
    if (!input) {
      alert('请输入描述');
      return;
    }
    
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const baseUrl = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    
    if (!apiKey) {
      alert('请先在设置中配置API Key');
      return;
    }
    
    try {
      const messages = [
        {
          role: 'system',
          content: '你是一个CSS专家。用户会描述他们想要的样式，你需要生成对应的CSS代码。只返回CSS代码，不要有其他解释。'
        }
      ];
      try {
        if (typeof ChatMessageBuilder !== 'undefined' &&
            ChatMessageBuilder.isRealTimeAwarenessEnabled &&
            ChatMessageBuilder.isRealTimeAwarenessEnabled()) {
          messages.push({
            role: 'system',
            content: ChatMessageBuilder.getCurrentTimeSystemContent()
          });
        }
      } catch (e) {}
      messages.push({
        role: 'user',
        content: input
      });

      const payload = {
        model: Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo',
        messages
      };
      const data = (typeof Chat !== 'undefined' && typeof Chat._postChatCompletionsAndParse === 'function')
        ? await Chat._postChatCompletionsAndParse({ baseUrl, apiKey, payload })
        : await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ ...payload, stream: false })
        }).then((r) => r.json());
      
      if (data.choices && data.choices[0]) {
        this.generatedCss = data.choices[0].message.content;
        document.getElementById('css-preview').value = this.generatedCss;
      }
    } catch (error) {
      console.error('生成CSS失败:', error);
      alert('生成CSS失败，请检查网络和API配置');
    }
  },
  
  // 应用当前CSS
  applyCurrentCss() {
    const css = document.getElementById('css-preview').value;
    if (css) {
      Theme.applyCss(css);
      alert('已应用样式');
    }
  },
  
  // 保存主题
  async saveTheme() {
    const name = document.getElementById('theme-name').value.trim();
    const css = document.getElementById('css-preview').value;
    
    if (!name) {
      alert('请输入主题名称');
      return;
    }
    
    if (!css) {
      alert('没有可保存的CSS');
      return;
    }
    
    try {
      await Theme.saveTheme(name, css);
      alert('主题保存成功');
      document.getElementById('theme-name').value = '';
      await this.loadThemes();
    } catch (error) {
      console.error('保存主题失败:', error);
      alert('保存主题失败');
    }
  },
  
  // 加载主题列表
  async loadThemes() {
    const themes = await Theme.getAllThemes();
    const list = document.getElementById('theme-list');
    list.innerHTML = '';
    
    if (themes.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">暂无主题</div>';
      return;
    }
    
    themes.sort((a, b) => b.createdAt - a.createdAt).forEach(theme => {
      const item = document.createElement('div');
      item.className = 'yd-theme-item';
      
      item.innerHTML = `
        <div class="yd-theme-item__name">${this.escapeHtml(theme.name)}</div>
        <div class="yd-theme-item__actions">
          <button data-id="${theme.id}" class="yd-btn-apply-saved">应用</button>
          <button data-id="${theme.id}" class="yd-btn-delete-theme">删除</button>
        </div>
      `;
      
      // 应用主题
      item.querySelector('.yd-btn-apply-saved').addEventListener('click', async () => {
        await Theme.applyTheme(theme.id);
        alert('主题已应用');
      });
      
      // 删除主题
      item.querySelector('.yd-btn-delete-theme').addEventListener('click', async () => {
        if (confirm('确定删除此主题？')) {
          await Theme.deleteTheme(theme.id);
          await this.loadThemes();
        }
      });
      
      list.appendChild(item);
    });
  },
  
  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

