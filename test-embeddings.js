const OpenAI = require('openai');

// Cliente Ollama
const openaiEmbeddings = new OpenAI({
  apiKey: 'ollama',
  baseURL: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434/v1',
});

const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large';

async function test() {
  console.log('Probando conexión a Ollama...');
  console.log('URL:', process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434/v1');
  console.log('Modelo:', EMBEDDING_MODEL);
  
  try {
    const response = await openaiEmbeddings.embeddings.create({
      model: EMBEDDING_MODEL,
      input: 'Producto de prueba para embeddings',
    });
    
    const embedding = response.data[0].embedding;
    console.log('✅ Embedding generado exitosamente');
    console.log('Dimensiones:', embedding.length);
    console.log('Primeros 5 valores:', embedding.slice(0, 5));
    
    if (embedding.length === 1024) {
      console.log('✅ Dimensiones correctas (1024)');
    } else {
      console.log(`⚠️  Dimensiones inesperadas: ${embedding.length} (se esperaban 1024)`);
    }
  } catch (error) {
    console.error('❌ Error generando embedding:', error.message);
    process.exit(1);
  }
}

// Cargar variables de entorno desde .env si existe
require('dotenv').config({ path: '.env' });

test();