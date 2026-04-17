const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;

admin.initializeApp();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Cloud Function para processar upload de PDF/Imagens
 * Extrai dados financeiros usando Claude Vision
 */
exports.processarUploadCarteira = functions.https.onCall(async (data, context) => {
  // Verificar autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuário não autenticado'
    );
  }

  const { base64, fileType, clienteId } = data;

  if (!base64 || !fileType || !clienteId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Parâmetros inválidos: base64, fileType e clienteId são obrigatórios'
    );
  }

  try {
    const isPDF = fileType === 'application/pdf';
    const isImage = fileType.startsWith('image/');

    if (!isPDF && !isImage) {
      throw new Error('Tipo de arquivo não suportado. Use PDF ou imagem.');
    }

    // Montar content para Claude
    const content = [];

    if (isPDF || isImage) {
      content.push({
        type: isPDF ? 'document' : 'image',
        source: {
          type: 'base64',
          media_type: fileType,
          data: base64
        }
      });
    }

    content.push({
      type: 'text',
      text: `Você é um especialista em extrair dados financeiros de documentos de investimentos brasileiros.

Analise este documento e extraia os seguintes dados no formato JSON:
{
  "posFixado": <valor em reais como número, ex: 150000>,
  "ipca": <valor em reais>,
  "preFixado": <valor em reais>,
  "fiis": <valor em reais>,
  "multi": <valor em reais>,
  "acoes": <valor em reais>,
  "global": <valor em reais>,
  "rentabilidade": <rentabilidade % no ano se disponível, como número>,
  "aporteMes": <se houver registro de aporte no mês, o valor em reais, senão 0>,
  "liquidezD1": <total de ativos com liquidez d+1 em reais>
}

Classes de ativos:
- posFixado: CDB, LCI, LCA, Tesouro Selic, pós-fixados em geral
- ipca: Tesouro IPCA, debêntures IPCA+, NTN-B
- preFixado: Tesouro Prefixado, CDB prefixado, NTN-F
- fiis: Fundos Imobiliários, FIIs
- multi: Fundos multimercado, hedge funds
- acoes: Ações, ETFs de renda variável
- global: Ativos internacionais, BDRs, ETFs internacionais, fundos cambiais

Se um campo não existir no documento, coloque 0.
Responda APENAS com o JSON, sem texto adicional.`
    });

    // Chamar Claude API com segurança (via Cloud Function)
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: content
        }
      ]
    });

    const texto = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const clean = texto.replace(/```json|```/g, '').trim();
    const extraido = JSON.parse(clean);

    return {
      success: true,
      dados: extraido,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Erro ao processar upload:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erro ao processar arquivo: ' + error.message
    );
  }
});
