import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  Server,
  Key,
  Terminal,
  Shield,
  Send,
  Play,
  Trash2,
  Copy,
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [stats, setStats] = useState({});
  const [channels, setChannels] = useState([]);
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);

  // Modals
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    type: 'openai',
    base_url: '',
    api_key: '',
    priority: 1,
    weight: 10,
    models_str: '',
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState({
    tenant_id: '',
    key: '',
    rpm: 60,
  });

  const [testingId, setTestingId] = useState(null);

  // Playground state
  const [playModel, setPlayModel] = useState('deepseek-chat');
  const [playProtocol, setPlayProtocol] = useState('openai_chat'); // openai_chat, openai_text, anthropic_messages
  const [playApiKey, setPlayApiKey] = useState('');
  const [playStream, setPlayStream] = useState(true);
  const [playPrompt, setPlayPrompt] = useState('请用一句话介绍你自己和你的技术架构。');
  const [playImageUrl, setPlayImageUrl] = useState('');
  const [playOutput, setPlayOutput] = useState('');
  const [playLoading, setPlayLoading] = useState(false);
  const [playDurationMs, setPlayDurationMs] = useState(0);
  const [playTTFTMs, setPlayTTFTMs] = useState(0);

  // Load backend data
  const fetchData = async () => {
    try {
      const [chRes, keyRes, statsRes, mRes] = await Promise.all([
        fetch('/api/v1/admin/channels').then(r => r.json()).catch(() => ({ code: 1 })),
        fetch('/api/v1/admin/keys').then(r => r.json()).catch(() => ({ code: 1 })),
        fetch('/api/v1/admin/stats/overview').then(r => r.json()).catch(() => ({ code: 1 })),
        fetch('/api/v1/admin/models').then(r => r.json()).catch(() => ({ code: 1 })),
      ]);

      if (chRes.code === 0) setChannels(chRes.data || []);
      if (keyRes.code === 0) setKeys(keyRes.data || []);
      if (statsRes.code === 0) setStats(statsRes.data || {});
      if (mRes.code === 0 && mRes.data?.length) {
        setModels(mRes.data);
        if (!mRes.data.includes(playModel)) {
          setPlayModel(mRes.data[0]);
        }
      }
    } catch (e) {
      console.error('Fetch data failed:', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Channel Creation
  const handleCreateChannel = async (e) => {
    e.preventDefault();
    const payload = {
      ...newChannel,
      models: newChannel.models_str.split(',').map(s => s.trim()).filter(Boolean),
    };
    delete payload.models_str;

    await fetch('/api/v1/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setShowChannelModal(false);
    setNewChannel({
      name: '',
      type: 'openai',
      base_url: '',
      api_key: '',
      priority: 1,
      weight: 10,
      models_str: '',
    });
    fetchData();
  };

  // Handle Channel Deletion
  const handleDeleteChannel = async (id) => {
    if (!window.confirm('确认删除该渠道？')) return;
    await fetch(`/api/v1/admin/channels/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Test Channel
  const handleTestChannel = async (ch) => {
    setTestingId(ch.id);
    try {
      const res = await fetch(`/api/v1/admin/channels/${ch.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.code === 0) {
        alert(`✅ 连通性测试成功！\n耗时: ${data.latency_ms} ms\n响应样例: ${data.response}`);
      } else {
        alert(`❌ 连通失败: ${data.error || '未知错误'}`);
      }
    } catch (e) {
      alert(`请求异常: ${e.message}`);
    } finally {
      setTestingId(null);
    }
  };

  // Handle Key Creation
  const handleCreateKey = async (e) => {
    e.preventDefault();
    await fetch('/api/v1/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newKey),
    });
    setShowKeyModal(false);
    setNewKey({ tenant_id: '', key: '', rpm: 60 });
    fetchData();
  };

  // Handle Key Deletion
  const handleDeleteKey = async (id) => {
    if (!window.confirm('确认注销该虚拟 Key？')) return;
    await fetch(`/api/v1/admin/keys/${id}`, { method: 'DELETE' });
    fetchData();
  };

  // Copy text helper
  const copyToClipboard = (txt) => {
    navigator.clipboard.writeText(txt);
    alert(`已复制到剪贴板: ${txt}`);
  };

  // Playground Chat Execution
  const handleSendChat = async () => {
    if (!playPrompt.trim()) return;
    setPlayLoading(true);
    setPlayOutput('');
    setPlayDurationMs(0);
    setPlayTTFTMs(0);

    const start = Date.now();
    let firstTokenTime = null;

    const headers = { 'Content-Type': 'application/json' };
    if (playApiKey) {
      headers['Authorization'] = `Bearer ${playApiKey}`;
      headers['x-api-key'] = playApiKey;
    }

    let url = '/v1/chat/completions';
    let body = {};

    if (playProtocol === 'anthropic_messages') {
      url = '/v1/messages';
      let content = playPrompt;
      if (playImageUrl) {
        content = [
          { type: 'text', text: playPrompt },
          { type: 'image_url', image_url: { url: playImageUrl } },
        ];
      }
      body = {
        model: playModel,
        messages: [{ role: 'user', content }],
        stream: playStream,
        max_tokens: 1024,
      };
    } else if (playProtocol === 'openai_text') {
      url = '/v1/completions';
      body = {
        model: playModel,
        prompt: playPrompt,
        stream: playStream,
        max_tokens: 1024,
      };
    } else {
      // Standard OpenAI Chat
      url = '/v1/chat/completions';
      let content = playPrompt;
      if (playImageUrl) {
        content = [
          { type: 'text', text: playPrompt },
          { type: 'image_url', image_url: { url: playImageUrl } },
        ];
      }
      body = {
        model: playModel,
        messages: [{ role: 'user', content }],
        stream: playStream,
      };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setPlayOutput(`Error: ${JSON.stringify(err, null, 2)}`);
        return;
      }

      if (!playStream) {
        const data = await res.json();
        setPlayDurationMs(Date.now() - start);
        if (playProtocol === 'openai_text') {
          setPlayOutput(data.choices?.[0]?.text || '');
        } else if (playProtocol === 'anthropic_messages') {
          setPlayOutput(data.content?.[0]?.text || '');
        } else {
          setPlayOutput(data.choices?.[0]?.message?.content || '');
        }
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataContent = trimmed.substring(5).trim();
            if (dataContent === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataContent);
              let textDelta = '';
              if (chunk.choices?.[0]?.delta?.content) {
                textDelta = chunk.choices[0].delta.content;
              } else if (chunk.choices?.[0]?.text) {
                textDelta = chunk.choices[0].text;
              } else if (chunk.delta?.text) {
                textDelta = chunk.delta.text;
              }

              if (textDelta) {
                if (!firstTokenTime) {
                  firstTokenTime = Date.now();
                  setPlayTTFTMs(firstTokenTime - start);
                }
                setPlayOutput(prev => prev + textDelta);
              }
            } catch (e) {}
          }
        }
        setPlayDurationMs(Date.now() - start);
      }
    } catch (e) {
      setPlayOutput(`Request Failed: ${e.message}`);
    } finally {
      setPlayLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/60 border-r border-slate-800/80 flex flex-col backdrop-blur-xl">
        <div className="p-6 border-b border-slate-800/80 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-wide">Nano-Gateway</h1>
            <span className="text-xs text-indigo-400 font-mono">React 19 Edition</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'dashboard'
                ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>系统大盘</span>
          </button>

          <button
            onClick={() => setCurrentTab('channels')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'channels'
                ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>渠道与路由</span>
          </button>

          <button
            onClick={() => setCurrentTab('keys')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'keys'
                ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>虚拟 Key 治理</span>
          </button>

          <button
            onClick={() => setCurrentTab('playground')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'playground'
                ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>在线多模态调试</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800/80 text-xs text-slate-500 flex flex-col space-y-1">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Data Plane Online</span>
          </div>
          <span>Zero-DB Hot Path · Multi-Modal</span>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 bg-slate-900/40 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between px-8 sticky top-0 z-20">
          <h2 className="text-lg font-semibold text-white tracking-tight">
            {currentTab === 'dashboard' && '运行指标与全局概览'}
            {currentTab === 'channels' && '模型服务商渠道管理 (OpenAI, Claude, Gemini, vLLM)'}
            {currentTab === 'keys' && '租户虚拟 API 密钥与限流治理'}
            {currentTab === 'playground' && '多协议多模态交互调试台'}
          </h2>

          <div className="flex items-center space-x-4">
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1.5 transition"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Prometheus /metrics</span>
            </a>
            <a
              href="https://github.com/ifnodoraemon/nano-gateway"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center space-x-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </header>

        <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* 1. DASHBOARD */}
          {currentTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">总请求数</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-white font-mono">{stats.total_requests || 0}</span>
                    <Zap className="w-5 h-5 text-indigo-400" />
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">活跃渠道数</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-emerald-400 font-mono">{channels.length}</span>
                    <Server className="w-5 h-5 text-emerald-400" />
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">总 Token 消耗</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-cyan-400 font-mono">{stats.total_tokens || 0}</span>
                    <Activity className="w-5 h-5 text-cyan-400" />
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">平均首字耗时 (TTFT)</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-amber-400 font-mono">
                      {(stats.avg_ttft_ms || 0).toFixed(1)} <span className="text-sm text-slate-500 font-normal">ms</span>
                    </span>
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                </div>
              </div>

              {/* Architecture highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span>首字前无感容灾 (Safe Fallback)</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    遇到 429、500 或连接超时，首字分块发出前毫秒内切换到备份渠道，业务端完全无感。
                  </p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>Google Gemini 独立适配器</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    专属支持 Gemini Developer API 的 `?key=` 与 `x-goog-api-key`、`contents/parts` 格式及 permissive 安全阈值。
                  </p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center space-x-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>Any-to-Any 协议矩阵</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    入站支持 OpenAI Chat、Text 传统补全与 Claude `/v1/messages`，出站任意适配各类异构引擎。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. CHANNELS TAB */}
          {currentTab === 'channels' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-400">配置各主流服务商（OpenAI, Claude, Gemini, vLLM）并执行连通性测试。</p>
                <button
                  onClick={() => setShowChannelModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/30 flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>新建渠道</span>
                </button>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-slate-400 text-xs uppercase bg-slate-900/80">
                      <th className="py-3.5 px-6">渠道名称</th>
                      <th className="py-3.5 px-6">厂商类型</th>
                      <th className="py-3.5 px-6">基础地址 (Base URL)</th>
                      <th className="py-3.5 px-6">模型列表</th>
                      <th className="py-3.5 px-6">优先级 / 权重</th>
                      <th className="py-3.5 px-6 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {channels.map((ch) => (
                      <tr key={ch.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-4 px-6 font-medium text-white flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${ch.status === 'active' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                          <span>{ch.name}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
                              ch.type === 'gemini'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : ch.type === 'anthropic'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                            }`}
                          >
                            {ch.type}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-400 font-mono text-xs truncate max-w-xs">{ch.base_url}</td>
                        <td className="py-4 px-6">
                          <div className="flex flex-wrap gap-1">
                            {(ch.models || []).map((m) => (
                              <span key={m} className="px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 font-mono">
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-300 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-800">P:{ch.priority}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 ml-1">W:{ch.weight}</span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-3">
                          <button
                            onClick={() => handleTestChannel(ch)}
                            disabled={testingId === ch.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/30 transition inline-flex items-center space-x-1"
                          >
                            {testingId === ch.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            <span>Ping 测试</span>
                          </button>
                          <button onClick={() => handleDeleteChannel(ch.id)} className="text-xs text-rose-400 hover:text-rose-300 transition">
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {channels.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-12 text-center text-slate-500">
                          暂无配置渠道，点击右上角新建
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. VIRTUAL KEYS TAB */}
          {currentTab === 'keys' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-400">分发虚拟 API Key 给不同团队/应用，支持 RPM 限流与模型白名单。</p>
                <button
                  onClick={() => setShowKeyModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/30 flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>创建虚拟 Key</span>
                </button>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-slate-400 text-xs uppercase bg-slate-900/80">
                      <th className="py-3.5 px-6">虚拟 Key (Token)</th>
                      <th className="py-3.5 px-6">租户 ID</th>
                      <th className="py-3.5 px-6">RPM 限制</th>
                      <th className="py-3.5 px-6">模型权限</th>
                      <th className="py-3.5 px-6">状态</th>
                      <th className="py-3.5 px-6 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-sm">
                    {keys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-4 px-6 font-mono text-xs text-indigo-300 flex items-center space-x-2">
                          <span>{k.key}</span>
                          <button onClick={() => copyToClipboard(k.key)} className="text-slate-500 hover:text-slate-300" title="复制">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-4 px-6 text-slate-300">{k.tenant_id}</td>
                        <td className="py-4 px-6 text-slate-300 font-mono text-xs">{k.rpm || '不限'} req/min</td>
                        <td className="py-4 px-6 text-xs text-emerald-400">
                          {!k.allowed_models || k.allowed_models.length === 0 ? '全部允许' : k.allowed_models.join(', ')}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button onClick={() => handleDeleteKey(k.id)} className="text-xs text-rose-400 hover:text-rose-300 transition">
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {keys.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-12 text-center text-slate-500">
                          暂无虚拟 Key，点击右上角创建
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. PLAYGROUND TAB */}
          {currentTab === 'playground' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Controls */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 space-y-4">
                <h3 className="font-semibold text-white">模型与协议配置</h3>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">测试接口协议</label>
                  <select
                    value={playProtocol}
                    onChange={(e) => setPlayProtocol(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="openai_chat">OpenAI Chat (/v1/chat/completions)</option>
                    <option value="openai_text">OpenAI Text (/v1/completions 传统补全)</option>
                    <option value="anthropic_messages">Anthropic Claude (/v1/messages)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">模型名称</label>
                  <select
                    value={playModel}
                    onChange={(e) => setPlayModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">虚拟 API Key (可选)</label>
                  <input
                    type="text"
                    value={playApiKey}
                    onChange={(e) => setPlayApiKey(e.target.value)}
                    placeholder="sk-gw-xxxx"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {playProtocol !== 'openai_text' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>多模态图片 URL (可选)</span>
                    </label>
                    <input
                      type="text"
                      value={playImageUrl}
                      onChange={(e) => setPlayImageUrl(e.target.value)}
                      placeholder="https://... 或 data:image/png;base64,..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="streamCheck"
                    checked={playStream}
                    onChange={(e) => setPlayStream(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="streamCheck" className="text-sm text-slate-300">
                    开启 SSE 流式输出
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-2">
                  <div className="flex justify-between">
                    <span>首字延迟 (TTFT):</span>
                    <span className="font-mono text-amber-400">{playTTFTMs ? `${playTTFTMs} ms` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>总耗时:</span>
                    <span className="font-mono text-indigo-400">{playDurationMs ? `${playDurationMs} ms` : '-'}</span>
                  </div>
                </div>
              </div>

              {/* Chat View */}
              <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 flex flex-col h-[620px]">
                <div className="flex-1 overflow-y-auto space-y-4 p-3 font-mono text-sm border-b border-slate-800/80 leading-relaxed whitespace-pre-wrap text-slate-200">
                  {playOutput || (
                    <div className="text-slate-600 text-center py-28 font-sans">
                      在下方输入提示词，点击发送测试网关跨协议/多模态代理转发
                    </div>
                  )}
                </div>

                <div className="pt-4 flex space-x-3">
                  <textarea
                    rows={2}
                    value={playPrompt}
                    onChange={(e) => setPlayPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) handleSendChat();
                    }}
                    placeholder="输入测试提示词... (Ctrl+Enter 发送)"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={playLoading}
                    className="px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition shadow-md shadow-indigo-600/30"
                  >
                    {playLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>发送</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal: New Channel */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleCreateChannel} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="font-semibold text-lg text-white">新建服务商渠道</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">渠道名称</label>
                <input
                  required
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="例如: google-gemini-pro 或 deepseek-primary"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">厂商类型</label>
                  <select
                    value={newChannel.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      let defaultUrl = newChannel.base_url;
                      if (t === 'gemini') defaultUrl = 'https://generativelanguage.googleapis.com';
                      if (t === 'anthropic') defaultUrl = 'https://api.anthropic.com';
                      setNewChannel({ ...newChannel, type: t, base_url: defaultUrl });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="openai">openai</option>
                    <option value="gemini">gemini (Google Specialized)</option>
                    <option value="anthropic">anthropic</option>
                    <option value="vllm">vllm</option>
                    <option value="sglang">sglang</option>
                    <option value="ollama">ollama</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">优先级 (越小越优先)</label>
                  <input
                    type="number"
                    value={newChannel.priority}
                    onChange={(e) => setNewChannel({ ...newChannel, priority: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Base URL</label>
                <input
                  required
                  value={newChannel.base_url}
                  onChange={(e) => setNewChannel({ ...newChannel, base_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={newChannel.api_key}
                  onChange={(e) => setNewChannel({ ...newChannel, api_key: e.target.value })}
                  placeholder="密钥或填 none"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">支持模型列表 (逗号分隔)</label>
                <input
                  required
                  value={newChannel.models_str}
                  onChange={(e) => setNewChannel({ ...newChannel, models_str: e.target.value })}
                  placeholder="gemini-1.5-pro, gemini-1.5-flash 或 deepseek-chat"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                取消
              </button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">
                创建渠道并热同步
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Key */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleCreateKey} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-semibold text-lg text-white">签发虚拟 Key</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">租户 ID / 应用标签</label>
                <input
                  required
                  value={newKey.tenant_id}
                  onChange={(e) => setNewKey({ ...newKey, tenant_id: e.target.value })}
                  placeholder="例如: agent-rag-team"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">自定义 Key (留空自动生成)</label>
                <input
                  value={newKey.key}
                  onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                  placeholder="sk-gw-xxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">RPM 限流阈值 (每分钟请求数)</label>
                <input
                  type="number"
                  value={newKey.rpm}
                  onChange={(e) => setNewKey({ ...newKey, rpm: parseInt(e.target.value) || 60 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                取消
              </button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">
                创建 Key
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
