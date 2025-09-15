#!/usr/bin/env node

// processar.js - Sistema de Processamento de Imagens PGM
// Equivalente ao código C com paralelismo usando processos independentes e FIFO

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

/* ===== CONFIGURAÇÃO - ALTERE AQUI ===== */
const CONFIG = {
    // Nome da imagem na pasta images/ (sem caminho completo)
    nomeImagem: 'cavalao.pgm',  // Altere apenas o nome do arquivo
    
    // Tipo de filtro: 'negativo' ou 'slice'
    filtro: 'slice',
    
    // Parâmetros para filtro slice - conforme base matemática fornecida
    slice: {
        t1: 50,   // Limite_a = 50 (conforme pseudocódigo)
        t2: 100   // Limite_b = 100 (conforme pseudocódigo)
    },
    
    // Número de threads para processamento paralelo
    threads: 4,
    
    // Pastas (não altere)
    pastaEntrada: path.join(__dirname, 'images'),
    pastaSaida: path.join(__dirname, 'output')
};

/* ===== SISTEMA DE PROCESSAMENTO ===== */


class ProcessadorPGM {
    constructor() {
        this.prepararCaminhos();
        this.mostrarConfiguracao();
    }
    
    prepararCaminhos() {
        // Caminho completo da imagem de entrada
        this.caminhoEntrada = path.join(CONFIG.pastaEntrada, CONFIG.nomeImagem);
        
        // Gera nome do arquivo de saída baseado no filtro
        const nomeBase = path.parse(CONFIG.nomeImagem).name;
        const sufixo = CONFIG.filtro === 'slice' ? `_slice_${CONFIG.slice.t1}-${CONFIG.slice.t2}` : `_${CONFIG.filtro}`;
        this.caminhoSaida = path.join(CONFIG.pastaSaida, `${nomeBase}${sufixo}.pgm`);
        
        // Cria pasta de saída se não existir
        if (!fs.existsSync(CONFIG.pastaSaida)) {
            fs.mkdirSync(CONFIG.pastaSaida, { recursive: true });
            console.log(`📁 Pasta de saída criada: ${CONFIG.pastaSaida}`);
        }
    }
    
    mostrarConfiguracao() {
        console.log('🚀 SISTEMA DE PROCESSAMENTO DE IMAGENS PGM');
        console.log('==========================================');
        console.log(`📂 Pasta entrada: ${CONFIG.pastaEntrada}`);
        console.log(`📂 Imagem: ${CONFIG.nomeImagem}`);
        console.log(`📂 Pasta saída: ${CONFIG.pastaSaida}`);
        console.log(`📂 Resultado: ${path.basename(this.caminhoSaida)}`);
        console.log(`🔧 Filtro: ${CONFIG.filtro}`);
        if (CONFIG.filtro === 'slice') {
            console.log(`   └─ Faixa: ${CONFIG.slice.t1} - ${CONFIG.slice.t2}`);
        }
        console.log(`🧵 Threads: ${CONFIG.threads}\n`);
    }
    
    verificarPreRequisitos() {
        // Verifica se imagem existe
        if (!fs.existsSync(this.caminhoEntrada)) {
            console.log('❌ Imagem não encontrada, procurando alternativas...');
            
            // Lista imagens disponíveis na pasta images/
            try {
                const arquivos = fs.readdirSync(CONFIG.pastaEntrada);
                const imagensPgm = arquivos.filter(arquivo => arquivo.toLowerCase().endsWith('.pgm'));
                
                if (imagensPgm.length > 0) {
                    console.log('📋 Imagens disponíveis na pasta images/:');
                    imagensPgm.forEach((img, i) => {
                        console.log(`   ${i + 1}. ${img}`);
                    });
                    
                    // Usa a primeira imagem encontrada
                    CONFIG.nomeImagem = imagensPgm[0];
                    this.prepararCaminhos(); // Recalcula caminhos
                    console.log(`✅ Usando: ${CONFIG.nomeImagem}`);
                    return true;
                }
            } catch (error) {
                console.error('❌ Erro ao ler pasta images/:', error.message);
            }
            
            console.error('❌ Nenhuma imagem PGM encontrada!');
            console.log('\n💡 Soluções:');
            console.log('1. Coloque uma imagem .pgm na pasta images/');
            console.log('2. Altere CONFIG.nomeImagem no início do arquivo');
            return false;
        }
        
        return true;
    }
    
