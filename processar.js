#!/usr/bin/env node

// processar.js - Sistema de Processamento de Imagens PGM com Arquitetura de Dois Processos
// Implementa comunicação via FIFO nomeado entre Processo Emissor e Processo Trabalhador
// 
// A solução é composta por dois processos independentes que se comunicam através de um FIFO nomeado:
// 1. Processo Emissor (Sender): carrega a imagem PGM, empacota metadados e transmite via FIFO
// 2. Processo Trabalhador (Worker): recebe dados via FIFO, instancia pool de threads com 
//    sincronização por mutex e semáforos, processa a imagem e salva o resultado

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { readPGM } = require('./src/pgm-utils');

/* ===== CONFIGURAÇÃO - ALTERE AQUI ===== */
const CONFIG = {
    // Nome da imagem na pasta images/ (sem caminho completo)
    nomeImagem: 'cavalao.pgm',  // Altere apenas o nome do arquivo
    
    // Tipo de filtro: 'negativo' ou 'slice'
    filtro: 'negativo',
    
    // Parâmetros para filtro slice - conforme base matemática fornecida
    slice: {
        t1: 50,   // Limite_a = 50 (conforme pseudocódigo)
        t2: 100   // Limite_b = 100 (conforme pseudocódigo)
    },
    
    // Número de threads para processamento paralelo
    threads: 16,
    
    // Pastas (não altere)
    pastaEntrada: path.join(__dirname, 'images'),
    pastaSaida: path.join(__dirname, 'output')
};

/* ===== SISTEMA DE PROCESSAMENTO COM DOIS PROCESSOS INDEPENDENTES ===== */

