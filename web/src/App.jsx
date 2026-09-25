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
  ArrowRight,
  Volume2,
  Mic,
  Video,
  Download,
  FileAudio,
  MessageSquare
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
    mapping_str: '',
    protocols: ['openai_chat', 'openai_text', 'anthropic_messages', 'images', 'audio_speech', 'audio_transcription', 'videos'],
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState({
    tenant_id: '',
    key: '',
    rpm: 60,
  });

  const [testingId, setTestingId] = useState(null);

  // Playground Modality Switcher
  const [playModality, setPlayModality] = useState('chat'); // 'chat' | 'images' | 'audio_speech' | 'audio_transcription' | 'videos'
  const [playApiKey, setPlayApiKey] = useState('');
  const [playLoading, setPlayLoading] = useState(false);
  const [playDurationMs, setPlayDurationMs] = useState(0);
  const [playOutput, setPlayOutput] = useState('');

  // 1. Chat & Completions state
  const [playModel, setPlayModel] = useState('deepseek-chat');
  const [playProtocol, setPlayProtocol] = useState('openai_chat'); // openai_chat, openai_text, anthropic_messages
  const [playStream, setPlayStream] = useState(true);
  const [playPrompt, setPlayPrompt] = useState('请用一句话介绍你自己和你的技术架构。');
  const [playImageUrl, setPlayImageUrl] = useState('');
  const [playTTFTMs, setPlayTTFTMs] = useState(0);

  // 2. Image Generation state
  const [imgModel, setImgModel] = useState('dall-e-3');
  const [imgPrompt, setImgPrompt] = useState('A sleek modern high-tech datacenter with glowing neural network fiber optics, bright neon lighting, 8k digital art');
  const [imgSize, setImgSize] = useState('1024x1024');
  const [imgQuality, setImgQuality] = useState('standard');
  const [imgResult, setImgResult] = useState(null);

  // 3. Audio Speech (TTS) state
  const [ttsModel, setTtsModel] = useState('tts-1');
  const [ttsVoice, setTtsVoice] = useState('alloy');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsInput, setTtsInput] = useState('欢迎体验 Nano-Gateway 极致性能企业级大模型与多模态网关系统。');
  const [ttsAudioUrl, setTtsAudioUrl] = useState(null);

  // 4. Audio Transcription (STT) state
  const [sttModel, setSttModel] = useState('whisper-1');
  const [sttFile, setSttFile] = useState(null);
  const [sttResult, setSttResult] = useState('');

  // 5. Video Generation & Polling state
  const [videoModel, setVideoModel] = useState('sora');
  const [videoPrompt, setVideoPrompt] = useState('A cinematic drone shot flying over a futuristic city with green energy towers and flying drones at dawn');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoTaskId, setVideoTaskId] = useState('');
  const [videoTaskStatus, setVideoTaskStatus] = useState(''); // PENDING, PROCESSING, SUCCESS, FAILED
  const [videoResultUrl, setVideoResultUrl] = useState('');
  const [videoPollCount, setVideoPollCount] = useState(0);

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
          models_str: 'gpt-4o, claude-3-5-sonnet, deepseek-chat, dall-e-3, tts-1',
          mapping_str: 'my-corp/*:*',
          protocols: ['openai_chat', 'openai_text', 'anthropic_messages', 'images', 'audio_speech', 'audio_transcription', 'videos'],
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
          models_str: 'meta-llama/Llama-3.1-8B-Instruct, deepseek-r1-distill-qwen-14b, flux-schnell',
          mapping_str: 'local/*:*',
          protocols: ['openai_chat', 'openai_text', 'images'],
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
          mapping_str: '',
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
          mapping_str: '',
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
          models_str: 'gpt-4o, gpt-4o-mini, o3-mini, dall-e-3, tts-1, whisper-1, sora',
          mapping_str: '',
          protocols: ['openai_chat', 'openai_text', 'anthropic_messages', 'images', 'audio_speech', 'audio_transcription', 'videos'],
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
          mapping_str: '',
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
          models_str: 'custom-model-v1, flux-schnell',
          mapping_str: 'cascade/custom/*:*',
          protocols: ['openai_chat', 'images', 'audio_speech', 'videos'],
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
    const modelMapping = {};
    if (newChannel.mapping_str && newChannel.mapping_str.trim()) {
      const parts = newChannel.mapping_str.split(',');
      for (const p of parts) {
        const [k, v] = p.split(':').map(s => s.trim());
        if (k && v) {
          modelMapping[k] = v;
        }
      }
    }

    const payload = {
      ...newChannel,
      models: newChannel.models_str.split(',').map(s => s.trim()).filter(Boolean),
      model_mapping: modelMapping,
    };
    delete payload.models_str;
    delete payload.mapping_str;

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
      mapping_str: '',
      protocols: ['openai_chat', 'openai_text', 'anthropic_messages', 'images', 'audio_speech', 'audio_transcription', 'videos'],
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

  // 1. Chat Execution
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
        const err = await res.json().catch(() => ({ error: res.statusText }));
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

  // 2. Image Generation Execution
  const handleGenerateImage = async () => {
    if (!imgPrompt.trim()) return;
    setPlayLoading(true);
    setImgResult(null);
    setPlayOutput('');
    setPlayDurationMs(0);
    const start = Date.now();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (playApiKey) {
        headers['Authorization'] = `Bearer ${playApiKey}`;
      }
      const res = await fetch('/v1/images/generations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: imgModel,
          prompt: imgPrompt,
          size: imgSize,
          quality: imgQuality,
          n: 1,
        }),
      });
      setPlayDurationMs(Date.now() - start);
      const data = await res.json();
      if (!res.ok) {
        setPlayOutput(`生图请求失败 (${res.status}):\n${JSON.stringify(data, null, 2)}`);
      } else {
        const item = data.data?.[0];
        setImgResult(item || null);
        setPlayOutput(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setPlayOutput(`生图网络异常: ${e.message}`);
    } finally {
      setPlayLoading(false);
    }
  };

  // 3. Audio Speech Execution (TTS)
  const handleGenerateSpeech = async () => {
    if (!ttsInput.trim()) return;
    setPlayLoading(true);
    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }
    setPlayOutput('');
    setPlayDurationMs(0);
    const start = Date.now();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (playApiKey) {
        headers['Authorization'] = `Bearer ${playApiKey}`;
      }
      const res = await fetch('/v1/audio/speech', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: ttsModel,
          input: ttsInput,
          voice: ttsVoice,
          speed: parseFloat(ttsSpeed) || 1.0,
          response_format: 'mp3',
        }),
      });
      setPlayDurationMs(Date.now() - start);
      if (!res.ok) {
        const err = await res.text();
        setPlayOutput(`语音合成失败 (${res.status}):\n${err}`);
      } else {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        setTtsAudioUrl(audioUrl);
        setPlayOutput(`✅ 语音合成成功！\n音频大小: ${(blob.size / 1024).toFixed(1)} KB\n格式: audio/mpeg (MP3)`);
      }
    } catch (e) {
      setPlayOutput(`语音合成异常: ${e.message}`);
    } finally {
      setPlayLoading(false);
    }
  };

  // 4. Audio Transcription Execution (STT)
  const handleTranscribeAudio = async () => {
    if (!sttFile) {
      alert('请先选择要转写的音频文件');
      return;
    }
    setPlayLoading(true);
    setSttResult('');
    setPlayOutput('');
    setPlayDurationMs(0);
    const start = Date.now();

    try {
      const formData = new FormData();
      formData.append('file', sttFile);
      formData.append('model', sttModel);

      const headers = {};
      if (playApiKey) {
        headers['Authorization'] = `Bearer ${playApiKey}`;
      }

      const res = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        headers,
        body: formData,
      });
      setPlayDurationMs(Date.now() - start);
      const data = await res.json();
      if (!res.ok) {
        setPlayOutput(`语音识别失败 (${res.status}):\n${JSON.stringify(data, null, 2)}`);
      } else {
        setSttResult(data.text || '');
        setPlayOutput(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setPlayOutput(`语音识别异常: ${e.message}`);
    } finally {
      setPlayLoading(false);
    }
  };

  // 5. Video Generation & Task Polling
  const pollVideoTask = (taskId, startTime) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      setVideoPollCount(attempts);
      try {
        const headers = {};
        if (playApiKey) headers['Authorization'] = `Bearer ${playApiKey}`;
        const res = await fetch(`/v1/videos/tasks/${taskId}`, { headers });
        const data = await res.json();
        setVideoTaskStatus(data.status || 'PROCESSING');
        setPlayOutput(`[轮询第 ${attempts} 次] 任务状态: ${data.status}\n` + JSON.stringify(data, null, 2));
        setPlayDurationMs(Date.now() - startTime);

        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setVideoResultUrl(data.video_url || '');
          setPlayLoading(false);
        } else if (data.status === 'FAILED' || attempts >= 30) {
          clearInterval(interval);
          setPlayLoading(false);
        }
      } catch (e) {
        clearInterval(interval);
        setPlayLoading(false);
      }
    }, 2000);
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setPlayLoading(true);
    setVideoTaskId('');
    setVideoTaskStatus('PENDING');
    setVideoResultUrl('');
    setVideoPollCount(0);
    setPlayOutput('');
    setPlayDurationMs(0);
    const start = Date.now();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (playApiKey) {
        headers['Authorization'] = `Bearer ${playApiKey}`;
      }
      const res = await fetch('/v1/videos/generations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: videoModel,
          prompt: videoPrompt,
          aspect_ratio: videoAspectRatio,
        }),
      });
      setPlayDurationMs(Date.now() - start);
      const data = await res.json();
      if (!res.ok) {
        setPlayOutput(`视频生成提交失败 (${res.status}):\n${JSON.stringify(data, null, 2)}`);
        setPlayLoading(false);
        return;
      }
      setPlayOutput(JSON.stringify(data, null, 2));
      const tid = data.task_id || data.id;
      setVideoTaskId(tid);
      setVideoTaskStatus(data.status || 'PROCESSING');
      if (data.status === 'SUCCESS' && data.video_url) {
        setVideoResultUrl(data.video_url);
        setPlayLoading(false);
      } else if (tid) {
        pollVideoTask(tid, start);
      } else {
        setPlayLoading(false);
      }
    } catch (e) {
      setPlayOutput(`创建视频任务异常: ${e.message}`);
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
            <span className="text-xs text-indigo-600 font-semibold tracking-wide">极速多模态网关</span>
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
            <span>客户端虚拟 Key</span>
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
          <span className="text-slate-400">Zero-DB 热路径 · 文本/图/音/视全模态</span>
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
              {currentTab === 'playground' && '多协议全模态交互实验台 (Chat, Images, TTS, STT, Videos)'}
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
                    遇到上游 429、500 或连接超时，首字分块发出前毫秒内切换到备份 Provider，文本与多模态请求统一受保护。
                  </p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-emerald-600" />
                    <span>原生 GPUStack & Sub2API 支持</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    一键接入 GPUStack 私有算力池与 Sub2API 聚合网关，支持级联模型别名映射（yy/xxx/xx → xxx/xx）。
                  </p>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span>全模态统一分发 (Unified Pipeline)</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Chat、生图、TTS 语音合成、Whisper STT 识别、视频生成均采用软件工程 Strategy 模式，零冗余分支。
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
                  <p className="text-xs text-slate-500 mt-0.5">配置各大主流服务商及私有算力池（GPUStack, Sub2API, Gemini, Claude, OpenAI），支持多模态协议与熔断探活。</p>
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
                      <th className="py-3.5 px-6 font-semibold">支持协议与模态</th>
                      <th className="py-3.5 px-6 font-semibold">挂载模型与级联映射</th>
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
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-600 font-medium">全协议直通</span>
                            ) : (
                              ch.protocols.map(p => {
                                let label = p;
                                let colorClass = 'bg-slate-100 text-slate-700 border border-slate-200';
                                if (p === 'openai_chat' || p === 'chat') { label = '💬 对话'; colorClass = 'bg-indigo-50 text-indigo-700 border border-indigo-200'; }
                                else if (p === 'openai_text' || p === 'completion') { label = '📝 补全'; colorClass = 'bg-sky-50 text-sky-700 border border-sky-200'; }
                                else if (p === 'anthropic_messages' || p === 'messages') { label = '🧠 Claude'; colorClass = 'bg-amber-50 text-amber-700 border border-amber-200'; }
                                else if (p === 'images' || p === 'image_generation') { label = '🎨 生图'; colorClass = 'bg-pink-50 text-pink-700 border border-pink-200'; }
                                else if (p === 'audio_speech' || p === 'tts') { label = '🔊 TTS'; colorClass = 'bg-cyan-50 text-cyan-700 border border-cyan-200'; }
                                else if (p === 'audio_transcription' || p === 'stt') { label = '🎙️ STT'; colorClass = 'bg-teal-50 text-teal-700 border border-teal-200'; }
                                else if (p === 'videos' || p === 'video_generation') { label = '🎬 视频'; colorClass = 'bg-purple-50 text-purple-700 border border-purple-200'; }
                                return (
                                  <span key={p} className={`px-2 py-0.5 rounded text-[11px] font-medium ${colorClass}`}>
                                    {label}
                                  </span>
                                );
                              })
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
                            {ch.model_mapping && Object.keys(ch.model_mapping).length > 0 && (
                              Object.entries(ch.model_mapping).map(([k, v]) => (
                                <span key={k} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-mono border border-emerald-200" title={`级联映射: ${k} -> ${v}`}>
                                  🔗 {k} → {v}
                                </span>
                              ))
                            )}
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

          {/* 4. MULTIMODAL PLAYGROUND TAB */}
          {currentTab === 'playground' && (
            <div className="space-y-4">
              {/* Modality Selector Bar */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-2 shadow-xs flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPlayModality('chat')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    playModality === 'chat'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>💬 文本与对话 (Chat)</span>
                </button>

                <button
                  onClick={() => setPlayModality('images')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    playModality === 'images'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>🎨 AI 生图 (Images)</span>
                </button>

                <button
                  onClick={() => setPlayModality('audio_speech')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    playModality === 'audio_speech'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Volume2 className="w-4 h-4" />
                  <span>🔊 语音合成 (TTS)</span>
                </button>

                <button
                  onClick={() => setPlayModality('audio_transcription')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    playModality === 'audio_transcription'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>🎙️ 语音识别 (STT)</span>
                </button>

                <button
                  onClick={() => setPlayModality('videos')}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    playModality === 'videos'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Video className="w-4 h-4" />
                  <span>🎬 视频生成 (Videos)</span>
                </button>
              </div>

              {/* Modality Layout: Controls + Output */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Modality Controls */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>
                        {playModality === 'chat' && '对话协议参数'}
                        {playModality === 'images' && '生图引擎参数 (/v1/images)'}
                        {playModality === 'audio_speech' && '语音合成参数 (/v1/audio/speech)'}
                        {playModality === 'audio_transcription' && '语音识别参数 (/v1/audio/transcriptions)'}
                        {playModality === 'videos' && '视频生成参数 (/v1/videos)'}
                      </span>
                    </h3>
                    <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-mono">Live</span>
                  </div>

                  {/* Common: Virtual Key input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">客户端虚拟 API Key (可选)</label>
                    <input
                      type="text"
                      value={playApiKey}
                      onChange={(e) => setPlayApiKey(e.target.value)}
                      placeholder="sk-gw-xxxx (留空使用网关免密直通)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                    />
                  </div>

                  {/* 1. CHAT CONTROLS */}
                  {playModality === 'chat' && (
                    <>
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
                    </>
                  )}

                  {/* 2. IMAGE CONTROLS */}
                  {playModality === 'images' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">生图模型标识 (Model)</label>
                        <input
                          value={imgModel}
                          onChange={(e) => setImgModel(e.target.value)}
                          placeholder="dall-e-3, flux-schnell, stable-diffusion-3"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-pink-500 focus:bg-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">分辨率 (Size)</label>
                          <select
                            value={imgSize}
                            onChange={(e) => setImgSize(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-pink-500 focus:bg-white"
                          >
                            <option value="1024x1024">1024x1024 (方形)</option>
                            <option value="1792x1024">1792x1024 (横屏)</option>
                            <option value="1024x1792">1024x1792 (竖屏)</option>
                            <option value="512x512">512x512 (快速)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">画质 (Quality)</label>
                          <select
                            value={imgQuality}
                            onChange={(e) => setImgQuality(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-pink-500 focus:bg-white"
                          >
                            <option value="standard">standard (标准)</option>
                            <option value="hd">hd (高清渲染)</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {/* 3. TTS CONTROLS */}
                  {playModality === 'audio_speech' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">TTS 模型标识</label>
                        <input
                          value={ttsModel}
                          onChange={(e) => setTtsModel(e.target.value)}
                          placeholder="tts-1 或 tts-1-hd"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-cyan-500 focus:bg-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">音色 (Voice)</label>
                          <select
                            value={ttsVoice}
                            onChange={(e) => setTtsVoice(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-cyan-500 focus:bg-white"
                          >
                            <option value="alloy">alloy (自然中性)</option>
                            <option value="echo">echo (温和男声)</option>
                            <option value="fable">fable (英伦叙事)</option>
                            <option value="onyx">onyx (沉稳深邃)</option>
                            <option value="nova">nova (活泼清亮)</option>
                            <option value="shimmer">shimmer (清晰柔和)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">语速 (Speed: {ttsSpeed}x)</label>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={ttsSpeed}
                            onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                            className="w-full mt-2 accent-cyan-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* 4. STT CONTROLS */}
                  {playModality === 'audio_transcription' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Whisper 识别模型</label>
                        <input
                          value={sttModel}
                          onChange={(e) => setSttModel(e.target.value)}
                          placeholder="whisper-1"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">选择录音 / 音频文件 (MP3, WAV, M4A)</label>
                        <input
                          type="file"
                          accept="audio/*,.mp3,.wav,.m4a,.webm"
                          onChange={(e) => setSttFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer border border-slate-200 rounded-xl p-2 bg-slate-50"
                        />
                      </div>
                    </>
                  )}

                  {/* 5. VIDEO CONTROLS */}
                  {playModality === 'videos' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">视频生成模型标识</label>
                        <input
                          value={videoModel}
                          onChange={(e) => setVideoModel(e.target.value)}
                          placeholder="sora, cogvideox, kling"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">视频画面比例 (Aspect Ratio)</label>
                        <select
                          value={videoAspectRatio}
                          onChange={(e) => setVideoAspectRatio(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white"
                        >
                          <option value="16:9">16:9 (横屏电影感)</option>
                          <option value="9:16">9:16 (竖屏短视频)</option>
                          <option value="1:1">1:1 (方形)</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* Telemetry Footer */}
                  <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-2">
                    {playModality === 'chat' && (
                      <div className="flex justify-between">
                        <span>首字延迟 (TTFT):</span>
                        <span className="font-mono font-bold text-amber-600">{playTTFTMs ? `${playTTFTMs} ms` : '-'}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>总执行耗时:</span>
                      <span className="font-mono font-bold text-indigo-600">{playDurationMs ? `${playDurationMs} ms` : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Interactive Result & Output View */}
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 flex flex-col h-[650px] shadow-xs">
                  {/* Result Body */}
                  <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-xl border border-slate-200 leading-relaxed bg-slate-50/60">
                    {/* Chat Result */}
                    {playModality === 'chat' && (
                      <div className="font-mono text-sm whitespace-pre-wrap text-slate-800">
                        {playOutput || (
                          <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                            <Sparkles className="w-8 h-8 text-indigo-400 stroke-1" />
                            <span>在下方输入提示词，点击发送验证跨协议流式分发</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image Result */}
                    {playModality === 'images' && (
                      <div className="h-full flex flex-col items-center justify-center">
                        {imgResult ? (
                          <div className="flex flex-col items-center space-y-3 w-full">
                            <div className="relative group max-h-[400px] overflow-hidden rounded-xl border border-slate-200 shadow-md bg-black">
                              <img
                                src={imgResult.url || `data:image/png;base64,${imgResult.b64_json}`}
                                alt="Generated"
                                className="max-h-[380px] w-auto object-contain mx-auto"
                              />
                            </div>
                            <div className="flex items-center space-x-3">
                              <a
                                href={imgResult.url || `data:image/png;base64,${imgResult.b64_json}`}
                                download="nano-gateway-generated.png"
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>下载高清原图</span>
                              </a>
                              {imgResult.revised_prompt && (
                                <span className="text-xs text-slate-500 max-w-sm truncate" title={imgResult.revised_prompt}>
                                  Prompt: {imgResult.revised_prompt}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                            <ImageIcon className="w-8 h-8 text-pink-400 stroke-1" />
                            <span>输入生图提示词，点击「生成图片」预览 AI 绘图结果</span>
                          </div>
                        )}
                        {playOutput && (
                          <details className="w-full mt-4 text-xs font-mono bg-white p-3 rounded-xl border border-slate-200">
                            <summary className="cursor-pointer text-slate-500 font-semibold">查看接口完整 JSON 响应</summary>
                            <pre className="mt-2 text-slate-700 whitespace-pre-wrap">{playOutput}</pre>
                          </details>
                        )}
                      </div>
                    )}

                    {/* TTS Result */}
                    {playModality === 'audio_speech' && (
                      <div className="h-full flex flex-col items-center justify-center">
                        {ttsAudioUrl ? (
                          <div className="w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center space-y-4">
                            <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto text-cyan-600">
                              <Volume2 className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-900">语音合成就绪</h4>
                              <p className="text-xs text-slate-500 mt-1 font-mono">模型: {ttsModel} · 音色: {ttsVoice}</p>
                            </div>
                            <audio controls autoPlay src={ttsAudioUrl} className="w-full" />
                            <a
                              href={ttsAudioUrl}
                              download="nano-gateway-speech.mp3"
                              className="inline-flex items-center space-x-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>下载 MP3 音频文件</span>
                            </a>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                            <Volume2 className="w-8 h-8 text-cyan-400 stroke-1" />
                            <span>输入文本内容，点击「合成语音」直接在浏览器内试听</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STT Result */}
                    {playModality === 'audio_transcription' && (
                      <div className="h-full flex flex-col justify-between">
                        {sttResult ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">识别转写结果:</span>
                              <button
                                onClick={() => copyToClipboard(sttResult)}
                                className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-xs font-medium flex items-center space-x-1"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>复制文本</span>
                              </button>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-slate-900 font-sans leading-relaxed text-sm whitespace-pre-wrap">
                              {sttResult}
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                            <Mic className="w-8 h-8 text-teal-400 stroke-1" />
                            <span>在左侧选择音频文件，点击「开始语音识别」查看文字转录</span>
                          </div>
                        )}
                        {playOutput && (
                          <details className="w-full mt-4 text-xs font-mono bg-white p-3 rounded-xl border border-slate-200">
                            <summary className="cursor-pointer text-slate-500 font-semibold">查看 Whisper JSON 响应</summary>
                            <pre className="mt-2 text-slate-700 whitespace-pre-wrap">{playOutput}</pre>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Video Result */}
                    {playModality === 'videos' && (
                      <div className="h-full flex flex-col items-center justify-center">
                        {videoTaskStatus ? (
                          <div className="w-full max-w-lg bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <span className="text-xs font-mono text-slate-500">Task: {videoTaskId || '创建中...'}</span>
                              <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-semibold ${
                                videoTaskStatus === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : videoTaskStatus === 'FAILED'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200 animate-pulse'
                              }`}>
                                {videoTaskStatus} {videoPollCount > 0 && `(轮询: ${videoPollCount})`}
                              </span>
                            </div>

                            {videoResultUrl ? (
                              <div className="space-y-3">
                                <video controls autoPlay src={videoResultUrl} className="w-full rounded-xl max-h-[320px] bg-black" />
                                <a
                                  href={videoResultUrl}
                                  download="nano-gateway-video.mp4"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>下载视频</span>
                                </a>
                              </div>
                            ) : (
                              <div className="py-8 flex flex-col items-center space-y-2">
                                <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                                <p className="text-sm font-semibold text-slate-700">正在生成视频中，网关正在自动轮询任务状态...</p>
                                <span className="text-xs text-slate-400">视频生成通常耗时数秒至数十秒</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center py-32 font-sans flex flex-col items-center justify-center space-y-2">
                            <Video className="w-8 h-8 text-purple-400 stroke-1" />
                            <span>输入视频描述词，点击「生成视频」并自动轮询完成渲染</span>
                          </div>
                        )}
                        {playOutput && (
                          <details className="w-full mt-4 text-xs font-mono bg-white p-3 rounded-xl border border-slate-200">
                            <summary className="cursor-pointer text-slate-500 font-semibold">查看任务详情 JSON</summary>
                            <pre className="mt-2 text-slate-700 whitespace-pre-wrap">{playOutput}</pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Input & Action Bar */}
                  <div className="pt-4 flex space-x-3">
                    {playModality === 'chat' && (
                      <>
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
                      </>
                    )}

                    {playModality === 'images' && (
                      <>
                        <textarea
                          rows={2}
                          value={imgPrompt}
                          onChange={(e) => setImgPrompt(e.target.value)}
                          placeholder="输入画面描述词 Prompt..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-pink-500 focus:bg-white resize-none"
                        />
                        <button
                          onClick={handleGenerateImage}
                          disabled={playLoading}
                          className="px-6 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
                        >
                          {playLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                          <span>生成图片</span>
                        </button>
                      </>
                    )}

                    {playModality === 'audio_speech' && (
                      <>
                        <textarea
                          rows={2}
                          value={ttsInput}
                          onChange={(e) => setTtsInput(e.target.value)}
                          placeholder="输入要转成语音的文本内容..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-cyan-500 focus:bg-white resize-none"
                        />
                        <button
                          onClick={handleGenerateSpeech}
                          disabled={playLoading}
                          className="px-6 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
                        >
                          {playLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                          <span>合成语音</span>
                        </button>
                      </>
                    )}

                    {playModality === 'audio_transcription' && (
                      <button
                        onClick={handleTranscribeAudio}
                        disabled={playLoading || !sttFile}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
                      >
                        {playLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                        <span>开始语音识别并转录</span>
                      </button>
                    )}

                    {playModality === 'videos' && (
                      <>
                        <textarea
                          rows={2}
                          value={videoPrompt}
                          onChange={(e) => setVideoPrompt(e.target.value)}
                          placeholder="输入视频场景描述词 Prompt..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white resize-none"
                        />
                        <button
                          onClick={handleGenerateVideo}
                          disabled={playLoading}
                          className="px-6 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
                        >
                          {playLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                          <span>创建视频任务</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal: New Provider */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <form onSubmit={handleCreateChannel} className="bg-white border border-slate-200 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">新建模型提供商 (Provider)</h3>
                <p className="text-xs text-slate-500">统一接入上游模型服务，支持全模态协议选择与级联映射</p>
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
                  placeholder="gpt-4o, claude-3-5-sonnet, dall-e-3, tts-1, whisper-1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  级联模型别名映射 (可选，例如: yy/xxx/xx:xxx/xx, my-org/*:*)
                </label>
                <input
                  value={newChannel.mapping_str}
                  onChange={(e) => setNewChannel({ ...newChannel, mapping_str: e.target.value })}
                  placeholder="yy/xxx/xx:xxx/xx, dept/*:*"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">支持任意斜杠深度的级联映射与前缀通配重写</span>
              </div>

              {/* Supported Protocols selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">下游开放支持协议与模态 (多选)</label>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('openai_chat')}
                      onChange={() => toggleProtocol('openai_chat')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>💬 OpenAI Chat (/v1/chat/completions)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('openai_text')}
                      onChange={() => toggleProtocol('openai_text')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>📝 OpenAI Text (/v1/completions)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('anthropic_messages')}
                      onChange={() => toggleProtocol('anthropic_messages')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>🧠 Anthropic Claude (/v1/messages)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('images')}
                      onChange={() => toggleProtocol('images')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>🎨 AI 生图 (/v1/images/generations)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('audio_speech')}
                      onChange={() => toggleProtocol('audio_speech')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>🔊 语音合成 TTS (/v1/audio/speech)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('audio_transcription')}
                      onChange={() => toggleProtocol('audio_transcription')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>🎙️ 语音识别 STT (/v1/audio/transcriptions)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100 col-span-2">
                    <input
                      type="checkbox"
                      checked={newChannel.protocols.includes('videos')}
                      onChange={() => toggleProtocol('videos')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>🎬 视频生成与轮询 (/v1/videos/generations & tasks)</span>
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
