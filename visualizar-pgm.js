#!/usr/bin/env node

// visualizar-pgm.js - Visualizador de Imagens PGM
// Converte PGM para HTML com Canvas para visualização no navegador

const fs = require('fs');
const path = require('path');

/* ===== CONFIGURAÇÃO ===== */
const CONFIG = {
    // Pasta com imagens PGM para visualizar
    pastaImagens: path.join(__dirname, 'images'),
    
    // Pasta de saída para HTML
    pastaSaida: path.join(__dirname, 'visualizador'),
    
    // Incluir pasta output também
    incluirOutput: true
};

class VisualizadorPGM {
    constructor() {
        this.criarPastaSaida();
    }
    
    criarPastaSaida() {
        if (!fs.existsSync(CONFIG.pastaSaida)) {
            fs.mkdirSync(CONFIG.pastaSaida, { recursive: true });
            console.log(`📁 Pasta criada: ${CONFIG.pastaSaida}`);
        }
    }
    
    encontrarImagensPGM() {
        const imagens = [];
        
        // Busca na pasta images/
        if (fs.existsSync(CONFIG.pastaImagens)) {
            const arquivos = fs.readdirSync(CONFIG.pastaImagens);
            arquivos.forEach(arquivo => {
                if (arquivo.toLowerCase().endsWith('.pgm')) {
                    imagens.push({
                        nome: arquivo,
                        caminho: path.join(CONFIG.pastaImagens, arquivo),
                        pasta: 'images'
                    });
                }
            });
        }
        
        // Busca na pasta output/ se configurado
        if (CONFIG.incluirOutput) {
            const pastaOutput = path.join(__dirname, 'output');
            if (fs.existsSync(pastaOutput)) {
                const arquivos = fs.readdirSync(pastaOutput);
                arquivos.forEach(arquivo => {
                    if (arquivo.toLowerCase().endsWith('.pgm')) {
                        imagens.push({
                            nome: arquivo,
                            caminho: path.join(pastaOutput, arquivo),
                            pasta: 'output'
                        });
                    }
                });
            }
        }
        
        return imagens;
    }
    
    lerPGM(caminhoArquivo) {
        try {
            const { readPGM } = require('./src/pgm-utils');
            return readPGM(caminhoArquivo);
        } catch (error) {
            console.error(`❌ Erro ao ler ${caminhoArquivo}:`, error.message);
            return null;
        }
    }
    
    gerarHTMLCanvas(pgm, nomeImagem, pasta) {
        const canvas = `
        <div class="imagem-container">
            <h3>📄 ${nomeImagem} <span class="pasta">(${pasta}/)</span></h3>
            <div class="info">
                <span>📐 ${pgm.w}x${pgm.h}</span>
                <span>🎨 Max: ${pgm.maxv}</span>
                <span>📊 ${pgm.data.length} bytes</span>
            </div>
            <canvas id="canvas_${nomeImagem.replace(/[^a-zA-Z0-9]/g, '_')}" 
                    width="${pgm.w}" height="${pgm.h}"></canvas>
        </div>`;
        
        return canvas;
    }
    