    async processarComThreads() {
        const { readPGM, writePGM, PGM, MODE_NEG, MODE_SLICE } = require('./src/pgm-utils');
        
        console.log('📂 Carregando imagem...');
        const inputPgm = readPGM(this.caminhoEntrada);
        console.log(`✅ Carregada: ${inputPgm.w}x${inputPgm.h} pixels`);
        
        // Cria imagem de saída
        const outputPgm = new PGM(inputPgm.w, inputPgm.h, inputPgm.maxv);
        
        // Determina modo do filtro
        const mode = CONFIG.filtro === 'negativo' ? MODE_NEG : MODE_SLICE;
        console.log(`🔧 Aplicando filtro: ${CONFIG.filtro}`);
        
        // Prepara dados para threads usando SharedArrayBuffer para compartilhar memória
        const inputBuffer = new Uint8Array(inputPgm.data);
        
        // Cria buffer compartilhado para output que todas as threads podem modificar
        const sharedOutputBuffer = new SharedArrayBuffer(inputPgm.data.length);
        const outputBuffer = new Uint8Array(sharedOutputBuffer);
        
        // Divide trabalho em tarefas por linha
        const tasks = [];
        const linesPerThread = Math.ceil(inputPgm.h / CONFIG.threads);
        
        for (let i = 0; i < CONFIG.threads; i++) {
            const rowStart = i * linesPerThread;
            const rowEnd = Math.min((i + 1) * linesPerThread, inputPgm.h);
            
            if (rowStart < inputPgm.h) {
                tasks.push({ row_start: rowStart, row_end: rowEnd });
            }
        }
        
        console.log(`🧵 Processando com ${tasks.length} threads...`);
        
        // Inicia processamento paralelo
        const startTime = Date.now();
        
        const workerPromises = tasks.map((task, threadId) => {
            return new Promise((resolve, reject) => {
                const worker = new Worker(path.join(__dirname, 'src', 'worker-thread.js'), {
                    workerData: {
                        inputBuffer,
                        sharedOutputBuffer, // Passa o SharedArrayBuffer ao invés do Uint8Array
                        width: inputPgm.w,
                        height: inputPgm.h,
                        mode,
                        t1: CONFIG.slice.t1,
                        t2: CONFIG.slice.t2,
                        maxValue: inputPgm.maxv,
                        threadId
                    }
                });
                
                worker.postMessage({
                    type: 'PROCESS_TASK',
                    task
                });
                
                worker.on('message', (message) => {
                    if (message.type === 'TASK_COMPLETED') {
                        console.log(`✅ Thread ${threadId}: ${message.processedPixels} pixels processados`);
                        worker.terminate();
                        resolve();
                    } else if (message.type === 'TASK_ERROR') {
                        reject(new Error(message.error));
                    }
                });
                
                worker.on('error', reject);
            });
        });
        
        // Aguarda conclusão de todas as threads
        await Promise.all(workerPromises);
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        // Copia dados processados
        outputPgm.data = Buffer.from(outputBuffer);
        
        // Salva resultado
        console.log('💾 Salvando resultado...');
        writePGM(this.caminhoSaida, outputPgm);
        
        // Mostra estatísticas
        this.mostrarEstatisticas(inputPgm, processingTime);
        
        return this.caminhoSaida;
    }
    
    mostrarEstatisticas(inputPgm, processingTime) {
        const inputStats = fs.statSync(this.caminhoEntrada);
        const outputStats = fs.statSync(this.caminhoSaida);
        
        console.log('\n🎉 PROCESSAMENTO CONCLUÍDO!');
        console.log('===========================');
        console.log(`📁 Resultado: ${this.caminhoSaida}`);
        console.log(`📊 Entrada: ${inputStats.size} bytes`);
        console.log(`📊 Saída: ${outputStats.size} bytes`);
        console.log(`⏱️  Tempo: ${processingTime}ms`);
        console.log(`🧵 Threads: ${CONFIG.threads}`);
        console.log(`📏 Pixels: ${inputPgm.w * inputPgm.h}`);
        console.log(`⚡ Performance: ${Math.round((inputPgm.w * inputPgm.h) / processingTime)} pixels/ms`);
    }
    
    async executar() {
        try {
            if (!this.verificarPreRequisitos()) {
                return;
            }
            
            await this.processarComThreads();
            
            console.log('\n✅ SISTEMA EXECUTADO COM SUCESSO!');
            console.log('\n💡 Para processar outra imagem:');
            console.log('1. Altere CONFIG.nomeImagem no início do arquivo');
            console.log('2. Execute: node processar.js');
            console.log(`3. Ou coloque sua imagem .pgm na pasta: ${CONFIG.pastaEntrada}`);
            
        } catch (error) {
            console.error('\n💥 Erro no processamento:', error.message);
            process.exit(1);
        }
    }
}

// Função para usar via linha de comando
function parseCommandLine() {
    const args = process.argv.slice(2);
    
    if (args.length >= 1) CONFIG.nomeImagem = path.basename(args[0]); // Só o nome do arquivo
    if (args.length >= 2) CONFIG.filtro = args[1];
    if (args.length >= 3) CONFIG.threads = parseInt(args[2]);
    
    // Para filtro slice via linha de comando
    if (CONFIG.filtro === 'slice' && args.length >= 5) {
        CONFIG.slice.t1 = parseInt(args[3]);
        CONFIG.slice.t2 = parseInt(args[4]);
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    // Permite uso via linha de comando
    parseCommandLine();
    
    const processador = new ProcessadorPGM();
    processador.executar();
}

module.exports = ProcessadorPGM;
