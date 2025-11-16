import React, { useState, useEffect, useRef } from 'react';
import { Send, Package, Clock, AlertCircle, CheckCircle, XCircle, Mail, Paperclip, X, Upload, LogOut, User, Users, Edit } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Configuração Supabase
const supabaseUrl = 'https://fcoyferymbeqdlwyhkum.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjb3lmZXJ5bWJlcWRsd3loa3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMTgyNDgsImV4cCI6MjA3ODg5NDI0OH0.21Jjz3y4S-zWPV7vZuetWTm_FweN8MY7L5X1utMeO60';
const supabase = createClient(supabaseUrl, supabaseKey);

const SistemaPedidos = () => {
  // Estados gerais
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('login');
  
  // Estados de login/cadastro
  const [loginData, setLoginData] = useState({ login: '', senha: '' });
  const [cadastroData, setCadastroData] = useState({ nome: '', login: '', senha: '', tipo: 'solicitante' });
  const [showCadastro, setShowCadastro] = useState(false);
  
  // Estados do chat
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState({});
  const [conversationHistory, setConversationHistory] = useState([]);
  
  // Estados de email
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', files: [] });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [lastRegisteredOrder, setLastRegisteredOrder] = useState(null);
  
  // Estados painel operador
  const [pedidosPendentes, setPedidosPendentes] = useState([]);
  const [editingVO, setEditingVO] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (currentUser && view === 'chat') {
      loadOrders();
      const welcomeMsg = {
        type: 'bot',
        content: `👋 Olá ${currentUser.nome}! Estou aqui para ajudar a registrar seus pedidos.\n\nVocê pode me falar sobre um pedido de forma natural. Pode começar!`,
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
    }
  }, [currentUser, view]);

  useEffect(() => {
    if (currentUser && view === 'painel') {
      loadPedidosPendentes();
    }
  }, [currentUser, view]);

  // ========== AUTENTICAÇÃO ==========
  
  const handleLogin = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('login', loginData.login)
        .eq('senha', loginData.senha)
        .single();

      if (error || !data) {
        alert('Login ou senha incorretos!');
        return;
      }

      setCurrentUser(data);
      setView(data.tipo === 'operador' ? 'painel' : 'chat');
      setLoginData({ login: '', senha: '' });
    } catch (error) {
      alert('Erro ao fazer login: ' + error.message);
    }
  };

  const handleCadastro = async () => {
    if (!cadastroData.nome || !cadastroData.login || !cadastroData.senha) {
      alert('Preencha todos os campos!');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .insert([cadastroData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Login já existe! Escolha outro.');
        } else {
          alert('Erro ao cadastrar: ' + error.message);
        }
        return;
      }

      alert('Cadastro realizado com sucesso!');
      setShowCadastro(false);
      setCadastroData({ nome: '', login: '', senha: '', tipo: 'solicitante' });
    } catch (error) {
      alert('Erro: ' + error.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('login');
    setMessages([]);
    setOrders([]);
    setPedidosPendentes([]);
  };

  // ========== PEDIDOS ==========
  
  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Erro ao carregar pedidos:', error);
    }
  };

  const loadPedidosPendentes = async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .in('status', ['pendente', 'em andamento'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPedidosPendentes(data || []);
    } catch (error) {
      console.error('Erro ao carregar pedidos pendentes:', error);
    }
  };

  const savePedido = async (pedido) => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .insert([pedido])
        .select()
        .single();

      if (error) throw error;
      await loadOrders();
      return data;
    } catch (error) {
      console.error('Erro ao salvar pedido:', error);
      throw error;
    }
  };

  const updatePedidoStatus = async (pedidoId, updates) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update(updates)
        .eq('id', pedidoId);

      if (error) throw error;
      
      if (view === 'chat') {
        await loadOrders();
      } else {
        await loadPedidosPendentes();
      }
    } catch (error) {
      console.error('Erro ao atualizar pedido:', error);
    }
  };

  // ========== CHAT E IA ==========
  
  const processConversation = async (userMessage) => {
    if (!GROQ_API_KEY) {
      const errorMsg = {
        type: 'bot',
        content: '⚠️ Sistema não configurado. Entre em contato com o administrador.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    // Verifica se é uma consulta de VO
    if (userMessage.toLowerCase().includes('vo') && userMessage.toLowerCase().includes('site')) {
      await handleConsultaVO(userMessage);
      return;
    }

    setLoading(true);
    
    try {
      const newHistory = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      const orderContext = `
Pedido atual em construção:
${currentOrder.site ? `✅ Site: ${currentOrder.site}` : '❌ Site: (não informado)'}
${currentOrder.du ? `✅ DU: ${currentOrder.du}` : '❌ DU: (não informado)'}
${currentOrder.projeto ? `✅ Projeto: ${currentOrder.projeto}` : '❌ Projeto: (não informado)'}
${currentOrder.motivo ? `✅ Motivo: ${currentOrder.motivo}` : '❌ Motivo: (não informado)'}
`;

      const systemPrompt = `Você é um assistente que ajuda a coletar informações de pedidos de forma conversacional.

INFORMAÇÕES NECESSÁRIAS:
- site (código do site)
- du (número da DU)
- projeto (código do projeto)
- motivo (descrição do problema)

REGRAS:
1. Se o usuário forneceu TODAS as 4 informações, retorne: {"action": "complete", "data": {"site": "...", "du": "...", "projeto": "...", "motivo": "..."}}
2. Se faltam informações, retorne: {"action": "ask", "message": "sua pergunta", "extracted": {"campo": "valor"}}
3. Seja amigável e faça UMA pergunta por vez

${orderContext}

Responda APENAS com JSON válido.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...newHistory
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!response.ok) throw new Error('Erro na API do Groq.');

      const data = await response.json();
      const content = data.choices[0].message.content;
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const aiResponse = JSON.parse(jsonMatch[0]);
        
        if (aiResponse.action === 'complete') {
          const pedido = {
            ...aiResponse.data,
            status: 'pendente',
            solicitante: currentUser.nome,
            id_vo: null,
            operador: null
          };
          
          const savedPedido = await savePedido(pedido);
          setLastRegisteredOrder(savedPedido);
          
          const botMessage = {
            type: 'bot',
            content: `✅ Pedido registrado!\n\n📦 Site: ${pedido.site}\n🔖 DU: ${pedido.du}\n📋 Projeto: ${pedido.projeto}\n⚠️ Motivo: ${pedido.motivo}\n👤 Solicitante: ${pedido.solicitante}\n\n📧 Deseja enviar email com evidências?`,
            timestamp: new Date().toISOString(),
            showEmailButton: true
          };
          setMessages(prev => [...prev, botMessage]);
          
          setCurrentOrder({});
          setConversationHistory([]);
          
        } else if (aiResponse.action === 'ask') {
          if (aiResponse.extracted) {
            setCurrentOrder(prev => ({ ...prev, ...aiResponse.extracted }));
          }
          
          const botMessage = {
            type: 'bot',
            content: aiResponse.message,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, botMessage]);
          
          setConversationHistory([
            ...newHistory,
            { role: 'assistant', content: content }
          ]);
        }
      }
    } catch (error) {
      console.error('Erro:', error);
      const errorMsg = {
        type: 'bot',
        content: '❌ Erro ao processar. Tente novamente.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleConsultaVO = async (userMessage) => {
    setLoading(true);
    try {
      // Extrai o nome do site da mensagem
      const siteMatch = userMessage.match(/site\s+(\w+)/i);
      if (!siteMatch) {
        const botMessage = {
          type: 'bot',
          content: '❌ Não consegui identificar o site. Tente: "Como está a VO do site PEACV06?"',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, botMessage]);
        setLoading(false);
        return;
      }

      const site = siteMatch[1];

      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('site', site)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        const botMessage = {
          type: 'bot',
          content: `📦 Nenhum pedido encontrado para o site ${site}.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        let response = `📦 Site ${site} - ${data.length} pedido(s) encontrado(s):\n\n`;
        
        data.forEach((pedido, index) => {
          const statusIcon = pedido.status === 'concluído' ? '✅' : 
                           pedido.status === 'em andamento' ? '⏳' :
                           pedido.status === 'cancelado' ? '❌' : '⏸️';
          
          response += `${index + 1}. ${statusIcon} ${pedido.status.toUpperCase()}\n`;
          response += `   VO: ${pedido.id_vo || 'Aguardando processamento'}\n`;
          response += `   DU: ${pedido.du}\n`;
          response += `   Projeto: ${pedido.projeto}\n`;
          response += `   Motivo: ${pedido.motivo}\n`;
          response += `   Solicitante: ${pedido.solicitante}\n`;
          response += `   Data: ${new Date(pedido.created_at).toLocaleString('pt-BR')}\n\n`;
        });

        const botMessage = {
          type: 'bot',
          content: response,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error('Erro:', error);
      const errorMsg = {
        type: 'bot',
        content: '❌ Erro ao consultar pedidos.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      type: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');

    await processConversation(currentInput);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ========== EMAIL ==========
  
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setEmailData(prev => ({
      ...prev,
      files: [...prev.files, ...files]
    }));
  };

  const removeFile = (index) => {
    setEmailData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const sendEmail = async () => {
    if (!emailData.to.trim()) {
      alert('Digite pelo menos um email!');
      return;
    }

    setSendingEmail(true);
    
    try {
      const filesBase64 = await Promise.all(
        emailData.files.map(async (file) => {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          return {
            filename: file.name,
            content: base64,
            type: file.type
          };
        })
      );

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailData.to.split(',').map(e => e.trim()),
          subject: `[CHECKPOINT] - ${lastRegisteredOrder.site} - ${lastRegisteredOrder.du} - ${lastRegisteredOrder.motivo}`,
          order: lastRegisteredOrder,
          attachments: filesBase64
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const botMessage = {
        type: 'bot',
        content: `✅ Email enviado para: ${emailData.to}\n📎 ${emailData.files.length} arquivo(s) anexado(s)`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, botMessage]);

      setShowEmailModal(false);
      setEmailData({ to: '', files: [] });
      setLastRegisteredOrder(null);

    } catch (error) {
      alert('Erro ao enviar email: ' + error.message);
    } finally {
      setSendingEmail(false);
    }
  };

  // ========== UI HELPERS ==========
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'concluído': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'cancelado': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'concluído': return 'bg-green-100 text-green-800';
      case 'cancelado': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  // ========== RENDERIZAÇÃO ==========
  
  if (view === 'login') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          {!showCadastro ? (
            <>
              <div className="text-center mb-8">
                <Package className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                <h1 className="text-3xl font-bold text-gray-800">Sistema de Pedidos</h1>
                <p className="text-gray-600 mt-2">Faça login para continuar</p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Login"
                  value={loginData.login}
                  onChange={(e) => setLoginData({ ...loginData, login: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <input
                  type="password"
                  placeholder="Senha"
                  value={loginData.senha}
                  onChange={(e) => setLoginData({ ...loginData, senha: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  onClick={handleLogin}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Entrar
                </button>

                <button
                  onClick={() => setShowCadastro(true)}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Criar Conta
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <User className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                <h1 className="text-3xl font-bold text-gray-800">Criar Conta</h1>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={cadastroData.nome}
                  onChange={(e) => setCadastroData({ ...cadastroData, nome: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <input
                  type="text"
                  placeholder="Login (usuário)"
                  value={cadastroData.login}
                  onChange={(e) => setCadastroData({ ...cadastroData, login: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <input
                  type="password"
                  placeholder="Senha"
                  value={cadastroData.senha}
                  onChange={(e) => setCadastroData({ ...cadastroData, senha: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <select
                  value={cadastroData.tipo}
                  onChange={(e) => setCadastroData({ ...cadastroData, tipo: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="solicitante">Solicitante</option>
                  <option value="operador">Operador</option>
                </select>

                <button
                  onClick={handleCadastro}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Cadastrar
                </button>

                <button
                  onClick={() => setShowCadastro(false)}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (view === 'painel') {
    return (
      <div className="flex h-screen bg-gray-100">
        <div className="flex-1 flex flex-col">
          <div className="bg-purple-600 text-white p-4 shadow-lg flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Painel do Operador</h1>
              <p className="text-sm text-purple-100">Bem-vindo, {currentUser.nome}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Pedidos Pendentes ({pedidosPendentes.length})</h2>

            {pedidosPendentes.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg">Nenhum pedido pendente</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pedidosPendentes.map((pedido) => (
                  <div key={pedido.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">{pedido.site}</h3>
                        <p className="text-sm text-gray-500">Solicitado por: {pedido.solicitante}</p>
                        <p className="text-xs text-gray-400">{new Date(pedido.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(pedido.status)}`}>
                        {pedido.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <span className="text-sm font-medium text-gray-600">DU:</span>
                        <p className="text-gray-800">{pedido.du}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Projeto:</span>
                        <p className="text-gray-800">{pedido.projeto}</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <span className="text-sm font-medium text-gray-600">Motivo:</span>
                      <p className="text-gray-800">{pedido.motivo}</p>
                    </div>

                    <div className="border-t pt-4 space-y-3">
                      <div className="flex gap-3">
                        <input
                          type="text"
                          placeholder="Digite o ID da VO"
                          value={editingVO === pedido.id ? pedido.id_vo || '' : pedido.id_vo || 'Não preenchido'}
                          onChange={(e) => {
                            if (editingVO === pedido.id) {
                              setPedidosPendentes(prev => 
                                prev.map(p => p.id === pedido.id ? { ...p, id_vo: e.target.value } : p)
                              );
                            }
                          }}
                          onFocus={() => setEditingVO(pedido.id)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <select
                          value={pedido.status}
                          onChange={(e) => updatePedidoStatus(pedido.id, { 
                            status: e.target.value, 
                            operador: currentUser.nome,
                            id_vo: pedido.id_vo 
                          })}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="pendente">Pendente</option>
                          <option value="em andamento">Em Andamento</option>
                          <option value="concluído">Concluído</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>

                      {editingVO === pedido.id && (
                        <button
                          onClick={() => {
                            updatePedidoStatus(pedido.id, { 
                              id_vo: pedido.id_vo,
                              operador: currentUser.nome 
                            });
                            setEditingVO(null);
                          }}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          Salvar ID VO
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VIEW CHAT
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                  <Mail className="w-6 h-6 mr-2 text-blue-600" />
                  Enviar Email com Evidências
                </h2>
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setEmailData({ to: '', files: [] });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {lastRegisteredOrder && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <div className="text-sm font-medium text-blue-900 mb-2">Pedido a ser enviado:</div>
                  <div className="text-sm text-blue-800 space-y-1">
                    <div>📦 Site: {lastRegisteredOrder.site}</div>
                    <div>🔖 DU: {lastRegisteredOrder.du}</div>
                    <div>📋 Projeto: {lastRegisteredOrder.projeto}</div>
                    <div>⚠️ Motivo: {lastRegisteredOrder.motivo}</div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email(s) do destinatário
                  </label>
                  <input
                    type="text"
                    placeholder="email@exemplo.com ou email1@exemplo.com, email2@exemplo.com"
                    value={emailData.to}
                    onChange={(e) => setEmailData(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Separe múltiplos emails com vírgula</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Anexar Evidências (Fotos/PDFs)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center"
                  >
                    <Upload className="w-5 h-5 mr-2 text-gray-400" />
                    <span className="text-gray-600">Clique para selecionar arquivos</span>
                  </button>
                </div>

                {emailData.files.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                      Arquivos selecionados ({emailData.files.length})
                    </div>
                    {emailData.files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Paperclip className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{file.name}</span>
                          <span className="text-xs text-gray-500">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={sendEmail}
                    disabled={sendingEmail || !emailData.to.trim()}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center"
                  >
                    {sendingEmail ? (
                      <span className="animate-pulse">Enviando...</span>
                    ) : (
                      <>
                        <Mail className="w-5 h-5 mr-2" />
                        Enviar Email
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowEmailModal(false);
                      setEmailData({ to: '', files: [] });
                    }}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-blue-600 text-white p-4 shadow-lg flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Chat de Pedidos</h1>
            <p className="text-sm text-blue-100">Bem-vindo, {currentUser.nome}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx}>
              <div className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl px-4 py-3 rounded-lg ${
                  msg.type === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-800 shadow-md'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className={`text-xs mt-1 ${
                    msg.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                  </div>
                </div>
              </div>
              {msg.showEmailButton && (
                <div className="flex justify-start mt-2">
                  <button
                    onClick={() => setShowEmailModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center text-sm"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Sim, enviar email
                  </button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white px-4 py-3 rounded-lg shadow-md">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse">Pensando...</div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {Object.keys(currentOrder).length > 0 && (
          <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
            <div className="text-xs text-yellow-800 font-medium mb-1">📝 Coletando informações:</div>
            <div className="flex gap-2 text-xs">
              {currentOrder.site && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ Site</span>}
              {currentOrder.du && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ DU</span>}
              {currentOrder.projeto && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ Projeto</span>}
              {currentOrder.motivo && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ Motivo</span>}
            </div>
          </div>
        )}

        <div className="p-4 bg-white border-t">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem ou pergunte sobre VOs..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 Dica: Pergunte "Como está a VO do site PEACV06?" para consultar pedidos
          </p>
        </div>
      </div>

      {/* Orders Panel */}
      <div className="w-96 bg-white border-l overflow-y-auto">
        <div className="sticky top-0 bg-gray-50 p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Meus Pedidos ({orders.length})
          </h2>
        </div>

        <div className="p-4 space-y-3">
          {orders.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>Nenhum pedido registrado</p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-gray-800">{order.site}</div>
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(order.status)}
                  </div>
                </div>
                
                <div className="text-sm space-y-1 mb-3">
                  <div className="text-gray-600">
                    <span className="font-medium">DU:</span> {order.du}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Projeto:</span> {order.projeto}
                  </div>
                  <div className="text-gray-600 text-xs">
                    {order.motivo}
                  </div>
                  {order.id_vo && (
                    <div className="text-blue-600 font-medium text-sm">
                      VO: {order.id_vo}
                    </div>
                  )}
                  {order.operador && (
                    <div className="text-xs text-gray-500">
                      Processado por: {order.operador}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                <div className="text-xs text-gray-400 mt-2">
                  {new Date(order.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SistemaPedidos;