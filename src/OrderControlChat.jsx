import React, { useState, useEffect, useRef } from 'react';
import { Send, Package, Clock, AlertCircle, CheckCircle, XCircle, Settings, Key } from 'lucide-react';

const OrderControlChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadOrders();
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      const result = await window.storage.get('groq_api_key');
      if (result && result.value) {
        setApiKey(result.value);
      }
    } catch (error) {
      console.log('API key não encontrada');
    }
  };

  const saveApiKey = async () => {
    try {
      await window.storage.set('groq_api_key', tempApiKey);
      setApiKey(tempApiKey);
      setShowSettings(false);
      
      const welcomeMsg = {
        type: 'bot',
        content: '✅ API Key configurada com sucesso! Agora você pode começar a registrar pedidos.',
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
    } catch (error) {
      alert('Erro ao salvar API Key: ' + error.message);
    }
  };

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

  const extractOrderInfo = async (text) => {
    if (!apiKey) {
      const errorMsg = {
        type: 'bot',
        content: '⚠️ Por favor, configure sua API Key do Groq clicando no ícone de configurações.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: `Extraia as informações deste pedido e retorne APENAS um JSON válido, sem markdown, explicações ou texto adicional:

${text}

Retorne exatamente neste formato:
{
  "site": "código do site",
  "du": "número da DU",
  "projeto": "código do projeto",
  "motivo": "descrição do motivo",
  "status": "pendente"
}`
          }],
          temperature: 0.1,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error('Erro na API. Verifique sua API Key.');
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Remove markdown e extrai JSON
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const orderData = JSON.parse(jsonMatch[0]);
        const order = {
          ...orderData,
          id: Date.now().toString(),
          timestamp: new Date().toISOString()
        };
        
        const newOrders = [order, ...orders];
        setOrders(newOrders);
        await saveOrder(order);
        
        return order;
      }
    } catch (error) {
      console.error('Erro ao processar:', error);
      const errorMsg = {
        type: 'bot',
        content: '❌ Erro ao processar: ' + error.message + '\n\nVerifique se sua API Key está correta.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
      return null;
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

    setMessages([...messages, userMessage]);
    const currentInput = input;
    setInput('');

    const order = await extractOrderInfo(currentInput);

    if (order) {
      const botMessage = {
        type: 'bot',
        content: `✅ Pedido registrado com sucesso!\n\n📦 **Site:** ${order.site}\n🔖 **DU:** ${order.du}\n📋 **Projeto:** ${order.projeto}\n⚠️ **Motivo:** ${order.motivo}\n⏰ **Status:** ${order.status}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, botMessage]);
    } else if (apiKey) {
      const errorMessage = {
        type: 'bot',
        content: '❌ Não consegui processar este pedido. Tente novamente com o formato correto:\n\nSite: CODIGO\nDU: NUMERO\nProjeto: CODIGO\nMotivo: DESCRICAO',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
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

  if (showSettings) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center mb-6">
            <Key className="w-8 h-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Configurar API Key</h2>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Para usar este sistema, você precisa de uma API Key <strong>gratuita</strong> do Groq:
            </p>
            
            <ol className="text-sm text-gray-700 space-y-2 mb-4 list-decimal list-inside">
              <li>Acesse: <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.groq.com</a></li>
              <li>Crie uma conta gratuita</li>
              <li>Vá em "API Keys"</li>
              <li>Clique em "Create API Key"</li>
              <li>Cole a chave abaixo</li>
            </ol>
            
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            
            <div className="flex space-x-2">
              <button
                onClick={saveApiKey}
                disabled={!tempApiKey.trim()}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Salvar e Começar
              </button>
              
              {apiKey && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              ✅ <strong>100% Gratuito</strong> - Sem cartão de crédito necessário
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-blue-600 text-white p-4 shadow-lg flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Chat de Controle de Pedidos</h1>
            <p className="text-sm text-blue-100">
              {apiKey ? '🟢 Conectado - Sistema 100% Gratuito' : '🔴 Configure sua API Key'}
            </p>
          </div>
          <button
            onClick={() => {
              setTempApiKey(apiKey);
              setShowSettings(true);
            }}
            className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
            title="Configurações"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">
                {apiKey ? 'Nenhuma mensagem ainda' : 'Configure sua API Key para começar'}
              </p>
              <p className="text-sm">
                {apiKey ? 'Cole as informações do pedido para começar' : 'Clique no ícone de configurações acima'}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
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
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white px-4 py-3 rounded-lg shadow-md">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse">Processando com IA gratuita...</div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={apiKey ? "Cole as informações do pedido aqui..." : "Configure a API Key primeiro..."}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || !apiKey}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim() || !apiKey}
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