// 我的钱包
const Wallet = {
  STORAGE_KEY: 'wallet_v1',

  _data: null,
  // 余额上限：最多 10 个 9
  _MAX_BALANCE: 9999999999,

  init() {
    document.getElementById('wallet-back')?.addEventListener('click', () => State.backToHome());

    const card = document.getElementById('walletCard');
    const shine = document.getElementById('walletCardShine');
    if (card && shine) {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
        const y = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
        shine.style.transform = `translate(${x * 0.18}%, ${y * 0.18}%) rotate(35deg)`;
      });
      card.addEventListener('pointerleave', () => {
        shine.style.transform = 'rotate(35deg)';
      });
    }

    // 进入钱包页时渲染/检查激活
    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-wallet') {
        this.onEnter().catch(() => {});
      }
    });

    // 激活弹窗事件
    document.getElementById('wallet-activate-mask')?.addEventListener('click', () => this._closeActivateModal());
    document.getElementById('wallet-activate-cancel')?.addEventListener('click', () => this._closeActivateModal());
    document.getElementById('wallet-activate-confirm')?.addEventListener('click', () => this._confirmActivate());

    // 钱包编辑入口
    document.getElementById('wallet-edit-balance')?.addEventListener('click', () => this.openBalanceModal());
    document.getElementById('wallet-edit-password')?.addEventListener('click', () => this.openPasswordModal());

    // 修改余额弹窗
    document.getElementById('wallet-balance-mask')?.addEventListener('click', () => this._closeBalanceModal());
    document.getElementById('wallet-balance-cancel')?.addEventListener('click', () => this._closeBalanceModal());
    document.getElementById('wallet-balance-confirm')?.addEventListener('click', () => this._confirmBalance());

    // 修改密码弹窗
    document.getElementById('wallet-password-mask')?.addEventListener('click', () => this._closePasswordModal());
    document.getElementById('wallet-password-cancel')?.addEventListener('click', () => this._closePasswordModal());
    document.getElementById('wallet-password-confirm')?.addEventListener('click', () => this._confirmPassword());
  }
  ,

  async onEnter() {
    await this._load();
    this._render();
    if (!this._data?.activated) {
      this._openActivateModal();
    }
  },

  async ensureLoaded() {
    await this._load();
    return this._data;
  },

  async isActivated() {
    await this._load();
    return !!(this._data && this._data.activated);
  },

  async credit(amount, title = '入账') {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error('invalid_amount');
    }

    await this._load();
    if (!this._data?.activated) {
      throw new Error('wallet_not_activated');
    }

    const current = Number(this._data.balance || 0);
    const nextBalance = Math.round((current + num) * 100) / 100;
    const maxRounded = Math.round(this._MAX_BALANCE * 100) / 100;
    if (nextBalance > maxRounded) {
      throw new Error('wallet_balance_limit');
    }

    this._data.balance = nextBalance;
    this._data.bills = Array.isArray(this._data.bills) ? this._data.bills : [];
    this._data.bills.push({
      id: State.generateId(),
      ts: Date.now(),
      title: String(title || '入账'),
      amount: Math.round(num * 100) / 100
    });

    await this._save();
    if (typeof State !== 'undefined' && State.currentPage === 'page-wallet') {
      this._render();
    }
    return nextBalance;
  },

  async debit(amount, title = '支出') {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error('invalid_amount');
    }

    await this._load();
    if (!this._data?.activated) {
      throw new Error('wallet_not_activated');
    }

    const current = Number(this._data.balance || 0);
    const debitAmt = Math.round(num * 100) / 100;
    if (current < debitAmt) {
      throw new Error('wallet_insufficient_balance');
    }

    this._data.balance = Math.round((current - debitAmt) * 100) / 100;
    this._data.bills = Array.isArray(this._data.bills) ? this._data.bills : [];
    this._data.bills.push({
      id: State.generateId(),
      ts: Date.now(),
      title: String(title || '支出'),
      amount: -debitAmt
    });

    await this._save();
    if (typeof State !== 'undefined' && State.currentPage === 'page-wallet') {
      this._render();
    }
    return this._data.balance;
  },

  async _load() {
    const row = await Storage.kvGet(this.STORAGE_KEY);
    if (row && typeof row === 'object') {
      this._data = row;
      if (!Array.isArray(this._data.bills)) this._data.bills = [];
      return;
    }
    this._data = {
      activated: false,
      balance: 0,
      payPwd: '',
      bills: []
    };
  },

  async _save() {
    await Storage.kvSet(this.STORAGE_KEY, this._data);
  },

  _render() {
    const balanceEl = document.getElementById('walletBalance');
    if (balanceEl) balanceEl.textContent = this._formatCny(this._data?.balance || 0);

    const listEl = document.getElementById('wallet-bills');
    if (listEl) {
      const bills = Array.isArray(this._data?.bills) ? this._data.bills.slice() : [];
      bills.sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
      if (!bills.length) {
        listEl.innerHTML = `<div style="color:rgba(17,17,17,0.5);font-size:13px;padding:6px 2px;">暂无账单</div>`;
      } else {
        listEl.innerHTML = bills.map(b => {
          const amt = Number(b?.amount) || 0;
          const sign = amt >= 0 ? '+' : '-';
          const cls = amt >= 0 ? 'yd-wallet-bill__amount--plus' : 'yd-wallet-bill__amount--minus';
          const title = String(b?.title || '账单');
          const t = this._formatTime(b?.ts || 0);
          const abs = Math.abs(amt);
          return `
            <div class="yd-wallet-bill">
              <div class="yd-wallet-bill__left">
                <div class="yd-wallet-bill__title">${this._esc(title)}</div>
                <div class="yd-wallet-bill__time">${this._esc(t)}</div>
              </div>
              <div class="yd-wallet-bill__amount ${cls}">${sign}${this._esc(this._formatCny(abs).replace('￥','￥'))}</div>
            </div>
          `;
        }).join('');
      }
    }
  },

  _openActivateModal() {
    const modal = document.getElementById('wallet-activate-modal');
    const input = document.getElementById('wallet-activate-amount');
    const pwd = document.getElementById('wallet-activate-pwd');
    if (!modal || !input) return;
    modal.setAttribute('aria-hidden', 'false');
    input.value = '';
    if (pwd) pwd.value = '';
    setTimeout(() => input.focus(), 0);
  },

  _closeActivateModal() {
    const modal = document.getElementById('wallet-activate-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
  },

  async _confirmActivate() {
    const input = document.getElementById('wallet-activate-amount');
    const pwdEl = document.getElementById('wallet-activate-pwd');
    if (!input) return;
    const raw = String(input.value || '').trim().replace(/,/g, '');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      alert('请输入正确的金额');
      return;
    }
    const maxRounded = Math.round(this._MAX_BALANCE * 100) / 100;
    const amountRounded = Math.round(amount * 100) / 100;
    if (amountRounded > maxRounded) {
      alert(`余额上限为 ${this._MAX_BALANCE}`);
      return;
    }
    const pwd = String(pwdEl?.value || '').trim();
    if (!/^\d{6}$/.test(pwd)) {
      alert('请设置 6 位数字支付密码');
      return;
    }
    await this._load();
    this._data.activated = true;
    this._data.balance = amountRounded;
    this._data.payPwd = pwd;
    const now = Date.now();
    this._data.bills = Array.isArray(this._data.bills) ? this._data.bills : [];
    this._data.bills.push({
      id: State.generateId(),
      ts: now,
      title: '激活入账',
      amount: this._data.balance
    });
    await this._save();
    this._closeActivateModal();
    this._render();
  },

  openPasswordModal() {
    const modal = document.getElementById('wallet-password-modal');
    const input = document.getElementById('wallet-password-input');
    if (!modal || !input) return;
    modal.setAttribute('aria-hidden', 'false');
    input.value = '';
    setTimeout(() => input.focus(), 0);
  },

  _closePasswordModal() {
    const modal = document.getElementById('wallet-password-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
  },

  async _confirmPassword() {
    const input = document.getElementById('wallet-password-input');
    const pwd = String(input?.value || '').trim();
    if (!/^\d{6}$/.test(pwd)) {
      alert('请输入 6 位数字密码');
      return;
    }
    await this._load();
    if (!this._data?.activated) {
      alert('请先激活银行卡');
      return;
    }
    this._data.payPwd = pwd;
    await this._save();
    this._closePasswordModal();
    alert('已修改支付密码');
  },

  openBalanceModal() {
    const modal = document.getElementById('wallet-balance-modal');
    const input = document.getElementById('wallet-balance-input');
    if (!modal || !input) return;
    modal.setAttribute('aria-hidden', 'false');
    input.value = String(this._data?.balance ?? '');
    setTimeout(() => input.focus(), 0);
  },

  _closeBalanceModal() {
    const modal = document.getElementById('wallet-balance-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
  },

  async _confirmBalance() {
    const input = document.getElementById('wallet-balance-input');
    const raw = String(input?.value || '').trim().replace(/,/g, '');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      alert('请输入正确的金额');
      return;
    }
    const maxRounded = Math.round(this._MAX_BALANCE * 100) / 100;
    const amountRounded = Math.round(amount * 100) / 100;
    if (amountRounded > maxRounded) {
      alert(`余额上限为 ${this._MAX_BALANCE}`);
      return;
    }
    await this._load();
    if (!this._data?.activated) {
      alert('请先激活银行卡');
      return;
    }
    this._data.balance = amountRounded;
    await this._save();
    this._closeBalanceModal();
    this._render();
  },

  _formatCny(n) {
    const v = Number(n) || 0;
    return '￥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _formatTime(ts) {
    const t = Number(ts) || 0;
    if (!t) return '';
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  _esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
  }
};

