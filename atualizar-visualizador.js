// atualizar-visualizador.js - Atualiza visualizador automaticamente
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 ATUALIZADOR AUTOMÁTICO DO VISUALIZADOR');
console.log('========================================\n');

async function processarEVisualizar() {
    try {
        // 1. Processa imagem com filtro negativo
        console.log('🔧 Processando com filtro negativo...');
        await executarComando('node', ['processar.js']);
        
        // 2. Muda para filtro slice
        console.log('🔧 Alterando para filtro slice...');
        const processar = fs.readFileSync('processar.js', 'utf8');
        const processarSlice = processar.replace(
            "filtro: 'slice',",
            "filtro: 'negativo',"
        ).replace(
            "filtro: 'negativo',", 
            "filtro: 'slice',"
        );
        fs.writeFileSync('processar.js', processarSlice);
        
        // 3. Processa com slice
        console.log('🔧 Processando com filtro slice...');
        await executarComando('node', ['processar.js']);
        
        // 4. Volta para negativo
        const processarNeg = processarSlice.replace(
            "filtro: 'slice',",
            "filtro: 'negativo',"
        );
        fs.writeFileSync('processar.js', processarNeg);
        
        // 5. Gera visualizador
        console.log('🎨 Gerando visualizador...');
        await executarComando('node', ['visualizar-pgm.js']);
        
        // 6. Abre no navegador
        console.log('🌐 Abrindo no navegador...');
        await executarComando('start', ['visualizador\\index.html']);
        
        console.log('\n✅ PROCESSO COMPLETO CONCLUÍDO!');
        console.log('📁 Visualizador disponível em: visualizador/index.html');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

function executarComando(comando, args) {
    return new Promise((resolve, reject) => {
        const processo = spawn(comando, args, { 
            stdio: 'inherit',
            shell: true 
        });
        
        processo.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Comando falhou: ${code}`));
            }
        });
        
        processo.on('error', reject);
    });
}

// Executa se chamado diretamente
if (require.main === module) {
    processarEVisualizar();
}

module.exports = { processarEVisualizar };