class ProcessadorPGMFifo {
    constructor() {
        this.prepararCaminhos();
        this.mostrarConfiguracao();
        this.fifoPath = this.gerarCaminhoFifo();
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
    
    gerarCaminhoFifo() {
        // Gera caminho único para o FIFO baseado no processo atual
        const fifoName = `imgpipe_${process.pid}_${Date.now()}`;
        
        if (process.platform === 'win32') {
            // No Windows, usa arquivo temporário como alternativa ao FIFO
            return path.join(os.tmpdir(), fifoName);
        } else {
            // Em sistemas Unix, usa FIFO real
            return path.join('/tmp', fifoName);
        }
    }
    
    mostrarConfiguracao() {
        console.log('🚀 SISTEMA DE PROCESSAMENTO DE IMAGENS PGM');
        console.log('==========================================');
        console.log('📡 ARQUITETURA: Dois Processos Independentes + FIFO');
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
        
        // Verifica se os módulos necessários existem
        const modulosNecessarios = [
            path.join(__dirname, 'src', 'sender.js'),
            path.join(__dirname, 'src', 'worker.js'),
            path.join(__dirname, 'src', 'pgm-utils.js'),
            path.join(__dirname, 'src', 'sync-utils.js'),
            path.join(__dirname, 'src', 'filters.js'),
            path.join(__dirname, 'src', 'worker-thread.js')
        ];
        
        for (const modulo of modulosNecessarios) {
            if (!fs.existsSync(modulo)) {
                console.error(`❌ Módulo necessário não encontrado: ${modulo}`);
                return false;
            }
        }
        
        // Testa se pode carregar a imagem
        try {
            console.log('🔍 Validando imagem PGM...');
            const pgm = readPGM(this.caminhoEntrada);
            console.log(`✅ Imagem válida: ${pgm.w}x${pgm.h} pixels, maxv=${pgm.maxv}`);
        } catch (error) {
            console.error('❌ Erro ao validar imagem PGM:', error.message);
            return false;
        }
        
        return true;
    }
    
    // ===== PROCESSO EMISSOR (Sender) =====
    async iniciarProcessoEmissor() {
        return new Promise((resolve, reject) => {
            console.log('📤 Iniciando Processo Emissor...');
            
            // Argumentos para o processo emissor
            const senderArgs = [
                path.join(__dirname, 'src', 'sender.js'),
                this.fifoPath,
                this.caminhoEntrada
            ];
            
            // Inicia processo emissor
            const senderProcess = spawn('node', senderArgs, {
                stdio: ['inherit', 'pipe', 'pipe']
            });
            
            let senderOutput = '';
            let senderError = '';
            
            senderProcess.stdout.on('data', (data) => {
                const output = data.toString();
                senderOutput += output;
                console.log(`[EMISSOR] ${output.trim()}`);
            });
            
            senderProcess.stderr.on('data', (data) => {
                const error = data.toString();
                senderError += error;
                console.error(`[EMISSOR ERRO] ${error.trim()}`);
            });
            
            senderProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Processo Emissor concluído com sucesso');
                    resolve(senderOutput);
                } else {
                    console.error(`❌ Processo Emissor falhou com código ${code}`);
                    reject(new Error(`Processo Emissor falhou: ${senderError}`));
                }
            });
            
            senderProcess.on('error', (error) => {
                console.error('❌ Erro ao iniciar Processo Emissor:', error.message);
                reject(error);
            });
        });
    }
    
    // ===== PROCESSO TRABALHADOR (Worker) =====
    async iniciarProcessoTrabalhador() {
        return new Promise((resolve, reject) => {
            console.log('🔧 Iniciando Processo Trabalhador...');
            
            // Argumentos para o processo trabalhador
            const workerArgs = [
                path.join(__dirname, 'src', 'worker.js'),
                this.fifoPath,
                this.caminhoSaida,
                CONFIG.filtro
            ];
            
            // Adiciona parâmetros específicos do filtro
            if (CONFIG.filtro === 'slice') {
                workerArgs.push(CONFIG.slice.t1.toString());
                workerArgs.push(CONFIG.slice.t2.toString());
            }
            
            // Adiciona número de threads
            workerArgs.push(CONFIG.threads.toString());
            
            // Inicia processo trabalhador
            const workerProcess = spawn('node', workerArgs, {
                stdio: ['inherit', 'pipe', 'pipe']
            });
            
            let workerOutput = '';
            let workerError = '';
            
            workerProcess.stdout.on('data', (data) => {
                const output = data.toString();
                workerOutput += output;
                console.log(`[TRABALHADOR] ${output.trim()}`);
            });
            
            workerProcess.stderr.on('data', (data) => {
                const error = data.toString();
                workerError += error;
                console.error(`[TRABALHADOR ERRO] ${error.trim()}`);
            });
            
            workerProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Processo Trabalhador concluído com sucesso');
                    resolve(workerOutput);
                } else {
                    console.error(`❌ Processo Trabalhador falhou com código ${code}`);
                    reject(new Error(`Processo Trabalhador falhou: ${workerError}`));
                }
            });
            
            workerProcess.on('error', (error) => {
                console.error('❌ Erro ao iniciar Processo Trabalhador:', error.message);
                reject(error);
            });
        });
    }
    
    // ===== COORDENAÇÃO DOS DOIS PROCESSOS =====
    // Implementa a sincronização entre emissor e trabalhador via FIFO
    // A sincronização é garantida por:
    // • FIFO nomeado para comunicação entre processos
    // • Mutex, semáforos contadores e semáforo de conclusão no processo trabalhador
    // • Pool de threads com fila de tarefas protegida por sincronização
    async processarComDoisProcessos() {
        const startTime = Date.now();
        
        console.log('🔄 Iniciando comunicação via FIFO...');
        console.log(`📡 FIFO: ${this.fifoPath}`);
        console.log('🔄 Sincronização: FIFO + Mutex + Semáforos + Pool de Threads');
        
        try {
            // Inicia ambos os processos simultaneamente
            // O processo trabalhador ficará bloqueado aguardando dados do FIFO
            // O processo emissor enviará os dados e desbloqueará o trabalhador
            console.log('🚀 Iniciando processos independentes...');
            
            const [senderResult, workerResult] = await Promise.all([
                this.iniciarProcessoEmissor(),
                this.iniciarProcessoTrabalhador()
            ]);
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            console.log('✅ Ambos os processos concluídos com sucesso!');
            
            // Verifica se o arquivo de saída foi criado
            if (!fs.existsSync(this.caminhoSaida)) {
                throw new Error('Arquivo de saída não foi criado pelo processo trabalhador');
            }
            
            // Mostra estatísticas finais
            this.mostrarEstatisticas(processingTime);
            
            return this.caminhoSaida;
            
        } catch (error) {
            console.error('💥 Erro na coordenação dos processos:', error.message);
            throw error;
        } finally {
            // Limpa o FIFO temporário
            this.limparFifo();
        }
    }
    
    limparFifo() {
        try {
            if (fs.existsSync(this.fifoPath)) {
                fs.unlinkSync(this.fifoPath);
                console.log(`🧹 FIFO temporário removido: ${this.fifoPath}`);
            }
        } catch (error) {
            console.warn(`⚠️  Aviso: Não foi possível remover FIFO: ${error.message}`);
        }
    }
    
    mostrarEstatisticas(processingTime) {
        try {
            const inputStats = fs.statSync(this.caminhoEntrada);
            const outputStats = fs.statSync(this.caminhoSaida);
            
            console.log('\n🎉 PROCESSAMENTO CONCLUÍDO!');
            console.log('===========================');
            console.log(`📁 Resultado: ${this.caminhoSaida}`);
            console.log(`📊 Entrada: ${inputStats.size} bytes`);
            console.log(`📊 Saída: ${outputStats.size} bytes`);
            console.log(`⏱️  Tempo: ${processingTime}ms`);
            console.log(`🧵 Threads: ${CONFIG.threads}`);
            console.log(`📡 Arquitetura: Dois Processos + FIFO`);
            
            // Calcula pixels processados (estimativa baseada no tamanho do arquivo)
            const estimatedPixels = Math.floor(inputStats.size * 0.9); // Desconta cabeçalho
            console.log(`📏 Pixels (est.): ${estimatedPixels}`);
            console.log(`⚡ Performance: ${Math.round(estimatedPixels / processingTime)} pixels/ms`);
        } catch (error) {
            console.warn('⚠️  Não foi possível calcular estatísticas:', error.message);
        }
    }
    
    async executar() {
        try {
            if (!this.verificarPreRequisitos()) {
                return;
            }
            
            await this.processarComDoisProcessos();
            
            console.log('\n✅ SISTEMA EXECUTADO COM SUCESSO!');
            console.log('\n💡 Para processar outra imagem:');
            console.log('1. Altere CONFIG.nomeImagem no início do arquivo');
            console.log('2. Execute: node processar.js');
            console.log(`3. Ou coloque sua imagem .pgm na pasta: ${CONFIG.pastaEntrada}`);
            
        } catch (error) {
            console.error('\n💥 Erro no processamento:', error.message);
            
            // Limpa recursos em caso de erro
            this.limparFifo();
            
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
    
    const processador = new ProcessadorPGMFifo();
    processador.executar();
}

module.exports = ProcessadorPGMFifo;