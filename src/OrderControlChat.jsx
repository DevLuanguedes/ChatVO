import React, { useState, useEffect, useRef } from 'react';
import { Send, Package, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const OrderControlChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState({});
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);

  // API Key configurada no backend (variável de ambiente)
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadOrders();
    // Mensagem de boas-vindas
    const welcomeMsg = {
      type: 'bot',
      content: '👋 Olá! Estou aqui para ajudar a registrar seus pedidos.\n\nVocê pode me falar sobre um pedido de forma natural, e eu vou te guiar. Pode começar dizendo o site, ou me contar tudo de uma vez!',
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

  const processConversation = async (userMessage) => {
    if (!GROQ_API_KEY || GROQ_API_KEY === 'COLOQUE_SUA_API_KEY_AQUI') {
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
          
          const botMessage = {
            type: 'bot',
            content: `✅ Perfeito! Pedido registrado com sucesso!\n\n📦 Site: ${order.site}\n🔖 DU: ${order.du}\n📋 Projeto: ${order.projeto}\n⚠️ Motivo: ${order.motivo}\n\n💬 Precisa registrar outro pedido?`,
            timestamp: new Date().toISOString()
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
      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-blue-600 text-white p-4 shadow-lg">
          <h1 className="text-xl font-bold">Chat Conversacional de Pedidos</h1>
          <p className="text-sm text-blue-100">🟢 Sistema pronto para uso</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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