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
  Image as ImageIcon,
  Cpu,
  Layers,
  Sparkles,
  HelpCircle,
  ArrowRight
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
    protocols: ['openai_chat', 'openai_text', 'anthropic_messages'],
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
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Quick Presets for Provider
  const applyPreset = (presetKey) => {
    switch (presetKey) {
      case 'sub2api':
        setNewChannel({
          name: 'sub2api-upstream',
          type: 'sub2api',
          base_url: 'https://your-sub2api.example.com/v1',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'gpt-4o, claude-3-5-sonnet, deepseek-chat',
          protocols: ['openai_chat', 'openai_text', 'anthropic_messages'],
        });
        break;
      case 'gpustack':
        setNewChannel({
          name: 'gpustack-cluster',
          type: 'gpustack',
          base_url: 'http://192.168.1.100:80/v1-openai',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'meta-llama/Llama-3.1-8B-Instruct, deepseek-r1-distill-qwen-14b',
          protocols: ['openai_chat', 'openai_text'],
        });
        break;
      case 'gemini':
        setNewChannel({
          name: 'google-gemini-official',
          type: 'gemini',
          base_url: 'https://generativelanguage.googleapis.com',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash',
          protocols: ['openai_chat', 'anthropic_messages'],
        });
        break;
      case 'anthropic':
        setNewChannel({
          name: 'anthropic-claude-direct',
          type: 'anthropic',
          base_url: 'https://api.anthropic.com',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022',
          protocols: ['openai_chat', 'anthropic_messages'],
        });
        break;
      case 'openai':
        setNewChannel({
          name: 'openai-official-us',
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'gpt-4o, gpt-4o-mini, o3-mini',
          protocols: ['openai_chat', 'openai_text', 'anthropic_messages'],
        });
        break;
      case 'deepseek':
        setNewChannel({
          name: 'deepseek-direct',
          type: 'deepseek',
          base_url: 'https://api.deepseek.com',
          api_key: '',
          priority: 1,
          weight: 10,
          models_str: 'deepseek-chat, deepseek-reasoner',
          protocols: ['openai_chat', 'openai_text'],
        });
        break;
      case 'custom':
        setNewChannel({
          name: 'custom-downstream',
          type: 'custom',
          base_url: 'http://localhost:8000/v1',
          api_key: '',
          priority: 2,
          weight: 10,
          models_str: 'custom-model-v1',
          protocols: ['openai_chat'],
        });
        break;
      default:
        break;
    }
  };

  // Toggle protocol checkbox
  const toggleProtocol = (proto) => {
    setNewChannel(prev => {
      const exists = prev.protocols.includes(proto);
      if (exists) {
        return { ...prev, protocols: prev.protocols.filter(p => p !== proto) };
      } else {
        return { ...prev, protocols: [...prev.protocols, proto] };
      }
    });
  };

  // Handle Channel/Provider Creation
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
      protocols: ['openai_chat', 'openai_text', 'anthropic_messages'],
    });
    fetchData();
  };

  // Handle Channel Deletion
  const handleDeleteChannel = async (id) => {
    if (!window.confirm('确认注销该模型提供商 (Provider)？')) return;
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
    if (!window.confirm('确认注销该客户端密钥？')) return;
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
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white/90 border-r border-slate-200/80 flex flex-col backdrop-blur-xl shadow-xs">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white">
            <Zap className="w-5 h-5 fill-white text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base text-slate-900 tracking-tight">Nano-Gateway</h1>
            <span className="text-xs text-indigo-600 font-semibold tracking-wide">极速企业网关</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'dashboard'
                ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200 shadow-xs font-semibold'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border-transparent'
            }`}
          >
            <Activity className="w-4 h-4 text-indigo-500" />
            <span>系统大盘与指标</span>
          </button>

          <button
            onClick={() => setCurrentTab('channels')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'channels'
                ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200 shadow-xs font-semibold'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border-transparent'
            }`}
          >
            <Server className="w-4 h-4 text-emerald-600" />
            <span>模型源 (Providers)</span>
          </button>

          <button
            onClick={() => setCurrentTab('keys')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'keys'
                ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200 shadow-xs font-semibold'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border-transparent'
            }`}
          >
            <Key className="w-4 h-4 text-amber-500" />
            <span>客户端密钥 (Keys)</span>
          </button>

          <button
            onClick={() => setCurrentTab('playground')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
              currentTab === 'playground'
                ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200 shadow-xs font-semibold'
                : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border-transparent'
            }`}
          >
            <Terminal className="w-4 h-4 text-purple-500" />
            <span>多模态实验台</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-500 flex flex-col space-y-1 bg-slate-50/50">
          <div className="flex items-center space-x-1.5 text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>高可用集群健康运行</span>
          </div>
          <span className="text-slate-400">Zero-DB 热路径 · 毫秒级首字容灾</span>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-8 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {currentTab === 'dashboard' && '运行指标与全局概览'}
              {currentTab === 'channels' && '模型源与供应商治理 (GPUStack, Sub2API, Gemini, Claude, OpenAI)'}
              {currentTab === 'keys' && '客户端 API 密钥与限流治理'}
              {currentTab === 'playground' && '多协议多模态交互实验台'}
            </h2>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center space-x-1.5 transition border border-slate-200"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>Prometheus /metrics</span>
            </a>
            <a
              href="https://github.com/ifnodoraemon/nano-gateway"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium flex items-center space-x-1.5 transition"
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
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">总请求数</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-slate-900 font-mono">{stats.total_requests || 0}</span>
                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                      <Zap className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">活跃模型源 (Providers)</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-emerald-600 font-mono">{channels.length}</span>
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                      <Server className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">总 Token 消耗</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-sky-600 font-mono">{stats.total_tokens || 0}</span>
                    <div className="p-2 bg-sky-50 rounded-xl text-sky-600">
                      <Activity className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">平均首字耗时 (TTFT)</span>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-amber-600 font-mono">
                      {(stats.avg_ttft_ms || 0).toFixed(1)} <span className="text-sm text-slate-400 font-normal">ms</span>
                    </span>
                    <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                      <Zap className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Architecture highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>首字前无感容灾 (Safe Fallback)</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    遇到上游 429、500 或连接超时，首字分块发出前毫秒内切换到备份 Provider，业务端完全无感。
                  </p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <span>原生 GPUStack & Sub2API 支持</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    一键接入 GPUStack 私有算力池与 Sub2API 聚合网关，支持协议定制与自定义下游扩展。
                  </p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span>Any-to-Any 协议矩阵</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    入站同时支持 OpenAI Chat、Text 补全与 Claude Messages，出站无缝适配异构模型引擎。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. CHANNELS / PROVIDERS TAB */}
          {currentTab === 'channels' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">模型提供商 (Providers) 列表</h3>
                  <p className="text-xs text-slate-500 mt-0.5">配置各大主流服务商及私有算力池（GPUStack, Sub2API, Gemini, Claude, OpenAI），支持自定义协议与熔断探活。</p>
                </div>
                <button
                  onClick={() => setShowChannelModal(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>新建 Provider</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase bg-slate-50/80">
                      <th className="py-3.5 px-6 font-semibold">名称与健康度</th>
                      <th className="py-3.5 px-6 font-semibold">类型</th>
                      <th className="py-3.5 px-6 font-semibold">Base URL</th>
                      <th className="py-3.5 px-6 font-semibold">支持协议</th>
                      <th className="py-3.5 px-6 font-semibold">挂载模型</th>
                      <th className="py-3.5 px-6 font-semibold">优先级 / 权重</th>
                      <th className="py-3.5 px-6 text-right font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {channels.map((ch) => (
                      <tr key={ch.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-4 px-6 font-medium text-slate-900">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                ch.breaker_status === 'OPEN'
                                  ? 'bg-rose-500 animate-ping'
                                  : ch.status === 'active'
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-400'
                              }`}
                            ></span>
                            <span className="font-semibold">{ch.name}</span>
                          </div>
                          {ch.breaker_status && (
                            <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded font-mono font-medium ${
                              ch.breaker_status === 'OPEN'
                                ? 'bg-rose-100 text-rose-700'
                                : ch.breaker_status === 'HALF-OPEN'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              Breaker: {ch.breaker_status}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${
                              ch.type === 'gemini'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : ch.type === 'anthropic'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : ch.type === 'gpustack'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : ch.type === 'sub2api'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {ch.type}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-600 font-mono text-xs truncate max-w-xs">{ch.base_url}</td>
                        <td className="py-4 px-6">
                          <div className="flex flex-wrap gap-1">
                            {(!ch.protocols || ch.protocols.length === 0) ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-600 font-medium">全协议</span>
                            ) : (
                              ch.protocols.map(p => (
                                <span key={p} className="px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-600 font-mono">
                                  {p.replace('openai_', '').replace('anthropic_', '')}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(ch.models || []).map((m) => (
                              <span key={m} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-mono border border-indigo-100">
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-700 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800">P:{ch.priority}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 ml-1">W:{ch.weight}</span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2">
                          <button
                            onClick={() => handleTestChannel(ch)}
                            disabled={testingId === ch.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-medium transition inline-flex items-center space-x-1"
                          >
                            {testingId === ch.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            <span>Ping 测试</span>
                          </button>
                          <button
                            onClick={() => handleDeleteChannel(ch.id)}
                            className="text-xs px-2.5 py-1.5 text-rose-600 hover:text-rose-800 transition font-medium"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {channels.length === 0 && (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-slate-400">
                          暂无配置 Provider，点击右上角快速新建
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
              <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">客户端虚拟 API Key 列表</h3>
                  <p className="text-xs text-slate-500 mt-0.5">分发虚拟 API Key 给不同团队与下游应用，支持 RPM 精准限流与模型白名单。</p>
                </div>
                <button
                  onClick={() => setShowKeyModal(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>创建虚拟 Key</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase bg-slate-50/80">
                      <th className="py-3.5 px-6 font-semibold">虚拟 API Key (Token)</th>
                      <th className="py-3.5 px-6 font-semibold">租户 ID / 应用标签</th>
                      <th className="py-3.5 px-6 font-semibold">RPM 限流</th>
                      <th className="py-3.5 px-6 font-semibold">模型权限白名单</th>
                      <th className="py-3.5 px-6 font-semibold">状态</th>
                      <th className="py-3.5 px-6 text-right font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {keys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-4 px-6 font-mono text-xs text-indigo-700 font-semibold flex items-center space-x-2">
                          <span>{k.key}</span>
                          <button
                            onClick={() => copyToClipboard(k.key)}
                            className="p-1 hover:bg-indigo-50 rounded text-slate-400 hover:text-indigo-600 transition"
                            title="复制 Key"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-4 px-6 text-slate-800 font-medium">{k.tenant_id}</td>
                        <td className="py-4 px-6 text-slate-600 font-mono text-xs">{k.rpm || '不限'} req/min</td>
                        <td className="py-4 px-6 text-xs text-emerald-700 font-medium">
                          {!k.allowed_models || k.allowed_models.length === 0 ? '全部允许' : k.allowed_models.join(', ')}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                            Active
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            className="text-xs px-2.5 py-1.5 text-rose-600 hover:text-rose-800 transition font-medium"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {keys.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-12 text-center text-slate-400">
                          暂无虚拟 Key，点击右上角快速创建
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
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">调试参数与协议</h3>
                  <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-mono">Live Tester</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">测试接口协议</label>
                  <select
                    value={playProtocol}
                    onChange={(e) => setPlayProtocol(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="openai_chat">OpenAI Chat (/v1/chat/completions)</option>
                    <option value="openai_text">OpenAI Text (/v1/completions 传统补全)</option>
                    <option value="anthropic_messages">Anthropic Claude (/v1/messages)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">目标模型</label>
                  <select
                    value={playModel}
                    onChange={(e) => setPlayModel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {models.length === 0 && <option value="deepseek-chat">deepseek-chat</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">客户端虚拟 API Key (可选)</label>
                  <input
                    type="text"
                    value={playApiKey}
                    onChange={(e) => setPlayApiKey(e.target.value)}
                    placeholder="sk-gw-xxxx (留空使用网关免密直通)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>

                {playProtocol !== 'openai_text' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>多模态视觉图片 URL (可选)</span>
                    </label>
                    <input
                      type="text"
                      value={playImageUrl}
                      onChange={(e) => setPlayImageUrl(e.target.value)}
                      placeholder="https://... 或 data:image/png;base64,..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="streamCheck"
                    checked={playStream}
                    onChange={(e) => setPlayStream(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="streamCheck" className="text-sm font-medium text-slate-700 cursor-pointer">
                    开启 SSE 流式输出 (Streaming)
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-2">
                  <div className="flex justify-between">
                    <span>首字延迟 (TTFT):</span>
                    <span className="font-mono font-bold text-amber-600">{playTTFTMs ? `${playTTFTMs} ms` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>总耗时:</span>
                    <span className="font-mono font-bold text-indigo-600">{playDurationMs ? `${playDurationMs} ms` : '-'}</span>
                  </div>
                </div>
              </div>

              {/* Chat View */}
              <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 flex flex-col h-[620px] shadow-xs">
                <div className="flex-1 overflow-y-auto space-y-4 p-4 font-mono text-sm border border-slate-200 rounded-xl leading-relaxed whitespace-pre-wrap text-slate-800 bg-slate-50/60">
                  {playOutput || (
                    <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                      <Sparkles className="w-8 h-8 text-indigo-400 stroke-1" />
                      <span>在下方输入测试 Prompt，点击发送验证跨协议多模态分发能力</span>
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
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={playLoading}
                    className="px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
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

      {/* Modal: New Provider */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <form onSubmit={handleCreateChannel} className="bg-white border border-slate-200 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">新建模型提供商 (Provider)</h3>
                <p className="text-xs text-slate-500">统一接入上游模型服务，支持协议选择与智能熔断</p>
              </div>
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets Buttons */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>一键快捷配置预设 (Quick Presets)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('sub2api')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-medium transition"
                >
                  ⚡ Sub2API
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('gpustack')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium transition"
                >
                  🖥️ GPUStack
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('gemini')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-medium transition"
                >
                  🌐 Google Gemini
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('anthropic')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-medium transition"
                >
                  🧠 Anthropic Claude
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('openai')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-medium transition"
                >
                  🤖 OpenAI 官方
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('deepseek')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium transition"
                >
                  🚀 DeepSeek
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('custom')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium transition"
                >
                  🛠️ 自定义下游
                </button>
              </div>
            </div>

            <div className="space-y-3 text-sm pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Provider 标识名称</label>
                <input
                  required
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="例如: gpustack-cluster 或 sub2api-backup"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">厂商 / 引擎类别</label>
                  <select
                    value={newChannel.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      let defaultUrl = newChannel.base_url;
                      if (t === 'gemini') defaultUrl = 'https://generativelanguage.googleapis.com';
                      if (t === 'anthropic') defaultUrl = 'https://api.anthropic.com';
                      if (t === 'sub2api') defaultUrl = 'https://your-sub2api.example.com/v1';
                      if (t === 'gpustack') defaultUrl = 'http://gpustack.local/v1-openai';
                      setNewChannel({ ...newChannel, type: t, base_url: defaultUrl });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="sub2api">sub2api (聚合接入)</option>
                    <option value="gpustack">gpustack (私有化算力栈)</option>
                    <option value="gemini">gemini (Google 专用协议)</option>
                    <option value="anthropic">anthropic (Claude 原生协议)</option>
                    <option value="openai">openai (OpenAI 标准协议)</option>
                    <option value="deepseek">deepseek (深度求索)</option>
                    <option value="vllm">vllm (本地推理引擎)</option>
                    <option value="sglang">sglang (高性能推理引擎)</option>
                    <option value="custom">custom (自定义下游适配器)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">优先级 (1 为最高主源)</label>
                  <input
                    type="number"
                    value={newChannel.priority}
                    onChange={(e) => setNewChannel({ ...newChannel, priority: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">下游 Base URL (包含协议与端口)</label>
                <input
                  required
                  value={newChannel.base_url}
                  onChange={(e) => setNewChannel({ ...newChannel, base_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">API Key / Token (无需填 none)</label>
                <input
                  type="password"
                  value={newChannel.api_key}
                  onChange={(e) => setNewChannel({ ...newChannel, api_key: e.target.value })}
                  placeholder="密钥或填 none"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">支持模型列表 (逗号分隔)</label>
                <input
                  required
                  value={newChannel.models_str}
                  onChange={(e) => setNewChannel({ ...newChannel, models_str: e.target.value })}
                  placeholder="gpt-4o, claude-3-5-sonnet, gemini-2.0-flash 或 deepseek-chat"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Supported Inbound / Outbound Protocols selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">下游开放支持协议 (多选)</label>
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('openai_chat')}
                      onChange={() => toggleProtocol('openai_chat')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>OpenAI Chat (/v1/chat/completions)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('openai_text')}
                      onChange={() => toggleProtocol('openai_text')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>OpenAI Text (/v1/completions)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('anthropic_messages')}
                      onChange={() => toggleProtocol('anthropic_messages')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>Anthropic Claude (/v1/messages)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition"
              >
                创建 Provider 并热加载
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Key */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <form onSubmit={handleCreateKey} className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">签发客户端虚拟 API Key</h3>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">租户 ID / 应用标签</label>
                <input
                  required
                  value={newKey.tenant_id}
                  onChange={(e) => setNewKey({ ...newKey, tenant_id: e.target.value })}
                  placeholder="例如: agent-rag-service 或 finance-team"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">自定义 Key (留空自动生成)</label>
                <input
                  value={newKey.key}
                  onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                  placeholder="sk-gw-xxxx (留空自动生成)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">RPM 限流阈值 (每分钟请求数)</label>
                <input
                  type="number"
                  value={newKey.rpm}
                  onChange={(e) => setNewKey({ ...newKey, rpm: parseInt(e.target.value) || 60 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition"
              >
                立即签发
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
