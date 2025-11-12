import React, { useState, useEffect, useRef } from 'react';
import { Send, Package, Clock, AlertCircle, CheckCircle, XCircle, Mail, Paperclip, X, Upload } from 'lucide-react';

const OrderControlChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState({});
  const [conversationHistory, setConversationHistory] = useState([]);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', files: [] });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [lastRegisteredOrder, setLastRegisteredOrder] = useState(null);
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
    loadOrders();
    const welcomeMsg = {
      type: 'bot',
      content: '👋 Olá! Estou aqui para ajudar a registrar seus pedidos.\n\nVocê pode me falar sobre um pedido de forma natural, e eu vou te guiar. Pode começar dizendo o site, ou me contar tudo de uma vez!\nSite:\nDU:\nProjeto:\nMotivo: ',
      timestamp: new Date().toISOString()
    };
    setMessages([welcomeMsg]);
  }, []);

  const loadOrders = async () => {
    try {
      const result = await window.storage.list('order:');
      if (result && result.keys) {
        const orderPromises = result.keys.map(key => window.storage.get(key));
        const orderResults = await Promise.all(orderPromises);
        const loadedOrders = orderResults
          .filter(r => r && r.value)
          .map(r => JSON.parse(r.value))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setOrders(loadedOrders);
      }
    } catch (error) {
      console.log('Nenhum pedido anterior encontrado');
    }
  };

  const saveOrder = async (order) => {
    try {
      await window.storage.set(`order:${order.id}`, JSON.stringify(order));
    } catch (error) {
      console.error('Erro ao salvar pedido:', error);
    }
  };

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
      alert('Por favor, digite pelo menos um email!');
      return;
    }

    setSendingEmail(true);
    
    try {
      // Converter arquivos para base64
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

      // Chamar API de envio de email (você vai criar isso na Vercel)
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

      if (!response.ok) throw new Error('Erro ao enviar email');

      const botMessage = {
        type: 'bot',
        content: `✅ Email enviado com sucesso para: ${emailData.to}\n\n📎 ${emailData.files.length} arquivo(s) anexado(s)\n\n💬 Precisa registrar outro pedido?`,
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

      const systemPrompt = `Você é um assistente que ajuda a coletar informações de pedidos de forma conversacional e natural.

INFORMAÇÕES NECESSÁRIAS para um pedido completo:
- site (código do site)
- du (número da DU)
- projeto (código do projeto)
- motivo (descrição do problema/motivo)

SUAS REGRAS:
1. Analise a mensagem do usuário e extraia TODAS as informações que ele mencionou
2. Se o usuário forneceu TODAS as 4 informações necessárias, retorne JSON:
   {"action": "complete", "data": {"site": "...", "du": "...", "projeto": "...", "motivo": "..."}}
3. Se faltam informações, retorne JSON:
   {"action": "ask", "message": "sua pergunta amigável aqui", "extracted": {"campo": "valor"}}
4. Seja conversacional, amigável e direto
5. Faça UMA pergunta por vez sobre o que está faltando
6. Se o usuário disse "não tem" ou similar para algum campo, aceite como "N/A"

${orderContext}

Analise a nova mensagem e responda APENAS com JSON válido, sem markdown.`;

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

      if (!response.ok) {
        throw new Error('Erro na API do Groq.');
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const aiResponse = JSON.parse(jsonMatch[0]);
        
        if (aiResponse.action === 'complete') {
          const order = {
            ...aiResponse.data,
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            status: 'pendente'
          };
          
          const newOrders = [order, ...orders];
          setOrders(newOrders);
          await saveOrder(order);
          setLastRegisteredOrder(order);
          
          const botMessage = {
            type: 'bot',
            content: `✅ Perfeito! Pedido registrado com sucesso!\n\n📦 Site: ${order.site}\n🔖 DU: ${order.du}\n📋 Projeto: ${order.projeto}\n⚠️ Motivo: ${order.motivo}\n\n📧 Deseja enviar um email com evidências?`,
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
      console.error('Erro ao processar:', error);
      const errorMsg = {
        type: 'bot',
        content: '❌ Desculpe, tive um problema ao processar. Pode tentar novamente?\n\n' + error.message,
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

  const updateOrderStatus = async (orderId, newStatus) => {
    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        const updated = { ...order, status: newStatus };
        saveOrder(updated);
        return updated;
      }
      return order;
    });
    setOrders(updatedOrders);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'concluído':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'cancelado':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'concluído':
        return 'bg-green-100 text-green-800';
      case 'cancelado':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

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
        <div className="bg-blue-600 text-white p-4 shadow-lg">
          <h1 className="text-xl font-bold">Chat Conversacional de Pedidos</h1>
          <p className="text-sm text-blue-100">🟢 Sistema pronto para uso</p>
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
              placeholder="Digite sua mensagem..."
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
        </div>
      </div>

      {/* Orders Panel */}
      <div className="w-96 bg-white border-l overflow-y-auto">
        <div className="sticky top-0 bg-gray-50 p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800 flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Pedidos ({orders.length})
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
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                  
                  <select
                    value={order.status}
                    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em andamento">Em Andamento</option>
                    <option value="concluído">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div className="text-xs text-gray-400 mt-2">
                  {new Date(order.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderControlChat;