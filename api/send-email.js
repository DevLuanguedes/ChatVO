import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY); // ← MUDEI AQUI

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, order, attachments } = req.body;

  try {
    await resend.emails.send({
      from: 'Pedidos <onboarding@resend.dev>', // ← MUDEI AQUI (use esse para testar)
      to: to,
      subject: subject,
      html: `
        <h2>Novo Checkpoint Registrado</h2>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>📦 Site:</strong> ${order.site}</p>
          <p><strong>🔖 DU:</strong> ${order.du}</p>
          <p><strong>📋 Projeto:</strong> ${order.projeto}</p>
          <p><strong>⚠️ Motivo:</strong> ${order.motivo}</p>
          <p><strong>⏰ Data:</strong> ${new Date(order.timestamp).toLocaleString('pt-BR')}</p>
        </div>
        <p>Evidências em anexo.</p>
      `,
      attachments: attachments.map(att => ({
        filename: att.filename,
        content: att.content
      }))
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
} // ← REMOVI A VÍRGULA AQUI