    gerarScriptCanvas(pgm, nomeImagem) {
        const canvasId = `canvas_${nomeImagem.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Converte dados PGM para array JavaScript
        const pixelData = Array.from(pgm.data);
        
        const script = `
        // Renderiza ${nomeImagem}
        {
            const canvas = document.getElementById('${canvasId}');
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(${pgm.w}, ${pgm.h});
            const data = imageData.data;
            const pixels = [${pixelData.join(',')}];
            
            // Converte tons de cinza para RGBA
            for (let i = 0; i < pixels.length; i++) {
                const gray = pixels[i];
                const idx = i * 4;
                data[idx] = gray;     // R
                data[idx + 1] = gray; // G
                data[idx + 2] = gray; // B
                data[idx + 3] = 255;  // A
            }
            
            ctx.putImageData(imageData, 0, 0);
            
            // Redimensiona canvas se muito grande
            if (${pgm.w} > 800 || ${pgm.h} > 600) {
                const scale = Math.min(800 / ${pgm.w}, 600 / ${pgm.h});
                canvas.style.width = (${pgm.w} * scale) + 'px';
                canvas.style.height = (${pgm.h} * scale) + 'px';
                canvas.style.imageRendering = 'pixelated';
            }
        }`;
        
        return script;
    }
    
    gerarHTMLCompleto(imagens) {
        let htmlCanvas = '';
        let scripts = '';
        
        imagens.forEach(({ pgm, nome, pasta }) => {
            if (pgm) {
                htmlCanvas += this.gerarHTMLCanvas(pgm, nome, pasta);
                scripts += this.gerarScriptCanvas(pgm, nome);
            }
        });
        
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🖼️ Visualizador PGM</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .imagem-container {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        
        .imagem-container h3 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 1.3em;
        }
        
        .pasta {
            color: #666;
            font-size: 0.9em;
            font-weight: normal;
        }
        
        .info {
            margin-bottom: 15px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .info span {
            background: #f0f0f0;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.9em;
            color: #555;
        }
        
        canvas {
            border: 2px solid #ddd;
            border-radius: 8px;
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .stats {
            background: rgba(255,255,255,0.9);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .no-images {
            text-align: center;
            color: white;
            font-size: 1.2em;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
        }
        
        @media (max-width: 768px) {
            body { padding: 10px; }
            .header h1 { font-size: 2em; }
            .imagem-container { padding: 15px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🖼️ Visualizador PGM</h1>
            <p>Sistema de Processamento de Imagens - Visualização em Tempo Real</p>
        </div>
        
        <div class="stats">
            <h2>📊 Estatísticas</h2>
            <p><strong>${imagens.length}</strong> imagens encontradas</p>
            <p>Pastas: <strong>images/</strong> e <strong>output/</strong></p>
        </div>
        
        ${imagens.length > 0 ? htmlCanvas : `
        <div class="no-images">
            <h3>❌ Nenhuma imagem PGM encontrada</h3>
            <p>Coloque arquivos .pgm nas pastas:</p>
            <ul style="list-style: none; padding: 0;">
                <li>📁 images/</li>
                <li>📁 output/</li>
            </ul>
        </div>`}
    </div>
    
    <script>
        console.log('🖼️ Visualizador PGM carregado');
        ${scripts}
        console.log('✅ Todas as imagens renderizadas');
    </script>
</body>
</html>`;
        
        return html;
    }
    
    async gerarVisualizador() {
        console.log('🖼️ VISUALIZADOR PGM');
        console.log('===================\n');
        
        // Encontra imagens
        console.log('🔍 Procurando imagens PGM...');
        const imagensEncontradas = this.encontrarImagensPGM();
        
        if (imagensEncontradas.length === 0) {
            console.log('❌ Nenhuma imagem PGM encontrada!');
            console.log('💡 Coloque arquivos .pgm nas pastas:');
            console.log('   - images/');
            console.log('   - output/');
            return;
        }
        
        console.log(`✅ Encontradas ${imagensEncontradas.length} imagens:`);
        imagensEncontradas.forEach(img => {
            console.log(`   📄 ${img.nome} (${img.pasta}/)`);
        });
        
        // Carrega imagens
        console.log('\n📂 Carregando imagens...');
        const imagensCarregadas = [];
        
        for (const img of imagensEncontradas) {
            console.log(`   Carregando ${img.nome}...`);
            const pgm = this.lerPGM(img.caminho);
            if (pgm) {
                imagensCarregadas.push({
                    pgm,
                    nome: img.nome,
                    pasta: img.pasta
                });
                console.log(`   ✅ ${pgm.w}x${pgm.h} pixels`);
            }
        }
        
        // Gera HTML
        console.log('\n🎨 Gerando visualizador HTML...');
        const html = this.gerarHTMLCompleto(imagensCarregadas);
        
        // Salva arquivo
        const arquivoSaida = path.join(CONFIG.pastaSaida, 'index.html');
        fs.writeFileSync(arquivoSaida, html);
        
        console.log(`✅ Visualizador gerado: ${arquivoSaida}`);
        console.log('\n🌐 Para visualizar:');
        console.log(`   1. Abra: ${arquivoSaida}`);
        console.log('   2. Ou execute: start visualizador/index.html');
        console.log('   3. Ou arraste o arquivo para o navegador');
        
        return arquivoSaida;
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    const visualizador = new VisualizadorPGM();
    visualizador.gerarVisualizador().catch(console.error);
}

module.exports = VisualizadorPGM;
